/**
 * Dependency Analyzer
 * Analyzes template variable references and infers dependency edges
 */

import type { Machine, Node, Attribute } from './generated/ast.js';

export interface InferredDependency {
    source: string;
    target: string;
    reason: string;
    path: string;
}

export class DependencyAnalyzer {
    private machine: Machine;
    private nodeMap: Map<string, Node>;

    constructor(machine: Machine) {
        this.machine = machine;
        this.nodeMap = this.buildNodeMap();
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
     * Extract template variable references from a string
     * Matches patterns like {{ variable }}, {{ object.property }}, {{ context.value }}
     */
    private extractTemplateReferences(text: string): string[] {
        const references: string[] = [];
        const pattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            references.push(match[1]);
        }

        return references;
    }

    /**
     * Resolve a template reference to a node name
     * Example: "config.apiKey" => "config"
     */
    private resolveReferenceToNode(reference: string): string | null {
        // Split by dot to get the root object
        const parts = reference.split('.');
        const rootName = parts[0];

        // Check if this root name exists as a node
        if (this.nodeMap.has(rootName)) {
            return rootName;
        }

        return null;
    }

    /**
     * Analyze a single attribute for template references
     */
    private analyzeAttribute(attr: Attribute, nodeName: string): InferredDependency[] {
        const dependencies: InferredDependency[] = [];

        if (!attr.value) return dependencies;

        // Convert attribute value to string for analysis
        let valueStr: string = '';

        if (typeof attr.value === 'string') {
            valueStr = attr.value;
        } else if (attr.value && typeof attr.value === 'object') {
            // Handle AST node value
            if ('value' in attr.value) {
                const val = (attr.value as any).value;
                if (typeof val === 'string') {
                    valueStr = val;
                } else if (Array.isArray(val) && val.length > 0) {
                    valueStr = val.join(' ');
                }
            }
            // Try getting text from CST node
            if (!valueStr && '$cstNode' in attr.value) {
                const cstNode = (attr.value as any).$cstNode;
                if (cstNode && 'text' in cstNode) {
                    valueStr = cstNode.text;
                }
            }
        }

        if (!valueStr) return dependencies;

        // Extract template references
        const references = this.extractTemplateReferences(valueStr);

        for (const ref of references) {
            const targetNode = this.resolveReferenceToNode(ref);

            if (targetNode && targetNode !== nodeName) {
                dependencies.push({
                    source: nodeName,
                    target: targetNode,
                    reason: `reads ${attr.name}`,
                    path: ref
                });
            }
        }

        return dependencies;
    }

    /**
     * Analyze all nodes and infer dependencies based on template variable usage
     */
    public inferDependencies(): InferredDependency[] {
        const dependencies: InferredDependency[] = [];
        const seen = new Set<string>(); // Track unique dependencies

        const analyzeNode = (node: Node) => {
            // Analyze all attributes
            node.attributes?.forEach(attr => {
                const deps = this.analyzeAttribute(attr, node.name);
                deps.forEach(dep => {
                    const key = `${dep.source}:${dep.target}:${dep.path}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        dependencies.push(dep);
                    }
                });
            });

            // Recursively analyze child nodes
            node.nodes.forEach(child => analyzeNode(child));
        };

        this.machine.nodes.forEach(node => analyzeNode(node));

        return dependencies;
    }

    /**
     * Get all nodes that a specific node depends on
     */
    public getDependenciesFor(nodeName: string): InferredDependency[] {
        const allDeps = this.inferDependencies();
        return allDeps.filter(dep => dep.source === nodeName);
    }

    /**
     * Get all nodes that depend on a specific node
     */
    public getDependentsOf(nodeName: string): InferredDependency[] {
        const allDeps = this.inferDependencies();
        return allDeps.filter(dep => dep.target === nodeName);
    }

    /**
     * Check if a node depends on another node (directly or transitively)
     */
    public hasDependency(source: string, target: string): boolean {
        const visited = new Set<string>();
        const queue: string[] = [source];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === target) return true;
            if (visited.has(current)) continue;

            visited.add(current);

            const deps = this.getDependenciesFor(current);
            deps.forEach(dep => {
                if (!visited.has(dep.target)) {
                    queue.push(dep.target);
                }
            });
        }

        return false;
    }

    /**
     * Detect circular dependencies
     */
    public detectCircularDependencies(): string[][] {
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const recursionStack: string[] = [];

        const dfs = (nodeName: string, path: string[]): void => {
            if (recursionStack.includes(nodeName)) {
                // Found a cycle
                const cycleStart = recursionStack.indexOf(nodeName);
                const cycle = [...recursionStack.slice(cycleStart), nodeName];
                cycles.push(cycle);
                return;
            }

            if (visited.has(nodeName)) return;

            visited.add(nodeName);
            recursionStack.push(nodeName);

            const deps = this.getDependenciesFor(nodeName);
            deps.forEach(dep => {
                dfs(dep.target, [...path, dep.target]);
            });

            recursionStack.pop();
        };

        this.nodeMap.forEach((_, nodeName) => {
            if (!visited.has(nodeName)) {
                dfs(nodeName, [nodeName]);
            }
        });

        return cycles;
    }
}
