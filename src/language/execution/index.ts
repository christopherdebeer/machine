/**
 * Execution Model - Core Managers
 *
 * This module implements the modular execution architecture described in
 * docs/development/execution-model-redesign.md
 *
 * Phase 1: Core managers (evaluation, context, transition, path)
 * Phase 2: Enhanced semantics (edge types, annotations, synchronization, error handling)
 * Phase 3: Production features (safety, state management)
 */

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

// Functional runtime exports
export * from './runtime-types.js';
export * from './runtime.js';
export * from './execution-runtime.js';
export * from './condition-evaluator.js';
export * from './effect-builder.js';
export * from './effect-executor.js';
export * from './state-builder.js';
export * from './transition-evaluator.js';
export * from './code-executor.js';
