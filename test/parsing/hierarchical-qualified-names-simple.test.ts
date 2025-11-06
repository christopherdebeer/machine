import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine, isMachine } from '../../src/language/generated/ast.js';

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

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

describe('Hierarchical Qualified Names - Simple Tests', () => {
    test('Basic expansion: person grandparent.parent.child', async () => {
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

        // Should create: grandparent { parent { child; } }
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

    test('Merge: A.B.C + A.B.D', async () => {
        const document = await parse(`
            machine "Test"
            task A.B.C;
            task A.B.D;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;

        // Should create: A { B { C; D; } }
        expect(machine.nodes).toHaveLength(1);

        const a = machine.nodes[0];
        expect(a.name).toBe('A');
        expect(a.nodes).toHaveLength(1);

        const b = a.nodes[0];
        expect(b.name).toBe('B');
        expect(b.nodes).toHaveLength(2);

        const c = b.nodes.find(n => n.name === 'C');
        expect(c).toBeDefined();
        expect(c?.type).toBe('task');

        const d = b.nodes.find(n => n.name === 'D');
        expect(d).toBeDefined();
        expect(d?.type).toBe('task');
    });

    test('Nested context: Group { A.B.C; }', async () => {
        const document = await parse(`
            machine "Test"
            Group {
                task A.B.C;
            }
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;

        expect(machine.nodes).toHaveLength(1);

        const group = machine.nodes[0];
        expect(group.name).toBe('Group');
        expect(group.nodes).toHaveLength(1);

        const a = group.nodes[0];
        expect(a.name).toBe('A');
        expect(a.nodes).toHaveLength(1);

        const b = a.nodes[0];
        expect(b.name).toBe('B');
        expect(b.nodes).toHaveLength(1);

        const c = b.nodes[0];
        expect(c.name).toBe('C');
        expect(c.type).toBe('task');
    });

    test('Explicit intermediate node', async () => {
        const document = await parse(`
            machine "Test"
            group A { priority: 1; };
            task A.B;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;

        expect(machine.nodes).toHaveLength(1);

        const a = machine.nodes[0];
        expect(a.name).toBe('A');
        expect(a.type).toBe('group');
        expect(a.attributes).toHaveLength(1);
        expect(a.attributes[0].name).toBe('priority');
        expect(a.nodes).toHaveLength(1);

        const b = a.nodes[0];
        expect(b.name).toBe('B');
        expect(b.type).toBe('task');
    });

    test('Edge references work with expanded nodes', async () => {
        const document = await parse(`
            machine "Test"
            person A.B.C;
            Start -> C;
            C -> End;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;

        // Verify structure created
        expect(machine.nodes.length).toBeGreaterThanOrEqual(1);

        const a = machine.nodes.find(n => n.name === 'A');
        expect(a).toBeDefined();

        // Verify edges exist
        expect(machine.edges).toHaveLength(2);
    });
});
