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
    ToolExecutionResult,
    ExecutionState
} from './runtime-types.js';
import type { MachineJSON } from '../json/types.js';
import { ClaudeClient } from '../claude-client.js';
import { extractText, extractToolUses } from '../llm-client.js';
import { CodeExecutor } from './code-executor.js';
import type { MetaToolManager } from '../meta-tool-manager.js';
import { getContextValues, spawnPath, spawnMappedPaths, resolveQualifiedName, getMapAnnotation } from './state-builder.js';

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
    private metaToolManager?: MetaToolManager;
    private currentState?: ExecutionState;  // Current execution state for context access

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
     * @param effects - Effects to execute
     * @param state - Current execution state (for context access)
     */
    async execute(effects: Effect[], state?: ExecutionState): Promise<AgentResult[]> {
        // Store state for context operations
        this.currentState = state;

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

        let { pathId, nodeName, systemPrompt, tools, modelId } = effect;
        
        // Inject dynamic tools from MetaToolManager if available
        if (this.metaToolManager) {
            const dynamicTools = this.metaToolManager.getDynamicToolDefinitions();
            if (dynamicTools.length > 0) {
                // Cast to runtime ToolDefinition type (types are compatible at runtime)
                const runtimeTools = dynamicTools.map(dt => ({
                    name: dt.name,
                    description: dt.description,
                    input_schema: {
                        type: 'object' as const,
                        properties: dt.input_schema.properties,
                        required: dt.input_schema.required
                    }
                }));
                tools = [...tools, ...runtimeTools];
            }
        }

        // Log agent invocation start
        this.executeLog({
            type: 'log',
            level: 'info',
            category: 'agent',
            message: `Agent invoked for node: ${nodeName || 'unknown'}`,
            data: { toolCount: tools.length, hasTools: tools.length > 0 }
        });

        // If no tools, use simple invocation
        if (tools.length === 0) {
            const output = await this.llmClient.invokeModel(systemPrompt);
            this.executeLog({
                type: 'log',
                level: 'info',
                category: 'agent',
                message: `Agent completed (no tools available)`,
                data: { outputLength: output.length }
            });
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

            // Extract and log text reasoning
            const text = extractText(response);
            if (text) {
                this.executeLog({
                    type: 'log',
                    level: 'debug',
                    category: 'agent',
                    message: `Agent reasoning: ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}`,
                    data: { fullText: text }
                });
                finalText += (finalText ? '\n' : '') + text;
            }

            // Check for tool uses
            const toolUses = extractToolUses(response);

            if (toolUses.length === 0) {
                break;
            }

            // Log tool use decisions
            this.executeLog({
                type: 'log',
                level: 'info',
                category: 'agent',
                message: `Agent selected ${toolUses.length} tool(s): ${toolUses.map(t => t.name).join(', ')}`,
                data: { tools: toolUses.map(t => ({ name: t.name, input: t.input })) }
            });


            // Add assistant message
            messages.push({
                role: 'assistant',
                content: response.content
            });

            // Process tool uses
            const toolResults: any[] = [];

            let dynamicToolConstructed = false;

            for (const toolUse of toolUses) {
                try {
                    const result = await this.handleToolUse(toolUse.name, toolUse.input);

                    // Track transition tools
                    if (toolUse.name.startsWith('transition_to_')) {
                        nextNode = result.target;
                    }

                    // Track if a tool was constructed
                    if (toolUse.name === 'construct_tool' && result.success) {
                        dynamicToolConstructed = true;
                    }

                    // Log successful tool execution
                    // Include reason for transition tools (safely handle undefined result)
                    const reasonSuffix = (result && result.reason) ? `\n  Reason: ${result.reason}` : '';
                    this.executeLog({
                        type: 'log',
                        level: 'info',
                        category: 'tool',
                        message: `✓ ${toolUse.name} executed successfully${reasonSuffix}`,
                        data: { input: toolUse.input, output: result }
                    });

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

                    // Log tool execution error
                    this.executeLog({
                        type: 'log',
                        level: 'error',
                        category: 'tool',
                        message: `✗ ${toolUse.name} failed: ${errorMessage}`,
                        data: { input: toolUse.input, error: errorMessage }
                    });

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

            // If a dynamic tool was constructed, refresh the tool list for next iteration
            if (dynamicToolConstructed && this.metaToolManager) {
                const dynamicTools = this.metaToolManager.getDynamicToolDefinitions();
                // Merge dynamic tools with existing tools (avoiding duplicates)
                const existingToolNames = new Set(tools.map(t => t.name));
                for (const dynamicTool of dynamicTools) {
                    if (!existingToolNames.has(dynamicTool.name)) {
                        // Cast to runtime ToolDefinition type
                        const runtimeTool = {
                            name: dynamicTool.name,
                            description: dynamicTool.description,
                            input_schema: {
                                type: 'object' as const,
                                properties: dynamicTool.input_schema.properties,
                                required: dynamicTool.input_schema.required
                            }
                        };
                        tools.push(runtimeTool);
                        this.executeLog({
                            type: 'log',
                            level: 'info',
                            category: 'tool',
                            message: `➕ Added dynamic tool '${dynamicTool.name}' to available tools`,
                            data: { tool: dynamicTool.name }
                        });
                    }
                }
            }

            // If we got a transition, stop
            if (nextNode) {
                break;
            }
        }

        // Log final result
        this.executeLog({
            type: 'log',
            level: 'info',
            category: 'agent',
            message: `Agent completed with ${toolExecutions.length} tool execution(s)${nextNode ? `, transitioning to: ${nextNode}` : ''}`,
            data: {
                toolExecutions: toolExecutions.length,
                nextNode,
                outputLength: finalText.length
            }
        });

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

        // Async spawn tools
        if (toolName.startsWith('spawn_async_to_')) {
            const target = toolName.replace('spawn_async_to_', '');

            if (!this.currentState) {
                throw new Error('No execution state available for async spawn');
            }

            // Find the current path (we need its ID for tracking spawn relationships)
            const activePaths = this.currentState.paths.filter(p => p.status === 'active');
            const sourcePathId = activePaths.length > 0 ? activePaths[0].id : undefined;

            // Spawn the new path
            const newState = spawnPath(this.currentState, target, sourcePathId);
            const newPathId = newState.paths[newState.paths.length - 1].id;

            // Update our internal state reference (the actual state mutation
            // will be applied by the executor after receiving the AgentResult)
            this.currentState = newState;

            this.executeLog({
                type: 'log',
                level: 'info',
                category: 'async',
                message: `Spawned async path ${newPathId} to ${target}`,
                data: { sourcePathId, newPathId, target, reason: input.reason }
            });

            // For now, we implement fire-and-forget semantics
            // TODO: Implement await_result semantics if input.await_result is true
            return {
                success: true,
                action: 'spawn_async',
                pathId: newPathId,
                target,
                status: 'spawned',
                reason: input.reason || 'agent spawned async path'
            };
        }

        // Map spawn tools - spawn one path per item in an array
        if (toolName.startsWith('map_spawn_to_')) {
            const target = toolName.replace('map_spawn_to_', '');

            if (!this.currentState) {
                throw new Error('No execution state available for map spawn');
            }

            // Get the source array from context
            // Use provided source or find from edge annotation
            let source = input.source;

            if (!source) {
                // Find the map annotation on the edge to get default source
                const edge = this.currentState.machineSnapshot.edges.find(e =>
                    e.target === target && e.annotations?.some(a =>
                        ['map', 'foreach', 'each'].includes(a.name.toLowerCase())
                    )
                );

                if (edge) {
                    const mapConfig = getMapAnnotation(edge);
                    source = mapConfig?.source;
                }
            }

            if (!source) {
                return {
                    success: false,
                    action: 'map_spawn',
                    error: 'No source array specified. Provide source parameter or define in @map annotation.'
                };
            }

            // Resolve the source array from context
            let items: any[];
            try {
                items = resolveQualifiedName(this.currentState, source);
            } catch (e: any) {
                return {
                    success: false,
                    action: 'map_spawn',
                    error: `Failed to resolve source "${source}": ${e.message}`
                };
            }

            if (!Array.isArray(items)) {
                return {
                    success: false,
                    action: 'map_spawn',
                    error: `Source "${source}" is not an array (got ${typeof items})`
                };
            }

            // Find the current path for tracking spawn relationships
            const activePaths = this.currentState.paths.filter(p => p.status === 'active');
            const sourcePathId = activePaths.length > 0 ? activePaths[0].id : 'path_0';

            // Generate group ID for barrier coordination
            const groupId = source.replace(/\./g, '_');

            // Spawn paths
            const pathCountBefore = this.currentState.paths.length;
            const newState = spawnMappedPaths(
                this.currentState,
                target,
                sourcePathId,
                items,
                source,
                groupId
            );

            const spawnedCount = newState.paths.length - pathCountBefore;
            const spawnedPathIds = newState.paths.slice(pathCountBefore).map(p => p.id);

            // Update our internal state reference
            this.currentState = newState;

            this.executeLog({
                type: 'log',
                level: 'info',
                category: 'map',
                message: `Spawned ${spawnedCount} paths to ${target} from ${source}`,
                data: { sourcePathId, spawnedPathIds, target, source, groupId, reason: input.reason }
            });

            return {
                success: true,
                action: 'map_spawn',
                pathIds: spawnedPathIds,
                target,
                source,
                groupId,
                itemCount: items.length,
                status: 'spawned',
                reason: input.reason || 'agent spawned map paths'
            };
        }

        // Context read
        if (toolName.startsWith('read_')) {
            const contextName = toolName.replace('read_', '');

            // Read from current execution state
            if (!this.currentState) {
                throw new Error('No execution state available for context read');
            }

            const contextValues = getContextValues(this.currentState, contextName);

            // Filter to requested fields if specified
            const fields = input.fields;
            const data = fields && Array.isArray(fields)
                ? Object.fromEntries(fields.map(f => [f, contextValues[f]]))
                : contextValues;

            this.executeLog({
                type: 'log',
                level: 'debug',
                category: 'context',
                message: `Read from context ${contextName}`,
                data: { values: data, fields }
            });

            return {
                success: true,
                context: contextName,
                data
            };
        }

        // Context write
        if (toolName.startsWith('write_')) {
            const contextName = toolName.replace('write_', '');
            const dataToWrite = input.data || {};

            // Log the write operation
            this.executeLog({
                type: 'log',
                level: 'debug',
                category: 'context',
                message: `Write to context ${contextName}`,
                data: { values: dataToWrite }
            });

            // Return the write operation details
            // The actual state mutation will be applied by the executor
            // after receiving the AgentResult
            return {
                success: true,
                action: 'context_write',
                context: contextName,
                written: Object.keys(dataToWrite),
                values: dataToWrite
            };
        }

        // Meta tools - delegate to MetaToolManager if available
        if (this.metaToolManager) {
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

                case 'add_node':
                case 'add_edge':
                    // Legacy tools - provide guidance to use update_definition instead
                    return {
                        success: false,
                        message: `'${toolName}' is deprecated. Use 'get_machine_definition' to see current structure, then 'update_definition' to make changes.`
                    };
            }

            // Check if it's a dynamically constructed tool
            const dynamicTool = this.metaToolManager.getDynamicTool(toolName);
            if (dynamicTool) {
                return await this.metaToolManager.executeDynamicTool(toolName, input);
            }
        }

        throw new Error(`Unknown tool: ${toolName}`);
    }

    /**
     * Set MetaToolManager for meta tool execution
     */
    setMetaToolManager(manager: MetaToolManager): void {
        this.metaToolManager = manager;
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
