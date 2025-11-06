import { AstNode, DefaultScopeProvider, ReferenceInfo, Scope, AstNodeDescription } from 'langium';
import { Machine, Node, isNode } from './generated/ast.js';
import { stream } from 'langium';

export class MachineScopeProvider extends DefaultScopeProvider {
    /**
     * Override getScope to provide custom scoping for node references
     * Supports both simple names (backward compatible) and qualified names (parent.child)
     *
     * Strategy: Register all valid paths to each node naturally.
     * Explicit node names (exact matches) take precedence over path-based aliases.
     */
    override getScope(context: ReferenceInfo): Scope {
        // For node references in edges and notes, we want to include all nodes in the machine
        // Note: 'target' property is used in both Edge (for target node) and Note (for target node)
        if (context.property === 'source' || context.property === 'target') {
            const machine = this.getMachineContainer(context.container);
            if (machine) {
                // Get all nodes in the machine, including nested ones
                const allNodes = this.getAllNodes(machine);
                const descriptions: AstNodeDescription[] = [];
                const seenAliases = new Map<string, Node>(); // Track which node each alias points to

                // First pass: collect all explicit node names (to detect conflicts)
                const explicitNames = new Set(allNodes.map(n => n.name));

                // Second pass: register aliases with precedence for explicit names
                allNodes.forEach(node => {
                    const aliases = this.getNodeAliases(node, explicitNames);
                    const attributeNames = (node.attributes ?? []).map(attr => attr.name).filter(Boolean);

                    aliases.forEach(alias => {
                        // Register this alias if not seen (first wins)
                        if (!seenAliases.has(alias)) {
                            descriptions.push(this.descriptions.createDescription(node, alias));
                            seenAliases.set(alias, node);
                        }

                        // Register attribute access for this alias
                        if (attributeNames.length > 0) {
                            attributeNames.forEach(attrName => {
                                const attributeAlias = `${alias}.${attrName}`;
                                if (!seenAliases.has(attributeAlias)) {
                                    descriptions.push(this.descriptions.createDescription(node, attributeAlias));
                                    seenAliases.set(attributeAlias, node);
                                }
                            });
                        }
                    });
                });

                return this.createScope(stream(descriptions));
            }
        }
        return super.getScope(context);
    }

    /**
     * Get the Machine container for any AST node
     */
    private getMachineContainer(node: AstNode): Machine | undefined {
        let current: AstNode | undefined = node;
        while (current && !('title' in current)) {
            current = current.$container;
        }
        return current as Machine;
    }

    /**
     * Recursively get all nodes in a machine, including nested ones
     */
    private getAllNodes(machine: Machine): Node[] {
        const nodes: Node[] = [];

        const collectNodes = (container: { nodes?: Node[] }) => {
            // Check if nodes array exists and is iterable
            if (!container.nodes || !Array.isArray(container.nodes)) {
                return;
            }
            
            for (const node of container.nodes) {
                nodes.push(node);
                if (isNode(node) && node.nodes && node.nodes.length > 0) {
                    collectNodes(node);
                }
            }
        };

        collectNodes(machine);
        return nodes;
    }

    /**
     * Extract the simple name from a potentially qualified name
     * E.g., "Group.Child" -> "Child", "Simple" -> "Simple"
     */
    private getSimpleName(name: string): string {
        const parts = name.split('.');
        return parts[parts.length - 1];
    }

    /**
     * Get the parent path for a node by walking up the AST
     * E.g., for a node inside Group1 inside Group2: ["Group2", "Group1"]
     */
    private getParentPath(node: Node): string[] {
        const parents: string[] = [];
        let current: AstNode | undefined = node.$container;

        while (current && isNode(current)) {
            parents.unshift(this.getSimpleName(current.name));
            current = current.$container;
        }

        return parents;
    }

    /**
     * Get all natural aliases for a node
     *
     * Strategy: Register all valid paths to reach this node.
     * Skip path-based aliases that conflict with explicit node names.
     *
     * Examples:
     * - Node "Child" in "Group" (no conflict):
     *   → Registers: "Child", "Group.Child"
     *
     * - Node "Child" in "Group" (with explicit "Group.Child" node):
     *   → Registers: "Child" only (skips "Group.Child" path)
     *
     * - Node "Group.Subprocess" in "Group":
     *   → Registers: "Group.Subprocess", "Subprocess", "Group.Group.Subprocess"
     *
     * - Node "Task" at root:
     *   → Registers: "Task"
     */
    private getNodeAliases(node: Node, explicitNames: Set<string>): string[] {
        const aliases: string[] = [];
        const nodeName = node.name;
        const nameParts = nodeName.split('.');
        const simpleName = nameParts[nameParts.length - 1];
        const parentPath = this.getParentPath(node);

        // Always register the declared name (exactly as written)
        aliases.push(nodeName);

        // If the declared name is qualified (contains dots), also register just the simple part
        if (nameParts.length > 1) {
            aliases.push(simpleName);
        }

        // If nested, register the full path from root (unless it conflicts with an explicit name)
        if (parentPath.length > 0) {
            if (nameParts.length > 1) {
                // Declared name is qualified: parent path + all name parts
                const fullPath = [...parentPath, ...nameParts].join('.');
                if (fullPath !== nodeName && !explicitNames.has(fullPath)) {
                    aliases.push(fullPath);
                }
            } else {
                // Declared name is simple: parent path + simple name
                const qualifiedPath = [...parentPath, simpleName].join('.');
                // Only register if it's different from the node name AND doesn't conflict with an explicit name
                if (qualifiedPath !== nodeName && !explicitNames.has(qualifiedPath)) {
                    aliases.push(qualifiedPath);
                }
            }
        }

        return aliases;
    }
}
