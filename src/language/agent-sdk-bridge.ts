/**
 * Agent SDK Bridge - Claude Agent SDK Integration
 *
 * Bridges RailsExecutor with Claude Agent SDK for:
 * - Agent invocation with context-specific prompts
 * - Tool execution handling
 * - Message history retention with auto-compaction
 * - Execution history persistence
 */

import type { ToolDefinition, ConversationMessage, ModelResponse, ToolUseBlock } from './claude-client.js';
import type { MachineData, MachineExecutionContext } from './rails-executor.js';
import type { MetaToolManager } from './meta-tool-manager.js';
import type { ToolRegistry } from './tool-registry.js';
import type { ExecutionLogger } from './execution/index.js';
import { ClaudeClient } from './claude-client.js';
import { extractText, extractToolUses } from './llm-utils.js';
import { Mutex } from 'async-mutex';

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
 * NOTE: This is a foundational implementation.
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
    private claudeClient?: ClaudeClient;
    private toolRegistry?: ToolRegistry;
    private logger?: ExecutionLogger;

    // Mutexes for protecting shared state
    private invocationMutex = new Mutex();
    private historyMutex = new Mutex();
    private executionHistoryMutex = new Mutex();
    private compactionMutex = new Mutex();

    constructor(
        private machineData: MachineData,
        // @ts-expect-error - Reserved for future use
        private _executionContext: MachineExecutionContext,
        private metaToolManager: MetaToolManager,
        toolRegistry?: ToolRegistry,
        config: AgentSDKBridgeConfig = {},
        logger?: ExecutionLogger
    ) {
        this.logger = logger;
        this.toolRegistry = toolRegistry;
        this.config = {
            model: config.model || 'sonnet',
            modelId: config.modelId || '',
            apiKey: config.apiKey || '',
            maxTurns: config.maxTurns || 50,
            autoCompaction: config.autoCompaction !== false,
            persistHistory: config.persistHistory !== false,
            historyPath: config.historyPath || './execution-history.json'
        };

        // Initialize Claude client if API key is provided
        if (this.config.apiKey) {
            try {
                this.claudeClient = new ClaudeClient({
                    transport: 'api',
                    apiKey: this.config.apiKey,
                    modelId: this.config.modelId || this.getModelIdFromName(this.config.model)
                });
            } catch (error) {
                console.warn('Failed to initialize Claude client:', error);
            }
        }

        // Register meta-tools with ToolRegistry if available
        if (this.toolRegistry) {
            this.registerMetaTools();
        }
    }

    /**
     * Register meta-tools with the ToolRegistry
     */
    private registerMetaTools(): void {
        if (!this.toolRegistry) return;

        const metaTools = this.metaToolManager.getMetaTools();
        const metaToolHandlers: Record<string, (input: any) => Promise<any>> = {
            'get_machine_definition': (input) => this.metaToolManager.getMachineDefinition(input),
            'update_definition': (input) => this.metaToolManager.updateDefinition(input),
            'construct_tool': (input) => this.metaToolManager.constructTool(input),
            'list_available_tools': (input) => this.metaToolManager.listAvailableTools(input),
            'propose_tool_improvement': (input) => this.metaToolManager.proposeToolImprovement(input),
            'get_tool_nodes': (input) => this.metaToolManager.getToolNodesHandler(input),
            'build_tool_from_node': (input) => this.metaToolManager.buildToolFromNodeHandler(input),
        };

        metaTools.forEach(tool => {
            const handler = metaToolHandlers[tool.name];
            if (handler) {
                this.toolRegistry!.registerStatic(tool, async (name, input) => handler(input));
            }
        });
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
     * Invoke agent for a node with optional timeout and model override
     * @param nodeName The name of the node being executed
     * @param systemPrompt System prompt for the agent
     * @param tools Available tools for the agent
     * @param toolExecutor Function to execute tools
     * @param modelIdOverride Optional model ID to use instead of the configured default
     */
    async invokeAgent(
        nodeName: string,
        systemPrompt: string,
        tools: ToolDefinition[],
        toolExecutor?: (toolName: string, input: any) => Promise<any>,
        modelIdOverride?: string
    ): Promise<AgentExecutionResult> {
        // Use mutex to ensure only one invocation runs at a time
        return await this.invocationMutex.runExclusive(async () => {
            return await this.invokeAgentImpl(nodeName, systemPrompt, tools, toolExecutor, modelIdOverride);
        });
    }

    /**
     * Internal implementation of invokeAgent (protected by mutex)
     */
    private async invokeAgentImpl(
        nodeName: string,
        systemPrompt: string,
        tools: ToolDefinition[],
        toolExecutor?: (toolName: string, input: any) => Promise<any>,
        modelIdOverride?: string
    ): Promise<AgentExecutionResult> {
        console.log(`🤖 Invoking agent for node: ${nodeName}`);
        console.log(`📋 System prompt length: ${systemPrompt.length} chars`);
        console.log(`🔧 Available tools: ${tools.map(t => t.name).join(', ')}`);

        // Store tool executor for use in executeTool
        this.toolExecutor = toolExecutor;

        // Build user prompt from node attributes
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        const userPrompt = this.extractUserPrompt(node);

        // Log model ID if override is provided
        if (modelIdOverride) {
            console.log(`🎯 Using task-specific model: ${modelIdOverride}`);
        }

        // Check for node-specific timeout attribute
        const nodeTimeout = this.getNodeTimeout(node);
        if (nodeTimeout) {
            console.log(`⏱️ Node timeout: ${nodeTimeout}ms`);
            return this.invokeAgentWithTimeout(nodeName, systemPrompt, userPrompt, tools, nodeTimeout, modelIdOverride);
        }

        return this.invokeAgentInternal(nodeName, systemPrompt, userPrompt, tools, modelIdOverride);
    }

    /**
     * Get timeout value from node attributes (in milliseconds)
     */
    private getNodeTimeout(node: any): number | undefined {
        if (!node?.attributes) return undefined;

        const timeoutAttr = node.attributes.find((a: any) => a.name === 'timeout');
        if (!timeoutAttr) return undefined;

        const timeoutValue = parseInt(timeoutAttr.value);
        if (isNaN(timeoutValue)) return undefined;

        // Assume timeout is in seconds, convert to milliseconds
        return timeoutValue * 1000;
    }

    /**
     * Invoke agent with timeout
     */
    private async invokeAgentWithTimeout(
        nodeName: string,
        systemPrompt: string,
        userPrompt: string,
        tools: ToolDefinition[],
        timeoutMs: number,
        modelIdOverride?: string
    ): Promise<AgentExecutionResult> {
        return Promise.race([
            this.invokeAgentInternal(nodeName, systemPrompt, userPrompt, tools, modelIdOverride),
            new Promise<AgentExecutionResult>((_, reject) =>
                setTimeout(() => reject(new Error(
                    `Node '${nodeName}' execution timeout (${timeoutMs}ms). ` +
                    `The task took too long to complete.`
                )), timeoutMs)
            )
        ]);
    }

    /**
     * Internal agent invocation implementation
     */
    private async invokeAgentInternal(
        nodeName: string,
        systemPrompt: string,
        userPrompt: string,
        tools: ToolDefinition[],
        modelIdOverride?: string
    ): Promise<AgentExecutionResult> {
        // Get node for metadata
        const node = this.machineData.nodes.find(n => n.name === nodeName);


        // If no Claude client, return placeholder
        if (!this.claudeClient) {
            console.warn('⚠️ No Claude client available. Set ANTHROPIC_API_KEY or provide apiKey in config.');
            return await this.placeholderResponse(nodeName, systemPrompt, userPrompt, tools);
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
                // Invoke model with tools (with optional model ID override)
                const response: ModelResponse = await this.claudeClient.invokeWithTools(messages, tools, modelIdOverride);
                messagesExchanged++;

                // Extract text content
                const textContent = extractText(response);
                if (textContent) {
                    finalOutput += (finalOutput ? '\n' : '') + textContent;
                }

                // Record assistant message (protected by mutex)
                await this.historyMutex.runExclusive(async () => {
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: textContent || '[tool use only]',
                        timestamp: new Date().toISOString(),
                        toolUses: []
                    });
                });

                // Extract tool uses
                const toolUses: ToolUseBlock[] = extractToolUses(response);

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
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        console.error(`❌ Tool execution error: ${toolUse.name}`, error);
                        if (this.logger) {
                            this.logger.error('tool-execution', `Tool '${toolUse.name}' failed: ${errorMsg}`);
                        }

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

                // Auto-compaction check (atomic operation)
                if (this.config.autoCompaction) {
                    await this.compactionMutex.runExclusive(async () => {
                        if (this.shouldCompact()) {
                            await this.compactImpl();
                        }
                    });
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('❌ Agent invocation error:', error);
                if (this.logger) {
                    this.logger.error('agent-invocation', `Agent invocation failed: ${errorMsg}`);
                }
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

        // Add to execution history for batch evaluation (protected by mutex)
        if (this.config.persistHistory) {
            await this.executionHistoryMutex.runExclusive(async () => {
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
            });
        }

        return result;
    }

    /**
     * Placeholder response when no API key is available
     */
    private async placeholderResponse(
        nodeName: string,
        systemPrompt: string,
        userPrompt: string,
        tools: ToolDefinition[]
    ): Promise<AgentExecutionResult> {
        // Record system message (protected by mutex)
        await this.historyMutex.runExclusive(async () => {
            this.conversationHistory.push({
                role: 'system',
                content: systemPrompt,
                timestamp: new Date().toISOString()
            });
        });

        // Add user message (protected by mutex)
        await this.historyMutex.runExclusive(async () => {
            this.conversationHistory.push({
                role: 'user',
                content: userPrompt,
                timestamp: new Date().toISOString()
            });
        });

        const result: AgentExecutionResult = {
            output: `[Placeholder] Agent invoked for ${nodeName}. Set ANTHROPIC_API_KEY to enable actual agent execution.`,
            toolsUsed: [],
            messagesExchanged: 2 // system + user
        };

        // Record assistant response (protected by mutex)
        await this.historyMutex.runExclusive(async () => {
            this.conversationHistory.push({
                role: 'assistant',
                content: result.output,
                timestamp: new Date().toISOString(),
                toolUses: []
            });
        });

        // Add to execution history for batch evaluation (same as real execution)
        if (this.config.persistHistory) {
            const node = this.machineData.nodes.find(n => n.name === nodeName);
            await this.executionHistoryMutex.runExclusive(async () => {
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

        // Primary: Use tool executor from RailsExecutor
        if (this.toolExecutor) {
            return await this.toolExecutor(toolName, input);
        }

        // Fallback: Use ToolRegistry directly (includes dynamic + meta tools)
        if (this.toolRegistry && this.toolRegistry.hasTool(toolName)) {
            return await this.toolRegistry.executeTool(toolName, input);
        }

        // Additional fallback: Check if it's a meta tool (when no registry)
        const metaToolNames = [
            'get_machine_definition',
            'update_definition',
            'construct_tool',
            'list_available_tools',
            'propose_tool_improvement',
            'get_tool_nodes',
            'build_tool_from_node'
        ];

        if (metaToolNames.includes(toolName)) {
            return await this.executeMetaTool(toolName, input);
        }

        // Final fallback: Check if it's a dynamic tool
        const dynamicTool = this.metaToolManager.getDynamicTool(toolName);
        if (dynamicTool) {
            return await this.metaToolManager.executeDynamicTool(toolName, input);
        }

        throw new Error(`Tool ${toolName} not found`);
    }

    /**
     * Execute meta tool directly
     */
    private async executeMetaTool(toolName: string, input: any): Promise<any> {
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
            case 'get_tool_nodes':
                return await this.metaToolManager.getToolNodesHandler(input);
            case 'build_tool_from_node':
                return await this.metaToolManager.buildToolFromNodeHandler(input);
            default:
                throw new Error(`Meta tool ${toolName} not found`);
        }
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
    async clearConversationHistory(): Promise<void> {
        await this.historyMutex.runExclusive(async () => {
            this.conversationHistory = [];
        });
    }

    /**
     * Manual compaction - reduce conversation history size
     */
    async compact(): Promise<void> {
        await this.compactionMutex.runExclusive(async () => {
            await this.compactImpl();
        });
    }

    /**
     * Internal compaction implementation (protected by mutex)
     */
    private async compactImpl(): Promise<void> {
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
