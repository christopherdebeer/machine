/**
 * Node Type Checker - Shared utilities for node type checking
 *
 * Provides centralized, consistent logic for determining node types throughout the codebase.
 * Eliminates duplication and ensures consistent behavior across executors, validators, and builders.
 */

import type { Node as ASTNode } from './generated/ast.js';
import { extractValueFromAST } from './utils/ast-helpers.js';

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
}

/**
 * Node Type Checker - Static utilities for node type identification
 */
export class NodeTypeChecker {
    /**
     * Check if a node is a state node
     * State nodes represent discrete states in the state machine
     */
    static isState(node: NodeLike | ASTNode): boolean {
        return node.type?.toLowerCase() === 'state';
    }

    /**
     * Check if a node is a task node
     * Task nodes represent executable tasks that may require LLM invocation
     * A node is considered a task if:
     * 1. It has type 'task', OR
     * 2. It has a 'prompt' attribute (indicating LLM task)
     */
    static isTask(node: NodeLike | ASTNode): boolean {
        const isTaskType = node.type?.toLowerCase() === 'task';
        const hasPrompt = node.attributes?.some(attr => attr.name === 'prompt');
        return isTaskType || Boolean(hasPrompt);
    }

    /**
     * Check if a node is a context node
     * Context nodes store shared state/data that tasks can read/write
     * Uses both explicit type checking and name-based heuristics
     */
    static isContext(node: NodeLike | ASTNode): boolean {
        const type = node.type?.toLowerCase() || '';
        const name = node.name.toLowerCase();

        // Explicit type check
        if (type === 'context' || type === 'concept' || type === 'input' || type === 'result') {
            return true;
        }

        // Name-based heuristics for backward compatibility
        return name.includes('context') ||
               name.includes('output') ||
               name.includes('input') ||
               name.includes('data') ||
               name.includes('result');
    }

    /**
     * Check if a node is an init node
     * Init nodes are entry points to the state machine
     */
    static isInit(node: NodeLike | ASTNode): boolean {
        return node.type?.toLowerCase() === 'init';
    }

    /**
     * Check if a node is a tool node
     * Tool nodes represent callable tools with input/output schemas
     * Tools can be loosely defined (minimal attributes) or fully defined
     */
    static isTool(node: NodeLike | ASTNode): boolean {
        return node.type?.toLowerCase() === 'tool';
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
        const label = (edge.label || edge.type || '').toLowerCase();

        const permissions = {
            canRead: false,
            canWrite: false,
            canStore: false,
            fields: undefined as string[] | undefined
        };

        // Check for permission keywords
        if (label.includes('read')) permissions.canRead = true;
        if (label.includes('write') || label.includes('update') || label.includes('set')) {
            permissions.canWrite = true;
        }
        if (label.includes('store') || label.includes('calculate')) {
            permissions.canStore = true;
        }

        // If no specific permissions, default to read-only
        if (!permissions.canRead && !permissions.canWrite && !permissions.canStore) {
            permissions.canRead = true;
        }

        // Extract field list if specified (e.g., "write: field1,field2")
        const fieldMatch = label.match(/(?:write|read|store|update|set):\s*([a-zA-Z0-9_,\s]+)/i);
        if (fieldMatch) {
            permissions.fields = fieldMatch[1]
                .split(',')
                .map(f => f.trim())
                .filter(f => f.length > 0);
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
