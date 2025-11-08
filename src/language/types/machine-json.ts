/**
 * Canonical machine JSON interfaces.
 *
 * These types represent the strongly-typed JSON form generated from the
 * Machine AST and are shared across executors, diagramming, and tooling.
 */

export interface MachineJsonAnnotation {
    name: string;
    value?: string;
    attributes?: Record<string, unknown>;
}

export interface MachineJsonAttribute {
    name: string;
    type?: string;
    value: unknown;
}

export interface MachineJsonNode {
    name: string;
    type?: string;
    title?: string;
    parent?: string;
    attributes: MachineJsonAttribute[];
    annotations?: MachineJsonAnnotation[];
}

export interface MachineJsonEdgeValue {
    text?: string;
    sourceAttribute?: string;
    targetAttribute?: string;
    sourcePort?: string;
    targetPort?: string;
    [key: string]: unknown;
}

export interface MachineJsonEdgeStyle {
    stroke?: string;
    strokeWidth?: string;
    strokeDasharray?: string;
}

export interface MachineJsonEdge {
    source: string;
    target: string;
    value?: MachineJsonEdgeValue;
    attributes?: MachineJsonEdgeValue;
    annotations?: MachineJsonAnnotation[];
    arrowType?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
    roleName?: string;
    sourceAttribute?: string;
    targetAttribute?: string;
    sourcePort?: string;
    targetPort?: string;
    style?: MachineJsonEdgeStyle;
    label?: string;
    type?: string;
}

export interface MachineJsonNote {
    target: string;
    content: string;
    annotations?: MachineJsonAnnotation[];
    attributes?: MachineJsonAttribute[];
}

export interface MachineJsonInferredDependency {
    source: string;
    target: string;
    reason: string;
    path: string;
}

export interface MachineJson {
    title?: string;
    attributes?: MachineJsonAttribute[];
    annotations?: MachineJsonAnnotation[];
    nodes: MachineJsonNode[];
    edges: MachineJsonEdge[];
    notes?: MachineJsonNote[];
    inferredDependencies?: MachineJsonInferredDependency[];
}

export type MachineJSON = MachineJson;
export type Edge = MachineJsonEdge;
export type EdgeStyle = MachineJsonEdgeStyle;
export type NoteInfo = MachineJsonNote;
export type InferredDependency = MachineJsonInferredDependency;
