import { AstNodeDescription, AstUtils, DefaultLinker, isLinkingError, LangiumDocument, LinkingError, ReferenceInfo } from 'langium';
import { Machine, Node, isMachine, } from './generated/ast.js';
import type { MachineServices } from './machine-module.js';

/**
 * Custom linker that auto-creates nodes for undefined references when not in @StrictMode
 */
export class MachineLinker extends DefaultLinker {
    
    constructor(services: MachineServices) {
        super(services);
    }

    /**
     * Override getCandidate to suppress linking errors in non-strict mode.
     * Instead of returning a LinkingError, we create a placeholder node and return its description.
     * This prevents errors from being generated at the source during the linking phase.
     */
    override getCandidate(refInfo: ReferenceInfo): AstNodeDescription | LinkingError {
        // First try the default resolution
        const candidate = super.getCandidate(refInfo);

        // If we got a linking error and we're in non-strict mode, create the node instead
        if (isLinkingError(candidate)) {
            const machine = AstUtils.getContainerOfType(refInfo.container, isMachine);
            if (machine && !this.isStrictMode(machine)) {
                // Create the placeholder node
                const nodeName = refInfo.reference.$refText;
                const placeholderNode = this.createPlaceholderNode(machine, nodeName);

                if (placeholderNode) {
                    // Return a node description for the placeholder instead of an error
                    // This prevents the LinkingError from being added to diagnostics
                    return this.createNodeDescription(placeholderNode);
                }
            }
        }

        return candidate;
    }

    /**
     * Override link to auto-create nodes before linking
     */
    override async link(document: LangiumDocument): Promise<void> {
        // First, check if we should auto-create nodes
        const machine = document.parseResult.value as Machine;
        if (isMachine(machine)) {
            const isStrict = this.isStrictMode(machine);
            
            // Only auto-create if not in strict mode
            if (!isStrict) {
                this.autoCreateMissingNodes(machine);
            }
        }
        
        // Then perform normal linking
        return super.link(document);
    }

    /**
     * Auto-create nodes for all undefined references in edges
     */
    private autoCreateMissingNodes(machine: Machine): void {
        const existingNodes = new Set<string>();
        
        // Collect all existing node names (both simple and qualified)
        const collectNodeNames = (nodes: Node[], prefix: string = '') => {
            for (const node of nodes) {
                existingNodes.add(node.name);
                // Also add qualified name if nested
                if (prefix) {
                    existingNodes.add(`${prefix}.${node.name}`);
                }
                collectNodeNames(node.nodes, prefix ? `${prefix}.${node.name}` : node.name);
            }
        };
        collectNodeNames(machine.nodes);
        
        // Collect all referenced node names from edges
        const referencedNodes = new Set<string>();
        for (const edge of machine.edges) {
            // Collect source references
            for (const source of edge.source) {
                if (source.$refText) {
                    referencedNodes.add(source.$refText);
                }
            }
            
            // Collect target references
            for (const segment of edge.segments) {
                for (const target of segment.target) {
                    if (target.$refText) {
                        referencedNodes.add(target.$refText);
                    }
                }
            }
        }
        
        // Create placeholder nodes for missing references
        for (const refText of referencedNodes) {
            if (!existingNodes.has(refText)) {
                // Extract the simple name from qualified name (e.g., "Parent.Child" -> "Child")
                const simpleName = refText.includes('.') ? refText.split('.').pop()! : refText;
                
                // Only create if the simple name doesn't exist
                if (!existingNodes.has(simpleName)) {
                    this.createPlaceholderNode(machine, simpleName);
                }
            }
        }
    }

    /**
     * Check if the machine has @StrictMode annotation
     */
    private isStrictMode(machine: Machine): boolean {
        return machine.annotations?.some(ann => ann.name === 'StrictMode') ?? false;
    }

    /**
     * Create a placeholder node for an undefined reference
     */
    private createPlaceholderNode(machine: Machine, nodeName: string): Node | undefined {
        // Check if node already exists (avoid duplicates)
        const existingNode = this.findNodeByName(machine, nodeName);
        if (existingNode) {
            return existingNode;
        }

        // Create a new placeholder node with all required Langium properties
        const placeholderNode: Node = {
            $type: 'Node',
            $container: machine,
            $containerProperty: 'nodes',
            $containerIndex: machine.nodes.length,
            name: nodeName,
            title: undefined,
            type: undefined,
            annotations: [],
            nodes: [],
            edges: [],
            attributes: []
        };

        // Add the node to the machine
        machine.nodes.push(placeholderNode);

        return placeholderNode;
    }

    /**
     * Find a node by name in the machine
     */
    private findNodeByName(machine: Machine, name: string): Node | undefined {
        const findInNodes = (nodes: Node[]): Node | undefined => {
            for (const node of nodes) {
                if (node.name === name) return node;
                const found = findInNodes(node.nodes);
                if (found) return found;
            }
            return undefined;
        };
        return findInNodes(machine.nodes);
    }

    /**
     * Create an AstNodeDescription for a node
     * This is used to return a valid description when we create placeholder nodes
     */
    private createNodeDescription(node: Node): AstNodeDescription {
        return {
            node,
            name: node.name,
            type: 'Node',
            documentUri: AstUtils.getDocument(node).uri,
            path: this.astNodeLocator.getAstNodePath(node)
        };
    }
}
