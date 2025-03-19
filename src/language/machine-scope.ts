import { AstNode, DefaultScopeProvider, ReferenceInfo, Scope } from 'langium';
import { Machine, Node, isNode } from './generated/ast.js';
import { stream } from 'langium';

export class MachineScopeProvider extends DefaultScopeProvider {
    /**
     * Override getScope to provide custom scoping for node references
     */
    override getScope(context: ReferenceInfo): Scope {
        // For node references in edges, we want to include all nodes in the machine
        if (context.property === 'source' || context.property === 'target') {
            const machine = this.getMachineContainer(context.container);
            if (machine) {
                // Get all nodes in the machine, including nested ones
                const allNodes = this.getAllNodes(machine);
                const descriptions = allNodes.map(node => this.descriptions.createDescription(node, node.name));
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
}
