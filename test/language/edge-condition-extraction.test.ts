import { describe, it, expect } from 'vitest';
import { EdgeConditionParser } from '../../src/language/utils/edge-conditions.js';

describe('EdgeConditionParser - Extraction from edge.value', () => {
    describe('Extract from edge.value object (primary format)', () => {
        it('should extract when: condition from edge.value', () => {
            const edge = {
                value: {
                    when: '(status == "valid")'
                }
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('(status == "valid")');
        });

        it('should extract unless: condition from edge.value and negate it', () => {
            const edge = {
                value: {
                    unless: '(errorCount > 0)'
                }
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('!((errorCount > 0))');
        });

        it('should extract if: condition from edge.value', () => {
            const edge = {
                value: {
                    if: 'status == "ready"'
                }
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('status == "ready"');
        });

        it('should clean quoted string values from edge.value', () => {
            const edge = {
                value: {
                    when: '\'(status == "valid")\''  // Single quotes wrapping condition
                }
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('(status == "valid")');
        });

        it('should handle edge.value with text and condition', () => {
            const edge = {
                value: {
                    text: 'Go to Success',
                    when: 'status == "valid"'
                }
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('status == "valid"');
        });
    });

    describe('Extract from edge.label string (legacy format)', () => {
        it('should extract when: condition from edge.label', () => {
            const edge = {
                label: 'when: status == "valid"'
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('status == "valid"');
        });

        it('should extract unless: condition from edge.label', () => {
            const edge = {
                label: 'unless: errorCount > 0'
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('!(errorCount > 0)');
        });
    });

    describe('Priority and fallback behavior', () => {
        it('should prioritize edge.value over edge.label', () => {
            const edge = {
                value: {
                    when: 'status == "valid"'
                },
                label: 'when: status == "invalid"'  // Should be ignored
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBe('status == "valid"');
        });

        it('should return undefined when no condition exists', () => {
            const edge = {
                value: {
                    text: 'Normal edge label'
                }
            };

            const condition = EdgeConditionParser.extract(edge);

            expect(condition).toBeUndefined();
        });
    });
});
