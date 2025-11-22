/**
 * Transition Evaluator
 *
 * Pure functions for evaluating transitions and determining next nodes.
 */

import type { MachineJSON, MachineEdgeJSON, MachineNodeJSON } from '../json/types.js';
import type { ExecutionState, Transition } from './runtime-types.js';
import { NodeTypeChecker } from '../node-type-checker.js';
import { getPath } from './state-builder.js';
import { evaluateCondition, extractEdgeCondition, isSimpleCondition } from './condition-evaluator.js';

/**
 * Annotated edge with metadata
 */
interface AnnotatedEdge extends MachineEdgeJSON {
    hasAutoAnnotation: boolean;
    condition?: string;
}

/**
 * Extract @auto annotation from edge
 */
function hasAutoAnnotation(edge: MachineEdgeJSON): boolean {
    if (!edge.annotations) return false;
    return edge.annotations.some(a => a.name === 'auto');
}

/**
 * Extract @parallel annotation from edge
 */
function hasParallelAnnotation(edge: MachineEdgeJSON): boolean {
    if (!edge.annotations) return false;
    return edge.annotations.some(a => a.name === 'parallel');
}

/**
 * Get annotated edges from machine
 */
function getAnnotatedEdges(machineJSON: MachineJSON): AnnotatedEdge[] {
    return machineJSON.edges.map(edge => ({
        ...edge,
        hasAutoAnnotation: hasAutoAnnotation(edge),
        condition: extractEdgeCondition(edge)
    }));
}

/**
 * Get outbound edges from a node
 */
function getOutboundEdges(
    machineJSON: MachineJSON,
    nodeName: string
): AnnotatedEdge[] {
    const allEdges = getAnnotatedEdges(machineJSON);
    const directEdges = allEdges.filter(edge => edge.source === nodeName);

    // If node has direct edges, return them
    if (directEdges.length > 0) {
        return directEdges;
    }

    // Check if this node is within a state module
    const node = machineJSON.nodes.find(n => n.name === nodeName);
    if (node?.parent) {
        // Check for module-level exits
        const moduleEdges = allEdges.filter(edge => edge.source === node.parent);
        if (moduleEdges.length > 0) {
            return moduleEdges;
        }
    }

    return [];
}

/**
 * Check if node has children
 */
function hasChildren(machineJSON: MachineJSON, nodeName: string): boolean {
    return machineJSON.nodes.some(n => n.parent === nodeName);
}

/**
 * Get first child node (entry point for state modules)
 */
function getFirstChild(machineJSON: MachineJSON, nodeName: string): string | null {
    const children = machineJSON.nodes.filter(n => n.parent === nodeName);

    if (children.length === 0) {
        return null;
    }

    // Priority 1: Task nodes
    const taskChild = children.find(n => NodeTypeChecker.isTask(n));
    if (taskChild) {
        return taskChild.name;
    }

    // Priority 2: State nodes
    const stateChild = children.find(n => NodeTypeChecker.isState(n));
    if (stateChild) {
        return stateChild.name;
    }

    // Priority 3: Any other node
    const nonContextChild = children.find(n => !NodeTypeChecker.isContext(n));
    if (nonContextChild) {
        return nonContextChild.name;
    }

    return children[0].name;
}

/**
 * Evaluate automated transitions from a node
 */
export function evaluateAutomatedTransitions(
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string
): Transition | null {
    const path = getPath(state, pathId);
    if (!path) {
        throw new Error(`Path ${pathId} not found`);
    }

    const nodeName = path.currentNode;
    const node = machineJSON.nodes.find(n => n.name === nodeName);
    if (!node) {
        return null;
    }

    const outboundEdges = getOutboundEdges(machineJSON, nodeName);

    // Single edge from state, init, or task node without prompt - auto-transition
    const isTaskWithoutPrompt = NodeTypeChecker.isTask(node) && !node.attributes?.find(a => a.name === 'prompt');
    if (outboundEdges.length === 1 && (NodeTypeChecker.isState(node) || NodeTypeChecker.isInit(node) || isTaskWithoutPrompt)) {
        const edge = outboundEdges[0];
        if (evaluateCondition(edge.condition, machineJSON, state, pathId)) {
            let reason = 'Single edge from state node';
            if (NodeTypeChecker.isInit(node)) {
                reason = 'Single edge from init node';
            } else if (isTaskWithoutPrompt) {
                reason = 'Single edge from task node without prompt';
            }
            return createTransition(
                nodeName,
                edge.target,
                reason,
                machineJSON
            );
        }
    }

    // Check edges with @auto annotation
    for (const edge of outboundEdges) {
        if (edge.hasAutoAnnotation) {
            if (evaluateCondition(edge.condition, machineJSON, state, pathId)) {
                return createTransition(nodeName, edge.target, '@auto annotation', machineJSON);
            }
        }
    }

    // Check edges with simple deterministic conditions
    for (const edge of outboundEdges) {
        if (edge.condition && isSimpleCondition(edge.condition)) {
            if (evaluateCondition(edge.condition, machineJSON, state, pathId)) {
                return createTransition(nodeName, edge.target, 'Simple deterministic condition', machineJSON);
            }
        }
    }

    return null;
}

/**
 * Create a transition, handling state module entry
 */
function createTransition(
    fromNode: string,
    toNode: string,
    reason: string,
    machineJSON: MachineJSON
): Transition {
    let currentTarget = toNode;
    const moduleChain: string[] = [];

    // Recursively enter nested state modules
    while (true) {
        const currentTargetNode = machineJSON.nodes.find(n => n.name === currentTarget);

        // Check if target is a state module (state node with children)
        if (currentTargetNode && NodeTypeChecker.isState(currentTargetNode) && hasChildren(machineJSON, currentTarget)) {
            moduleChain.push(currentTarget);

            const firstChild = getFirstChild(machineJSON, currentTarget);
            if (!firstChild) {
                break;
            }

            // Check if first child is also a state module
            const firstChildNode = machineJSON.nodes.find(n => n.name === firstChild);
            if (firstChildNode && NodeTypeChecker.isState(firstChildNode) && hasChildren(machineJSON, firstChild)) {
                currentTarget = firstChild;
                continue;
            }

            // First child is not a state module - this is our final target
            currentTarget = firstChild;
            break;
        }

        break;
    }

    // Create transition to final target
    const finalReason = moduleChain.length > 0
        ? `${reason} (module entry: ${moduleChain.join(' -> ')} -> ${currentTarget})`
        : reason;

    return {
        from: fromNode,
        to: currentTarget,
        transition: finalReason,
        timestamp: new Date().toISOString()
    };
}

/**
 * Get non-automated transitions (require agent decision)
 */
export function getNonAutomatedTransitions(
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string
): Array<{ target: string; description?: string; condition?: string }> {
    const path = getPath(state, pathId);
    if (!path) {
        throw new Error(`Path ${pathId} not found`);
    }

    const nodeName = path.currentNode;
    const outboundEdges = getOutboundEdges(machineJSON, nodeName);

    return outboundEdges
        .filter(edge => {
            // Skip @auto edges
            if (edge.hasAutoAnnotation) return false;

            // Skip edges with simple deterministic conditions that would auto-execute
            if (edge.condition && isSimpleCondition(edge.condition) && evaluateCondition(edge.condition, machineJSON, state, pathId)) {
                return false;
            }

            return true;
        })
        .map(edge => ({
            target: edge.target,
            description: edge.label || edge.type,
            condition: edge.condition
        }));
}

/**
 * Check if a node requires agent decision
 */
/**
 * Get parallel edges from a node
 * Returns all outbound edges with @parallel annotation
 */
export function getParallelEdges(
    machineJSON: MachineJSON,
    nodeName: string
): AnnotatedEdge[] {
    const outboundEdges = getOutboundEdges(machineJSON, nodeName);
    return outboundEdges.filter(edge => hasParallelAnnotation(edge));
}

export function requiresAgentDecision(
    machineJSON: MachineJSON,
    nodeName: string
): boolean {
    const node = machineJSON.nodes.find(n => n.name === nodeName);
    if (!node) return false;

    // Get non-automated outbound edges
    const outboundEdges = getOutboundEdges(machineJSON, nodeName);
    const nonAutoEdges = outboundEdges.filter(edge => !edge.hasAutoAnnotation);

    // Task nodes with prompts: Only require agent if multiple transitions exist
    // - 0 transitions: No agent needed (just complete the node)
    // - 1 transition: No agent needed (take the only path)
    // - 2+ transitions: Agent must choose between paths
    if (NodeTypeChecker.isTask(node)) {
        const promptAttr = node.attributes?.find(a => a.name === 'prompt');
        if (promptAttr) {
            return nonAutoEdges.length > 1;
        }
    }

    // State nodes typically don't require agent decisions
    if (NodeTypeChecker.isState(node)) {
        return false;
    }

    // For other node types, require agent if multiple non-automatic edges
    return nonAutoEdges.length > 1;
}

/**
 * Get node attributes as object
 */
export function getNodeAttributes(
    machineJSON: MachineJSON,
    nodeName: string
): Record<string, any> {
    const node = machineJSON.nodes.find(n => n.name === nodeName);
    if (!node?.attributes) {
        return {};
    }

    const result: Record<string, any> = {};
    for (const attr of node.attributes) {
        result[attr.name] = attr.value;
    }
    return result;
}
