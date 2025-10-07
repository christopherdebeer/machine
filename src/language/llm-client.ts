/**
 * Unified LLM client interface for multiple providers
 */

export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: any;
}

export interface TextBlock {
    type: 'text';
    text: string;
}

export type ContentBlock = ToolUseBlock | TextBlock;

export interface ModelResponse {
    content: ContentBlock[];
    stop_reason: string;
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

/**
 * Unified interface for LLM clients (Anthropic, Bedrock, etc.)
 */
export interface LLMClient {
    /**
     * Invoke the model with a simple prompt
     */
    invokeModel(prompt: string): Promise<string>;

    /**
     * Invoke the model with tools support
     */
    invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse>;

    /**
     * Extract text from a model response
     */
    extractText(response: ModelResponse): string;

    /**
     * Extract tool uses from a model response
     */
    extractToolUses(response: ModelResponse): ToolUseBlock[];
}

/**
 * Configuration for LLM clients
 */
export interface LLMClientConfig {
    provider: 'anthropic' | 'bedrock';

    // Anthropic-specific config
    apiKey?: string;

    // Bedrock-specific config
    region?: string;

    // Common config
    modelId?: string;
}

/**
 * Factory function to create LLM clients based on configuration
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
