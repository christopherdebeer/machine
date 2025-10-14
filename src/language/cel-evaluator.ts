/**
 * CEL Evaluator
 * Provides safe expression evaluation using Common Expression Language (CEL)
 * Replaces unsafe eval() calls with sandboxed CEL expressions
 */

import { run } from '@bufbuild/cel';

export interface CelEvaluationContext {
    errorCount: number;
    activeState: string;
    attributes: Record<string, any>;
}

/**
 * CEL-based expression evaluator for safe condition evaluation
 */
export class CelEvaluator {
    /**
     * Evaluate a condition expression using CEL
     * @param condition - The condition expression to evaluate
     * @param context - The evaluation context with variables
     * @returns boolean result of the condition
     */
    evaluateCondition(
        condition: string,
        context: CelEvaluationContext
    ): boolean {
        try {
            // Prepare evaluation context
            // CEL uses a flat object for variables
            const evalContext = {
                errorCount: context.errorCount,
                errors: context.errorCount, // Alias for backward compatibility
                activeState: context.activeState,
                ...context.attributes
            };

            // Evaluate the expression using CEL
            const result = run(condition, evalContext);

            return Boolean(result);
        } catch (error) {
            console.error('Error evaluating CEL condition:', condition, error);
            // On error, return false (fail-safe)
            return false;
        }
    }
}
