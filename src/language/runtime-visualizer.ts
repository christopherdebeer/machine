/**
 * Enhanced Runtime Visualization System
 * Maintains visual consistency with static diagrams while adding runtime state
 */

import { MachineExecutor } from './executor.js';
import type { MachineJSON } from './json/types.js';
import { generateRuntimeGraphviz, DiagramOptions, RuntimeContext as DiagramRuntimeContext } from './diagram/index.js';
import type { VisualizationState, ToolDefinition, ToolExecutionResult, PathStatus } from './execution/runtime-types.js';

// Type alias for backward compatibility
type MachineData = MachineJSON;

// Define MachineExecutionContext locally (based on agent-sdk-bridge.ts pattern)
export interface ExecutionState {
    currentNode: string;
    currentTaskNode?: string;
    activeState?: string;
    errorCount: number;
}

export interface VisualizationState {
    visitedNodes: Set<string>;
    attributes: Map<string, any>;
    nodeInvocationCounts?: Map<string, number>;
    stateTransitions?: Array<{from: string; to: string; timestamp: string}>;
}

export interface MachineExecutionContext extends ExecutionState, VisualizationState {
    history: Array<{
        from: string;
        to: string;
        transition: string;
        timestamp: string;
        output?: string;
    }>;
}

export interface RuntimeVisualizationOptions {
    showRuntimeValues?: boolean;
    showExecutionPath?: boolean;
    showVisitCounts?: boolean;
    showCurrentState?: boolean;
    format?: 'class' | 'state' | 'hybrid';
    mobileOptimized?: boolean;
}

export class RuntimeVisualizer {
    private context: MachineExecutionContext;
    private machineData: MachineData;
    private executor: MachineExecutor;

    constructor(executor: MachineExecutor) {
        // Keep executor reference for enhanced snapshot generation
        this.executor = executor;

        // Safely copy the context to avoid circular references
        const originalContext = executor.getContext();
        this.context = {
            currentNode: originalContext.currentNode,
            currentTaskNode: originalContext.currentTaskNode,
            activeState: originalContext.activeState,
            errorCount: originalContext.errorCount || 0,
            visitedNodes: new Set(Array.from(originalContext.visitedNodes)),
            attributes: new Map(Array.from(originalContext.attributes.entries())),
            history: originalContext.history.map(step => ({
                from: step.from,
                to: step.to,
                transition: step.transition,
                timestamp: step.timestamp,
                output: typeof step.output === 'string' ? step.output : String(step.output || '')
            })),
            nodeInvocationCounts: new Map(Array.from(originalContext.nodeInvocationCounts?.entries() || [])),
            stateTransitions: originalContext.stateTransitions ? [...originalContext.stateTransitions] : []
        };
        this.machineData = executor.getMachineDefinition();
    }

    /**
     * Generate enhanced runtime visualization using Graphviz DOT format
     */
    public generateRuntimeVisualization(options: RuntimeVisualizationOptions = {}): string {
        const opts = {
            showRuntimeValues: true,
            showExecutionPath: true,
            showVisitCounts: true,
            showCurrentState: true,
            format: 'class' as const,
            mobileOptimized: false,
            ...options
        };

        // Use the unified Graphviz generator from diagram module
        return this.generateGraphvizRuntime(opts);
    }

    /**
     * Convert execution context to diagram runtime context
     */
    private toDiagramContext(): DiagramRuntimeContext {
        return {
            currentNode: this.context.currentNode,
            currentTaskNode: this.context.currentTaskNode,
            activeState: this.context.activeState,
            errorCount: this.context.errorCount || 0,
            visitedNodes: this.context.visitedNodes,
            attributes: this.context.attributes,
            history: this.context.history,
            nodeInvocationCounts: this.context.nodeInvocationCounts,
            stateTransitions: this.context.stateTransitions
        };
    }

    /**
     * Generate Graphviz DOT diagram with runtime overlays
     */
    private generateGraphvizRuntime(options: RuntimeVisualizationOptions): string {
        // Convert to diagram module format and use encapsulated Graphviz generator
        const diagramContext = this.toDiagramContext();
        const diagramOptions: DiagramOptions = {
            showRuntimeState: options.showCurrentState !== false,
            showVisitCounts: options.showVisitCounts !== false,
            showExecutionPath: options.showExecutionPath !== false,
            showRuntimeValues: options.showRuntimeValues !== false,
            mobileOptimized: options.mobileOptimized || false,
            title: this.machineData.title
        };

        return generateRuntimeGraphviz(this.machineData, diagramContext, diagramOptions);
    }

    /**
     * Generate mobile-optimized visualization
     */
    public generateMobileVisualization(): string {
        return this.generateRuntimeVisualization({
            showRuntimeValues: true,
            showExecutionPath: false, // Reduce clutter on mobile
            showVisitCounts: true,
            showCurrentState: true,
            format: 'class',
            mobileOptimized: true
        });
    }

    /**
     * Generate compact runtime summary for mobile
     */
    public generateRuntimeSummary(): {
        currentNode: string;
        totalSteps: number;
        visitedNodes: number;
        pendingNodes: number;
        lastAction?: string;
    } {
        return {
            currentNode: this.context.currentNode,
            totalSteps: this.context.history.length,
            visitedNodes: this.context.visitedNodes.size,
            pendingNodes: this.machineData.nodes.length - this.context.visitedNodes.size - 1,
            lastAction: this.context.history[this.context.history.length - 1]?.transition
        };
    }

    /**
     * Generate comprehensive runtime snapshot with execution affordances
     */
    public generateRuntimeSnapshot(): RuntimeSnapshot {
        const vizState = this.executor.getVisualizationState();
        const state = (this.executor as any).currentState;

        return {
            currentNodes: this.extractCurrentNodes(vizState),
            affordances: {
                transitions: this.extractAvailableTransitions(vizState),
                tools: this.extractAvailableTools(vizState),
                contexts: this.extractContextAffordances(vizState)
            },
            paths: this.extractPathState(vizState, state),
            turnState: this.extractTurnState(state),
            metadata: this.extractMetadata(vizState, state)
        };
    }

    /**
     * Extract current execution positions
     */
    private extractCurrentNodes(vizState: VisualizationState): RuntimeSnapshot['currentNodes'] {
        return vizState.currentNodes.map(cn => ({
            pathId: cn.pathId,
            nodeName: cn.nodeName,
            nodeType: this.getNodeType(cn.nodeName)
        }));
    }

    /**
     * Get node type from machine definition
     */
    private getNodeType(nodeName: string): RuntimeSnapshot['currentNodes'][0]['nodeType'] {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) return 'Unknown';

        const type = node.type?.toLowerCase();
        if (type === 'task') return 'Task';
        if (type === 'input') return 'Input';
        if (type === 'result') return 'Result';
        if (type === 'context') return 'Context';
        if (type === 'state') return 'State';

        return 'Unknown';
    }

    /**
     * Extract available transitions with evaluation
     */
    private extractAvailableTransitions(vizState: VisualizationState): RuntimeSnapshot['affordances']['transitions'] {
        return vizState.availableTransitions.map(t => ({
            pathId: t.pathId,
            fromNode: t.fromNode,
            toNode: t.toNode,
            isAutomatic: t.isAutomatic,
            condition: t.condition,
            canTake: true  // For now, assume all transitions can be taken
        }));
    }

    /**
     * Extract available tools for each active path
     */
    private extractAvailableTools(vizState: VisualizationState): ToolAffordance[] {
        const tools: ToolAffordance[] = [];

        for (const path of vizState.activePaths) {
            // Get context tools (read/write operations)
            tools.push(...this.extractContextTools(path.id));
        }

        return tools;
    }

    /**
     * Extract context read/write tools
     */
    private extractContextTools(pathId: string): ToolAffordance[] {
        const tools: ToolAffordance[] = [];

        // Find all context nodes
        const contextNodes = this.machineData.nodes.filter(n => n.type === 'Context');

        for (const contextNode of contextNodes) {
            // Add read tool
            tools.push({
                pathId,
                toolName: `read_${contextNode.name}`,
                description: `Read values from ${contextNode.name} context`,
                source: 'context',
                inputSchema: {
                    type: 'object',
                    properties: {
                        attribute: {
                            type: 'string',
                            description: 'Attribute name to read'
                        }
                    }
                }
            });

            // Add write tool
            tools.push({
                pathId,
                toolName: `write_${contextNode.name}`,
                description: `Write values to ${contextNode.name} context`,
                source: 'context',
                inputSchema: {
                    type: 'object',
                    properties: {
                        attribute: {
                            type: 'string',
                            description: 'Attribute name to write'
                        },
                        value: {
                            description: 'Value to write'
                        }
                    },
                    required: ['attribute', 'value']
                }
            });
        }

        return tools;
    }

    /**
     * Extract context affordances
     */
    private extractContextAffordances(vizState: VisualizationState): ContextAffordance[] {
        const contexts: ContextAffordance[] = [];

        // Find all context nodes
        const contextNodes = this.machineData.nodes.filter(n => n.type === 'Context');

        for (const contextNode of contextNodes) {
            const attributes: ContextAffordance['attributes'] = {};

            // Extract attribute definitions
            if (contextNode.attributes) {
                for (const attr of contextNode.attributes) {
                    // Get current value from visualization state
                    const currentValue = vizState.nodeStates[contextNode.name]?.contextValues?.[attr.name];

                    attributes[attr.name] = {
                        type: this.extractAttributeType(attr),
                        currentValue: currentValue ?? attr.value,
                        defaultValue: attr.value,
                        isWritable: true
                    };
                }
            }

            contexts.push({
                name: contextNode.name,
                nodeType: contextNode.type,
                attributes
            });
        }

        return contexts;
    }

    /**
     * Extract attribute type from attribute definition
     */
    private extractAttributeType(attr: any): string {
        if (attr.typeAnnotation) {
            return attr.typeAnnotation.name || 'any';
        }

        // Infer from value
        const value = attr.value;
        if (typeof value === 'string') return 'string';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (Array.isArray(value)) return 'array';
        if (value === null) return 'null';
        if (typeof value === 'object') return 'object';

        return 'any';
    }

    /**
     * Extract path state information
     */
    private extractPathState(vizState: VisualizationState, state: any): RuntimeSnapshot['paths'] {
        const details = vizState.allPaths.map(p => ({
            id: p.id,
            status: p.status,
            currentNode: p.currentNode,
            stepCount: p.stepCount,
            isInTurn: state.turnState?.pathId === p.id,
            turnCount: state.turnState?.pathId === p.id ? state.turnState.turnCount : undefined,
            lastTransition: p.history[p.history.length - 1]?.transition
        }));

        return {
            active: vizState.activePathCount,
            completed: vizState.completedPathCount,
            failed: vizState.failedPathCount,
            waiting: vizState.totalPaths - vizState.activePathCount - vizState.completedPathCount - vizState.failedPathCount,
            details
        };
    }

    /**
     * Extract turn-level execution state
     */
    private extractTurnState(state: any): RuntimeSnapshot['turnState'] | undefined {
        if (!state.turnState) return undefined;

        return {
            pathId: state.turnState.pathId,
            nodeName: state.turnState.nodeName,
            turnCount: state.turnState.turnCount,
            availableTools: state.turnState.conversationState.tools,
            conversationLength: state.turnState.conversationState.messages.length,
            lastToolExecutions: state.turnState.conversationState.toolExecutions,
            isWaitingForTurn: state.turnState.isWaitingForTurn,
            systemPrompt: state.turnState.systemPrompt,
            modelId: state.turnState.modelId
        };
    }

    /**
     * Extract execution metadata
     */
    private extractMetadata(vizState: VisualizationState, state: any): RuntimeSnapshot['metadata'] {
        return {
            totalSteps: vizState.stepCount,
            elapsedTime: vizState.elapsedTime,
            errorCount: vizState.errorCount,
            isComplete: vizState.activePathCount === 0 && vizState.totalPaths > 0,
            isPaused: state.turnState?.isWaitingForTurn || false,
            startTime: state.metadata.startTime
        };
    }
}

/**
 * Enhanced MachineExecutor with integrated runtime visualization
 */
export class VisualizingMachineExecutor extends MachineExecutor {
    private visualizer: RuntimeVisualizer;

    constructor(machineData: MachineData, config: any = {}) {
        super(machineData, config);
        this.visualizer = new RuntimeVisualizer(this);
    }

    /**
     * Create a VisualizingMachineExecutor with LLM client
     */
    public static override async create(machineData: MachineData, config: any = {}): Promise<VisualizingMachineExecutor> {
        const baseExecutor = await MachineExecutor.create(machineData, config);
        const visualizingExecutor = new VisualizingMachineExecutor(machineData, config);
        
        // Copy the LLM client from the base executor
        if ((baseExecutor as any).llmClient) {
            (visualizingExecutor as any).llmClient = (baseExecutor as any).llmClient;
        }
        
        return visualizingExecutor;
    }

    /**
     * Get runtime visualization
     */
    public getRuntimeVisualization(options?: RuntimeVisualizationOptions): string {
        // Update visualizer with current state
        this.visualizer = new RuntimeVisualizer(this);
        return this.visualizer.generateRuntimeVisualization(options);
    }

    /**
     * Get mobile-optimized runtime visualization
     */
    public getMobileRuntimeVisualization(): string {
        this.visualizer = new RuntimeVisualizer(this);
        return this.visualizer.generateMobileVisualization();
    }

    /**
     * Get runtime summary for mobile UI
     */
    public getRuntimeSummary() {
        this.visualizer = new RuntimeVisualizer(this);
        return this.visualizer.generateRuntimeSummary();
    }

    /**
     * Get comprehensive runtime snapshot with execution affordances
     */
    public getRuntimeSnapshot(): RuntimeSnapshot {
        this.visualizer = new RuntimeVisualizer(this);
        return this.visualizer.generateRuntimeSnapshot();
    }

}

// ============================================================================
// Enhanced Runtime Snapshot Types & Methods
// ============================================================================

/**
 * Tool affordance information
 */
export interface ToolAffordance {
    pathId: string;
    toolName: string;
    description: string;
    source: 'machine' | 'dynamic' | 'context' | 'meta';
    inputSchema: any;
}

/**
 * Context affordance information
 */
export interface ContextAffordance {
    name: string;
    nodeType: string;
    attributes: Record<string, {
        type: string;
        currentValue: any;
        defaultValue: any;
        isWritable: boolean;
    }>;
}

/**
 * Comprehensive runtime snapshot showing all execution affordances
 */
export interface RuntimeSnapshot {
    // Current execution position(s) across all active paths
    currentNodes: Array<{
        pathId: string;
        nodeName: string;
        nodeType: 'Task' | 'Input' | 'Result' | 'Context' | 'State' | 'Unknown';
    }>;

    // Available execution affordances
    affordances: {
        // Transitions that can be taken from current node(s)
        transitions: Array<{
            pathId: string;
            fromNode: string;
            toNode: string;
            isAutomatic: boolean;
            condition?: string;
            canTake: boolean;
        }>;

        // Tools available at current node(s)
        tools: ToolAffordance[];

        // Contexts accessible from current node(s)
        contexts: ContextAffordance[];
    };

    // Multi-path execution state
    paths: {
        active: number;
        completed: number;
        failed: number;
        waiting: number;
        details: Array<{
            id: string;
            status: PathStatus;
            currentNode: string;
            stepCount: number;
            isInTurn: boolean;
            turnCount?: number;
            lastTransition?: string;
        }>;
    };

    // Turn-level state (if currently in turn execution)
    turnState?: {
        pathId: string;
        nodeName: string;
        turnCount: number;
        availableTools: ToolDefinition[];
        conversationLength: number;
        lastToolExecutions: ToolExecutionResult[];
        isWaitingForTurn: boolean;
        systemPrompt: string;
        modelId?: string;
    };

    // Execution metadata
    metadata: {
        totalSteps: number;
        elapsedTime: number;
        errorCount: number;
        isComplete: boolean;
        isPaused: boolean;
        startTime: number;
    };
}

// ============================================================================
// Formatting Utilities for RuntimeSnapshot
// ============================================================================

/**
 * Format runtime snapshot as human-readable text
 */
export function formatRuntimeSnapshot(snapshot: RuntimeSnapshot): string {
    const lines: string[] = [];

    // Header
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  RUNTIME EXECUTION SNAPSHOT');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    // Current Position
    lines.push('📍 CURRENT POSITION');
    lines.push('───────────────────────────────────────────────────────────');
    if (snapshot.currentNodes.length === 0) {
        lines.push('  (no active nodes)');
    } else {
        for (const node of snapshot.currentNodes) {
            lines.push(`  Path ${node.pathId}: ${node.nodeName} (${node.nodeType})`);
        }
    }
    lines.push('');

    // Available Transitions
    if (snapshot.affordances.transitions.length > 0) {
        lines.push('🔀 AVAILABLE TRANSITIONS');
        lines.push('───────────────────────────────────────────────────────────');
        for (const trans of snapshot.affordances.transitions) {
            const status = trans.canTake ? '✓' : '✗';
            const auto = trans.isAutomatic ? '[auto]' : '';
            lines.push(`  ${status} ${trans.fromNode} → ${trans.toNode} ${auto}`);
            if (trans.condition) {
                lines.push(`     if: ${trans.condition}`);
            }
        }
        lines.push('');
    }

    // Available Tools
    if (snapshot.affordances.tools.length > 0) {
        lines.push('🔧 AVAILABLE TOOLS');
        lines.push('───────────────────────────────────────────────────────────');
        for (const tool of snapshot.affordances.tools) {
            lines.push(`  • ${tool.toolName} (${tool.source})`);
            lines.push(`    ${tool.description}`);
        }
        lines.push('');
    }

    // Contexts
    if (snapshot.affordances.contexts.length > 0) {
        lines.push('📦 CONTEXTS');
        lines.push('───────────────────────────────────────────────────────────');
        for (const ctx of snapshot.affordances.contexts) {
            lines.push(`  ${ctx.name} (${ctx.nodeType})`);
            for (const [attr, info] of Object.entries(ctx.attributes)) {
                const value = JSON.stringify(info.currentValue);
                lines.push(`    ${attr}: ${value} (${info.type})`);
            }
        }
        lines.push('');
    }

    // Multi-Path State
    if (snapshot.paths.details.length > 1) {
        lines.push('🌲 MULTI-PATH EXECUTION');
        lines.push('───────────────────────────────────────────────────────────');
        lines.push(`  Active: ${snapshot.paths.active}`);
        lines.push(`  Completed: ${snapshot.paths.completed}`);
        lines.push(`  Failed: ${snapshot.paths.failed}`);
        lines.push(`  Waiting: ${snapshot.paths.waiting}`);
        lines.push('');
        lines.push('  Path Details:');
        for (const path of snapshot.paths.details) {
            const turnInfo = path.isInTurn ? ` [turn ${path.turnCount}]` : '';
            lines.push(`    ${path.id}: ${path.currentNode} (${path.status})${turnInfo}`);
        }
        lines.push('');
    }

    // Turn State
    if (snapshot.turnState) {
        lines.push('🔄 TURN EXECUTION STATE');
        lines.push('───────────────────────────────────────────────────────────');
        lines.push(`  Path: ${snapshot.turnState.pathId}`);
        lines.push(`  Node: ${snapshot.turnState.nodeName}`);
        lines.push(`  Turn: ${snapshot.turnState.turnCount}`);
        lines.push(`  Conversation Length: ${snapshot.turnState.conversationLength} messages`);
        lines.push(`  Available Tools: ${snapshot.turnState.availableTools.length}`);
        lines.push(`  Waiting: ${snapshot.turnState.isWaitingForTurn ? 'yes' : 'no'}`);
        lines.push('');
    }

    // Metadata
    lines.push('📊 EXECUTION METADATA');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`  Total Steps: ${snapshot.metadata.totalSteps}`);
    lines.push(`  Elapsed Time: ${snapshot.metadata.elapsedTime}ms`);
    lines.push(`  Error Count: ${snapshot.metadata.errorCount}`);
    lines.push(`  Status: ${snapshot.metadata.isComplete ? 'Complete' : 'Running'}`);
    lines.push(`  Paused: ${snapshot.metadata.isPaused ? 'Yes' : 'No'}`);
    lines.push('');

    return lines.join('\n');
}

/**
 * Format snapshot as JSON (for API/tooling)
 */
export function formatRuntimeSnapshotJSON(snapshot: RuntimeSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
}

/**
 * Format snapshot as compact summary (for CLI one-liners)
 */
export function formatRuntimeSnapshotCompact(snapshot: RuntimeSnapshot): string {
    const parts: string[] = [];

    // Position
    if (snapshot.currentNodes.length > 0) {
        const nodes = snapshot.currentNodes.map(n => n.nodeName).join(', ');
        parts.push(`at: ${nodes}`);
    }

    // Paths
    if (snapshot.paths.details.length > 1) {
        parts.push(`paths: ${snapshot.paths.active}/${snapshot.paths.details.length}`);
    }

    // Affordances
    const transCount = snapshot.affordances.transitions.length;
    const toolCount = snapshot.affordances.tools.length;
    const ctxCount = snapshot.affordances.contexts.length;

    if (transCount > 0) parts.push(`${transCount} transitions`);
    if (toolCount > 0) parts.push(`${toolCount} tools`);
    if (ctxCount > 0) parts.push(`${ctxCount} contexts`);

    // Progress
    parts.push(`steps: ${snapshot.metadata.totalSteps}`);

    // Status
    if (snapshot.metadata.isPaused) parts.push('PAUSED');
    if (snapshot.metadata.isComplete) parts.push('COMPLETE');
    if (snapshot.metadata.errorCount > 0) parts.push(`errors: ${snapshot.metadata.errorCount}`);

    return parts.join(' | ');
}
