/**
 * Edge Evaluator - Static evaluation of edge conditions for visual indication
 *
 * This module evaluates conditional edges (when:, unless:, if:) in static diagrams
 * to visually indicate which edges are likely to be active based on current attribute values.
 *
 * Implementation Strategy:
 * - Extracts conditions from edge labels using EdgeConditionParser
 * - Evaluates conditions using CelEvaluator with machine-level attributes as context
 * - Returns evaluation results (active/inactive/error/unconditioned) for styling
 *
 * The evaluation is "static" because it uses default/initial attribute values rather than
 * runtime execution state. This provides a preview of likely-active edges in diagrams.
 */

import { EdgeConditionParser } from '../utils/edge-conditions.js';
import { CelEvaluator, CelEvaluationContext } from '../cel-evaluator.js';

/**
 * Result of edge condition evaluation
 */
export interface EdgeEvaluationResult {
    /** Whether the edge has a condition */
    hasCondition: boolean;
    /** The condition expression (if any) */
    condition?: string;
    /** Whether the condition evaluated to true (undefined if no condition or error) */
    isActive?: boolean;
    /** Error message if evaluation failed */
    error?: string;
}

/**
 * Edge interface for evaluation (minimal subset of MachineJSON edge)
 */
export interface EvaluableEdge {
    source: string;
    target: string;
    label?: string;
    type?: string;
}

/**
 * Edge evaluator for static condition evaluation
 */
export class EdgeEvaluator {
    private celEvaluator: CelEvaluator;

    constructor() {
        this.celEvaluator = new CelEvaluator();
    }

    /**
     * Evaluate a single edge's condition
     *
     * @param edge - Edge to evaluate
     * @param context - Evaluation context with attributes
     * @returns Evaluation result
     */
    evaluateEdge(edge: EvaluableEdge, context: CelEvaluationContext): EdgeEvaluationResult {
        // Extract condition from edge label
        const condition = EdgeConditionParser.extract(edge);

        if (!condition) {
            return {
                hasCondition: false
            };
        }

        try {
            // Evaluate the condition
            const isActive = this.celEvaluator.evaluateCondition(condition, context);

            return {
                hasCondition: true,
                condition,
                isActive
            };
        } catch (error) {
            return {
                hasCondition: true,
                condition,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Build evaluation context from machine attributes
     *
     * @param machineAttributes - Machine-level attributes
     * @returns CEL evaluation context
     */
    buildContext(machineAttributes: any[]): CelEvaluationContext {
        const attributes: Record<string, any> = {};

        // Convert machine attributes to flat object for CEL context
        if (machineAttributes) {
            machineAttributes.forEach((attr: any) => {
                if (attr.name) {
                    // Extract value, handling nested value.value structure
                    let value = attr.value?.value ?? attr.value;

                    // Clean string values (remove quotes)
                    if (typeof value === 'string') {
                        value = value.replace(/^["']|["']$/g, '');
                    }

                    attributes[attr.name] = value;
                }
            });
        }

        // Use machine errorCount if provided, otherwise default to 0
        const errorCount = attributes['errorCount'] !== undefined ? attributes['errorCount'] : 0;

        return {
            errorCount, // Use from attributes or default
            activeState: '', // No active state in static mode
            attributes
        };
    }
}
