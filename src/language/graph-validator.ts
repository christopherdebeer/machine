/**
 * Graph Validator
 * Validates graph structure: reachability, cycles, entry/exit points
 */

import type { Edge as AstEdge, Machine, Node } from './generated/ast.js';
import {
    ValidationContext,
    ValidationSeverity,
    ValidationCategory,
    createValidationError,
    GraphErrorCodes
} from './validation-errors.js';
import { NodeTypeChecker } from './node-type-checker.js';
import type { EdgeLike } from './node-type-checker.js';

interface NodeAliasInfo {
    node: Node;
    qualifiedName: string;
}

interface ResolvedReference {
    node?: Node;
    nodeName: string;
    attributePath?: string;
}

export interface GraphValidationResult {
    valid: boolean;
    unreachableNodes?: string[];
    orphanedNodes?: string[];
    cycles?: string[][];
    missingEntryPoints?: boolean;
    missingExitPoints?: boolean;
    warnings?: string[];
}

export class GraphValidator {
    private machine: Machine;
    private nodeMap: Map<string, Node>;
    private adjacencyList: Map<string, string[]>; // node -> list of reachable nodes
    private reverseAdjacencyList: Map<string, string[]>; // node -> list of nodes that reach it
    private controlEdges: EdgeLike[];

    constructor(machine: Machine) {
        this.machine = machine;
        this.nodeMap = this.buildNodeMap();
        this.adjacencyList = new Map();
        this.reverseAdjacencyList = new Map();
        this.controlEdges = [];
        this.buildAdjacencyLists();
    }

    /**
     * Build a map of all nodes by name
     */
    private buildNodeMap(): Map<string, Node> {
        const map = new Map<string, Node>();

        const processNode = (node: Node) => {
            map.set(node.name, node);
            node.nodes.forEach(child => processNode(child));
        };

        this.machine.nodes.forEach(node => processNode(node));
        return map;
    }

    /**
     * Build adjacency lists for graph traversal
     */
    private buildAdjacencyLists(): void {
        // Initialize adjacency lists for all nodes
        this.nodeMap.forEach((_, nodeName) => {
            this.adjacencyList.set(nodeName, []);
            this.reverseAdjacencyList.set(nodeName, []);
        });

        const aliasMap = this.buildNodeAliasMap();

        const processEdgeCollection = (edges: AstEdge[] | undefined) => {
            edges?.forEach(edge => this.processEdge(edge, aliasMap));
        };

        processEdgeCollection(this.machine.edges);
        this.machine.nodes.forEach(node => this.traverseChildEdges(node, aliasMap));
    }

    private traverseChildEdges(node: Node, aliasMap: Map<string, NodeAliasInfo>): void {
        if (node.edges && node.edges.length > 0) {
            node.edges.forEach(edge => this.processEdge(edge, aliasMap));
        }

        node.nodes?.forEach(child => this.traverseChildEdges(child, aliasMap));
    }

    private processEdge(edge: AstEdge, aliasMap: Map<string, NodeAliasInfo>): void {
        const sourceRefs = (edge.source ?? [])
            .map(reference => this.resolveEdgeReference(reference, aliasMap))
            .filter((ref): ref is ResolvedReference => !!ref && !!ref.nodeName);

        if (sourceRefs.length === 0) {
            return;
        }

        let activeSources = sourceRefs;

        edge.segments.forEach(segment => {
            const targetRefs = (segment.target ?? [])
                .map(reference => this.resolveEdgeReference(reference, aliasMap))
                .filter((ref): ref is ResolvedReference => !!ref && !!ref.nodeName);

            if (targetRefs.length === 0) {
                activeSources = targetRefs;
                return;
            }

            activeSources.forEach(sourceRef => {
                targetRefs.forEach(targetRef => {
                    this.registerEdge(sourceRef, targetRef);
                });
            });

            activeSources = targetRefs;
        });
    }

    private registerEdge(sourceRef: ResolvedReference, targetRef: ResolvedReference): void {
        const sourceName = sourceRef.nodeName;
        const targetName = targetRef.nodeName;

        if (!this.nodeMap.has(sourceName) || !this.nodeMap.has(targetName)) {
            return;
        }

        const edge: EdgeLike = {
            source: sourceName,
            target: targetName
        };

        if (this.isDataEdge(edge, sourceRef, targetRef)) {
            return;
        }

        const sourceList = this.adjacencyList.get(sourceName);
        if (sourceList && !sourceList.includes(targetName)) {
            sourceList.push(targetName);
        }

        const targetList = this.reverseAdjacencyList.get(targetName);
        if (targetList && !targetList.includes(sourceName)) {
            targetList.push(sourceName);
        }

        this.controlEdges.push(edge);
    }

    private isDataEdge(edge: EdgeLike, sourceRef: ResolvedReference, targetRef: ResolvedReference): boolean {
        const sourceNode = this.nodeMap.get(edge.source);
        const targetNode = this.nodeMap.get(edge.target);

        if (!sourceNode || !targetNode) {
            return false;
        }

        if (sourceRef.attributePath || targetRef.attributePath) {
            return true;
        }

        if (NodeTypeChecker.isContext(sourceNode) || NodeTypeChecker.isContext(targetNode)) {
            return true;
        }

        return NodeTypeChecker.isContextAccessEdge(edge, sourceNode, targetNode);
    }

    private buildNodeAliasMap(): Map<string, NodeAliasInfo> {
        const aliasMap = new Map<string, NodeAliasInfo>();

        const processNode = (node: Node, parentQualifiedName?: string) => {
            const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${node.name}` : node.name;
            aliasMap.set(node.name, { node, qualifiedName });
            aliasMap.set(qualifiedName, { node, qualifiedName });

            if (node.attributes) {
                node.attributes.forEach(attr => {
                    aliasMap.set(`${qualifiedName}.${attr.name}`, {
                        node,
                        qualifiedName: `${qualifiedName}.${attr.name}`
                    });
                });
            }

            node.nodes?.forEach(child => processNode(child, qualifiedName));
        };

        this.machine.nodes.forEach(node => processNode(node));
        return aliasMap;
    }

    private resolveEdgeReference(reference: any, aliasMap: Map<string, NodeAliasInfo>): ResolvedReference | undefined {
        if (!reference) {
            return undefined;
        }

        if (reference.ref) {
            const node = reference.ref as Node;
            return {
                node,
                nodeName: node.name
            };
        }

        const rawText = reference.$cstNode?.text?.replace(/["']/g, '');
        if (!rawText) {
            return undefined;
        }

        const resolved = this.resolveReferencePath(rawText, aliasMap);
        if (resolved) {
            return resolved;
        }

        return {
            nodeName: rawText
        };
    }

    private resolveReferencePath(refText: string, aliasMap: Map<string, NodeAliasInfo>): ResolvedReference | undefined {
        if (!refText) {
            return undefined;
        }

        const sanitized = refText.trim().replace(/;$/, '');
        if (!sanitized) {
            return undefined;
        }

        const parts = sanitized.split('.');
        for (let i = parts.length; i > 0; i--) {
            const candidate = parts.slice(0, i).join('.');
            const info = aliasMap.get(candidate);
            if (info) {
                const attributePath = parts.slice(i).join('.');
                return {
                    node: info.node,
                    nodeName: info.node.name,
                    attributePath: attributePath.length > 0 ? attributePath : undefined
                };
            }
        }

        return undefined;
    }

    /**
     * Find all entry points (nodes with no incoming edges or init nodes)
     */
    public findEntryPoints(): string[] {
        const entryPoints: string[] = [];

        this.nodeMap.forEach((node, nodeName) => {
            const incomingEdges = this.reverseAdjacencyList.get(nodeName) || [];

            if (NodeTypeChecker.isContext(node, this.controlEdges)) {
                return;
            }

            if (NodeTypeChecker.isInit(node, this.controlEdges) || incomingEdges.length === 0) {
                if (!entryPoints.includes(nodeName)) {
                    entryPoints.push(nodeName);
                }
            }
        });

        return entryPoints;
    }

    /**
     * Find all exit points (nodes with no outgoing edges)
     */
    public findExitPoints(): string[] {
        const exitPoints: string[] = [];

        this.nodeMap.forEach((node, nodeName) => {
            const outgoingEdges = this.adjacencyList.get(nodeName) || [];

            // Exit point if it has no outgoing edges
            // (but exclude context nodes which shouldn't have outgoing edges)
            if (outgoingEdges.length === 0 && !NodeTypeChecker.isContext(node, this.controlEdges)) {
                exitPoints.push(nodeName);
            }
        });

        return exitPoints;
    }

    /**
     * Find unreachable nodes (nodes that cannot be reached from entry points)
     */
    public findUnreachableNodes(): string[] {
        const entryPoints = this.findEntryPoints();

        // BFS from all entry nodes
        const visited = new Set<string>();
        const queue: string[] = [...entryPoints];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;

            visited.add(current);

            const neighbors = this.adjacencyList.get(current) || [];
            neighbors.forEach(neighbor => {
                if (!visited.has(neighbor)) {
                    queue.push(neighbor);
                }
            });
        }

        // Find nodes that were not visited
        const unreachable: string[] = [];
        this.nodeMap.forEach((node, nodeName) => {
            // Exclude context nodes from reachability check
            if (!visited.has(nodeName) && !NodeTypeChecker.isContext(node, this.controlEdges)) {
                unreachable.push(nodeName);
            }
        });

        return unreachable;
    }

    /**
     * Find orphaned nodes (nodes with no incoming or outgoing edges)
     */
    public findOrphanedNodes(): string[] {
        const orphaned: string[] = [];

        this.nodeMap.forEach((node, nodeName) => {
            const incoming = this.reverseAdjacencyList.get(nodeName) || [];
            const outgoing = this.adjacencyList.get(nodeName) || [];

            // Orphaned if:
            // 1. No incoming edges AND no outgoing edges
            // 2. Not an init node (init nodes can have no incoming edges)
            // 3. Not a context node (context nodes typically don't have edges)
            if (incoming.length === 0 && outgoing.length === 0 &&
                !NodeTypeChecker.isInit(node, this.controlEdges) && !NodeTypeChecker.isContext(node, this.controlEdges)) {
                orphaned.push(nodeName);
            }
        });

        return orphaned;
    }

    /**
     * Detect cycles in the graph using DFS
     */
    public detectCycles(): string[][] {
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const inRecursionStack = new Set<string>();

        const dfs = (nodeName: string, path: string[]): void => {
            // Check if we've found a cycle
            if (inRecursionStack.has(nodeName)) {
                // Found a cycle - extract the cycle from the path
                const cycleStart = path.indexOf(nodeName);
                if (cycleStart !== -1) {
                    const cycle = [...path.slice(cycleStart), nodeName];
                    cycles.push(cycle);
                }
                return;
            }

            if (visited.has(nodeName)) return;

            visited.add(nodeName);
            inRecursionStack.add(nodeName);
            path.push(nodeName);

            const neighbors = this.adjacencyList.get(nodeName) || [];
            neighbors.forEach(neighbor => {
                dfs(neighbor, path);
            });

            path.pop();
            inRecursionStack.delete(nodeName);
        };

        this.nodeMap.forEach((_, nodeName) => {
            if (!visited.has(nodeName)) {
                dfs(nodeName, []);
            }
        });

        return cycles;
    }

    /**
     * Check if a specific node is part of a cycle
     */
    public isNodeInCycle(nodeName: string): boolean {
        const cycles = this.detectCycles();
        return cycles.some(cycle => cycle.includes(nodeName));
    }

    /**
     * Find the longest path from entry to exit points
     */
    public findLongestPath(): string[] {
        const entryPoints = this.findEntryPoints();
        const exitPoints = this.findExitPoints();

        if (entryPoints.length === 0 || exitPoints.length === 0) {
            return [];
        }

        let longestPath: string[] = [];

        // Try BFS from each entry point to each exit point
        entryPoints.forEach(entry => {
            exitPoints.forEach(exit => {
                const path = this.findPath(entry, exit);
                if (path.length > longestPath.length) {
                    longestPath = path;
                }
            });
        });

        return longestPath;
    }

    /**
     * Find a path between two nodes using BFS
     */
    public findPath(source: string, target: string): string[] {
        const queue: { node: string; path: string[] }[] = [{ node: source, path: [source] }];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const { node, path } = queue.shift()!;

            if (node === target) {
                return path;
            }

            if (visited.has(node)) continue;
            visited.add(node);

            const neighbors = this.adjacencyList.get(node) || [];
            neighbors.forEach(neighbor => {
                if (!visited.has(neighbor)) {
                    queue.push({ node: neighbor, path: [...path, neighbor] });
                }
            });
        }

        return []; // No path found
    }

    /**
     * Validate the entire graph
     */
    public validate(): GraphValidationResult {
        const unreachableNodes = this.findUnreachableNodes();
        const orphanedNodes = this.findOrphanedNodes();
        const cycles = this.detectCycles();
        const entryPoints = this.findEntryPoints();
        const exitPoints = this.findExitPoints();

        const warnings: string[] = [];

        // Generate warnings
        if (entryPoints.length === 0) {
            warnings.push('No entry points found. Consider adding an init node or a node with no incoming edges.');
        }

        if (entryPoints.length > 1) {
            warnings.push(`Multiple entry points found: ${entryPoints.join(', ')}. This may lead to ambiguous execution.`);
        }

        if (exitPoints.length === 0) {
            warnings.push('No exit points found. The machine may not have a clear termination condition.');
        }

        if (cycles.length > 0) {
            warnings.push(`Detected ${cycles.length} cycle(s) in the graph. This may lead to infinite loops.`);
        }

        const valid = unreachableNodes.length === 0 &&
                     orphanedNodes.length === 0 &&
                     entryPoints.length > 0;

        return {
            valid,
            unreachableNodes: unreachableNodes.length > 0 ? unreachableNodes : undefined,
            orphanedNodes: orphanedNodes.length > 0 ? orphanedNodes : undefined,
            cycles: cycles.length > 0 ? cycles : undefined,
            missingEntryPoints: entryPoints.length === 0,
            missingExitPoints: exitPoints.length === 0,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * Get graph statistics
     */
    public getStatistics(): {
        nodeCount: number;
        edgeCount: number;
        entryPointCount: number;
        exitPointCount: number;
        maxDepth: number;
        cycleCount: number;
    } {
        const entryPoints = this.findEntryPoints();
        const exitPoints = this.findExitPoints();
        const cycles = this.detectCycles();
        const longestPath = this.findLongestPath();

        // Count edges
        let edgeCount = 0;
        this.adjacencyList.forEach(neighbors => {
            edgeCount += neighbors.length;
        });

        return {
            nodeCount: this.nodeMap.size,
            edgeCount,
            entryPointCount: entryPoints.length,
            exitPointCount: exitPoints.length,
            maxDepth: longestPath.length,
            cycleCount: cycles.length
        };
    }

    /**
     * Validate graph with ValidationContext for runtime error handling
     */
    public validateWithContext(context: ValidationContext): void {
        const result = this.validate();

        // Report unreachable nodes
        if (result.unreachableNodes && result.unreachableNodes.length > 0) {
            result.unreachableNodes.forEach(nodeName => {
                context.addError(createValidationError(
                    `Node '${nodeName}' is unreachable from entry points`,
                    {
                        severity: ValidationSeverity.WARNING,
                        category: ValidationCategory.GRAPH,
                        code: GraphErrorCodes.UNREACHABLE_NODE,
                        location: { node: nodeName },
                        suggestion: 'Add an edge from an entry point or init node to this node, or remove it if unused'
                    }
                ));
            });
        }

        // Report orphaned nodes
        if (result.orphanedNodes && result.orphanedNodes.length > 0) {
            result.orphanedNodes.forEach(nodeName => {
                context.addError(createValidationError(
                    `Node '${nodeName}' is orphaned (no incoming or outgoing edges)`,
                    {
                        severity: ValidationSeverity.WARNING,
                        category: ValidationCategory.GRAPH,
                        code: GraphErrorCodes.ORPHANED_NODE,
                        location: { node: nodeName },
                        suggestion: 'Connect this node to the graph or remove it if unused'
                    }
                ));
            });
        }

        // Report cycles
        if (result.cycles && result.cycles.length > 0) {
            result.cycles.forEach((cycle, index) => {
                const cyclePath = cycle.join(' → ');
                // Flag all nodes in the cycle
                cycle.forEach(nodeName => {
                    context.addError(createValidationError(
                        `Cycle detected: ${cyclePath}`,
                        {
                            severity: ValidationSeverity.WARNING,
                            category: ValidationCategory.GRAPH,
                            code: GraphErrorCodes.CYCLE_DETECTED,
                            location: { node: nodeName },
                            context: {
                                cycleIndex: index,
                                cyclePath: cycle,
                                cycleLength: cycle.length
                            },
                            suggestion: 'Ensure cycle has proper exit condition or break the cycle if unintended'
                        }
                    ));
                });
            });
        }

        // Report missing entry points
        if (result.missingEntryPoints) {
            context.addError(createValidationError(
                'No entry points found in machine',
                {
                    severity: ValidationSeverity.WARNING,
                    category: ValidationCategory.GRAPH,
                    code: GraphErrorCodes.MISSING_ENTRY,
                    suggestion: 'Add an init node or designate an entry node'
                }
            ));
        }
    }
}
