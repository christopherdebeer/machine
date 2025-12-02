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
 * Extends ClaudeClient to enable CLI interactive mode
 */
export class StdinResponseClient extends ClaudeClient {
    private cliClient: CLIInteractiveClient;
    private responseInput?: string;
    private currentNode: string = 'unknown';

    constructor(config: ClaudeClientConfig & { responseInput?: string }) {
        // Pass a fake API key to the parent since we won't actually use it
        super({
            ...config,
            apiKey: config.apiKey || 'stdin-mode-no-api-key-needed'
        });
        this.cliClient = new CLIInteractiveClient();
        this.responseInput = config.responseInput;
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
    async invokeWithTools(
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

                this.cliClient.clearPendingRequest();
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
}
