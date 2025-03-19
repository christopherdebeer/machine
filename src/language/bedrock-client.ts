/**
 * AWS Bedrock client integration for machine execution
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface BedrockClientConfig {
    region?: string;
    modelId?: string;
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
}
