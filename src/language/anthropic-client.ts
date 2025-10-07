/**
 * Anthropic API client integration for machine execution
 */

import Anthropic from '@anthropic-ai/sdk';
import {
    LLMClient,
    ToolDefinition,
    ModelResponse,
    ConversationMessage,
    ContentBlock,
    TextBlock,
    ToolUseBlock
} from './llm-client.js';

export interface AnthropicClientConfig {
    apiKey?: string;
    modelId?: string;
}

export class AnthropicClient implements LLMClient {
    private client: Anthropic;
    private modelId: string;

    constructor(config: AnthropicClientConfig = {}) {
        if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
            throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey in config.');
        }

        this.client = new Anthropic({
            dangerouslyAllowBrowser: true, 
            apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY
        });
        this.modelId = config.modelId || 'claude-sonnet-4-20250514';
    }

    /**
     * Invoke Claude model with the given prompt
     * @param prompt The prompt to send to Claude
     * @returns The model's response
     */
    async invokeModel(prompt: string): Promise<string> {
        try {
            const message = await this.client.messages.create({
                model: this.modelId,
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            // Extract text from content blocks
            const textContent = message.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            return textContent;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Anthropic model:', errorMessage);
            throw new Error(`Failed to invoke Anthropic model: ${errorMessage}`);
        }
    }

    /**
     * Invoke Claude model with tools support
     * @param messages Conversation messages
     * @param tools Available tools
     * @returns The model's response with potential tool use
     */
    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        try {
            // Convert our message format to Anthropic's format
            const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : msg.content as any
            }));

            const params: Anthropic.MessageCreateParams = {
                model: this.modelId,
                max_tokens: 4096,
                messages: anthropicMessages
            };

            // Add tools if provided
            if (tools.length > 0) {
                params.tools = tools as any;
            }

            const message = await this.client.messages.create(params);

            // Convert Anthropic response to our format
            const content: ContentBlock[] = message.content.map(block => {
                if (block.type === 'text') {
                    return {
                        type: 'text',
                        text: block.text
                    } as TextBlock;
                } else if (block.type === 'tool_use') {
                    return {
                        type: 'tool_use',
                        id: block.id,
                        name: block.name,
                        input: block.input
                    } as ToolUseBlock;
                }
                // Handle other block types if needed
                return block as any;
            });

            return {
                content,
                stop_reason: message.stop_reason || 'end_turn'
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Anthropic model with tools:', errorMessage);
            throw new Error(`Failed to invoke Anthropic model with tools: ${errorMessage}`);
        }
    }

    /**
     * Extract text from a model response
     */
    extractText(response: ModelResponse): string {
        const textBlocks = response.content.filter(
            (block): block is TextBlock => block.type === 'text'
        );
        return textBlocks.map(block => block.text).join('\n');
    }

    /**
     * Extract tool uses from a model response
     */
    extractToolUses(response: ModelResponse): ToolUseBlock[] {
        return response.content.filter(
            (block): block is ToolUseBlock => block.type === 'tool_use'
        );
    }
}
