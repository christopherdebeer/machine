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
            permissionsMode = 'strict'
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
                    // - Write access: edge types containing 'write', 'store', 'create', 'update', 'set', 'calculate'
                    // - Read access: All edges grant read access by default
                    const edgeType = (edge.type?.toLowerCase() || edge.label?.toLowerCase() || '');
                    canWrite = /write|store|create|update|set|calculate/.test(edgeType);
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
                    const edgeType = (edge.type?.toLowerCase() || edge.label?.toLowerCase() || '');
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

        return accessMap;
    }
}
