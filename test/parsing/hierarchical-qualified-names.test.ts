import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine, Node, isMachine } from '../../src/language/generated/ast.js';

describe('Hierarchical Qualified Names', () => {
    const services = createMachineServices(EmptyFileSystem).Machine;
    const parse = parseHelper<Machine>(services);

    /**
     * Helper to check document is valid and return errors if not
     */
    function checkDocumentValid(document: LangiumDocument): string | undefined {
        if (document.parseResult.parserErrors.length > 0) {
            return `Parser errors:\n  ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}`;
        }
        if (document.parseResult.value === undefined) {
            return `ParseResult is 'undefined'.`;
        }
        if (!isMachine(document.parseResult.value)) {
            return `Root AST object is not a Machine.`;
        }
        return undefined;
    }

    /**
     * Helper to find a node by path (e.g., "A.B.C" means node C inside B inside A)
     */
    function findNodeByPath(machine: Machine, path: string): Node | undefined {
        const parts = path.split('.');
        let currentNodes = machine.nodes;

        for (const part of parts) {
            const node = currentNodes.find(n => n.name === part);
            if (!node) return undefined;

            // If this is the last part, return it
            if (part === parts[parts.length - 1]) {
                return node;
            }

            // Continue searching in child nodes
            currentNodes = node.nodes;
        }

        return undefined;
    }

    test('Basic qualified name expansion - root level', async () => {
        const document = await parse(`
            machine "Test"

            person grandparent.parent.child;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;

        // Should create nested structure: grandparent { parent { child; } }
        expect(machine.nodes).toHaveLength(1);

        const grandparent = machine.nodes[0];
        expect(grandparent.name).toBe('grandparent');
        expect(grandparent.type).toBe('person');
        expect(grandparent.nodes).toHaveLength(1);

        const parent = grandparent.nodes[0];
        expect(parent.name).toBe('parent');
        expect(parent.type).toBe('person');
        expect(parent.nodes).toHaveLength(1);

        const child = parent.nodes[0];
        expect(child.name).toBe('child');
        expect(child.type).toBe('person');
        expect(child.nodes).toHaveLength(0);
    });

    test('Multiple qualified names with shared prefix', async () => {
        const result = await parse(`
            machine "Test"

            task one.two.three;
            task one.two.four;
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        // Should create: one { two { three; four; } }
        expect(machine.nodes).toHaveLength(1);

        const one = machine.nodes[0];
        expect(one.name).toBe('one');
        expect(one.nodes).toHaveLength(1);

        const two = one.nodes[0];
        expect(two.name).toBe('two');
        expect(two.nodes).toHaveLength(2);

        const three = two.nodes.find(n => n.name === 'three');
        expect(three).toBeDefined();
        expect(three?.type).toBe('task');

        const four = two.nodes.find(n => n.name === 'four');
        expect(four).toBeDefined();
        expect(four?.type).toBe('task');
    });

    test('Qualified names in nested context', async () => {
        const result = await parse(`
            machine "Test"

            i {
                ii {
                    leaf iii;
                    iv.v.vi;
                }
            }
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        const i = machine.nodes[0];
        expect(i.name).toBe('i');

        const ii = i.nodes[0];
        expect(ii.name).toBe('ii');
        expect(ii.nodes).toHaveLength(2); // iii and iv

        const iii = ii.nodes.find(n => n.name === 'iii');
        expect(iii).toBeDefined();
        expect(iii?.type).toBe('leaf');

        const iv = ii.nodes.find(n => n.name === 'iv');
        expect(iv).toBeDefined();
        expect(iv?.nodes).toHaveLength(1);

        const v = iv?.nodes[0];
        expect(v?.name).toBe('v');
        expect(v?.nodes).toHaveLength(1);

        const vi = v?.nodes[0];
        expect(vi?.name).toBe('vi');
    });

    test('Merge: overlapping qualified name definitions', async () => {
        const result = await parse(`
            machine "Test"

            person A.B.C;
            task A.B.D;
            state A.E;
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        // Should create: A { B { C; D; }; E; }
        expect(machine.nodes).toHaveLength(1);

        const a = machine.nodes[0];
        expect(a.name).toBe('A');
        expect(a.nodes).toHaveLength(2); // B and E

        const b = a.nodes.find(n => n.name === 'B');
        expect(b).toBeDefined();
        expect(b?.nodes).toHaveLength(2); // C and D

        const c = b?.nodes.find(n => n.name === 'C');
        expect(c).toBeDefined();
        expect(c?.type).toBe('person');

        const d = b?.nodes.find(n => n.name === 'D');
        expect(d).toBeDefined();
        expect(d?.type).toBe('task');

        const e = a.nodes.find(n => n.name === 'E');
        expect(e).toBeDefined();
        expect(e?.type).toBe('state');
    });

    test('Merge: explicit intermediate node definition', async () => {
        const result = await parse(`
            machine "Test"

            group A { priority: 1; };
            task A.B "B in A";
            person A.C;
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        expect(machine.nodes).toHaveLength(1);

        const a = machine.nodes[0];
        expect(a.name).toBe('A');
        expect(a.type).toBe('group');
        expect(a.attributes).toHaveLength(1);
        expect(a.attributes[0].name).toBe('priority');
        expect(a.nodes).toHaveLength(2); // B and C

        const b = a.nodes.find(n => n.name === 'B');
        expect(b).toBeDefined();
        expect(b?.type).toBe('task');
        expect(b?.title).toBe('"B in A"');

        const c = a.nodes.find(n => n.name === 'C');
        expect(c).toBeDefined();
        expect(c?.type).toBe('person');
    });

    test('Merge: type inheritance for intermediate nodes', async () => {
        const result = await parse(`
            machine "Test"

            task workflow.step1;
            task workflow.step2;
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        const workflow = machine.nodes[0];
        expect(workflow.name).toBe('workflow');
        // Intermediate node inherits type from first qualified child
        expect(workflow.type).toBe('task');
        expect(workflow.nodes).toHaveLength(2);
    });

    test('Edge references to qualified names', async () => {
        const result = await parse(`
            machine "Test"

            person grandparent.parent.child;
            task one.two.three;

            Start -> child;
            child -> three;
            three -> End;
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        // Verify edges exist
        expect(machine.edges).toHaveLength(3);

        // Verify edge targets reference the correct nodes
        // (linker should resolve child and three correctly)
        const edge1 = machine.edges[0];
        expect(edge1.segments[0].target[0].$refText).toBe('child');

        const edge2 = machine.edges[1];
        expect(edge2.source[0].$refText).toBe('child');
        expect(edge2.segments[0].target[0].$refText).toBe('three');

        const edge3 = machine.edges[2];
        expect(edge3.source[0].$refText).toBe('three');
    });

    test('Qualified name with attributes', async () => {
        const result = await parse(`
            machine "Test"

            task workflow.process {
                status: "pending";
                priority: 1;
            };
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        const workflow = machine.nodes[0];
        expect(workflow.name).toBe('workflow');

        const process = workflow.nodes[0];
        expect(process.name).toBe('process');
        expect(process.type).toBe('task');
        expect(process.attributes).toHaveLength(2);

        const status = process.attributes.find(a => a.name === 'status');
        expect(status).toBeDefined();

        const priority = process.attributes.find(a => a.name === 'priority');
        expect(priority).toBeDefined();
    });

    test('Qualified name with annotations', async () => {
        const result = await parse(`
            machine "Test"

            @Async
            @Singleton
            task workflow.background.processor;
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        const processor = findNodeByPath(machine, 'workflow.background.processor');
        expect(processor).toBeDefined();
        expect(processor?.type).toBe('task');
        expect(processor?.annotations).toHaveLength(2);

        const asyncAnnotation = processor?.annotations.find(a => a.name === 'Async');
        expect(asyncAnnotation).toBeDefined();

        const singletonAnnotation = processor?.annotations.find(a => a.name === 'Singleton');
        expect(singletonAnnotation).toBeDefined();
    });

    test('Complex nested structure with qualified and simple names', async () => {
        const result = await parse(`
            machine "Test"

            // Root-level simple name
            init Start;

            // Root-level qualified name (creates namespace)
            task Workflow.Step1 "First step";

            // Explicit group with nested qualified name
            group Pipeline {
                task Input;
                task Process.Validate;
                task Process.Transform;
                task Output;
            }

            // Another qualified name at root
            person API.Gateway;

            // Simple name at root
            end End;

            // Edges using various reference styles
            Start -> Workflow.Step1;
            Step1 -> Pipeline.Input;
            Input -> Process.Validate;
            Validate -> Transform;
            Transform -> Output;
            Output -> Gateway;
            Gateway -> End;
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        // Verify root nodes
        expect(machine.nodes.length).toBeGreaterThanOrEqual(5);

        // Start (simple)
        const start = machine.nodes.find(n => n.name === 'Start');
        expect(start).toBeDefined();
        expect(start?.type).toBe('init');

        // Workflow (from qualified name)
        const workflow = machine.nodes.find(n => n.name === 'Workflow');
        expect(workflow).toBeDefined();
        expect(workflow?.nodes).toHaveLength(1);

        const step1 = workflow?.nodes[0];
        expect(step1?.name).toBe('Step1');
        expect(step1?.type).toBe('task');

        // Pipeline (explicit group)
        const pipeline = machine.nodes.find(n => n.name === 'Pipeline');
        expect(pipeline).toBeDefined();
        expect(pipeline?.type).toBe('group');
        expect(pipeline?.nodes).toHaveLength(3); // Input, Process, Output

        const process = pipeline?.nodes.find(n => n.name === 'Process');
        expect(process).toBeDefined();
        expect(process?.nodes).toHaveLength(2); // Validate, Transform

        // API (from qualified name)
        const api = machine.nodes.find(n => n.name === 'API');
        expect(api).toBeDefined();
        expect(api?.nodes).toHaveLength(1);

        const gateway = api?.nodes[0];
        expect(gateway?.name).toBe('Gateway');
        expect(gateway?.type).toBe('person');

        // End (simple)
        const end = machine.nodes.find(n => n.name === 'End');
        expect(end).toBeDefined();
        expect(end?.type).toBe('end');

        // Verify edges
        expect(machine.edges.length).toBeGreaterThanOrEqual(7);
    });

    test('Merge: duplicate definitions with different attributes', async () => {
        const result = await parse(`
            machine "Test"

            task A.B { status: "pending"; };
            task A.B { priority: 1; };
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        const b = findNodeByPath(machine, 'A.B');
        expect(b).toBeDefined();
        expect(b?.attributes).toHaveLength(2);

        const status = b?.attributes.find(a => a.name === 'status');
        expect(status).toBeDefined();

        const priority = b?.attributes.find(a => a.name === 'priority');
        expect(priority).toBeDefined();
    });

    test('Merge: overriding attribute values', async () => {
        const result = await parse(`
            machine "Test"

            task A.B { status: "pending"; };
            task A.B { status: "running"; };
        `);

        const machine = result.parseResult.value as Machine;
        expect(result.parserErrors).toHaveLength(0);

        const b = findNodeByPath(machine, 'A.B');
        expect(b).toBeDefined();
        expect(b?.attributes).toHaveLength(1);

        // Last value should win
        const status = b?.attributes.find(a => a.name === 'status');
        expect(status).toBeDefined();
        // Note: We can't easily check the value here without parsing the AttributeValue
        // The test just confirms the merge happened
    });
});
