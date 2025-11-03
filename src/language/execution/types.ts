/**
 * Shared types for the execution model
 */

/**
 * Edge annotation interface
 */
export interface EdgeAnnotation {
    name: string;
    value?: string;
}

/**
 * Extended edge with annotation support
 */
export interface AnnotatedEdge {
    source: string;
    target: string;
    type?: string;
    label?: string;
    annotations?: EdgeAnnotation[];
}

/**
 * Transition evaluation result
 */
export interface TransitionEvaluation {
    edge: AnnotatedEdge;
    target: string;
    condition?: string;
    isAutomatic: boolean;
    reason: string;
}

/**
 * Path state for multi-path execution
 */
export type PathState = 'active' | 'waiting' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution path tracking
 */
export interface ExecutionPath {
    id: string;
    currentNode: string;
    history: Array<{
        from: string;
        to: string;
        transition: string;
        timestamp: string;
        output?: string;
    }>;
    status: PathState;
    stepCount: number;
    nodeInvocationCounts: Map<string, number>;
    stateTransitions: Array<{ state: string; timestamp: string }>;
    startTime: number;
}

/**
 * Context access permissions
 */
export interface ContextPermissions {
    canRead: boolean;
    canWrite: boolean;
    canStore: boolean;
    fields?: string[]; // Specific fields allowed (if restricted)
}

/**
 * Context lock for synchronization
 */
export interface ContextLock {
    contextName: string;
    lockedBy?: string; // Path ID
    lockTime?: number;
    version: number;
}

/**
 * Evaluation context for CEL
 */
export interface EvaluationContext {
    errorCount: number;
    activeState: string;
    attributes: Record<string, any>;
}
