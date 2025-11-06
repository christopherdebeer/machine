/**
 * Dependency Analyzer
 * Analyzes template variable references and CEL conditions to infer dependency edges
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
    private nodeAttributes: Map<string, Set<string>>; // Maps node name to set of attribute names

    constructor(machine: Machine) {
        this.machine = machine;
        this.nodeMap = this.buildNodeMap();
        this.nodeAttributes = this.buildNodeAttributeMap();
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
     * Build a map of node names to their attribute names
     */
    private buildNodeAttributeMap(): Map<string, Set<string>> {
        const map = new Map<string, Set<string>>();

        const processNode = (node: Node) => {
            const attrNames = new Set<string>();
            node.attributes?.forEach(attr => {
                if (attr.name) {
                    attrNames.add(attr.name);
                }
            });
            map.set(node.name, attrNames);

            // Recursively process child nodes
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
     * Extract CEL condition from edge label
     * Looks for patterns like: when: "condition", unless: "condition", if: "condition"
     */
    private extractCelCondition(edgeLabel: string): string | null {
        // Look for when: pattern
        const whenMatch = edgeLabel.match(/when:\s*['"]([^'"]+)['"]/i);
        if (whenMatch) {
            return whenMatch[1];
        }

        // Look for unless: pattern (we'll negate it)
        const unlessMatch = edgeLabel.match(/unless:\s*['"]([^'"]+)['"]/i);
        if (unlessMatch) {
            return unlessMatch[1]; // Return as-is, negation is semantic
        }

        // Look for if: pattern
        const ifMatch = edgeLabel.match(/if:\s*['"]([^'"]+)['"]/i);
        if (ifMatch) {
            return ifMatch[1];
        }

        return null;
    }

    /**
     * Extract variable references from a CEL condition
     * Returns identifiers that could be attribute names
     * Examples: "errorCount > 0" => ["errorCount"]
     *           "retries < maxRetries" => ["retries", "maxRetries"]
     *           "config.retry.maxAttempts == 3" => ["config"]
     */
    private extractCelVariables(condition: string): string[] {
        const variables: string[] = [];

        // Pattern to match identifiers (variable names)
        // This matches the first part of dotted paths like "config.retry.maxAttempts" => "config"
        const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        let match;

        // Reserved CEL keywords and built-in variables that shouldn't be treated as node references
        const reserved = new Set(['true', 'false', 'null', 'errorCount', 'errors', 'activeState']);

        while ((match = identifierPattern.exec(condition)) !== null) {
            const identifier = match[1];
            if (!reserved.has(identifier)) {
                variables.push(identifier);
            }
        }

        // Remove duplicates
        return [...new Set(variables)];
    }

    /**
     * Find which node defines a given attribute name
     * Returns the node name that has this attribute, or null if not found
     */
    private findNodeByAttribute(attributeName: string): string | null {
        for (const [nodeName, attributes] of this.nodeAttributes.entries()) {
            if (attributes.has(attributeName)) {
                return nodeName;
            }
        }
        return null;
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
     * Analyze edge conditions for dependencies
     * Extracts CEL conditions and resolves variable references to nodes
     */
    private analyzeEdgeConditions(): InferredDependency[] {
        const dependencies: InferredDependency[] = [];

        // Analyze all edges in the machine
        this.machine.edges?.forEach(edge => {
            edge.segments.forEach(segment => {
                // Get edge label (could contain condition)
                if (!segment.label || segment.label.length === 0) return;

                // Extract label text from AST
                const labelText = segment.label
                    .map(l => {
                        if (l.$cstNode && 'text' in l.$cstNode) {
                            return l.$cstNode.text;
                        }
                        return '';
                    })
                    .filter(t => t)
                    .join(' ');

                if (!labelText) return;

                // Extract CEL condition
                const condition = this.extractCelCondition(labelText);
                if (!condition) return;

                // Extract variables from condition
                const variables = this.extractCelVariables(condition);

                // For each variable, find which node defines it
                variables.forEach(varName => {
                    // First check if it's directly a node name
                    if (this.nodeMap.has(varName)) {
                        // It's a node reference
                        edge.source.forEach(sourceRef => {
                            const sourceName = sourceRef.ref?.name;
                            if (sourceName && sourceName !== varName) {
                                dependencies.push({
                                    source: sourceName,
                                    target: varName,
                                    reason: `condition references ${varName}`,
                                    path: condition
                                });
                            }
                        });
                    } else {
                        // Check if it's an attribute defined by a node
                        const definingNode = this.findNodeByAttribute(varName);
                        if (definingNode) {
                            edge.source.forEach(sourceRef => {
                                const sourceName = sourceRef.ref?.name;
                                if (sourceName && sourceName !== definingNode) {
                                    dependencies.push({
                                        source: sourceName,
                                        target: definingNode,
                                        reason: `condition references ${varName}`,
                                        path: condition
                                    });
                                }
                            });
                        }
                    }
                });
            });
        });

        return dependencies;
    }

    /**
     * Analyze all nodes and infer dependencies based on template variable usage and edge conditions
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

        // Analyze edge conditions for dependencies
        const edgeDeps = this.analyzeEdgeConditions();
        edgeDeps.forEach(dep => {
            const key = `${dep.source}:${dep.target}:${dep.path}`;
            if (!seen.has(key)) {
                seen.add(key);
                dependencies.push(dep);
            }
        });

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
