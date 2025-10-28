import { DefaultCompletionProvider, CompletionAcceptor, CompletionContext, MaybePromise, NextFeature } from 'langium/lsp';
import type { AstNode } from 'langium';
import { AstUtils } from 'langium';
import type { MachineServices } from './machine-module.js';
import { isNode, isAttribute, isAnnotation, isEdgeSegment, isEdge, isMachine, type Node, type Machine } from './generated/ast.js';
import { CompletionItemKind } from 'vscode-languageserver-protocol';

/**
 * Custom completion provider for the Machine language
 * Provides context-aware completions for:
 * - Node types (state, task, context, init, tool, note)
 * - Built-in attributes
 * - Graphviz style attributes
 * - Type annotations
 * - And more based on AST context
 */
export class MachineCompletionProvider extends DefaultCompletionProvider {

    constructor(services: MachineServices) {
        super(services);
    }

    protected override completionFor(
        context: CompletionContext,
        next: NextFeature<AstNode>,
        acceptor: CompletionAcceptor
    ): MaybePromise<void> {
        // First, call the default completion logic
        const result = super.completionFor(context, next, acceptor);

        // Then add custom completions based on context
        const astNode = context.node;

        // Add node type completions when at the start of a node declaration
        if (this.isNodeTypeContext(context, next)) {
            this.addBuiltInNodeTypes(acceptor);
        }

        // Add attribute completions based on node type
        if (isNode(astNode)) {
            this.addNodeSpecificAttributes(astNode, acceptor);
        }

        // Add Graphviz style attributes when inside @style annotation
        if (isAnnotation(astNode) && astNode.name === 'style') {
            this.addGraphvizStyleAttributes(acceptor);
        }

        // Add annotation completions
        if (this.isAnnotationContext(context, next)) {
            this.addAnnotationCompletions(acceptor);
        }

        // Add edge label completions
        if (isEdgeSegment(astNode)) {
            this.addEdgeLabelCompletions(acceptor);
        }

        // Add type completions for attributes
        if (isAttribute(astNode) && next.property === 'type') {
            this.addTypeCompletions(acceptor);
        }

        // Add node reference completions for edges (source/target)
        if ((isEdge(astNode) && next.property === 'source') ||
            (isEdgeSegment(astNode) && next.property === 'target')) {
            this.addNodeReferenceCompletions(context, acceptor);
        }

        // Add existing node names and qualified names
        if (next.property === 'source' || next.property === 'target') {
            this.addExistingNodeCompletions(context, acceptor);
        }

        // Add template variable completions when inside attribute values
        if (isAttribute(astNode) && this.isInTemplateString(context)) {
            this.addTemplateVariableCompletions(context, acceptor);
        }

        // Add arrow type completions based on relationship semantics
        if (isEdgeSegment(astNode) && this.isArrowContext(context)) {
            this.addArrowTypeCompletions(acceptor);
        }

        return result;
    }

    /**
     * Check if we're in a context where node types should be suggested
     */
    private isNodeTypeContext(context: CompletionContext, next: NextFeature<AstNode>): boolean {
        // Check if we're completing the 'type' property of a Node
        return next.property === 'type' && isNode(context.node);
    }

    /**
     * Check if we're in a context where annotations should be suggested
     */
    private isAnnotationContext(context: CompletionContext, next: NextFeature<AstNode>): boolean {
        // Check if we're at the start of an annotation
        const text = context.textDocument.getText({
            start: { line: context.position.line, character: Math.max(0, context.position.character - 1) },
            end: context.position
        });
        return text === '@';
    }

    /**
     * Add built-in node type completions
     */
    private addBuiltInNodeTypes(acceptor: CompletionAcceptor): void {
        const nodeTypes = [
            { name: 'state', doc: 'A state node representing a point in the state machine' },
            { name: 'task', doc: 'A task node that performs an action or computation' },
            { name: 'context', doc: 'A context node for shared data or configuration' },
            { name: 'init', doc: 'An initial state that serves as an entry point' },
            { name: 'tool', doc: 'A tool node representing an external capability' },
            { name: 'note', doc: 'A note attached to another node for documentation' }
        ];

        for (const type of nodeTypes) {
            acceptor({
                label: type.name,
                kind: CompletionItemKind.Keyword,
                detail: 'Node type',
                documentation: type.doc,
                sortText: '0_' + type.name // Prefix to prioritize
            });
        }
    }

    /**
     * Add attribute completions based on the node type
     */
    private addNodeSpecificAttributes(node: Node, acceptor: CompletionAcceptor): void {
        const nodeType = node.type?.toLowerCase();

        // Common attributes for all nodes
        const commonAttributes = [
            { name: 'title', detail: 'Node title', doc: 'Human-readable title for the node' },
            { name: 'description', detail: 'Node description', doc: 'Detailed description of the node' }
        ];

        // Task-specific attributes
        if (nodeType === 'task') {
            const taskAttributes = [
                { name: 'prompt', detail: 'Task prompt template', doc: 'Template string for task execution' },
                { name: 'model', detail: 'Model specification', doc: 'AI model to use for this task' },
                { name: 'temperature', detail: 'Model temperature', doc: 'Controls randomness in model output (0.0-1.0)' },
                { name: 'maxTokens', detail: 'Maximum tokens', doc: 'Maximum number of tokens to generate' },
                { name: 'timeout', detail: 'Timeout duration', doc: 'Maximum time allowed for task execution' }
            ];
            this.addAttributes([...commonAttributes, ...taskAttributes], acceptor);
        }
        // Context-specific attributes
        else if (nodeType === 'context') {
            const contextAttributes = [
                { name: 'schema', detail: 'Context schema', doc: 'Schema definition for the context data' },
                { name: 'default', detail: 'Default value', doc: 'Default value for the context' }
            ];
            this.addAttributes([...commonAttributes, ...contextAttributes], acceptor);
        }
        // Tool-specific attributes
        else if (nodeType === 'tool') {
            const toolAttributes = [
                { name: 'endpoint', detail: 'Tool endpoint', doc: 'API endpoint for the tool' },
                { name: 'method', detail: 'HTTP method', doc: 'HTTP method to use (GET, POST, etc.)' },
                { name: 'parameters', detail: 'Tool parameters', doc: 'Parameters required by the tool' }
            ];
            this.addAttributes([...commonAttributes, ...toolAttributes], acceptor);
        }
        // Note-specific attributes
        else if (nodeType === 'note') {
            const noteAttributes = [
                { name: 'target', detail: 'Target node', doc: 'The node this note is attached to' },
                { name: 'content', detail: 'Note content', doc: 'The text content of the note' }
            ];
            this.addAttributes([...commonAttributes, ...noteAttributes], acceptor);
        }
        // Default attributes for other types
        else {
            this.addAttributes(commonAttributes, acceptor);
        }
    }

    /**
     * Helper to add attributes to completion list
     */
    private addAttributes(
        attributes: Array<{ name: string; detail: string; doc: string }>,
        acceptor: CompletionAcceptor
    ): void {
        for (const attr of attributes) {
            acceptor({
                label: attr.name,
                kind: CompletionItemKind.Property,
                detail: attr.detail,
                documentation: attr.doc,
                sortText: '1_' + attr.name
            });
        }
    }

    /**
     * Add Graphviz style attribute completions
     */
    private addGraphvizStyleAttributes(acceptor: CompletionAcceptor): void {
        const graphvizAttrs = [
            { name: 'color', values: ['red', 'blue', 'green', 'black', 'gray', 'orange', 'purple', 'pink'], doc: 'Node or edge color' },
            { name: 'fillcolor', values: ['lightblue', 'lightgreen', 'lightyellow', 'lightgray', 'white'], doc: 'Fill color for the node' },
            { name: 'shape', values: ['box', 'circle', 'ellipse', 'diamond', 'hexagon', 'octagon', 'plaintext'], doc: 'Shape of the node' },
            { name: 'style', values: ['filled', 'dashed', 'dotted', 'bold', 'rounded', 'solid'], doc: 'Style of the node or edge' },
            { name: 'penwidth', values: ['1', '2', '3', '4', '5'], doc: 'Width of the pen used to draw the node or edge' },
            { name: 'fontsize', values: ['10', '12', '14', '16', '18', '20'], doc: 'Font size for labels' },
            { name: 'fontname', values: ['Arial', 'Helvetica', 'Times', 'Courier'], doc: 'Font family for labels' },
            { name: 'label', values: [], doc: 'Text label for the node or edge' },
            { name: 'xlabel', values: [], doc: 'External label for the node or edge' }
        ];

        for (const attr of graphvizAttrs) {
            acceptor({
                label: attr.name,
                kind: CompletionItemKind.Property,
                detail: 'Graphviz attribute',
                documentation: attr.doc + (attr.values.length > 0 ? `\n\nCommon values: ${attr.values.join(', ')}` : ''),
                sortText: '2_' + attr.name
            });

            // Also add value completions
            for (const value of attr.values) {
                acceptor({
                    label: value,
                    kind: CompletionItemKind.Value,
                    detail: `${attr.name} value`,
                    sortText: '3_' + value
                });
            }
        }
    }

    /**
     * Add annotation completions
     */
    private addAnnotationCompletions(acceptor: CompletionAcceptor): void {
        const annotations = [
            { name: 'Async', doc: 'Marks a task as asynchronous' },
            { name: 'Singleton', doc: 'Ensures only one instance of this node exists' },
            { name: 'Abstract', doc: 'Marks a node as abstract (cannot be instantiated)' },
            { name: 'Deprecated', doc: 'Marks a node as deprecated' },
            { name: 'StrictMode', doc: 'Enables strict validation mode (machine-level)' },
            { name: 'style', doc: 'Applies Graphviz styling to the node' }
        ];

        for (const annotation of annotations) {
            acceptor({
                label: annotation.name,
                kind: CompletionItemKind.Keyword,
                detail: 'Annotation',
                documentation: annotation.doc,
                sortText: '0_' + annotation.name
            });
        }
    }

    /**
     * Add edge label completions
     */
    private addEdgeLabelCompletions(acceptor: CompletionAcceptor): void {
        const commonLabels = [
            { name: 'reads', doc: 'Reads data from the target' },
            { name: 'writes', doc: 'Writes data to the target' },
            { name: 'stores', doc: 'Stores data in the target' },
            { name: 'uses', doc: 'Uses the target' },
            { name: 'calls', doc: 'Calls the target' },
            { name: 'triggers', doc: 'Triggers the target' },
            { name: 'depends', doc: 'Depends on the target' },
            { name: 'extends', doc: 'Extends the target' },
            { name: 'implements', doc: 'Implements the target' },
            { name: 'includes', doc: 'Includes the target' }
        ];

        for (const label of commonLabels) {
            acceptor({
                label: label.name,
                kind: CompletionItemKind.Value,
                detail: 'Edge label',
                documentation: label.doc,
                sortText: '2_' + label.name
            });
        }
    }

    /**
     * Add type completions for attribute types
     */
    private addTypeCompletions(acceptor: CompletionAcceptor): void {
        const types = [
            { name: 'string', doc: 'String type' },
            { name: 'number', doc: 'Number type' },
            { name: 'boolean', doc: 'Boolean type' },
            { name: 'object', doc: 'Object type' },
            { name: 'array', doc: 'Array type' },
            { name: 'any', doc: 'Any type' },
            { name: 'Promise', doc: 'Promise type (generic)' },
            { name: 'List', doc: 'List type (generic)' },
            { name: 'Map', doc: 'Map type (generic)' },
            { name: 'Set', doc: 'Set type (generic)' }
        ];

        for (const type of types) {
            acceptor({
                label: type.name,
                kind: CompletionItemKind.Class,
                detail: 'Type',
                documentation: type.doc,
                sortText: '1_' + type.name
            });
        }
    }

    /**
     * Get the Machine container from any AST node
     */
    private getMachine(node: AstNode): Machine | undefined {
        return AstUtils.getContainerOfType(node, isMachine);
    }

    /**
     * Get all nodes in the machine
     */
    private getAllNodes(machine: Machine): Node[] {
        const nodes: Node[] = [];
        const collectNodes = (container: { nodes?: Node[] }) => {
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
     * Add completions for existing nodes (for edge source/target)
     */
    private addExistingNodeCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const machine = this.getMachine(context.node);
        if (!machine) return;

        const allNodes = this.getAllNodes(machine);
        const seenNames = new Set<string>();

        for (const node of allNodes) {
            // Add simple name
            if (!seenNames.has(node.name)) {
                acceptor({
                    label: node.name,
                    kind: CompletionItemKind.Reference,
                    detail: node.type ? `${node.type} node` : 'node',
                    documentation: node.title || `Node: ${node.name}`,
                    sortText: '0_' + node.name
                });
                seenNames.add(node.name);
            }

            // Add qualified name if nested
            const qualifiedName = this.getQualifiedName(node);
            if (qualifiedName && !seenNames.has(qualifiedName)) {
                acceptor({
                    label: qualifiedName,
                    kind: CompletionItemKind.Reference,
                    detail: node.type ? `${node.type} node` : 'node',
                    documentation: node.title || `Node: ${qualifiedName}`,
                    sortText: '1_' + qualifiedName
                });
                seenNames.add(qualifiedName);
            }

            // Add node.attribute for attributes
            if (node.attributes && node.attributes.length > 0) {
                for (const attr of node.attributes) {
                    if (attr.name) {
                        const attrRef = `${node.name}.${attr.name}`;
                        if (!seenNames.has(attrRef)) {
                            acceptor({
                                label: attrRef,
                                kind: CompletionItemKind.Field,
                                detail: 'attribute reference',
                                documentation: `Attribute ${attr.name} of node ${node.name}`,
                                sortText: '2_' + attrRef
                            });
                            seenNames.add(attrRef);
                        }
                    }
                }
            }
        }
    }

    /**
     * Get qualified name for a node
     */
    private getQualifiedName(node: Node): string | undefined {
        const parts: string[] = [node.name];
        let current: AstNode | undefined = node.$container;

        while (current && isNode(current)) {
            parts.unshift(current.name);
            current = current.$container;
        }

        return parts.length > 1 ? parts.join('.') : undefined;
    }

    /**
     * Add node reference completions (same as existing nodes but with context)
     */
    private addNodeReferenceCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        // This is handled by addExistingNodeCompletions, but we can add more context-specific ones here
        // For example, suggest context nodes for task edges, etc.
        const machine = this.getMachine(context.node);
        if (!machine) return;

        const allNodes = this.getAllNodes(machine);

        // Filter by node type for smarter suggestions
        const contextNodes = allNodes.filter(n => n.type?.toLowerCase() === 'context');
        const taskNodes = allNodes.filter(n => n.type?.toLowerCase() === 'task');

        // If we're in an edge context, suggest relevant nodes
        if (isEdge(context.node)) {
            // Suggest context nodes with higher priority
            for (const node of contextNodes) {
                acceptor({
                    label: node.name,
                    kind: CompletionItemKind.Variable,
                    detail: 'context node',
                    documentation: `Context node: ${node.title || node.name}`,
                    sortText: '0_context_' + node.name
                });
            }
        }
    }

    /**
     * Check if we're inside a template string ({{ ... }})
     */
    private isInTemplateString(context: CompletionContext): boolean {
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position
        });

        // Check if we're inside {{ }}
        const lastOpenBrace = textBefore.lastIndexOf('{{');
        const lastCloseBrace = textBefore.lastIndexOf('}}');

        return lastOpenBrace > lastCloseBrace;
    }

    /**
     * Add template variable completions (for {{ variable }} syntax)
     */
    private addTemplateVariableCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const machine = this.getMachine(context.node);
        if (!machine) return;

        const allNodes = this.getAllNodes(machine);

        // Add all node names as possible template variables
        for (const node of allNodes) {
            acceptor({
                label: node.name,
                kind: CompletionItemKind.Variable,
                detail: node.type ? `${node.type} node` : 'node',
                documentation: `Template variable: ${node.name}`,
                sortText: '0_' + node.name
            });

            // Add node.attribute references
            if (node.attributes && node.attributes.length > 0) {
                for (const attr of node.attributes) {
                    if (attr.name) {
                        acceptor({
                            label: `${node.name}.${attr.name}`,
                            kind: CompletionItemKind.Field,
                            detail: 'attribute',
                            documentation: `Template variable: ${node.name}.${attr.name}`,
                            sortText: '1_' + node.name + '_' + attr.name
                        });
                    }
                }
            }
        }

        // Add built-in CEL variables
        const builtInVars = [
            { name: 'errorCount', doc: 'Number of errors encountered' },
            { name: 'errors', doc: 'Array of error messages' },
            { name: 'activeState', doc: 'Currently active state name' }
        ];

        for (const builtIn of builtInVars) {
            acceptor({
                label: builtIn.name,
                kind: CompletionItemKind.Constant,
                detail: 'built-in variable',
                documentation: builtIn.doc,
                sortText: '2_' + builtIn.name
            });
        }
    }

    /**
     * Check if we're in a context where arrow types should be suggested
     */
    private isArrowContext(context: CompletionContext): boolean {
        // Check if we're at a position where an arrow would appear
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: Math.max(0, context.position.character - 5) },
            end: context.position
        });

        // Look for patterns like "node1 " or "node1 --" or "node1 -"
        return /\s+-*$/.test(textBefore);
    }

    /**
     * Add arrow type completions based on relationship semantics
     */
    private addArrowTypeCompletions(acceptor: CompletionAcceptor): void {
        const arrowTypes = [
            { arrow: '->', name: 'association', doc: 'Simple association or transition' },
            { arrow: '-->', name: 'double-dash', doc: 'Strong association' },
            { arrow: '=>', name: 'fat-arrow', doc: 'Data flow or transformation' },
            { arrow: '<|--', name: 'inheritance', doc: 'Inheritance relationship (child <|-- parent)' },
            { arrow: '*-->', name: 'composition', doc: 'Composition relationship (whole owns parts)' },
            { arrow: 'o-->', name: 'aggregation', doc: 'Aggregation relationship (whole contains parts)' },
            { arrow: '<-->', name: 'bidirectional', doc: 'Bidirectional relationship' }
        ];

        for (const arrow of arrowTypes) {
            acceptor({
                label: arrow.arrow,
                kind: CompletionItemKind.Operator,
                detail: arrow.name,
                documentation: arrow.doc,
                insertText: arrow.arrow + ' ',
                sortText: '0_' + arrow.name
            });
        }
    }
}
