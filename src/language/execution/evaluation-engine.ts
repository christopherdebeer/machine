/**
 * Evaluation Engine
 * Responsible for evaluating conditions, resolving templates, and providing context
 */

import { CelEvaluator } from '../cel-evaluator.js';
import { EdgeConditionParser } from '../utils/edge-conditions.js';
import { MachineData } from '../base-executor.js';
import { parseAttributeValue } from '../utils/ast-helpers.js';
import { EvaluationContext, AnnotatedEdge } from './types.js';

/**
 * EvaluationEngine handles all expression evaluation and template resolution
 */
export class EvaluationEngine {
    private celEvaluator: CelEvaluator;
    private machineData: MachineData;

    constructor(machineData: MachineData) {
        this.machineData = machineData;
        this.celEvaluator = new CelEvaluator();
    }

    /**
     * Build a context object with all nodes' attributes for CEL evaluation
     * Creates nested structure: { nodeName: { attributeName: value, ... }, ... }
     */
    buildAttributeContext(): Record<string, any> {
        const RESERVED_NAMES = ['errorCount', 'errors', 'activeState'];
        const attributes: Record<string, any> = {};

        // Build nested structure for all nodes
        for (const node of this.machineData.nodes) {
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
                    attributes[node.name][attr.name] = this.parseValue(attr.value, attr.type);
                }
            }
        }

        return attributes;
    }

    /**
     * Parse a stored value back to its original type
     */
    private parseValue(rawValue: string, type?: string): any {
        if (!type) {
            // Try to auto-detect and parse
            const cleanValue = rawValue.replace(/^["']|["']$/g, '');
            try {
                return JSON.parse(rawValue);
            } catch {
                return cleanValue;
            }
        }

        // Strip quotes before parsing typed values
        const cleanValue = rawValue.replace(/^["']|["']$/g, '');
        return parseAttributeValue(cleanValue, type);
    }

    /**
     * Extract condition from edge label (when, unless, if)
     */
    extractEdgeCondition(edge: { label?: string; type?: string }): string | undefined {
        return EdgeConditionParser.extract(edge);
    }

    /**
     * Check if condition is simple (deterministic, no external data)
     */
    isSimpleCondition(condition: string | undefined): boolean {
        return EdgeConditionParser.isSimpleCondition(condition);
    }

    /**
     * Evaluate a condition string against current context
     * Uses CEL (Common Expression Language) for safe, sandboxed evaluation
     */
    evaluateCondition(condition: string | undefined, context: EvaluationContext): boolean {
        if (!condition) {
            return true; // No condition means always true
        }

        try {
            // Replace template variables with CEL-compatible syntax
            // {{ nodeName.attributeName }} -> nodeName.attributeName
            let celCondition = condition.replace(/\{\{\s*(\w+)\.(\w+)\s*\}\}/g, '$1.$2');

            // Convert JavaScript operators to CEL equivalents
            // CEL uses == and != (not === and !==)
            celCondition = celCondition.replace(/===/g, '==').replace(/!==/g, '!=');

            // Use CEL evaluator for safe evaluation
            return this.celEvaluator.evaluateCondition(celCondition, context);
        } catch (error) {
            console.error('Error evaluating condition:', condition, error);
            return false; // If condition evaluation fails, treat as false
        }
    }

    /**
     * Resolve template variables in a string using CEL
     * Replaces {{ nodeName.attributeName }} with actual values
     * @param template - String containing template variables
     * @param context - Evaluation context
     * @returns Resolved string with template variables replaced
     */
    resolveTemplate(template: string, context: EvaluationContext): string {
        return this.celEvaluator.resolveTemplate(template, context);
    }

    /**
     * Build evaluation context for a specific execution state
     */
    buildEvaluationContext(errorCount: number, activeState: string): EvaluationContext {
        return {
            errorCount,
            activeState,
            attributes: this.buildAttributeContext()
        };
    }
}
