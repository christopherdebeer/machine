import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { TypeChecker } from '../../src/language/type-checker.js';
import { GraphValidator } from '../../src/language/graph-validator.js';
import {
    ValidationContext,
    ValidationSeverity,
    ValidationCategory,
    RecoveryStrategy,
    createValidationError,
    TypeErrorCodes,
    GraphErrorCodes
} from '../../src/language/validation-errors.js';

/**
 * Tests for Validation: Runtime Validation Error Handling
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Validation Error Types', () => {
    it('should create validation error with all properties', () => {
        const error = createValidationError('Test error', {
            severity: ValidationSeverity.ERROR,
            category: ValidationCategory.TYPE,
            code: TypeErrorCodes.TYPE_MISMATCH,
            location: { node: 'TestNode', property: 'count' },
            expected: 'number',
            actual: 'string',
            suggestion: 'Change type to number'
        });

        expect(error.severity).toBe(ValidationSeverity.ERROR);
        expect(error.category).toBe(ValidationCategory.TYPE);
        expect(error.code).toBe(TypeErrorCodes.TYPE_MISMATCH);
        expect(error.message).toBe('Test error');
        expect(error.location?.node).toBe('TestNode');
        expect(error.expected).toBe('number');
        expect(error.actual).toBe('string');
        expect(error.suggestion).toBe('Change type to number');
        expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create validation error with defaults', () => {
        const error = createValidationError('Simple error');

        expect(error.severity).toBe(ValidationSeverity.ERROR);
        expect(error.category).toBe(ValidationCategory.STRUCTURAL);
        expect(error.code).toBe('VALIDATION_ERROR');
    });
});

describe('ValidationContext', () => {
    it('should accumulate errors', () => {
        const context = new ValidationContext();

        context.addError(createValidationError('Error 1'));
        context.addError(createValidationError('Error 2'));

        expect(context.getErrorCount()).toBe(2);
        expect(context.hasErrors()).toBe(true);
    });

    it('should filter errors by severity', () => {
        const context = new ValidationContext();

        context.addError(createValidationError('Error 1', {
            severity: ValidationSeverity.ERROR
        }));
        context.addError(createValidationError('Warning 1', {
            severity: ValidationSeverity.WARNING
        }));
        context.addError(createValidationError('Error 2', {
            severity: ValidationSeverity.ERROR
        }));

        expect(context.getErrorCountBySeverity(ValidationSeverity.ERROR)).toBe(2);
        expect(context.getErrorCountBySeverity(ValidationSeverity.WARNING)).toBe(1);
        expect(context.hasCriticalErrors()).toBe(true);
    });

    it('should filter errors by category', () => {
        const context = new ValidationContext();

        context.addError(createValidationError('Type error', {
            category: ValidationCategory.TYPE
        }));
        context.addError(createValidationError('Graph error', {
            category: ValidationCategory.GRAPH
        }));

        const typeErrors = context.getErrorsByCategory(ValidationCategory.TYPE);
        const graphErrors = context.getErrorsByCategory(ValidationCategory.GRAPH);

        expect(typeErrors).toHaveLength(1);
        expect(graphErrors).toHaveLength(1);
    });

    it('should flag nodes with errors', () => {
        const context = new ValidationContext();

        context.addError(createValidationError('Error 1', {
            location: { node: 'NodeA', property: 'count' }
        }));
        context.addError(createValidationError('Error 2', {
            location: { node: 'NodeA', property: 'name' }
        }));

        const nodeErrors = context.getNodeErrors('NodeA');
        expect(nodeErrors).toHaveLength(2);

        const flag = context.getNodeFlag('NodeA');
        expect(flag).toBeDefined();
        expect(flag?.nodeName).toBe('NodeA');
        expect(flag?.errors).toHaveLength(2);
    });

    it('should block nodes with ERROR severity', () => {
        const context = new ValidationContext();

        context.addError(createValidationError('Critical error', {
            severity: ValidationSeverity.ERROR,
            location: { node: 'NodeA' }
        }));

        expect(context.isNodeBlocked('NodeA')).toBe(true);
    });

    it('should not block nodes with WARNING severity', () => {
        const context = new ValidationContext();

        context.addError(createValidationError('Warning', {
            severity: ValidationSeverity.WARNING,
            location: { node: 'NodeB' }
        }));

        expect(context.isNodeBlocked('NodeB')).toBe(false);
    });

    it('should handle recovery actions', () => {
        const context = new ValidationContext();

        context.setRecoveryAction('NodeA', {
            strategy: RecoveryStrategy.SKIP
        });

        const action = context.getRecoveryAction('NodeA');
        expect(action).toBeDefined();
        expect(action?.strategy).toBe(RecoveryStrategy.SKIP);
    });

    it('should generate summary', () => {
        const context = new ValidationContext();

        context.addError(createValidationError('Error 1', {
            severity: ValidationSeverity.ERROR,
            category: ValidationCategory.TYPE,
            location: { node: 'NodeA' }
        }));
        context.addError(createValidationError('Warning 1', {
            severity: ValidationSeverity.WARNING,
            category: ValidationCategory.GRAPH
        }));

        const summary = context.getSummary();

        expect(summary.totalErrors).toBe(2);
        expect(summary.errorCount).toBe(1);
        expect(summary.warningCount).toBe(1);
        expect(summary.blockedNodes).toContain('NodeA');
        expect(summary.errorsByCategory[ValidationCategory.TYPE]).toBe(1);
        expect(summary.errorsByCategory[ValidationCategory.GRAPH]).toBe(1);
    });
});

describe('TypeChecker with ValidationContext', () => {
    it('should catch missing values for required types', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>;
            }`;

        const result = await parse(text);
        const machine = result.parseResult.value;

        const context = new ValidationContext();
        const typeChecker = new TypeChecker(machine);
        typeChecker.validateAllAttributesWithContext(context);

        expect(context.hasErrors()).toBe(true);
        expect(context.getErrorCount()).toBeGreaterThan(0);

        const errors = context.getErrors();
        const missingValueError = errors.find(e =>
            e.code === TypeErrorCodes.TYPE_MISMATCH &&
            e.message.includes('count')
        );

        expect(missingValueError).toBeDefined();
        expect(missingValueError?.severity).toBe(ValidationSeverity.ERROR);
        expect(missingValueError?.category).toBe(ValidationCategory.TYPE);
        expect(missingValueError?.suggestion).toBeDefined();
    });

    it('should error for required types without values', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>;
            }`;

        const result = await parse(text);
        const machine = result.parseResult.value;

        const context = new ValidationContext();
        const typeChecker = new TypeChecker(machine);
        typeChecker.validateAllAttributesWithContext(context);

        // Should have critical errors for required types without values
        expect(context.hasCriticalErrors()).toBe(true);

        const errors = context.getErrors();
        expect(errors.some(e => e.code === TypeErrorCodes.TYPE_MISMATCH)).toBe(true);
    });

    it('should provide helpful suggestions for type errors', async () => {
        const text = `machine "Test"
            task myTask {
                count<string>;
            }`;

        const result = await parse(text);
        const machine = result.parseResult.value;

        const context = new ValidationContext();
        const typeChecker = new TypeChecker(machine);
        typeChecker.validateAllAttributesWithContext(context);

        const errors = context.getErrors();
        const typeError = errors.find(e => e.code === TypeErrorCodes.TYPE_MISMATCH);

        expect(typeError?.suggestion).toBeDefined();
        expect(typeError?.suggestion).toContain('optional');
    });
});

describe('GraphValidator with ValidationContext', () => {
    it('should flag unreachable nodes', async () => {
        const text = `machine "Test"
            init Start
            task Middle
            task Unreachable

            Start -> Middle`;

        const result = await parse(text);
        const machine = result.parseResult.value;

        const context = new ValidationContext();
        const graphValidator = new GraphValidator(machine);
        graphValidator.validateWithContext(context);

        const unreachableErrors = context.getErrors().filter(e =>
            e.code === GraphErrorCodes.UNREACHABLE_NODE
        );

        expect(unreachableErrors.length).toBeGreaterThan(0);
        expect(unreachableErrors[0].severity).toBe(ValidationSeverity.WARNING);
        expect(unreachableErrors[0].suggestion).toBeDefined();
    });

    it('should flag cycles with detailed information', async () => {
        const text = `machine "Test"
            init Start
            task A
            task B

            Start -> A
            A -> B
            B -> A`;

        const result = await parse(text);
        const machine = result.parseResult.value;

        const context = new ValidationContext();
        const graphValidator = new GraphValidator(machine);
        graphValidator.validateWithContext(context);

        const cycleErrors = context.getErrors().filter(e =>
            e.code === GraphErrorCodes.CYCLE_DETECTED
        );

        expect(cycleErrors.length).toBeGreaterThan(0);
        expect(cycleErrors[0].context?.cyclePath).toBeDefined();
        expect(cycleErrors[0].suggestion).toBeDefined();
    });
});

describe('Codex Feedback Fix', () => {
    it('should validate typed attributes even without values', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>;
                name<string>;
            }`;

        const result = await parse(text);

        // Check that validation errors are produced
        const diagnostics = result.diagnostics || [];
        const typeErrors = diagnostics.filter(d =>
            d.message.includes('count') || d.message.includes('name')
        );

        // Should have errors for both count and name since they have types but no values
        expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should error for required typed attributes without values', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>;
                name<string>;
            }`;

        const result = await parse(text);

        // Check that validation errors are produced for required types without values
        const diagnostics = result.diagnostics || [];
        const typeErrors = diagnostics.filter(d =>
            d.severity === 1 && // Error severity
            (d.message.includes('count') || d.message.includes('name'))
        );

        // Should have errors for both attributes since they're required but have no values
        expect(typeErrors.length).toBeGreaterThan(0);
    });
});
