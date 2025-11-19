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

/**
 * Machine executor configuration
 */
export interface MachineExecutorConfig {
    llm?: LLMClientConfig;
    limits?: {
        maxSteps?: number;
        maxNodeInvocations?: number;
        timeout?: number;
        cycleDetectionWindow?: number;
    };
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Machine mutation record (for backward compatibility)
 */
export interface MachineMutation {
    type: 'add_node' | 'add_edge' | 'modify_node' | 'remove_node' | 'machine_updated';
    timestamp: string;
    data: any;
}

/**
 * Legacy execution context (for backward compatibility with old RailsExecutor API)
 */
export interface LegacyExecutionContext {
    currentNode: string;
    errorCount: number;
    visitedNodes: Set<string>;
    attributes: Map<string, any>;
    history: Array<{
        from: string;
        to: string;
        transition: string;
        timestamp: string;
        output?: string;
    }>;
}

/**
 * Machine Executor
 *
 * High-level API for machine execution.
 * Provides backward compatibility with old RailsExecutor API.
 */
export class MachineExecutor {
    private runtime = createExecutionRuntime();
    private effectExecutor: EffectExecutor;
    private currentState: ExecutionState;
    private llmClient?: ClaudeClient;
    private mutations: MachineMutation[] = [];
    private machineUpdateCallback?: (dsl: string, machineData: MachineJSON) => Promise<void>;

    constructor(
        machineJSON: MachineJSON,
        config: MachineExecutorConfig = {}
    ) {
        // Initialize state
        this.currentState = this.runtime.initialize(machineJSON, {
            limits: config.limits,
            logLevel: config.logLevel
        });

        // Initialize effect executor
        this.effectExecutor = new EffectExecutor({
            llmClient: config.llm ? undefined : undefined, // Will be set in create()
        });
    }

    /**
     * Create executor with async LLM client
     */
    static async create(
        machineJSON: MachineJSON,
        config: MachineExecutorConfig = {}
    ): Promise<MachineExecutor> {
        const executor = new MachineExecutor(machineJSON, config);

        if (config.llm) {
            executor.llmClient = await createLLMClient(config.llm);
            executor.effectExecutor = new EffectExecutor({
                llmClient: executor.llmClient
            });
        }

        return executor;
    }

    /**
     * Execute a single step
     */
    async step(): Promise<boolean> {
        const result = this.runtime.step(this.currentState);

        // Execute effects
        const agentResult = await this.effectExecutor.execute(result.effects);

        // Apply agent result if present
        if (agentResult && agentResult.nextNode) {
            const activePath = this.currentState.paths.find(p => p.status === 'active');
            if (activePath) {
                this.currentState = this.runtime.applyAgentResult(
                    result.nextState,
                    activePath.id,
                    agentResult
                );
            }
        } else {
            this.currentState = result.nextState;
        }

        return result.status === 'continue' || result.status === 'waiting';
    }

    /**
     * Execute until completion
     * Returns legacy context format for backward compatibility
     */
    async execute(): Promise<LegacyExecutionContext> {
        while (true) {
            const continued = await this.step();
            if (!continued) {
                break;
            }
        }

        // Return in legacy format
        return this.getContext();
    }

    /**
     * Get current execution state
     */
    getState(): ExecutionState {
        return this.currentState;
    }

    /**
     * Get execution context in legacy format (backward compatibility)
     * Converts new ExecutionState to old context shape
     */
    getContext(): LegacyExecutionContext {
        // Use first path for backward compatibility
        const path = this.currentState.paths[0];

        // Build visitedNodes set from history
        const visitedNodes = new Set<string>();
        path.history.forEach(h => {
            visitedNodes.add(h.from);
            visitedNodes.add(h.to);
        });

        // Build attributes map from machine snapshot
        const attributes = new Map<string, any>();
        this.currentState.machineSnapshot.nodes.forEach(node => {
            if (node.attributes) {
                node.attributes.forEach(attr => {
                    attributes.set(`${node.name}.${attr.name}`, attr.value);
                });
            }
        });

        return {
            currentNode: path.currentNode,
            errorCount: this.currentState.metadata.errorCount,
            visitedNodes,
            attributes,
            history: path.history
        };
    }

    /**
     * Get visualization state
     */
    getVisualizationState(): VisualizationState {
        return this.runtime.getVisualizationState(this.currentState);
    }

    /**
     * Set machine update callback (backward compatibility)
     * Called when machine definition is modified during execution
     */
    setMachineUpdateCallback(callback: (dsl: string, machineData: MachineJSON) => Promise<void>): void {
        this.machineUpdateCallback = callback;
    }

    /**
     * Get mutations (backward compatibility)
     * Returns array of machine mutations that occurred during execution
     */
    getMutations(): MachineMutation[] {
        return this.mutations;
    }

    /**
     * Record a mutation (internal use)
     */
    private recordMutation(mutation: Omit<MachineMutation, 'timestamp'>): void {
        this.mutations.push({
            ...mutation,
            timestamp: new Date().toISOString()
        });
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
export type { MachineJSON, ExecutionState, VisualizationState, Checkpoint, LegacyExecutionContext, MachineMutation };
