/**
 * Stdin Response Client
 *
 * A ClaudeClient implementation that:
 * 1. Outputs LLM requests to stdout as JSON
 * 2. Reads responses from a provided string (from stdin)
 * 3. Throws PendingResponseError if no response is available
 */

import { ClaudeClient, type ClaudeClientConfig, type ConversationMessage, type ModelResponse, type ToolDefinition } from './claude-client.js';
import { CLIInteractiveClient, formatRequestForDisplay, createExampleResponse } from './cli-interactive-client.js';
import type { RequestSignature } from './playback-test-client.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Error thrown when a response is needed but not provided
 */
export class PendingResponseError extends Error {
    constructor(
        public request: string,
        public exampleResponse: string
    ) {
        super('LLM response required - provide via stdin on next invocation');
        this.name = 'PendingResponseError';
    }
}

/**
 * Stdin Response Client
 *
 * Extends ClaudeClient to enable CLI interactive mode with optional recording
 */
export class StdinResponseClient extends ClaudeClient {
    private cliClient: CLIInteractiveClient;
    private responseInput?: string;
    private currentNode: string = 'unknown';
    private recordingsDir?: string;
    private turnCounter: number = 0;

    constructor(config: ClaudeClientConfig & { responseInput?: string; recordingsDir?: string }) {
        // Pass a fake API key to the parent since we won't actually use it
        super({
            ...config,
            apiKey: config.apiKey || 'stdin-mode-no-api-key-needed'
        });
        this.cliClient = new CLIInteractiveClient();
        this.responseInput = config.responseInput;
        this.recordingsDir = config.recordingsDir;

        // Create recordings directory if specified
        if (this.recordingsDir) {
            fs.mkdirSync(this.recordingsDir, { recursive: true });
        }
    }

    /**
     * Set the current node name for context
     */
    setCurrentNode(node: string): void {
        this.currentNode = node;
    }

    /**
     * Override invokeWithTools to implement request/response cycle
     */
    override async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[],
        modelIdOverride?: string
    ): Promise<ModelResponse> {
        // Create request
        const request = this.cliClient.createRequest(
            this.currentNode,
            messages,
            tools
        );

        // If we have a response, parse and return it
        if (this.responseInput) {
            try {
                const response = this.cliClient.parseResponse(this.responseInput);

                // Validate request ID matches if provided
                if (response.requestId && response.requestId !== request.requestId) {
                    console.error(`⚠️  Warning: Response requestId (${response.requestId}) doesn't match current request (${request.requestId})`);
                }

                // Record if recording is enabled
                if (this.recordingsDir) {
                    this.turnCounter++;
                    this.saveRecording(request, response.response, messages, tools);
                }

                this.cliClient.clearPendingRequest();
                
                // Clear response input after consuming it to prevent replay loop
                this.responseInput = undefined;
                
                return response.response;
            } catch (error) {
                throw new Error(`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // No response available - output request and throw
        const requestJson = formatRequestForDisplay(request);
        const exampleJson = createExampleResponse(request);

        throw new PendingResponseError(requestJson, exampleJson);
    }

    /**
     * Save recording for playback (compatible with PlaybackTestClient format)
     */
    private saveRecording(
        request: any,
        response: ModelResponse,
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): void {
        if (!this.recordingsDir) return;

        // Compute request signature for intelligent playback matching
        const signature: RequestSignature = {
            toolNames: tools.map(t => t.name).sort(),
            messageCount: messages.length,
            contextKeys: [] // Context keys can be added if needed
        };

        // Use the same format as InteractiveTestClient for compatibility
        const recording = {
            request: {
                messages,
                tools,
                systemPrompt: messages[0]?.content || ''
            },
            response: {
                content: response.content,
                stop_reason: response.stop_reason
            },
            recordedAt: new Date().toISOString(),
            signature  // Add signature for v2 matching
        };

        const filename = path.join(this.recordingsDir, `turn-${this.turnCounter}.json`);
        fs.writeFileSync(filename, JSON.stringify(recording, null, 2));
        console.error(`📼 Recorded turn ${this.turnCounter} to ${filename}`);
    }
}
