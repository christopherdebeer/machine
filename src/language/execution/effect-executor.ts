/**
 * Effect Executor (Imperative Shell)
 *
 * Handles execution of side effects produced by the functional core.
 * This is where all I/O happens: LLM calls, logging, checkpoints, etc.
 */

import type {
    Effect,
    InvokeLLMEffect,
    CodeTaskEffect,
    LogEffect,
    CheckpointEffect,
    CompleteEffect,
    ErrorEffect,
    AgentResult,
    ToolExecutionResult
} from './runtime-types.js';
import type { MachineJSON } from '../json/types.js';
import { ClaudeClient } from '../claude-client.js';
import { extractText, extractToolUses } from '../llm-client.js';
import { CodeExecutor } from './code-executor.js';

/**
 * Effect executor configuration
 */
export interface EffectExecutorConfig {
    llmClient?: ClaudeClient;
    vfs?: {
        writeFile(path: string, content: string): void;
        readFile(path: string): string | undefined;
        exists(path: string): boolean;
    };
    logHandler?: (effect: LogEffect) => void;
    checkpointHandler?: (effect: CheckpointEffect) => void;
    onComplete?: (effect: CompleteEffect) => void;
    onError?: (effect: ErrorEffect) => void;
}

/**
 * Effect executor
 */
export class EffectExecutor {
    private llmClient?: ClaudeClient;
    private codeExecutor?: CodeExecutor;
    private logHandler: (effect: LogEffect) => void;
    private checkpointHandler: (effect: CheckpointEffect) => void;
    private onComplete: (effect: CompleteEffect) => void;
    private onError: (effect: ErrorEffect) => void;

    constructor(config: EffectExecutorConfig = {}) {
        this.llmClient = config.llmClient;

        // Initialize CodeExecutor if LLM client is available
        if (this.llmClient) {
            this.codeExecutor = new CodeExecutor(this.llmClient, config.vfs);
        }

        this.logHandler = config.logHandler || this.defaultLogHandler;
        this.checkpointHandler = config.checkpointHandler || this.defaultCheckpointHandler;
        this.onComplete = config.onComplete || this.defaultCompleteHandler;
        this.onError = config.onError || this.defaultErrorHandler;
    }

    /**
     * Execute a batch of effects
     */
    async execute(effects: Effect[]): Promise<AgentResult[]> {
        const agentResults: AgentResult[] = [];

        for (const effect of effects) {
            switch (effect.type) {
                case 'invoke_llm':
                    agentResults.push(await this.executeInvokeLLM(effect));
                    break;
                case 'code_task':
                    agentResults.push(await this.executeCodeTask(effect));
                    break;
                case 'log':
                    this.executeLog(effect);
                    break;
                case 'checkpoint':
                    this.executeCheckpoint(effect);
                    break;
                case 'complete':
                    this.executeComplete(effect);
                    break;
                case 'error':
                    this.executeError(effect);
                    break;
            }
        }

        return agentResults;
    }

    /**
     * Execute LLM invocation
     */
    private async executeInvokeLLM(effect: InvokeLLMEffect): Promise<AgentResult> {
        if (!this.llmClient) {
            throw new Error('LLM client not configured');
        }

        const { pathId, systemPrompt, tools, modelId } = effect;

        // If no tools, use simple invocation
        if (tools.length === 0) {
            const output = await this.llmClient.invokeModel(systemPrompt);
            return {
                pathId,
                output,
                toolExecutions: []
            };
        }

        // Multi-turn conversation with tools
        const messages: any[] = [
            { role: 'user', content: systemPrompt }
        ];

        let nextNode: string | undefined;
        let finalText = '';
        const toolExecutions: ToolExecutionResult[] = [];

        // Tool use loop
        while (true) {
            const response = await this.llmClient.invokeWithTools(messages, tools);

            // Extract text
            const text = extractText(response);
            if (text) {
                finalText += (finalText ? '\n' : '') + text;
            }

            // Check for tool uses
            const toolUses = extractToolUses(response);

            if (toolUses.length === 0) {
                break;
            }

            // Add assistant message
            messages.push({
                role: 'assistant',
                content: response.content
            });

            // Process tool uses
            const toolResults: any[] = [];

            for (const toolUse of toolUses) {
                try {
                    const result = await this.handleToolUse(toolUse.name, toolUse.input);

                    // Track transition tools
                    if (toolUse.name.startsWith('transition_to_')) {
                        nextNode = result.target;
                    }

                    toolExecutions.push({
                        toolName: toolUse.name,
                        input: toolUse.input,
                        output: result,
                        success: true
                    });

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(result)
                    });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);

                    toolExecutions.push({
                        toolName: toolUse.name,
                        input: toolUse.input,
                        output: { error: errorMessage },
                        success: false,
                        error: errorMessage
                    });

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify({ error: errorMessage }),
                        is_error: true
                    });
                }
            }

            // Add tool results
            messages.push({
                role: 'user',
                content: toolResults
            });

            // If we got a transition, stop
            if (nextNode) {
                break;
            }
        }

        return {
            pathId,
            output: finalText,
            nextNode,
            toolExecutions
        };
    }

    /**
     * Execute code task with @code annotation
     */
    private async executeCodeTask(effect: CodeTaskEffect): Promise<AgentResult> {
        if (!this.codeExecutor) {
            throw new Error('Code executor not initialized (requires LLM client)');
        }

        // Execute the code task with LLM fallback
        const result = await this.codeExecutor.executeCodeTask(
            effect.taskNode,
            effect.input,
            effect.dygramFilePath || '',
            async () => {
                // LLM fallback: invoke LLM as normal task
                if (!this.llmClient) {
                    throw new Error('LLM client not configured for fallback');
                }

                const systemPrompt = `Execute task: ${effect.nodeName}`;
                const output = await this.llmClient.invokeModel(systemPrompt);
                return output;
            }
        );

        return {
            pathId: effect.pathId,
            output: String(result.output),
            toolExecutions: []
        };
    }

    /**
     * Handle tool use (context, transition, meta)
     */
    private async handleToolUse(toolName: string, input: any): Promise<any> {
        // Transition tools
        if (toolName.startsWith('transition_to_')) {
            const target = toolName.replace('transition_to_', '');
            return {
                success: true,
                action: 'transition',
                target,
                reason: input.reason || 'agent decision'
            };
        }

        // Context read
        if (toolName.startsWith('read_')) {
            // TODO: Implement context reading from machine state
            return {
                success: true,
                context: toolName.replace('read_', ''),
                data: {}
            };
        }

        // Context write
        if (toolName.startsWith('write_')) {
            // TODO: Implement context writing (needs state mutation)
            return {
                success: true,
                context: toolName.replace('write_', ''),
                written: Object.keys(input.data || {})
            };
        }

        // Meta tools
        if (toolName === 'add_node' || toolName === 'add_edge') {
            // TODO: Implement meta-programming
            return {
                success: true,
                message: `${toolName} executed`
            };
        }

        throw new Error(`Unknown tool: ${toolName}`);
    }

    /**
     * Execute log effect
     */
    private executeLog(effect: LogEffect): void {
        this.logHandler(effect);
    }

    /**
     * Execute checkpoint effect
     */
    private executeCheckpoint(effect: CheckpointEffect): void {
        this.checkpointHandler(effect);
    }

    /**
     * Execute complete effect
     */
    private executeComplete(effect: CompleteEffect): void {
        this.onComplete(effect);
    }

    /**
     * Execute error effect
     */
    private executeError(effect: ErrorEffect): void {
        this.onError(effect);
    }

    /**
     * Default log handler (console)
     */
    private defaultLogHandler(effect: LogEffect): void {
        const prefix = {
            debug: '🔍',
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌'
        }[effect.level];

        const message = `${prefix} [${effect.category}] ${effect.message}`;

        switch (effect.level) {
            case 'debug':
                console.debug(message, effect.data || '');
                break;
            case 'info':
                console.log(message, effect.data || '');
                break;
            case 'warn':
                console.warn(message, effect.data || '');
                break;
            case 'error':
                console.error(message, effect.data || '');
                break;
        }
    }

    /**
     * Default checkpoint handler
     */
    private defaultCheckpointHandler(effect: CheckpointEffect): void {
        console.log(`📸 Checkpoint: ${effect.description || '(no description)'}`);
    }

    /**
     * Default complete handler
     */
    private defaultCompleteHandler(effect: CompleteEffect): void {
        console.log('✅ Execution complete');
    }

    /**
     * Default error handler
     */
    private defaultErrorHandler(effect: ErrorEffect): void {
        console.error(`❌ Execution error: ${effect.error}`);
        if (effect.pathId) {
            console.error(`   Path: ${effect.pathId}`);
        }
        if (effect.nodeName) {
            console.error(`   Node: ${effect.nodeName}`);
        }
    }
}
