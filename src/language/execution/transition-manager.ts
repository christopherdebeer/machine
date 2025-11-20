/**
 * Transition Manager
 * Responsible for evaluating transitions, detecting start nodes, and state module logic
 */

import { MachineJSON } from '../json/types.js';
import { NodeTypeChecker } from '../node-type-checker.js';
import { EdgeConditionParser } from '../utils/edge-conditions.js';
import { EvaluationEngine } from './evaluation-engine.js';
import { AnnotatedEdge, TransitionEvaluation, EvaluationContext } from './types.js';
import { EdgeTypeResolver } from './edge-type-resolver.js';
import { AnnotationProcessor, ProcessedEdgeAnnotations } from './annotation-processor.js';

/**
 * TransitionManager handles transition evaluation and state module logic
 */
export class TransitionManager {
    private machineData: MachineJSON;
    private evaluationEngine: EvaluationEngine;

    constructor(machineData: MachineJSON, evaluationEngine: EvaluationEngine) {
        this.machineData = machineData;
        this.evaluationEngine = evaluationEngine;
    }

    /**
     * Extract annotations from edge label
     * Supports: @auto, @barrier("name"), @priority(N), @parallel
     */
    private extractAnnotationsFromLabel(edge: { label?: string; type?: string }): Array<{ name: string; value?: string }> {
        const edgeLabel = edge.label || edge.type || '';
        const annotations: Array<{ name: string; value?: string }> = [];

        // Match annotation patterns: @name or @name(value)
        const annotationRegex = /@(\w+)(?:\(([^)]+)\))?/g;
        let match;

        while ((match = annotationRegex.exec(edgeLabel)) !== null) {
            const name = match[1];
            const value = match[2];
            annotations.push({ name, value });
        }

        return annotations;
    }

    /**
     * Get annotated edges (edges with extracted annotations and semantic types)
     */
    private getAnnotatedEdges(): AnnotatedEdge[] {
        return this.machineData.edges.map(edge => {
            const annotations = this.extractAnnotationsFromLabel(edge);
            const edgeType = EdgeTypeResolver.resolveEdgeType(edge);
            const processed = AnnotationProcessor.processEdgeAnnotations(annotations);

            return {
                ...edge,
                annotations,
                edgeType,
                priority: processed.priority
            };
        });
    }

    /**
     * Check if edge has @auto annotation
     */
    private hasAutoAnnotation(edge: AnnotatedEdge): boolean {
        if (!edge.annotations) return false;
        return edge.annotations.some(a => a.name === 'auto');
    }

    /**
     * Check if edge has @barrier annotation
     */
    hasBarrierAnnotation(edge: AnnotatedEdge): boolean {
        if (!edge.annotations) return false;
        return edge.annotations.some(a => a.name === 'barrier');
    }

    /**
     * Get barrier name from edge annotation
     */
    getBarrierName(edge: AnnotatedEdge): string | undefined {
        if (!edge.annotations) return undefined;
        const barrierAnnotation = edge.annotations.find(a => a.name === 'barrier');
        return barrierAnnotation?.value || 'default';
    }

    /**
     * Check if edge has @parallel annotation
     */
    hasParallelAnnotation(edge: AnnotatedEdge): boolean {
        if (!edge.annotations) return false;
        return edge.annotations.some(a => a.name === 'parallel');
    }

    /**
     * Find all start nodes in the machine
     * Supports multiple start nodes by default
     */
    findStartNodes(): string[] {
        const startNodes: string[] = [];

        // 1. Explicit init nodes
        for (const node of this.machineData.nodes) {
            if (NodeTypeChecker.isInit(node)) {
                startNodes.push(node.name);
            }
        }

        // 2. Named start nodes (case-insensitive "start*" pattern)
        for (const node of this.machineData.nodes) {
            if (node.name.toLowerCase().startsWith('start') && !startNodes.includes(node.name)) {
                startNodes.push(node.name);
            }
        }

        // 3. Inference: nodes with no incoming edges (and at least one outgoing edge)
        if (startNodes.length === 0) {
            for (const node of this.machineData.nodes) {
                // Skip context and style nodes
                if (NodeTypeChecker.isContext(node) || NodeTypeChecker.isStyleNode(node)) {
                    continue;
                }

                const hasIncoming = this.machineData.edges.some(e => e.target === node.name);
                const hasOutgoing = this.machineData.edges.some(e => e.source === node.name);

                if (!hasIncoming && hasOutgoing) {
                    startNodes.push(node.name);
                }
            }
        }

        // 4. Fallback: first node if none found
        if (startNodes.length === 0 && this.machineData.nodes.length > 0) {
            const firstNode = this.machineData.nodes.find(n =>
                !NodeTypeChecker.isContext(n) && !NodeTypeChecker.isStyleNode(n)
            );
            if (firstNode) {
                startNodes.push(firstNode.name);
            }
        }

        return startNodes;
    }

    /**
     * Get outbound edges from a node
     * Includes module-level exit edges for terminal nodes within state modules
     */
    getOutboundEdges(nodeName: string): AnnotatedEdge[] {
        const allEdges = this.getAnnotatedEdges();
        const directEdges = allEdges.filter(edge => edge.source === nodeName);

        // If node has direct edges, return them
        if (directEdges.length > 0) {
            return directEdges;
        }

        // Check if this node is within a state module
        const parentModule = this.getParentStateModule(nodeName);
        if (parentModule) {
            // Terminal node within module - check for module-level exits
            const moduleEdges = allEdges.filter(edge => edge.source === parentModule);
            if (moduleEdges.length > 0) {
                return moduleEdges;
            }
        }

        return directEdges; // Return empty array if no edges found
    }

    /**
     * Get the parent state module of a node (if any)
     */
    private getParentStateModule(nodeName: string): string | null {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node || !node.parent) {
            return null;
        }

        // Walk up parent chain to find a state node
        let currentParent: string | undefined = node.parent;
        while (currentParent) {
            const parentNode = this.machineData.nodes.find(n => n.name === currentParent);
            if (parentNode && NodeTypeChecker.isState(parentNode)) {
                return currentParent;
            }
            currentParent = parentNode?.parent;
        }

        return null;
    }

    /**
     * Check if a node has children
     */
    private hasChildren(nodeName: string): boolean {
        return this.machineData.nodes.some(n => n.parent === nodeName);
    }

    /**
     * Get first child node (entry point for state modules)
     */
    getFirstChild(nodeName: string): string | null {
        const children = this.machineData.nodes.filter(n => n.parent === nodeName);

        if (children.length === 0) {
            return null;
        }

        // Priority 1: Task nodes
        const taskChild = children.find(n => NodeTypeChecker.isTask(n));
        if (taskChild) return taskChild.name;

        // Priority 2: State nodes (nested modules)
        const stateChild = children.find(n => NodeTypeChecker.isState(n));
        if (stateChild) return stateChild.name;

        // Priority 3: Any non-context node
        const nonContextChild = children.find(n => !NodeTypeChecker.isContext(n));
        if (nonContextChild) return nonContextChild.name;

        // Last resort: first child
        return children[0].name;
    }

    /**
     * Evaluate automated transitions from current node
     * Returns the first valid automated transition, or null if none found
     */
    evaluateAutomatedTransitions(nodeName: string, context: EvaluationContext): TransitionEvaluation | null {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) return null;

        const outboundEdges = this.getOutboundEdges(nodeName);

        // If only one edge and it's a state or init node, auto-transition
        if (outboundEdges.length === 1 && (NodeTypeChecker.isState(node) || NodeTypeChecker.isInit(node))) {
            const edge = outboundEdges[0];
            const condition = this.evaluationEngine.extractEdgeCondition(edge);

            if (this.evaluationEngine.evaluateCondition(condition, context)) {
                return {
                    edge,
                    target: edge.target,
                    condition,
                    isAutomatic: true,
                    reason: NodeTypeChecker.isInit(node) ? 'Single edge from init node' : 'Single edge from state node'
                };
            }
        }

        // Check edges with @auto annotation
        for (const edge of outboundEdges) {
            if (this.hasAutoAnnotation(edge)) {
                const condition = this.evaluationEngine.extractEdgeCondition(edge);

                if (this.evaluationEngine.evaluateCondition(condition, context)) {
                    return {
                        edge,
                        target: edge.target,
                        condition,
                        isAutomatic: true,
                        reason: '@auto annotation'
                    };
                }
            }
        }

        // Check for edges with simple deterministic conditions
        for (const edge of outboundEdges) {
            const condition = this.evaluationEngine.extractEdgeCondition(edge);

            if (condition && EdgeConditionParser.isSimpleCondition(condition)) {
                if (this.evaluationEngine.evaluateCondition(condition, context)) {
                    return {
                        edge,
                        target: edge.target,
                        condition,
                        isAutomatic: true,
                        reason: 'Simple deterministic condition'
                    };
                }
            }
        }

        return null;
    }

    /**
     * Get non-automated transitions (those requiring agent decision)
     */
    getNonAutomatedTransitions(nodeName: string, context: EvaluationContext): Array<{ target: string; description?: string; condition?: string }> {
        const outboundEdges = this.getOutboundEdges(nodeName);

        return outboundEdges
            .filter(edge => {
                // Skip edges with @auto annotation
                if (this.hasAutoAnnotation(edge)) return false;

                // Skip edges with simple deterministic conditions that would auto-execute
                const condition = this.evaluationEngine.extractEdgeCondition(edge);
                if (condition && EdgeConditionParser.isSimpleCondition(condition) &&
                    this.evaluationEngine.evaluateCondition(condition, context)) {
                    return false;
                }

                return true;
            })
            .map(edge => ({
                target: edge.target,
                description: edge.label || edge.type,
                condition: this.evaluationEngine.extractEdgeCondition(edge)
            }));
    }

    /**
     * Check if a node requires agent decision
     */
    requiresAgentDecision(nodeName: string): boolean {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) return false;

        // Task nodes with prompts require agent decisions
        if (node.type?.toLowerCase() === 'task') {
            const attributes = node.attributes || [];
            return attributes.some(a => a.name === 'prompt');
        }

        // State nodes typically don't require agent decisions
        if (NodeTypeChecker.isState(node)) {
            return false;
        }

        // Check if there are multiple non-automatic outbound edges
        const outboundEdges = this.getOutboundEdges(nodeName);
        const nonAutoEdges = outboundEdges.filter(edge => !this.hasAutoAnnotation(edge));

        return nonAutoEdges.length > 1;
    }

    /**
     * Resolve state module entry
     * Returns final target node after entering nested state modules
     */
    resolveStateModuleEntry(targetNode: string): { finalTarget: string; moduleChain: string[] } {
        let currentTarget = targetNode;
        const moduleChain: string[] = [];

        // Recursively enter nested state modules
        while (true) {
            const currentTargetObj = this.machineData.nodes.find(n => n.name === currentTarget);

            // Check if current target is a state node with children
            if (currentTargetObj && NodeTypeChecker.isState(currentTargetObj) && this.hasChildren(currentTarget)) {
                moduleChain.push(currentTarget);

                const firstChild = this.getFirstChild(currentTarget);
                if (!firstChild) break;

                // Check if first child is also a state module
                const firstChildObj = this.machineData.nodes.find(n => n.name === firstChild);
                if (firstChildObj && NodeTypeChecker.isState(firstChildObj) && this.hasChildren(firstChild)) {
                    currentTarget = firstChild;
                    continue;
                }

                // First child is not a state module
                currentTarget = firstChild;
                break;
            }

            break;
        }

        return { finalTarget: currentTarget, moduleChain };
    }
}
