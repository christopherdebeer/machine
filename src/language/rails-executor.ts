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
// Phase 1-3 execution managers
import {
    TransitionManager,
    ContextManager,
    PathManager,
    SynchronizationManager,
    AnnotationProcessor,
    EdgeTypeResolver,
    ErrorHandlingManager,
    SafetyManager,
    StateManager,
    ExecutionLogger,
    type LogLevel,
    type LogEntry
} from './execution/index.js';

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

    // Execution logger
    protected logger: ExecutionLogger;

    // Phase 1-3 managers (optional - backward compatibility)
    protected transitionManager?: TransitionManager;
    protected contextManager?: ContextManager;
    protected pathManager?: PathManager;
    protected synchronizationManager?: SynchronizationManager;
    protected annotationProcessor?: AnnotationProcessor;
    protected edgeTypeResolver?: EdgeTypeResolver;
    protected errorHandlingManager?: ErrorHandlingManager;
    protected safetyManager?: SafetyManager;
    protected stateManager?: StateManager;

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        super(machineData, config);

        // Initialize execution logger
        // Check for logLevel in machine attributes
        const machineAttrs = this.getNodeAttributes(machineData.title || 'machine');
        const logLevel = (machineAttrs.logLevel as LogLevel) || 'info';
        this.logger = new ExecutionLogger({ level: logLevel });
        this.logger.info('execution', `RailsExecutor initialized with log level: ${logLevel}`);

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
            config.agentSDK,
            this.logger
        );

        // Register dynamic tool patterns with ToolRegistry
        this.registerDynamicTools();

        // Initialize Phase 1-3 managers (available for use, but not required)
        this.initializeManagers();
    }

    /**
     * Initialize Phase 1-3 execution managers
     */
    private initializeManagers(): void {
        // Phase 1: Core managers
        this.transitionManager = new TransitionManager(this.machineData, this.celEvaluator);
        this.contextManager = new ContextManager(this.machineData);
        this.pathManager = new PathManager(this.limits.maxSteps, this.limits.maxNodeInvocations);

        // Phase 2: Enhanced semantics
        this.synchronizationManager = new SynchronizationManager();
        this.annotationProcessor = new AnnotationProcessor();
        this.edgeTypeResolver = new EdgeTypeResolver();
        this.errorHandlingManager = new ErrorHandlingManager();

        // Phase 3: Production features
        this.safetyManager = new SafetyManager(this.machineData, {
            circuitBreakerThreshold: 5,
            circuitBreakerTimeout: 60000,
            circuitBreakerSuccessThreshold: 2,
            defaultNodeTimeout: 30000,
            globalTimeout: this.limits.timeout,
            maxConcurrentPaths: 10,
            maxTotalSteps: this.limits.maxSteps,
            maxMemoryMB: 512
        });
        this.stateManager = new StateManager(100);

        console.log('✅ Phase 1-3 execution managers initialized');

        // Initialize execution paths for multiple entry points
        this.initializePaths();
    }

    /**
     * Initialize execution paths for all start nodes
     * Detects multiple entry points and creates a path for each
     */
    private initializePaths(): void {
        if (!this.transitionManager || !this.pathManager) {
            return;
        }

        // Find all start nodes (multiple entry points)
        const startNodes = this.transitionManager.findStartNodes();

        if (startNodes.length === 0) {
            console.warn('⚠️ No start nodes found in machine');
            return;
        }

        if (startNodes.length === 1) {
            // Single entry point - use legacy single-path mode (this.context)
            this.context.currentNode = startNodes[0];
            console.log(`📍 Single entry point: ${startNodes[0]}`);
        } else {
            // Multiple entry points - create a path for each
            console.log(`📍 Multiple entry points detected: ${startNodes.length} paths`);
            for (const startNode of startNodes) {
                const pathId = this.pathManager.createPath(startNode);
                console.log(`  ✓ Created path ${pathId} at ${startNode}`);
            }
            // Clear legacy context since we're using paths
            this.context.currentNode = '';
        }
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
            // Log API key status when in debug mode
            const apiKey = config.llm.apiKey;
            const hasApiKey = apiKey && apiKey.trim() !== '';
            executor.logger.debug('llm-client', `Creating LLM client: provider=${config.llm.provider}, model=${config.llm.modelId}, apiKey=${hasApiKey ? 'SET (non-empty)' : 'NOT SET or EMPTY'}`);

            try {
                executor.llmClient = await createLLMClient(config.llm);
                executor.logger.debug('llm-client', 'LLM client created successfully');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                executor.logger.error('llm-client', `Failed to create LLM client: ${errorMsg}`);
                throw error;
            }
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

        this.logger.debug('transition', `Evaluating ${outboundEdges.length} outbound edges from ${nodeName}`);

        // If only one edge and it's a state or init node, auto-transition
        if (outboundEdges.length === 1 && (NodeTypeChecker.isState(node) || NodeTypeChecker.isInit(node))) {
            const edge = outboundEdges[0];
            const condition = this.extractEdgeCondition(edge);

            this.logger.debug('transition', `Single edge from ${NodeTypeChecker.isInit(node) ? 'init' : 'state'} node`, {
                target: edge.target,
                condition: condition || 'none'
            });

            if (this.evaluateCondition(condition)) {
                this.logger.info('transition', `Auto-transition: ${nodeName} -> ${edge.target} (single edge)`, {
                    condition: condition || 'none',
                    result: 'true'
                });
                return {
                    edge,
                    target: edge.target,
                    condition,
                    isAutomatic: true,
                    reason: NodeTypeChecker.isInit(node) ? 'Single edge from init node' : 'Single edge from state node'
                };
            } else {
                this.logger.debug('transition', `Single edge condition not met`, {
                    condition: condition || 'none'
                });
            }
        }

        // Check edges with @auto annotation
        for (const edge of outboundEdges) {
            if (this.hasAutoAnnotation(edge)) {
                const condition = this.extractEdgeCondition(edge);

                this.logger.debug('transition', `Evaluating @auto edge: ${nodeName} -> ${edge.target}`, {
                    condition: condition || 'none'
                });

                if (this.evaluateCondition(condition)) {
                    this.logger.info('transition', `Auto-transition: ${nodeName} -> ${edge.target} (@auto)`, {
                        condition: condition || 'none',
                        result: 'true'
                    });
                    return {
                        edge,
                        target: edge.target,
                        condition,
                        isAutomatic: true,
                        reason: '@auto annotation'
                    };
                } else {
                    this.logger.debug('transition', `@auto edge condition not met`, {
                        target: edge.target,
                        condition: condition || 'none'
                    });
                }
            }
        }

        // Check for edges with simple deterministic conditions
        for (const edge of outboundEdges) {
            const condition = this.extractEdgeCondition(edge);

            if (condition && EdgeConditionParser.isSimpleCondition(condition)) {
                this.logger.debug('transition', `Evaluating simple condition edge: ${nodeName} -> ${edge.target}`, {
                    condition
                });

                if (this.evaluateCondition(condition)) {
                    this.logger.info('transition', `Auto-transition: ${nodeName} -> ${edge.target} (simple condition)`, {
                        condition,
                        result: 'true'
                    });
                    return {
                        edge,
                        target: edge.target,
                        condition,
                        isAutomatic: true,
                        reason: 'Simple deterministic condition'
                    };
                } else {
                    this.logger.debug('transition', `Simple condition not met`, {
                        target: edge.target,
                        condition,
                        result: 'false'
                    });
                }
            }
        }

        this.logger.debug('transition', `No automated transitions available from ${nodeName}`);
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

        this.logger.debug('execution', `Transitioning from ${fromNode} to ${targetNode}`, {
            transitionLabel
        });

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

                this.logger.debug('execution', `Entering state module: ${currentTarget}`, {
                    firstChild
                });

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
            this.logger.info('execution', `Entered state module(s): ${moduleChain.join(' -> ')}`, {
                finalTarget: currentTarget,
                fromNode
            });

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
            this.logger.info('execution', `Active state updated: ${targetNode}`);
        }

        this.logger.info('execution', `Transition completed: ${fromNode} -> ${targetNode}`, {
            transition: transitionLabel,
            nodeType: finalTargetObj?.type || 'unknown'
        });

        console.log(`🚂 Transitioned: ${fromNode} -> ${targetNode} (${transitionLabel})`);
    }

    /**
     * Build system prompt for a node using AgentContextBuilder
     * @param nodeName Node to build prompt for
     * @param pathId Optional path ID for multi-path execution
     */
    buildSystemPrompt(nodeName: string, pathId?: string): string {
        // For multi-path: build context from path-specific data
        if (pathId && this.pathManager) {
            const path = this.pathManager.getPath(pathId);
            if (path) {
                // Create a temporary context from path data
                const pathContext = {
                    currentNode: path.currentNode,
                    currentTaskNode: undefined,
                    activeState: undefined,
                    errorCount: path.errorCount,
                    visitedNodes: new Set(path.history.map(h => h.to)),
                    attributes: path.attributes,
                    history: path.history,
                    nodeInvocationCounts: path.nodeInvocationCounts,
                    stateTransitions: path.stateTransitions
                };
                const builder = new AgentContextBuilder(this.machineData, pathContext);
                return builder.buildSystemPrompt(nodeName);
            }
        }

        // Single-path: use global context
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
     * @param nodeName Node to build tools for
     * @param pathId Optional path ID for multi-path execution
     */
    protected buildPhaseTools(nodeName: string, pathId?: string): ToolDefinition[] {
        const tools: ToolDefinition[] = [];

        // Add transition tools (non-automated)
        const transitions = this.getNonAutomatedTransitions(nodeName);
        for (const transition of transitions) {
            const toolDef: ToolDefinition = {
                name: `transition_to_${transition.target}`,
                description: pathId
                    ? `[Path ${pathId.substring(0, 8)}] Transition to ${transition.target}${transition.description ? ': ' + transition.description : ''}`
                    : `Transition to ${transition.target}${transition.description ? ': ' + transition.description : ''}`,
                input_schema: {
                    type: 'object',
                    properties: {
                        reason: {
                            type: 'string',
                            description: 'Brief explanation of why this transition was chosen'
                        }
                    }
                }
            };

            // For multi-path, store pathId in the tool for later use
            if (pathId) {
                (toolDef as any).__pathId = pathId;
            }

            tools.push(toolDef);
        }

        // Add context tools (read/write based on permissions)
        // Use path-specific context if pathId provided
        let builderContext = this.context;
        if (pathId && this.pathManager) {
            const path = this.pathManager.getPath(pathId);
            if (path) {
                builderContext = {
                    currentNode: path.currentNode,
                    currentTaskNode: undefined,
                    activeState: undefined,
                    errorCount: path.errorCount,
                    visitedNodes: new Set(path.history.map(h => h.to)),
                    attributes: path.attributes,
                    history: path.history,
                    nodeInvocationCounts: path.nodeInvocationCounts,
                    stateTransitions: path.stateTransitions
                };
            }
        }

        const builder = new AgentContextBuilder(this.machineData, builderContext);
        const contexts = builder.getAccessibleContextNodes(nodeName);

        for (const [contextName, perms] of contexts.entries()) {
            if (perms.canRead) {
                const readTool: ToolDefinition = {
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
                };
                if (pathId) {
                    (readTool as any).__pathId = pathId;
                }
                tools.push(readTool);
            }

            if (perms.canWrite) {
                const writeTool: ToolDefinition = {
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
                };
                if (pathId) {
                    (writeTool as any).__pathId = pathId;
                }
                tools.push(writeTool);
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
     * Execute a tool for a specific path (multi-path execution)
     * Delegates to path-specific context operations
     */
    async executeToolForPath(toolName: string, input: any, pathId: string): Promise<any> {
        console.log(`🔧 Path ${pathId.substring(0, 8)}: Executing tool ${toolName}`);

        // Handle transition tools
        if (toolName.startsWith('transition_to_')) {
            return await this.handleTransitionToolForPath(toolName, input, pathId);
        }

        // Handle context read tools
        if (toolName.startsWith('read_')) {
            return await this.handleReadToolForPath(toolName, input, pathId);
        }

        // Handle context write tools
        if (toolName.startsWith('write_')) {
            return await this.handleWriteToolForPath(toolName, input, pathId);
        }

        // Fallback to regular tool execution for meta-tools
        return await this.executeTool(toolName, input);
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

            this.logger.info('context', `Read from context: ${contextName}`, {
                fields: input.fields,
                values: filtered
            });

            return {
                success: true,
                context: contextName,
                data: filtered
            };
        }

        this.logger.info('context', `Read all from context: ${contextName}`, {
            fieldCount: Object.keys(attributes).length
        });

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

        this.logger.info('context', `Writing to context: ${contextName}`, {
            fields: Object.keys(input.data),
            values: input.data
        });

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

        this.logger.debug('context', `Context update recorded as mutation`);

        return {
            success: true,
            context: contextName,
            written: Object.keys(input.data)
        };
    }

    /**
     * Handle transition tool execution for a specific path
     */
    private async handleTransitionToolForPath(name: string, input: any, pathId: string): Promise<any> {
        const targetNode = name.replace('transition_to_', '');
        const reason = input.reason || 'agent decision';

        const path = this.pathManager?.getPath(pathId);
        if (!path) {
            throw new Error(`Path ${pathId} not found`);
        }

        // Validate transition is valid from this path's current node
        const transitions = this.getNonAutomatedTransitions(path.currentNode);
        const validTransition = transitions.find(t => t.target === targetNode);

        if (!validTransition) {
            throw new Error(`Invalid transition for path ${pathId}: ${path.currentNode} -> ${targetNode}`);
        }

        return {
            success: true,
            action: 'transition',
            target: targetNode,
            reason
        };
    }

    /**
     * Handle read tool execution for a specific path
     */
    private async handleReadToolForPath(name: string, input: any, pathId: string): Promise<any> {
        const contextName = name.replace('read_', '');
        const path = this.pathManager?.getPath(pathId);

        if (!path) {
            throw new Error(`Path ${pathId} not found`);
        }

        // Track context read
        path.contextReads.add(contextName);

        // Read from path-specific attributes
        if (input.fields && Array.isArray(input.fields)) {
            const filtered: Record<string, any> = {};
            input.fields.forEach((field: string) => {
                if (path.attributes.has(field)) {
                    filtered[field] = path.attributes.get(field);
                }
            });

            this.logger.info('context', `Path ${pathId}: Read from context ${contextName}`, {
                fields: input.fields,
                values: filtered
            });

            return {
                success: true,
                context: contextName,
                data: filtered
            };
        }

        // Return all attributes
        const allData: Record<string, any> = {};
        path.attributes.forEach((value, key) => {
            allData[key] = value;
        });

        this.logger.info('context', `Path ${pathId}: Read all from context ${contextName}`, {
            fieldCount: path.attributes.size
        });

        return {
            success: true,
            context: contextName,
            data: allData
        };
    }

    /**
     * Handle write tool execution for a specific path
     */
    private async handleWriteToolForPath(name: string, input: any, pathId: string): Promise<any> {
        const contextName = name.replace('write_', '');
        const path = this.pathManager?.getPath(pathId);

        if (!path) {
            throw new Error(`Path ${pathId} not found`);
        }

        if (!input.data || typeof input.data !== 'object') {
            throw new Error('write tool requires data object');
        }

        // Track context write
        path.contextWrites.add(contextName);

        this.logger.info('context', `Path ${pathId}: Writing to context ${contextName}`, {
            fields: Object.keys(input.data),
            values: input.data
        });

        // Update path-specific attributes
        Object.entries(input.data).forEach(([key, value]) => {
            path.attributes.set(key, value);
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
        // Check if we're using multi-path execution
        const activePaths = this.pathManager?.getActivePaths() || [];

        if (activePaths.length > 0) {
            // Multi-path execution mode
            return await this.stepMultiPath();
        }

        // Single-path execution mode (legacy)
        return await this.stepSinglePath();
    }

    /**
     * Execute one step in single-path mode (legacy)
     */
    private async stepSinglePath(): Promise<boolean> {
        const nodeName = this.context.currentNode;

        if (!nodeName) {
            this.logger.info('execution', 'Machine complete - no current node');
            console.log('Machine complete - no current node');
            return false;
        }

        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) {
            this.logger.error('execution', `Node ${nodeName} not found`);
            throw new Error(`Node ${nodeName} not found`);
        }

        // Get node attributes for detailed logging
        const attributes = this.getNodeAttributes(nodeName);
        const nodeType = node.type || 'unknown';

        this.logger.info('execution', `Entering node: ${nodeName}`, {
            type: nodeType,
            attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
            stepCount: this.context.history.length,
            activeState: this.context.activeState
        });

        console.log(`\n🎯 Step: ${nodeName} (${nodeType})`);

        // Phase 3: Safety checks
        if (this.safetyManager) {
            // Check circuit breaker
            if (!this.safetyManager.canExecuteNode(nodeName)) {
                this.logger.warn('safety', `Circuit breaker open for node ${nodeName}`);
                console.warn(`⚠️ Circuit breaker open for node ${nodeName}, skipping`);
                return false;
            }

            // Check global timeout
            this.safetyManager.checkGlobalTimeout();

            // Check resource limits
            const usage = {
                totalSteps: this.context.history.length,
                totalPaths: 1,
                activePaths: this.context.currentNode ? 1 : 0,
                totalNodeInvocations: Array.from(this.context.nodeInvocationCounts.values())
                    .reduce((sum, count) => sum + count, 0),
                startTime: this.executionStartTime || Date.now(),
                elapsedTime: this.executionStartTime ? Date.now() - this.executionStartTime : 0
            };
            this.safetyManager.checkResourceLimits(usage);
        }

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

        // Log outbound edges
        const outboundEdges = this.getOutboundEdges(nodeName);
        this.logger.debug('execution', `Node has ${outboundEdges.length} outbound edges`, {
            edges: outboundEdges.map(e => ({
                target: e.target,
                label: e.label || e.type,
                hasAnnotations: (e.annotations?.length || 0) > 0
            }))
        });

        // Step 1: Check for automated transitions
        const autoTransition = this.evaluateAutomatedTransitions(nodeName);
        if (autoTransition) {
            this.logger.info('transition', `Automated transition from ${nodeName} to ${autoTransition.target}`, {
                reason: autoTransition.reason,
                condition: autoTransition.condition
            });
            console.log(`✓ Automated transition: ${autoTransition.reason}`);
            this.transition(autoTransition.target, autoTransition.reason);
            return true;
        }

        // Step 2: If no auto-transition, check if agent decision required
        if (this.requiresAgentDecision(nodeName)) {
            this.logger.info('execution', `Agent decision required for ${nodeName}`, {
                nonAutomatedTransitions: this.getNonAutomatedTransitions(nodeName).length
            });
            console.log(`🤖 Agent decision required for ${nodeName}`);

            // Extract task-level model ID if present
            const taskModelId = attributes.modelId ? String(attributes.modelId).replace(/^["']|["']$/g, '') : undefined;

            // Invoke agent with Agent SDK
            const systemPrompt = this.buildSystemPrompt(nodeName);
            const tools = this.buildPhaseTools(nodeName);

            this.logger.debug('execution', `Invoking agent with ${tools.length} tools`, {
                modelId: taskModelId,
                toolNames: tools.map(t => t.name)
            });

            try {
                const result = await this.agentSDKBridge.invokeAgent(
                    nodeName,
                    systemPrompt,
                    tools,
                    (toolName: string, input: any) => this.executeTool(toolName, input),
                    taskModelId
                );

                this.logger.info('execution', `Agent completed successfully`, {
                    output: result.output,
                    nextNode: result.nextNode
                });

                console.log(`✓ Agent completed: ${result.output}`);

                // Phase 3: Record success
                if (this.safetyManager) {
                    this.safetyManager.recordSuccess(nodeName);
                }

                // If agent determined next node, transition
                if (result.nextNode) {
                    this.transition(result.nextNode, 'agent_decision');
                    return true;
                }

                // Otherwise, machine is stuck - no decision made
                this.logger.warn('execution', 'Agent completed but did not choose a transition');
                console.warn('⚠️ Agent completed but did not choose a transition');
                return false;
            } catch (error) {
                // Phase 3: Record failure
                if (this.safetyManager && error instanceof Error) {
                    this.safetyManager.recordFailure(nodeName, error);
                }
                this.logger.error('execution', `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }

        // No outbound edges - terminal node
        if (outboundEdges.length === 0) {
            this.logger.info('execution', `Reached terminal node: ${nodeName}`);
            console.log('✓ Reached terminal node');
            return false;
        }

        // Should not reach here - either auto-transition or agent decision should handle
        this.logger.warn('execution', `No transition available for node: ${nodeName}`, {
            outboundEdges: outboundEdges.length,
            requiresAgent: this.requiresAgentDecision(nodeName)
        });
        console.warn(`⚠️ No transition available for node: ${nodeName}`);
        return false;
    }

    /**
     * Execute one step in multi-path mode
     * Processes all active paths and handles forking on @parallel edges
     */
    private async stepMultiPath(): Promise<boolean> {
        if (!this.pathManager || !this.transitionManager) {
            throw new Error('PathManager or TransitionManager not initialized for multi-path execution');
        }

        const activePaths = this.pathManager.getActivePaths();

        if (activePaths.length === 0) {
            this.logger.info('execution', 'All paths complete');
            console.log('✓ All paths complete');
            return false;
        }

        console.log(`\n🔀 Step: ${activePaths.length} active path(s)`);

        // Process each active path
        let anyPathContinued = false;

        for (const path of activePaths) {
            const nodeName = path.currentNode;

            if (!nodeName) {
                this.pathManager.updatePathStatus(path.id, 'completed');
                continue;
            }

            console.log(`\n  📍 Path ${path.id.substring(0, 8)}: ${nodeName}`);

            const node = this.machineData.nodes.find(n => n.name === nodeName);
            if (!node) {
                this.logger.error('execution', `Path ${path.id}: Node ${nodeName} not found`);
                this.pathManager.updatePathStatus(path.id, 'failed');
                continue;
            }

            // Safety checks for this path
            this.trackNodeInvocation(nodeName);

            // Get outbound edges using TransitionManager
            const outboundEdges = this.transitionManager.getOutboundEdges(nodeName);

            // Check for @parallel edges (explicit forking)
            const parallelEdges = outboundEdges.filter(e =>
                this.transitionManager?.hasParallelAnnotation(e)
            );

            if (parallelEdges.length > 0) {
                console.log(`  🔱 Forking at ${nodeName}: ${parallelEdges.length} parallel paths`);

                for (const edge of parallelEdges) {
                    const newPathId = this.pathManager.createPath(edge.target);
                    console.log(`    ✓ Created parallel path ${newPathId.substring(0, 8)} to ${edge.target}`);
                }

                // Current path completes after forking
                this.pathManager.updatePathStatus(path.id, 'completed');
                anyPathContinued = true;
                continue;
            }

            // Check for automated transitions
            const autoTransition = this.evaluateAutomatedTransitions(nodeName);
            if (autoTransition) {
                this.logger.info('transition', `Path ${path.id}: Auto-transition to ${autoTransition.target}`, {
                    reason: autoTransition.reason
                });
                console.log(`    → ${autoTransition.target} (${autoTransition.reason})`);

                // Update path
                this.pathManager.recordTransition(
                    path.id,
                    nodeName,
                    autoTransition.target,
                    autoTransition.reason
                );

                // Update path's current node
                const pathObj = this.pathManager.getPath(path.id);
                if (pathObj) {
                    pathObj.currentNode = autoTransition.target;
                    pathObj.stepCount++;
                }

                anyPathContinued = true;
                continue;
            }

            // Check if agent decision required
            if (this.requiresAgentDecision(nodeName)) {
                console.log(`    🤖 Agent decision required for path ${path.id.substring(0, 8)}`);

                // Get node attributes for model configuration
                const attributes = this.getNodeAttributes(nodeName);
                const taskModelId = attributes.modelId ? String(attributes.modelId).replace(/^["']|["']$/g, '') : undefined;

                // Build path-specific system prompt and tools
                const systemPrompt = this.buildSystemPrompt(nodeName, path.id);
                const tools = this.buildPhaseTools(nodeName, path.id);

                this.logger.debug('execution', `Path ${path.id}: Invoking agent with ${tools.length} tools`, {
                    modelId: taskModelId,
                    toolNames: tools.map(t => t.name)
                });

                try {
                    const result = await this.agentSDKBridge.invokeAgent(
                        nodeName,
                        systemPrompt,
                        tools,
                        (toolName: string, input: any) => this.executeToolForPath(toolName, input, path.id),
                        taskModelId
                    );

                    this.logger.info('execution', `Path ${path.id}: Agent completed successfully`, {
                        output: result.output,
                        nextNode: result.nextNode
                    });

                    console.log(`    ✓ Agent completed: ${result.output?.substring(0, 50)}...`);

                    // Record success
                    if (this.safetyManager) {
                        this.safetyManager.recordSuccess(nodeName);
                    }

                    // If agent determined next node, update path
                    if (result.nextNode) {
                        this.pathManager.recordTransition(
                            path.id,
                            nodeName,
                            result.nextNode,
                            'agent_decision'
                        );

                        // Update path's current node
                        path.currentNode = result.nextNode;
                        path.stepCount++;

                        anyPathContinued = true;
                        continue;
                    }

                    // Agent completed but didn't choose a transition - mark waiting
                    this.logger.warn('execution', `Path ${path.id}: Agent completed but did not choose a transition`);
                    console.warn(`    ⚠️ No transition chosen`);
                    this.pathManager.updatePathStatus(path.id, 'waiting');
                    continue;

                } catch (error) {
                    // Record failure
                    if (this.safetyManager && error instanceof Error) {
                        this.safetyManager.recordFailure(nodeName, error);
                    }
                    this.logger.error('execution', `Path ${path.id}: Agent execution failed: ${error instanceof Error ? error.message : String(error)}`);
                    console.error(`    ❌ Agent failed: ${error instanceof Error ? error.message : String(error)}`);

                    // Mark path as failed
                    this.pathManager.updatePathStatus(path.id, 'failed');
                    path.errorCount++;
                    continue;
                }
            }

            // No outbound edges - terminal node
            if (outboundEdges.length === 0) {
                console.log(`    ✓ Terminal node reached`);
                this.pathManager.updatePathStatus(path.id, 'completed');
                continue;
            }

            // No valid transition found
            console.log(`    ⚠️ No valid transition`);
            this.pathManager.updatePathStatus(path.id, 'waiting');
        }

        return anyPathContinued || this.pathManager.hasActivePaths();
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

    /**
     * Get Phase 1-3 managers (for advanced usage)
     */
    getManagers() {
        return {
            transition: this.transitionManager,
            context: this.contextManager,
            path: this.pathManager,
            synchronization: this.synchronizationManager,
            annotation: this.annotationProcessor,
            edgeType: this.edgeTypeResolver,
            errorHandling: this.errorHandlingManager,
            safety: this.safetyManager,
            state: this.stateManager,
            logger: this.logger
        };
    }

    /**
     * Get execution logger
     */
    getLogger(): ExecutionLogger {
        return this.logger;
    }

    /**
     * Get log entries (all or filtered)
     */
    getLogs(filters?: { level?: LogLevel; category?: string }): LogEntry[] {
        return this.logger.getFilteredEntries(filters as any);
    }

    /**
     * Set log level dynamically
     */
    setLogLevel(level: LogLevel): void {
        this.logger.setLevel(level);
        this.logger.info('execution', `Log level changed to: ${level}`);
    }

    /**
     * Create a checkpoint of current execution state
     */
    createCheckpoint(description?: string): string | null {
        if (!this.stateManager) return null;

        // For single-path execution, create a simplified checkpoint
        const simplifiedPath = {
            id: 'main',
            currentNode: this.context.currentNode,
            history: this.context.history,
            status: 'active' as const,
            stepCount: this.context.history.length,
            nodeInvocationCounts: this.context.nodeInvocationCounts,
            stateTransitions: this.context.stateTransitions,
            startTime: this.executionStartTime || Date.now()
        };

        // Get shared context from machine data
        const sharedContext: Record<string, any> = {};
        for (const node of this.machineData.nodes) {
            if (NodeTypeChecker.isContext(node)) {
                sharedContext[node.name] = this.getNodeAttributes(node.name);
            }
        }

        return this.stateManager.createCheckpoint(
            this.machineData,
            [simplifiedPath],
            sharedContext,
            this.context.history.length,
            description
        );
    }

    /**
     * Restore execution state from checkpoint
     */
    restoreCheckpoint(checkpointId: string): boolean {
        if (!this.stateManager) return false;

        const checkpoint = this.stateManager.restoreCheckpoint(checkpointId);
        if (!checkpoint) return false;

        // Restore machine data
        this.machineData = checkpoint.machineData;

        // Restore execution context from first path (single-path execution)
        if (checkpoint.paths.length > 0) {
            const path = checkpoint.paths[0];
            this.context.currentNode = path.currentNode;
            this.context.history = path.history;
            this.context.nodeInvocationCounts = path.nodeInvocationCounts;
            this.context.stateTransitions = path.stateTransitions;
        }

        console.log(`✅ Checkpoint restored: ${checkpointId}`);
        return true;
    }

    /**
     * Get safety manager statistics
     */
    getSafetyStats() {
        if (!this.safetyManager) return null;

        return {
            circuitBreakers: this.safetyManager.getCircuitBreakerStats(),
            resourceUsage: {
                totalSteps: this.context.history.length,
                totalPaths: 1,
                activePaths: this.context.currentNode ? 1 : 0,
                totalNodeInvocations: Array.from(this.context.nodeInvocationCounts.values())
                    .reduce((sum, count) => sum + count, 0),
                startTime: this.executionStartTime || Date.now(),
                elapsedTime: this.executionStartTime ? Date.now() - this.executionStartTime : 0
            }
        };
    }
}
