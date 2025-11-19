/**
 * Execution Runtime Types
 *
 * Core types for the new functional execution runtime.
 * All types are JSON-serializable (no Maps, Sets, or functions).
 */

import type { MachineJSON } from '../json/types.js';

/**
 * Schema version for execution state
 */
export const EXECUTION_STATE_VERSION = '2.0.0';

/**
 * Path state for execution
 */
export type PathStatus = 'active' | 'waiting' | 'completed' | 'failed' | 'cancelled';

/**
 * Transition record in execution history
 */
export interface Transition {
    from: string;
    to: string;
    transition: string;
    timestamp: string;
    output?: string;
}

/**
 * Execution path (single flow through the machine)
 */
export interface Path {
    id: string;
    currentNode: string;
    status: PathStatus;
    history: Transition[];
    stepCount: number;
    nodeInvocationCounts: Record<string, number>;  // JSON-serializable (was Map)
    stateTransitions: Array<{ state: string; timestamp: string }>;
    startTime: number;
}

/**
 * Execution limits and safety constraints
 */
export interface ExecutionLimits {
    maxSteps: number;
    maxNodeInvocations: number;
    timeout: number;
    cycleDetectionWindow: number;
}

/**
 * Complete execution state (immutable, JSON-serializable)
 */
export interface ExecutionState {
    version: string;                  // Schema version for evolution
    machineSnapshot: MachineJSON;     // Machine state at this point (immutable)
    paths: Path[];                    // All execution paths
    limits: ExecutionLimits;          // Resource constraints
    metadata: {
        stepCount: number;            // Total steps across all paths
        startTime: number;            // Execution start timestamp
        elapsedTime: number;          // Milliseconds elapsed
        errorCount: number;           // Total errors encountered
    };
}

/**
 * Effect types that can be produced by execution
 */
export type EffectType =
    | 'invoke_llm'      // Need to call LLM
    | 'log'             // Logging output
    | 'checkpoint'      // Create checkpoint
    | 'complete'        // Execution complete
    | 'error';          // Execution error

/**
 * Tool definition for LLM invocation
 */
export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * LLM invocation effect
 */
export interface InvokeLLMEffect {
    type: 'invoke_llm';
    pathId: string;
    nodeName: string;
    systemPrompt: string;
    tools: ToolDefinition[];
    modelId?: string;
}

/**
 * Logging effect
 */
export interface LogEffect {
    type: 'log';
    level: 'debug' | 'info' | 'warn' | 'error';
    category: string;
    message: string;
    data?: Record<string, any>;
}

/**
 * Checkpoint effect
 */
export interface CheckpointEffect {
    type: 'checkpoint';
    description?: string;
}

/**
 * Complete effect
 */
export interface CompleteEffect {
    type: 'complete';
    finalState: ExecutionState;
}

/**
 * Error effect
 */
export interface ErrorEffect {
    type: 'error';
    error: string;
    pathId?: string;
    nodeName?: string;
}

/**
 * Union of all effect types
 */
export type Effect =
    | InvokeLLMEffect
    | LogEffect
    | CheckpointEffect
    | CompleteEffect
    | ErrorEffect;

/**
 * Execution result status
 */
export type ExecutionStatus =
    | 'continue'        // Continue execution
    | 'waiting'         // Waiting for external input
    | 'complete'        // Execution finished
    | 'error';          // Execution failed

/**
 * Result of a single execution step
 */
export interface ExecutionResult {
    nextState: ExecutionState;        // New state (never mutates input)
    effects: Effect[];                // Side effects to execute
    status: ExecutionStatus;          // What to do next
}

/**
 * Visualization-optimized state
 */
export interface VisualizationState {
    // Current execution position
    currentNodes: Array<{ pathId: string; nodeName: string }>;

    // Active paths
    activePaths: Array<{
        id: string;
        currentNode: string;
        status: PathStatus;
        stepCount: number;
        history: Transition[];
    }>;

    // Node states overlay
    nodeStates: Record<string, {
        visitCount: number;
        lastVisited?: string;
        isActive: boolean;
        contextValues?: Record<string, any>;
    }>;

    // Execution metadata
    stepCount: number;
    elapsedTime: number;
    errorCount: number;

    // Available transitions
    availableTransitions: Array<{
        fromNode: string;
        toNode: string;
        isAutomatic: boolean;
        condition?: string;
    }>;
}

/**
 * Tool execution result (from agent)
 */
export interface ToolExecutionResult {
    toolName: string;
    input: any;
    output: any;
    success: boolean;
    error?: string;
}

/**
 * Agent execution result
 */
export interface AgentResult {
    output: string;
    nextNode?: string;
    toolExecutions: ToolExecutionResult[];
}

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
    id: string;
    timestamp: string;
    stepCount: number;
    description?: string;
}

/**
 * Full checkpoint (includes state)
 */
export interface Checkpoint {
    id: string;
    timestamp: string;
    state: ExecutionState;
    metadata: CheckpointMetadata;
}
