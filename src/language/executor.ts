/**
 * Machine Executor - Main Entry Point
 *
 * High-level API for executing DyGram machines.
 * Wraps the functional execution runtime with a familiar interface.
 * Provides backward compatibility with old RailsExecutor API.
 */

import type { MachineJSON } from './json/types.js';
import type {
    ExecutionState,
    ExecutionResult,
    VisualizationState,
    Checkpoint,
    AgentResult,
    Effect,
    InvokeLLMEffect
} from './execution/runtime-types.js';
import { createExecutionRuntime } from './execution/execution-runtime.js';
import { EffectExecutor, type EffectExecutorConfig } from './execution/effect-executor.js';
import { ExecutionLogger, LogCategory, type LogEntry } from './execution/logger.js';
import type { RuntimeConfig } from './execution/runtime.js';
import { ClaudeClient } from './claude-client.js';
import { createLLMClient, type LLMClientConfig } from './llm-client.js';
import { MetaToolManager } from './meta-tool-manager.js';
import { updateContextState } from './execution/state-builder.js';
import { TurnExecutor } from './execution/turn-executor.js';
import type { TurnStepResult, TurnState } from './execution/turn-types.js';

/**
 * Machine executor configuration
 */
export interface MachineExecutorConfig {
    llm?: LLMClientConfig | ClaudeClient;  // Accept config or pre-initialized client
    limits?: {
        maxSteps?: number;
        maxNodeInvocations?: number;
        timeout?: number;
        cycleDetectionWindow?: number;
    };
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    vfs?: {
        writeFile(path: string, content: string): void;
        readFile(path: string): string | undefined;
        exists(path: string): boolean;
    };
}


/**
 * Machine Executor
 *
 * High-level API for machine execution.
 * Wraps the functional execution runtime with a stateful interface.
 */
export class MachineExecutor {
    private runtime = createExecutionRuntime();
    private effectExecutor: EffectExecutor;
    private currentState: ExecutionState;
    private llmClient?: ClaudeClient;
    private metaToolManager: MetaToolManager;
    private mutations: any[] = [];
    private machineUpdateCallback?: (dsl: string) => void;
    private logger: ExecutionLogger;
    private onStateChange?: () => void;
    private pauseRequested: boolean = false;

    constructor(
        machineJSON: MachineJSON,
        config: MachineExecutorConfig = {}
    ) {
        // Initialize logger FIRST so it's available for everything else
        this.logger = new ExecutionLogger({
            level: config.logLevel || 'info',
            maxEntries: 1000
        });

        // Initialize state
        this.currentState = this.runtime.initialize(machineJSON, {
            limits: config.limits,
            logLevel: config.logLevel
        });

        // Check if llm is a pre-initialized ClaudeClient
        if (config.llm && typeof (config.llm as any).invokeModel === 'function') {
            this.llmClient = config.llm as ClaudeClient;
        }

        // Initialize effect executor with LLM client and logger
        this.effectExecutor = new EffectExecutor({
            llmClient: this.llmClient,
            vfs: config.vfs,
            logHandler: (effect) => {
                // Route all logs through our logger
                this.logger[effect.level](effect.category as LogCategory, effect.message, effect.data);
            }
        });

        // Initialize meta-tool manager with mutation tracking
        this.metaToolManager = new MetaToolManager(
            machineJSON,
            (mutation: any) => {
                this.mutations.push(mutation);
            }
        );

        // Set up internal machine update handler
        this.metaToolManager.setMachineUpdateCallback((dsl: string, machineData: MachineJSON) => {
            this.logger.info('sync', 'Executor machine update callback called.', {dsl, machineData})
            this.logger.info('sync', `Updating machine snapshot with ${machineData.nodes.length} nodes: ${machineData.nodes.map(n => n.name).join(', ')}`);
            // Update the machine snapshot in the current state
            this.currentState.machineSnapshot = machineData;
            this.logger.info('sync', `Machine snapshot updated. Current snapshot now has ${this.currentState.machineSnapshot.nodes.length} nodes`);

            // Call user callback if set
            if (this.machineUpdateCallback) {
                this.machineUpdateCallback(dsl);
            }
        });

        // Initialize tools from machine definition (restores dynamically created tools)
        this.metaToolManager.initializeToolsFromMachine();

        // Wire MetaToolManager to EffectExecutor
        this.effectExecutor.setMetaToolManager(this.metaToolManager);
    }

    /**
     * Create executor with async LLM client initialization
     */
    static async create(
        machineJSON: MachineJSON,
        config: MachineExecutorConfig = {}
    ): Promise<MachineExecutor> {
        // If config.llm is already a ClaudeClient, use constructor directly
        if (config.llm && typeof (config.llm as any).invokeModel === 'function') {
            return new MachineExecutor(machineJSON, config);
        }

        // If config.llm is an LLMClientConfig, create the client first
        if (config.llm) {
            const llmClient = await createLLMClient(config.llm as LLMClientConfig);
            return new MachineExecutor(machineJSON, {
                ...config,
                llm: llmClient
            });
        }

        // No LLM config provided
        return new MachineExecutor(machineJSON, config);
    }

    /**
     * Execute a single step
     */
    async step(): Promise<boolean> {
        const result = this.runtime.step(this.currentState);

        // Execute effects (passing state for context access)
        const agentResults = await this.effectExecutor.execute(result.effects, result.nextState);

        // Apply each agent result to its corresponding path
        let nextState = result.nextState;
        for (const agentResult of agentResults) {
            if (agentResult.nextNode) {
                nextState = this.runtime.applyAgentResult(
                    nextState,
                    agentResult.pathId,
                    agentResult
                );
            }
        }

        // Apply context writes from tool executions
        nextState = this.applyContextWrites(nextState, agentResults);

        this.currentState = nextState;

        // Notify listeners of state change
        this.emitStateChange();

        // Return whether there are still active paths
        return this.currentState.paths.some(p => p.status === 'active');
    }

    /**
     * Execute a single step for one specific path (for per-path debugging)
     * @param pathId The ID of the path to step (e.g., "path_0", "path_1")
     * @returns boolean indicating if there are still active paths
     */
    async stepPath(pathId: string): Promise<boolean> {
        // Find the path to step
        const pathIndex = this.currentState.paths.findIndex(p => p.id === pathId);
        if (pathIndex === -1) {
            throw new Error(`Path ${pathId} not found`);
        }

        const targetPath = this.currentState.paths[pathIndex];
        if (targetPath.status !== 'active') {
            throw new Error(`Path ${pathId} is not active (status: ${targetPath.status})`);
        }

        // Create a temporary state with only the target path active
        const tempState = {
            ...this.currentState,
            paths: this.currentState.paths.map((p, idx) => {
                if (idx === pathIndex) {
                    return p; // Keep target path as-is
                } else if (p.status === 'active') {
                    // Temporarily mark other active paths as waiting
                    return { ...p, status: 'waiting' as const };
                } else {
                    return p;
                }
            })
        };

        // Execute step on the temporary state
        const result = this.runtime.step(tempState);

        // Execute effects for this path only
        const agentResults = await this.effectExecutor.execute(result.effects, result.nextState);

        // Apply agent results
        let nextState = result.nextState;
        for (const agentResult of agentResults) {
            if (agentResult.nextNode) {
                nextState = this.runtime.applyAgentResult(
                    nextState,
                    agentResult.pathId,
                    agentResult
                );
            }
        }

        // Apply context writes
        nextState = this.applyContextWrites(nextState, agentResults);

        // Restore other paths to active status (merge with original state)
        // BUT: preserve status changes made by barriers (e.g., reactivation)
        nextState = {
            ...nextState,
            paths: nextState.paths.map((p, idx) => {
                if (idx === pathIndex) {
                    return p; // Use updated path state
                } else {
                    // Check if this path's status changed during the step (e.g., barrier reactivation)
                    const originalStatus = this.currentState.paths[idx].status;
                    const newStatus = p.status;

                    // If status changed from 'waiting' to 'active', this is likely a barrier release
                    // Preserve this change instead of restoring original status
                    if (originalStatus === 'waiting' && newStatus === 'active') {
                        return p; // Preserve barrier reactivation
                    } else if (originalStatus === 'active' && newStatus === 'waiting') {
                        // This path was temporarily set to 'waiting' for stepPath isolation
                        // Restore to original 'active' status
                        return { ...p, status: originalStatus };
                    } else {
                        // Keep the current status unchanged
                        return p;
                    }
                }
            })
        };

        this.currentState = nextState;

        // Notify listeners of state change
        this.emitStateChange();

        // Return whether there are still active paths
        return this.currentState.paths.some(p => p.status === 'active');
    }

    /**
     * Get the next active path ID (for round-robin path stepping)
     * @param currentPathId The current path ID (optional)
     * @returns The next active path ID, or undefined if no active paths
     */
    getNextActivePathId(currentPathId?: string): string | undefined {
        const activePaths = this.currentState.paths.filter(p => p.status === 'active');
        if (activePaths.length === 0) return undefined;

        if (!currentPathId) {
            return activePaths[0].id;
        }

        const currentIndex = activePaths.findIndex(p => p.id === currentPathId);
        const nextIndex = (currentIndex + 1) % activePaths.length;
        return activePaths[nextIndex].id;
    }

    /**
     * Execute until completion (with optional pause at turn boundaries)
     */
    async execute(): Promise<ExecutionState> {
        while (true) {
            // Check for pause request at turn boundaries
            if (this.pauseRequested && this.isInTurn()) {
                this.logger.info('execution', 'Paused at turn boundary', {
                    turnCount: this.currentState.turnState?.turnCount,
                    nodeName: this.currentState.turnState?.nodeName
                });
                this.pauseRequested = false; // Clear flag
                return this.currentState; // Return control to UI
            }

            const continued = await this.step();
            
            // Yield to event loop to allow UI updates (React state batching)
            // This ensures visualization updates are processed between steps
            await new Promise(resolve => setTimeout(resolve, 0));
            
            if (!continued) {
                break;
            }
        }

        return this.currentState;
    }

    /**
     * Get current execution state
     */
    getState(): ExecutionState {
        return this.currentState;
    }

    /**
     * Set execution state (for resuming from saved state)
     */
    setState(state: ExecutionState): void {
        this.currentState = state;
    }


    /**
     * Get visualization state
     */
    getVisualizationState(): VisualizationState {
        return this.runtime.getVisualizationState(this.currentState);
    }


    /**
     * Create checkpoint
     */
    createCheckpoint(description?: string): Checkpoint {
        return this.runtime.createCheckpoint(this.currentState, description);
    }

    /**
     * Restore from checkpoint
     */
    restoreCheckpoint(checkpoint: Checkpoint): void {
        this.currentState = this.runtime.restoreCheckpoint(checkpoint);
    }

    /**
     * Get machine definition
     */
    getMachineDefinition(): MachineJSON {
        return this.currentState.machineSnapshot;
    }

    /**
     * Get execution context (backward compatibility)
     * Converts ExecutionState to legacy RuntimeContext format
     */
    getContext(): any {
        // Get the first active path (or first path if none active)
        const activePath = this.currentState.paths.find(p => p.status === 'active') || this.currentState.paths[0];

        if (!activePath) {
            return {
                currentNode: '',
                currentTaskNode: undefined,
                activeState: undefined,
                errorCount: this.currentState.metadata.errorCount,
                visitedNodes: new Set<string>(),
                attributes: new Map<string, any>(),
                history: [],
                nodeInvocationCounts: new Map<string, number>(),
                stateTransitions: []
            };
        }

        // Build visited nodes set from history
        const visitedNodes = new Set<string>();
        activePath.history.forEach(t => {
            visitedNodes.add(t.from);
            visitedNodes.add(t.to);
        });
        visitedNodes.add(activePath.currentNode);

        return {
            currentNode: activePath.currentNode,
            currentTaskNode: undefined,  // Legacy field
            activeState: activePath.currentNode,
            errorCount: this.currentState.metadata.errorCount,
            visitedNodes,
            attributes: new Map<string, any>(),
            history: activePath.history,
            nodeInvocationCounts: new Map(Object.entries(activePath.nodeInvocationCounts || {})),
            stateTransitions: activePath.stateTransitions
        };
    }

    /**
     * Get mutations (backward compatibility)
     */
    getMutations(): any[] {
        return this.mutations;
    }

    /**
     * Get meta-tool manager for dynamic tool construction
     */
    getMetaToolManager(): MetaToolManager {
        return this.metaToolManager;
    }

    /**
     * Set callback for machine updates (used by playground)
     */
    setMachineUpdateCallback(callback: (dsl: string) => void): void {
        this.machineUpdateCallback = callback;
        // No need to update metaToolManager callback - it's already set up in constructor
    }

    /**
     * Get machine data (backward compatibility alias)
     */
    getMachineData(): MachineJSON {
        return this.currentState.machineSnapshot;
    }

    /**
     * Get task metrics (backward compatibility)
     */
    getTaskMetrics(): any {
        const activePath = this.currentState.paths.find(p => p.status === 'active') || this.currentState.paths[0];

        return {
            totalSteps: this.currentState.metadata.stepCount,
            nodeInvocationCounts: activePath ? activePath.nodeInvocationCounts : {},
            elapsedTime: this.currentState.metadata.elapsedTime,
            errorCount: this.currentState.metadata.errorCount
        };
    }

    /**
     * Serialize state to JSON
     */
    serializeState(): string {
        return this.runtime.serializeState(this.currentState);
    }

    /**
     * Deserialize state from JSON
     */
    static deserializeState(json: string): ExecutionState {
        const runtime = createExecutionRuntime();
        return runtime.deserializeState(json);
    }

    /**
     * Apply context writes from agent tool executions to state
     */
    private applyContextWrites(state: ExecutionState, agentResults: AgentResult[]): ExecutionState {
        let newState = state;

        for (const agentResult of agentResults) {
            for (const toolExec of agentResult.toolExecutions) {
                // Check if this is a context write operation
                if (toolExec.success && toolExec.output?.action === 'context_write') {
                    const contextName = toolExec.output.context;
                    const values = toolExec.output.values || {};

                    // Apply the context write to state
                    newState = updateContextState(newState, contextName, values);

                    this.logger.info('context', `Context write applied: ${contextName}`, { values });
                }
            }
        }

        return newState;
    }

    /**
     * Get logger instance
     */
    getLogger(): ExecutionLogger {
        return this.logger;
    }

    /**
     * Get all log entries (for UI display)
     */
    getLogs(): LogEntry[] {
        return this.logger.getEntries();
    }

    /**
     * Set log level dynamically
     */
    setLogLevel(level: 'debug' | 'info' | 'warn' | 'error' | 'none'): void {
        this.logger.setLevel(level);
    }

    /**
     * Clear logs
     */
    clearLogs(): void {
        this.logger.clear();
    }

    /**
     * Set callback for state changes (for reactive UI updates)
     */
    setOnStateChangeCallback(callback?: () => void): void {
        this.onStateChange = callback;
    }

    /**
     * Emit state change event to listeners
     */
    private emitStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange();
        }
    }

    /**
     * Execute a single turn (fine-grained stepping within agent nodes)
     * 
     * This enables stepping through individual LLM invocations and tool uses
     * within a single agent node execution.
     */
    async stepTurn(): Promise<TurnStepResult> {
        if (!this.llmClient) {
            return {
                status: 'error',
                error: 'LLM client not configured',
                toolExecutions: [],
                text: ''
            };
        }

        // Check if we're already in a turn
        if (this.currentState.turnState) {
            return this.continueTurn();
        }

        // Start a new turn
        return this.beginTurn();
    }

    /**
     * Begin a new turn for the current active node
     */
    private async beginTurn(): Promise<TurnStepResult> {
        if (!this.llmClient) {
            return {
                status: 'error',
                error: 'LLM client not configured',
                toolExecutions: [],
                text: ''
            };
        }

        // Get the current step result to find LLM effects
        const stepResult = this.runtime.step(this.currentState);

        // Find the first invoke_llm effect
        const llmEffect = stepResult.effects.find(e => e.type === 'invoke_llm') as InvokeLLMEffect | undefined;

        if (!llmEffect) {
            // No LLM invocation needed, just execute the step normally
            this.logger.info('turn', 'No LLM invocation needed, executing step normally');
            await this.step();
            return {
                status: 'complete',
                toolExecutions: [],
                text: ''
            };
        }

        // Create turn executor
        const turnExecutor = new TurnExecutor(
            this.llmClient,
            (toolName: string, input: any) => this.effectExecutor['handleToolUse'](toolName, input),
            { maxTurns: 50 }
        );

        // Set up turn executor
        turnExecutor.setMetaToolManager(this.metaToolManager);
        turnExecutor.setCurrentState(stepResult.nextState);
        turnExecutor.setLogHandler((level, category, message, data) => {
            this.logger[level as 'debug' | 'info' | 'warn' | 'error'](category as LogCategory, message, data);
        });

        // Inject dynamic tools into the effect before initializing conversation
        const dynamicTools = this.metaToolManager.getDynamicToolDefinitions();
        this.logger.debug('turn', `Dynamic tools available: ${dynamicTools.length}`, {
            toolNames: dynamicTools.map(t => t.name)
        });
        if (dynamicTools.length > 0) {
            // Cast to runtime ToolDefinition type
            const runtimeTools = dynamicTools.map(dt => ({
                name: dt.name,
                description: dt.description,
                input_schema: {
                    type: 'object' as const,
                    properties: dt.input_schema.properties,
                    required: dt.input_schema.required
                }
            }));
            llmEffect.tools = [...llmEffect.tools, ...runtimeTools];
            this.logger.debug('turn', `Injected ${runtimeTools.length} dynamic tools into LLM effect`, {
                beforeCount: llmEffect.tools.length - runtimeTools.length,
                afterCount: llmEffect.tools.length
            });
        }

        // Initialize conversation
        const conversationState = turnExecutor.initializeConversation(llmEffect);

        // Execute first turn
        this.logger.info('turn', `Beginning turn 0 for node: ${llmEffect.nodeName}`);
        const turnResult = await turnExecutor.executeTurn(conversationState, llmEffect.nodeName);

        // Update state with turn state
        const turnState: TurnState = {
            pathId: llmEffect.pathId,
            nodeName: llmEffect.nodeName,
            conversationState: turnResult.conversationState,
            turnCount: 1,
            isWaitingForTurn: !turnResult.isComplete,
            systemPrompt: llmEffect.systemPrompt,
            modelId: llmEffect.modelId
        };

        // Preserve the potentially updated machineSnapshot from meta-tool operations
        const preservedMachineSnapshot = this.currentState.machineSnapshot;
        this.currentState = {
            ...stepResult.nextState,
            machineSnapshot: preservedMachineSnapshot,  // Preserve machine updates
            turnState: turnResult.isComplete ? undefined : turnState
        };

        // Apply context writes
        const agentResult: AgentResult = {
            pathId: llmEffect.pathId,
            output: turnResult.text,
            nextNode: turnResult.nextNode,
            toolExecutions: turnResult.toolExecutions
        };
        this.currentState = this.applyContextWrites(this.currentState, [agentResult]);

        // If complete, apply the agent result
        if (turnResult.isComplete && turnResult.nextNode) {
            this.currentState = this.runtime.applyAgentResult(
                this.currentState,
                llmEffect.pathId,
                agentResult
            );
        }

        // Notify listeners
        if (this.onStateChange) {
            this.onStateChange();
        }

        return {
            status: turnResult.isComplete ? 'complete' : 'continue',
            turnState: turnResult.isComplete ? undefined : turnState,
            nextNode: turnResult.nextNode,
            toolExecutions: turnResult.toolExecutions,
            text: turnResult.text
        };
    }

    /**
     * Continue an existing turn
     */
    private async continueTurn(): Promise<TurnStepResult> {
        if (!this.llmClient || !this.currentState.turnState) {
            return {
                status: 'error',
                error: 'No active turn to continue',
                toolExecutions: [],
                text: ''
            };
        }

        const turnState = this.currentState.turnState;

        // Create turn executor
        const turnExecutor = new TurnExecutor(
            this.llmClient,
            (toolName: string, input: any) => this.effectExecutor['handleToolUse'](toolName, input),
            { maxTurns: 50 }
        );

        // Set up turn executor
        turnExecutor.setMetaToolManager(this.metaToolManager);
        turnExecutor.setCurrentState(this.currentState);
        turnExecutor.setLogHandler((level, category, message, data) => {
            this.logger[level as 'debug' | 'info' | 'warn' | 'error'](category as LogCategory, message, data);
        });

        // Check turn limit
        if (turnExecutor.hasReachedTurnLimit(turnState.turnCount)) {
            this.logger.error('turn', `Turn limit reached (${turnState.turnCount} turns)`);
            return {
                status: 'error',
                error: `Turn limit reached (${turnState.turnCount} turns)`,
                toolExecutions: [],
                text: ''
            };
        }

        // Execute next turn
        this.logger.info('turn', `Continuing turn ${turnState.turnCount} for node: ${turnState.nodeName}`);
        const turnResult = await turnExecutor.executeTurn(
            turnState.conversationState,
            turnState.nodeName
        );

        // Update turn state
        const updatedTurnState: TurnState = {
            ...turnState,
            conversationState: turnResult.conversationState,
            turnCount: turnState.turnCount + 1,
            isWaitingForTurn: !turnResult.isComplete
        };

        this.currentState = {
            ...this.currentState,
            turnState: turnResult.isComplete ? undefined : updatedTurnState
        };

        // Apply context writes
        const agentResult: AgentResult = {
            pathId: turnState.pathId,
            output: turnResult.text,
            nextNode: turnResult.nextNode,
            toolExecutions: turnResult.toolExecutions
        };
        this.currentState = this.applyContextWrites(this.currentState, [agentResult]);

        // If complete, apply the agent result
        if (turnResult.isComplete && turnResult.nextNode) {
            this.currentState = this.runtime.applyAgentResult(
                this.currentState,
                turnState.pathId,
                agentResult
            );
        }

        // Notify listeners
        if (this.onStateChange) {
            this.onStateChange();
        }

        return {
            status: turnResult.isComplete ? 'complete' : 'continue',
            turnState: turnResult.isComplete ? undefined : updatedTurnState,
            nextNode: turnResult.nextNode,
            toolExecutions: turnResult.toolExecutions,
            text: turnResult.text
        };
    }

    /**
     * Check if currently in a turn (for UI state)
     */
    isInTurn(): boolean {
        return !!this.currentState.turnState;
    }

    /**
     * Get current turn state (for UI display)
     */
    getTurnState(): TurnState | undefined {
        return this.currentState.turnState;
    }

    /**
     * Request pause at next turn boundary
     * Execution will pause after the current turn completes
     */
    requestPause(): void {
        this.pauseRequested = true;
        this.logger.info('execution', 'Pause requested - will stop at next turn boundary');
    }

    /**
     * Clear pause request (for resuming execution)
     */
    clearPauseRequest(): void {
        this.pauseRequested = false;
    }

    /**
     * Check if pause has been requested
     */
    isPauseRequested(): boolean {
        return this.pauseRequested;
    }
}

// Re-export types for convenience
export type { MachineJSON, ExecutionState, VisualizationState, Checkpoint };
