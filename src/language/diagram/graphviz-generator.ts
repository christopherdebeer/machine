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

import { MachineJSON, DiagramOptions, RuntimeContext } from './types.js';
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
 * @param json - Machine definition in JSON format
 * @param context - Runtime execution context
 * @param options - Generation options
 * @returns DOT diagram with runtime state as a string
 *
 * @example
 * ```typescript
 * const runtimeDot = generateRuntimeGraphviz(machineJson, executionContext, {
 *   showRuntimeState: true,
 *   showVisitCounts: true,
 *   showExecutionPath: true
 * });
 * ```
 */
export function generateRuntimeGraphviz(
    json: MachineJSON,
    context: RuntimeContext,
    options: DiagramOptions = {}
): string {
    // Set defaults for runtime visualization
    const runtimeOptions: DiagramOptions = {
        showRuntimeState: true,
        showVisitCounts: true,
        showExecutionPath: true,
        showRuntimeValues: true,
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
 *
 * @param json - Machine definition in JSON format
 * @param context - Runtime execution context
 * @param options - Generation options
 * @param engine - Graphviz layout engine
 * @returns SVG string
 */
export async function generateRuntimeGraphvizSVG(
    json: MachineJSON,
    context: RuntimeContext,
    options: DiagramOptions = {},
    engine: 'dot' | 'neato' | 'fdp' | 'circo' | 'twopi' = 'dot'
): Promise<string> {
    const dot = generateRuntimeGraphviz(json, context, options);
    return renderDotToSVG(dot, engine);
}

/**
 * Generate a mobile-optimized Graphviz diagram
 *
 * This is a convenience function that generates a diagram optimized
 * for mobile display (smaller, less detailed).
 *
 * @param json - Machine definition in JSON format
 * @param context - Optional runtime context for runtime visualizations
 * @param options - Generation options
 * @returns Mobile-optimized DOT diagram
 */
export function generateMobileGraphviz(
    json: MachineJSON,
    context?: RuntimeContext,
    options: DiagramOptions = {}
): string {
    const mobileOptions: DiagramOptions = {
        ...options,
        mobileOptimized: true,
        showExecutionPath: false, // Reduce clutter on mobile
    };

    if (context) {
        return generateRuntimeGraphviz(json, context, mobileOptions);
    } else {
        return generateGraphvizFromJSON(json, mobileOptions);
    }
}

// Re-export types for convenience
export type { MachineJSON, DiagramOptions, RuntimeContext } from './types.js';
