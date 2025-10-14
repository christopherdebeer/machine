/**
 * Rails Executor - Core Rails Pattern
 *
 * Implements the "rails pattern" where:
 * - Some transitions are automated based on deterministic conditions
 * - Some transitions are agent-controlled (exposed as tools)
 * - Single agent rides the rails with context-specific prompts
 * - Agent receives only relevant context and tools at each node
 */

import {
    createLLMClient,
    ToolDefinition
} from './llm-client.js';
import { AgentContextBuilder } from './agent-context-builder.js';
import { MetaToolManager } from './meta-tool-manager.js';
import { AgentSDKBridge, type AgentSDKBridgeConfig } from './agent-sdk-bridge.js';
import { ToolRegistry } from './tool-registry.js';
import {
    BaseExecutor,
    MachineExecutionContext,
    MachineData,
    MachineMutation,
    MachineExecutorConfig as BaseMachineExecutorConfig
} from './base-executor.js';
import { EdgeConditionParser } from './utils/edge-conditions.js';
import { NodeTypeChecker } from './node-type-checker.js';

// Re-export interfaces for compatibility
export type { MachineExecutionContext, MachineData, MachineMutation };

// Extend base config with RailsExecutor-specific options
export interface MachineExecutorConfig extends BaseMachineExecutorConfig {
    // Agent SDK configuration (Agent SDK)
    agentSDK?: AgentSDKBridgeConfig;
}

/**
 * Edge annotation interface
 */
interface EdgeAnnotation {
    name: string;
    value?: string;
}

/**
 * Extended edge with annotation support
 */
interface AnnotatedEdge {
    source: string;
    target: string;
    type?: string;
    label?: string;
    annotations?: EdgeAnnotation[];
}

/**
 * Transition evaluation result
 */
interface TransitionEvaluation {
    edge: AnnotatedEdge;
    target: string;
    condition?: string;
    isAutomatic: boolean;
    reason: string;
}

/**
 * RailsExecutor - Implements the rails pattern with automated and agent-controlled transitions
 */
export class RailsExecutor extends BaseExecutor {
    protected metaToolManager: MetaToolManager;
    protected agentSDKBridge: AgentSDKBridge;
    protected toolRegistry: ToolRegistry;

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        super(machineData, config);

        // Initialize ToolRegistry
        this.toolRegistry = new ToolRegistry();

        // Initialize MetaToolManager
        this.metaToolManager = new MetaToolManager(
            this.machineData,
            (mutation) => this.recordMutation(mutation),
            this.toolRegistry
        );

        // Initialize AgentSDKBridge (Agent SDK)
        this.agentSDKBridge = new AgentSDKBridge(
            this.machineData,
            this.context,
            this.metaToolManager,
            this.toolRegistry,
            config.agentSDK
        );

        // Register dynamic tool patterns with ToolRegistry
        this.registerDynamicTools();
    }

    /**
     * Register dynamic tool patterns with the ToolRegistry
     */
    private registerDynamicTools(): void {
        // Register transition tool pattern
        this.toolRegistry.registerDynamic('transition_to_',
            async (name, input) => this.handleTransitionTool(name, input)
        );

        // Register read tool pattern
        this.toolRegistry.registerDynamic('read_',
            async (name, input) => this.handleReadTool(name, input)
        );

        // Register write tool pattern
        this.toolRegistry.registerDynamic('write_',
            async (name, input) => this.handleWriteTool(name, input)
        );
    }

    /**
     * Initialize with async LLM client creation
     */
    static async create(machineData: MachineData, config: MachineExecutorConfig = {}): Promise<RailsExecutor> {
        const executor = new RailsExecutor(machineData, config);

        if (config.llm) {
            executor.llmClient = await createLLMClient(config.llm);
        }

        return executor;
    }


    /**
     * Check if edge has @auto annotation
     */
    protected hasAutoAnnotation(edge: AnnotatedEdge): boolean {
        if (!edge.annotations) return false;
        return edge.annotations.some(a => a.name === 'auto');
    }

    /**
     * Extract @auto annotation from edge label
     * Labels like "-@auto->" or "- when: x @auto ->"
     */
    protected extractAnnotationsFromLabel(edge: { label?: string; type?: string }): EdgeAnnotation[] {
        const edgeLabel = edge.label || edge.type || '';
        const annotations: EdgeAnnotation[] = [];

        // Look for @auto annotation
        if (edgeLabel.includes('@auto')) {
            annotations.push({ name: 'auto' });
        }

        // Could add more annotations in the future: @parallel, @conditional, etc.

        return annotations;
    }

    /**
     * Get annotated edges (edges with extracted annotations)
     */
    protected getAnnotatedEdges(): AnnotatedEdge[] {
        return this.machineData.edges.map(edge => ({
            ...edge,
            annotations: this.extractAnnotationsFromLabel(edge)
        }));
    }


    /**
     * Check if a node requires agent decision
     */
    protected requiresAgentDecision(nodeName: string): boolean {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) return false;

        // Task nodes with prompts require agent decisions
        if (node.type?.toLowerCase() === 'task') {
            const attributes = this.getNodeAttributes(nodeName);
            return !!attributes.prompt;
        }

        // State nodes typically don't require agent decisions
        if (NodeTypeChecker.isState(node)) {
            return false;
        }

        // Check if there are multiple non-automatic outbound edges (branching decision)
        const outboundEdges = this.getOutboundEdges(nodeName);
        const nonAutoEdges = outboundEdges.filter(edge => !this.hasAutoAnnotation(edge));

        return nonAutoEdges.length > 1;
    }


    /**
     * Check if condition is simple (deterministic, no external data)
     * @deprecated Use EdgeConditionParser.isSimpleCondition() directly for new code
     */
    protected isSimpleCondition(condition: string | undefined): boolean {
        return EdgeConditionParser.isSimpleCondition(condition);
    }


    /**
     * Get the parent state module of a node (if any)
     */
    protected getParentStateModule(nodeName: string): string | null {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node || !node.parent) {
            return null;
        }

        // Walk up parent chain to find a state node
        let currentParent: string | undefined = node.parent;
        while (currentParent) {
            const parentNode = this.machineData.nodes.find(n => n.name === currentParent);
            if (parentNode && NodeTypeChecker.isState(parentNode)) {
                return currentParent;
            }
            currentParent = parentNode?.parent;
        }

        return null;
    }

    /**
     * Get outbound edges from a node
     * Includes module-level exit edges for terminal nodes within state modules
     */
    protected getOutboundEdges(nodeName: string): AnnotatedEdge[] {
        const allEdges = this.getAnnotatedEdges();
        const directEdges = allEdges.filter(edge => edge.source === nodeName);

        // If node has direct edges, return them (explicit edges take precedence)
        if (directEdges.length > 0) {
            return directEdges;
        }

        // Check if this node is within a state module
        const parentModule = this.getParentStateModule(nodeName);
        if (parentModule) {
            // This is a terminal node within a module - check for module-level exits
            const moduleEdges = allEdges.filter(edge => edge.source === parentModule);
            if (moduleEdges.length > 0) {
                console.log(`📤 Terminal node ${nodeName} in module ${parentModule}, inheriting module exits`);
                return moduleEdges;
            }
        }

        return directEdges; // Return empty array if no edges found
    }

    /**
     * Evaluate automated transitions from current node
     * Returns the first valid automated transition, or null if none found
     */
    protected evaluateAutomatedTransitions(nodeName: string): TransitionEvaluation | null {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) return null;

        const outboundEdges = this.getOutboundEdges(nodeName);

        // If only one edge and it's a state or init node, auto-transition
        if (outboundEdges.length === 1 && (NodeTypeChecker.isState(node) || NodeTypeChecker.isInit(node))) {
            const edge = outboundEdges[0];
            const condition = this.extractEdgeCondition(edge);

            if (this.evaluateCondition(condition)) {
                return {
                    edge,
                    target: edge.target,
                    condition,
                    isAutomatic: true,
                    reason: NodeTypeChecker.isInit(node) ? 'Single edge from init node' : 'Single edge from state node'
                };
            }
        }

        // Check edges with @auto annotation
        for (const edge of outboundEdges) {
            if (this.hasAutoAnnotation(edge)) {
                const condition = this.extractEdgeCondition(edge);

                if (this.evaluateCondition(condition)) {
                    return {
                        edge,
                        target: edge.target,
                        condition,
                        isAutomatic: true,
                        reason: '@auto annotation'
                    };
                }
            }
        }

        // Check for edges with simple deterministic conditions
        for (const edge of outboundEdges) {
            const condition = this.extractEdgeCondition(edge);

            if (condition && EdgeConditionParser.isSimpleCondition(condition)) {
                if (this.evaluateCondition(condition)) {
                    return {
                        edge,
                        target: edge.target,
                        condition,
                        isAutomatic: true,
                        reason: 'Simple deterministic condition'
                    };
                }
            }
        }

        return null;
    }

    /**
     * Get non-automated transitions (those requiring agent decision)
     */
    protected getNonAutomatedTransitions(nodeName: string): Array<{ target: string; description?: string; condition?: string }> {
        const outboundEdges = this.getOutboundEdges(nodeName);

        return outboundEdges
            .filter(edge => {
                // Skip edges with @auto annotation
                if (this.hasAutoAnnotation(edge)) return false;

                // Skip edges with simple deterministic conditions that would auto-execute
                const condition = this.extractEdgeCondition(edge);
                if (condition && EdgeConditionParser.isSimpleCondition(condition) && this.evaluateCondition(condition)) {
                    return false;
                }

                return true;
            })
            .map(edge => ({
                target: edge.target,
                description: edge.label || edge.type,
                condition: this.extractEdgeCondition(edge)
            }));
    }


    /**
     * Check if a node has children
     */
    protected hasChildren(nodeName: string): boolean {
        return this.machineData.nodes.some(n => n.parent === nodeName);
    }

    /**
     * Get children of a node
     */
    protected getChildren(nodeName: string): string[] {
        return this.machineData.nodes
            .filter(n => n.parent === nodeName)
            .map(n => n.name);
    }

    /**
     * Get first child node (entry point for state modules)
     * Returns the first child node, preferring task nodes over context nodes
     * State nodes can be entry points for nested modules
     */
    protected getFirstChild(nodeName: string): string | null {
        const children = this.machineData.nodes.filter(n => n.parent === nodeName);

        if (children.length === 0) {
            return null;
        }

        // Priority 1: Task nodes (actual executable work)
        const taskChild = children.find(n => NodeTypeChecker.isTask(n));
        if (taskChild) {
            return taskChild.name;
        }

        // Priority 2: State nodes (can be entry points for nested modules)
        const stateChild = children.find(n => NodeTypeChecker.isState(n));
        if (stateChild) {
            return stateChild.name;
        }

        // Priority 3: Any other node type (avoid context nodes if possible)
        const nonContextChild = children.find(n => !NodeTypeChecker.isContext(n));
        if (nonContextChild) {
            return nonContextChild.name;
        }

        // Last resort: return first child (even if context)
        return children[0].name;
    }

    /**
     * Transition to a new node
     * Handles state module entry by automatically routing to first child
     * Recursively enters nested state modules
     */
    protected transition(targetNode: string, transitionLabel: string = 'auto'): void {
        const fromNode = this.context.currentNode;
        let currentTarget = targetNode;
        const moduleChain: string[] = [];

        // Recursively enter nested state modules
        while (true) {
            const currentTargetObj = this.machineData.nodes.find(n => n.name === currentTarget);

            // Check if current target is a state node with children (state module)
            if (currentTargetObj && NodeTypeChecker.isState(currentTargetObj) && this.hasChildren(currentTarget)) {
                moduleChain.push(currentTarget);

                const firstChild = this.getFirstChild(currentTarget);
                if (!firstChild) {
                    break; // No children found, stop recursion
                }

                // Check if first child is also a state module
                const firstChildObj = this.machineData.nodes.find(n => n.name === firstChild);
                if (firstChildObj && NodeTypeChecker.isState(firstChildObj) && this.hasChildren(firstChild)) {
                    // Continue recursion - enter nested module
                    currentTarget = firstChild;
                    continue;
                }

                // First child is not a state module - this is our final target
                currentTarget = firstChild;
                break;
            }

            // Not a state module - stop recursion
            break;
        }

        // If we entered any modules, record the entry chain
        if (moduleChain.length > 0) {
            console.log(`📦 State module(s) detected: ${moduleChain.join(' -> ')}, entering at ${currentTarget}`);

            // Record entry into each module in the chain
            let previousNode = fromNode;
            for (const moduleName of moduleChain) {
                this.context.history.push({
                    from: previousNode,
                    to: moduleName,
                    transition: `${transitionLabel} (module entry)`,
                    timestamp: new Date().toISOString()
                });

                // Set active state to the deepest module
                this.context.activeState = moduleName;
                previousNode = moduleName;
            }

            // Record transition to final child
            this.context.currentNode = currentTarget;
            this.context.history.push({
                from: moduleChain[moduleChain.length - 1],
                to: currentTarget,
                transition: 'module entry',
                timestamp: new Date().toISOString()
            });

            console.log(`🚂 Transitioned: ${fromNode} -> ${moduleChain.join(' -> ')} -> ${currentTarget} (state module entry)`);
            return;
        }

        // Standard transition (not a state module)
        const finalTargetObj = this.machineData.nodes.find(n => n.name === targetNode);

        this.context.history.push({
            from: fromNode,
            to: targetNode,
            transition: transitionLabel,
            timestamp: new Date().toISOString()
        });

        this.context.visitedNodes.add(fromNode);
        this.context.currentNode = targetNode;

        // Update active state if transitioning to a state node
        if (finalTargetObj && NodeTypeChecker.isState(finalTargetObj)) {
            this.context.activeState = targetNode;
        }

        console.log(`🚂 Transitioned: ${fromNode} -> ${targetNode} (${transitionLabel})`);
    }

    /**
     * Build system prompt for a node using AgentContextBuilder
     */
    buildSystemPrompt(nodeName: string): string {
        const builder = new AgentContextBuilder(this.machineData, this.context);
        return builder.buildSystemPrompt(nodeName);
    }

    /**
     * Get MetaToolManager
     */
    getMetaToolManager(): MetaToolManager {
        return this.metaToolManager;
    }

    /**
     * Set callback for when machine definition is updated (for playground editor updates)
     */
    setMachineUpdateCallback(callback: (dsl: string, machineData: MachineData) => void): void {
        this.metaToolManager.setMachineUpdateCallback(callback);
    }

    /**
     * Build phase-specific tools for a node
     */
    protected buildPhaseTools(nodeName: string): ToolDefinition[] {
        const tools: ToolDefinition[] = [];

        // Add transition tools (non-automated)
        const transitions = this.getNonAutomatedTransitions(nodeName);
        for (const transition of transitions) {
            tools.push({
                name: `transition_to_${transition.target}`,
                description: `Transition to ${transition.target}${transition.description ? ': ' + transition.description : ''}`,
                input_schema: {
                    type: 'object',
                    properties: {
                        reason: {
                            type: 'string',
                            description: 'Brief explanation of why this transition was chosen'
                        }
                    }
                }
            });
        }

        // Add context tools (read/write based on permissions)
        const builder = new AgentContextBuilder(this.machineData, this.context);
        const contexts = builder.getAccessibleContextNodes(nodeName);

        for (const [contextName, perms] of contexts.entries()) {
            if (perms.canRead) {
                tools.push({
                    name: `read_${contextName}`,
                    description: `Read data from ${contextName} context`,
                    input_schema: {
                        type: 'object',
                        properties: {
                            fields: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Specific fields to read (optional)'
                            }
                        }
                    }
                });
            }

            if (perms.canWrite) {
                tools.push({
                    name: `write_${contextName}`,
                    description: `Write data to ${contextName} context`,
                    input_schema: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'object',
                                description: 'Data to write'
                            }
                        },
                        required: ['data']
                    }
                });
            }
        }

        // Add meta-tools if node has meta capabilities
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (node) {
            const attributes = this.getNodeAttributes(nodeName);
            if (attributes.meta === 'true' || attributes.meta === 'True') {
                tools.push(...this.metaToolManager.getMetaTools());
            }
        }

        // Add dynamic tools
        tools.push(...this.metaToolManager.getDynamicToolDefinitions());

        return tools;
    }

    /**
     * Execute a tool (transition, context, or meta)
     */
    async executeTool(toolName: string, input: any): Promise<any> {
        console.log(`🔧 Executing tool: ${toolName} with input:`, input);

        // Use ToolRegistry for execution
        if (this.toolRegistry.hasTool(toolName)) {
            return await this.toolRegistry.executeTool(toolName, input);
        }

        // Fallback to agent SDK bridge for meta-tools
        return await this.agentSDKBridge.executeTool(toolName, input);
    }

    /**
     * Handle transition tool execution
     */
    private async handleTransitionTool(name: string, input: any): Promise<any> {
        const targetNode = name.replace('transition_to_', '');
        const reason = input.reason || 'agent decision';

        // Validate transition is valid
        const transitions = this.getNonAutomatedTransitions(this.context.currentNode);
        const validTransition = transitions.find(t => t.target === targetNode);

        if (!validTransition) {
            throw new Error(`Invalid transition: ${this.context.currentNode} -> ${targetNode}`);
        }

        return {
            success: true,
            action: 'transition',
            target: targetNode,
            reason
        };
    }

    /**
     * Handle read tool execution
     */
    private async handleReadTool(name: string, input: any): Promise<any> {
        const contextName = name.replace('read_', '');
        const contextNode = this.machineData.nodes.find(n => n.name === contextName);

        if (!contextNode) {
            throw new Error(`Context node ${contextName} not found`);
        }

        const attributes = this.getNodeAttributes(contextName);

        // Filter by requested fields if specified
        if (input.fields && Array.isArray(input.fields)) {
            const filtered: Record<string, any> = {};
            input.fields.forEach((field: string) => {
                if (field in attributes) {
                    filtered[field] = attributes[field];
                }
            });
            return {
                success: true,
                context: contextName,
                data: filtered
            };
        }

        return {
            success: true,
            context: contextName,
            data: attributes
        };
    }

    /**
     * Handle write tool execution
     */
    private async handleWriteTool(name: string, input: any): Promise<any> {
        const contextName = name.replace('write_', '');
        const contextNode = this.machineData.nodes.find(n => n.name === contextName);

        if (!contextNode) {
            throw new Error(`Context node ${contextName} not found`);
        }

        if (!input.data || typeof input.data !== 'object') {
            throw new Error('write tool requires data object');
        }

        // Update context node attributes
        if (!contextNode.attributes) {
            contextNode.attributes = [];
        }

        Object.entries(input.data).forEach(([key, value]) => {
            const existingAttr = contextNode.attributes!.find(a => a.name === key);
            if (existingAttr) {
                existingAttr.value = String(value);
            } else {
                contextNode.attributes!.push({
                    name: key,
                    type: typeof value === 'number' ? 'number' : 'string',
                    value: String(value)
                });
            }
        });

        // Record mutation
        this.recordMutation({
            type: 'modify_node',
            data: {
                nodeName: contextName,
                updates: input.data
            }
        });

        return {
            success: true,
            context: contextName,
            written: Object.keys(input.data)
        };
    }

    /**
     * Execute one step of the machine
     * Returns true if step was executed, false if machine is complete
     */
    async step(): Promise<boolean> {
        const nodeName = this.context.currentNode;

        if (!nodeName) {
            console.log('Machine complete - no current node');
            return false;
        }

        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) {
            throw new Error(`Node ${nodeName} not found`);
        }

        console.log(`\n🎯 Step: ${nodeName} (${node.type || 'unknown'})`);

        // Track node invocation and check limits
        this.trackNodeInvocation(nodeName);

        // Track state transitions for cycle detection
        this.trackStateTransition(nodeName);

        // Check for cycles
        if (this.detectCycle()) {
            throw new Error(
                `Infinite loop detected: Machine is cycling through the same states repeatedly. ` +
                `Recent transitions: ${this.context.stateTransitions.slice(-10).map(t => t.state).join(' -> ')}`
            );
        }

        // Check timeout
        this.checkTimeout();

        // Step 1: Check for automated transitions
        const autoTransition = this.evaluateAutomatedTransitions(nodeName);
        if (autoTransition) {
            console.log(`✓ Automated transition: ${autoTransition.reason}`);
            this.transition(autoTransition.target, autoTransition.reason);
            return true;
        }

        // Step 2: If no auto-transition, check if agent decision required
        if (this.requiresAgentDecision(nodeName)) {
            console.log(`🤖 Agent decision required for ${nodeName}`);

            // Extract task-level model ID if present
            const attributes = this.getNodeAttributes(nodeName);
            const taskModelId = attributes.modelId ? String(attributes.modelId).replace(/^["']|["']$/g, '') : undefined;

            // Invoke agent with Agent SDK
            const systemPrompt = this.buildSystemPrompt(nodeName);
            const tools = this.buildPhaseTools(nodeName);

            const result = await this.agentSDKBridge.invokeAgent(
                nodeName,
                systemPrompt,
                tools,
                (toolName: string, input: any) => this.executeTool(toolName, input),
                taskModelId
            );

            console.log(`✓ Agent completed: ${result.output}`);

            // If agent determined next node, transition
            if (result.nextNode) {
                this.transition(result.nextNode, 'agent_decision');
                return true;
            }

            // Otherwise, machine is stuck - no decision made
            console.warn('⚠️ Agent completed but did not choose a transition');
            return false;
        }

        // No outbound edges - terminal node
        const outboundEdges = this.getOutboundEdges(nodeName);
        if (outboundEdges.length === 0) {
            console.log('✓ Reached terminal node');
            return false;
        }

        // Should not reach here - either auto-transition or agent decision should handle
        console.warn(`⚠️ No transition available for node: ${nodeName}`);
        return false;
    }

    /**
     * Execute the complete machine
     * Returns execution result compatible with old MachineExecutor interface
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
        console.log(`\n🚀 Starting execution: ${this.machineData.title}`);
        console.log(`⚙️ Limits: maxSteps=${this.limits.maxSteps}, maxNodeInvocations=${this.limits.maxNodeInvocations}, timeout=${this.limits.timeout}ms`);

        // Set execution start time for timeout tracking
        this.executionStartTime = Date.now();

        let stepCount = 0;

        while (stepCount < this.limits.maxSteps) {
            const continued = await this.step();
            if (!continued) {
                break;
            }
            stepCount++;
        }

        if (stepCount >= this.limits.maxSteps) {
            throw new Error(
                `Execution exceeded maximum steps (${this.limits.maxSteps}). ` +
                `This may indicate an infinite loop or a very complex machine. ` +
                `Consider increasing the maxSteps limit in the configuration.`
            );
        }

        const elapsed = Date.now() - this.executionStartTime;
        console.log(`\n✓ Execution complete: ${stepCount} steps in ${elapsed}ms`);

        // Return execution result
        return {
            currentNode: this.context.currentNode,
            errorCount: this.context.errorCount,
            visitedNodes: this.context.visitedNodes,
            attributes: this.context.attributes,
            history: this.context.history
        };
    }

    /**
     * Get machine data
     */
    getMachineData(): MachineData {
        return this.machineData;
    }
}
