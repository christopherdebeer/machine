import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { TypeChecker } from '../../src/language/type-checker.js';

/**
 * Tests for Validation.13: Type Checking System
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Type Parsing', () => {
    it('should parse simple types', () => {
        const text = `machine "Test"
            task myTask {
                name<string>: "test";
            }`;

        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const stringType = typeChecker.parseType('string');
        expect(stringType.baseType).toBe('string');
        expect(stringType.genericParams).toBeUndefined();

        const numberType = typeChecker.parseType('number');
        expect(numberType.baseType).toBe('number');
    });

    it('should parse generic types', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const promiseType = typeChecker.parseType('Promise<Response>');
        expect(promiseType.baseType).toBe('Promise');
        expect(promiseType.genericParams).toEqual(['Response']);

        const arrayType = typeChecker.parseType('Array<string>');
        expect(arrayType.baseType).toBe('Array');
        expect(arrayType.genericParams).toEqual(['string']);
    });

    it('should parse nested generic types', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const nestedType = typeChecker.parseType('Promise<Array<Record>>');
        expect(nestedType.baseType).toBe('Promise');
        expect(nestedType.genericParams).toEqual(['Array<Record>']);
    });

    it('should parse optional types', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const optionalType = typeChecker.parseType('string?');
        expect(optionalType.baseType).toBe('string');
        expect(optionalType.isOptional).toBe(true);
    });

    it('should parse multiple generic parameters', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const mapType = typeChecker.parseType('Map<string, number>');
        expect(mapType.baseType).toBe('Map');
        expect(mapType.genericParams).toEqual(['string', 'number']);
    });
});

describe('Type Inference', () => {
    it('should infer string type', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const value = { value: 'test' };
        const inferredType = typeChecker.inferType(value as any);
        expect(inferredType).toBe('string');
    });

    it('should infer number type', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const value = { value: 42 };
        const inferredType = typeChecker.inferType(value as any);
        expect(inferredType).toBe('number');
    });

    it('should infer boolean type', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const value = { value: true };
        const inferredType = typeChecker.inferType(value as any);
        expect(inferredType).toBe('boolean');
    });

    it('should infer array type', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const value = { value: ['a', 'b', 'c'] };
        const inferredType = typeChecker.inferType(value as any);
        expect(inferredType).toBe('Array<string>');
    });

    it('should reject empty arrays without explicit type annotation', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const value = { value: [] };
        expect(() => typeChecker.inferType(value as any)).toThrow('Unable to infer type for empty array');
    });
});

describe('Type Compatibility', () => {
    it('should accept matching types', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result = typeChecker.areTypesCompatible('string', 'string');
        expect(result.valid).toBe(true);
    });

    it('should accept any type', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result1 = typeChecker.areTypesCompatible('any', 'string');
        expect(result1.valid).toBe(true);

        const result2 = typeChecker.areTypesCompatible('string', 'any');
        expect(result2.valid).toBe(true);
    });

    it('should reject mismatched types', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result = typeChecker.areTypesCompatible('number', 'string');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('Type mismatch');
    });

    it('should validate generic parameters', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result1 = typeChecker.areTypesCompatible('Array<string>', 'Array<string>');
        expect(result1.valid).toBe(true);

        const result2 = typeChecker.areTypesCompatible('Array<string>', 'Array<number>');
        expect(result2.valid).toBe(false);
    });

    it('should validate nested generics', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result = typeChecker.areTypesCompatible(
            'Promise<Array<string>>',
            'Promise<Array<string>>'
        );
        expect(result.valid).toBe(true);
    });
});

describe('Generic Type Validation', () => {
    it('should accept valid generic syntax', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result = typeChecker.validateGenericType('Promise<Response>');
        expect(result.valid).toBe(true);
    });

    it('should detect unbalanced brackets', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result = typeChecker.validateGenericType('Promise<Response');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('Unbalanced');
    });

    it('should validate nested generics', () => {
        const machine = { nodes: [], edges: [] } as any;
        const typeChecker = new TypeChecker(machine);

        const result = typeChecker.validateGenericType('Promise<Array<Record>>');
        expect(result.valid).toBe(true);
    });
});

describe('Type Checking Integration', () => {
    it('should validate correct types', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>: 42;
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no type errors
        const typeErrors = errors.filter(e => e.message.includes('Type mismatch'));
        expect(typeErrors).toHaveLength(0);
    });

    it('should detect type mismatches', async () => {
        const text = `machine "Test"
            task myTask {
                count<number>: "not a number";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have a type error
        const typeErrors = errors.filter(e =>
            e.message.includes('Type mismatch') || e.message.includes('expected')
        );
        expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should validate generic types in attributes', async () => {
        const text = `machine "Test"
            task myTask {
                response<Promise<Response>>: "pending";
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no generic type errors
        const genericErrors = errors.filter(e => e.message.includes('generic') || e.message.includes('brackets'));
        expect(genericErrors).toHaveLength(0);
    });
});

describe('Template Reference Validation', () => {
    it('should validate valid template references', async () => {
        const text = `machine "Test"
            context config {
                url<string>: "https://api.example.com";
            }

            task myTask {
                endpoint<string>: "{{ config.url }}";
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const typeChecker = new TypeChecker(machine);
        const result = typeChecker.validateTemplateReference('config.url');

        expect(result.valid).toBe(true);
    });

    it('should detect undefined node references', async () => {
        const text = `machine "Test"
            task myTask {
                endpoint<string>: "test";
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const typeChecker = new TypeChecker(machine);
        const result = typeChecker.validateTemplateReference('nonexistent.attr');

        expect(result.valid).toBe(false);
        expect(result.message).toContain('undefined');
    });

    it('should detect undefined attribute references', async () => {
        const text = `machine "Test"
            context config {
                url<string>: "https://api.example.com";
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const typeChecker = new TypeChecker(machine);
        const result = typeChecker.validateTemplateReference('config.nonexistent');

        expect(result.valid).toBe(false);
        expect(result.message).toContain('no attribute');
    });
});
