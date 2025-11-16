/**
 * Shared types for the execution model
 */

/**
 * Edge semantic types
 */
export type EdgeType = 'control' | 'data' | 'dependency' | 'transform';

/**
 * Edge annotation interface
 */
export interface EdgeAnnotation {
    name: string;
    value?: string;
}

/**
 * Node annotation interface
 */
export interface NodeAnnotation {
    name: string;
    value?: string;
    params?: Record<string, any>;
}

/**
 * Error handling strategy
 */
export type ErrorHandlingStrategy = 'fail-fast' | 'continue' | 'compensate';

/**
 * Extended edge with annotation support and semantic types
 */
export interface AnnotatedEdge {
    source: string;
    target: string;
    type?: string;
    label?: string;
    edgeType?: EdgeType;  // Semantic edge type
    annotations?: EdgeAnnotation[];
    priority?: number;  // For @priority annotation
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
    // Path-specific context storage (Phase 3)
    attributes: Map<string, any>;
    contextReads: Set<string>;
    contextWrites: Set<string>;
    errorCount: number;
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
