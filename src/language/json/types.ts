/**
 * JSON representations for Machine language constructs.
 *
 * These types provide a stable contract for executors, visualizers and
 * external integrations that consume Machine programs outside of the DSL.
 * The structures intentionally avoid any Langium AST specific types so the
 * JSON objects can be produced in any environment (browser, CLI, server).
 */

/** Source location information for mapping back to original DSL */
export interface SourceLocationJSON {
    /** Starting line number (1-based) */
    startLine: number;
    /** Starting column number (1-based) */
    startColumn: number;
    /** Ending line number (1-based) */
    endLine: number;
    /** Ending column number (1-based) */
    endColumn: number;
    /** Starting offset in the document (0-based) */
    startOffset: number;
    /** Ending offset in the document (0-based) */
    endOffset: number;
    /** Source file URI or identifier */
    fileUri?: string;
}

/** Machine level attribute entry */
export interface MachineAttributeJSON {
    name: string;
    value: unknown;
    type?: string;
}

/** Annotation applied to a machine, node or edge */
export interface MachineAnnotationJSON {
    name: string;
    value?: string;
    /** Attribute-style parameters exposed as key/value pairs */
    attributes?: Record<string, unknown>;
}

/** Normalized style attributes for machines, nodes, or edges */
export type StyleAttributesJSON = Record<string, unknown>;

/** Styling information attached to an edge */
export interface EdgeStyleJSON {
    stroke?: string;
    strokeWidth?: string;
    strokeDasharray?: string;
    [key: string]: unknown;
}

/** Serialized edge */
export interface MachineEdgeJSON {
    source: string;
    target: string;
    value?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    annotations?: MachineAnnotationJSON[];
    arrowType?: string;
    type?: string;
    label?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
    sourceAttribute?: string;
    targetAttribute?: string;
    sourcePort?: string;
    targetPort?: string;
    roleName?: string;
    style?: EdgeStyleJSON;
    /** Source location for mapping back to DSL */
    sourceLocation?: SourceLocationJSON;
    /** Additional metadata preserved for consumers */
    [key: string]: unknown;
}

/** Serialized node */
export interface MachineNodeJSON {
    name: string;
    type?: string;
    title?: string;
    parent?: string;
    annotations?: MachineAnnotationJSON[];
    attributes?: MachineAttributeJSON[];
    nodes?: MachineNodeJSON[];
    edges?: MachineEdgeJSON[];
    style?: StyleAttributesJSON;
    /** Source location for mapping back to DSL */
    sourceLocation?: SourceLocationJSON;
    /** Additional metadata preserved for consumers */
    [key: string]: unknown;
}

/** Dependency inferred during serialization */
export interface InferredDependencyJSON {
    source: string;
    target: string;
    reason: string;
    path: string;
}

/** Complete JSON representation of a Machine program */
export interface MachineJSON {
    title?: string;
    attributes?: MachineAttributeJSON[];
    annotations?: MachineAnnotationJSON[];
    nodes: MachineNodeJSON[];
    edges: MachineEdgeJSON[];
    inferredDependencies?: InferredDependencyJSON[];
    style?: StyleAttributesJSON;
    metadata?: Record<string, unknown>;
}

export type { MachineJSON as DefaultMachineJSON };
