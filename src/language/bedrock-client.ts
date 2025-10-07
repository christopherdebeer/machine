/**
 * AWS Bedrock client integration for machine execution
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface BedrockClientConfig {
    region?: string;
    modelId?: string;
}

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

export class BedrockClient {
    private client: BedrockRuntimeClient;
    private modelId: string;

    constructor(config: BedrockClientConfig = {}) {
        this.client = new BedrockRuntimeClient({
            region: config.region || 'us-west-2'
        });
        this.modelId = config.modelId || 'anthropic.claude-3-sonnet-20240229-v1:0';
    }

    /**
     * Invoke Claude model with the given prompt
     * @param prompt The prompt to send to Claude
     * @returns The model's response
     */
    async invokeModel(prompt: string): Promise<string> {
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
            const response = await this.client.send(command);

            // Parse the response body
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            return responseBody.content[0].text;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Bedrock model:', errorMessage);
            throw new Error(`Failed to invoke Bedrock model: ${errorMessage}`);
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
            const response = await this.client.send(command);

            // Parse the response body
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            return {
                content: responseBody.content,
                stop_reason: responseBody.stop_reason
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error invoking Bedrock model with tools:', errorMessage);
            throw new Error(`Failed to invoke Bedrock model with tools: ${errorMessage}`);
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
