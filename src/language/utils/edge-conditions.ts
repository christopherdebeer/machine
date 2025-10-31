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
}

/**
 * Edge Condition Parser
 */
export class EdgeConditionParser {
    /**
     * Extract condition from edge label (when, unless, if)
     *
     * @param edge - Edge with optional label or type
     * @returns Extracted condition string, or undefined if no condition found
     */
    static extract(edge: Edge): string | undefined {
        const edgeLabel = edge.label || edge.type || '';

        // Helper to extract condition from pattern, handling quoted strings properly
        // Matches: keyword: "condition" or keyword: condition or keyword: 'condition'
        const extractCondition = (keyword: string): string | undefined => {
            // Try double-quoted string first
            const doubleQuoted = new RegExp(`${keyword}:\\s*"([^"]+)"`, 'i').exec(edgeLabel);
            if (doubleQuoted) {
                return doubleQuoted[1].trim();
            }

            // Try single-quoted string
            const singleQuoted = new RegExp(`${keyword}:\\s*'([^']+)'`, 'i').exec(edgeLabel);
            if (singleQuoted) {
                return singleQuoted[1].trim();
            }

            // Try unquoted (everything after keyword: until end or semicolon)
            const unquoted = new RegExp(`${keyword}:\\s*([^;]+)`, 'i').exec(edgeLabel);
            if (unquoted) {
                return unquoted[1].trim();
            }

            return undefined;
        };

        // Look for when: pattern (case-insensitive match, but preserve condition case)
        const whenCondition = extractCondition('when');
        if (whenCondition) {
            return whenCondition;
        }

        // Look for unless: pattern (negate it, case-insensitive match, but preserve condition case)
        const unlessCondition = extractCondition('unless');
        if (unlessCondition) {
            return `!(${unlessCondition})`;
        }

        // Look for if: pattern (case-insensitive match, but preserve condition case)
        const ifCondition = extractCondition('if');
        if (ifCondition) {
            return ifCondition;
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
