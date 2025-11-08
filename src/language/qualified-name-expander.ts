import { AstNode } from 'langium';
import { Machine, Node } from './generated/ast.js';

type NodeChildProperty = 'annotations' | 'attributes' | 'edges' | 'nodes';

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
    private attachChild<T extends AstNode>(
        child: T,
        container: Machine | Node,
        property: NodeChildProperty,
        index: number
    ): void {
        child.$container = container;
        child.$containerProperty = property;
        child.$containerIndex = index;
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
            this.attachChild(node, currentContainer, 'nodes', currentNodes.length);
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
            name: name,
            title: undefined,
            type: type, // Inherit type from leaf node
            annotations: [],
            nodes: [],
            edges: [],
            attributes: []
        };
        this.attachChild(node, container, 'nodes', index);
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

        this.mergeAnnotations(existingNode, newNode);
        this.mergeAttributes(existingNode, newNode);
        this.mergeChildNodes(existingNode, newNode, isStrictMode);
        this.mergeEdges(existingNode, newNode);
    }

    /**
     * Check if machine has @StrictMode annotation
     */
    private isStrictMode(machine: Machine): boolean {
        return machine.annotations?.some(ann => ann.name === 'StrictMode') ?? false;
    }

    private mergeAnnotations(existingNode: Node, newNode: Node): void {
        if (!newNode.annotations || newNode.annotations.length === 0) {
            return;
        }

        const existingAnnotations =
            existingNode.annotations ?? (existingNode.annotations = []);
        const existingAnnotationNames = new Set(
            existingAnnotations.map(annotation => annotation.name)
        );

        for (const annotation of newNode.annotations) {
            if (existingAnnotationNames.has(annotation.name)) {
                continue;
            }

            this.attachChild(annotation, existingNode, 'annotations', existingAnnotations.length);
            existingAnnotations.push(annotation);
            existingAnnotationNames.add(annotation.name);
        }
    }

    private mergeAttributes(existingNode: Node, newNode: Node): void {
        if (!newNode.attributes || newNode.attributes.length === 0) {
            return;
        }

        const existingAttributes =
            existingNode.attributes ?? (existingNode.attributes = []);

        for (const newAttr of newNode.attributes) {
            const existingAttrIndex = existingAttributes.findIndex(
                attribute => attribute.name === newAttr.name
            );

            if (existingAttrIndex >= 0) {
                this.attachChild(newAttr, existingNode, 'attributes', existingAttrIndex);
                existingAttributes[existingAttrIndex] = newAttr;
            } else {
                this.attachChild(newAttr, existingNode, 'attributes', existingAttributes.length);
                existingAttributes.push(newAttr);
            }
        }
    }

    private mergeChildNodes(
        existingNode: Node,
        newNode: Node,
        isStrictMode: boolean
    ): void {
        if (!newNode.nodes || newNode.nodes.length === 0) {
            return;
        }

        const existingChildren = existingNode.nodes ?? (existingNode.nodes = []);

        for (const childNode of newNode.nodes) {
            const existingChild = existingChildren.find(node => node.name === childNode.name);

            if (existingChild) {
                this.mergeNodes(existingChild, childNode, isStrictMode);
            } else {
                this.attachChild(childNode, existingNode, 'nodes', existingChildren.length);
                existingChildren.push(childNode);
            }
        }
    }

    private mergeEdges(existingNode: Node, newNode: Node): void {
        if (!newNode.edges || newNode.edges.length === 0) {
            return;
        }

        const existingEdges = existingNode.edges ?? (existingNode.edges = []);

        for (const edge of newNode.edges) {
            this.attachChild(edge, existingNode, 'edges', existingEdges.length);
            existingEdges.push(edge);
        }
    }
}
