import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { TypeChecker } from '../../src/language/type-checker.js';

/**
 * Tests for nodes as types feature (Issue #310)
 * Tests Option B: Any node can be used as a type
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Node Types - Basic Functionality', () => {
    it('should allow any node to be used as a type', async () => {
        const text = `machine "Test"
            Type Foo {
                id<string>;
                status<string>;
            }

            Task process {
                item<Foo>: { id: "123"; status: "active"; };
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no errors
        expect(errors).toHaveLength(0);
    });

    it('should validate node structure matches node type', async () => {
        const text = `machine "Test"
            Type Foo {
                id<string>;
                name<string>;
            }

            Task process {
                item<Foo>: { id: "123"; name: "test"; };
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        // Verify Foo is registered as a type
        expect(typeChecker.isNodeType('Foo')).toBe(true);
    });

    it('should allow regular nodes to be used as types (not just Type keyword)', async () => {
        const text = `machine "Test"
            Context User {
                name<string>;
                email<string>;
            }

            Task process {
                currentUser<User>: { name: "John"; email: "john@example.com"; };
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        // Verify User is registered as a type
        expect(typeChecker.isNodeType('User')).toBe(true);
    });
});

describe('Union Types - Literal Types', () => {
    it('should support union types with string literals', async () => {
        const text = `machine "Test"
            Type Foo {
                status<'idle' | 'in_progress' | 'complete'>;
            }

            Task process {
                item<Foo>: { status: "idle"; };
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should parse without errors
        expect(errors).toHaveLength(0);
    });

    it('should validate values against union types', async () => {
        const text = `machine "Test"
            Task process {
                status<'idle' | 'running' | 'done'>: "idle";
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        const task = machine.nodes.find(n => n.name === 'process');
        expect(task).toBeDefined();

        const statusAttr = task?.attributes.find(a => a.name === 'status');
        expect(statusAttr).toBeDefined();

        if (statusAttr) {
            const result = typeChecker.validateAttributeType(statusAttr);
            expect(result.valid).toBe(true);
        }
    });

    it('should reject invalid union type values', async () => {
        const text = `machine "Test"
            Task process {
                status<'idle' | 'running' | 'done'>: "invalid";
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        const task = machine.nodes.find(n => n.name === 'process');
        const statusAttr = task?.attributes.find(a => a.name === 'status');

        if (statusAttr) {
            const result = typeChecker.validateAttributeType(statusAttr);
            expect(result.valid).toBe(false);
            expect(result.message).toContain('does not match any of the allowed literals');
        }
    });
});

describe('Generic Types with Node Types', () => {
    it('should support Array<NodeType>', async () => {
        const text = `machine "Test"
            Type Item {
                id<string>;
                value<number>;
            }

            Task process {
                items<Array<Item>>: [];
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should parse without errors
        expect(errors).toHaveLength(0);
    });

    it('should validate array elements against node type', async () => {
        const text = `machine "Test"
            Type Item {
                id<string>;
            }

            Task process {
                items<Array<Item>>: [
                    { id: "1"; },
                    { id: "2"; }
                ];
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        // Verify Item is registered
        expect(typeChecker.isNodeType('Item')).toBe(true);
    });
});

describe('Nested Node Types', () => {
    it('should support nested node types', async () => {
        const text = `machine "Test"
            Type Address {
                street<string>;
                city<string>;
            }

            Type User {
                name<string>;
                address<Address>;
            }

            Task process {
                user<User>: {
                    name: "John";
                    address: {
                        street: "123 Main St";
                        city: "Springfield";
                    };
                };
            }`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should parse without errors
        expect(errors).toHaveLength(0);
    });
});

describe('Qualified Node Names as Types', () => {
    it('should support qualified names in type references', async () => {
        const text = `machine "Test"
            Context parent {
                child {
                    value<string>;
                }
            }

            Task process {
                data<parent.child>: { value: "test"; };
            }`;

        const document = await parse(text);

        // Grammar should parse this - validation might be separate
        expect(document.parseResult.parserErrors).toHaveLength(0);
    });
});

describe('Complex Example from Issue', () => {
    it('should handle the example from issue #310', async () => {
        const text = `machine "Nodes as type and value?"

            Type Foo {
                id<string>;
                status<'idle' | 'in_progress' | 'complete'>;
                result<any>;
            }

            Task process "A task using a custom type as an attribute" {
                item<Foo>;
                other<Array<Foo>>: [];
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        // Should parse successfully
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const typeChecker = new TypeChecker(machine);

        // Verify Foo is registered as a type
        expect(typeChecker.isNodeType('Foo')).toBe(true);

        // Verify the process task has the correct attributes
        const processTask = machine.nodes.find(n => n.name === 'process');
        expect(processTask).toBeDefined();
        expect(processTask?.attributes).toHaveLength(2);

        const itemAttr = processTask?.attributes.find(a => a.name === 'item');
        expect(itemAttr).toBeDefined();
        expect(itemAttr?.type).toBeDefined();

        const otherAttr = processTask?.attributes.find(a => a.name === 'other');
        expect(otherAttr).toBeDefined();
        expect(otherAttr?.type).toBeDefined();
    });
});

describe('Type Registry - Node Type Registration', () => {
    it('should register all nodes as types in type registry', async () => {
        const text = `machine "Test"
            Type Foo {
                id<string>;
            }

            Context Bar {
                name<string>;
            }

            Task Baz {
                value<number>;
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        // All nodes should be registered as types
        expect(typeChecker.isNodeType('Foo')).toBe(true);
        expect(typeChecker.isNodeType('Bar')).toBe(true);
        expect(typeChecker.isNodeType('Baz')).toBe(true);
    });

    it('should get type registry from type checker', async () => {
        const text = `machine "Test"
            Type Foo {
                id<string>;
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);
        const typeRegistry = typeChecker.getTypeRegistry();

        // Type registry should exist
        expect(typeRegistry).toBeDefined();

        // Should have Foo registered
        expect(typeRegistry.has('Foo')).toBe(true);
    });
});
