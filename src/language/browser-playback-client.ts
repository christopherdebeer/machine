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

export interface BrowserPlaybackConfig {
    /** Example name (e.g., "codegen-schema") */
    exampleName: string;

    /** Category (e.g., "execution-features") */
    category: string;

    /** Whether to simulate realistic delays */
    simulateDelay?: boolean;

    /** Delay in ms (default: 150) */
    delay?: number;
}

/**
 * Browser Playback Client
 *
 * Replays pre-recorded agent responses for deterministic browser-based execution.
 */
export class BrowserPlaybackClient {
    private config: Required<BrowserPlaybackConfig>;
    private recordings: Recording[] = [];
    private playbackIndex = 0;

    private constructor(config: BrowserPlaybackConfig, recordings: Recording[]) {
        this.config = {
            exampleName: config.exampleName,
            category: config.category,
            simulateDelay: config.simulateDelay !== false,
            delay: config.delay || 150
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
     * Invoke with tools - plays back next recording
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

        // Get next recording
        if (this.playbackIndex >= this.recordings.length) {
            // No more recordings - return empty response
            console.warn('[BrowserPlaybackClient] No recording available, returning empty response');
            return {
                content: [
                    { type: 'text', text: 'Playback: No recording available' }
                ],
                stop_reason: 'end_turn'
            };
        }

        const recording = this.recordings[this.playbackIndex];
        this.playbackIndex++;

        console.log(`[BrowserPlaybackClient] Playing back recording ${this.playbackIndex}/${this.recordings.length}`);
        console.log(`   Request ID: ${recording.request.requestId}`);
        console.log(`   Recorded: ${recording.recordedAt}`);
        if (recording.response.reasoning) {
            console.log(`   Reasoning: ${recording.response.reasoning}`);
        }

        // Validate tools match (optional, helpful for debugging)
        if (tools.length > 0 && recording.request.tools.length !== tools.length) {
            console.warn(
                `[BrowserPlaybackClient] Tool count mismatch: expected ${recording.request.tools.length}, got ${tools.length}`
            );
        }

        return recording.response.response;
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
