/**
 * Execution Model - Core Managers
 *
 * This module implements the modular execution architecture described in
 * docs/development/execution-model-redesign.md
 *
 * Phase 1: Core managers (evaluation, context, transition, path)
 * Phase 2: Enhanced semantics (edge types, annotations, synchronization, error handling)
 */

export * from './types.js';
export * from './evaluation-engine.js';
export * from './context-manager.js';
export * from './transition-manager.js';
export * from './path-manager.js';
export * from './synchronization-manager.js';
export * from './annotation-processor.js';
export * from './edge-type-resolver.js';
export * from './error-handling-manager.js';
