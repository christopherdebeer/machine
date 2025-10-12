/**
 * Backward compatibility wrapper for AnthropicClient
 * @deprecated Use ClaudeClient with transport: 'api' instead
 */

import { ClaudeClient, type ClaudeClientConfig } from './claude-client.js';
import { extractText, extractToolUses } from './llm-utils.js';
import type {
    ToolDefinition,
    ModelResponse,
    ConversationMessage,
    ToolUseBlock
} from './claude-client.js';

// Re-export types for backward compatibility
export type {
    ToolDefinition,
    ModelResponse,
    ConversationMessage,
    ToolUseBlock
};

export interface AnthropicClientConfig {
    apiKey?: string;
    modelId?: string;
}

/**
 * @deprecated Use ClaudeClient instead
 */
export class AnthropicClient {
    private client: ClaudeClient;

    constructor(config: AnthropicClientConfig = {}) {
        const claudeConfig: ClaudeClientConfig = {
            transport: 'api',
            apiKey: config.apiKey,
            modelId: config.modelId
        };
        this.client = new ClaudeClient(claudeConfig);
    }

    async invokeModel(prompt: string): Promise<string> {
        return this.client.invokeModel(prompt);
    }

    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        return this.client.invokeWithTools(messages, tools);
    }

    extractText(response: ModelResponse): string {
        return extractText(response);
    }

    extractToolUses(response: ModelResponse): ToolUseBlock[] {
        return extractToolUses(response);
    }
}
