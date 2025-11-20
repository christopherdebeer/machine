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
