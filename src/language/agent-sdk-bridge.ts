/**
 * Agent SDK Bridge - Phase 4: Claude Agent SDK Integration
 *
 * Bridges RailsExecutor with Claude Agent SDK for:
 * - Agent invocation with phase-specific context
 * - Tool execution handling
 * - Message history retention with auto-compaction
 * - Execution history persistence
 */

import type { ToolDefinition, ConversationMessage, ModelResponse, ToolUseBlock } from './llm-client.js';
import type { MachineData, MachineExecutionContext } from './rails-executor.js';
import type { MetaToolManager } from './meta-tool-manager.js';
import { AnthropicClient } from './anthropic-client.js';

/**
 * Agent message for conversation history
 */
export interface AgentMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    toolUses?: Array<{
        name: string;
        input: any;
        output?: any;
    }>;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
    output: string;
    nextNode?: string;
    toolsUsed: string[];
    messagesExchanged: number;
    tokensUsed?: {
        input: number;
        output: number;
    };
}

/**
 * Execution history entry for batch evaluation
 */
export interface ExecutionHistoryEntry {
    timestamp: string;
    nodeName: string;
    nodeType: string;
    systemPrompt: string;
    userPrompt: string;
    tools: string[];
    result: AgentExecutionResult;
    conversationHistory: AgentMessage[];
}

/**
 * Agent SDK Bridge configuration
 */
export interface AgentSDKBridgeConfig {
    model?: 'sonnet' | 'opus' | 'haiku';
    modelId?: string; // Specific model ID override
    apiKey?: string; // Anthropic API key
    maxTurns?: number;
    autoCompaction?: boolean;
    persistHistory?: boolean;
    historyPath?: string;
}

/**
 * Agent SDK Bridge
 *
 * NOTE: This is a Phase 4 foundational implementation.
 * The actual Claude Agent SDK integration requires:
 * 1. Proper SDK initialization with API keys
 * 2. Tool registration in SDK format
 * 3. Message streaming and event handling
 * 4. Auto-compaction implementation
 *
 * For now, this provides the interface and structure that will be
 * filled in with actual SDK calls.
 */
export class AgentSDKBridge {
    private conversationHistory: AgentMessage[] = [];
    private executionHistory: ExecutionHistoryEntry[] = [];
    private config: Required<AgentSDKBridgeConfig>;
    private toolExecutor?: (toolName: string, input: any) => Promise<any>;
    private anthropicClient?: AnthropicClient;

    constructor(
        private machineData: MachineData,
        // @ts-expect-error - Reserved for future use
        private _executionContext: MachineExecutionContext,
        private metaToolManager: MetaToolManager,
        config: AgentSDKBridgeConfig = {}
    ) {
        this.config = {
            model: config.model || 'sonnet',
            modelId: config.modelId || '',
            apiKey: config.apiKey || '',
            maxTurns: config.maxTurns || 50,
            autoCompaction: config.autoCompaction !== false,
            persistHistory: config.persistHistory !== false,
            historyPath: config.historyPath || './execution-history.json'
        };

        // Initialize Anthropic client if API key is provided
        if (this.config.apiKey) {
            try {
                this.anthropicClient = new AnthropicClient({
                    apiKey: this.config.apiKey,
                    modelId: this.config.modelId || this.getModelIdFromName(this.config.model)
                });
            } catch (error) {
                console.warn('Failed to initialize Anthropic client:', error);
            }
        }
    }

    /**
     * Map model name to Anthropic model ID
     */
    private getModelIdFromName(model: 'sonnet' | 'opus' | 'haiku'): string {
        const modelMap = {
            'sonnet': 'claude-3-5-sonnet-20241022',
            'opus': 'claude-3-opus-20240229',
            'haiku': 'claude-3-haiku-20240307'
        };
        return modelMap[model];
    }

    /**
     * Invoke agent for a node
     */
    async invokeAgent(
        nodeName: string,
        systemPrompt: string,
        tools: ToolDefinition[],
        toolExecutor?: (toolName: string, input: any) => Promise<any>
    ): Promise<AgentExecutionResult> {
        console.log(`🤖 Invoking agent for node: ${nodeName}`);
        console.log(`📋 System prompt length: ${systemPrompt.length} chars`);
        console.log(`🔧 Available tools: ${tools.map(t => t.name).join(', ')}`);

        // Store tool executor for use in executeTool
        this.toolExecutor = toolExecutor;

        // Build user prompt from node attributes
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        const userPrompt = this.extractUserPrompt(node);

        // If no Anthropic client, return placeholder
        if (!this.anthropicClient) {
            console.warn('⚠️ No Anthropic client available. Set ANTHROPIC_API_KEY or provide apiKey in config.');
            return this.placeholderResponse(nodeName, systemPrompt, userPrompt, tools);
        }

        // Prepare conversation messages
        const messages: ConversationMessage[] = [];

        // Add previous conversation history (excluding system messages)
        const previousMessages = this.conversationHistory
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content
            }));
        messages.push(...previousMessages);

        // Add current user message
        messages.push({
            role: 'user',
            content: userPrompt
        });

        // Multi-turn conversation loop
        const toolsUsed: string[] = [];
        let messagesExchanged = 0;
        let finalOutput = '';
        let nextNode: string | undefined;
        let turnCount = 0;

        while (turnCount < this.config.maxTurns) {
            turnCount++;

            try {
                // Invoke model with tools
                const response: ModelResponse = await this.anthropicClient.invokeWithTools(messages, tools);
                messagesExchanged++;

                // Extract text content
                const textContent = this.anthropicClient.extractText(response);
                if (textContent) {
                    finalOutput += (finalOutput ? '\n' : '') + textContent;
                }

                // Record assistant message
                this.conversationHistory.push({
                    role: 'assistant',
                    content: textContent || '[tool use only]',
                    timestamp: new Date().toISOString(),
                    toolUses: []
                });

                // Extract tool uses
                const toolUses: ToolUseBlock[] = this.anthropicClient.extractToolUses(response);

                if (toolUses.length === 0) {
                    // No tool uses - conversation complete
                    if (response.stop_reason === 'end_turn') {
                        break;
                    }
                }

                // Process tool uses
                for (const toolUse of toolUses) {
                    toolsUsed.push(toolUse.name);
                    console.log(`🔧 Agent using tool: ${toolUse.name}`);

                    try {
                        const toolResult = await this.executeTool(toolUse.name, toolUse.input);

                        // Check if this was a transition tool
                        if (toolResult.action === 'transition') {
                            nextNode = toolResult.target;
                            console.log(`✅ Agent chose transition to: ${nextNode}`);
                        }

                        // Add tool result to conversation
                        messages.push({
                            role: 'assistant',
                            content: response.content
                        });

                        messages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: toolUse.id,
                                    content: JSON.stringify(toolResult)
                                }
                            ]
                        });

                        messagesExchanged++;

                        // If transition was made, we're done
                        if (nextNode) {
                            break;
                        }
                    } catch (error) {
                        console.error(`❌ Tool execution error: ${toolUse.name}`, error);

                        // Report error to agent
                        messages.push({
                            role: 'assistant',
                            content: response.content
                        });

                        messages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: toolUse.id,
                                    content: JSON.stringify({
                                        error: error instanceof Error ? error.message : String(error)
                                    }),
                                    is_error: true
                                }
                            ]
                        });

                        messagesExchanged++;
                    }
                }

                // If transition was made, we're done
                if (nextNode) {
                    break;
                }

                // Auto-compaction check
                if (this.config.autoCompaction && this.shouldCompact()) {
                    await this.compact();
                }
            } catch (error) {
                console.error('❌ Agent invocation error:', error);
                throw error;
            }
        }

        if (turnCount >= this.config.maxTurns) {
            console.warn(`⚠️ Agent reached max turns (${this.config.maxTurns})`);
        }

        const result: AgentExecutionResult = {
            output: finalOutput || `Agent completed ${messagesExchanged} exchanges`,
            nextNode,
            toolsUsed,
            messagesExchanged,
            tokensUsed: this.getTokenUsageEstimate()
        };

        // Add to execution history for batch evaluation
        if (this.config.persistHistory) {
            this.executionHistory.push({
                timestamp: new Date().toISOString(),
                nodeName,
                nodeType: node?.type || 'unknown',
                systemPrompt,
                userPrompt,
                tools: tools.map(t => t.name),
                result,
                conversationHistory: [...this.conversationHistory]
            });
        }

        return result;
    }

    /**
     * Placeholder response when no API key is available
     */
    private placeholderResponse(
        nodeName: string,
        systemPrompt: string,
        userPrompt: string,
        tools: ToolDefinition[]
    ): AgentExecutionResult {
        // Record system message
        this.conversationHistory.push({
            role: 'system',
            content: systemPrompt,
            timestamp: new Date().toISOString()
        });

        // Add user message
        this.conversationHistory.push({
            role: 'user',
            content: userPrompt,
            timestamp: new Date().toISOString()
        });

        const result: AgentExecutionResult = {
            output: `[Placeholder] Agent invoked for ${nodeName}. Set ANTHROPIC_API_KEY to enable actual agent execution.`,
            toolsUsed: [],
            messagesExchanged: 2 // system + user
        };

        // Record assistant response
        this.conversationHistory.push({
            role: 'assistant',
            content: result.output,
            timestamp: new Date().toISOString(),
            toolUses: []
        });

        // Add to execution history for batch evaluation (same as real execution)
        if (this.config.persistHistory) {
            const node = this.machineData.nodes.find(n => n.name === nodeName);
            this.executionHistory.push({
                timestamp: new Date().toISOString(),
                nodeName,
                nodeType: node?.type || 'unknown',
                systemPrompt,
                userPrompt,
                tools: tools.map(t => t.name),
                result,
                conversationHistory: [...this.conversationHistory]
            });
        }

        return result;
    }

    /**
     * Check if compaction should be triggered
     */
    private shouldCompact(): boolean {
        // Compact if conversation history exceeds 50 messages
        return this.conversationHistory.length > 50;
    }

    /**
     * Extract user prompt from node
     */
    private extractUserPrompt(node: any): string {
        if (!node?.attributes) {
            return 'Please proceed with the task.';
        }

        const promptAttr = node.attributes.find((a: any) => a.name === 'prompt');
        if (promptAttr) {
            return String(promptAttr.value).replace(/^["']|["']$/g, '');
        }

        return 'Please proceed with the task.';
    }

    /**
     * Handle tool execution
     */
    async executeTool(toolName: string, input: any): Promise<any> {
        console.log(`🔧 Executing tool: ${toolName}`);

        // If we have a tool executor from RailsExecutor, use it
        if (this.toolExecutor) {
            return await this.toolExecutor(toolName, input);
        }

        // Fallback: Check if it's a dynamic tool
        const dynamicTool = this.metaToolManager.getDynamicTool(toolName);
        if (dynamicTool) {
            return await this.metaToolManager.executeDynamicTool(toolName, input);
        }

        // Check if it's a meta-tool
        const metaTools = this.metaToolManager.getMetaTools();
        const metaTool = metaTools.find(t => t.name === toolName);
        if (metaTool) {
            switch (toolName) {
                case 'get_machine_definition':
                    return await this.metaToolManager.getMachineDefinition(input);
                case 'update_definition':
                    return await this.metaToolManager.updateDefinition(input);
                case 'construct_tool':
                    return await this.metaToolManager.constructTool(input);
                case 'list_available_tools':
                    return await this.metaToolManager.listAvailableTools(input);
                case 'propose_tool_improvement':
                    return await this.metaToolManager.proposeToolImprovement(input);
                default:
                    throw new Error(`Meta-tool ${toolName} not implemented`);
            }
        }

        throw new Error(`Tool ${toolName} not found`);
    }

    /**
     * Get conversation history
     */
    getConversationHistory(): AgentMessage[] {
        return [...this.conversationHistory];
    }

    /**
     * Get execution history for batch evaluation
     */
    getExecutionHistory(): ExecutionHistoryEntry[] {
        return [...this.executionHistory];
    }

    /**
     * Persist execution history to file
     */
    async persistExecutionHistory(): Promise<void> {
        if (!this.config.persistHistory || this.executionHistory.length === 0) {
            return;
        }

        try {
            // Dynamically import fs only in Node.js environment
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                const fs = await import('node:fs/promises');
                const historyData = JSON.stringify(this.executionHistory, null, 2);
                await fs.writeFile(this.config.historyPath, historyData, 'utf-8');
                console.log(`📝 Persisted ${this.executionHistory.length} execution entries to ${this.config.historyPath}`);
            } else {
                console.log(`📝 Would persist ${this.executionHistory.length} execution entries (browser environment)`);
            }
        } catch (error) {
            console.error('❌ Failed to persist execution history:', error);
        }
    }

    /**
     * Clear conversation history (for testing or manual compaction)
     */
    clearConversationHistory(): void {
        this.conversationHistory = [];
    }

    /**
     * Manual compaction - reduce conversation history size
     */
    async compact(): Promise<void> {
        if (this.conversationHistory.length === 0) {
            return;
        }

        console.log(`🗜️ Compacting conversation history (${this.conversationHistory.length} messages)`);

        // Simple compaction: keep only recent messages
        // Real SDK implementation would use Claude's context compaction
        const recentCount = 10;
        if (this.conversationHistory.length > recentCount) {
            const removed = this.conversationHistory.length - recentCount;
            this.conversationHistory = this.conversationHistory.slice(-recentCount);
            console.log(`✓ Removed ${removed} old messages`);
        }
    }

    /**
     * Get current token usage estimate
     */
    getTokenUsageEstimate(): { input: number; output: number } {
        // Rough estimate: ~4 chars per token
        const totalChars = this.conversationHistory.reduce(
            (sum, msg) => sum + msg.content.length,
            0
        );

        return {
            input: Math.ceil(totalChars / 4),
            output: 0 // Would be tracked from actual API responses
        };
    }
}
