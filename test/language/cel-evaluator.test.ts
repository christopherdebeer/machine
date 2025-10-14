import { describe, it, expect, beforeEach } from 'vitest';
import { CelEvaluator, CelEvaluationContext } from '../../src/language/cel-evaluator.js';

describe('CelEvaluator', () => {
    let evaluator: CelEvaluator;

    beforeEach(() => {
        evaluator = new CelEvaluator();
    });

    describe('basic expressions', () => {
        it('should evaluate simple boolean expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {}
            };

            expect(evaluator.evaluateCondition('true', context)).toBe(true);
            expect(evaluator.evaluateCondition('false', context)).toBe(false);
        });

        it('should evaluate numeric comparisons', () => {
            const context: CelEvaluationContext = {
                errorCount: 5,
                activeState: 'processing',
                attributes: {}
            };

            expect(evaluator.evaluateCondition('errorCount > 3', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount < 10', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount == 5', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount != 0', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount >= 5', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount <= 5', context)).toBe(true);
        });

        it('should evaluate string comparisons', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'processing',
                attributes: {}
            };

            expect(evaluator.evaluateCondition('activeState == "processing"', context)).toBe(true);
            expect(evaluator.evaluateCondition('activeState != "idle"', context)).toBe(true);
            expect(evaluator.evaluateCondition('activeState == "idle"', context)).toBe(false);
        });
    });

    describe('logical operators', () => {
        it('should evaluate AND expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 3,
                activeState: 'processing',
                attributes: {}
            };

            expect(evaluator.evaluateCondition('errorCount > 0 && activeState == "processing"', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount > 5 && activeState == "processing"', context)).toBe(false);
        });

        it('should evaluate OR expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 3,
                activeState: 'processing',
                attributes: {}
            };

            expect(evaluator.evaluateCondition('errorCount > 5 || activeState == "processing"', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount > 5 || activeState == "idle"', context)).toBe(false);
        });

        it('should evaluate NOT expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {}
            };

            expect(evaluator.evaluateCondition('!false', context)).toBe(true);
            expect(evaluator.evaluateCondition('!(errorCount > 0)', context)).toBe(true);
        });
    });

    describe('attribute access', () => {
        it('should access flat attributes', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    retryCount: 2,
                    maxRetries: 3
                }
            };

            expect(evaluator.evaluateCondition('retryCount < maxRetries', context)).toBe(true);
            expect(evaluator.evaluateCondition('retryCount == 2', context)).toBe(true);
        });

        it('should access nested attributes', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    userData: {
                        name: 'start',
                        priority: 5
                    }
                }
            };

            expect(evaluator.evaluateCondition('userData.name == "start"', context)).toBe(true);
            expect(evaluator.evaluateCondition('userData.priority > 3', context)).toBe(true);
        });

        it('should handle deeply nested attributes', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    config: {
                        retry: {
                            maxAttempts: 3,
                            delay: 1000
                        }
                    }
                }
            };

            expect(evaluator.evaluateCondition('config.retry.maxAttempts == 3', context)).toBe(true);
            expect(evaluator.evaluateCondition('config.retry.delay >= 1000', context)).toBe(true);
        });
    });

    describe('complex expressions', () => {
        it('should evaluate complex boolean logic', () => {
            const context: CelEvaluationContext = {
                errorCount: 2,
                activeState: 'processing',
                attributes: {
                    retryCount: 1,
                    maxRetries: 3,
                    circuitBreakerState: 'CLOSED'
                }
            };

            expect(evaluator.evaluateCondition(
                'errorCount > 0 && retryCount < maxRetries && circuitBreakerState == "CLOSED"',
                context
            )).toBe(true);

            expect(evaluator.evaluateCondition(
                '(errorCount > 5 || retryCount >= maxRetries) && circuitBreakerState == "OPEN"',
                context
            )).toBe(false);
        });

        it('should evaluate parenthesized expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 3,
                activeState: 'processing',
                attributes: {}
            };

            expect(evaluator.evaluateCondition('(errorCount > 0)', context)).toBe(true);
            expect(evaluator.evaluateCondition('(errorCount < 5) && (activeState == "processing")', context)).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should return false for invalid expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {}
            };

            // Invalid syntax
            expect(evaluator.evaluateCondition('errorCount >', context)).toBe(false);
            expect(evaluator.evaluateCondition('invalid syntax here', context)).toBe(false);
        });

        it('should handle undefined variables gracefully', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {}
            };

            // CEL treats undefined variables as null or zero-value
            // Testing that it doesn't throw and returns a boolean
            const result = evaluator.evaluateCondition('undefinedVar == 5', context);
            expect(typeof result).toBe('boolean');
        });

        it('should handle null and undefined attribute values', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    nullValue: null,
                    undefinedValue: undefined
                }
            };

            // CEL should handle null/undefined gracefully
            expect(evaluator.evaluateCondition('nullValue == null', context)).toBe(true);
        });
    });

    describe('backward compatibility', () => {
        it('should support the "errors" alias for errorCount', () => {
            const context: CelEvaluationContext = {
                errorCount: 5,
                activeState: 'idle',
                attributes: {}
            };

            // "errors" is an alias for errorCount
            expect(evaluator.evaluateCondition('errors > 3', context)).toBe(true);
            expect(evaluator.evaluateCondition('errors == 5', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount == errors', context)).toBe(true);
        });
    });

    describe('real-world use cases', () => {
        it('should evaluate retry conditions', () => {
            const context: CelEvaluationContext = {
                errorCount: 1,
                activeState: 'processing',
                attributes: {
                    retryCount: 2,
                    maxRetries: 3
                }
            };

            // Common retry condition
            expect(evaluator.evaluateCondition('retryCount < maxRetries', context)).toBe(true);
            expect(evaluator.evaluateCondition('retryCount >= maxRetries', context)).toBe(false);
        });

        it('should evaluate circuit breaker conditions', () => {
            const context: CelEvaluationContext = {
                errorCount: 6,
                activeState: 'processing',
                attributes: {
                    failureCount: 6,
                    threshold: 5,
                    circuitState: 'CLOSED'
                }
            };

            // Circuit breaker threshold check
            expect(evaluator.evaluateCondition(
                'failureCount >= threshold && circuitState == "CLOSED"',
                context
            )).toBe(true);
        });

        it('should evaluate state-based conditions', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'processing',
                attributes: {
                    status: 'pending',
                    priority: 'high'
                }
            };

            // State-based routing
            expect(evaluator.evaluateCondition(
                'activeState == "processing" && priority == "high"',
                context
            )).toBe(true);
        });

        it('should evaluate edge conditions from examples', () => {
            // Example from error-handling.dygram
            const context: CelEvaluationContext = {
                errorCount: 2,
                activeState: 'processing',
                attributes: {
                    retries: 2,
                    maxRetries: 3,
                    count: 4,
                    threshold: 5
                }
            };

            expect(evaluator.evaluateCondition('retries < maxRetries', context)).toBe(true);
            expect(evaluator.evaluateCondition('retries >= maxRetries', context)).toBe(false);
            expect(evaluator.evaluateCondition('count < threshold', context)).toBe(true);
            expect(evaluator.evaluateCondition('count >= threshold', context)).toBe(false);
        });
    });
});
