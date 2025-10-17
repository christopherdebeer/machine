/**
 * D3 Diagram Generator
 *
 * This module provides a unified, encapsulated interface for generating
 * D3 diagrams from MachineJSON definitions. It supports both static and
 * runtime visualizations.
 *
 * Public API:
 * - generateD3FromJSON: Generate static D3 diagram (SVG string)
 * - generateRuntimeD3: Generate runtime visualization with execution state
 */

import { MachineJSON, MermaidOptions, RuntimeContext } from './types.js';
import { generateD3Diagram, generateRuntimeD3Diagram, D3DiagramConfig } from './d3-diagram-renderer.js';

/**
 * Generate a D3 diagram from MachineJSON
 *
 * This is the main entry point for static diagram generation.
 *
 * @param json - Machine definition in JSON format
 * @param options - Generation options (styling, etc.)
 * @returns SVG diagram as a string
 *
 * @example
 * ```typescript
 * const svg = generateD3FromJSON(machineJson, {
 *   title: 'My Machine'
 * });
 * ```
 */
export function generateD3FromJSON(
    json: MachineJSON,
    options: MermaidOptions = {}
): string {
    const config: D3DiagramConfig = {
        width: options.mobileOptimized ? 800 : 1200,
        height: options.mobileOptimized ? 600 : 800,
        rankDir: 'TB',
        marginX: 20,
        marginY: 20
    };

    return generateD3Diagram(json, config);
}

/**
 * Generate a runtime D3 diagram with execution state
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
 * @returns SVG diagram with runtime state as a string
 *
 * @example
 * ```typescript
 * const runtimeSvg = generateRuntimeD3(machineJson, executionContext, {
 *   showRuntimeState: true,
 *   showVisitCounts: true,
 *   showExecutionPath: true
 * });
 * ```
 */
export function generateRuntimeD3(
    json: MachineJSON,
    context: RuntimeContext,
    options: MermaidOptions = {}
): string {
    const config: D3DiagramConfig = {
        width: options.mobileOptimized ? 800 : 1200,
        height: options.mobileOptimized ? 600 : 800,
        rankDir: 'TB',
        marginX: 20,
        marginY: 20
    };

    return generateRuntimeD3Diagram(json, context, config);
}

/**
 * Generate a mobile-optimized D3 diagram
 *
 * This is a convenience function that generates a diagram optimized
 * for mobile display (smaller, less detailed).
 *
 * @param json - Machine definition in JSON format
 * @param context - Optional runtime context for runtime visualizations
 * @param options - Generation options
 * @returns Mobile-optimized D3 diagram
 */
export function generateMobileD3(
    json: MachineJSON,
    context?: RuntimeContext,
    options: MermaidOptions = {}
): string {
    const mobileOptions: MermaidOptions = {
        ...options,
        mobileOptimized: true,
        showExecutionPath: false, // Reduce clutter on mobile
    };

    if (context) {
        return generateRuntimeD3(json, context, mobileOptions);
    } else {
        return generateD3FromJSON(json, mobileOptions);
    }
}

// Re-export types for convenience
export type { MachineJSON, MermaidOptions, RuntimeContext } from './types.js';
