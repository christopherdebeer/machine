/**
 * Diagram Generation Module
 *
 * This module encapsulates all diagram generation logic for the Machine language.
 * It provides a clean, minimal public interface for generating diagrams using D3.js
 * from MachineJSON definitions.
 *
 * ## Usage
 *
 * ### Static Diagrams
 * ```typescript
 * import { generateD3FromJSON } from './language/diagram';
 *
 * const svg = generateD3FromJSON(machineJson, {
 *   title: 'My Machine'
 * });
 * ```
 *
 * ### Runtime Diagrams
 * ```typescript
 * import { generateRuntimeD3 } from './language/diagram';
 *
 * const runtimeSvg = generateRuntimeD3(machineJson, executionContext, {
 *   showRuntimeState: true,
 *   showVisitCounts: true
 * });
 * ```
 */

// Main public API
export {
    generateD3FromJSON,
    generateRuntimeD3,
    generateMobileD3
} from './d3-generator.js';

// Backward compatibility aliases
export {
    generateD3FromJSON as generateMermaidFromJSON,
    generateRuntimeD3 as generateRuntimeMermaid,
    generateMobileD3 as generateMobileMermaid
} from './d3-generator.js';

// Types for public consumption
export type {
    MachineJSON,
    MermaidOptions,
    RuntimeContext,
    RuntimeNodeState,
    RuntimeEdgeState,
    TypeHierarchy,
    SemanticHierarchy
} from './types.js';

// D3 renderer exports (for advanced usage)
export {
    generateD3Diagram,
    generateRuntimeD3Diagram
} from './d3-diagram-renderer.js';

export type { D3DiagramConfig } from './d3-diagram-renderer.js';
