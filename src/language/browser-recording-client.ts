/**
 * Browser Recording Client - For browser-based recording mode
 *
 * Records live API responses for later playback. Acts as a transparent proxy
 * that captures all LLM interactions while passing through to a live ClaudeClient.
 *
 * Usage:
 *   const recordingClient = await BrowserRecordingClient.create({
 *       apiKey: 'sk-ant-...',
 *       modelId: 'claude-sonnet-4-5-20250929',
 *       exampleName: 'codegen-schema',
 *       category: 'execution-features'
 *   });
 *
 *   // Use like normal client (records transparently)
 *   const response = await recordingClient.invokeWithTools(messages, tools);
 *
 *   // Export recordings
 *   const blob = recordingClient.exportRecordings();
 *   // Download or upload
 */

import { ClaudeClient } from './claude-client.js';
import type {
    ConversationMessage,
    ModelResponse,
    ToolDefinition,
    LLMClientConfig
} from './claude-client.js';

/**
 * Request signature for v2 recording matching
 */
export interface RequestSignature {
    toolNames: string[];
    messageCount: number;
    contextKeys: string[];
}

/**
 * Recording format (v2 with signatures)
 */
export interface Recording {
    request: {
        type: 'llm_invocation_request';
        requestId: string;
        timestamp: string;
        context: {
            exampleName: string;
            category: string;
            userNotes?: string;
        };
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
    signature: RequestSignature;
}

export interface BrowserRecordingConfig {
    /** Anthropic API key */
    apiKey: string;

    /** Model ID (e.g., "claude-sonnet-4-5-20250929") */
    modelId?: string;

    /** Example name for context */
    exampleName: string;

    /** Category for context */
    category: string;

    /** Optional user notes/description */
    userNotes?: string;

    /** Transport: 'api' or 'bedrock' */
    transport?: 'api' | 'bedrock';

    /** AWS region (for bedrock) */
    awsRegion?: string;

    /** AWS profile (for bedrock) */
    awsProfile?: string;
}

/**
 * Browser Recording Client
 *
 * Transparently records all LLM interactions for later playback.
 * Acts as a proxy to ClaudeClient while capturing request/response pairs.
 */
export class BrowserRecordingClient {
    private config: BrowserRecordingConfig;
    private liveClient: ClaudeClient;
    private recordings: Recording[] = [];
    private requestCounter = 0;

    private constructor(config: BrowserRecordingConfig, liveClient: ClaudeClient) {
        this.config = config;
        this.liveClient = liveClient;
    }

    /**
     * Create a new recording client (async factory)
     */
    static async create(config: BrowserRecordingConfig): Promise<BrowserRecordingClient> {
        // Create live client
        const clientConfig: LLMClientConfig = {
            provider: 'anthropic',
            apiKey: config.apiKey,
            modelId: config.modelId,
            transport: config.transport || 'api',
            awsRegion: config.awsRegion,
            awsProfile: config.awsProfile
        };

        const liveClient = await ClaudeClient.create(clientConfig);

        console.log(`[BrowserRecordingClient] Created for ${config.category}/${config.exampleName}`);

        return new BrowserRecordingClient(config, liveClient);
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        this.requestCounter++;
        return `req-${Date.now()}-${this.requestCounter}`;
    }

    /**
     * Extract request signature for v2 matching
     */
    private extractSignature(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): RequestSignature {
        return {
            toolNames: tools.map(t => t.name).sort(),
            messageCount: messages.length,
            contextKeys: [] // Could extract from messages if needed
        };
    }

    /**
     * Invoke model with simple prompt
     */
    async invokeModel(prompt: string, modelIdOverride?: string): Promise<string> {
        const response = await this.invokeWithTools(
            [{ role: 'user', content: prompt }],
            [],
            undefined,
            modelIdOverride
        );

        // Extract text from response
        const textBlocks = response.content.filter(
            (block: any) => block.type === 'text'
        );
        return textBlocks.map((block: any) => block.text).join('\n');
    }

    /**
     * Invoke model with tools (records transparently)
     */
    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[],
        systemPrompt?: string,
        modelIdOverride?: string
    ): Promise<ModelResponse> {
        const requestId = this.generateRequestId();
        const requestTimestamp = new Date().toISOString();

        console.log(`[BrowserRecordingClient] Recording request ${requestId}`);

        // Create request record
        const request = {
            type: 'llm_invocation_request' as const,
            requestId,
            timestamp: requestTimestamp,
            context: {
                exampleName: this.config.exampleName,
                category: this.config.category,
                userNotes: this.config.userNotes
            },
            messages: JSON.parse(JSON.stringify(messages)), // Deep clone
            tools: JSON.parse(JSON.stringify(tools)), // Deep clone
            systemPrompt
        };

        // Call live API
        const response = await this.liveClient.invokeWithTools(
            messages,
            tools,
            systemPrompt,
            modelIdOverride
        );

        const responseTimestamp = new Date().toISOString();

        // Create response record
        const responseRecord = {
            type: 'llm_invocation_response' as const,
            requestId,
            timestamp: responseTimestamp,
            response: JSON.parse(JSON.stringify(response)) // Deep clone
        };

        // Create recording with v2 signature
        const recording: Recording = {
            request,
            response: responseRecord,
            recordedAt: responseTimestamp,
            signature: this.extractSignature(messages, tools)
        };

        this.recordings.push(recording);

        console.log(`[BrowserRecordingClient] Recorded response ${requestId} (${this.recordings.length} total)`);

        return response;
    }

    /**
     * Get number of recordings captured
     */
    getRecordingCount(): number {
        return this.recordings.length;
    }

    /**
     * Get all recordings
     */
    getRecordings(): Recording[] {
        return this.recordings;
    }

    /**
     * Get current recording (most recent)
     */
    getCurrentRecording(): Recording | null {
        if (this.recordings.length === 0) return null;
        return this.recordings[this.recordings.length - 1];
    }

    /**
     * Clear all recordings
     */
    clearRecordings(): void {
        this.recordings = [];
        this.requestCounter = 0;
        console.log('[BrowserRecordingClient] Cleared all recordings');
    }

    /**
     * Export recordings as JSON Blob
     */
    exportRecordings(): Blob {
        const data = JSON.stringify(this.recordings, null, 2);
        return new Blob([data], { type: 'application/json' });
    }

    /**
     * Export recordings as individual JSON files in a zip
     * Returns a map of filename -> content for zip creation
     */
    exportRecordingsAsFiles(): Map<string, string> {
        const files = new Map<string, string>();

        for (let i = 0; i < this.recordings.length; i++) {
            const recording = this.recordings[i];
            const filename = `${recording.request.requestId}.json`;
            const content = JSON.stringify(recording, null, 2);
            files.set(filename, content);
        }

        return files;
    }

    /**
     * Download recordings as JSON file
     */
    downloadRecordings(filename?: string): void {
        const blob = this.exportRecordings();
        const defaultFilename = `recordings-${this.config.category}-${this.config.exampleName}-${Date.now()}.json`;
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename || defaultFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log(`[BrowserRecordingClient] Downloaded ${this.recordings.length} recordings as ${link.download}`);
    }

    /**
     * Download recordings as individual files (creates multiple downloads)
     */
    downloadRecordingsAsIndividualFiles(): void {
        const files = this.exportRecordingsAsFiles();

        for (const [filename, content] of files) {
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        console.log(`[BrowserRecordingClient] Downloaded ${files.size} individual recording files`);
    }

    /**
     * Get recording metadata
     */
    getMetadata() {
        return {
            exampleName: this.config.exampleName,
            category: this.config.category,
            recordingCount: this.recordings.length,
            userNotes: this.config.userNotes,
            modelId: this.config.modelId,
            transport: this.config.transport
        };
    }
}
