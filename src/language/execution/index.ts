/**
 * Execution Runtime
 *
 * Functional, immutable execution runtime for DyGram machines.
 * Operates on serialized MachineJSON and produces immutable ExecutionState.
 *
 * Architecture:
 * - Functional Core: Pure functions that transform state (runtime-types, state-builder, evaluators)
 * - Imperative Shell: Side effect execution (effect-executor)
 *
 * All execution state is JSON-serializable for persistence and visualization.
 */

// Core types
export * from './runtime-types.js';
export * from './runtime.js';

// Functional core (pure functions)
export * from './state-builder.js';
export * from './condition-evaluator.js';
export * from './transition-evaluator.js';
export * from './effect-builder.js';
export * from './execution-runtime.js';

// Imperative shell (side effects)
export * from './effect-executor.js';

// Legacy Phase 1-3 managers (kept for backward compatibility during migration)
export * from './types.js';
export * from './logger.js';
export * from './evaluation-engine.js';
export * from './context-manager.js';
export * from './transition-manager.js';
export * from './path-manager.js';
export * from './synchronization-manager.js';
export * from './annotation-processor.js';
export * from './edge-type-resolver.js';
export * from './error-handling-manager.js';
export * from './safety-manager.js';
export * from './state-manager.js';
