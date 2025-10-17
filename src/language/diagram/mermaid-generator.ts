/**
 * Mermaid Diagram Generator
 *
 * This module provides a unified, encapsulated interface for generating
 * mermaid diagrams from MachineJSON definitions. It supports multiple
 * diagram types (class, state, flowchart) and both static and runtime
 * visualizations.
 *
 * Public API:
 * - generateMermaidFromJSON: Generate static mermaid diagram
 * - generateRuntimeMermaid: Generate runtime visualization with execution state
 */

import { MachineJSON, MermaidOptions, RuntimeContext } from './types.js';
import { generateClassDiagram, generateRuntimeClassDiagram } from './mermaid-class-diagram.js';
import { generateFlowchart, generateRuntimeFlowchart } from './mermaid-flowchart.js';
import { generateStateDiagram, generateRuntimeStateDiagram } from './mermaid-statediagram.js';

/**
 * Generate a mermaid diagram from MachineJSON
 *
 * This is the main entry point for static diagram generation.
 * Supports different diagram types through options.
 *
 * @param json - Machine definition in JSON format
 * @param options - Generation options (diagram type, styling, etc.)
 * @returns Mermaid diagram as a string
 *
 * @example
 * ```typescript
 * const mermaid = generateMermaidFromJSON(machineJson, {
 *   diagramType: 'class',
 *   title: 'My Machine'
 * });
 * ```
 */
export function generateMermaidFromJSON(
    json: MachineJSON,
    options: MermaidOptions = {}
): string {
    // Default to flowchart (better handles nesting)
    const diagramType = options.diagramType || 'flowchart';

    switch (diagramType) {
        case 'class':
            return generateClassDiagram(json, options);

        case 'state':
            return generateStateDiagram(json, options);

        case 'flowchart':
            return generateFlowchart(json, options);

        default:
            throw new Error(`Unsupported diagram type: ${diagramType}`);
    }
}

/**
 * Generate a runtime mermaid diagram with execution state
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
 * @returns Mermaid diagram with runtime state as a string
 *
 * @example
 * ```typescript
 * const runtimeMermaid = generateRuntimeMermaid(machineJson, executionContext, {
 *   diagramType: 'class',
 *   showRuntimeState: true,
 *   showVisitCounts: true,
 *   showExecutionPath: true
 * });
 * ```
 */
export function generateRuntimeMermaid(
    json: MachineJSON,
    context: RuntimeContext,
    options: MermaidOptions = {}
): string {
    // Default to state diagram for runtime (semantic match for state machines)
    const diagramType = options.diagramType || 'state';

    // Set defaults for runtime visualization
    const runtimeOptions: MermaidOptions = {
        showRuntimeState: true,
        showVisitCounts: true,
        showExecutionPath: true,
        showRuntimeValues: true,
        ...options
    };

    switch (diagramType) {
        case 'class':
            return generateRuntimeClassDiagram(json, context, runtimeOptions);

        case 'state':
            return generateRuntimeStateDiagram(json, context, runtimeOptions);

        case 'flowchart':
            return generateRuntimeFlowchart(json, context, runtimeOptions);

        default:
            throw new Error(`Unsupported diagram type: ${diagramType}`);
    }
}

/**
 * Generate a mobile-optimized mermaid diagram
 *
 * This is a convenience function that generates a diagram optimized
 * for mobile display (smaller, less detailed).
 *
 * @param json - Machine definition in JSON format
 * @param context - Optional runtime context for runtime visualizations
 * @param options - Generation options
 * @returns Mobile-optimized mermaid diagram
 */
export function generateMobileMermaid(
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
        return generateRuntimeMermaid(json, context, mobileOptions);
    } else {
        return generateMermaidFromJSON(json, mobileOptions);
    }
}

// Re-export types for convenience
export type { MachineJSON, MermaidOptions, RuntimeContext } from './types.js';
