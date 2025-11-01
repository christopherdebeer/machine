/**
 * Dependency Graph for Module Resolution
 *
 * Tracks dependencies between modules and detects circular dependencies
 */

import { URI } from 'langium';

/**
 * Represents a node in the dependency graph
 */
export interface DependencyNode {
    /** URI of the module */
    uri: URI;
    /** URIs of modules that this module imports */
    dependencies: Set<string>;
    /** URIs of modules that import this module */
    dependents: Set<string>;
}

/**
 * Represents a circular dependency
 */
export interface CircularDependency {
    /** The cycle path as an array of URIs */
    cycle: string[];
}

/**
 * Dependency graph for tracking module relationships
 */
export class DependencyGraph {
    private nodes: Map<string, DependencyNode> = new Map();

    /**
     * Add a module to the graph
     */
    addModule(uri: URI): void {
        const uriStr = uri.toString();
        if (!this.nodes.has(uriStr)) {
            this.nodes.set(uriStr, {
                uri,
                dependencies: new Set(),
                dependents: new Set()
            });
        }
    }

    /**
     * Add a dependency relationship between two modules
     * @param from URI of the importing module
     * @param to URI of the imported module
     */
    addDependency(from: URI, to: URI): void {
        const fromStr = from.toString();
        const toStr = to.toString();

        // Ensure both nodes exist
        this.addModule(from);
        this.addModule(to);

        // Add the dependency
        const fromNode = this.nodes.get(fromStr)!;
        const toNode = this.nodes.get(toStr)!;

        fromNode.dependencies.add(toStr);
        toNode.dependents.add(fromStr);
    }

    /**
     * Remove a dependency relationship
     */
    removeDependency(from: URI, to: URI): void {
        const fromStr = from.toString();
        const toStr = to.toString();

        const fromNode = this.nodes.get(fromStr);
        const toNode = this.nodes.get(toStr);

        if (fromNode) {
            fromNode.dependencies.delete(toStr);
        }
        if (toNode) {
            toNode.dependents.delete(fromStr);
        }
    }

    /**
     * Remove a module and all its relationships from the graph
     */
    removeModule(uri: URI): void {
        const uriStr = uri.toString();
        const node = this.nodes.get(uriStr);

        if (!node) {
            return;
        }

        // Remove all dependency relationships
        for (const depStr of node.dependencies) {
            const depNode = this.nodes.get(depStr);
            if (depNode) {
                depNode.dependents.delete(uriStr);
            }
        }

        // Remove all dependent relationships
        for (const depStr of node.dependents) {
            const depNode = this.nodes.get(depStr);
            if (depNode) {
                depNode.dependencies.delete(uriStr);
            }
        }

        // Remove the node itself
        this.nodes.delete(uriStr);
    }

    /**
     * Get all dependencies of a module
     */
    getDependencies(uri: URI): URI[] {
        const node = this.nodes.get(uri.toString());
        if (!node) {
            return [];
        }
        return Array.from(node.dependencies).map(s => URI.parse(s));
    }

    /**
     * Get all modules that depend on this module
     */
    getDependents(uri: URI): URI[] {
        const node = this.nodes.get(uri.toString());
        if (!node) {
            return [];
        }
        return Array.from(node.dependents).map(s => URI.parse(s));
    }

    /**
     * Check if there's a path from one module to another
     */
    hasPath(from: URI, to: URI): boolean {
        const fromStr = from.toString();
        const toStr = to.toString();
        const visited = new Set<string>();
        const queue: string[] = [fromStr];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === toStr) {
                return true;
            }

            if (visited.has(current)) {
                continue;
            }
            visited.add(current);

            const node = this.nodes.get(current);
            if (node) {
                queue.push(...node.dependencies);
            }
        }

        return false;
    }

    /**
     * Detect circular dependencies in the graph
     * @returns Array of circular dependency cycles found
     */
    detectCycles(): CircularDependency[] {
        const cycles: CircularDependency[] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const path: string[] = [];

        const dfs = (uriStr: string): boolean => {
            visited.add(uriStr);
            recursionStack.add(uriStr);
            path.push(uriStr);

            const node = this.nodes.get(uriStr);
            if (node) {
                for (const depStr of node.dependencies) {
                    if (!visited.has(depStr)) {
                        if (dfs(depStr)) {
                            return true;
                        }
                    } else if (recursionStack.has(depStr)) {
                        // Found a cycle
                        const cycleStart = path.indexOf(depStr);
                        const cycle = path.slice(cycleStart);
                        cycle.push(depStr); // Complete the cycle
                        cycles.push({ cycle });
                        return true;
                    }
                }
            }

            path.pop();
            recursionStack.delete(uriStr);
            return false;
        };

        // Check all nodes for cycles
        for (const uriStr of this.nodes.keys()) {
            if (!visited.has(uriStr)) {
                dfs(uriStr);
            }
        }

        return cycles;
    }

    /**
     * Get modules in topological order (dependencies before dependents)
     * @returns Array of URIs in topological order, or null if cycles exist
     */
    topologicalSort(): URI[] | null {
        // Check for cycles first
        const cycles = this.detectCycles();
        if (cycles.length > 0) {
            return null;
        }

        const sorted: string[] = [];
        const visited = new Set<string>();
        const tempMark = new Set<string>();

        const visit = (uriStr: string): void => {
            if (tempMark.has(uriStr)) {
                // This shouldn't happen as we already checked for cycles
                throw new Error('Circular dependency detected during topological sort');
            }

            if (!visited.has(uriStr)) {
                tempMark.add(uriStr);

                const node = this.nodes.get(uriStr);
                if (node) {
                    for (const depStr of node.dependencies) {
                        visit(depStr);
                    }
                }

                tempMark.delete(uriStr);
                visited.add(uriStr);
                sorted.push(uriStr);
            }
        };

        // Visit all nodes
        for (const uriStr of this.nodes.keys()) {
            if (!visited.has(uriStr)) {
                visit(uriStr);
            }
        }

        return sorted.map(s => URI.parse(s));
    }

    /**
     * Get all modules in the graph
     */
    getAllModules(): URI[] {
        return Array.from(this.nodes.keys()).map(s => URI.parse(s));
    }

    /**
     * Clear the entire graph
     */
    clear(): void {
        this.nodes.clear();
    }

    /**
     * Get the number of modules in the graph
     */
    get size(): number {
        return this.nodes.size;
    }

    /**
     * Check if a module exists in the graph
     */
    hasModule(uri: URI): boolean {
        return this.nodes.has(uri.toString());
    }
}
