/**
 * Machine Executor
 * Executes machine programs by traversing the JSON representation
 */

import { BedrockClient, BedrockClientConfig } from './bedrock-client.js';
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
    }>;
}

export interface MachineExecutorConfig {
    bedrock?: BedrockClientConfig;
}

export class MachineExecutor {
    private context: MachineExecutionContext;
    private machineData: MachineData;
    private bedrockClient: BedrockClient;

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
     * Execute a task node using Bedrock
     */
    private async executeTaskNode(): Promise<string> {
        const node = this.machineData.nodes.find(n => n.name === this.context.currentNode);
        if (!node) {
            throw new Error(`Node ${this.context.currentNode} not found`);
        }

        const attributes = this.getCurrentNodeAttributes();
        const promptContext: TaskPromptContext = {
            title: attributes.title,
            description: attributes.desc,
            prompt: attributes.prompt,
            attributes: Object.fromEntries(
                Object.entries(attributes).filter(([key]) =>
                    !['title', 'desc', 'prompt'].includes(key)
                )
            )
        };

        // Determine which template to use based on task type
        const templateKey = (attributes.taskType || 'default') as keyof typeof TASK_PROMPT_TEMPLATES;
        const template = TASK_PROMPT_TEMPLATES[templateKey] || TASK_PROMPT_TEMPLATES.default;

        // Compile the prompt and invoke Bedrock
        const prompt = compilePrompt(template, promptContext);
        return await this.bedrockClient.invokeModel(prompt);
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
        if (currentNode.type === 'task') {
            output = await this.executeTaskNode();
        }

        // For now, just take the first available transition
        const transition = transitions[0];
        this.context.visitedNodes.add(this.context.currentNode);

        // Record the transition in history
        this.context.history.push({
            from: this.context.currentNode,
            to: transition.target,
            transition: transition.type || 'unnamed',
            timestamp: new Date().toISOString(),
            output
        });

        // Update current node
        this.context.currentNode = transition.target;
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
}
