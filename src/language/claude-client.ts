/**
 * Unified Claude client for both direct Anthropic API and AWS Bedrock
 * Supports transport selection via configuration
 */

import Anthropic from '@anthropic-ai/sdk';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

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

export interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

export type ContentBlock = ToolUseBlock | TextBlock | ToolResultBlock;

export interface ModelResponse {
    content: ContentBlock[];
    stop_reason: string;
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

export interface ClaudeClientConfig {
    // Transport selection
    transport?: 'api' | 'bedrock';

    // API transport config
    apiKey?: string;

    // Bedrock transport config
    region?: string;

    // Common config
    modelId?: string;
}

/**
 * Unified Claude client supporting both direct API and Bedrock transports
 */
export class ClaudeClient {
    private transport: 'api' | 'bedrock';
    private anthropicClient?: Anthropic;
    private bedrockClient?: BedrockRuntimeClient;
    private modelId: string;

    constructor(config: ClaudeClientConfig = {}) {
        this.transport = config.transport || 'api';

        if (this.transport === 'api') {
            // Direct API transport
            if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
                throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey in config.');
            }

            this.anthropicClient = new Anthropic({
                dangerouslyAllowBrowser: true,
                apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY
            });
            // Model ID priority: config > env var > default (haiku)
            this.modelId = config.modelId || process.env.ANTHROPIC_MODEL_ID || 'claude-3-5-haiku-20241022';
        } else {
            // Bedrock transport
            this.bedrockClient = new BedrockRuntimeClient({
                region: config.region || 'us-west-2'
            });
            // Model ID priority: config > env var > default (haiku on Bedrock)
            this.modelId = config.modelId || process.env.ANTHROPIC_MODEL_ID || 'anthropic.claude-3-5-haiku-20241022-v1:0';
        }
    }

    /**
     * Invoke Claude model with a simple prompt
     */
    async invokeModel(prompt: string): Promise<string> {
        if (this.transport === 'api') {
            return this.invokeViaAPI(prompt);
        } else {
            return this.invokeViaBedrock(prompt);
        }
    }

    /**
     * Invoke Claude model with tools support
     */
    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        if (this.transport === 'api') {
            return this.invokeWithToolsViaAPI(messages, tools);
        } else {
            return this.invokeWithToolsViaBedrock(messages, tools);
        }
    }

    /**
     * Direct API transport implementation
     */
    private async invokeViaAPI(prompt: string): Promise<string> {
        if (!this.anthropicClient) {
            throw new Error('Anthropic client not initialized');
        }

        try {
            const message = await this.anthropicClient.messages.create({
                model: this.modelId,
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const textContent = message.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            return textContent;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Claude via API:', errorMessage);
            throw new Error(`Failed to invoke Claude via API: ${errorMessage}`);
        }
    }

    /**
     * Bedrock transport implementation
     */
    private async invokeViaBedrock(prompt: string): Promise<string> {
        if (!this.bedrockClient) {
            throw new Error('Bedrock client not initialized');
        }

        const input = {
            modelId: this.modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: '2023-01-01',
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        };

        try {
            const command = new InvokeModelCommand(input);
            const response = await this.bedrockClient.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            return responseBody.content[0].text;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Claude via Bedrock:', errorMessage);
            throw new Error(`Failed to invoke Claude via Bedrock: ${errorMessage}`);
        }
    }

    /**
     * Direct API transport with tools
     */
    private async invokeWithToolsViaAPI(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        if (!this.anthropicClient) {
            throw new Error('Anthropic client not initialized');
        }

        try {
            const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : msg.content as any
            }));

            const params: Anthropic.MessageCreateParams = {
                model: this.modelId,
                max_tokens: 4096,
                messages: anthropicMessages
            };

            if (tools.length > 0) {
                params.tools = tools as any;
            }

            const message = await this.anthropicClient.messages.create(params);

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
                return block as any;
            });

            return {
                content,
                stop_reason: message.stop_reason || 'end_turn'
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Claude with tools via API:', errorMessage);
            throw new Error(`Failed to invoke Claude with tools via API: ${errorMessage}`);
        }
    }

    /**
     * Bedrock transport with tools
     */
    private async invokeWithToolsViaBedrock(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        if (!this.bedrockClient) {
            throw new Error('Bedrock client not initialized');
        }

        const input = {
            modelId: this.modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: '2023-01-01',
                max_tokens: 4096,
                messages: messages,
                tools: tools.length > 0 ? tools : undefined
            })
        };

        try {
            const command = new InvokeModelCommand(input);
            const response = await this.bedrockClient.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));

            return {
                content: responseBody.content,
                stop_reason: responseBody.stop_reason
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Claude with tools via Bedrock:', errorMessage);
            throw new Error(`Failed to invoke Claude with tools via Bedrock: ${errorMessage}`);
        }
    }
}
