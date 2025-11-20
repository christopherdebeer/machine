/**
 * Graphviz Diagram Generator
 *
 * This module provides a unified interface for generating Graphviz DOT diagrams
 * from MachineJSON definitions. It supports both static and runtime visualizations.
 *
 * Public API:
 * - generateGraphvizFromJSON: Generate static DOT diagram
 * - generateRuntimeGraphviz: Generate runtime visualization with execution state
 * - renderDotToSVG: Render DOT syntax to SVG using @hpcc-js/wasm
 */

import type { MachineJSON, DiagramOptions, RuntimeContext } from './types.js';
import type { ExecutionState, VisualizationState } from '../execution/runtime-types.js';
import { generateDotDiagram, generateRuntimeDotDiagram } from './graphviz-dot-diagram.js';
import { Graphviz } from '@hpcc-js/wasm';

// Cached Graphviz instance for performance
let graphvizInstance: Awaited<ReturnType<typeof Graphviz.load>> | null = null;

/**
 * Get or create the Graphviz WASM instance
 */
async function getGraphviz(): Promise<Awaited<ReturnType<typeof Graphviz.load>>> {
    if (!graphvizInstance) {
        graphvizInstance = await Graphviz.load();
    }
    return graphvizInstance;
}

/**
 * Convert ExecutionState to RuntimeContext for diagram generation
 */
function executionStateToRuntimeContext(state: ExecutionState): RuntimeContext {
    // Find the first active or waiting path
    const activePath = state.paths.find(p => p.status === 'active' || p.status === 'waiting');

    if (!activePath) {
        // No active path, use first path or create empty context
        const firstPath = state.paths[0];
        return {
            currentNode: firstPath?.currentNode || '',
            errorCount: state.metadata.errorCount,
            visitedNodes: new Set<string>(),
            attributes: new Map<string, any>(),
            history: [],
            nodeInvocationCounts: new Map<string, number>(),
            stateTransitions: []
        };
    }

    // Build visited nodes set from history
    const visitedNodes = new Set<string>();
    activePath.history.forEach(t => {
        visitedNodes.add(t.from);
        visitedNodes.add(t.to);
    });
    visitedNodes.add(activePath.currentNode);

    return {
        currentNode: activePath.currentNode,
        errorCount: state.metadata.errorCount,
        visitedNodes,
        attributes: new Map<string, any>(), // Context values not stored in Path
        history: activePath.history.map(h => ({
            from: h.from,
            to: h.to,
            transition: h.transition,
            timestamp: h.timestamp,
            output: h.output
        })),
        nodeInvocationCounts: new Map(Object.entries(activePath.nodeInvocationCounts || {})),
        stateTransitions: activePath.stateTransitions.map(st => ({
            state: st.state,
            timestamp: st.timestamp
        }))
    };
}

/**
 * Convert VisualizationState to RuntimeContext for diagram generation
 */
function visualizationStateToRuntimeContext(vizState: VisualizationState): RuntimeContext {
    // Use the first active path
    const activePath = vizState.activePaths[0] || vizState.allPaths[0];

    if (!activePath) {
        return {
            currentNode: '',
            errorCount: vizState.errorCount,
            visitedNodes: new Set<string>(),
            attributes: new Map<string, any>(),
            history: [],
            nodeInvocationCounts: new Map<string, number>(),
            stateTransitions: []
        };
    }

    // Build visited nodes from node states
    const visitedNodes = new Set<string>();
    Object.entries(vizState.nodeStates).forEach(([nodeName, state]) => {
        if (state.visitCount > 0) {
            visitedNodes.add(nodeName);
        }
    });

    // Build node invocation counts from node states
    const nodeInvocationCounts = new Map<string, number>();
    Object.entries(vizState.nodeStates).forEach(([nodeName, state]) => {
        if (state.visitCount > 0) {
            nodeInvocationCounts.set(nodeName, state.visitCount);
        }
    });

    return {
        currentNode: activePath.currentNode,
        errorCount: vizState.errorCount,
        visitedNodes,
        attributes: new Map<string, any>(), // Context values in nodeStates.contextValues
        history: activePath.history.map(h => ({
            from: h.from,
            to: h.to,
            transition: h.transition,
            timestamp: h.timestamp,
            output: h.output
        })),
        nodeInvocationCounts,
        stateTransitions: []
    };
}

/**
 * Generate a Graphviz DOT diagram from MachineJSON
 *
 * This is the main entry point for static diagram generation.
 *
 * @param json - Machine definition in JSON format
 * @param options - Generation options (styling, etc.)
 * @returns DOT diagram as a string
 *
 * @example
 * ```typescript
 * const dot = generateGraphvizFromJSON(machineJson, {
 *   title: 'My Machine'
 * });
 * ```
 */
export function generateGraphvizFromJSON(
    json: MachineJSON,
    options: DiagramOptions = {}
): string {
    return generateDotDiagram(json, options);
}

/**
 * Generate a runtime Graphviz DOT diagram with execution state
 *
 * This generates a diagram that includes runtime information such as:
 * - Current executing node
 * - Visited nodes
 * - Execution path
 * - Visit counts
 * - Runtime values
 *
 * Supports multiple input formats:
 * - RuntimeContext (legacy)
 * - ExecutionState (new functional runtime)
 * - VisualizationState (optimized for display)
 *
 * @param json - Machine definition in JSON format
 * @param stateOrContext - Execution state or runtime context
 * @param options - Generation options
 * @returns DOT diagram with runtime state as a string
 *
 * @example
 * ```typescript
 * // With ExecutionState
 * const state = executor.getState();
 * const dot = generateRuntimeGraphviz(machineJson, state);
 *
 * // With VisualizationState
 * const vizState = executor.getVisualizationState();
 * const dot = generateRuntimeGraphviz(machineJson, vizState);
 *
 * // With RuntimeContext (legacy)
 * const dot = generateRuntimeGraphviz(machineJson, context);
 * ```
 */
export function generateRuntimeGraphviz(
    json: MachineJSON,
    stateOrContext: RuntimeContext | ExecutionState | VisualizationState,
    options: DiagramOptions = {}
): string {
    // Convert to RuntimeContext if needed
    let context: RuntimeContext;

    if ('version' in stateOrContext && 'paths' in stateOrContext) {
        // ExecutionState
        context = executionStateToRuntimeContext(stateOrContext as ExecutionState);
    } else if ('nodeStates' in stateOrContext && 'activePaths' in stateOrContext) {
        // VisualizationState
        context = visualizationStateToRuntimeContext(stateOrContext as VisualizationState);
    } else {
        // Already RuntimeContext
        context = stateOrContext as RuntimeContext;
    }

    // Set defaults for runtime visualization
    const runtimeOptions: DiagramOptions = {
        showRuntimeState: true,
        showVisitCounts: true,
        showExecutionPath: true,
        showRuntimeValues: true,
        runtimeContext: context, // Pass context for template interpolation
        ...options
    };

    return generateRuntimeDotDiagram(json, context, runtimeOptions);
}

/**
 * Render DOT syntax to SVG using Graphviz WASM
 *
 * This function takes DOT syntax and renders it to SVG format using
 * the @hpcc-js/wasm library.
 *
 * @param dotSource - DOT diagram source code
 * @param engine - Graphviz layout engine (dot, neato, fdp, circo, twopi)
 * @returns SVG string
 *
 * @example
 * ```typescript
 * const dot = generateGraphvizFromJSON(machineJson);
 * const svg = await renderDotToSVG(dot);
 * ```
 */
export async function renderDotToSVG(
    dotSource: string,
    engine: 'dot' | 'neato' | 'fdp' | 'circo' | 'twopi' = 'dot'
): Promise<string> {
    const graphviz = await getGraphviz();

    // Use the specified layout engine
    switch (engine) {
        case 'dot':
            return graphviz.dot(dotSource);
        case 'neato':
            return graphviz.neato(dotSource);
        case 'fdp':
            return graphviz.fdp(dotSource);
        case 'circo':
            return graphviz.circo(dotSource);
        case 'twopi':
            return graphviz.twopi(dotSource);
        default:
            return graphviz.dot(dotSource);
    }
}

/**
 * Generate SVG directly from MachineJSON
 *
 * Convenience function that generates DOT and renders to SVG in one step.
 *
 * @param json - Machine definition in JSON format
 * @param options - Generation options
 * @param engine - Graphviz layout engine
 * @returns SVG string
 */
export async function generateGraphvizSVG(
    json: MachineJSON,
    options: DiagramOptions = {},
    engine: 'dot' | 'neato' | 'fdp' | 'circo' | 'twopi' = 'dot'
): Promise<string> {
    const dot = generateGraphvizFromJSON(json, options);
    return renderDotToSVG(dot, engine);
}

/**
 * Generate runtime SVG directly from MachineJSON with execution context
 *
 * Convenience function that generates runtime DOT and renders to SVG in one step.
 * Supports ExecutionState, VisualizationState, or RuntimeContext.
 *
 * @param json - Machine definition in JSON format
 * @param stateOrContext - Execution state or runtime context
 * @param options - Generation options
 * @param engine - Graphviz layout engine
 * @returns SVG string
 */
export async function generateRuntimeGraphvizSVG(
    json: MachineJSON,
    stateOrContext: RuntimeContext | ExecutionState | VisualizationState,
    options: DiagramOptions = {},
    engine: 'dot' | 'neato' | 'fdp' | 'circo' | 'twopi' = 'dot'
): Promise<string> {
    const dot = generateRuntimeGraphviz(json, stateOrContext, options);
    return renderDotToSVG(dot, engine);
}

/**
 * Generate a mobile-optimized Graphviz diagram
 *
 * This is a convenience function that generates a diagram optimized
 * for mobile display (smaller, less detailed).
 * Supports ExecutionState, VisualizationState, or RuntimeContext.
 *
 * @param json - Machine definition in JSON format
 * @param stateOrContext - Optional execution state or runtime context
 * @param options - Generation options
 * @returns Mobile-optimized DOT diagram
 */
export function generateMobileGraphviz(
    json: MachineJSON,
    stateOrContext?: RuntimeContext | ExecutionState | VisualizationState,
    options: DiagramOptions = {}
): string {
    const mobileOptions: DiagramOptions = {
        ...options,
        mobileOptimized: true,
        showExecutionPath: false, // Reduce clutter on mobile
    };

    if (stateOrContext) {
        return generateRuntimeGraphviz(json, stateOrContext, mobileOptions);
    } else {
        return generateGraphvizFromJSON(json, mobileOptions);
    }
}

// Re-export types for convenience
export type { MachineJSON, DiagramOptions, RuntimeContext } from './types.js';
