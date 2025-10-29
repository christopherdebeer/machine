import { AstNode, DefaultScopeProvider, ReferenceInfo, Scope, AstNodeDescription } from 'langium';
import { Machine, Node, isNode } from './generated/ast.js';
import { stream } from 'langium';

export class MachineScopeProvider extends DefaultScopeProvider {
    /**
     * Override getScope to provide custom scoping for node references
     * Supports both simple names (backward compatible) and qualified names (parent.child)
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
                const seenNames = new Set<string>();

                // Two-pass approach to handle conflicts intelligently:
                // Pass 1: Identify conflicts
                const actualSimpleNames = new Set(
                    allNodes
                        .filter(n => !n.name.includes('.'))
                        .map(n => this.getSimpleName(n.name))
                );
                const explicitQualifiedNames = new Set(
                    allNodes
                        .filter(n => n.name.includes('.'))
                        .map(n => n.name)
                );

                // Pass 2: Register aliases for all nodes, respecting conflicts
                allNodes.forEach(node => {
                    const aliases = this.getNodeAliasesWithConflictResolution(
                        node,
                        actualSimpleNames,
                        explicitQualifiedNames
                    );
                    const attributeNames = (node.attributes ?? []).map(attr => attr.name).filter(Boolean);

                    aliases.forEach(alias => {
                        if (!seenNames.has(alias)) {
                            descriptions.push(this.descriptions.createDescription(node, alias));
                            seenNames.add(alias);
                        }

                        if (attributeNames.length > 0) {
                            attributeNames.forEach(attrName => {
                                const attributeAlias = `${alias}.${attrName}`;
                                if (!seenNames.has(attributeAlias)) {
                                    descriptions.push(this.descriptions.createDescription(node, attributeAlias));
                                    seenNames.add(attributeAlias);
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
     * Get all aliases for a node with conflict resolution
     *
     * @param node - The node to generate aliases for
     * @param actualSimpleNames - Set of simple names that are actually used by nodes
     * @param explicitQualifiedNames - Set of explicit qualified names used by nodes
     *
     * Strategy: Avoid conflicts by preventing nodes from claiming aliases
     * that belong to explicitly named nodes.
     *
     * Examples:
     * - Node "Child" in "Group" with explicit "Group.Child" existing:
     *   → Registers: "Child" only (skips "Group.Child" to avoid conflict)
     *
     * - Node "Group.Child" with actual simple "Child" existing:
     *   → Registers: "Group.Child" only (skips "Child" to avoid conflict)
     *
     * - Node "Child" in "Group" with NO explicit "Group.Child":
     *   → Registers: "Child", "Group.Child" (no conflict)
     */
    private getNodeAliasesWithConflictResolution(
        node: Node,
        actualSimpleNames: Set<string>,
        explicitQualifiedNames: Set<string>
    ): string[] {
        const aliases: string[] = [];
        const nodeName = node.name;
        const nameParts = nodeName.split('.');
        const simpleName = nameParts[nameParts.length - 1];
        const parentPath = this.getParentPath(node);
        const isQualified = nameParts.length > 1;

        if (isQualified) {
            // Node has a qualified name (contains dots)

            // Always register the explicit qualified name
            aliases.push(nodeName);

            // Only register the simple name if there's no actual simple node with that name
            if (!actualSimpleNames.has(simpleName)) {
                aliases.push(simpleName);
            }

            // If nested, register the full path
            if (parentPath.length > 0) {
                const fullPath = [...parentPath, ...nameParts].join('.');
                if (fullPath !== nodeName) {
                    aliases.push(fullPath);
                }
            }
        } else {
            // Simple node name

            // Always register the simple name
            aliases.push(simpleName);

            // Register with parent path if nested, but only if there's no explicit qualified node with that path
            if (parentPath.length > 0) {
                const qualifiedPath = [...parentPath, simpleName].join('.');
                // Only register this qualified path if no node explicitly uses it as their name
                if (!explicitQualifiedNames.has(qualifiedPath)) {
                    aliases.push(qualifiedPath);
                }
            }
        }

        return aliases;
    }
}
