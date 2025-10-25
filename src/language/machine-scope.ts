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

                allNodes.forEach(node => {
                    const aliases = this.getNodeAliases(node);
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
     * Get the qualified name for a node (e.g., parent.child.grandchild)
     * Returns undefined if the node is at the machine level
     */
    private getQualifiedName(node: Node): string | undefined {
        const parts: string[] = [node.name];
        let current: AstNode | undefined = node.$container;

        // Walk up the tree collecting parent names
        while (current && isNode(current)) {
            parts.unshift(current.name);
            current = current.$container;
        }

        // If we only have the node name itself, return undefined (no qualification needed)
        if (parts.length === 1) {
            return undefined;
        }

        return parts.join('.');
    }

    private getNodeAliases(node: Node): string[] {
        const aliases = new Set<string>();
        aliases.add(node.name);
        const qualifiedName = this.getQualifiedName(node);
        if (qualifiedName) {
            aliases.add(qualifiedName);
        }
        return Array.from(aliases);
    }
}
