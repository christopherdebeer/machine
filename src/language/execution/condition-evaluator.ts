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
import { getPath } from './state-builder.js';

const celEvaluator = new CelEvaluator();

/**
 * Build attribute context from machine JSON
 */
function buildAttributeContext(machineJSON: MachineJSON): Record<string, any> {
    const RESERVED_NAMES = ['errorCount', 'errors', 'activeState'];
    const attributes: Record<string, any> = {};

    for (const node of machineJSON.nodes) {
        // Warn about reserved name collisions
        if (RESERVED_NAMES.includes(node.name)) {
            console.warn(
                `[CEL] Node '${node.name}' uses a reserved name. ` +
                `Built-in variable will take precedence. Consider renaming the node.`
            );
        }

        if (node.attributes && node.attributes.length > 0) {
            attributes[node.name] = {};
            for (const attr of node.attributes) {
                attributes[node.name][attr.name] = parseAttributeValue(attr.value, attr.type);
            }
        }
    }

    return attributes;
}

/**
 * Parse attribute value
 */
function parseAttributeValue(value: unknown, type?: string): any {
    if (typeof value === 'string') {
        if (!type) {
            // Auto-detect
            const cleanValue = value.replace(/^["']|["']$/g, '');
            try {
                return JSON.parse(value);
            } catch {
                return cleanValue;
            }
        }

        // Type-specific parsing
        const cleanValue = value.replace(/^["']|["']$/g, '');
        switch (type) {
            case 'number':
                return Number(cleanValue);
            case 'boolean':
                return cleanValue.toLowerCase() === 'true';
            case 'json':
                return JSON.parse(cleanValue);
            default:
                return cleanValue;
        }
    }

    return value;
}

/**
 * Build evaluation context for CEL
 */
function buildEvaluationContext(
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string
): Record<string, any> {
    const path = getPath(state, pathId);
    if (!path) {
        throw new Error(`Path ${pathId} not found`);
    }

    // Find active state for this path
    let activeState = '';
    for (let i = path.history.length - 1; i >= 0; i--) {
        const transition = path.history[i];
        const node = machineJSON.nodes.find(n => n.name === transition.to);
        if (node?.type?.toLowerCase() === 'state') {
            activeState = transition.to;
            break;
        }
    }

    return {
        errorCount: state.metadata.errorCount,
        activeState,
        attributes: buildAttributeContext(machineJSON)
    };
}

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
        const context = buildEvaluationContext(machineJSON, state, pathId);

        // Replace template variables with CEL-compatible syntax
        // {{ nodeName.attributeName }} -> nodeName.attributeName
        let celCondition = condition.replace(/\{\{\s*(\w+)\.(\w+)\s*\}\}/g, '$1.$2');

        // Convert JavaScript operators to CEL equivalents
        celCondition = celCondition.replace(/===/g, '==').replace(/!==/g, '!=');

        // Use CEL evaluator
        return celEvaluator.evaluateCondition(celCondition, context);
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
    const attributes = buildAttributeContext(machineJSON);

    return celEvaluator.resolveTemplate(template, {
        errorCount: state.metadata.errorCount,
        activeState: '',  // Not path-specific for templates
        attributes
    });
}
