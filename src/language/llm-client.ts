/**
 * LLM client types and utilities
 *
 * This file now re-exports from the unified ClaudeClient and provides
 * a simplified factory function for backward compatibility.
 */

// Re-export all types from claude-client
export type {
    ToolDefinition,
    ToolUseBlock,
    TextBlock,
    ToolResultBlock,
    ContentBlock,
    ModelResponse,
    ConversationMessage,
    ClaudeClientConfig
} from './claude-client.js';

export { ClaudeClient } from './claude-client.js';
export { extractText, extractToolUses } from './llm-utils.js';

// Legacy interface for backward compatibility
export interface LLMClient {
    invokeModel(prompt: string): Promise<string>;
    invokeWithTools(
        messages: any[],
        tools: any[]
    ): Promise<any>;
    extractText(response: any): string;
    extractToolUses(response: any): any[];
}

/**
 * Legacy configuration interface
 */
export interface LLMClientConfig {
    provider: 'anthropic' | 'bedrock';
    apiKey?: string;
    region?: string;
    modelId?: string;
}

/**
 * Factory function for backward compatibility
 * @deprecated Use ClaudeClient directly instead
 */
export async function createLLMClient(config: LLMClientConfig): Promise<LLMClient> {
    if (config.provider === 'anthropic') {
        const { AnthropicClient } = await import('./anthropic-client.js');
        return new AnthropicClient({
            apiKey: config.apiKey,
            modelId: config.modelId
        });
    } else if (config.provider === 'bedrock') {
        const { BedrockClient } = await import('./bedrock-client.js');
        return new BedrockClient({
            region: config.region,
            modelId: config.modelId
        });
    } else {
        throw new Error(`Unknown provider: ${config.provider}`);
    }
}
