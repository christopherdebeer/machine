import { AstNode, AstUtils, CstNode } from 'langium';
import { Machine, Node, isMachine, isNode } from './generated/ast.js';

/**
 * Transforms qualified node definitions into nested structures
 *
 * Example:
 *   Input:  person grandparent.parent.child;
 *   Output: person grandparent {
 *             person parent {
 *               person child;
 *             }
 *           }
 *
 * This runs after parsing but before linking/scoping to ensure the AST
 * represents the actual nested structure that scope provider expects.
 */
export class QualifiedNameExpander {
    // Store original qualified names for note nodes (used by linker to set correct target)
    private originalQualifiedNames = new WeakMap<Node, string>();

    /**
     * Get the original qualified name of a node before expansion (if it was expanded)
     */
    getOriginalQualifiedName(node: Node): string | undefined {
        return this.originalQualifiedNames.get(node);
    }

    /**
     * Expand all qualified node names in the machine
     */
    expandQualifiedNames(machine: Machine): void {
        // Track if we're in strict mode (error on duplicate definitions vs merge)
        const isStrictMode = this.isStrictMode(machine);

        // Process root-level nodes
        this.expandNodesInContainer(machine, machine.nodes, isStrictMode);
    }

    /**
     * Recursively expand qualified names in a node container
     */
    private expandNodesInContainer(
        parent: Machine | Node,
        nodes: Node[],
        isStrictMode: boolean
    ): void {
        // We need to process nodes carefully since we'll be modifying the array
        // First collect all nodes that need expansion
        const nodesToExpand: Array<{ node: Node; index: number }> = [];

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.name.includes('.')) {
                nodesToExpand.push({ node, index: i });
            }
        }

        // Process expansions in reverse order to maintain correct indices
        for (let i = nodesToExpand.length - 1; i >= 0; i--) {
            const { node, index } = nodesToExpand[i];
            this.expandQualifiedNode(parent, nodes, node, index, isStrictMode);
        }

        // Recursively process nested nodes
        for (const node of nodes) {
            if (node.nodes && node.nodes.length > 0) {
                this.expandNodesInContainer(node, node.nodes, isStrictMode);
            }
        }
    }

    /**
     * Expand a single qualified node into nested structure
     *
     * Example: Expanding "A.B.C" in parent:
     *   1. Split "A.B.C" into ["A", "B", "C"]
     *   2. Find or create node "A" in parent
     *   3. Find or create node "B" in A
     *   4. Move/merge node "C" into B
     */
    private expandQualifiedNode(
        parent: Machine | Node,
        nodes: Node[],
        node: Node,
        nodeIndex: number,
        isStrictMode: boolean
    ): void {
        const parts = node.name.split('.');

        // If only one part, nothing to expand
        if (parts.length === 1) {
            return;
        }

        // Store the original qualified name for note nodes (needed by linker)
        // Notes use their name as target, so we need to preserve the full qualified path
        if (node.type?.toLowerCase() === 'note') {
            this.originalQualifiedNames.set(node, node.name);
        }

        // Remove the qualified node from the array (we'll re-add it nested)
        nodes.splice(nodeIndex, 1);

        // Navigate/create the nested structure
        let currentContainer: Machine | Node = parent;
        let currentNodes: Node[] = nodes;

        // Process all parts except the last one (intermediate nodes)
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];

            // Find or create the intermediate node
            let intermediateNode = currentNodes.find(n => n.name === part);

            if (!intermediateNode) {
                // Create new intermediate node
                intermediateNode = this.createIntermediateNode(
                    currentContainer,
                    part,
                    currentNodes.length,
                    node.type // Inherit type from the leaf node (can be overridden by explicit definition)
                );
                currentNodes.push(intermediateNode);
            } else {
                // Merge: If intermediate node exists, ONLY set type if it doesn't have one
                // Don't overwrite explicitly defined types
                if (!intermediateNode.type && node.type) {
                    intermediateNode.type = node.type;
                }
            }

            // Move down to the next level
            currentContainer = intermediateNode;
            currentNodes = intermediateNode.nodes;
        }

        // Handle the leaf node (last part)
        const leafName = parts[parts.length - 1];

        // Check if a node with this simple name already exists at this level
        const existingLeaf = currentNodes.find(n => n.name === leafName);

        if (existingLeaf) {
            // Merge: node already exists, merge properties
            this.mergeNodes(existingLeaf, node, isStrictMode);
        } else {
            // Create: add the leaf node with its simple name
            node.name = leafName; // Update name to simple form
            node.$container = currentContainer;
            node.$containerProperty = 'nodes';
            node.$containerIndex = currentNodes.length;
            currentNodes.push(node);
        }
    }

    /**
     * Create an intermediate node in the hierarchy
     */
    private createIntermediateNode(
        container: Machine | Node,
        name: string,
        index: number,
        type: string | undefined
    ): Node {
        const node: Node = {
            $type: 'Node',
            $container: container,
            $containerProperty: 'nodes',
            $containerIndex: index,
            name: name,
            title: undefined,
            type: type, // Inherit type from leaf node
            annotations: [],
            nodes: [],
            edges: [],
            attributes: []
        };
        return node;
    }

    /**
     * Merge node type when intermediate node already exists
     * Rules:
     *  - In strict mode: error if types conflict
     *  - In non-strict mode: last type wins, with warning
     */
    private mergeNodeType(
        existingNode: Node,
        newType: string | undefined,
        isStrictMode: boolean
    ): void {
        // If new type is undefined, nothing to merge
        if (!newType) {
            return;
        }

        // If existing has no type, adopt the new type
        if (!existingNode.type) {
            existingNode.type = newType;
            return;
        }

        // Types conflict - handle based on mode
        if (existingNode.type !== newType) {
            if (isStrictMode) {
                // In strict mode, this should become a validation error
                // For now, we preserve the existing type
                // TODO: Add validation error in validator
            } else {
                // In non-strict mode, last type wins
                // TODO: Add warning in validator
                existingNode.type = newType;
            }
        }
    }

    /**
     * Merge two nodes when both defined at same path
     * Rules:
     *  - Title: new title replaces old (if provided)
     *  - Type: merge according to strict/non-strict rules
     *  - Annotations: merge (no duplicates)
     *  - Attributes: merge (last wins for same name)
     *  - Nodes: merge recursively
     *  - Edges: combine
     */
    private mergeNodes(
        existingNode: Node,
        newNode: Node,
        isStrictMode: boolean
    ): void {
        // Merge title (new wins if provided)
        if (newNode.title) {
            existingNode.title = newNode.title;
        }

        // Merge type
        this.mergeNodeType(existingNode, newNode.type, isStrictMode);

        // Merge annotations (avoid duplicates)
        if (newNode.annotations && newNode.annotations.length > 0) {
            const existingAnnotationNames = new Set(
                existingNode.annotations?.map(a => a.name) ?? []
            );

            for (const annotation of newNode.annotations) {
                if (!existingAnnotationNames.has(annotation.name)) {
                    annotation.$container = existingNode;
                    annotation.$containerProperty = 'annotations';
                    annotation.$containerIndex = existingNode.annotations.length;
                    existingNode.annotations.push(annotation);
                }
            }
        }

        // Merge attributes (last wins for same name)
        if (newNode.attributes && newNode.attributes.length > 0) {
            for (const newAttr of newNode.attributes) {
                const existingAttrIndex = existingNode.attributes.findIndex(
                    a => a.name === newAttr.name
                );

                if (existingAttrIndex >= 0) {
                    // Replace existing attribute
                    newAttr.$container = existingNode;
                    newAttr.$containerProperty = 'attributes';
                    newAttr.$containerIndex = existingAttrIndex;
                    existingNode.attributes[existingAttrIndex] = newAttr;
                } else {
                    // Add new attribute
                    newAttr.$container = existingNode;
                    newAttr.$containerProperty = 'attributes';
                    newAttr.$containerIndex = existingNode.attributes.length;
                    existingNode.attributes.push(newAttr);
                }
            }
        }

        // Merge child nodes (recursively)
        if (newNode.nodes && newNode.nodes.length > 0) {
            for (const childNode of newNode.nodes) {
                const existingChild = existingNode.nodes.find(
                    n => n.name === childNode.name
                );

                if (existingChild) {
                    // Recursively merge child nodes
                    this.mergeNodes(existingChild, childNode, isStrictMode);
                } else {
                    // Add new child node
                    childNode.$container = existingNode;
                    childNode.$containerProperty = 'nodes';
                    childNode.$containerIndex = existingNode.nodes.length;
                    existingNode.nodes.push(childNode);
                }
            }
        }

        // Merge edges
        if (newNode.edges && newNode.edges.length > 0) {
            for (const edge of newNode.edges) {
                edge.$container = existingNode;
                edge.$containerProperty = 'edges';
                edge.$containerIndex = existingNode.edges.length;
                existingNode.edges.push(edge);
            }
        }
    }

    /**
     * Check if machine has @StrictMode annotation
     */
    private isStrictMode(machine: Machine): boolean {
        return machine.annotations?.some(ann => ann.name === 'StrictMode') ?? false;
    }
}
