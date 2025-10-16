/**
 * Diagram Generation Module
 *
 * This module encapsulates all diagram generation logic for the Machine language.
 * It provides a clean, minimal public interface for generating various diagram types
 * from MachineJSON definitions.
 *
 * ## Usage
 *
 * ### Static Diagrams
 * ```typescript
 * import { generateMermaidFromJSON } from './language/diagram';
 *
 * const mermaid = generateMermaidFromJSON(machineJson, {
 *   diagramType: 'class',
 *   title: 'My Machine'
 * });
 * ```
 *
 * ### Runtime Diagrams
 * ```typescript
 * import { generateRuntimeMermaid } from './language/diagram';
 *
 * const runtimeMermaid = generateRuntimeMermaid(machineJson, executionContext, {
 *   showRuntimeState: true,
 *   showVisitCounts: true
 * });
 * ```
 *
 * ## Future Extensions
 *
 * This module is designed to support multiple diagram types:
 * - classDiagram (currently supported)
 * - stateDiagram (planned)
 * - flowchart (planned)
 *
 * Simply pass the desired `diagramType` in the options.
 */

// Main public API
export {
    generateMermaidFromJSON,
    generateRuntimeMermaid,
    generateMobileMermaid
} from './mermaid-generator.js';

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

// Internal generators (for advanced usage)
export {
    generateClassDiagram,
    generateRuntimeClassDiagram
} from './mermaid-class-diagram.js';
