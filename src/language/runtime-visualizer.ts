/**
 * Enhanced Runtime Visualization System
 * Maintains visual consistency with static diagrams while adding runtime state
 */

import { MachineExecutor, MachineExecutionContext, MachineData } from './machine-executor.js';
import { generateRuntimeGraphviz, DiagramOptions, RuntimeContext as DiagramRuntimeContext } from './diagram/index.js';

export interface RuntimeVisualizationOptions {
    showRuntimeValues?: boolean;
    showExecutionPath?: boolean;
    showVisitCounts?: boolean;
    showCurrentState?: boolean;
    format?: 'class' | 'state' | 'hybrid';
    mobileOptimized?: boolean;
}

export interface RuntimeNodeState {
    name: string;
    type?: string;
    status: 'current' | 'visited' | 'pending';
    visitCount: number;
    lastVisited?: string;
    runtimeValues?: Record<string, any>;
    attributes?: Array<{
        name: string;
        type?: string;
        value: any;
        runtimeValue?: any;
    }>;
}

export interface RuntimeEdgeState {
    source: string;
    target: string;
    label?: string;
    traversalCount: number;
    lastTraversed?: string;
    runtimeData?: Record<string, any>;
}

export class RuntimeVisualizer {
    private context: MachineExecutionContext;
    private machineData: MachineData;

    constructor(executor: MachineExecutor) {
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
     * Build runtime state for all nodes
     */
    private buildNodeStates(): RuntimeNodeState[] {
        return this.machineData.nodes.map(node => {
            const isCurrent = node.name === this.context.currentNode;
            const isVisited = this.context.visitedNodes.has(node.name);
            const visitCount = this.context.history.filter(h => h.from === node.name).length;
            
            // Get last visit timestamp
            const lastVisit = this.context.history
                .filter(h => h.from === node.name)
                .pop()?.timestamp;

            // Extract runtime values from execution context
            const runtimeValues: Record<string, any> = {};
            
            // Add any context-specific runtime data
            if (isCurrent && this.context.attributes.size > 0) {
                this.context.attributes.forEach((value, key) => {
                    runtimeValues[key] = value;
                });
            }

            return {
                name: node.name,
                type: node.type,
                status: isCurrent ? 'current' : (isVisited ? 'visited' : 'pending'),
                visitCount,
                lastVisited: lastVisit,
                runtimeValues: Object.keys(runtimeValues).length > 0 ? runtimeValues : undefined,
                attributes: node.attributes?.map(attr => ({
                    name: attr.name,
                    type: attr.type,
                    value: attr.value,
                    runtimeValue: runtimeValues[attr.name] // If runtime value differs
                }))
            };
        });
    }

    /**
     * Build runtime state for all edges
     */
    private buildEdgeStates(): RuntimeEdgeState[] {
        return this.machineData.edges.map(edge => {
            const traversalCount = this.context.history.filter(
                h => h.from === edge.source && h.to === edge.target
            ).length;

            const lastTraversal = this.context.history
                .filter(h => h.from === edge.source && h.to === edge.target)
                .pop();

            // Extract runtime data from edge attributes/labels
            const runtimeData: Record<string, any> = {};
            if (edge.label) {
                // Parse any runtime-relevant data from labels
                // This could include conditions, parameters, etc.
            }

            return {
                source: edge.source,
                target: edge.target,
                label: edge.label,
                traversalCount,
                lastTraversed: lastTraversal?.timestamp,
                runtimeData: Object.keys(runtimeData).length > 0 ? runtimeData : undefined
            };
        });
    }

    /**
     * Get type-based CSS class for styling
     */
    private getTypeClass(type?: string): string | null {
        if (!type) return null;

        const typeLower = type.toLowerCase();
        if (typeLower.includes('task')) return 'taskType';
        if (typeLower.includes('state')) return 'stateType';
        if (typeLower.includes('context')) return 'contextType';
        if (typeLower.includes('init')) return 'initType';

        return null;
    }

    /**
     * Get status emoji for visual indication
     */
    private getStatusEmoji(status: 'current' | 'visited' | 'pending'): string {
        switch (status) {
            case 'current': return '▶️';
            case 'visited': return '✅';
            case 'pending': return '⏸️';
            default: return '◯';
        }
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
            return JSON.stringify(value);
        }
        
        return String(value);
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
}
