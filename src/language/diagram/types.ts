/**
 * Types for Diagram Generation
 *
 * This module defines the interfaces and types used for generating
 * diagrams from JSON machine definitions.
 */

/**
 * Flexible machine JSON that accepts both Langium AST nodes and simplified runtime nodes
 * We use a flexible structure to support both the Langium AST format and simplified runtime format
 */
export interface MachineJSON {
    title?: string;
    attributes?: Array<{
        name: string;
        value: any;
        type?: string;
    }>;
    annotations?: Array<{
        name: string;
        value?: string;
    }>;
    nodes: any[]; // Flexible to accept both Node[] from AST and simplified runtime nodes
    edges: any[]; // Flexible to accept both Edge[] from AST and simplified runtime edges
    notes?: any[];
    inferredDependencies?: any[];
}

/**
 * Options for diagram generation
 */
export interface DiagramOptions {
    /** Show runtime state information */
    showRuntimeState?: boolean;

    /** Show execution path and history */
    showExecutionPath?: boolean;

    /** Show visit counts for nodes and edges */
    showVisitCounts?: boolean;

    /** Show runtime values in context nodes */
    showRuntimeValues?: boolean;

    /** Optimize for mobile display */
    mobileOptimized?: boolean;

    /** Custom title override */
    title?: string;

    /** Runtime context for template interpolation */
    runtimeContext?: RuntimeContext;

    /** Validation context with warnings to visualize */
    validationContext?: any; // Import would create circular dependency, use any for now

    /** Show validation warnings in diagram */
    showValidationWarnings?: boolean;

    /** Warning visualization mode: 'inline' shows in node styling, 'notes' creates note nodes, 'both' does both */
    warningMode?: 'inline' | 'notes' | 'both' | 'none';

    /** Minimum severity to display (error, warning, info, hint) */
    minSeverity?: 'error' | 'warning' | 'info' | 'hint';
}


/**
 * Runtime execution context for visualization
 */
export interface RuntimeContext {
    /** Current executing node */
    currentNode: string;

    /** Current task node (for permission tracking) */
    currentTaskNode?: string;

    /** Active state node */
    activeState?: string;

    /** Count of errors during execution */
    errorCount: number;

    /** Set of nodes that have been visited */
    visitedNodes: Set<string>;

    /** Node attributes/context values */
    attributes: Map<string, any>;

    /** Execution history with transitions */
    history: Array<{
        from: string;
        to: string;
        transition: string;
        timestamp: string;
        output?: string;
    }>;

    /** Count of how many times each node was invoked */
    nodeInvocationCounts?: Map<string, number>;

    /** State transition history for cycle detection */
    stateTransitions?: Array<{
        state: string;
        timestamp: string;
    }>;
}

/**
 * Node state for runtime visualization
 */
export interface RuntimeNodeState {
    name: string;
    type?: string;
    status: 'current' | 'visited' | 'pending';
    visitCount: number;
    lastVisited?: string;
    runtimeValues?: Record<string, any>;
    attributes?: Array<{
        name: string;
        type?: string;
        value: any;
        runtimeValue?: any;
    }>;
}

/**
 * Edge state for runtime visualization
 */
export interface RuntimeEdgeState {
    source: string;
    target: string;
    label?: string;
    traversalCount: number;
    lastTraversed?: string;
    runtimeData?: Record<string, any>;
}

/**
 * Type hierarchy structure for organizing nodes by type
 */
export interface TypeHierarchy {
    [key: string]: {
        nodes: any[];
        subtypes: string[];
    };
}

/**
 * Semantic hierarchy structure for organizing nodes by parent-child relationships
 * This preserves the lexical nesting structure from the DSL
 */
export interface SemanticHierarchy {
    [nodeName: string]: {
        node: any;
        children: string[];
    };
}
