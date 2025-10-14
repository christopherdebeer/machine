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

    describe('template resolution', () => {
        it('should resolve simple template variables', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    config: {
                        timeout: 5000,
                        apiUrl: 'https://api.example.com'
                    }
                }
            };

            expect(evaluator.resolveTemplate('Timeout: {{ config.timeout }}ms', context))
                .toBe('Timeout: 5000ms');
            expect(evaluator.resolveTemplate('URL: {{ config.apiUrl }}', context))
                .toBe('URL: https://api.example.com');
        });

        it('should resolve nested template variables', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    system: {
                        database: {
                            host: 'localhost',
                            port: 5432
                        }
                    }
                }
            };

            expect(evaluator.resolveTemplate('Connect to {{ system.database.host }}:{{ system.database.port }}', context))
                .toBe('Connect to localhost:5432');
        });

        it('should resolve multiple template variables', () => {
            const context: CelEvaluationContext = {
                errorCount: 3,
                activeState: 'processing',
                attributes: {
                    user: {
                        name: 'Alice',
                        priority: 5
                    }
                }
            };

            expect(evaluator.resolveTemplate(
                'User {{ user.name }} (priority: {{ user.priority }}) with {{ errorCount }} errors',
                context
            )).toBe('User Alice (priority: 5) with 3 errors');
        });

        it('should handle template variables with expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    counts: {
                        total: 100,
                        processed: 75
                    }
                }
            };

            // CEL expressions in templates
            expect(evaluator.resolveTemplate('Progress: {{ counts.processed }} / {{ counts.total }}', context))
                .toBe('Progress: 75 / 100');
        });

        it('should handle built-in variables in templates', () => {
            const context: CelEvaluationContext = {
                errorCount: 5,
                activeState: 'processing',
                attributes: {}
            };

            expect(evaluator.resolveTemplate('Errors: {{ errorCount }}, State: {{ activeState }}', context))
                .toBe('Errors: 5, State: processing');
            expect(evaluator.resolveTemplate('Alias: {{ errors }}', context))
                .toBe('Alias: 5');
        });

        it('should handle null and undefined gracefully', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    data: {
                        value: null
                    }
                }
            };

            // Null values should resolve to empty string
            expect(evaluator.resolveTemplate('Value: {{ data.value }}', context))
                .toBe('Value: ');
        });

        it('should handle objects in templates', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    config: {
                        settings: { debug: true, verbose: false }
                    }
                }
            };

            // Objects should be JSON stringified
            // Note: CEL may return Map-like objects, so just check that it's stringified
            const result = evaluator.resolveTemplate('Settings: {{ config.settings }}', context);
            expect(result).toContain('Settings: ');
            // Should be stringified (either as object or Map)
            expect(result).toMatch(/Settings: \{.+\}/);
        });

        it('should return original template on error', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {}
            };

            // Invalid reference should return original template for debugging
            const result = evaluator.resolveTemplate('Value: {{ nonexistent.property }}', context);
            expect(result).toContain('{{ nonexistent.property }}');
        });

        it('should handle mixed content with multiple templates', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    userData: {
                        name: 'Bob',
                        email: 'bob@example.com'
                    },
                    config: {
                        apiKey: 'secret123'
                    }
                }
            };

            const template = 'User {{ userData.name }} ({{ userData.email }}) using API key {{ config.apiKey }}';
            expect(evaluator.resolveTemplate(template, context))
                .toBe('User Bob (bob@example.com) using API key secret123');
        });

        it('should handle whitespace in template expressions', () => {
            const context: CelEvaluationContext = {
                errorCount: 0,
                activeState: 'idle',
                attributes: {
                    node: {
                        value: 42
                    }
                }
            };

            // Various whitespace formats
            expect(evaluator.resolveTemplate('{{node.value}}', context)).toBe('42');
            expect(evaluator.resolveTemplate('{{ node.value }}', context)).toBe('42');
            expect(evaluator.resolveTemplate('{{  node.value  }}', context)).toBe('42');
        });
    });

    describe('variable collision handling', () => {
        it('should prioritize built-in variables over node names', () => {
            const context: CelEvaluationContext = {
                errorCount: 10,
                activeState: 'processing',
                attributes: {
                    // User creates node named "errorCount" (unlikely but possible)
                    errorCount: {
                        value: 5
                    }
                }
            };

            // Built-in errorCount should be 10, not 5
            expect(evaluator.evaluateCondition('errorCount == 10', context)).toBe(true);
            expect(evaluator.evaluateCondition('errorCount == 5', context)).toBe(false);

            // User can still access nested attribute if needed
            expect(evaluator.evaluateCondition('errorCount.value == 5', context)).toBe(true);
        });

        it('should protect all reserved built-in variables', () => {
            const context: CelEvaluationContext = {
                errorCount: 3,
                activeState: 'idle',
                attributes: {
                    // Attempt to shadow all built-ins
                    errorCount: { fake: 'value' },
                    errors: { fake: 'value' },
                    activeState: { fake: 'value' }
                }
            };

            // All built-ins should maintain their original values
            expect(evaluator.evaluateCondition('errorCount == 3', context)).toBe(true);
            expect(evaluator.evaluateCondition('errors == 3', context)).toBe(true);
            expect(evaluator.evaluateCondition('activeState == "idle"', context)).toBe(true);
        });

        it('should handle collision in template resolution', () => {
            const context: CelEvaluationContext = {
                errorCount: 7,
                activeState: 'processing',
                attributes: {
                    errorCount: {
                        message: 'shadowed'
                    }
                }
            };

            // Built-in should be used in templates
            expect(evaluator.resolveTemplate('Errors: {{ errorCount }}', context))
                .toBe('Errors: 7');

            // Note: Due to built-in protection, nested access to shadowed node properties
            // will fail because errorCount resolves to the number 7, not the node object.
            // This is the expected behavior to prevent variable clobbering.
            // Users should rename nodes that conflict with built-ins.
            const result = evaluator.resolveTemplate('Message: {{ errorCount.message }}', context);
            // The template should fail to resolve and return original or empty
            expect(result).toContain('{{');
        });
    });
});
