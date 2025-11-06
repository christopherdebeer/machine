import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { TypeChecker } from '../../src/language/type-checker.js';
import { TypeRegistry } from '../../src/language/type-registry.js';
import { z } from 'zod';

/**
 * Tests for Zod-based type validation system
 * Tests built-in validators (Date, UUID, URL, Duration, Integer, Float)
 * and extensibility via custom type registration
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('TypeRegistry - Built-in Validators', () => {
    it('should validate Date type with ISO 8601 format', () => {
        const registry = new TypeRegistry();

        // Valid ISO 8601 dates (Zod accepts Z format)
        expect(registry.validate('Date', '1985-10-24T00:00:00Z').valid).toBe(true);
        expect(registry.validate('Date', '2025-10-22T13:30:00Z').valid).toBe(true);

        // Invalid dates (missing time or timezone)
        const result = registry.validate('Date', '1985-10-24');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('ISO');
    });

    it('should validate UUID type', () => {
        const registry = new TypeRegistry();

        // Valid UUIDs
        expect(registry.validate('UUID', '550e8400-e29b-41d4-a716-446655440000').valid).toBe(true);
        expect(registry.validate('UUID', '6ba7b810-9dad-11d1-80b4-00c04fd430c8').valid).toBe(true);

        // Invalid UUID
        const result = registry.validate('UUID', 'not-a-uuid');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('UUID');
    });

    it('should validate URL type', () => {
        const registry = new TypeRegistry();

        // Valid URLs
        expect(registry.validate('URL', 'https://example.com').valid).toBe(true);
        expect(registry.validate('URL', 'http://localhost:3000/api').valid).toBe(true);
        expect(registry.validate('URL', 'ftp://files.example.com').valid).toBe(true);

        // Invalid URL
        const result = registry.validate('URL', 'not a url');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('URL');
    });

    it('should validate Duration type (ISO 8601 duration)', () => {
        const registry = new TypeRegistry();

        // Valid durations
        expect(registry.validate('Duration', 'P1Y2M3D').valid).toBe(true);
        expect(registry.validate('Duration', 'PT4H5M6S').valid).toBe(true);
        expect(registry.validate('Duration', 'P1Y2M3DT4H5M6S').valid).toBe(true);
        expect(registry.validate('Duration', 'PT1H').valid).toBe(true);

        // Invalid duration
        const result = registry.validate('Duration', '1 hour');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('duration');
    });

    it('should validate Integer type', () => {
        const registry = new TypeRegistry();

        // Valid integers
        expect(registry.validate('Integer', 42).valid).toBe(true);
        expect(registry.validate('Integer', -10).valid).toBe(true);
        expect(registry.validate('Integer', 0).valid).toBe(true);

        // Invalid integers (floats)
        const result = registry.validate('Integer', 3.14);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('integer');
    });

    it('should validate Float type', () => {
        const registry = new TypeRegistry();

        // Valid floats
        expect(registry.validate('Float', 3.14).valid).toBe(true);
        expect(registry.validate('Float', -2.5).valid).toBe(true);
        expect(registry.validate('Float', 42).valid).toBe(true); // integers are valid floats
    });
});

describe('TypeRegistry - Generic Types', () => {
    it('should validate Array<string>', () => {
        const registry = new TypeRegistry();

        // Valid array of strings
        const result1 = registry.validateGenericType('Array', ['string'], ['a', 'b', 'c']);
        expect(result1.valid).toBe(true);

        // Invalid: array with numbers
        const result2 = registry.validateGenericType('Array', ['string'], [1, 2, 3]);
        expect(result2.valid).toBe(false);
    });

    it('should validate Array<Date>', () => {
        const registry = new TypeRegistry();

        // Valid array of ISO dates
        const validDates = [
            '2025-10-22T13:30:00Z',
            '2025-10-23T14:00:00Z'
        ];
        const result1 = registry.validateGenericType('Array', ['Date'], validDates);
        expect(result1.valid).toBe(true);

        // Invalid: array with non-ISO date
        const invalidDates = ['2025-10-22', '2025-10-23'];
        const result2 = registry.validateGenericType('Array', ['Date'], invalidDates);
        expect(result2.valid).toBe(false);
    });

    it('should validate Array<Integer>', () => {
        const registry = new TypeRegistry();

        // Valid array of integers
        const result1 = registry.validateGenericType('Array', ['Integer'], [1, 2, 3]);
        expect(result1.valid).toBe(true);

        // Invalid: array with floats
        const result2 = registry.validateGenericType('Array', ['Integer'], [1.5, 2.5, 3.5]);
        expect(result2.valid).toBe(false);
    });
});

describe('TypeRegistry - Custom Type Registration', () => {
    it('should allow registering custom types', () => {
        const registry = new TypeRegistry();

        // Register a SemVer type
        const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/, {
            message: 'Must be a semantic version (e.g., 1.2.3)'
        });
        registry.register('SemVer', SemVer);

        // Valid SemVer
        expect(registry.validate('SemVer', '1.2.3').valid).toBe(true);
        expect(registry.validate('SemVer', '0.0.1').valid).toBe(true);

        // Invalid SemVer
        const result = registry.validate('SemVer', 'v1.2.3');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('semantic version');
    });

    it('should allow registering Email type', () => {
        const registry = new TypeRegistry();

        // Register an Email type
        const Email = z.string().email({ message: 'Must be a valid email address' });
        registry.register('Email', Email);

        // Valid email
        expect(registry.validate('Email', 'user@example.com').valid).toBe(true);

        // Invalid email
        const result = registry.validate('Email', 'not-an-email');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('email');
    });

    it('should list all registered types', () => {
        const registry = new TypeRegistry();

        const types = registry.getRegisteredTypes();

        // Should have built-in types
        expect(types).toContain('string');
        expect(types).toContain('number');
        expect(types).toContain('boolean');
        expect(types).toContain('Date');
        expect(types).toContain('UUID');
        expect(types).toContain('URL');
        expect(types).toContain('Duration');
        expect(types).toContain('Integer');
        expect(types).toContain('Float');
    });
});

describe('TypeChecker - Zod Integration', () => {
    it('should validate Date type in attributes', async () => {
        const text = `machine "Test"
            task myTask {
                start<Date>: "1985-10-24T00:00:00Z";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no type errors
        expect(errors).toHaveLength(0);
    });

    it('should reject invalid Date format', async () => {
        const text = `machine "Test"
            task myTask {
                start<Date>: "1985-10-24";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have a type error about invalid date format
        const typeErrors = errors.filter(e =>
            e.message.includes('ISO 8601') || e.message.includes('Type mismatch')
        );
        expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should validate UUID type in attributes', async () => {
        const text = `machine "Test"
            task myTask {
                id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no type errors
        expect(errors).toHaveLength(0);
    });

    it('should reject invalid UUID format', async () => {
        const text = `machine "Test"
            task myTask {
                id<UUID>: "not-a-uuid";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have a type error about invalid UUID
        const typeErrors = errors.filter(e =>
            e.message.includes('UUID') || e.message.includes('Type mismatch')
        );
        expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should validate URL type in attributes', async () => {
        const text = `machine "Test"
            task myTask {
                endpoint<URL>: "https://api.example.com";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no type errors
        expect(errors).toHaveLength(0);
    });

    it('should reject invalid URL format', async () => {
        const text = `machine "Test"
            task myTask {
                endpoint<URL>: "not a url";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have a type error about invalid URL
        const typeErrors = errors.filter(e =>
            e.message.includes('URL') || e.message.includes('Type mismatch')
        );
        expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should validate Duration type in attributes', async () => {
        const text = `machine "Test"
            task myTask {
                timeout<Duration>: "PT1H30M";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no type errors
        expect(errors).toHaveLength(0);
    });

    it('should validate Integer type in attributes', async () => {
        const text = `machine "Test"
            task myTask {
                count<Integer>: 42;
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no type errors
        expect(errors).toHaveLength(0);
    });

    it('should reject Float value for Integer type', async () => {
        const text = `machine "Test"
            task myTask {
                count<Integer>: 3.14;
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have a type error about non-integer
        const typeErrors = errors.filter(e =>
            e.message.includes('integer') || e.message.includes('Type mismatch')
        );
        expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should validate Float type in attributes', async () => {
        const text = `machine "Test"
            task myTask {
                price<Float>: 19.99;
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no type errors
        expect(errors).toHaveLength(0);
    });
});

describe('TypeChecker - Custom Type Registration', () => {
    it('should support custom types via TypeRegistry', async () => {
        const text = `machine "Test"
            task myTask {
                name<string>: "test";
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const typeChecker = new TypeChecker(machine);
        const registry = typeChecker.getTypeRegistry();

        // Register a custom Email type
        const Email = z.string().email();
        registry.register('Email', Email);

        // Verify registration
        expect(registry.has('Email')).toBe(true);
        expect(registry.validate('Email', 'user@example.com').valid).toBe(true);
        expect(registry.validate('Email', 'invalid').valid).toBe(false);
    });
});

describe('TypeChecker - Backward Compatibility', () => {
    it('should still work with basic string types', async () => {
        const text = `machine "Test"
            task myTask {
                name<string>: "test";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        expect(errors).toHaveLength(0);
    });

    it('should still work with basic number types', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>: 42;
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        expect(errors).toHaveLength(0);
    });

    it('should still work with basic boolean types', async () => {
        const text = `machine "Test"
            task myTask {
                active<boolean>: true;
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        expect(errors).toHaveLength(0);
    });

    it('should still detect basic type mismatches', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>: "not a number";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        const typeErrors = errors.filter(e =>
            e.message.includes('Type mismatch') || e.message.includes('expected')
        );
        expect(typeErrors.length).toBeGreaterThan(0);
    });
});
