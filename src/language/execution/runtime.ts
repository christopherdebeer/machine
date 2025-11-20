/**
 * Execution Runtime Interface
 *
 * Functional, immutable execution runtime for DyGram machines.
 * Operates on serialized MachineJSON and produces immutable ExecutionState.
 */

import type { MachineJSON } from '../json/types.js';
import type {
    ExecutionState,
    ExecutionResult,
    ExecutionLimits,
    VisualizationState,
    Checkpoint,
    CheckpointMetadata,
    AgentResult,
    Path
} from './runtime-types.js';

/**
 * Configuration for the execution runtime
 */
export interface RuntimeConfig {
    limits?: Partial<ExecutionLimits>;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Execution Runtime
 *
 * Pure functional interface for machine execution.
 * All methods are pure functions that don't mutate inputs.
 */
export interface ExecutionRuntime {
    /**
     * Create initial execution state from a machine definition
     */
    initialize(machineJSON: MachineJSON, config?: RuntimeConfig): ExecutionState;

    /**
     * Execute a single step of the machine
     * Returns new state and effects to execute
     */
    step(state: ExecutionState): ExecutionResult;

    /**
     * Execute until completion or limit reached
     * Returns array of all states and effects
     */
    execute(
        initialState: ExecutionState,
        effectHandler: (effects: import('./runtime-types.js').Effect[]) => Promise<void>
    ): Promise<ExecutionState>;

    /**
     * Apply agent result to execution state
     * Returns new state after agent decision
     */
    applyAgentResult(state: ExecutionState, pathId: string, result: AgentResult): ExecutionState;

    /**
     * Get visualization-optimized state
     */
    getVisualizationState(state: ExecutionState): VisualizationState;

    /**
     * Create a checkpoint
     */
    createCheckpoint(state: ExecutionState, description?: string): Checkpoint;

    /**
     * Restore state from checkpoint
     */
    restoreCheckpoint(checkpoint: Checkpoint): ExecutionState;

    /**
     * Serialize execution state to JSON
     */
    serializeState(state: ExecutionState): string;

    /**
     * Deserialize execution state from JSON
     */
    deserializeState(json: string): ExecutionState;
}

/**
 * State builder utilities
 */
export interface StateBuilder {
    /**
     * Create a new path in the execution state
     */
    createPath(state: ExecutionState, startNode: string): ExecutionState;

    /**
     * Update path status
     */
    updatePathStatus(state: ExecutionState, pathId: string, status: import('./runtime-types.js').PathStatus): ExecutionState;

    /**
     * Record a transition in a path
     */
    recordTransition(
        state: ExecutionState,
        pathId: string,
        transition: import('./runtime-types.js').Transition
    ): ExecutionState;

    /**
     * Increment node invocation count
     */
    incrementNodeInvocation(state: ExecutionState, pathId: string, nodeName: string): ExecutionState;

    /**
     * Update machine snapshot (for meta-programming)
     */
    updateMachineSnapshot(state: ExecutionState, machineJSON: MachineJSON): ExecutionState;
}

/**
 * Transition evaluation
 */
export interface TransitionEvaluator {
    /**
     * Evaluate automated transitions from a node
     */
    evaluateAutomatedTransitions(
        machineJSON: MachineJSON,
        state: ExecutionState,
        pathId: string
    ): import('./runtime-types.js').Transition | null;

    /**
     * Get non-automated transitions (require agent decision)
     */
    getNonAutomatedTransitions(
        machineJSON: MachineJSON,
        state: ExecutionState,
        pathId: string
    ): Array<{ target: string; description?: string; condition?: string }>;

    /**
     * Check if a node requires agent decision
     */
    requiresAgentDecision(
        machineJSON: MachineJSON,
        nodeName: string
    ): boolean;
}

/**
 * Condition evaluation
 */
export interface ConditionEvaluator {
    /**
     * Evaluate a condition string against execution state
     */
    evaluateCondition(
        condition: string | undefined,
        machineJSON: MachineJSON,
        state: ExecutionState,
        pathId: string
    ): boolean;

    /**
     * Check if condition is simple (deterministic)
     */
    isSimpleCondition(condition: string | undefined): boolean;

    /**
     * Resolve template variables in a string
     */
    resolveTemplate(
        template: string,
        machineJSON: MachineJSON,
        state: ExecutionState
    ): string;
}

/**
 * Effect builder
 */
export interface EffectBuilder {
    /**
     * Build LLM invocation effect
     */
    buildLLMEffect(
        machineJSON: MachineJSON,
        state: ExecutionState,
        pathId: string,
        nodeName: string
    ): import('./runtime-types.js').InvokeLLMEffect;

    /**
     * Build log effect
     */
    buildLogEffect(
        level: 'debug' | 'info' | 'warn' | 'error',
        category: string,
        message: string,
        data?: Record<string, any>
    ): import('./runtime-types.js').LogEffect;

    /**
     * Build checkpoint effect
     */
    buildCheckpointEffect(description?: string): import('./runtime-types.js').CheckpointEffect;

    /**
     * Build complete effect
     */
    buildCompleteEffect(state: ExecutionState): import('./runtime-types.js').CompleteEffect;

    /**
     * Build error effect
     */
    buildErrorEffect(
        error: string,
        pathId?: string,
        nodeName?: string
    ): import('./runtime-types.js').ErrorEffect;
}
