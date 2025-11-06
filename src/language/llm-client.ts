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

import { ClaudeClient } from './claude-client.js';
import { MockClaudeClient } from './mock-claude-client.js';
export { ClaudeClient, MockClaudeClient };
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
export async function createLLMClient(config: LLMClientConfig): Promise<ClaudeClient> {
    if (config.provider === 'anthropic') {
        return new ClaudeClient({
            transport: 'api',
            apiKey: config.apiKey,
            modelId: config.modelId
        });
    } else if (config.provider === 'bedrock') {
        return new ClaudeClient({
            transport: 'bedrock',
            region: config.region,
            modelId: config.modelId
        });
    } else {
        throw new Error(`Unknown provider: ${config.provider}`);
    }
}

/**
 * Create a Claude client with automatic mock fallback
 *
 * If no API key is provided, returns a MockClaudeClient for testing.
 * This allows execution flows to be tested without requiring a real API key.
 *
 * @param config Client configuration
 * @returns ClaudeClient or MockClaudeClient
 */
export function createClaudeClientWithMockFallback(config: LLMClientConfig): ClaudeClient | MockClaudeClient {
    const hasApiKey = config.apiKey && config.apiKey.trim() !== '';

    if (!hasApiKey && config.provider === 'anthropic') {
        console.log('[createClaudeClientWithMockFallback] No API key provided, using MockClaudeClient');
        return new MockClaudeClient({
            modelId: config.modelId
        }) as any; // Cast to satisfy type checker
    }

    // Return real client
    if (config.provider === 'anthropic') {
        return new ClaudeClient({
            transport: 'api',
            apiKey: config.apiKey,
            modelId: config.modelId
        });
    } else if (config.provider === 'bedrock') {
        return new ClaudeClient({
            transport: 'bedrock',
            region: config.region,
            modelId: config.modelId
        });
    } else {
        throw new Error(`Unknown provider: ${config.provider}`);
    }
}
