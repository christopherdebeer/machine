/**
 * Browser Playback Client - For browser-based playback mode
 *
 * Loads pre-recorded agent responses from the API instead of file system.
 * Enables playback mode in the browser playground.
 *
 * Usage:
 *   const client = await BrowserPlaybackClient.create({
 *       exampleName: 'codegen-schema',
 *       category: 'execution-features'
 *   });
 *
 *   // Plays back recorded responses in order
 *   const response = await client.invokeWithTools(messages, tools);
 */

import type {
    ConversationMessage,
    ModelResponse,
    ToolDefinition
} from './claude-client.js';
import { loadAllRecordings, type Recording } from '../api/recordings-api.js';
import type { RequestSignature } from './playback-test-client.js';

export interface BrowserPlaybackConfig {
    /** Example name (e.g., "codegen-schema") */
    exampleName: string;

    /** Category (e.g., "execution-features") */
    category: string;

    /** Whether to simulate realistic delays */
    simulateDelay?: boolean;

    /** Delay in ms (default: 150) */
    delay?: number;

    /**
     * Matching mode: how to select recordings
     * - 'signature': Match by request signature (tools, messages) - RECOMMENDED
     * - 'sequential': Use recordings in order (legacy behavior)
     * - 'hybrid': Try signature first, fall back to sequential
     */
    matchingMode?: 'signature' | 'sequential' | 'hybrid';
}

/**
 * Browser Playback Client
 *
 * Replays pre-recorded agent responses for deterministic browser-based execution.
 */
export class BrowserPlaybackClient {
    private config: Required<BrowserPlaybackConfig> & { matchingMode: 'signature' | 'sequential' | 'hybrid' };
    private recordings: Recording[] = [];
    private playbackIndex = 0;
    private usedRecordings = new Set<number>(); // Track which recordings have been used (for signature mode)

    private constructor(config: BrowserPlaybackConfig, recordings: Recording[]) {
        this.config = {
            exampleName: config.exampleName,
            category: config.category,
            simulateDelay: config.simulateDelay !== false,
            delay: config.delay || 150,
            matchingMode: config.matchingMode || 'hybrid'
        };
        this.recordings = recordings;
    }

    /**
     * Create a new playback client (async factory)
     */
    static async create(config: BrowserPlaybackConfig): Promise<BrowserPlaybackClient> {
        const recordings = await loadAllRecordings(config.exampleName, config.category);

        if (recordings.length === 0) {
            console.warn(`[BrowserPlaybackClient] No recordings found for ${config.category}/${config.exampleName}`);
        } else {
            console.log(`[BrowserPlaybackClient] Loaded ${recordings.length} recordings for ${config.category}/${config.exampleName}`);
        }

        return new BrowserPlaybackClient(config, recordings);
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
            await new Promise(resolve => setTimeout(resolve, this.config.delay));
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
                console.log(`[BrowserPlaybackClient] Matched recording by signature`);
                console.log(`   Tools: ${currentSignature.toolNames.join(', ')}`);
            } else if (this.config.matchingMode === 'signature') {
                // Strict signature mode - fail if no match
                throw new Error(
                    `No matching recording found. Tools: ${tools.map(t => t.name).join(', ')}`
                );
            }
        }

        // Fall back to sequential mode if no signature match
        if (!recording && (this.config.matchingMode === 'sequential' || this.config.matchingMode === 'hybrid')) {
            if (this.playbackIndex >= this.recordings.length) {
                console.warn('[BrowserPlaybackClient] No recording available, returning empty response');
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
            console.log(`[BrowserPlaybackClient] Using sequential recording ${this.playbackIndex}/${this.recordings.length}`);
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
            contextKeys: []
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
            if ((recording as any).signature) {
                if (this.signaturesMatch((recording as any).signature, signature)) {
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

        // Message count should match
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
     * Compare arrays for equality
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
                `[BrowserPlaybackClient] Tool count mismatch: current has ${currentTools.length}, recording has ${recordedTools.length}`
            );
            return;
        }

        const currentNames = currentTools.map(t => t.name).sort();
        const recordedNames = recordedTools.map(t => t.name).sort();

        for (let i = 0; i < currentNames.length; i++) {
            if (currentNames[i] !== recordedNames[i]) {
                console.warn(
                    `[BrowserPlaybackClient] Tool name mismatch: current="${currentNames[i]}", recorded="${recordedNames[i]}"`
                );
            }
        }
    }

    /**
     * Reset playback to beginning
     */
    reset(): void {
        this.playbackIndex = 0;
        console.log('[BrowserPlaybackClient] Reset to beginning');
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

    /**
     * Get total number of recordings
     */
    getRecordingCount(): number {
        return this.recordings.length;
    }

    /**
     * Get current recording (for displaying reasoning/context)
     */
    getCurrentRecording(): Recording | null {
        if (this.playbackIndex === 0 || this.playbackIndex > this.recordings.length) {
            return null;
        }
        return this.recordings[this.playbackIndex - 1];
    }

    /**
     * Get next recording (preview without advancing)
     */
    getNextRecording(): Recording | null {
        if (this.playbackIndex >= this.recordings.length) {
            return null;
        }
        return this.recordings[this.playbackIndex];
    }
}
