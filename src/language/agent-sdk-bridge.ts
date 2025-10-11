/**
 * Agent SDK Bridge - Phase 4: Claude Agent SDK Integration
 *
 * Bridges RailsExecutor with Claude Agent SDK for:
 * - Agent invocation with phase-specific context
 * - Tool execution handling
 * - Message history retention with auto-compaction
 * - Execution history persistence
 */

import type { ToolDefinition } from './llm-client.js';
import type { MachineData, MachineExecutionContext } from './rails-executor.js';
import type { MetaToolManager } from './meta-tool-manager.js';

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

    constructor(
        private machineData: MachineData,
        // @ts-expect-error - Reserved for future use
        private _executionContext: MachineExecutionContext,
        private metaToolManager: MetaToolManager,
        config: AgentSDKBridgeConfig = {}
    ) {
        this.config = {
            model: config.model || 'sonnet',
            maxTurns: config.maxTurns || 50,
            autoCompaction: config.autoCompaction !== false,
            persistHistory: config.persistHistory !== false,
            historyPath: config.historyPath || './execution-history.json'
        };
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

        // Record system message
        this.conversationHistory.push({
            role: 'system',
            content: systemPrompt,
            timestamp: new Date().toISOString()
        });

        // Build user prompt from node attributes
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        const userPrompt = this.extractUserPrompt(node);

        // Add user message
        this.conversationHistory.push({
            role: 'user',
            content: userPrompt,
            timestamp: new Date().toISOString()
        });

        // Store tool executor for use in executeTool
        this.toolExecutor = toolExecutor;

        // TODO: Phase 4 - Actual SDK integration
        // For now, this is a placeholder that demonstrates the structure
        // Real implementation would:
        // 1. Call SDK query() function
        // 2. Handle tool use events
        // 3. Stream responses
        // 4. Manage auto-compaction

        const result: AgentExecutionResult = {
            output: `[Phase 4 Placeholder] Agent invoked for ${nodeName}. SDK integration pending.`,
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

        // TODO: Implement file writing
        // For now, just log
        console.log(`📝 Would persist ${this.executionHistory.length} execution entries to ${this.config.historyPath}`);
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
