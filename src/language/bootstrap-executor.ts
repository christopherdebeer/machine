/**
 * Bootstrap Executor - Layer 1: Minimal Bootstrap Core
 *
 * This is the minimal TypeScript core needed to execute Dygram machines.
 * It provides the primitive operations that enable self-hosting:
 * - Load and validate machines
 * - Execute nodes primitively
 * - Follow edges between nodes
 * - Invoke registered tools
 * - Register tool implementations
 *
 * Target: ~300-500 lines of essential code
 * Purpose: Enable Layer 2 (Dygram-in-Dygram) machines to run
 */

import { MachineData } from './base-executor.js';

/**
 * Minimal execution context for bootstrap
 */
export interface BootstrapContext {
    currentNode: string;
    visitedNodes: string[];
    nodeInvocationCounts: Map<string, number>;
    attributes: Map<string, any>;
    history: Array<{
        from: string;
        to: string;
        timestamp: string;
    }>;
    // Optional meta-tool manager for advanced features
    metaToolManager?: any;
}

/**
 * Result of executing a single node
 */
export interface NodeResult {
    success: boolean;
    output?: any;
    error?: string;
    nextNodes?: string[];
}

/**
 * Tool function signature for bootstrap
 */
export type BootstrapToolFunction = (input: any, context: BootstrapContext) => Promise<any>;

/**
 * Tool registration interface
 */
export interface BootstrapTool {
    name: string;
    description: string;
    implementation: BootstrapToolFunction;
}

/**
 * Bootstrap Core API
 * The minimal interface needed to execute Dygram machines
 */
export interface BootstrapCore {
    // Load and validate a machine
    loadMachine(source: string): Promise<MachineData>;

    // Execute a single node (primitive operation)
    executeNode(
        nodeName: string,
        machineData: MachineData,
        context: BootstrapContext
    ): Promise<NodeResult>;

    // Follow an edge to next node
    followEdge(
        fromNode: string,
        toNode: string,
        machineData: MachineData,
        context: BootstrapContext
    ): Promise<void>;

    // Invoke a registered tool
    invokeTool(
        toolName: string,
        input: any,
        context: BootstrapContext
    ): Promise<any>;

    // Register a tool implementation
    registerTool(
        name: string,
        implementation: BootstrapToolFunction
    ): void;
}

/**
 * BootstrapExecutor - Minimal executor implementing the bootstrap core
 */
export class BootstrapExecutor implements BootstrapCore {
    private tools: Map<string, BootstrapToolFunction> = new Map();
    protected machineData: MachineData;
    private context: BootstrapContext;
    private maxSteps: number = 1000;
    private maxNodeInvocations: number = 100;

    constructor(machineData?: MachineData, config?: { maxSteps?: number; maxNodeInvocations?: number }) {
        this.machineData = machineData || { title: '', nodes: [], edges: [] };
        this.context = this.createInitialContext();
        if (config) {
            this.maxSteps = config.maxSteps ?? 1000;
            this.maxNodeInvocations = config.maxNodeInvocations ?? 100;
        }
    }

    /**
     * Create initial execution context
     */
    private createInitialContext(): BootstrapContext {
        return {
            currentNode: '',
            visitedNodes: [],
            nodeInvocationCounts: new Map(),
            attributes: new Map(),
            history: []
        };
    }

    /**
     * Load and validate a machine from source
     * Calls parse_dygram and validate_machine tools
     */
    async loadMachine(source: string): Promise<MachineData> {
        // Check if required tools are registered
        if (!this.hasTool('parse_dygram')) {
            throw new Error('loadMachine requires parse_dygram tool to be registered');
        }
        if (!this.hasTool('validate_machine')) {
            throw new Error('loadMachine requires validate_machine tool to be registered');
        }

        // Step 1: Parse the source code to get Machine AST
        const parseResult = await this.invokeTool('parse_dygram', {
            code: source,
            filepath: '<memory>'
        }, this.context);

        if (parseResult.errors && parseResult.errors.length > 0) {
            throw new Error(`Parse errors: ${parseResult.errors.join(', ')}`);
        }

        if (!parseResult.machine) {
            throw new Error('Parser did not return a machine');
        }

        const machine = parseResult.machine;

        // Step 2: Validate the machine structure
        const validateResult = await this.invokeTool('validate_machine', {
            machine
        }, this.context);

        if (validateResult.errors && validateResult.errors.length > 0) {
            console.warn('⚠️ Validation errors:', validateResult.errors.join(', '));
        }

        if (validateResult.warnings && validateResult.warnings.length > 0) {
            console.warn('⚠️ Validation warnings:', validateResult.warnings.join(', '));
        }

        // Step 3: Convert Machine AST to MachineData format
        // The machine AST needs to be converted to the executor's MachineData format
        // For now, we'll use the JSON generator to do the conversion
        if (!this.hasTool('generate_json')) {
            throw new Error('loadMachine requires generate_json tool for AST conversion');
        }

        const jsonResult = await this.invokeTool('generate_json', {
            machine
        }, this.context);

        // Parse the JSON to get MachineData
        const machineData: MachineData = JSON.parse(jsonResult.json);

        return machineData;
    }

    /**
     * Execute a single node (primitive operation)
     * This is the core primitive that enables all execution
     */
    async executeNode(
        nodeName: string,
        machineData: MachineData,
        context: BootstrapContext
    ): Promise<NodeResult> {
        // Find the node
        const node = machineData.nodes.find(n => n.name === nodeName);
        if (!node) {
            return {
                success: false,
                error: `Node not found: ${nodeName}`
            };
        }

        // Update invocation count
        const count = context.nodeInvocationCounts.get(nodeName) || 0;
        context.nodeInvocationCounts.set(nodeName, count + 1);

        // Track visited nodes
        if (!context.visitedNodes.includes(nodeName)) {
            context.visitedNodes.push(nodeName);
        }

        // Update current node
        context.currentNode = nodeName;

        try {
            // Execute node based on type
            const nodeType = node.type?.toLowerCase() || 'unknown';

            switch (nodeType) {
                case 'task': {
                    // Task nodes may have 'uses' attribute pointing to a tool
                    const usesAttr = node.attributes?.find(a => a.name === 'uses');
                    if (usesAttr && usesAttr.value) {
                        // Strip quotes from value
                        const toolName = usesAttr.value.replace(/^["']|["']$/g, '');
                        const result = await this.invokeTool(toolName, {}, context);
                        return {
                            success: true,
                            output: result
                        };
                    }
                    // Task without tool - just mark as executed
                    return { success: true };
                }

                case 'input':
                case 'context':
                    // Initialize attributes from node
                    this.initializeAttributes(node, context);
                    return { success: true };

                case 'result':
                case 'output':
                    // Capture result attributes
                    const resultData = this.captureAttributes(node, context);
                    return {
                        success: true,
                        output: resultData
                    };

                case 'state':
                    // State nodes just track state changes
                    return { success: true };

                default:
                    // Unknown node type - just mark as executed
                    return { success: true };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Follow an edge from one node to another
     */
    async followEdge(
        fromNode: string,
        toNode: string,
        machineData: MachineData,
        context: BootstrapContext
    ): Promise<void> {
        // Verify edge exists
        const edge = machineData.edges.find(
            e => e.source === fromNode && e.target === toNode
        );

        if (!edge) {
            throw new Error(`No edge found from ${fromNode} to ${toNode}`);
        }

        // Record transition in history
        context.history.push({
            from: fromNode,
            to: toNode,
            timestamp: new Date().toISOString()
        });

        // Update current node
        context.currentNode = toNode;
    }

    /**
     * Invoke a registered tool
     */
    async invokeTool(
        toolName: string,
        input: any,
        context: BootstrapContext
    ): Promise<any> {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }

        return await tool(input, context);
    }

    /**
     * Register a tool implementation
     */
    registerTool(
        name: string,
        implementation: BootstrapToolFunction
    ): void {
        this.tools.set(name, implementation);
    }

    /**
     * Check if a tool is registered
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Get list of registered tools
     */
    getRegisteredTools(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Initialize attributes from a node's attributes
     */
    private initializeAttributes(
        node: { name: string; attributes?: Array<{ name: string; type: string; value: string }> },
        context: BootstrapContext
    ): void {
        if (!node.attributes) return;

        for (const attr of node.attributes) {
            // Parse the value (simplified - would need full CEL parser in real impl)
            const value = this.parseSimpleValue(attr.value, attr.type);
            const key = `${node.name}.${attr.name}`;
            context.attributes.set(key, value);
        }
    }

    /**
     * Capture attributes from a node into an object
     */
    private captureAttributes(
        node: { name: string; attributes?: Array<{ name: string; type: string; value: string }> },
        context: BootstrapContext
    ): Record<string, any> {
        const result: Record<string, any> = {};

        if (!node.attributes) return result;

        for (const attr of node.attributes) {
            // Try to get from context first, otherwise use default value
            const key = `${node.name}.${attr.name}`;
            const value = context.attributes.get(key) ?? this.parseSimpleValue(attr.value, attr.type);
            result[attr.name] = value;
        }

        return result;
    }

    /**
     * Parse simple value types (simplified parser)
     */
    private parseSimpleValue(value: string, type: string): any {
        // Remove quotes
        const cleaned = value.replace(/^["']|["']$/g, '');

        switch (type.toLowerCase()) {
            case 'number':
                return Number(cleaned);
            case 'boolean':
                return cleaned === 'true';
            case 'string':
                return cleaned;
            default:
                // Try to parse as JSON for complex types
                try {
                    return JSON.parse(value);
                } catch {
                    return cleaned;
                }
        }
    }

    /**
     * Find available transitions from current node
     */
    findTransitions(nodeName: string, machineData: MachineData): string[] {
        return machineData.edges
            .filter(e => e.source === nodeName)
            .map(e => e.target);
    }

    /**
     * Get current execution context
     */
    getContext(): BootstrapContext {
        return this.context;
    }

    /**
     * Reset execution context
     */
    resetContext(): void {
        this.context = this.createInitialContext();
    }

    /**
     * Set MetaToolManager for meta-tools support
     */
    setMetaToolManager(metaToolManager: any): void {
        this.context.metaToolManager = metaToolManager;
    }

    /**
     * Execute the machine (full execution loop)
     * This makes BootstrapExecutor compatible with RailsExecutor interface
     */
    async execute(): Promise<{
        currentNode: string;
        errorCount: number;
        visitedNodes: Set<string>;
        attributes: Map<string, any>;
        history: Array<{
            from: string;
            to: string;
            transition: string;
            timestamp: string;
            output?: string;
        }>;
    }> {
        console.log(`\n🚀 [Bootstrap] Starting execution: ${this.machineData.title}`);

        // Find start node
        const startNode = this.machineData.nodes.find(n => n.name.toLowerCase() === 'start')
            || this.machineData.nodes[0];

        if (!startNode) {
            throw new Error('No start node found');
        }

        this.context.currentNode = startNode.name;
        let stepCount = 0;
        let errorCount = 0;

        // Execution loop
        while (stepCount < this.maxSteps) {
            const nodeName = this.context.currentNode;

            // Check node invocation limit
            const invocations = this.context.nodeInvocationCounts.get(nodeName) || 0;
            if (invocations >= this.maxNodeInvocations) {
                console.log(`⚠️ Max invocations (${this.maxNodeInvocations}) reached for node: ${nodeName}`);
                break;
            }

            // Execute current node
            const result = await this.executeNode(nodeName, this.machineData, this.context);

            if (!result.success) {
                errorCount++;
                console.log(`❌ Error at node ${nodeName}: ${result.error}`);
            }

            // Find next transitions
            const transitions = this.findTransitions(nodeName, this.machineData);

            if (transitions.length === 0) {
                console.log(`✓ Execution completed at terminal node: ${nodeName}`);
                break;
            }

            // For now, take first available transition (simplified - no conditions yet)
            const nextNode = transitions[0];

            // Follow edge
            await this.followEdge(nodeName, nextNode, this.machineData, this.context);

            stepCount++;
        }

        if (stepCount >= this.maxSteps) {
            console.log(`⚠️ Max steps (${this.maxSteps}) reached`);
        }

        // Convert history format to match RailsExecutor
        const formattedHistory = this.context.history.map(h => ({
            from: h.from,
            to: h.to,
            transition: 'auto', // Bootstrap doesn't track transition types yet
            timestamp: h.timestamp,
            output: undefined
        }));

        return {
            currentNode: this.context.currentNode,
            errorCount,
            visitedNodes: new Set(this.context.visitedNodes),
            attributes: this.context.attributes,
            history: formattedHistory
        };
    }
}

/**
 * Helper function to create a bootstrap executor with common tools pre-registered
 */
export function createBootstrapExecutor(tools?: BootstrapTool[]): BootstrapExecutor {
    const executor = new BootstrapExecutor();

    if (tools) {
        for (const tool of tools) {
            executor.registerTool(tool.name, tool.implementation);
        }
    }

    return executor;
}
