/**
 * Playback Test Client - For CI/Deterministic Testing
 *
 * Loads pre-recorded agent responses instead of requiring a live agent.
 * This enables deterministic test runs in CI environments.
 *
 * Usage:
 *   const client = new PlaybackTestClient({
 *       recordingsDir: 'test/fixtures/recordings/task-execution'
 *   });
 *
 *   // Plays back recorded responses in order
 *   const response = await client.invokeWithTools(messages, tools);
 */

import type {
    ClaudeClientConfig,
    ContentBlock,
    ConversationMessage,
    ModelResponse,
    ToolDefinition
} from './claude-client.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { setTimeout as delay } from 'timers/promises';

export interface PlaybackTestConfig extends ClaudeClientConfig {
    /** Directory containing recordings */
    recordingsDir: string;

    /** Whether to simulate realistic delays */
    simulateDelay?: boolean;

    /** Delay in ms (default: 150) */
    delay?: number;

    /** Strict mode: fail if no recording found */
    strict?: boolean;

    /**
     * Matching mode: how to select recordings
     * - 'signature': Match by request signature (tools, messages) - RECOMMENDED
     * - 'sequential': Use recordings in order (legacy behavior)
     * - 'hybrid': Try signature first, fall back to sequential
     */
    matchingMode?: 'signature' | 'sequential' | 'hybrid';
}

/**
 * Request signature for intelligent recording matching
 */
export interface RequestSignature {
    /** Sorted tool names (order-independent) */
    toolNames: string[];

    /** Number of messages in conversation */
    messageCount: number;

    /** Hash of context keys (what data is available) */
    contextKeys: string[];
}

export interface Recording {
    request: {
        type: 'llm_invocation_request';
        requestId: string;
        timestamp: string;
        context: any;
        messages: ConversationMessage[];
        tools: ToolDefinition[];
        systemPrompt?: string;
    };
    response: {
        type: 'llm_invocation_response';
        requestId: string;
        timestamp: string;
        reasoning?: string;
        response: ModelResponse;
    };
    recordedAt: string;

    /** Optional signature for intelligent matching (added in v2) */
    signature?: RequestSignature;
}

/**
 * Playback Test Client
 *
 * Replays pre-recorded agent responses for deterministic testing.
 */
export class PlaybackTestClient {
    private config: Required<PlaybackTestConfig> & { matchingMode: 'signature' | 'sequential' | 'hybrid' };
    private recordings: Recording[] = [];
    private playbackIndex = 0;
    private usedRecordings = new Set<number>(); // Track which recordings have been used (for signature mode)

    constructor(config: PlaybackTestConfig) {
        this.config = {
            transport: 'test-playback' as any,
            recordingsDir: config.recordingsDir,
            simulateDelay: config.simulateDelay !== false,
            delay: config.delay || 150,
            strict: config.strict !== false,
            matchingMode: config.matchingMode || 'hybrid',
            modelId: config.modelId || 'playback-mode',
            apiKey: config.apiKey,
            region: config.region
        };

        this.loadRecordings();
    }

    /**
     * Load all recordings from directory
     */
    private loadRecordings(): void {
        const recordingsPath = path.resolve(this.config.recordingsDir);

        if (!fs.existsSync(recordingsPath)) {
            if (this.config.strict) {
                throw new Error(`Recordings directory not found: ${recordingsPath}`);
            }
            console.warn(`[PlaybackTestClient] No recordings directory: ${recordingsPath}`);
            return;
        }

        const files = fs.readdirSync(recordingsPath)
            .filter(f => f.endsWith('.json'))
            .sort(); // Deterministic order

        for (const file of files) {
            const filePath = path.join(recordingsPath, file);
            try {
                const recording = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                this.recordings.push(recording);
            } catch (error) {
                console.warn(`[PlaybackTestClient] Failed to load recording ${file}:`, error);
            }
        }

        console.log(`[PlaybackTestClient] Loaded ${this.recordings.length} recordings from ${recordingsPath}`);
    }

    /**
     * Invoke model with simple prompt
     */
    async invokeModel(prompt: string, modelIdOverride?: string): Promise<string> {
        const response = await this.invokeWithTools(
            [{ role: 'user', content: prompt }],
            []
        );

        // Extract text from response
        const textBlocks = response.content.filter(
            (block: any) => block.type === 'text'
        );
        return textBlocks.map((block: any) => block.text).join('\n');
    }

    /**
     * Invoke with tools - plays back matching recording
     */
    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[],
        modelIdOverride?: string
    ): Promise<ModelResponse> {
        // Simulate realistic delay
        if (this.config.simulateDelay) {
            await delay(this.config.delay);
        }

        let recording: Recording | null = null;
        let recordingIndex: number = -1;

        // Try signature-based matching first (if enabled)
        if (this.config.matchingMode === 'signature' || this.config.matchingMode === 'hybrid') {
            const currentSignature = this.computeRequestSignature(messages, tools);
            const match = this.findMatchingRecording(currentSignature);

            if (match) {
                recording = match.recording;
                recordingIndex = match.index;
                console.log(`[PlaybackTestClient] Matched recording by signature`);
                console.log(`   Tools: ${currentSignature.toolNames.join(', ')}`);
            } else if (this.config.matchingMode === 'signature') {
                // Strict signature mode - fail if no match
                throw new Error(
                    this.formatNoMatchError(currentSignature, tools)
                );
            }
        }

        // Fall back to sequential mode if no signature match
        if (!recording && (this.config.matchingMode === 'sequential' || this.config.matchingMode === 'hybrid')) {
            if (this.playbackIndex >= this.recordings.length) {
                if (this.config.strict) {
                    throw new Error(
                        `No more recordings available (index: ${this.playbackIndex}, total: ${this.recordings.length})`
                    );
                }

                // Fallback: return empty response
                console.warn('[PlaybackTestClient] No recording available, returning empty response');
                return {
                    content: [
                        { type: 'text', text: 'Playback: No recording available' }
                    ],
                    stop_reason: 'end_turn'
                };
            }

            recording = this.recordings[this.playbackIndex];
            recordingIndex = this.playbackIndex;
            this.playbackIndex++;
            console.log(`[PlaybackTestClient] Using sequential recording ${this.playbackIndex}/${this.recordings.length}`);
        }

        if (!recording) {
            throw new Error('Internal error: No recording selected');
        }

        // Mark recording as used (for signature mode)
        this.usedRecordings.add(recordingIndex);

        console.log(`   Request ID: ${recording.request.requestId}`);
        console.log(`   Recorded: ${recording.recordedAt}`);
        if (recording.response.reasoning) {
            console.log(`   Reasoning: ${recording.response.reasoning}`);
        }

        // Validate tools match (warn if mismatch)
        this.validateToolsMatch(tools, recording.request.tools);

        return recording.response.response;
    }

    /**
     * Compute request signature for matching
     */
    private computeRequestSignature(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): RequestSignature {
        return {
            toolNames: tools.map(t => t.name).sort(),
            messageCount: messages.length,
            contextKeys: [] // Context keys can be added if needed
        };
    }

    /**
     * Find recording that matches the given signature
     */
    private findMatchingRecording(signature: RequestSignature): { recording: Recording; index: number } | null {
        for (let i = 0; i < this.recordings.length; i++) {
            // Skip already used recordings
            if (this.usedRecordings.has(i)) {
                continue;
            }

            const recording = this.recordings[i];

            // If recording has signature metadata, use it
            if (recording.signature) {
                if (this.signaturesMatch(recording.signature, signature)) {
                    return { recording, index: i };
                }
            } else {
                // Legacy recording without signature - compute from request
                const recordedSignature = this.computeRequestSignature(
                    recording.request.messages,
                    recording.request.tools
                );
                if (this.signaturesMatch(recordedSignature, signature)) {
                    return { recording, index: i };
                }
            }
        }

        return null;
    }

    /**
     * Check if two signatures match
     */
    private signaturesMatch(recorded: RequestSignature, current: RequestSignature): boolean {
        // Tool names must match exactly (order-independent)
        if (!this.arraysEqual(recorded.toolNames, current.toolNames)) {
            return false;
        }

        // Message count should match (allows for some flexibility)
        if (recorded.messageCount !== current.messageCount) {
            return false;
        }

        // Context keys should match if present
        if (recorded.contextKeys.length > 0 || current.contextKeys.length > 0) {
            if (!this.arraysEqual(recorded.contextKeys, current.contextKeys)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Compare arrays for equality (order matters for sorted arrays)
     */
    private arraysEqual<T>(a: T[], b: T[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Validate that tools match between request and recording
     */
    private validateToolsMatch(currentTools: ToolDefinition[], recordedTools: ToolDefinition[]): void {
        if (currentTools.length !== recordedTools.length) {
            console.warn(
                `[PlaybackTestClient] Tool count mismatch: current has ${currentTools.length}, recording has ${recordedTools.length}`
            );
            return;
        }

        const currentNames = currentTools.map(t => t.name).sort();
        const recordedNames = recordedTools.map(t => t.name).sort();

        for (let i = 0; i < currentNames.length; i++) {
            if (currentNames[i] !== recordedNames[i]) {
                console.warn(
                    `[PlaybackTestClient] Tool name mismatch at index ${i}: current="${currentNames[i]}", recorded="${recordedNames[i]}"`
                );
            }
        }
    }

    /**
     * Format error message when no matching recording found
     */
    private formatNoMatchError(signature: RequestSignature, tools: ToolDefinition[]): string {
        const lines = [
            '❌ No matching recording found for request',
            '',
            'Current Request:',
            `  Tools (${signature.toolNames.length}): ${signature.toolNames.join(', ')}`,
            `  Message count: ${signature.messageCount}`,
            '',
            'Available Recordings:',
        ];

        for (let i = 0; i < this.recordings.length; i++) {
            const recording = this.recordings[i];
            const used = this.usedRecordings.has(i) ? ' (USED)' : '';
            const recordedSig = recording.signature || this.computeRequestSignature(
                recording.request.messages,
                recording.request.tools
            );

            lines.push(
                `  [${i}] ${recording.request.requestId}${used}`,
                `      Tools: ${recordedSig.toolNames.join(', ')}`,
                `      Messages: ${recordedSig.messageCount}`
            );
        }

        lines.push(
            '',
            'Troubleshooting:',
            '  1. Regenerate recordings if source file changed',
            '  2. Check that tool names match exactly',
            '  3. Use matchingMode: "hybrid" for backward compatibility',
            '',
            `  Recordings directory: ${this.config.recordingsDir}`
        );

        return lines.join('\n');
    }

    /**
     * Reset playback to beginning
     */
    reset(): void {
        this.playbackIndex = 0;
        console.log('[PlaybackTestClient] Reset to beginning');
    }

    /**
     * Get current playback position
     */
    getPlaybackPosition(): { current: number; total: number } {
        return {
            current: this.playbackIndex,
            total: this.recordings.length
        };
    }

    /**
     * Check if all recordings have been played
     */
    isComplete(): boolean {
        return this.playbackIndex >= this.recordings.length;
    }
}
