/**
 * CEL Evaluator
 * Provides safe expression evaluation using Common Expression Language (CEL)
 * Replaces unsafe eval() calls with sandboxed CEL expressions
 */

import { run } from '@bufbuild/cel';

/**
 * Convert a CEL evaluation result to a string representation
 * Handles BigInt, Map, and other CEL-specific types
 * Returns null if result is a CEL error object
 */
function convertCelResultToString(result: any): string | null {
    // Handle null/undefined
    if (result === null || result === undefined) {
        return '';
    }

    // Check if result is a CEL error object (has _exprId or _cause properties)
    if (typeof result === 'object' && ('_exprId' in result || '_cause' in result)) {
        // This is a CEL error object, signal that evaluation failed
        return null;
    }

    // Handle BigInt (CEL returns BigInt for numeric operations)
    if (typeof result === 'bigint') {
        return result.toString();
    }

    // Handle Map (CEL may return Map for objects)
    if (result instanceof Map) {
        const obj: Record<string, any> = {};
        result.forEach((value, key) => {
            // Recursively convert values that might also be BigInt/Map
            obj[String(key)] = convertCelValueForJson(value);
        });
        return JSON.stringify(obj);
    }

    // Handle CEL Map-like objects with _map property
    if (typeof result === 'object' && '_map' in result && result._map instanceof Map) {
        const obj: Record<string, any> = {};
        result._map.forEach((value: any, key: any) => {
            obj[String(key)] = convertCelValueForJson(value);
        });
        return JSON.stringify(obj);
    }

    // Handle regular objects
    if (typeof result === 'object') {
        try {
            // Convert any BigInt values in the object before stringifying
            return JSON.stringify(result, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            );
        } catch (error) {
            // Fallback for circular references or other issues
            return String(result);
        }
    }

    return String(result);
}

/**
 * Convert CEL values for JSON serialization
 * Handles BigInt and other types that can't be directly serialized
 */
function convertCelValueForJson(value: any): any {
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (value instanceof Map) {
        const obj: Record<string, any> = {};
        value.forEach((v, k) => {
            obj[String(k)] = convertCelValueForJson(v);
        });
        return obj;
    }
    return value;
}

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
            // Built-ins are spread LAST to prevent user nodes from overwriting them
            const evalContext = {
                ...context.attributes,          // User attributes first
                errorCount: context.errorCount, // Built-ins override
                errors: context.errorCount,     // Alias for backward compatibility
                activeState: context.activeState
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
                // Built-ins are spread LAST to prevent user nodes from overwriting them
                const evalContext = {
                    ...context.attributes,          // User attributes first
                    errorCount: context.errorCount, // Built-ins override
                    errors: context.errorCount,     // Alias for backward compatibility
                    activeState: context.activeState
                };

                // Evaluate the expression using CEL
                const result = run(expression.trim(), evalContext);

                // Convert result to string representation
                const stringResult = convertCelResultToString(result);

                // If conversion returned null, it means CEL evaluation failed
                if (stringResult === null) {
                    throw new Error('CEL evaluation returned error object');
                }

                return stringResult;
            } catch (error) {
                console.warn(`Failed to resolve template variable: ${expression}`, error);
                // Return original template on error for debugging
                return match;
            }
        });
    }
}
