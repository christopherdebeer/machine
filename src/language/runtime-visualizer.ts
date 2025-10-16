/**
 * Enhanced Runtime Visualization System
 * Maintains visual consistency with static diagrams while adding runtime state
 */

import { MachineExecutor, MachineExecutionContext, MachineData } from './machine-executor.js';
import { generateRuntimeMermaid, MermaidOptions, RuntimeContext as DiagramRuntimeContext } from './diagram/index.js';

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
     * Generate enhanced runtime visualization that matches static format
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

        switch (opts.format) {
            case 'class':
                return this.generateClassDiagramRuntime(opts);
            case 'state':
                return this.generateStateDiagramRuntime(opts);
            case 'hybrid':
                return this.generateHybridVisualization(opts);
            default:
                return this.generateClassDiagramRuntime(opts);
        }
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
     * Generate class diagram with runtime overlays (maintains static format consistency)
     */
    private generateClassDiagramRuntime(options: RuntimeVisualizationOptions): string {
        // Convert to diagram module format and use encapsulated generator
        const diagramContext = this.toDiagramContext();
        const diagramOptions: MermaidOptions = {
            diagramType: 'class',
            showRuntimeState: options.showCurrentState !== false,
            showVisitCounts: options.showVisitCounts !== false,
            showExecutionPath: options.showExecutionPath !== false,
            showRuntimeValues: options.showRuntimeValues !== false,
            mobileOptimized: options.mobileOptimized || false,
            title: this.machineData.title
        };

        return generateRuntimeMermaid(this.machineData, diagramContext, diagramOptions);
    }

    /**
     * Generate class diagram with runtime overlays (old implementation, kept for reference)
     * @deprecated Use the new diagram module instead
     */
    private generateClassDiagramRuntimeOld(options: RuntimeVisualizationOptions): string {
        const lines: string[] = [];
        const nodeStates = this.buildNodeStates();
        const edgeStates = this.buildEdgeStates();

        // Header with runtime indicator
        lines.push('---');
        lines.push(`title: "${this.machineData.title} [RUNTIME]"`);
        lines.push('config:');
        lines.push('  class:');
        lines.push('    hideEmptyMembersBox: true');
        lines.push('---');
        lines.push('classDiagram-v2');
        lines.push('');

        // Generate nodes with runtime state
        nodeStates.forEach(node => {
            const statusEmoji = this.getStatusEmoji(node.status);
            const statusText = node.status.toUpperCase();
            
            // Build class header with runtime status
            const classHeader = options.showCurrentState 
                ? `class ${node.name}["${statusEmoji} ${node.name}"]`
                : `class ${node.name}`;

            lines.push(`  ${classHeader} {`);
            
            // Add type annotation
            if (node.type) {
                lines.push(`    <<${node.type}>>`);
            }

            // Add runtime status info
            if (options.showCurrentState) {
                lines.push(`    +status: ${statusText}`);
                if (node.visitCount > 0) {
                    lines.push(`    +visits: ${node.visitCount}`);
                }
            }

            // Add attributes with runtime values
            if (node.attributes && node.attributes.length > 0) {
                node.attributes.forEach(attr => {
                    if (attr.name === 'prompt' || attr.name === 'desc') return; // Skip display attributes
                    
                    let displayValue = this.formatAttributeValue(attr.value);
                    
                    // Show runtime value if different and available
                    if (options.showRuntimeValues && attr.runtimeValue !== undefined && 
                        attr.runtimeValue !== attr.value) {
                        displayValue = `${displayValue} → ${this.formatAttributeValue(attr.runtimeValue)}`;
                    }
                    
                    const typeAnnotation = attr.type ? ` : ${attr.type}` : '';
                    lines.push(`    +${attr.name}${typeAnnotation} = ${displayValue}`);
                });
            }

            // Add runtime values if any
            if (options.showRuntimeValues && node.runtimeValues) {
                Object.entries(node.runtimeValues).forEach(([key, value]) => {
                    lines.push(`    +${key}[runtime] = ${this.formatAttributeValue(value)}`);
                });
            }

            lines.push('  }');
            lines.push('');
        });

        // Add styling for different states and node types
        lines.push('  %% Runtime State Styling');
        lines.push('  classDef currentNode fill:#4CAF50,stroke:#2E7D32,stroke-width:4px,color:#fff');
        lines.push('  classDef visitedNode fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff');
        lines.push('  classDef pendingNode fill:#FFC107,stroke:#F57F17,stroke-width:1px,color:#000');
        lines.push('');
        lines.push('  %% Node Type Styling (subtle background colors)');
        lines.push('  classDef taskType fill:#E3F2FD,stroke:#1976D2,stroke-width:2px');
        lines.push('  classDef stateType fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px');
        lines.push('  classDef contextType fill:#E8F5E9,stroke:#388E3C,stroke-width:2px');
        lines.push('  classDef initType fill:#FFF3E0,stroke:#F57C00,stroke-width:2px');
        lines.push('');

        // Apply styling to nodes (status takes precedence over type)
        nodeStates.forEach(node => {
            if (node.status === 'current') {
                lines.push(`  class ${node.name} currentNode`);
            } else if (node.status === 'visited') {
                lines.push(`  class ${node.name} visitedNode`);
            } else {
                // Use type-based styling for pending nodes
                const typeClass = this.getTypeClass(node.type);
                if (typeClass) {
                    lines.push(`  class ${node.name} ${typeClass}`);
                } else {
                    lines.push(`  class ${node.name} pendingNode`);
                }
            }
        });

        lines.push('');

        // Generate edges with runtime information
        edgeStates.forEach(edge => {
            let label = edge.label || '';
            
            // Add traversal count if enabled
            if (options.showVisitCounts && edge.traversalCount > 0) {
                label += (label ? ' ' : '') + `[${edge.traversalCount}x]`;
            }

            // Add runtime data if available
            if (options.showRuntimeValues && edge.runtimeData) {
                const runtimeInfo = Object.entries(edge.runtimeData)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ');
                if (runtimeInfo) {
                    label += (label ? ', ' : '') + runtimeInfo;
                }
            }

            const edgeLine = `  ${edge.source} --> ${edge.target}${label ? ` : ${label}` : ''}`;
            lines.push(edgeLine);
        });

        // Add notes for runtime execution state
        if (options.showExecutionPath && this.context.history.length > 0) {
            lines.push('');
            lines.push('  %% Execution Notes');

            // Add note for current node
            if (this.context.currentNode) {
                const currentSteps = this.context.history.filter(h => h.to === this.context.currentNode);
                if (currentSteps.length > 0) {
                    const lastStep = currentSteps[currentSteps.length - 1];
                    lines.push(`  note for ${this.context.currentNode} "Currently executing\\nLast transition: ${lastStep.transition}"`);
                }
            }

            // Add notes for visited nodes with execution details
            const recentVisits = this.context.history.slice(-5); // Last 5 steps
            recentVisits.forEach((step, idx) => {
                if (step.output && step.output.length > 0) {
                    const truncatedOutput = step.output.length > 40
                        ? step.output.substring(0, 40) + '...'
                        : step.output;
                    lines.push(`  note for ${step.from} "Step ${this.context.history.length - recentVisits.length + idx + 1}: ${truncatedOutput}"`);
                }
            });
        }

        // Add execution path as comments
        if (options.showExecutionPath && this.context.history.length > 0) {
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

        return lines.join('\n');
    }

    /**
     * Generate state diagram with enhanced runtime information
     */
    private generateStateDiagramRuntime(options: RuntimeVisualizationOptions): string {
        const lines: string[] = [];
        const nodeStates = this.buildNodeStates();
        const edgeStates = this.buildEdgeStates();

        lines.push('stateDiagram-v2');
        lines.push('');

        // Define states with runtime annotations
        nodeStates.forEach(node => {
            const statusEmoji = this.getStatusEmoji(node.status);
            const annotation = options.showCurrentState ? ` : ${statusEmoji} ${node.status.toUpperCase()}` : '';
            
            lines.push(`  ${node.name}${annotation}`);
            
            // Add notes for current and visited states
            if (options.showCurrentState) {
                if (node.status === 'current') {
                    lines.push(`  note right of ${node.name} : ▶️ EXECUTING`);
                } else if (node.status === 'visited' && node.visitCount > 0) {
                    lines.push(`  note right of ${node.name} : ✓ VISITED (${node.visitCount}x)`);
                }
            }

            // Add runtime values as notes
            if (options.showRuntimeValues && node.runtimeValues) {
                const runtimeInfo = Object.entries(node.runtimeValues)
                    .map(([k, v]) => `${k}: ${this.formatAttributeValue(v)}`)
                    .join('\\n');
                if (runtimeInfo) {
                    lines.push(`  note left of ${node.name} : ${runtimeInfo}`);
                }
            }
        });

        lines.push('');

        // Define transitions with runtime data
        edgeStates.forEach(edge => {
            let label = edge.label || '';
            
            if (options.showVisitCounts && edge.traversalCount > 0) {
                label += (label ? ' ' : '') + `[${edge.traversalCount}x]`;
            }

            lines.push(`  ${edge.source} --> ${edge.target}${label ? ` : ${label}` : ''}`);
        });

        return lines.join('\n');
    }

    /**
     * Generate hybrid visualization combining class and state diagram benefits
     */
    private generateHybridVisualization(options: RuntimeVisualizationOptions): string {
        // This would combine the structural clarity of class diagrams
        // with the flow clarity of state diagrams
        // For now, default to enhanced class diagram
        return this.generateClassDiagramRuntime(options);
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

    /**
     * Override toMermaidRuntime to use enhanced visualization
     */
    public override toMermaidRuntime(): string {
        return this.getRuntimeVisualization({
            format: 'class',
            showRuntimeValues: true,
            showExecutionPath: true,
            showVisitCounts: true,
            showCurrentState: true
        });
    }
}
