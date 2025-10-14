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
            // CEL supports nested objects natively
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

    /**
     * Resolve template variables in a string using CEL
     * Replaces {{ nodeName.attributeName }} with actual values
     * @param template - String containing template variables
     * @param context - The evaluation context with variables
     * @returns Resolved string with template variables replaced
     */
    resolveTemplate(
        template: string,
        context: CelEvaluationContext
    ): string {
        // Pattern to match {{ expression }}
        const templatePattern = /\{\{\s*([^}]+)\s*\}\}/g;

        return template.replace(templatePattern, (match, expression) => {
            try {
                // Prepare evaluation context
                const evalContext = {
                    errorCount: context.errorCount,
                    errors: context.errorCount,
                    activeState: context.activeState,
                    ...context.attributes
                };

                // Evaluate the expression using CEL
                const result = run(expression.trim(), evalContext);

                // Convert result to string
                if (result === null || result === undefined) {
                    return '';
                }
                if (typeof result === 'object') {
                    return JSON.stringify(result);
                }
                return String(result);
            } catch (error) {
                console.warn(`Failed to resolve template variable: ${expression}`, error);
                // Return original template on error for debugging
                return match;
            }
        });
    }
}
