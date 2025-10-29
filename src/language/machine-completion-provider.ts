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

    override async getCompletion(document: any, params: any, cancelToken?: any): Promise<any> {
        // First get default completions
        const result = await super.getCompletion(document, params, cancelToken);

        if (!result) {
            return result;
        }

        // Create a context object for our custom checks
        const offset = document.textDocument.offsetAt(params.position);
        const textDocument = document.textDocument;
        const contexts = this.buildContexts(document, params.position);

        for (const context of contexts) {
            const acceptor = (ctx: any, value: any) => {
                const completionItem = this.fillCompletionItem(ctx, value);
                if (completionItem) {
                    result.items.push(completionItem);
                }
            };

            // Add custom completions that might not be triggered by grammar
            this.addCustomCompletions(context, acceptor);
        }

        return result;
    }

    /**
     * Add custom completions based on text context
     */
    private addCustomCompletions(context: any, acceptor: any): void {
        // Template variable completions
        if (this.isInTemplateString(context)) {
            this.addTemplateVariableCompletionsWithDocument(context, acceptor);
        }

        // Type completions
        if (this.isInTypeContext(context)) {
            this.addTypeCompletions(context, acceptor);
        }

        // Edge label completions
        if (this.isInEdgeContext(context)) {
            this.addEdgeLabelCompletions(context, acceptor);
        }

        // Qualified attribute completions
        if (this.isQualifiedAttributeContext(context)) {
            this.addQualifiedAttributeCompletionsWithDocument(context, acceptor);
        }
    }

    protected override completionFor(
        context: CompletionContext,
        next: NextFeature<AstNode>,
        acceptor: CompletionAcceptor
    ): MaybePromise<void> {
        // First, call the default completion logic to get grammar-based completions
        const result = super.completionFor(context, next, acceptor);

        // Then add custom completions based on context
        const astNode = context.node;

        // Node type completions - when at machine level or completing node type
        if (this.isNodeTypeContext(context, next)) {
            this.addBuiltInNodeTypes(context, acceptor);
        }

        // Attribute name completions - when inside a node body
        if (isNode(astNode)) {
            this.addNodeSpecificAttributes(context, astNode, acceptor);
        }

        // Add Graphviz style attributes when inside @style annotation
        if (this.isInStyleAnnotation(context)) {
            this.addGraphvizStyleAttributes(context, acceptor);
        }

        // Add annotation completions when @ is typed
        if (this.isAnnotationContext(context, next)) {
            this.addAnnotationCompletions(context, acceptor);
        }

        // Add edge label completions when inside edge segments
        if (this.isInEdgeContext(context)) {
            this.addEdgeLabelCompletions(context, acceptor);
        }

        // Add type completions for attributes
        if (this.isInTypeContext(context)) {
            this.addTypeCompletions(context, acceptor);
        }

        // Add node reference completions for edges
        if (this.isEdgeReferenceContext(context, next)) {
            this.addExistingNodeCompletions(context, acceptor);
        }

        // Add template variable completions when inside template strings
        if (this.isInTemplateString(context)) {
            this.addTemplateVariableCompletions(context, acceptor);
        }

        // Add arrow type completions when between nodes
        if (this.isArrowContext(context)) {
            this.addArrowTypeCompletions(context, acceptor);
        }

        // Add qualified attribute completions (node.attribute syntax outside templates)
        if (this.isQualifiedAttributeContext(context)) {
            this.addQualifiedAttributeCompletions(context, acceptor);
        }

        return result;
    }

    /**
     * Check if we're in a context where node types should be suggested
     */
    private isNodeTypeContext(context: CompletionContext, next: NextFeature<AstNode>): boolean {
        // At machine level - suggest node types
        if (isMachine(context.node)) {
            return true;
        }

        // Inside a node's body
        if (isNode(context.node)) {
            return true;
        }

        // Check if the text before cursor suggests a node type
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position
        });

        // Look for patterns like "machine "test"\n" followed by partial identifier
        const afterMachineDecl = /machine\s+[^{};]+[\r\n]\s*\w*$/.test(textBefore);

        return afterMachineDecl;
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
    private addBuiltInNodeTypes(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const nodeTypes = [
            { name: 'state', doc: 'A state node representing a point in the state machine' },
            { name: 'task', doc: 'A task node that performs an action or computation' },
            { name: 'context', doc: 'A context node for shared data or configuration' },
            { name: 'init', doc: 'An initial state that serves as an entry point' },
            { name: 'tool', doc: 'A tool node representing an external capability' },
            { name: 'note', doc: 'A note attached to another node for documentation' }
        ];

        for (const type of nodeTypes) {
            acceptor(context, {
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
    private addNodeSpecificAttributes(context: CompletionContext, node: Node, acceptor: CompletionAcceptor): void {
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
            this.addAttributes(context, commonAttributes.concat(taskAttributes), acceptor);
        }
        // Context-specific attributes
        else if (nodeType === 'context') {
            const contextAttributes = [
                { name: 'schema', detail: 'Context schema', doc: 'Schema definition for the context data' },
                { name: 'default', detail: 'Default value', doc: 'Default value for the context' }
            ];
            this.addAttributes(context, commonAttributes.concat(contextAttributes), acceptor);
        }
        // Tool-specific attributes
        else if (nodeType === 'tool') {
            const toolAttributes = [
                { name: 'endpoint', detail: 'Tool endpoint', doc: 'API endpoint for the tool' },
                { name: 'method', detail: 'HTTP method', doc: 'HTTP method to use (GET, POST, etc.)' },
                { name: 'parameters', detail: 'Tool parameters', doc: 'Parameters required by the tool' }
            ];
            this.addAttributes(context, commonAttributes.concat(toolAttributes), acceptor);
        }
        // Note-specific attributes
        else if (nodeType === 'note') {
            const noteAttributes = [
                { name: 'target', detail: 'Target node', doc: 'The node this note is attached to' },
                { name: 'content', detail: 'Note content', doc: 'The text content of the note' }
            ];
            this.addAttributes(context, commonAttributes.concat(noteAttributes), acceptor);
        }
        // Default attributes for other types (including state and init)
        else {
            const stateAttributes = [
                { name: 'initial', detail: 'Initial state', doc: 'Marks this state as initial' },
                { name: 'final', detail: 'Final state', doc: 'Marks this state as final' },
                { name: 'timeout', detail: 'State timeout', doc: 'Timeout duration for this state' }
            ];
            this.addAttributes(context, commonAttributes.concat(stateAttributes), acceptor);
        }
    }

    /**
     * Helper to add attributes to completion list
     */
    private addAttributes(
        context: CompletionContext,
        attributes: Array<{ name: string; detail: string; doc: string }>,
        acceptor: CompletionAcceptor
    ): void {
        for (const attr of attributes) {
            acceptor(context, {
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
    private addGraphvizStyleAttributes(context: CompletionContext, acceptor: CompletionAcceptor): void {
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
            acceptor(context, {
                label: attr.name,
                kind: CompletionItemKind.Property,
                detail: 'Graphviz attribute',
                documentation: attr.doc + (attr.values.length > 0 ? `\n\nCommon values: ${attr.values.join(', ')}` : ''),
                sortText: '2_' + attr.name
            });

            // Also add value completions
            for (const value of attr.values) {
                acceptor(context, {
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
    private addAnnotationCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const annotations = [
            { name: 'Async', doc: 'Marks a task as asynchronous' },
            { name: 'Singleton', doc: 'Ensures only one instance of this node exists' },
            { name: 'Abstract', doc: 'Marks a node as abstract (cannot be instantiated)' },
            { name: 'Deprecated', doc: 'Marks a node as deprecated' },
            { name: 'StrictMode', doc: 'Enables strict validation mode (machine-level)' },
            { name: 'style', doc: 'Applies Graphviz styling to the node' }
        ];

        for (const annotation of annotations) {
            acceptor(context, {
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
    private addEdgeLabelCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
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
            acceptor(context, {
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
    private addTypeCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
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
            acceptor(context, {
                label: type.name,
                kind: CompletionItemKind.Class,
                detail: 'Type',
                documentation: type.doc,
                sortText: '1_' + type.name
            });
        }
    }

    /**
     * Get the Machine container from any AST node or from context
     */
    private getMachine(node: AstNode | undefined): Machine | undefined {
        if (!node) {
            return undefined;
        }
        return AstUtils.getContainerOfType(node, isMachine);
    }

    /**
     * Get the Machine from document root
     */
    private getMachineFromDocument(document: any): Machine | undefined {
        if (document && document.parseResult && document.parseResult.value) {
            const root = document.parseResult.value;
            if (isMachine(root)) {
                return root;
            }
        }
        return undefined;
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
            // Skip nodes without names
            if (!node.name) continue;

            // Add simple name
            if (!seenNames.has(node.name)) {
                acceptor(context, {
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
                acceptor(context, {
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
                            acceptor(context, {
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
                // Skip nodes without names
                if (!node.name) continue;

                acceptor(context, {
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
        // Get text from beginning of document to cursor
        const textBefore = context.textDocument.getText({
            start: { line: 0, character: 0 },
            end: context.position
        });

        // Check if we're inside {{ }}
        // Count occurrences of {{ and }} to determine if we're inside
        const openMatches = textBefore.match(/\{\{/g);
        const closeMatches = textBefore.match(/\}\}/g);

        const openCount = openMatches ? openMatches.length : 0;
        const closeCount = closeMatches ? closeMatches.length : 0;

        // If more opens than closes, we're inside a template
        return openCount > closeCount;
    }

    /**
     * Wrapper that tries to get machine from document
     */
    private addTemplateVariableCompletionsWithDocument(context: any, acceptor: any): void {
        // Try to get machine from context node first
        let machine = context.node ? this.getMachine(context.node) : undefined;

        // If not found, try getting from document root
        if (!machine && context.document) {
            machine = this.getMachineFromDocument(context.document);
        }

        if (!machine) return;

        this.addTemplateVariableCompletionsFromMachine(context, machine, acceptor);
    }

    /**
     * Add template variable completions (for {{ variable }} syntax)
     */
    private addTemplateVariableCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const machine = this.getMachine(context.node);
        if (!machine) return;
        this.addTemplateVariableCompletionsFromMachine(context, machine, acceptor);
    }

    /**
     * Core logic for template variable completions
     */
    private addTemplateVariableCompletionsFromMachine(context: any, machine: Machine, acceptor: any): void {

        const allNodes = this.getAllNodes(machine);

        // Get text before cursor to check if we're completing after a dot
        const textBefore = context.textDocument.getText({
            start: { line: 0, character: 0 },
            end: context.position
        });

        // Check if we're completing a qualified reference (e.g., "userData.")
        const qualifiedMatch = textBefore.match(/\{\{[^}]*?([a-zA-Z_][a-zA-Z0-9_]*)\.$/);
        if (qualifiedMatch) {
            // We're after a dot, suggest attributes of that specific node
            const nodeName = qualifiedMatch[1];
            const targetNode = allNodes.find(n => n.name === nodeName);

            if (targetNode && targetNode.attributes) {
                for (const attr of targetNode.attributes) {
                    if (attr.name) {
                        acceptor(context, {
                            label: `${nodeName}.${attr.name}`,
                            kind: CompletionItemKind.Field,
                            detail: 'attribute',
                            documentation: `Attribute ${attr.name} of node ${nodeName}`,
                            sortText: '0_' + attr.name
                        });
                    }
                }
            }
            return; // Don't show other completions when completing qualified names
        }

        // Add all node names as possible template variables
        for (const node of allNodes) {
            // Skip nodes without names
            if (!node.name) continue;

            acceptor(context, {
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
                        acceptor(context, {
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
            acceptor(context, {
                label: builtIn.name,
                kind: CompletionItemKind.Constant,
                detail: 'built-in variable',
                documentation: builtIn.doc,
                sortText: '2_' + builtIn.name
            });
        }
    }

    /**
     * Check if we're in a style annotation
     */
    private isInStyleAnnotation(context: CompletionContext): boolean {
        if (isAnnotation(context.node) && context.node.name === 'style') {
            return true;
        }

        // Check if we're inside @style(...) by looking at text
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position
        });

        // Look for @style( without closing )
        const styleMatch = textBefore.match(/@style\([^)]*$/);
        return styleMatch !== null;
    }

    /**
     * Check if we're in an edge context (between arrow markers for labels)
     */
    private isInEdgeContext(context: CompletionContext): boolean {
        if (isEdgeSegment(context.node) || isEdge(context.node)) {
            return true;
        }

        // Check for arrow patterns in text - specifically looking for positions
        // like "node1 -<cursor>->" or "node1 --<cursor>-->"
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position
        });

        const textAfter = context.textDocument.getText({
            start: context.position,
            end: { line: context.position.line, character: context.position.character + 10 }
        });

        // Check if we're between arrow markers: -...- followed by > or =>
        const beforeMatch = textBefore.match(/-{1,2}[a-zA-Z0-9_]*$/);
        const afterMatch = textAfter.match(/^[a-zA-Z0-9_]*-*>/);

        return beforeMatch !== null && afterMatch !== null;
    }

    /**
     * Check if we're in a type context
     */
    private isInTypeContext(context: CompletionContext): boolean {
        // Check if we're after the < character for generic types
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position
        });

        // Look for attribute name followed by <...
        // Pattern: identifier<<cursor>> or identifier<cursor>
        const typeContextPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*<[^>]*$/;
        return typeContextPattern.test(textBefore);
    }

    /**
     * Check if we're in an edge reference context
     */
    private isEdgeReferenceContext(context: CompletionContext, next: NextFeature<AstNode>): boolean {
        // When inside edge or edge segment
        if (isEdge(context.node) || isEdgeSegment(context.node)) {
            return true;
        }

        // Check for patterns suggesting edge creation
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position
        });

        // After arrow operators
        return /-{1,2}>|=>/.test(textBefore);
    }

    /**
     * Check if we're in a context where arrow types should be suggested
     */
    private isArrowContext(context: CompletionContext): boolean {
        // When inside edge segment
        if (isEdgeSegment(context.node)) {
            return true;
        }

        // Check if we're at a position where an arrow would appear
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: Math.max(0, context.position.character - 10) },
            end: context.position
        });

        // Look for patterns like "node1 " or "node1 -" (but not complete arrows)
        // Should match after a node reference, before completing the arrow
        return /\b[a-zA-Z_][a-zA-Z0-9_]*\s+\-*$/.test(textBefore) && !/-{2}>|=>/.test(textBefore);
    }

    /**
     * Check if we're completing qualified attributes (node.attribute)
     */
    private isQualifiedAttributeContext(context: CompletionContext): boolean {
        const textBefore = context.textDocument.getText({
            start: { line: 0, character: 0 },
            end: context.position
        });

        // Check for pattern like "nodeName." at machine level (not inside templates)
        // Make sure we're NOT inside {{ }}
        if (this.isInTemplateString(context)) {
            return false;
        }

        // Look for identifier followed by dot at the end
        return /\b([a-zA-Z_][a-zA-Z0-9_]*)\.$/.test(textBefore);
    }

    /**
     * Wrapper for qualified attribute completions that tries document
     */
    private addQualifiedAttributeCompletionsWithDocument(context: any, acceptor: any): void {
        // Try to get machine from context node first
        let machine = context.node ? this.getMachine(context.node) : undefined;

        // If not found, try getting from document root
        if (!machine && context.document) {
            machine = this.getMachineFromDocument(context.document);
        }

        if (!machine) return;

        const textBefore = context.textDocument.getText({
            start: { line: 0, character: 0 },
            end: context.position
        });

        // Extract the node name before the dot
        const match = textBefore.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.$/);
        if (!match) return;

        const nodeName = match[1];
        const allNodes = this.getAllNodes(machine);
        const targetNode = allNodes.find(n => n.name === nodeName);

        if (!targetNode || !targetNode.attributes) return;

        for (const attr of targetNode.attributes) {
            if (attr.name) {
                acceptor(context, {
                    label: `${nodeName}.${attr.name}`,
                    kind: CompletionItemKind.Field,
                    detail: 'attribute',
                    documentation: `Attribute ${attr.name} of node ${nodeName}`,
                    sortText: '0_' + attr.name
                });
            }
        }
    }

    /**
     * Add qualified attribute completions (node.attribute)
     */
    private addQualifiedAttributeCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const textBefore = context.textDocument.getText({
            start: { line: 0, character: 0 },
            end: context.position
        });

        // Extract the node name before the dot
        const match = textBefore.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.$/);
        if (!match) return;

        const nodeName = match[1];
        const machine = this.getMachine(context.node);
        if (!machine) return;

        const allNodes = this.getAllNodes(machine);
        const targetNode = allNodes.find(n => n.name === nodeName);

        if (!targetNode || !targetNode.attributes) return;

        for (const attr of targetNode.attributes) {
            if (attr.name) {
                acceptor(context, {
                    label: `${nodeName}.${attr.name}`,
                    kind: CompletionItemKind.Field,
                    detail: 'attribute',
                    documentation: `Attribute ${attr.name} of node ${nodeName}`,
                    sortText: '0_' + attr.name
                });
            }
        }
    }

    /**
     * Add arrow type completions based on relationship semantics
     */
    private addArrowTypeCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
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
            acceptor(context, {
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
