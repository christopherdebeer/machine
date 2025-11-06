import { describe, it, expect, beforeEach } from 'vitest';
import { EdgeEvaluator } from '../../src/language/diagram/edge-evaluator.js';

/**
 * Generative tests for EdgeEvaluator
 *
 * These tests use property-based testing concepts to validate edge evaluation
 * across a wide range of scenarios, ensuring robust handling of various
 * condition types, contexts, and edge cases.
 */
describe('EdgeEvaluator - Generative Tests', () => {
    let evaluator: EdgeEvaluator;

    beforeEach(() => {
        evaluator = new EdgeEvaluator();
    });

    /**
     * Test generator for numeric comparison conditions
     * Tests all numeric comparison operators with various values
     */
    describe('Numeric Comparisons', () => {
        const operators = ['>', '<', '>=', '<=', '==', '!='];
        const testValues = [
            { value: 0, testAgainst: [0, 1, -1, 10, -10] },
            { value: 5, testAgainst: [0, 5, 10, -5] },
            { value: 100, testAgainst: [0, 50, 100, 150, 200] },
        ];

        operators.forEach(op => {
            testValues.forEach(({ value, testAgainst }) => {
                testAgainst.forEach(testVal => {
                    it(`should evaluate "errorCount ${op} ${testVal}" with errorCount=${value}`, () => {
                        const edge = { label: `when: errorCount ${op} ${testVal}` };
                        const context = { errorCount: value };

                        const result = evaluator.evaluateEdge(edge, context);

                        // Calculate expected result
                        let expected: boolean;
                        switch (op) {
                            case '>': expected = value > testVal; break;
                            case '<': expected = value < testVal; break;
                            case '>=': expected = value >= testVal; break;
                            case '<=': expected = value <= testVal; break;
                            case '==': expected = value == testVal; break;
                            case '!=': expected = value != testVal; break;
                            default: expected = false;
                        }

                        expect(result.isActive).toBe(expected);
                        expect(result.hasCondition).toBe(true);
                        expect(result.error).toBeUndefined();
                    });
                });
            });
        });
    });

    /**
     * Test generator for string comparison conditions
     */
    describe('String Comparisons', () => {
        const testCases = [
            { value: 'active', compare: 'active', operator: '==', expected: true },
            { value: 'active', compare: 'inactive', operator: '==', expected: false },
            { value: 'processing', compare: 'processing', operator: '==', expected: true },
            { value: 'done', compare: 'pending', operator: '!=', expected: true },
            { value: 'ready', compare: 'ready', operator: '!=', expected: false },
            { value: '', compare: '', operator: '==', expected: true },
            { value: '', compare: 'something', operator: '!=', expected: true },
        ];

        testCases.forEach(({ value, compare, operator, expected }) => {
            it(`should evaluate 'status ${operator} "${compare}"' with status="${value}"`, () => {
                const edge = { label: `when: status ${operator} "${compare}"` };
                const context = { attributes: { status: value } };

                const result = evaluator.evaluateEdge(edge, context);

                expect(result.isActive).toBe(expected);
                expect(result.hasCondition).toBe(true);
                expect(result.error).toBeUndefined();
            });
        });
    });

    /**
     * Test generator for boolean logic combinations
     */
    describe('Boolean Logic', () => {
        const logicTests = [
            // AND conditions
            { condition: 'errorCount > 0 && retryCount < 3', context: { errorCount: 1, attributes: { retryCount: 2 } }, expected: true },
            { condition: 'errorCount > 0 && retryCount < 3', context: { errorCount: 0, attributes: { retryCount: 2 } }, expected: false },
            { condition: 'errorCount > 0 && retryCount < 3', context: { errorCount: 1, attributes: { retryCount: 5 } }, expected: false },

            // OR conditions
            { condition: 'errorCount > 5 || status == "critical"', context: { errorCount: 10, attributes: { status: 'ok' } }, expected: true },
            { condition: 'errorCount > 5 || status == "critical"', context: { errorCount: 2, attributes: { status: 'critical' } }, expected: true },
            { condition: 'errorCount > 5 || status == "critical"', context: { errorCount: 2, attributes: { status: 'ok' } }, expected: false },

            // Complex combinations
            { condition: '(errorCount > 0 && retryCount < 3) || status == "override"', context: { errorCount: 1, attributes: { retryCount: 2, status: 'normal' } }, expected: true },
            { condition: '(errorCount > 0 && retryCount < 3) || status == "override"', context: { errorCount: 0, attributes: { retryCount: 2, status: 'override' } }, expected: true },
            { condition: '(errorCount > 0 && retryCount < 3) || status == "override"', context: { errorCount: 0, attributes: { retryCount: 5, status: 'normal' } }, expected: false },
        ];

        logicTests.forEach(({ condition, context, expected }, index) => {
            it(`should evaluate complex condition #${index + 1}: "${condition}"`, () => {
                const edge = { label: `when: ${condition}` };
                const result = evaluator.evaluateEdge(edge, context);

                expect(result.isActive).toBe(expected);
                expect(result.hasCondition).toBe(true);
                expect(result.error).toBeUndefined();
            });
        });
    });

    /**
     * Test generator for unless conditions (negation)
     */
    describe('Unless Conditions (Negation)', () => {
        const unlessTests = [
            { condition: 'errorCount > 0', context: { errorCount: 0 }, expected: true },
            { condition: 'errorCount > 0', context: { errorCount: 5 }, expected: false },
            { condition: 'status == "disabled"', context: { attributes: { status: 'enabled' } }, expected: true },
            { condition: 'status == "disabled"', context: { attributes: { status: 'disabled' } }, expected: false },
        ];

        unlessTests.forEach(({ condition, context, expected }, index) => {
            it(`should evaluate unless condition #${index + 1}: "unless: ${condition}"`, () => {
                const edge = { label: `unless: ${condition}` };
                const result = evaluator.evaluateEdge(edge, context);

                expect(result.isActive).toBe(expected);
                expect(result.hasCondition).toBe(true);
            });
        });
    });

    /**
     * Test generator for nested attribute access
     */
    describe('Nested Attribute Access', () => {
        const nestedTests = [
            {
                condition: 'config.enabled == true',
                context: { attributes: { config: { enabled: true } } },
                expected: true
            },
            {
                condition: 'config.enabled == true',
                context: { attributes: { config: { enabled: false } } },
                expected: false
            },
            {
                condition: 'settings.retry.maxAttempts > 3',
                context: { attributes: { settings: { retry: { maxAttempts: 5 } } } },
                expected: true
            },
            {
                condition: 'user.permissions.admin == true',
                context: { attributes: { user: { permissions: { admin: true } } } },
                expected: true
            },
        ];

        nestedTests.forEach(({ condition, context, expected }, index) => {
            it(`should evaluate nested access #${index + 1}: "${condition}"`, () => {
                const edge = { label: `when: ${condition}` };
                const result = evaluator.evaluateEdge(edge, context);

                expect(result.isActive).toBe(expected);
                expect(result.hasCondition).toBe(true);
            });
        });
    });

    /**
     * Test generator for edge cases and error handling
     */
    describe('Edge Cases and Error Handling', () => {
        it('should handle missing variables gracefully', () => {
            const edge = { label: 'when: missingVar > 0' };
            const context = {};

            const result = evaluator.evaluateEdge(edge, context);

            expect(result.hasCondition).toBe(true);
            // Should not throw, result may vary based on CEL implementation
        });

        it('should handle null values', () => {
            const edge = { label: 'when: value == null' };
            const context = { attributes: { value: null } };

            const result = evaluator.evaluateEdge(edge, context);

            expect(result.hasCondition).toBe(true);
        });

        it('should handle empty string comparisons', () => {
            const edge = { label: 'when: name != ""' };
            const context = { attributes: { name: '' } };

            const result = evaluator.evaluateEdge(edge, context);

            expect(result.isActive).toBe(false);
            expect(result.hasCondition).toBe(true);
        });

        it('should handle type mismatches gracefully', () => {
            const edge = { label: 'when: count > "5"' };
            const context = { attributes: { count: 10 } };

            const result = evaluator.evaluateEdge(edge, context);

            expect(result.hasCondition).toBe(true);
            // CEL may handle this differently - just ensure no crash
        });
    });

    /**
     * Test generator for createDefaultContext with various attribute sets
     */
    describe('Context Generation', () => {
        const contextTests = [
            {
                name: 'simple attributes',
                attributes: [
                    { name: 'maxRetries', value: 3 },
                    { name: 'timeout', value: 5000 },
                ],
                expected: { maxRetries: 3, timeout: 5000 }
            },
            {
                name: 'mixed types',
                attributes: [
                    { name: 'count', value: 42 },
                    { name: 'enabled', value: true },
                    { name: 'label', value: 'test' },
                ],
                expected: { count: 42, enabled: true, label: 'test' }
            },
            {
                name: 'quoted strings',
                attributes: [
                    { name: 'status', value: '"active"' },
                    { name: 'mode', value: "'production'" },
                ],
                expected: { status: 'active', mode: 'production' }
            },
            {
                name: 'filtering metadata attributes',
                attributes: [
                    { name: 'maxRetries', value: 3 },
                    { name: 'description', value: 'should be filtered' },
                    { name: 'style', value: 'color: red' },
                    { name: 'version', value: '1.0' },
                ],
                expected: { maxRetries: 3 }
            },
        ];

        contextTests.forEach(({ name, attributes, expected }) => {
            it(`should create context from ${name}`, () => {
                const context = evaluator.createDefaultContext(attributes);

                expect(context.errorCount).toBe(0);
                expect(context.activeState).toBe('');
                Object.keys(expected).forEach(key => {
                    expect(context.attributes?.[key]).toBe(expected[key]);
                });
            });
        });
    });

    /**
     * Test generator for multiple edges evaluation
     */
    describe('Batch Edge Evaluation', () => {
        it('should evaluate multiple edges independently', () => {
            const edges = [
                { label: 'when: errorCount > 0' },
                { label: 'when: errorCount == 0' },
                { label: 'unless: errorCount > 5' },
                { label: 'normal edge' },
                { label: 'if: status == "ready"' },
            ];
            const context = {
                errorCount: 3,
                attributes: { status: 'ready' }
            };

            const results = evaluator.evaluateEdges(edges, context);

            expect(results.size).toBe(5);
            expect(results.get(0)?.isActive).toBe(true);   // errorCount > 0
            expect(results.get(1)?.isActive).toBe(false);  // errorCount == 0
            expect(results.get(2)?.isActive).toBe(true);   // unless errorCount > 5
            expect(results.get(3)?.isActive).toBe(true);   // no condition
            expect(results.get(4)?.isActive).toBe(true);   // status == "ready"
        });

        it('should handle mixed valid and invalid conditions', () => {
            const edges = [
                { label: 'when: valid == true' },
                { label: 'when: invalid syntax here!' },
                { label: 'when: another > 0' },
            ];
            const context = {
                attributes: { valid: true, another: 5 }
            };

            const results = evaluator.evaluateEdges(edges, context);

            expect(results.size).toBe(3);
            expect(results.get(0)?.isActive).toBe(true);
            expect(results.get(0)?.error).toBeUndefined();

            // Invalid syntax may result in error or false
            const invalidResult = results.get(1);
            expect(invalidResult?.hasCondition).toBe(true);

            expect(results.get(2)?.isActive).toBe(true);
        });
    });

    /**
     * Output validation - ensure results match expected structure
     */
    describe('Result Structure Validation', () => {
        it('should return complete result structure for conditional edges', () => {
            const edge = { label: 'when: value > 5' };
            const context = { attributes: { value: 10 } };

            const result = evaluator.evaluateEdge(edge, context);

            expect(result).toHaveProperty('isActive');
            expect(result).toHaveProperty('hasCondition');
            expect(result).toHaveProperty('condition');
            expect(typeof result.isActive).toBe('boolean');
            expect(typeof result.hasCondition).toBe('boolean');
            expect(typeof result.condition).toBe('string');
        });

        it('should return minimal structure for unconditional edges', () => {
            const edge = { label: 'normal' };
            const context = {};

            const result = evaluator.evaluateEdge(edge, context);

            expect(result.isActive).toBe(true);
            expect(result.hasCondition).toBe(false);
            expect(result.condition).toBeUndefined();
            expect(result.error).toBeUndefined();
        });

        it('should include error information on evaluation failure', () => {
            const edge = { label: 'when: 1 / 0 > 5' }; // May cause evaluation error
            const context = {};

            const result = evaluator.evaluateEdge(edge, context);

            expect(result.hasCondition).toBe(true);
            // If error occurs, isActive should be false
            if (result.error) {
                expect(result.isActive).toBe(false);
                expect(typeof result.error).toBe('string');
            }
        });
    });

    /**
     * Real-world scenario tests
     */
    describe('Real-World Scenarios', () => {
        it('should handle retry logic pattern', () => {
            const edge = { label: 'when: retryCount < maxRetries && errorCount > 0' };

            // Scenario: should retry
            const shouldRetry = evaluator.evaluateEdge(edge, {
                errorCount: 1,
                attributes: { retryCount: 2, maxRetries: 5 }
            });
            expect(shouldRetry.isActive).toBe(true);

            // Scenario: exhausted retries
            const exhausted = evaluator.evaluateEdge(edge, {
                errorCount: 1,
                attributes: { retryCount: 5, maxRetries: 5 }
            });
            expect(exhausted.isActive).toBe(false);
        });

        it('should handle circuit breaker pattern', () => {
            const edge = { label: 'when: errorCount > threshold && circuitOpen == false' };

            const context = {
                errorCount: 10,
                attributes: { threshold: 5, circuitOpen: false }
            };

            const result = evaluator.evaluateEdge(edge, context);
            expect(result.isActive).toBe(true);
        });

        it('should handle state-based routing', () => {
            const successEdge = { label: 'when: status == "success"' };
            const failureEdge = { label: 'when: status == "failure"' };
            const pendingEdge = { label: 'when: status == "pending"' };

            const context = { attributes: { status: 'success' } };

            expect(evaluator.evaluateEdge(successEdge, context).isActive).toBe(true);
            expect(evaluator.evaluateEdge(failureEdge, context).isActive).toBe(false);
            expect(evaluator.evaluateEdge(pendingEdge, context).isActive).toBe(false);
        });
    });
});
