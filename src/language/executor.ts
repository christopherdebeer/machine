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
            this.logger.info('sync', 'Executor machine udpate callback called.', {dsl, machineData})
            // Update the machine snapshot in the current state
            this.currentState.machineSnapshot = machineData;

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
        if (this.onStateChange) {
            this.onStateChange();
        }

        return result.status === 'continue' || result.status === 'waiting';
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

        this.currentState = {
            ...stepResult.nextState,
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
