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
}

/**
 * Playback Test Client
 *
 * Replays pre-recorded agent responses for deterministic testing.
 */
export class PlaybackTestClient {
    private config: Required<PlaybackTestConfig>;
    private recordings: Recording[] = [];
    private playbackIndex = 0;

    constructor(config: PlaybackTestConfig) {
        this.config = {
            transport: 'test-playback' as any,
            recordingsDir: config.recordingsDir,
            simulateDelay: config.simulateDelay !== false,
            delay: config.delay || 150,
            strict: config.strict !== false,
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
     * Invoke with tools - plays back next recording
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

        // Get next recording
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

        const recording = this.recordings[this.playbackIndex];
        this.playbackIndex++;

        console.log(`[PlaybackTestClient] Playing back recording ${this.playbackIndex}/${this.recordings.length}`);
        console.log(`   Request ID: ${recording.request.requestId}`);
        console.log(`   Recorded: ${recording.recordedAt}`);
        if (recording.response.reasoning) {
            console.log(`   Reasoning: ${recording.response.reasoning}`);
        }

        // Validate tools match (optional, helpful for debugging)
        if (tools.length > 0 && recording.request.tools.length !== tools.length) {
            console.warn(
                `[PlaybackTestClient] Tool count mismatch: expected ${recording.request.tools.length}, got ${tools.length}`
            );
        }

        return recording.response.response;
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
