/**
 * Edge Evaluator - Static evaluation of edge conditions for visual indication
 *
 * This module provides functionality to evaluate edge conditions in static mode
 * (before runtime execution) to determine which edges should be visually indicated
 * as active or inactive in the diagram.
 *
 * This creates a foundation for progressive enhancement, where:
 * - Static diagrams show which edges are likely to be active based on default context
 * - Runtime diagrams can override with actual execution state
 */

import { CelEvaluator, CelEvaluationContext } from '../cel-evaluator.js';
import { EdgeConditionParser } from '../utils/edge-conditions.js';

/**
 * Result of edge condition evaluation
 */
export interface EdgeEvaluationResult {
    /** Whether the edge condition evaluates to true */
    isActive: boolean;

    /** Whether the edge has a condition at all */
    hasCondition: boolean;

    /** The extracted condition string (if any) */
    condition?: string;

    /** Error message if evaluation failed */
    error?: string;
}

/**
 * Context for static edge evaluation
 * Provides default values for condition evaluation before runtime
 */
export interface StaticEvaluationContext {
    /** Default attribute values for evaluation */
    attributes?: Record<string, any>;

    /** Default error count (typically 0 for static) */
    errorCount?: number;

    /** Default active state */
    activeState?: string;
}

/**
 * Edge Evaluator for static condition evaluation
 */
export class EdgeEvaluator {
    private celEvaluator: CelEvaluator;

    constructor() {
        this.celEvaluator = new CelEvaluator();
    }

    /**
     * Evaluate an edge's condition in static mode
     *
     * @param edge - Edge object with optional label/type containing conditions
     * @param context - Static evaluation context with default values
     * @returns Evaluation result with isActive status
     */
    evaluateEdge(
        edge: { label?: string; type?: string; annotations?: any[] },
        context: StaticEvaluationContext = {}
    ): EdgeEvaluationResult {
        // Extract condition from edge label
        const condition = EdgeConditionParser.extract(edge);

        // If no condition, edge is always active
        if (!condition) {
            return {
                isActive: true,
                hasCondition: false
            };
        }

        try {
            // Prepare CEL evaluation context with defaults
            const celContext: CelEvaluationContext = {
                errorCount: context.errorCount ?? 0,
                activeState: context.activeState ?? '',
                attributes: context.attributes ?? {}
            };

            // Evaluate the condition
            const isActive = this.celEvaluator.evaluateCondition(condition, celContext);

            return {
                isActive,
                hasCondition: true,
                condition
            };
        } catch (error) {
            // On error, log and return inactive with error message
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to evaluate edge condition: ${condition}`, errorMessage);

            return {
                isActive: false,
                hasCondition: true,
                condition,
                error: errorMessage
            };
        }
    }

    /**
     * Evaluate multiple edges and return a map of edge results
     *
     * @param edges - Array of edges to evaluate
     * @param context - Static evaluation context
     * @returns Map of edge index to evaluation result
     */
    evaluateEdges(
        edges: Array<{ label?: string; type?: string; annotations?: any[] }>,
        context: StaticEvaluationContext = {}
    ): Map<number, EdgeEvaluationResult> {
        const results = new Map<number, EdgeEvaluationResult>();

        edges.forEach((edge, index) => {
            results.set(index, this.evaluateEdge(edge, context));
        });

        return results;
    }

    /**
     * Create a default static evaluation context from machine attributes
     *
     * This extracts relevant attributes from the machine definition that can be used
     * as defaults for condition evaluation.
     *
     * @param machineAttributes - Attributes from machine definition
     * @returns Static evaluation context with default values
     */
    createDefaultContext(machineAttributes?: Array<{ name: string; value: any }>): StaticEvaluationContext {
        const attributes: Record<string, any> = {};
        let errorCount = 0;
        let activeState = '';

        if (machineAttributes) {
            machineAttributes.forEach(attr => {
                // Extract simple attribute values for condition evaluation
                // Skip complex types and metadata attributes
                if (attr.name && attr.value !== undefined &&
                    !['description', 'desc', 'prompt', 'style', 'version'].includes(attr.name)) {

                    // Clean string values
                    let value = attr.value;
                    if (typeof value === 'string') {
                        value = value.replace(/^["']|["']$/g, '');
                    }

                    attributes[attr.name] = value;

                    // Extract built-in CEL variables if present in machine attributes
                    if (attr.name === 'errorCount') {
                        errorCount = typeof value === 'number' ? value : Number(value) || 0;
                    } else if (attr.name === 'activeState') {
                        activeState = String(value);
                    }
                }
            });
        }

        return {
            attributes,
            errorCount,
            activeState
        };
    }
}
