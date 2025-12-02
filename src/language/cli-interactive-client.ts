/**
 * CLI Interactive Client
 *
 * Enables manual LLM response injection for CLI interactive mode.
 * On each turn:
 * 1. Outputs the LLM request (tools, messages) to stdout as JSON
 * 2. Expects response via next CLI invocation with stdin
 * 3. Processes the response and continues execution
 */

import type {
    ConversationMessage,
    ModelResponse,
    ToolDefinition
} from './claude-client.js';

export interface CLIInteractiveRequest {
    type: 'llm_request';
    requestId: string;
    timestamp: string;
    node: string;
    messages: ConversationMessage[];
    tools: ToolDefinition[];
}

export interface CLIInteractiveResponse {
    type: 'llm_response';
    requestId: string;
    response: ModelResponse;
    reasoning?: string;
}

/**
 * CLI Interactive Client
 *
 * This is NOT a ClaudeClient - it's a helper that manages
 * the request/response cycle for CLI interactive mode.
 */
export class CLIInteractiveClient {
    private pendingRequest: CLIInteractiveRequest | null = null;
    private lastRequestId: string = '';

    /**
     * Create an LLM request that will be output to the user
     */
    createRequest(
        node: string,
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): CLIInteractiveRequest {
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const request: CLIInteractiveRequest = {
            type: 'llm_request',
            requestId,
            timestamp: new Date().toISOString(),
            node,
            messages,
            tools
        };

        this.pendingRequest = request;
        this.lastRequestId = requestId;

        return request;
    }

    /**
     * Validate and parse a response from stdin
     */
    parseResponse(input: string): CLIInteractiveResponse {
        try {
            const parsed = JSON.parse(input);

            if (parsed.type !== 'llm_response') {
                throw new Error(`Expected type 'llm_response', got '${parsed.type}'`);
            }

            if (!parsed.response || !parsed.response.content) {
                throw new Error('Response must include response.content array');
            }

            // Validate content blocks
            if (!Array.isArray(parsed.response.content)) {
                throw new Error('response.content must be an array');
            }

            for (const block of parsed.response.content) {
                if (!block.type) {
                    throw new Error('Each content block must have a type');
                }
                if (block.type === 'text' && typeof block.text !== 'string') {
                    throw new Error('Text blocks must have a text field');
                }
                if (block.type === 'tool_use' && (!block.name || !block.input)) {
                    throw new Error('Tool use blocks must have name and input');
                }
            }

            return parsed as CLIInteractiveResponse;
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get the last request ID
     */
    getLastRequestId(): string {
        return this.lastRequestId;
    }

    /**
     * Check if there's a pending request
     */
    hasPendingRequest(): boolean {
        return this.pendingRequest !== null;
    }

    /**
     * Clear pending request
     */
    clearPendingRequest(): void {
        this.pendingRequest = null;
    }
}

/**
 * Format request for display to user
 */
export function formatRequestForDisplay(request: CLIInteractiveRequest): string {
    return JSON.stringify(request, null, 2);
}

/**
 * Create example response for a request (for documentation)
 */
export function createExampleResponse(request: CLIInteractiveRequest): string {
    // Find a transition tool if any
    const transitionTool = request.tools.find(t => t.name.startsWith('transition_to_'));

    const exampleResponse: CLIInteractiveResponse = {
        type: 'llm_response',
        requestId: request.requestId,
        reasoning: 'Explain your reasoning here',
        response: {
            id: 'example',
            model: 'cli-interactive',
            role: 'assistant',
            content: transitionTool ? [
                {
                    type: 'text',
                    text: 'I will use the appropriate tool to proceed.'
                },
                {
                    type: 'tool_use',
                    id: 'tool-1',
                    name: transitionTool.name,
                    input: {
                        reason: 'Explanation of why this transition'
                    }
                }
            ] : [
                {
                    type: 'text',
                    text: 'Task completed successfully.'
                }
            ],
            stop_reason: 'end_turn',
            usage: {
                input_tokens: 100,
                output_tokens: 50
            }
        }
    };

    return JSON.stringify(exampleResponse, null, 2);
}
