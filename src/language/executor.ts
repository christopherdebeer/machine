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
    Effect
} from './execution/runtime-types.js';
import { createExecutionRuntime } from './execution/execution-runtime.js';
import { EffectExecutor, type EffectExecutorConfig } from './execution/effect-executor.js';
import type { RuntimeConfig } from './execution/runtime.js';
import { ClaudeClient } from './claude-client.js';
import { createLLMClient, type LLMClientConfig } from './llm-client.js';
import { MetaToolManager } from './meta-tool-manager.js';

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

    constructor(
        machineJSON: MachineJSON,
        config: MachineExecutorConfig = {}
    ) {
        // Initialize state
        this.currentState = this.runtime.initialize(machineJSON, {
            limits: config.limits,
            logLevel: config.logLevel
        });

        // Check if llm is a pre-initialized ClaudeClient
        if (config.llm && typeof (config.llm as any).invokeModel === 'function') {
            this.llmClient = config.llm as ClaudeClient;
        }

        // Initialize effect executor with LLM client if available
        this.effectExecutor = new EffectExecutor({
            llmClient: this.llmClient,
            vfs: config.vfs
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
            // Update the machine snapshot in the current state
            this.currentState.machineSnapshot = machineData;

            // Call user callback if set
            if (this.machineUpdateCallback) {
                this.machineUpdateCallback(dsl);
            }
        });
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

        // Execute effects
        const agentResults = await this.effectExecutor.execute(result.effects);

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
        this.currentState = nextState;

        return result.status === 'continue' || result.status === 'waiting';
    }

    /**
     * Execute until completion
     */
    async execute(): Promise<ExecutionState> {
        while (true) {
            const continued = await this.step();
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
}

// Re-export types for convenience
export type { MachineJSON, ExecutionState, VisualizationState, Checkpoint };
