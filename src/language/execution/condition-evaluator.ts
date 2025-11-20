/**
 * Condition Evaluator
 *
 * Pure functions for evaluating conditions and resolving templates.
 * Uses CEL (Common Expression Language) for safe evaluation.
 */

import type { MachineJSON } from '../json/types.js';
import type { ExecutionState } from './runtime-types.js';
import { CelEvaluator } from '../cel-evaluator.js';
import { EdgeConditionParser } from '../utils/edge-conditions.js';
import { buildEvaluationContext as buildUnifiedEvaluationContext, buildGlobalContext } from './context-builder.js';

const celEvaluator = new CelEvaluator();

/**
 * Evaluate a condition string
 */
export function evaluateCondition(
    condition: string | undefined,
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string
): boolean {
    if (!condition) {
        return true; // No condition means always true
    }

    try {
        // We need to determine which node this condition is being evaluated for
        // For now, we'll use the current node from the path
        const path = state.paths.find(p => p.id === pathId);
        const currentNode = path?.currentNode || '';
        
        const context = buildUnifiedEvaluationContext(currentNode, machineJSON, state, pathId);

        // Replace template variables with CEL-compatible syntax
        // {{ nodeName.attributeName }} -> nodeName.attributeName
        let celCondition = condition.replace(/\{\{\s*(\w+)\.(\w+)\s*\}\}/g, '$1.$2');

        // Convert JavaScript operators to CEL equivalents
        celCondition = celCondition.replace(/===/g, '==').replace(/!==/g, '!=');

        // Use CEL evaluator with proper context structure
        const celContext = {
            errorCount: context.errorCount,
            activeState: context.activeState,
            attributes: context.attributes
        };
        return celEvaluator.evaluateCondition(celCondition, celContext);
    } catch (error) {
        console.error('Error evaluating condition:', condition, error);
        return false;
    }
}

/**
 * Check if condition is simple (deterministic)
 */
export function isSimpleCondition(condition: string | undefined): boolean {
    return EdgeConditionParser.isSimpleCondition(condition);
}

/**
 * Extract condition from edge
 */
export function extractEdgeCondition(edge: { label?: string; type?: string }): string | undefined {
    return EdgeConditionParser.extract(edge);
}

/**
 * Resolve template variables in a string
 */
export function resolveTemplate(
    template: string,
    machineJSON: MachineJSON,
    state: ExecutionState
): string {
    const attributes = buildGlobalContext(machineJSON);

    return celEvaluator.resolveTemplate(template, {
        errorCount: state.metadata.errorCount,
        activeState: '',  // Not path-specific for templates
        attributes
    });
}
