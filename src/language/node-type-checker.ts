/**
 * Node Type Checker - Shared utilities for node type checking
 *
 * Provides centralized, consistent logic for determining node types throughout the codebase.
 * Eliminates duplication and ensures consistent behavior across executors, validators, and builders.
 *
 * Supports optional types: When a node doesn't have an explicit type, the system infers the type
 * based on attributes, naming patterns, and graph structure.
 */

import type { Node as ASTNode } from './generated/ast.js';
import { extractValueFromAST } from './utils/ast-helpers.js';
import { getEdgeSearchText, getEdgeValue } from './utils/edge-utils.js';

/**
 * Minimal node interface that works with both Langium AST nodes and simple objects
 */
export interface NodeLike {
    name: string;
    type?: string;
    attributes?: Array<{
        name: string;
        type?: string;
        value?: any;
    }>;
}

/**
 * Minimal edge interface for dependency checking
 */
export interface EdgeLike {
    source: string;
    target: string;
    type?: string;
    label?: string;
    arrowType?: string;
    annotations?: Array<{ name: string; value?: any }>;
    value?: Record<string, any>;
    attributes?: Record<string, any>;
}

/**
 * Node types that can be inferred
 */
export type InferredNodeType = 'task' | 'state' | 'context' | 'init' | 'tool' | 'end' | undefined;

/**
 * Node Type Checker - Static utilities for node type identification
 */
export class NodeTypeChecker {
    /**
     * Get the effective type of a node (explicit or inferred)
     * This is the primary method to use when checking node types
     *
     * @param node The node to check
     * @param edges Optional edges for graph-based inference (init nodes)
     * @returns The node type (explicit or inferred)
     */
    static getNodeType(node: NodeLike | ASTNode, edges?: EdgeLike[]): InferredNodeType {
        // If explicit type is provided, use it
        if (node.type) {
            const type = node.type.toLowerCase();
            // Normalize context aliases to 'context' for backward compatibility
            if (type === 'data' || type === 'input' || type === 'output' || type === 'result' || type === 'entity' || type === 'resource') {
                return 'context';
            }
            return type as InferredNodeType;
        }

        // Otherwise infer the type
        return this.inferType(node, edges);
    }

    /**
     * Infer node type from attributes, naming, and graph structure
     *
     * Inference rules (in priority order):
     * 1. Has 'prompt' attribute → task
     * 2. Has tool-like attributes (input/output schema) → tool
     * 3. Name matches context patterns OR has only data attributes → context
     * 4. No incoming edges + has outgoing edges → init (requires edges parameter)
     * 5. Default → state (control flow node)
     *
     * @param node The node to infer type for
     * @param edges Optional edges for graph-based inference
     * @returns Inferred node type
     */
    static inferType(node: NodeLike | ASTNode, edges?: EdgeLike[]): InferredNodeType {
        const attrs = this.getAttributes(node);
        const name = node.name.toLowerCase();

        // 1. Has prompt → task
        if (attrs.prompt !== undefined) {
            return 'task';
        }

        // 2. Has tool schema attributes → tool
        if (this.hasToolSchemaAttributes(attrs)) {
            return 'tool';
        }

        // 3. Name-based context detection OR only has data attributes → context
        if (this.matchesContextNamingPattern(name) || this.hasOnlyDataAttributes(attrs)) {
            return 'context';
        }

        // 4. Graph structure: no incoming edges + has outgoing edges → init
        if (edges && this.hasInitGraphStructure(node.name, edges)) {
            return 'init';
        }

        // // 4. Graph structure: no outgoing edges + has incoming edges → end
        // if (edges && !this.hasOutgoingGraphStructure(node.name, edges)) {
        //     return 'end';
        // }

        // 5. No type can be inferred - return undefined
        // Untyped nodes are first-class citizens and should be handled explicitly by consumers
        return undefined;
    }

    /**
     * Check if attributes suggest a tool definition
     */
    private static hasToolSchemaAttributes(attrs: Record<string, any>): boolean {
        // Tool nodes typically have schema-like attributes
        const toolIndicators = ['input', 'output', 'parameters', 'schema', 'returns'];
        return toolIndicators.some(indicator => attrs[indicator] !== undefined);
    }

    /**
     * Check if name matches context naming patterns
     * Note: "state" alone is not a context indicator, but "appState", "userState" etc. are
     */
    private static matchesContextNamingPattern(name: string): boolean {
        // Exact match "state" alone should not be considered context
        if (name === 'state') {
            return false;
        }

        return name.includes('context') ||
               name.includes('output') ||
               name.includes('input') ||
               name.includes('data') ||
               name.includes('result') ||
               name.includes('config') ||
               (name.includes('state') && name !== 'state'); // "appState" yes, "state" no
    }

    /**
     * Check if node has only data-like attributes (no executable attributes)
     */
    private static hasOnlyDataAttributes(attrs: Record<string, any>): boolean {
        if (Object.keys(attrs).length === 0) {
            return false; // Empty attributes doesn't mean context
        }

        // Executable indicators (if present, it's not a pure data context)
        const executableIndicators = ['prompt', 'meta', 'condition', 'action'];
        const hasExecutableAttrs = executableIndicators.some(indicator => attrs[indicator] !== undefined);

        return !hasExecutableAttrs;
    }

    /**
     * Check if node has init-like graph structure (no incoming edges, has outgoing)
     */
    private static hasInitGraphStructure(nodeName: string, edges: EdgeLike[]): boolean {
        const hasIncoming = edges.some(edge => edge.target === nodeName);
        const hasOutgoing = edges.some(edge => edge.source === nodeName);

        return !hasIncoming && hasOutgoing;
    }

    /**
     * Check if node has outgoing edges)
     */
    private static hasOutgoingGraphStructure(nodeName: string, edges: EdgeLike[]): boolean {
        return  edges.some(edge => edge.source === nodeName);
    }

    /**
     * Check if a node is a state node
     * State nodes represent discrete states in the state machine
     * Now supports type inference
     */
    static isState(node: NodeLike | ASTNode, edges?: EdgeLike[]): boolean {
        const type = this.getNodeType(node, edges);
        return type === 'state';
    }

    /**
     * Check if a node is a task node
     * Task nodes represent executable tasks that may require LLM invocation
     * Now supports type inference: nodes with 'prompt' attribute are inferred as tasks
     */
    static isTask(node: NodeLike | ASTNode, edges?: EdgeLike[]): boolean {
        const type = this.getNodeType(node, edges);
        return type === 'task';
    }

    /**
     * Check if a node is a context node
     * Context nodes store shared state/data that tasks can read/write
     * Now supports type inference: nodes with context-like names or only data attributes
     */
    static isContext(node: NodeLike | ASTNode, edges?: EdgeLike[]): boolean {
        const type = this.getNodeType(node, edges);
        return type === 'context';
    }

    /**
     * Check if a node is an init node
     * Init nodes are entry points to the state machine
     * Now supports type inference: nodes with no incoming edges and outgoing edges
     */
    static isInit(node: NodeLike | ASTNode, edges?: EdgeLike[]): boolean {
        const type = this.getNodeType(node, edges);
        return type === 'init';
    }

    /**
     * Check if a node is a tool node
     * Tool nodes represent callable tools with input/output schemas
     * Now supports type inference: nodes with schema-like attributes
     */
    static isTool(node: NodeLike | ASTNode, edges?: EdgeLike[]): boolean {
        const type = this.getNodeType(node, edges);
        return type === 'tool';
    }

    /**
     * Check if a node is a style node
     * Style nodes are non-executable metadata that define visual styling rules
     * They are identified by explicit type 'style' or 'Style'
     */
    static isStyleNode(node: NodeLike | ASTNode): boolean {
        return node.type?.toLowerCase() === 'style';
    }

    /**
     * Check if a node requires agent decision
     * A node requires agent decision if:
     * 1. It's a task node with a prompt, OR
     * 2. It has multiple non-automatic outbound edges (branching)
     * 3. State nodes typically don't require agent decisions (automatic transitions)
     *
     * @param node The node to check
     * @param edges All edges in the machine (optional, for branching detection)
     * @param autoAnnotationChecker Optional function to check if an edge is automatic
     */
    static requiresAgentDecision(
        node: NodeLike | ASTNode,
        edges?: EdgeLike[],
        autoAnnotationChecker?: (edge: EdgeLike) => boolean
    ): boolean {
        // Task nodes with prompts require agent decisions
        if (this.isTask(node)) {
            const hasPrompt = node.attributes?.some(attr => attr.name === 'prompt');
            if (hasPrompt) {
                return true;
            }
        }

        // State nodes typically don't require agent decisions
        if (this.isState(node)) {
            return false;
        }

        // Check for multiple non-automatic outbound edges (branching decision)
        if (edges) {
            const outboundEdges = edges.filter(edge => edge.source === node.name);

            // Filter out automatic edges if checker provided
            const nonAutoEdges = autoAnnotationChecker
                ? outboundEdges.filter(edge => !autoAnnotationChecker(edge))
                : outboundEdges;

            return nonAutoEdges.length > 1;
        }

        return false;
    }

    /**
     * Check if a node has meta-programming capabilities
     * Meta nodes can modify the machine structure at runtime
     */
    static hasMeta(node: NodeLike | ASTNode): boolean {
        if (!node.attributes) return false;

        // Cast to any to handle union type safely
        const attrs = node.attributes as any[];
        const metaAttr = attrs.find(attr => attr.name === 'meta');
        if (!metaAttr) return false;

        const value = String(metaAttr.value || '').toLowerCase();
        return value === 'true';
    }

    /**
     * Get node attributes as a key-value object
     * Handles both Langium AST nodes and simple objects
     */
    static getAttributes(node: NodeLike | ASTNode): Record<string, any> {
        if (!node.attributes) return {};

        // Cast to any[] to handle union type safely
        const attrs = node.attributes as any[];
        return attrs.reduce((acc: Record<string, any>, attr: any) => {
            // Extract value using canonical utility
            let value = extractValueFromAST(attr.value);

            // Try to parse JSON strings
            if (typeof value === 'string') {
                try {
                    if ((value.startsWith('{') && value.endsWith('}')) ||
                        (value.startsWith('[') && value.endsWith(']'))) {
                        value = JSON.parse(value);
                    }
                } catch {
                    // Keep original string value
                }
            }

            acc[attr.name] = value;
            return acc;
        }, {} as Record<string, any>);
    }

    /**
     * Check if an edge is a context access edge
     * Context access edges connect tasks to context nodes for read/write operations
     */
    static isContextAccessEdge(edge: EdgeLike, sourceNode: NodeLike | ASTNode, targetNode: NodeLike | ASTNode): boolean {
        // Edge from task to context
        if (this.isTask(sourceNode) && this.isContext(targetNode)) {
            return true;
        }

        // Edge from context to task (read-only access)
        if (this.isContext(sourceNode) && this.isTask(targetNode)) {
            return true;
        }

        return false;
    }

    /**
     * Determine permissions from an edge label/type
     * Used for context access control
     */
    static extractPermissionsFromEdge(edge: EdgeLike): {
        canRead: boolean;
        canWrite: boolean;
        canStore: boolean;
        fields?: string[];
    } {
        const metadata = getEdgeValue(edge as any) ?? {};
        const searchText = getEdgeSearchText(edge as any);

        const permissions = {
            canRead: false,
            canWrite: false,
            canStore: false,
            fields: undefined as string[] | undefined
        };

        const lowerSearch = searchText.toLowerCase();
        const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(metadata, key) ||
            Object.prototype.hasOwnProperty.call(metadata, key.toLowerCase()) ||
            Object.prototype.hasOwnProperty.call(metadata, key.charAt(0).toUpperCase() + key.slice(1));

        if (lowerSearch.match(/\bread\b|\bfetch\b|\bget\b|\bload\b/) || hasKey('read')) {
            permissions.canRead = true;
        }

        if (lowerSearch.match(/\bwrite\b|\bupdate\b|\bset\b|\bcalculate\b/) ||
            hasKey('write') || hasKey('update') || hasKey('set') || hasKey('calculate')) {
            permissions.canWrite = true;
        }

        if (lowerSearch.match(/\bstore\b|\bpersist\b|\bsave\b/) || hasKey('store')) {
            permissions.canStore = true;
        }

        // If no specific permissions, default to read-only access
        if (!permissions.canRead && !permissions.canWrite && !permissions.canStore) {
            permissions.canRead = true;
        }

        const fieldSet = new Set<string>();
        const collectFields = (raw: unknown) => {
            if (raw === undefined || raw === null) return;
            if (Array.isArray(raw)) {
                raw.forEach(value => collectFields(value));
                return;
            }
            const text = String(raw);
            text.split(',').forEach(part => {
                const trimmed = part.trim();
                if (trimmed) {
                    fieldSet.add(trimmed);
                }
            });
        };

        const candidates = ['write', 'read', 'store', 'update', 'set', 'calculate'];
        for (const key of candidates) {
            if (hasKey(key)) {
                const value = (metadata as any)[key] ?? (metadata as any)[key.toLowerCase()] ?? (metadata as any)[key.charAt(0).toUpperCase() + key.slice(1)];
                collectFields(value);
            }
        }

        if (fieldSet.size > 0) {
            permissions.fields = Array.from(fieldSet);
        }

        return permissions;
    }

    /**
     * Check if a node has a specific annotation
     * Annotations are decorator-like metadata on nodes (e.g., @Async, @Singleton)
     */
    static hasAnnotation(node: ASTNode, annotationName: string): boolean {
        if (!('annotations' in node)) return false;
        const annotations = (node as any).annotations as Array<{ name: string }> | undefined;
        return annotations?.some(a => a.name === annotationName) || false;
    }

    /**
     * Get all annotations on a node
     */
    static getAnnotations(node: ASTNode): Array<{ name: string; value?: any }> {
        if (!('annotations' in node)) return [];
        return ((node as any).annotations as Array<{ name: string; value?: any }> | undefined) || [];
    }
}
