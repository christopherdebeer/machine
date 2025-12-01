/**
 * Turn Executor
 *
 * Handles turn-by-turn execution of agent conversations.
 * Enables fine-grained stepping through LLM invocations and tool uses.
 */

import type {
    InvokeLLMEffect,
    ToolExecutionResult
} from './runtime-types.js';
import type {
    ConversationState,
    TurnResult,
    TurnExecutionConfig
} from './turn-types.js';
import { ClaudeClient } from '../claude-client.js';
import { extractText, extractToolUses } from '../llm-client.js';
import type { MetaToolManager } from '../meta-tool-manager.js';
import type { ExecutionState } from './runtime-types.js';

/**
 * Tool use handler function type
 */
export type ToolUseHandler = (toolName: string, input: any) => Promise<any>;

/**
 * Log handler function type
 */
export type LogHandler = (level: string, category: string, message: string, data?: any) => void;

/**
 * Turn executor for fine-grained agent execution
 */
export class TurnExecutor {
    private llmClient: ClaudeClient;
    private toolUseHandler: ToolUseHandler;
    private config: TurnExecutionConfig;
    private metaToolManager?: MetaToolManager;
    private currentState?: ExecutionState;
    private logHandler?: LogHandler;

    constructor(
        llmClient: ClaudeClient,
        toolUseHandler: ToolUseHandler,
        config: TurnExecutionConfig = {}
    ) {
        this.llmClient = llmClient;
        this.toolUseHandler = toolUseHandler;
        this.config = {
            maxTurns: 50,
            ...config
        };
    }

    /**
     * Set meta-tool manager for dynamic tool support
     */
    setMetaToolManager(manager: MetaToolManager): void {
        this.metaToolManager = manager;
    }

    /**
     * Set current execution state for context access
     */
    setCurrentState(state: ExecutionState): void {
        this.currentState = state;
    }

    /**
     * Set log handler
     */
    setLogHandler(handler: LogHandler): void {
        this.logHandler = handler;
    }

    /**
     * Log a message
     */
    private log(level: string, category: string, message: string, data?: any): void {
        if (this.logHandler) {
            this.logHandler(level, category, message, data);
        }
    }

    /**
     * Initialize a new conversation from an LLM effect
     */
    initializeConversation(effect: InvokeLLMEffect): ConversationState {
        return {
            messages: [
                { role: 'user', content: effect.systemPrompt }
            ],
            tools: effect.tools,
            toolExecutions: [],
            accumulatedText: ''
        };
    }

    /**
     * Execute a single turn in the conversation
     */
    async executeTurn(
        conversationState: ConversationState,
        nodeName: string
    ): Promise<TurnResult> {
        this.log('debug', 'turn', `Executing turn for node: ${nodeName}`, {
            messageCount: conversationState.messages.length,
            toolCount: conversationState.tools.length
        });

        // Invoke LLM with current conversation state
        const response = await this.llmClient.invokeWithTools(
            conversationState.messages,
            conversationState.tools
        );

        // Extract text reasoning
        const text = extractText(response);
        if (text) {
            this.log('debug', 'turn', `Turn reasoning: ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}`, {
                fullText: text
            });
        }

        // Extract tool uses
        const toolUses = extractToolUses(response);

        // If no tool uses, conversation is complete
        if (toolUses.length === 0) {
            this.log('info', 'turn', 'Turn complete - no tool uses');
            return {
                conversationState,
                toolExecutions: [],
                text: text || '',
                isComplete: true,
                nextNode: undefined,
                dynamicToolConstructed: false
            };
        }

        this.log('info', 'turn', `Turn selected ${toolUses.length} tool(s): ${toolUses.map(t => t.name).join(', ')}`, {
            tools: toolUses.map(t => ({ name: t.name, input: t.input }))
        });

        // Add assistant message to conversation
        const updatedMessages = [
            ...conversationState.messages,
            { role: 'assistant' as const, content: response.content }
        ];

        // Process tool uses
        const toolResults: any[] = [];
        const turnToolExecutions: ToolExecutionResult[] = [];
        let nextNode: string | undefined;
        let dynamicToolConstructed = false;

        for (const toolUse of toolUses) {
            try {
                const result = await this.toolUseHandler(toolUse.name, toolUse.input);

                // Track transition tools
                if (toolUse.name.startsWith('transition_to_')) {
                    nextNode = result.target;
                }

                // Track dynamic tool construction
                if (toolUse.name === 'construct_tool' && result.success) {
                    dynamicToolConstructed = true;
                }

                // Log successful tool execution
                const reasonSuffix = (result && result.reason) ? `\n  Reason: ${result.reason}` : '';
                this.log('info', 'tool', `✓ ${toolUse.name} executed successfully${reasonSuffix}`, {
                    input: toolUse.input,
                    output: result
                });

                turnToolExecutions.push({
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

                this.log('error', 'tool', `✗ ${toolUse.name} failed: ${errorMessage}`, {
                    input: toolUse.input,
                    error: errorMessage
                });

                turnToolExecutions.push({
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

        // Add tool results to conversation
        const finalMessages = [
            ...updatedMessages,
            { role: 'user' as const, content: toolResults }
        ];

        // Update tools if dynamic tool was constructed
        let updatedTools = conversationState.tools;
        if (dynamicToolConstructed && this.metaToolManager) {
            const dynamicTools = this.metaToolManager.getDynamicToolDefinitions();
            const existingToolNames = new Set(updatedTools.map(t => t.name));
            
            for (const dynamicTool of dynamicTools) {
                if (!existingToolNames.has(dynamicTool.name)) {
                    // Cast to ensure type compatibility
                    updatedTools = [...updatedTools, dynamicTool as any];
                    this.log('info', 'tool', `➕ Added dynamic tool '${dynamicTool.name}' to available tools`, {
                        tool: dynamicTool.name
                    });
                }
            }
        }

        // Build updated conversation state
        const updatedConversationState: ConversationState = {
            messages: finalMessages,
            tools: updatedTools,
            toolExecutions: [...conversationState.toolExecutions, ...turnToolExecutions],
            accumulatedText: conversationState.accumulatedText + (text ? (conversationState.accumulatedText ? '\n' : '') + text : '')
        };

        // Determine if conversation is complete
        const isComplete = !!nextNode;

        return {
            conversationState: updatedConversationState,
            toolExecutions: turnToolExecutions,
            text: text || '',
            isComplete,
            nextNode,
            dynamicToolConstructed
        };
    }

    /**
     * Check if turn limit has been reached
     */
    hasReachedTurnLimit(turnCount: number): boolean {
        return turnCount >= (this.config.maxTurns || 50);
    }
}
