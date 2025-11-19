/**
 * Code Generation & Evolution Tests
 *
 * NOTE: This file has been replaced with the new @code annotation system.
 * The old EvolutionaryExecutor and staged evolution system (llm_only -> hybrid -> code_first -> code_only)
 * has been deprecated in favor of a simpler, more pragmatic approach.
 *
 * See new tests:
 * - test/unit/code-generator.test.ts - Unit tests for CodeGenerator
 * - test/unit/code-executor.test.ts - Unit tests for CodeExecutor
 * - test/integration/code-execution.test.ts - Integration tests for @code execution
 *
 * New approach:
 * - Tasks with @code annotation generate code immediately (first execution)
 * - Code lives alongside .dygram files as <filename>.<taskname>.ts
 * - Automatic regeneration on errors or schema mismatches
 * - LLM fallback when generated code fails
 * - No manual evolution stages or execution count tracking
 */

import { describe, it, expect } from 'vitest';

describe('Evolution System (Deprecated)', () => {
    it('should use new @code annotation system instead', () => {
        // The old EvolutionaryExecutor has been replaced with:
        // - CodeGenerator: Generates TypeScript code for tasks
        // - CodeExecutor: Executes generated code with LLM fallback
        // - RailsExecutor: Integrates @code tasks into execution flow

        expect(true).toBe(true); // Placeholder test
    });

    it('should reference new documentation', () => {
        // See:
        // - docs/development/pragmatic-code-generation-2025-11-15.md
        // - docs/development/code-generation-implementation-status.md

        expect(true).toBe(true); // Placeholder test
    });
});
