/**
 * Diagram Generation Module
 *
 * This module encapsulates all diagram generation logic for the Machine language.
 * It provides a clean, minimal public interface for generating various diagram types
 * from MachineJSON definitions.
 *
 * ## Usage
 *
 * ### Static Diagrams with Graphviz
 * ```typescript
 * import { generateGraphvizFromJSON, renderDotToSVG } from './language/diagram';
 *
 * const dot = generateGraphvizFromJSON(machineJson, {
 *   title: 'My Machine'
 * });
 * const svg = await renderDotToSVG(dot);
 * ```
 *
 * ### Runtime Diagrams
 * ```typescript
 * import { generateRuntimeGraphviz } from './language/diagram';
 *
 * const runtimeDot = generateRuntimeGraphviz(machineJson, executionContext, {
 *   showRuntimeState: true,
 *   showVisitCounts: true
 * });
 * ```
 *
 * ### Convenience SVG Generation
 * ```typescript
 * import { generateGraphvizSVG } from './language/diagram';
 *
 * const svg = await generateGraphvizSVG(machineJson, { title: 'My Machine' });
 * ```
 */

// Main public API - Graphviz
export {
    generateGraphvizFromJSON,
    generateRuntimeGraphviz,
    generateMobileGraphviz,
    renderDotToSVG,
    generateGraphvizSVG,
    generateRuntimeGraphvizSVG
} from './graphviz-generator.js';

// Legacy Mermaid API (deprecated)
export {
    generateMermaidFromJSON,
    generateRuntimeMermaid,
    generateMobileMermaid
} from './mermaid-generator.js';

// Types for public consumption
export type {
    MachineJSON,
    DiagramOptions,
    MermaidOptions,
    RuntimeContext,
    RuntimeNodeState,
    RuntimeEdgeState,
    TypeHierarchy,
    SemanticHierarchy
} from './types.js';

// Internal generators (for advanced usage)
export {
    generateClassDiagram,
    generateRuntimeClassDiagram
} from './mermaid-class-diagram.js';

export {
    generateDotDiagram,
    generateRuntimeDotDiagram
} from './graphviz-dot-diagram.js';
