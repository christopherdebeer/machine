/**
 * Edge Condition Parser - Shared utility for extracting and evaluating edge conditions
 *
 * Handles edge condition patterns like:
 * - when: <condition>
 * - unless: <condition>
 * - if: <condition>
 */

/**
 * Edge interface (minimal)
 */
export interface Edge {
    label?: string;
    type?: string;
    value?: Record<string, any>;
    attributes?: Record<string, any>;
}

/**
 * Edge Condition Parser
 */
export class EdgeConditionParser {
    /**
     * Extract condition from edge value/label (when, unless, if)
     *
     * @param edge - Edge with optional value object, label string, or type
     * @returns Extracted condition string, or undefined if no condition found
     */
    static extract(edge: Edge): string | undefined {
        // First, check edge.value object for condition keys (primary method after generator refactor)
        const edgeValue = edge.value || edge.attributes;
        if (edgeValue && typeof edgeValue === 'object') {
            // Check for when: condition
            if ('when' in edgeValue) {
                const condition = edgeValue.when;
                if (condition !== undefined && condition !== null) {
                    // Clean quoted string values (only outer quotes, preserve inner quotes)
                    const cleanedCondition = typeof condition === 'string'
                        ? condition.replace(/^["'](.*)["']$/, '$1')
                        : String(condition);
                    return cleanedCondition.trim();
                }
            }

            // Check for unless: condition (negate it)
            if ('unless' in edgeValue) {
                const condition = edgeValue.unless;
                if (condition !== undefined && condition !== null) {
                    // Clean quoted string values (only outer quotes, preserve inner quotes)
                    const cleanedCondition = typeof condition === 'string'
                        ? condition.replace(/^["'](.*)["']$/, '$1')
                        : String(condition);
                    return `!(${cleanedCondition.trim()})`;
                }
            }

            // Check for if: condition
            if ('if' in edgeValue) {
                const condition = edgeValue['if'];
                if (condition !== undefined && condition !== null) {
                    // Clean quoted string values (only outer quotes, preserve inner quotes)
                    const cleanedCondition = typeof condition === 'string'
                        ? condition.replace(/^["'](.*)["']$/, '$1')
                        : String(condition);
                    return cleanedCondition.trim();
                }
            }
        }

        // Fallback: check edge.label string for legacy format (backwards compatibility)
        const edgeLabel = edge.label || edge.type || '';
        if (edgeLabel) {
            // Look for when: pattern (case-insensitive match, but preserve condition case)
            // Matches everything after "when:" until end of string or newline
            const whenMatch = edgeLabel.match(/when:\s*(.+?)(?:\n|$)/i);
            if (whenMatch) {
                return whenMatch[1].trim();
            }

            // Look for unless: pattern (negate it, case-insensitive match, but preserve condition case)
            // Matches everything after "unless:" until end of string or newline
            const unlessMatch = edgeLabel.match(/unless:\s*(.+?)(?:\n|$)/i);
            if (unlessMatch) {
                return `!(${unlessMatch[1].trim()})`;
            }

            // Look for if: pattern (case-insensitive match, but preserve condition case)
            // Matches everything after "if:" until end of string or newline
            const ifMatch = edgeLabel.match(/if:\s*(.+?)(?:\n|$)/i);
            if (ifMatch) {
                return ifMatch[1].trim();
            }
        }

        return undefined;
    }

    /**
     * Check if condition is simple/deterministic (does not require external calls)
     *
     * Simple conditions only reference context attributes and runtime state.
     * Complex conditions require tool calls, API calls, or external data.
     *
     * @param condition - Condition string to check
     * @returns true if condition is simple/deterministic, false otherwise
     */
    static isSimpleCondition(condition: string | undefined): boolean {
        if (!condition) return true;

        // Conditions that only reference context attributes and runtime state are simple
        // Complex conditions require tool calls or external data
        return !condition.includes('tool') &&
               !condition.includes('external') &&
               !condition.includes('api') &&
               !condition.includes('call');
    }
}
