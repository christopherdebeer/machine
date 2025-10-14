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
        if (context.property === 'source' || context.property === 'target') {
            const machine = this.getMachineContainer(context.container);
            if (machine) {
                // Get all nodes in the machine, including nested ones
                const allNodes = this.getAllNodes(machine);
                const descriptions: AstNodeDescription[] = [];

                // Create descriptions for simple names (backward compatible)
                allNodes.forEach(node => {
                    descriptions.push(this.descriptions.createDescription(node, node.name));
                });

                // Create descriptions for qualified names (parent.child, parent.child.grandchild, etc.)
                allNodes.forEach(node => {
                    const qualifiedName = this.getQualifiedName(node);
                    if (qualifiedName && qualifiedName !== node.name) {
                        descriptions.push(this.descriptions.createDescription(node, qualifiedName));
                    }
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

        const collectNodes = (container: { nodes: Node[] }) => {
            for (const node of container.nodes) {
                nodes.push(node);
                if (isNode(node) && node.nodes.length > 0) {
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
}
