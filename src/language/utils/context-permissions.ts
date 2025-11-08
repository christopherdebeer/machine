/**
 * Context Permissions Resolver
 *
 * Centralized utility for determining context node access permissions.
 * Extracts duplicated logic from machine-executor.ts and agent-context-builder.ts
 *
 * Related to issue #102 - Refactor: Extract duplicated context permission logic
 */

import type { MachineData } from '../rails-executor.js';
import { NodeTypeChecker } from '../node-type-checker.js';
import { getEdgeSearchText } from './edge-utils.js';

/**
 * Context access permissions for a node
 */
export interface ContextPermissions {
    canRead: boolean;
    canWrite: boolean;
    canStore: boolean;
    fields?: string[]; // Specific fields if restricted
}

/**
 * Options for getting accessible context nodes
 */
export interface AccessibleContextOptions {
    /**
     * Whether to check inbound edges from context nodes to the task node
     * (grants read-only access). Default: false
     */
    includeInboundEdges?: boolean;

    /**
     * Whether to include the canStore permission in the result.
     * Default: true
     */
    includeStore?: boolean;

    /**
     * Whether to enable console logging for debugging.
     * Default: false
     */
    enableLogging?: boolean;

    /**
     * Permission semantics mode:
     * - 'legacy': Machine-executor behavior - all edges grant read by default,
     *   write keywords: write, store, create, update, set, calculate
     * - 'strict': Agent-context-builder behavior - permissions must be explicit,
     *   uses NodeTypeChecker.extractPermissionsFromEdge
     * Default: 'strict'
     */
    permissionsMode?: 'legacy' | 'strict';

    /**
     * Whether to include inherited context from parent nodes.
     * When enabled, child nodes automatically inherit read-only access to
     * context nodes accessible by their parent nodes.
     * Default: true
     */
    includeInheritedContext?: boolean;
}

/**
 * Utility class for resolving context node access permissions
 */
export class ContextPermissionsResolver {
    /**
     * Get context nodes accessible from a given task node based on explicit edges
     *
     * @param taskNodeName The name of the task node
     * @param machineData The machine data containing nodes and edges
     * @param options Configuration options
     * @returns Map of context node names to their permissions
     */
    static getAccessibleContextNodes(
        taskNodeName: string,
        machineData: MachineData,
        options: AccessibleContextOptions = {}
    ): Map<string, ContextPermissions> {
        const {
            includeInboundEdges = false,
            includeStore = true,
            enableLogging = false,
            permissionsMode = 'strict',
            includeInheritedContext = true
        } = options;

        const accessMap = new Map<string, ContextPermissions>();

        // Find all edges from the task node to context nodes (outbound)
        const outboundEdges = machineData.edges.filter(edge => edge.source === taskNodeName);

        for (const edge of outboundEdges) {
            const targetNode = machineData.nodes.find(n => n.name === edge.target);

            // Check if target is a context node
            if (targetNode && NodeTypeChecker.isContext(targetNode)) {
                let canRead: boolean;
                let canWrite: boolean;
                let canStore: boolean;

                if (permissionsMode === 'legacy') {
                    // Legacy machine-executor semantics:
                    // - Write access: edge descriptions containing write/store keywords
                    // - Read access: All edges grant read access by default
                    const edgeText = getEdgeSearchText(edge as any);
                    canWrite = /write|store|create|update|set|calculate/.test(edgeText);
                    canRead = true; // All outbound edges grant read access by default

                    // Extract canStore separately
                    const permissions = NodeTypeChecker.extractPermissionsFromEdge(edge);
                    canStore = permissions.canStore;
                } else {
                    // Strict mode: Use NodeTypeChecker.extractPermissionsFromEdge
                    const permissions = NodeTypeChecker.extractPermissionsFromEdge(edge);
                    canRead = permissions.canRead;
                    canWrite = permissions.canWrite;
                    canStore = permissions.canStore;
                }

                // Extract field-level permissions if specified
                const permissions = NodeTypeChecker.extractPermissionsFromEdge(edge);
                const fields = permissions.fields;

                // Filter out canStore if not needed
                const finalPermissions: ContextPermissions = {
                    canRead,
                    canWrite,
                    canStore: includeStore ? canStore : false,
                    fields
                };

                accessMap.set(edge.target, finalPermissions);

                if (enableLogging) {
                    const edgeType = getEdgeSearchText(edge as any);
                    console.log(
                        `🔐 Context access: ${taskNodeName} -> ${edge.target} ` +
                        `(read: ${finalPermissions.canRead}, write: ${finalPermissions.canWrite}, ` +
                        `fields: ${finalPermissions.fields?.join(',') || 'all'}, edge: ${edgeType})`
                    );
                }
            }
        }

        // Optionally check inbound edges from context to task (for reading context)
        if (includeInboundEdges) {
            const inboundEdges = machineData.edges.filter(edge => edge.target === taskNodeName);

            for (const edge of inboundEdges) {
                const sourceNode = machineData.nodes.find(n => n.name === edge.source);

                // Check if source is a context node
                if (sourceNode && NodeTypeChecker.isContext(sourceNode)) {
                    // Inbound edges from context grant read-only access
                    if (!accessMap.has(edge.source)) {
                        const permissions = NodeTypeChecker.extractPermissionsFromEdge(edge);
                        const fields = permissions.fields;

                        const finalPermissions: ContextPermissions = {
                            canRead: true,
                            canWrite: false,
                            canStore: false,
                            fields
                        };

                        accessMap.set(edge.source, finalPermissions);

                if (enableLogging) {
                    console.log(
                        `🔐 Context access: ${edge.source} -> ${taskNodeName} ` +
                        `(read: true, write: false, fields: ${fields?.join(',') || 'all'})`
                    );
                }
                    }
                }
            }
        }

        // Include inherited context from parent nodes
        if (includeInheritedContext) {
            const inheritedContexts = this.getInheritedContextNodes(
                taskNodeName,
                machineData,
                enableLogging
            );

            for (const [contextName, perms] of inheritedContexts.entries()) {
                // Only add inherited context if not already explicitly defined
                // Explicit edges always take precedence over inheritance
                if (!accessMap.has(contextName)) {
                    accessMap.set(contextName, perms);
                }
            }
        }

        return accessMap;
    }

    /**
     * Get context nodes inherited from parent nodes in the hierarchy
     * Child nodes inherit read-only access to context nodes accessible by their parents
     *
     * @param taskNodeName The name of the task node
     * @param machineData The machine data containing nodes and edges
     * @param enableLogging Whether to enable console logging
     * @returns Map of inherited context node names to their permissions (read-only)
     */
    private static getInheritedContextNodes(
        taskNodeName: string,
        machineData: MachineData,
        enableLogging: boolean
    ): Map<string, ContextPermissions> {
        const inheritedMap = new Map<string, ContextPermissions>();

        // Find the task node in the machine data
        const taskNode = machineData.nodes.find(n => n.name === taskNodeName);
        if (!taskNode) {
            return inheritedMap;
        }

        // Get parent node names by traversing the hierarchy
        // Note: In the flattened MachineData structure, we need to track parent relationships
        // This requires looking at the node structure to find which nodes contain others
        const parentNames = this.findParentNodes(taskNodeName, machineData);

        // For each parent, get their accessible contexts and inherit them (read-only)
        for (const parentName of parentNames) {
            const parentContexts = this.getAccessibleContextNodes(
                parentName,
                machineData,
                {
                    includeInboundEdges: false,
                    includeStore: false, // Don't inherit store permissions
                    enableLogging: false, // Avoid recursive logging
                    includeInheritedContext: true // Recursively inherit from grandparents
                }
            );

            for (const [contextName, perms] of parentContexts.entries()) {
                // Inherit as read-only (never write or store)
                // If parent has any access (read, write, or store), child gets read access
                const inheritedPerms: ContextPermissions = {
                    canRead: perms.canRead || perms.canWrite || perms.canStore, // Inherit read access from any permission
                    canWrite: false, // Never inherit write permissions
                    canStore: false, // Never inherit store permissions
                    fields: perms.fields
                };

                // Only add if not already present (first parent in hierarchy wins)
                if (!inheritedMap.has(contextName)) {
                    inheritedMap.set(contextName, inheritedPerms);

                    if (enableLogging) {
                        console.log(
                            `🔐 Inherited context: ${taskNodeName} inherits ${contextName} from ${parentName} ` +
                            `(read: ${inheritedPerms.canRead}, fields: ${inheritedPerms.fields?.join(',') || 'all'})`
                        );
                    }
                }
            }
        }

        return inheritedMap;
    }

    /**
     * Find parent nodes in the hierarchy for a given node name
     * Uses the MachineData structure to traverse the node tree via the parent field
     *
     * @param nodeName The name of the node to find parents for
     * @param machineData The machine data containing nodes
     * @returns Array of parent node names (immediate parent first, then grandparent, etc.)
     */
    private static findParentNodes(
        nodeName: string,
        machineData: MachineData
    ): string[] {
        const parents: string[] = [];

        // Find the node
        let currentNode = machineData.nodes.find(n => n.name === nodeName);

        // Walk up the hierarchy using the parent field
        while (currentNode?.parent) {
            parents.push(currentNode.parent);
            currentNode = machineData.nodes.find(n => n.name === currentNode!.parent);
        }

        return parents;
    }
}
