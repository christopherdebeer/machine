/**
 * Machine Executor
 * Executes machine programs by traversing the JSON representation
 */

import {
    LLMClient,
    LLMClientConfig,
    createLLMClient,
    ToolDefinition,
    ConversationMessage,
    ContentBlock
} from './llm-client.js';
import { BedrockClient } from './bedrock-client.js';
import { compilePrompt, TaskPromptContext, TASK_PROMPT_TEMPLATES } from './prompts/task-prompts.js';

export interface MachineExecutionContext {
    currentNode: string;
    visitedNodes: Set<string>;
    attributes: Map<string, any>;
    history: Array<{
        from: string;
        to: string;
        transition: string;
        timestamp: string;
        output?: string;
    }>;
}

export interface MachineData {
    title: string;
    nodes: Array<{
        name: string;
        type?: string;
        attributes?: Array<{
            name: string;
            type: string;
            value: string;
        }>;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type?: string;
        label?: string;
    }>;
}

export interface MachineMutation {
    type: 'add_node' | 'add_edge' | 'modify_node' | 'remove_node';
    timestamp: string;
    data: any;
}

export interface MachineExecutorConfig {
    llm?: LLMClientConfig;
    // Deprecated: use llm config instead
    bedrock?: {
        region?: string;
        modelId?: string;
    };
}

export class MachineExecutor {
    private context: MachineExecutionContext;
    private machineData: MachineData;
    private llmClient: LLMClient;
    private mutations: MachineMutation[] = [];

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        this.machineData = machineData;
        this.context = {
            currentNode: this.machineData.nodes.length > 0 ? this.findStartNode() : '',
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        // Support legacy bedrock config for backwards compatibility
        if (config.bedrock && !config.llm) {
            this.llmClient = new BedrockClient(config.bedrock);
        } else if (config.llm) {
            // For sync construction, we'll create a placeholder that will be replaced in the static create method
            // This is a temporary client that will be replaced
            this.llmClient = new BedrockClient();
        } else {
            // Default to Bedrock with default config
            this.llmClient = new BedrockClient();
        }
    }

    /**
     * Initialize with async LLM client creation
     */
    static async create(machineData: MachineData, config: MachineExecutorConfig = {}): Promise<MachineExecutor> {
        const executor = new MachineExecutor(machineData, config);

        if (config.llm) {
            executor.llmClient = await createLLMClient(config.llm);
        }

        return executor;
    }

    /**
     * Find the start node of the machine
     * By convention, looks for a node named "start" or the first node if none found
     */
    private findStartNode(): string {
        const startNode = this.machineData.nodes.find(node => node.name.toLowerCase() === 'start');
        if (startNode) {
            return startNode.name;
        }
        if (this.machineData.nodes.length === 0) {
            throw new Error('Machine has no nodes');
        }
        return this.machineData.nodes[0].name;
    }

    /**
     * Get available transitions from the current node
     */
    private getAvailableTransitions(): Array<{ target: string; type?: string }> {
        return this.machineData.edges
            .filter(edge => edge.source === this.context.currentNode)
            .map(edge => ({
                target: edge.target,
                type: edge.type
            }));
    }

    /**
     * Recursively extract value from Langium AST nodes
     */
    private extractValueFromAST(value: any): any {
        // If it's not an object, return as-is
        if (!value || typeof value !== 'object') {
            return value;
        }

        // If it's a Langium AST node object
        if ('$type' in value) {
            const astNode = value as any;

            // Try to get text from CST node first (most accurate)
            if ('$cstNode' in astNode && astNode.$cstNode && 'text' in astNode.$cstNode) {
                let text = astNode.$cstNode.text;
                // Remove quotes if present
                if (typeof text === 'string') {
                    text = text.replace(/^["']|["']$/g, '');
                }
                return text;
            }

            // Try to get nested value property and recurse
            if ('value' in astNode) {
                return this.extractValueFromAST(astNode.value);
            }

            // If no value found, try stringifying but this might give [object Object]
            return String(value);
        }

        // Not an AST node, return as-is
        return value;
    }

    /**
     * Get the current node's attributes as a key-value object
     */
    private getCurrentNodeAttributes(): Record<string, any> {
        const node = this.machineData.nodes.find(n => n.name === this.context.currentNode);
        if (!node?.attributes) {
            return {};
        }

        return node.attributes.reduce((acc, attr) => {
            // Handle the case where attr.value might be an object (from JSON parsing or AST)
            let value = this.extractValueFromAST(attr.value);

            // If the value is a string that looks like JSON, try to parse it
            if (typeof value === 'string') {
                try {
                    // Check if it looks like JSON (starts with { or [)
                    if ((value.startsWith('{') && value.endsWith('}')) ||
                        (value.startsWith('[') && value.endsWith(']'))) {
                        value = JSON.parse(value);
                    }
                } catch (error) {
                    // If parsing fails, keep the original string value
                }
            }

            acc[attr.name] = value;
            return acc;
        }, {} as Record<string, any>);
    }

    /**
     * Generate transition tools from outbound edges
     */
    private generateTransitionTools(): ToolDefinition[] {
        const transitions = this.getAvailableTransitions();

        if (transitions.length === 0) {
            return [];
        }

        // Create a tool that lets LLM choose which edge to traverse
        const transitionDescriptions = transitions
            .map(t => `"${t.target}"${t.type ? ` (${t.type})` : ''}`)
            .join(', ');

        return [{
            name: 'transition',
            description: 'Choose the next state to transition to based on the task outcome',
            input_schema: {
                type: 'object',
                properties: {
                    target: {
                        type: 'string',
                        enum: transitions.map(t => t.target),
                        description: `Available transitions: ${transitionDescriptions}`
                    },
                    reason: {
                        type: 'string',
                        description: 'Explanation for why this transition was chosen'
                    }
                },
                required: ['target', 'reason']
            }
        }];
    }

    /**
     * Generate meta tools for self-modification
     */
    private generateMetaTools(): ToolDefinition[] {
        return [
            {
                name: 'get_machine_definition',
                description: 'Get the current machine structure (nodes, edges, attributes)',
                input_schema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'add_node',
                description: 'Add a new node to the machine',
                input_schema: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Unique node name'
                        },
                        type: {
                            type: 'string',
                            description: 'Node type (e.g., "task", "state")'
                        },
                        attributes: {
                            type: 'object',
                            description: 'Node attributes as key-value pairs'
                        }
                    },
                    required: ['name', 'type']
                }
            },
            {
                name: 'add_edge',
                description: 'Add a new edge between nodes',
                input_schema: {
                    type: 'object',
                    properties: {
                        source: {
                            type: 'string',
                            description: 'Source node name'
                        },
                        target: {
                            type: 'string',
                            description: 'Target node name'
                        },
                        type: {
                            type: 'string',
                            description: 'Optional edge type/label'
                        }
                    },
                    required: ['source', 'target']
                }
            },
            {
                name: 'modify_node',
                description: 'Modify attributes of an existing node',
                input_schema: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Node name to modify'
                        },
                        attributes: {
                            type: 'object',
                            description: 'Attributes to update/add'
                        }
                    },
                    required: ['name', 'attributes']
                }
            },
            {
                name: 'remove_node',
                description: 'Remove a node from the machine (also removes connected edges)',
                input_schema: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Node name to remove'
                        }
                    },
                    required: ['name']
                }
            },
            {
                name: 'get_execution_context',
                description: 'Get current execution state including history, visited nodes, and metrics',
                input_schema: {
                    type: 'object',
                    properties: {}
                }
            }
        ];
    }

    /**
     * Generate context management tools for working with context nodes
     */
    private generateContextTools(): ToolDefinition[] {
        return [
            {
                name: 'set_context_value',
                description: 'Set a value in a context node attribute with type validation',
                input_schema: {
                    type: 'object',
                    properties: {
                        nodeName: {
                            type: 'string',
                            description: 'Name of the context node to update'
                        },
                        attributeName: {
                            type: 'string',
                            description: 'Name of the attribute to set'
                        },
                        value: {
                            type: ['string', 'number', 'boolean', 'object', 'array'],
                            description: 'Value to set (will be validated against declared type)'
                        }
                    },
                    required: ['nodeName', 'attributeName', 'value']
                }
            },
            {
                name: 'get_context_value',
                description: 'Get a value from a context node attribute',
                input_schema: {
                    type: 'object',
                    properties: {
                        nodeName: {
                            type: 'string',
                            description: 'Name of the context node to read from'
                        },
                        attributeName: {
                            type: 'string',
                            description: 'Name of the attribute to get'
                        }
                    },
                    required: ['nodeName', 'attributeName']
                }
            },
            {
                name: 'list_context_nodes',
                description: 'List all context nodes and their current values',
                input_schema: {
                    type: 'object',
                    properties: {}
                }
            }
        ];
    }

    /**
     * Handle tool use invocations
     */
    private handleToolUse(toolName: string, toolInput: any): any {
        switch (toolName) {
            case 'transition':
                return { success: true, target: toolInput.target, reason: toolInput.reason };

            case 'get_machine_definition':
                return this.getMachineDefinition();

            case 'add_node':
                this.addNode(toolInput);
                return { success: true, message: `Node ${toolInput.name} added` };

            case 'add_edge':
                this.addEdge(toolInput);
                return { success: true, message: `Edge ${toolInput.source} -> ${toolInput.target} added` };

            case 'modify_node':
                this.modifyNode(toolInput.name, toolInput.attributes);
                return { success: true, message: `Node ${toolInput.name} modified` };

            case 'remove_node':
                this.removeNode(toolInput.name);
                return { success: true, message: `Node ${toolInput.name} removed` };

            case 'get_execution_context':
                return this.getContextSnapshot();

            case 'set_context_value':
                return this.setContextValue(toolInput.nodeName, toolInput.attributeName, toolInput.value);

            case 'get_context_value':
                return this.getContextValue(toolInput.nodeName, toolInput.attributeName);

            case 'list_context_nodes':
                return this.listContextNodes();

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Add a new node to the machine
     */
    public addNode(node: {
        name: string;
        type?: string;
        attributes?: Record<string, any>;
    }): void {
        // Check for duplicates
        if (this.machineData.nodes.find(n => n.name === node.name)) {
            throw new Error(`Node ${node.name} already exists`);
        }

        const newNode: any = {
            name: node.name,
            type: node.type
        };

        if (node.attributes) {
            newNode.attributes = Object.entries(node.attributes).map(([name, value]) => ({
                name,
                type: typeof value,
                value: String(value)
            }));
        }

        this.machineData.nodes.push(newNode);
        this.recordMutation({
            type: 'add_node',
            timestamp: new Date().toISOString(),
            data: node
        });
    }

    /**
     * Add a new edge between nodes
     */
    public addEdge(edge: {
        source: string;
        target: string;
        type?: string;
        label?: string;
    }): void {
        // Validate nodes exist
        if (!this.machineData.nodes.find(n => n.name === edge.source)) {
            throw new Error(`Source node ${edge.source} not found`);
        }
        if (!this.machineData.nodes.find(n => n.name === edge.target)) {
            throw new Error(`Target node ${edge.target} not found`);
        }

        this.machineData.edges.push(edge);
        this.recordMutation({
            type: 'add_edge',
            timestamp: new Date().toISOString(),
            data: edge
        });
    }

    /**
     * Modify attributes of an existing node
     */
    public modifyNode(name: string, attributes: Record<string, any>): void {
        const node = this.machineData.nodes.find(n => n.name === name);
        if (!node) {
            throw new Error(`Node ${name} not found`);
        }

        // Update or add attributes
        Object.entries(attributes).forEach(([key, value]) => {
            const existingAttr = node.attributes?.find(a => a.name === key);
            if (existingAttr) {
                existingAttr.value = String(value);
            } else {
                if (!node.attributes) node.attributes = [];
                node.attributes.push({
                    name: key,
                    type: typeof value,
                    value: String(value)
                });
            }
        });

        this.recordMutation({
            type: 'modify_node',
            timestamp: new Date().toISOString(),
            data: { name, attributes }
        });
    }

    /**
     * Remove a node and its connected edges
     */
    public removeNode(name: string): void {
        const index = this.machineData.nodes.findIndex(n => n.name === name);
        if (index === -1) {
            throw new Error(`Node ${name} not found`);
        }

        // Remove the node
        this.machineData.nodes.splice(index, 1);

        // Remove connected edges
        this.machineData.edges = this.machineData.edges.filter(
            e => e.source !== name && e.target !== name
        );

        this.recordMutation({
            type: 'remove_node',
            timestamp: new Date().toISOString(),
            data: { name }
        });
    }

    /**
     * Get the current machine definition as JSON
     */
    public getMachineDefinition(): MachineData {
        return JSON.parse(JSON.stringify(this.machineData)); // Deep clone
    }

    /**
     * Get a snapshot of the execution context
     */
    private getContextSnapshot(): any {
        return {
            currentNode: this.context.currentNode,
            visitedNodes: Array.from(this.context.visitedNodes),
            history: this.context.history,
            mutations: this.mutations
        };
    }

    /**
     * Record a mutation for versioning
     */
    protected recordMutation(mutation: MachineMutation): void {
        this.mutations.push(mutation);
    }

    /**
     * Get all mutations applied during this execution
     */
    public getMutations(): MachineMutation[] {
        return [...this.mutations];
    }

    /**
     * Set a value in a context node attribute with type validation
     */
    public setContextValue(nodeName: string, attributeName: string, value: any): any {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) {
            throw new Error(`Node ${nodeName} not found`);
        }

        // Find the attribute to get its declared type
        const attribute = node.attributes?.find(a => a.name === attributeName);
        if (!attribute) {
            throw new Error(`Attribute ${attributeName} not found in node ${nodeName}`);
        }

        // Validate type if declared
        if (attribute.type) {
            const isValidType = this.validateValueType(value, attribute.type);
            if (!isValidType) {
                throw new Error(`Value type mismatch: expected ${attribute.type}, got ${typeof value}`);
            }
        }

        // Update the attribute value
        attribute.value = this.serializeValue(value);

        // Record the mutation
        this.recordMutation({
            type: 'modify_node',
            timestamp: new Date().toISOString(),
            data: { name: nodeName, attributes: { [attributeName]: value } }
        });

        return {
            success: true,
            message: `Set ${nodeName}.${attributeName} = ${this.serializeValue(value)}`,
            nodeName,
            attributeName,
            value: this.serializeValue(value),
            type: attribute.type
        };
    }

    /**
     * Get a value from a context node attribute
     */
    public getContextValue(nodeName: string, attributeName: string): any {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) {
            throw new Error(`Node ${nodeName} not found`);
        }

        const attribute = node.attributes?.find(a => a.name === attributeName);
        if (!attribute) {
            throw new Error(`Attribute ${attributeName} not found in node ${nodeName}`);
        }

        // Parse the value back to its original type
        const parsedValue = this.parseValue(attribute.value, attribute.type);

        return {
            success: true,
            nodeName,
            attributeName,
            value: parsedValue,
            type: attribute.type,
            rawValue: attribute.value
        };
    }

    /**
     * List all context nodes and their current values
     */
    public listContextNodes(): any {
        const contextNodes = this.machineData.nodes.filter(n => 
            n.type?.toLowerCase() === 'context' || 
            n.name.toLowerCase().includes('context') ||
            n.name.toLowerCase().includes('output') ||
            n.name.toLowerCase().includes('input')
        );

        const nodeData = contextNodes.map(node => ({
            name: node.name,
            type: node.type,
            attributes: node.attributes?.map(attr => ({
                name: attr.name,
                type: attr.type,
                value: this.parseValue(attr.value, attr.type),
                rawValue: attr.value
            })) || []
        }));

        return {
            success: true,
            contextNodes: nodeData,
            count: contextNodes.length
        };
    }

    /**
     * Validate if a value matches the expected type
     */
    private validateValueType(value: any, expectedType: string): boolean {
        switch (expectedType.toLowerCase()) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                // For custom types or unknown types, allow any value
                return true;
        }
    }

    /**
     * Serialize a value for storage in the machine data
     */
    private serializeValue(value: any): string {
        if (typeof value === 'string') {
            return value;
        }
        return JSON.stringify(value);
    }

    /**
     * Parse a stored value back to its original type
     */
    private parseValue(rawValue: string, type?: string): any {
        // Remove quotes if present
        let cleanValue = rawValue.replace(/^["']|["']$/g, '');
        
        if (!type) {
            // Try to auto-detect and parse
            try {
                return JSON.parse(rawValue);
            } catch {
                return cleanValue;
            }
        }

        switch (type.toLowerCase()) {
            case 'string':
                return cleanValue;
            case 'number':
                const num = Number(cleanValue);
                return isNaN(num) ? cleanValue : num;
            case 'boolean':
                return cleanValue.toLowerCase() === 'true';
            case 'array':
            case 'object':
                try {
                    return JSON.parse(rawValue);
                } catch {
                    return cleanValue;
                }
            default:
                return cleanValue;
        }
    }

    /**
     * Serialize the current machine back to .mach DSL
     */
    public toMachineDefinition(): string {
        const lines: string[] = [];

        // Title
        lines.push(`machine "${this.machineData.title}"\n`);

        // Nodes
        this.machineData.nodes.forEach(node => {
            const type = node.type ? `${node.type} ` : '';
            const attrs = node.attributes || [];

            if (attrs.length === 0) {
                lines.push(`${type}${node.name};`);
            } else {
                lines.push(`${type}${node.name} {`);
                attrs.forEach(attr => {
                    const value = typeof attr.value === 'string' && !attr.value.match(/^[0-9]+$/)
                        ? `"${attr.value}"`
                        : attr.value;
                    lines.push(`    ${attr.name}: ${value};`);
                });
                lines.push(`};`);
            }
        });

        lines.push('');

        // Edges
        this.machineData.edges.forEach(edge => {
            const label = edge.type ? `-${edge.type}-` : '-';
            lines.push(`${edge.source} ${label}> ${edge.target};`);
        });

        return lines.join('\n');
    }

    /**
     * Execute a task node using LLM with tool support
     */
    private async executeTaskNode(): Promise<{ output: string; nextNode?: string }> {
        console.log('🤖 executeTaskNode called for:', this.context.currentNode);
        
        const node = this.machineData.nodes.find(n => n.name === this.context.currentNode);
        if (!node) {
            throw new Error(`Node ${this.context.currentNode} not found`);
        }

        const attributes = this.getCurrentNodeAttributes();
        const isMeta = attributes.meta === 'true' || attributes.meta === 'True';

        console.log('📋 Task node attributes:', attributes);
        console.log('🔧 LLM Client type:', this.llmClient.constructor.name);

        // Build tools array
        const tools: ToolDefinition[] = [];

        // Always add transition tools if there are outbound edges
        const transitionTools = this.generateTransitionTools();
        if (transitionTools.length > 0) {
            tools.push(...transitionTools);
        }

        // Add meta tools if this is a meta task
        if (isMeta) {
            tools.push(...this.generateMetaTools());
        }

        // Always add context tools for working with context nodes
        tools.push(...this.generateContextTools());

        console.log('🛠️ Generated tools:', tools.map(t => t.name));

        // Resolve template variables in the prompt
        let resolvedPrompt = attributes.prompt || '';
        
        // // Ensure resolvedPrompt is a string
        // if (typeof resolvedPrompt !== 'string') {
        //     if (resolvedPrompt && typeof resolvedPrompt === 'object') {
        //         // Handle object/array cases - could be a complex attribute value
        //         // Check if it has a 'value' property (common in AST nodes)
        //         const objPrompt = resolvedPrompt as any;
        //         if ('value' in objPrompt && typeof objPrompt.value === 'string') {
        //             resolvedPrompt = objPrompt.value;
        //         } else {
        //             // Try to safely stringify, handling circular references
        //             try {
        //                 resolvedPrompt = JSON.stringify(resolvedPrompt);
        //             } catch (error) {
        //                 // Fallback for circular references or other stringify errors
        //                 resolvedPrompt = String(resolvedPrompt);
        //             }
        //         }
        //     } else {
        //         // Convert other types to string
        //         resolvedPrompt = String(resolvedPrompt);
        //     }
        // }
        
        // Simple template variable resolution for {{ variable.property }} syntax
        resolvedPrompt = resolvedPrompt.replace(/\{\{\s*(\w+)\.(\w+)\s*\}\}/g, (match: string, nodeName: string, attrName: string) => {
            console.log('🔍 Resolving template variable:', { match, nodeName, attrName });
            
            // Find the referenced node in the machine
            const referencedNode = this.machineData.nodes.find(n => n.name === nodeName);
            if (referencedNode && referencedNode.attributes) {
                const referencedAttr = referencedNode.attributes.find(a => a.name === attrName);
                if (referencedAttr) {
                    // Extract the actual value, handling AST objects
                    let value = referencedAttr.value;
                    
                    // If it's a Langium AST node object, extract the actual value
                    if (value && typeof value === 'object' && '$type' in value) {
                        const astNode = value as any;
                        if ('$cstNode' in astNode && astNode.$cstNode && 'text' in astNode.$cstNode) {
                            value = astNode.$cstNode.text;
                            // Remove quotes if present
                            if (typeof value === 'string') {
                                value = value.replace(/^["']|["']$/g, '');
                            }
                        } else if ('value' in astNode) {
                            value = astNode.value;
                        }
                    }
                    
                    // Ensure the value is a string
                    if (typeof value !== 'string') {
                        value = String(value);
                    }
                    
                    // Remove quotes if present and return the value
                    value = value.replace(/^"(.*)"$/, '$1');
                    console.log('✅ Resolved template variable:', { match, value });
                    return value;
                }
            }
            console.log('⚠️ Could not resolve template variable:', match);
            return match; // Return original if not found
        });

        console.log('📝 Original prompt:', attributes.prompt);
        console.log('📝 Resolved prompt:', resolvedPrompt);

        const promptContext: TaskPromptContext = {
            title: attributes.title,
            description: attributes.desc,
            prompt: resolvedPrompt,
            attributes: Object.fromEntries(
                Object.entries(attributes).filter(([key]) =>
                    !['title', 'desc', 'prompt', 'meta'].includes(key)
                )
            )
        };

        // Determine which template to use based on task type
        const templateKey = (attributes.taskType || 'default') as keyof typeof TASK_PROMPT_TEMPLATES;
        const template = TASK_PROMPT_TEMPLATES[templateKey] || TASK_PROMPT_TEMPLATES.default;

        // Compile the prompt
        const prompt = compilePrompt(template, promptContext);
        console.log('📝 Compiled prompt:', prompt.substring(0, 200) + '...');

        // If no tools, use simple invocation
        if (tools.length === 0) {
            console.log('🔄 Making simple LLM call (no tools)...');
            const output = await this.llmClient.invokeModel(prompt);
            console.log('✅ LLM response received:', output.substring(0, 100) + '...');
            return { output };
        }

        // Multi-turn conversation with tools
        const messages: ConversationMessage[] = [
            { role: 'user', content: prompt }
        ];

        let nextNode: string | undefined;
        let finalText = '';

        console.log('🔄 Starting multi-turn conversation with tools...');

        // Tool use loop
        while (true) {
            console.log('📞 Making LLM call with tools...');
            const response = await this.llmClient.invokeWithTools(messages, tools);
            console.log('📨 LLM response received:', response);

            // Extract text
            const text = this.llmClient.extractText(response);
            if (text) {
                finalText += (finalText ? '\n' : '') + text;
                console.log('📄 Extracted text:', text.substring(0, 100) + '...');
            }

            // Check for tool uses
            const toolUses = this.llmClient.extractToolUses(response);
            console.log('🔧 Tool uses found:', toolUses.length);

            if (toolUses.length === 0) {
                // No more tools to invoke, we're done
                console.log('🏁 No more tools to invoke, conversation complete');
                break;
            }

            // Add assistant message to conversation
            messages.push({
                role: 'assistant',
                content: response.content
            });

            // Process each tool use
            const toolResults: ContentBlock[] = [];

            for (const toolUse of toolUses) {
                console.log('⚙️ Processing tool use:', toolUse.name, toolUse.input);
                try {
                    const result = this.handleToolUse(toolUse.name, toolUse.input);

                    // Special handling for transition tool
                    if (toolUse.name === 'transition') {
                        nextNode = result.target;
                        console.log('🎯 Transition chosen:', nextNode);
                    }

                    toolResults.push({
                        type: 'tool_result' as any,
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(result)
                    } as any);
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error('❌ Tool execution error:', errorMessage);
                    toolResults.push({
                        type: 'tool_result' as any,
                        tool_use_id: toolUse.id,
                        content: JSON.stringify({ error: errorMessage }),
                        is_error: true
                    } as any);
                }
            }

            // Add tool results to conversation
            messages.push({
                role: 'user',
                content: toolResults
            });

            // If we got a transition, we can stop the loop
            if (nextNode) {
                console.log('🎯 Transition received, ending conversation');
                break;
            }
        }

        console.log('✅ Task execution complete:', { finalText: finalText.substring(0, 100) + '...', nextNode });
        return { output: finalText, nextNode };
    }

    /**
     * Execute a single step of the machine
     * @returns true if a transition was made, false if no valid transitions available
     */
    public async step(): Promise<boolean> {
        const transitions = this.getAvailableTransitions();
        if (transitions.length === 0) {
            return false;
        }

        // Get current node
        const currentNode = this.machineData.nodes.find(n => n.name === this.context.currentNode);
        if (!currentNode) {
            throw new Error(`Node ${this.context.currentNode} not found`);
        }

        // Execute node-specific logic
        let output: string | undefined;
        let nextNode: string | undefined;

        // Check if this is a task node (case-insensitive) or has a prompt attribute
        const isTaskNode = currentNode.type?.toLowerCase() === 'task' || 
                          currentNode.attributes?.some(attr => attr.name === 'prompt');
        debugger;
        console.log('🔍 Node execution check:', {
            nodeName: currentNode.name,
            nodeType: currentNode.type,
            isTaskNode,
            attributes: currentNode.attributes
        });

        if (isTaskNode) {
            console.log('🤖 Executing task node with LLM...');
            const result = await this.executeTaskNode();
            output = result.output;
            nextNode = result.nextNode;
            console.log('✅ Task execution result:', { output: output?.substring(0, 100), nextNode });
        }

        // If no next node chosen by LLM, take the first available transition
        if (!nextNode) {
            nextNode = transitions[0].target;
        }

        this.context.visitedNodes.add(this.context.currentNode);

        // Record the transition in history
        this.context.history.push({
            from: this.context.currentNode,
            to: nextNode,
            transition: nextNode ? (transitions.find(t => t.target === nextNode)?.type || 'LLM-chosen') : 'default',
            timestamp: new Date().toISOString(),
            output
        });

        // Update current node
        this.context.currentNode = nextNode;
        return true;
    }

    /**
     * Run the machine until it reaches a terminal state (no more transitions)
     * @returns The execution context with the final state
     */
    public async execute(): Promise<MachineExecutionContext> {
        while (await this.step()) {
            // Continue stepping until no more transitions
        }
        return this.context;
    }

    /**
     * Get the current execution context
     */
    public getContext(): MachineExecutionContext {
        return this.context;
    }

    /**
     * Generate a Mermaid class diagram showing the current execution state
     */
    public toMermaidRuntime(): string {
        const lines: string[] = [];

        // Header with runtime indicator
        lines.push('---');
        lines.push(`title: "${this.machineData.title} [RUNTIME]"`);
        lines.push('config:');
        lines.push('  class:');
        lines.push('    hideEmptyMembersBox: true');
        lines.push('---');
        lines.push('classDiagram-v2');
        lines.push('');

        // Handle empty machine case
        if (this.machineData.nodes.length === 0) {
            lines.push('  class EmptyMachine["⚠️ Empty Machine"] {');
            lines.push('    <<empty>>');
            lines.push('    +status: NO_NODES');
            lines.push('    +message: "Machine has no nodes to execute"');
            lines.push('  }');
            lines.push('');
            lines.push('  classDef emptyNode fill:#FF9800,stroke:#F57C00,stroke-width:2px,color:#fff');
            lines.push('  class EmptyMachine emptyNode');
            return lines.join('\n');
        }

        // Calculate edge transition counts from history
        const edgeCounts = new Map<string, number>();
        this.context.history.forEach(step => {
            const key = `${step.from}->${step.to}`;
            edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        });

        // Define nodes with runtime state indicators
        this.machineData.nodes.forEach(node => {
            const isCurrent = node.name === this.context.currentNode;
            const isVisited = this.context.visitedNodes.has(node.name);
            const visitCount = this.context.history.filter(h => h.from === node.name).length;

            const statusEmoji = isCurrent ? '▶️' : (isVisited ? '✅' : '⏸️');
            const statusText = isCurrent ? 'CURRENT' : (isVisited ? 'VISITED' : 'PENDING');

            // Build class header with runtime status
            const classHeader = `class ${node.name}["${statusEmoji} ${node.name}"]`;
            lines.push(`  ${classHeader} {`);
            
            // Add type annotation
            if (node.type) {
                lines.push(`    <<${node.type}>>`);
            }

            // Add runtime status info
            lines.push(`    +status: ${statusText}`);
            if (visitCount > 0) {
                lines.push(`    +visits: ${visitCount}`);
            }

            // Add attributes
            if (node.attributes && node.attributes.length > 0) {
                node.attributes.forEach(attr => {
                    if (attr.name === 'prompt' || attr.name === 'desc') return; // Skip display attributes
                    
                    let displayValue = this.formatAttributeValue(attr.value);
                    const typeAnnotation = attr.type ? ` : ${attr.type}` : '';
                    lines.push(`    +${attr.name}${typeAnnotation} = ${displayValue}`);
                });
            }

            lines.push('  }');
            lines.push('');
        });

        // Add styling for different states
        lines.push('  %% Runtime State Styling');
        lines.push('  classDef currentNode fill:#4CAF50,stroke:#2E7D32,stroke-width:4px,color:#fff');
        lines.push('  classDef visitedNode fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff');
        lines.push('  classDef pendingNode fill:#FFC107,stroke:#F57F17,stroke-width:1px,color:#000');
        lines.push('');

        // Apply styling to nodes
        this.machineData.nodes.forEach(node => {
            const isCurrent = node.name === this.context.currentNode;
            const isVisited = this.context.visitedNodes.has(node.name);
            const styleClass = isCurrent ? 'currentNode' : (isVisited ? 'visitedNode' : 'pendingNode');
            lines.push(`  class ${node.name} ${styleClass}`);
        });

        lines.push('');

        // Define edges with traversal counts
        this.machineData.edges.forEach(edge => {
            const key = `${edge.source}->${edge.target}`;
            const count = edgeCounts.get(key) || 0;

            let label = edge.label || edge.type || '';
            if (count > 0) {
                label += (label ? ' ' : '') + `[${count}x]`;
            }

            lines.push(`  ${edge.source} --> ${edge.target}${label ? ` : ${label}` : ''}`);
        });

        // Add execution path as comments
        if (this.context.history.length > 0) {
            lines.push('');
            lines.push('  %% Execution Path:');
            this.context.history.forEach((step, idx) => {
                const timestamp = new Date(step.timestamp).toLocaleTimeString();
                lines.push(`  %% ${idx + 1}. ${step.from} → ${step.to} (${step.transition}) at ${timestamp}`);
                if (step.output) {
                    const truncatedOutput = step.output.length > 50 
                        ? step.output.substring(0, 50) + '...' 
                        : step.output;
                    lines.push(`  %%    Output: ${truncatedOutput}`);
                }
            });
        }

        // Add mutations if any
        if (this.mutations.length > 0) {
            lines.push('');
            lines.push('  %% Mutations Applied:');
            this.mutations.forEach((mut, idx) => {
                lines.push(`  %% ${idx + 1}. ${mut.type}: ${JSON.stringify(mut.data)}`);
            });
        }

        return lines.join('\n');
    }

    /**
     * Format attribute values for display
     */
    private formatAttributeValue(value: any): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        
        if (typeof value === 'string') {
            // Remove quotes and truncate if too long
            const cleaned = value.replace(/^["']|["']$/g, '');
            return cleaned.length > 30 ? cleaned.substring(0, 30) + '...' : cleaned;
        }
        
        if (Array.isArray(value)) {
            return `[${value.join(', ')}]`;
        }
        
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (error) {
                return String(value);
            }
        }
        
        return String(value);
    }

    /**
     * Generate a Mermaid class diagram with runtime state overlays
     */
    public toMermaidRuntimeClass(): string {
        const lines: string[] = [];

        lines.push('classDiagram');
        lines.push('');

        // Define classes with runtime info
        this.machineData.nodes.forEach(node => {
            const isCurrent = node.name === this.context.currentNode;
            const isVisited = this.context.visitedNodes.has(node.name);

            const type = node.type || 'node';
            const statusEmoji = isCurrent ? '▶️' : (isVisited ? '✓' : '◯');

            lines.push(`  class ${node.name} {`);
            lines.push(`    <<${type}>>`);
            lines.push(`    +status: ${statusEmoji} ${isCurrent ? 'CURRENT' : (isVisited ? 'VISITED' : 'PENDING')}`);

            // Add attributes
            if (node.attributes) {
                node.attributes.forEach(attr => {
                    lines.push(`    +${attr.name}: ${attr.value}`);
                });
            }

            lines.push(`  }`);

            // Styling
            if (isCurrent) {
                lines.push(`  class ${node.name} currentNode`);
            } else if (isVisited) {
                lines.push(`  class ${node.name} visitedNode`);
            }
        });

        lines.push('');

        // Edges with traversal annotations
        const edgeCounts = new Map<string, number>();
        this.context.history.forEach(step => {
            const key = `${step.from}->${step.to}`;
            edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        });

        this.machineData.edges.forEach(edge => {
            const count = edgeCounts.get(`${edge.source}->${edge.target}`) || 0;
            const weight = count > 0 ? ' : Traversed' : '';

            let label = edge.type || '';
            if (count > 0) {
                label += ` (${count}x)`;
            }

            lines.push(`  ${edge.source} --> ${edge.target}${label ? ` : ${label}` : weight}`);
        });

        lines.push('');

        // Style definitions
        lines.push('  classDef currentNode fill:#4CAF50,stroke:#2E7D32,stroke-width:4px,color:#fff');
        lines.push('  classDef visitedNode fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff');

        return lines.join('\n');
    }
}
