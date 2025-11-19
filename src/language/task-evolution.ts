/**
 * @deprecated This file contains the old over-engineered evolution system.
 *
 * The old system used complex evolution stages (llm_only → hybrid → code_first → code_only)
 * and required tracking execution counts, metrics, etc.
 *
 * **New Approach**: See code-generation.ts and code-executor.ts
 * - Simple @code annotation triggers immediate generation
 * - Code lives alongside .dygram files
 * - Uses external references (#taskname)
 * - Regenerates on errors
 *
 * This file is kept for backward compatibility but should not be used in new code.
 * It will be removed in a future version.
 */

// Export empty implementations to prevent import errors
export class EvolutionaryExecutor {
    constructor() {
        throw new Error(
            'EvolutionaryExecutor is deprecated. Use RailsExecutor with @code annotation instead. ' +
            'See docs/development/pragmatic-code-generation-2025-11-15.md'
        );
    }
}

export interface TaskEvolutionMetadata {
    stage: string;
    code_path?: string;
    execution_count: number;
}
