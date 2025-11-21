/**
 * Interactive Test Client - EXPERIMENTAL
 *
 * This client enables Claude Code (or another agent) to act as the LLM backend
 * during test runs. It communicates via a special protocol to request intelligent
 * tool selections and responses.
 *
 * Protocol Design:
 * 1. Test → Agent: Send LLM invocation request via configured channel
 * 2. Agent → Test: Respond with tool selection and reasoning
 * 3. Test: Record response for playback in CI
 *
 * Communication Channels (in priority order):
 * - Environment variable with socket/pipe path
 * - File-based queue (simple but works)
 * - HTTP endpoint (for more complex scenarios)
 */

import type {
    ClaudeClientConfig,
    ContentBlock,
    ConversationMessage,
    ModelResponse,
    ToolDefinition
} from './claude-client.js';
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout as delay } from 'timers/promises';

export interface InteractiveTestConfig extends ClaudeClientConfig {
    /** Communication mode */
    mode: 'file-queue' | 'socket' | 'http';

    /** Directory for file-queue mode (default: .dygram-test-queue) */
    queueDir?: string;

    /** Socket path for socket mode */
    socketPath?: string;

    /** HTTP endpoint for http mode */
    httpEndpoint?: string;

    /** Timeout for waiting on agent response (ms) */
    timeout?: number;

    /** Whether to record responses for playback */
    recordResponses?: boolean;

    /** Directory to save recorded responses */
    recordingsDir?: string;
}

export interface LLMInvocationRequest {
    type: 'llm_invocation_request';
    requestId: string;
    timestamp: string;
    context: {
        testName?: string;
        testFile?: string;
        currentNode?: string;
        machineTitle?: string;
    };
    messages: ConversationMessage[];
    tools: ToolDefinition[];
    systemPrompt?: string;
}

export interface LLMInvocationResponse {
    type: 'llm_invocation_response';
    requestId: string;
    timestamp: string;
    response: ModelResponse;
    reasoning?: string;
}

/**
 * Interactive Test Client
 *
 * Communicates with an agent (like Claude Code) to get intelligent
 * responses during test runs.
 */
export class InteractiveTestClient {
    private config: Required<InteractiveTestConfig>;
    private requestCounter = 0;

    constructor(config: InteractiveTestConfig) {
        this.config = {
            transport: 'test-interactive' as any,
            mode: config.mode || 'file-queue',
            queueDir: config.queueDir || '.dygram-test-queue',
            socketPath: config.socketPath || '/tmp/dygram-test.sock',
            httpEndpoint: config.httpEndpoint || 'http://localhost:3456/llm',
            timeout: config.timeout || 30000, // 30 seconds
            recordResponses: config.recordResponses !== false,
            recordingsDir: config.recordingsDir || 'test/fixtures/recordings',
            modelId: config.modelId || 'interactive-claude-code',
            apiKey: config.apiKey,
            region: config.region
        };

        this.initialize();
    }

    /**
     * Initialize communication channel
     */
    private initialize(): void {
        if (this.config.mode === 'file-queue') {
            // Create queue directories
            const queuePath = path.resolve(this.config.queueDir);
            const requestsPath = path.join(queuePath, 'requests');
            const responsesPath = path.join(queuePath, 'responses');

            if (!fs.existsSync(requestsPath)) {
                fs.mkdirSync(requestsPath, { recursive: true });
            }
            if (!fs.existsSync(responsesPath)) {
                fs.mkdirSync(responsesPath, { recursive: true });
            }

            console.log('[InteractiveTestClient] Initialized file-queue mode:', queuePath);
        }

        if (this.config.recordResponses) {
            const recordingsPath = path.resolve(this.config.recordingsDir);
            if (!fs.existsSync(recordingsPath)) {
                fs.mkdirSync(recordingsPath, { recursive: true });
            }
        }
    }

    /**
     * Invoke model with simple prompt (converts to invokeWithTools)
     */
    async invokeModel(prompt: string, modelIdOverride?: string): Promise<string> {
        const response = await this.invokeWithTools(
            [{ role: 'user', content: prompt }],
            []
        );

        // Extract text from response
        const textBlocks = response.content.filter(
            (block: any) => block.type === 'text'
        );
        return textBlocks.map((block: any) => block.text).join('\n');
    }

    /**
     * Invoke with tools - sends request to agent and waits for response
     */
    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[],
        modelIdOverride?: string
    ): Promise<ModelResponse> {
        const requestId = this.generateRequestId();

        const request: LLMInvocationRequest = {
            type: 'llm_invocation_request',
            requestId,
            timestamp: new Date().toISOString(),
            context: this.extractTestContext(),
            messages,
            tools,
            systemPrompt: this.formatMessages(messages)
        };

        console.log(`[InteractiveTestClient] Sending request ${requestId}...`);
        console.log(`  Tools: ${tools.map(t => t.name).join(', ') || 'none'}`);
        console.log(`  Waiting for agent response...`);

        // Send request
        await this.sendRequest(request);

        // Wait for response
        const response = await this.waitForResponse(requestId);

        console.log(`[InteractiveTestClient] Received response ${requestId}`);
        if (response.reasoning) {
            console.log(`  Reasoning: ${response.reasoning}`);
        }

        // Record response if enabled
        if (this.config.recordResponses) {
            await this.recordResponse(request, response);
        }

        return response.response;
    }

    /**
     * Send request to agent via configured channel
     */
    private async sendRequest(request: LLMInvocationRequest): Promise<void> {
        switch (this.config.mode) {
            case 'file-queue':
                await this.sendRequestFileQueue(request);
                break;

            case 'socket':
                await this.sendRequestSocket(request);
                break;

            case 'http':
                await this.sendRequestHttp(request);
                break;

            default:
                throw new Error(`Unknown mode: ${this.config.mode}`);
        }
    }

    /**
     * Send request via file queue
     */
    private async sendRequestFileQueue(request: LLMInvocationRequest): Promise<void> {
        const requestPath = path.join(
            this.config.queueDir,
            'requests',
            `${request.requestId}.json`
        );

        fs.writeFileSync(requestPath, JSON.stringify(request, null, 2));
    }

    /**
     * Send request via socket (TODO: implement)
     */
    private async sendRequestSocket(request: LLMInvocationRequest): Promise<void> {
        throw new Error('Socket mode not yet implemented');
    }

    /**
     * Send request via HTTP (TODO: implement)
     */
    private async sendRequestHttp(request: LLMInvocationRequest): Promise<void> {
        throw new Error('HTTP mode not yet implemented');
    }

    /**
     * Wait for response from agent
     */
    private async waitForResponse(requestId: string): Promise<LLMInvocationResponse> {
        const startTime = Date.now();

        while (Date.now() - startTime < this.config.timeout) {
            const response = await this.checkForResponse(requestId);
            if (response) {
                return response;
            }

            // Wait a bit before checking again
            await delay(100);
        }

        throw new Error(`Timeout waiting for response to request ${requestId}`);
    }

    /**
     * Check for response via configured channel
     */
    private async checkForResponse(requestId: string): Promise<LLMInvocationResponse | null> {
        switch (this.config.mode) {
            case 'file-queue':
                return await this.checkResponseFileQueue(requestId);

            case 'socket':
                return await this.checkResponseSocket(requestId);

            case 'http':
                return await this.checkResponseHttp(requestId);

            default:
                throw new Error(`Unknown mode: ${this.config.mode}`);
        }
    }

    /**
     * Check for response in file queue
     */
    private async checkResponseFileQueue(requestId: string): Promise<LLMInvocationResponse | null> {
        const responsePath = path.join(
            this.config.queueDir,
            'responses',
            `${requestId}.json`
        );

        if (!fs.existsSync(responsePath)) {
            return null;
        }

        const content = fs.readFileSync(responsePath, 'utf-8');
        const response = JSON.parse(content) as LLMInvocationResponse;

        // Clean up
        fs.unlinkSync(responsePath);
        const requestPath = path.join(
            this.config.queueDir,
            'requests',
            `${requestId}.json`
        );
        if (fs.existsSync(requestPath)) {
            fs.unlinkSync(requestPath);
        }

        return response;
    }

    /**
     * Check for response via socket (TODO: implement)
     */
    private async checkResponseSocket(requestId: string): Promise<LLMInvocationResponse | null> {
        throw new Error('Socket mode not yet implemented');
    }

    /**
     * Check for response via HTTP (TODO: implement)
     */
    private async checkResponseHttp(requestId: string): Promise<LLMInvocationResponse | null> {
        throw new Error('HTTP mode not yet implemented');
    }

    /**
     * Record response for playback
     */
    private async recordResponse(
        request: LLMInvocationRequest,
        response: LLMInvocationResponse
    ): Promise<void> {
        const recordingPath = path.join(
            this.config.recordingsDir,
            `${request.requestId}.json`
        );

        const recording = {
            request,
            response,
            recordedAt: new Date().toISOString()
        };

        fs.writeFileSync(recordingPath, JSON.stringify(recording, null, 2));
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return `req-${Date.now()}-${++this.requestCounter}`;
    }

    /**
     * Extract test context from environment
     */
    private extractTestContext(): LLMInvocationRequest['context'] {
        // Try to get context from vitest
        // In real tests, this would be populated
        return {
            testName: process.env.VITEST_CURRENT_TEST,
            testFile: process.env.VITEST_TEST_FILE
        };
    }

    /**
     * Format messages into a single prompt
     */
    private formatMessages(messages: ConversationMessage[]): string {
        return messages
            .map(m => {
                if (typeof m.content === 'string') {
                    return `[${m.role}]: ${m.content}`;
                } else {
                    // Complex content
                    return `[${m.role}]: ${JSON.stringify(m.content)}`;
                }
            })
            .join('\n\n');
    }
}
