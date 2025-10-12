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
            enableLogging = false
        } = options;

        const accessMap = new Map<string, ContextPermissions>();

        // Find all edges from the task node to context nodes (outbound)
        const outboundEdges = machineData.edges.filter(edge => edge.source === taskNodeName);

        for (const edge of outboundEdges) {
            const targetNode = machineData.nodes.find(n => n.name === edge.target);

            // Check if target is a context node
            if (targetNode && NodeTypeChecker.isContext(targetNode)) {
                const permissions = NodeTypeChecker.extractPermissionsFromEdge(edge);

                // Filter out canStore if not needed
                const finalPermissions: ContextPermissions = includeStore
                    ? permissions
                    : { canRead: permissions.canRead, canWrite: permissions.canWrite, canStore: false, fields: permissions.fields };

                accessMap.set(edge.target, finalPermissions);

                if (enableLogging) {
                    console.log(
                        `🔐 Context access: ${taskNodeName} -> ${edge.target} ` +
                        `(read: ${finalPermissions.canRead}, write: ${finalPermissions.canWrite}, ` +
                        `fields: ${finalPermissions.fields?.join(',') || 'all'}, edge: ${edge.type || edge.label || ''})`
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
