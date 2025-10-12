/**
 * Backward compatibility wrapper for BedrockClient
 * @deprecated Use ClaudeClient with transport: 'bedrock' instead
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

export interface BedrockClientConfig {
    region?: string;
    modelId?: string;
}

/**
 * @deprecated Use ClaudeClient instead
 */
export class BedrockClient {
    private client: ClaudeClient;

    constructor(config: BedrockClientConfig = {}) {
        const claudeConfig: ClaudeClientConfig = {
            transport: 'bedrock',
            region: config.region,
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
