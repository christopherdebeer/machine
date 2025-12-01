/**
 * Unified Context Builder
 *
 * Provides unified context building logic that uses edge-based context resolution.
 * This ensures consistency between condition evaluation, template resolution, and effect building.
 */

import type { MachineJSON } from '../json/types.js';
import type { ExecutionState } from './runtime-types.js';
import { ContextPermissionsResolver } from '../utils/context-permissions.js';
import { getPath } from './state-builder.js';

/**
 * Parse attribute value with type handling
 */
function parseAttributeValue(value: unknown, type?: string): any {
    if (typeof value === 'string') {
        if (!type) {
            // Auto-detect
            const cleanValue = value.replace(/^["']|["']$/g, '');
            try {
                return JSON.parse(value);
            } catch {
                return cleanValue;
            }
        }

        // Type-specific parsing
        const cleanValue = value.replace(/^["']|["']$/g, '');
        switch (type) {
            case 'number':
                return Number(cleanValue);
            case 'boolean':
                return cleanValue.toLowerCase() === 'true';
            case 'json':
                return JSON.parse(cleanValue);
            default:
                return cleanValue;
        }
    }

    return value;
}

/**
 * Build context attributes for a specific node, including edge-accessible context
 */
export function buildNodeContext(
    nodeName: string,
    machineJSON: MachineJSON,
    includeNodeAttributes: boolean = true
): Record<string, any> {
    const RESERVED_NAMES = ['errorCount', 'errors', 'activeState'];
    const context: Record<string, any> = {};

    // Include the node's own attributes if requested
    if (includeNodeAttributes) {
        const node = machineJSON.nodes.find(n => n.name === nodeName);
        if (node?.attributes && node.attributes.length > 0) {
            // Warn about reserved name collisions
            if (RESERVED_NAMES.includes(node.name)) {
                console.warn(
                    `[Context] Node '${node.name}' uses a reserved name. ` +
                    `Built-in variable will take precedence. Consider renaming the node.`
                );
            }

            context[node.name] = {};
            for (const attr of node.attributes) {
                context[node.name][attr.name] = parseAttributeValue(attr.value, attr.type);
            }
        }
    }

    // Get context nodes accessible via edges
    const accessibleContexts = ContextPermissionsResolver.getAccessibleContextNodes(
        nodeName,
        machineJSON,
        {
            includeInboundEdges: true, // Include context -> node edges for read access
            includeStore: true,
            enableLogging: false,
            permissionsMode: 'strict', // Use strict mode for proper edge-based permissions
            includeInheritedContext: true
        }
    );

    // Add accessible context nodes to the context
    for (const [contextNodeName, permissions] of accessibleContexts.entries()) {
        if (permissions.canRead) {
            const contextNode = machineJSON.nodes.find(n => n.name === contextNodeName);
            if (contextNode) {
                // Warn about reserved name collisions
                if (RESERVED_NAMES.includes(contextNode.name)) {
                    console.warn(
                        `[Context] Context node '${contextNode.name}' uses a reserved name. ` +
                        `Built-in variable will take precedence. Consider renaming the node.`
                    );
                }

                // For context nodes, use initial values from machine definition
                // (Runtime state values will be overlaid by buildEvaluationContext)
                context[contextNode.name] = {};
                if (contextNode.attributes && contextNode.attributes.length > 0) {
                    for (const attr of contextNode.attributes) {
                        // Only include specific fields if permissions are restricted
                        if (!permissions.fields || permissions.fields.includes(attr.name)) {
                            context[contextNode.name][attr.name] = parseAttributeValue(attr.value, attr.type);
                        }
                    }
                }
            }
        }
    }

    return context;
}

/**
 * Build complete evaluation context for CEL evaluation
 * This includes built-in variables, node context, runtime context values, and edge-accessible context
 */
export function buildEvaluationContext(
    nodeName: string,
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string
): Record<string, any> {
    const path = getPath(state, pathId);
    if (!path) {
        throw new Error(`Path ${pathId} not found`);
    }

    // Find active state for this path
    let activeState = '';
    for (let i = path.history.length - 1; i >= 0; i--) {
        const transition = path.history[i];
        const node = machineJSON.nodes.find(n => n.name === transition.to);
        if (node?.type?.toLowerCase() === 'state') {
            activeState = transition.to;
            break;
        }
    }

    // Build node-specific context including edge-accessible context (initial values)
    const nodeContext = buildNodeContext(nodeName, machineJSON, true);

    // Get permissions to filter runtime context values
    const accessibleContexts = ContextPermissionsResolver.getAccessibleContextNodes(
        nodeName,
        machineJSON,
        {
            includeInboundEdges: true,
            includeStore: true,
            enableLogging: false,
            permissionsMode: 'strict',
            includeInheritedContext: true
        }
    );

    // Overlay runtime context values on top of initial values
    // IMPORTANT: Respect field-level permissions - only merge permitted fields
    for (const [contextName, contextValues] of Object.entries(state.contextState)) {
        if (nodeContext[contextName]) {
            // Check if this context has field-level restrictions
            const permissions = accessibleContexts.get(contextName);

            if (permissions && permissions.fields) {
                // Field-level restrictions apply - only merge permitted fields
                const permittedValues: Record<string, any> = {};
                for (const [attrName, attrValue] of Object.entries(contextValues)) {
                    if (permissions.fields.includes(attrName)) {
                        permittedValues[attrName] = attrValue;
                    }
                }
                // Merge only permitted runtime values over initial values
                nodeContext[contextName] = {
                    ...nodeContext[contextName],
                    ...permittedValues
                };
            } else {
                // No field restrictions - merge all runtime values
                nodeContext[contextName] = {
                    ...nodeContext[contextName],
                    ...contextValues
                };
            }
        }
    }

    return {
        // Built-in variables (these take precedence over user-defined nodes)
        errorCount: state.metadata.errorCount,
        errors: state.metadata.errorCount, // Alias for backward compatibility
        activeState,
        // User-defined context (nodes and edge-accessible context with runtime overlays)
        attributes: nodeContext
    };
}

/**
 * Build global context for template resolution (used in diagram generation)
 * This includes all nodes and their attributes for general template resolution
 */
export function buildGlobalContext(machineJSON: MachineJSON): Record<string, any> {
    const RESERVED_NAMES = ['errorCount', 'errors', 'activeState'];
    const context: Record<string, any> = {};

    for (const node of machineJSON.nodes) {
        // Warn about reserved name collisions
        if (RESERVED_NAMES.includes(node.name)) {
            console.warn(
                `[Context] Node '${node.name}' uses a reserved name. ` +
                `Built-in variable will take precedence. Consider renaming the node.`
            );
        }

        if (node.attributes && node.attributes.length > 0) {
            context[node.name] = {};
            for (const attr of node.attributes) {
                context[node.name][attr.name] = parseAttributeValue(attr.value, attr.type);
            }
        }
    }

    return context;
}
