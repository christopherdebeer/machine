/**
 * Machine Executor
 * Executes machine programs by traversing the JSON representation
 */

import {
    BedrockClient,
    BedrockClientConfig,
    ToolDefinition,
    ConversationMessage,
    ContentBlock
} from './bedrock-client.js';
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
    bedrock?: BedrockClientConfig;
}

export class MachineExecutor {
    private context: MachineExecutionContext;
    private machineData: MachineData;
    private bedrockClient: BedrockClient;
    private mutations: MachineMutation[] = [];

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        this.machineData = machineData;
        this.context = {
            currentNode: this.findStartNode(),
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };
        this.bedrockClient = new BedrockClient(config.bedrock);
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
     * Get the current node's attributes as a key-value object
     */
    private getCurrentNodeAttributes(): Record<string, string> {
        const node = this.machineData.nodes.find(n => n.name === this.context.currentNode);
        if (!node?.attributes) {
            return {};
        }

        return node.attributes.reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {} as Record<string, string>);
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
     * Execute a task node using Bedrock with tool support
     */
    private async executeTaskNode(): Promise<{ output: string; nextNode?: string }> {
        const node = this.machineData.nodes.find(n => n.name === this.context.currentNode);
        if (!node) {
            throw new Error(`Node ${this.context.currentNode} not found`);
        }

        const attributes = this.getCurrentNodeAttributes();
        const isMeta = attributes.meta === 'true' || attributes.meta === 'True';

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

        const promptContext: TaskPromptContext = {
            title: attributes.title,
            description: attributes.desc,
            prompt: attributes.prompt,
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

        // If no tools, use simple invocation
        if (tools.length === 0) {
            const output = await this.bedrockClient.invokeModel(prompt);
            return { output };
        }

        // Multi-turn conversation with tools
        const messages: ConversationMessage[] = [
            { role: 'user', content: prompt }
        ];

        let nextNode: string | undefined;
        let finalText = '';

        // Tool use loop
        while (true) {
            const response = await this.bedrockClient.invokeWithTools(messages, tools);

            // Extract text
            const text = this.bedrockClient.extractText(response);
            if (text) {
                finalText += (finalText ? '\n' : '') + text;
            }

            // Check for tool uses
            const toolUses = this.bedrockClient.extractToolUses(response);

            if (toolUses.length === 0) {
                // No more tools to invoke, we're done
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
                try {
                    const result = this.handleToolUse(toolUse.name, toolUse.input);

                    // Special handling for transition tool
                    if (toolUse.name === 'transition') {
                        nextNode = result.target;
                    }

                    toolResults.push({
                        type: 'tool_result' as any,
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(result)
                    } as any);
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
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
                break;
            }
        }

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

        if (currentNode.type === 'task') {
            const result = await this.executeTaskNode();
            output = result.output;
            nextNode = result.nextNode;
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
     * Generate a Mermaid state diagram showing the current execution state
     */
    public toMermaidRuntime(): string {
        const lines: string[] = [];

        // Header
        lines.push('stateDiagram-v2');
        lines.push('');

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

            lines.push(`  ${node.name}: ${node.name}`);

            // Add note with status
            if (isCurrent) {
                lines.push(`  note right of ${node.name}: ▶️ CURRENT`);
            } else if (isVisited) {
                lines.push(`  note right of ${node.name}: ✓ VISITED`);
            }
        });

        lines.push('');

        // Define edges with traversal counts
        this.machineData.edges.forEach(edge => {
            const key = `${edge.source}->${edge.target}`;
            const count = edgeCounts.get(key) || 0;

            let label = '';
            if (edge.type) {
                label = edge.type;
            }
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
                lines.push(`  %% ${idx + 1}. ${step.from} -> ${step.to} (${step.transition})`);
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
