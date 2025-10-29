import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine, isMachine } from "../../src/language/generated/ast.js";

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;
let document: LangiumDocument<Machine> | undefined;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

describe('Qualified Names', () => {
    test('parse machine with simple names (backward compatibility)', async () => {
        document = await parse(`
            machine "Test Machine"

            Parent {
                Child1;
                Child2;
            }

            Child1 -> Child2;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(1);

        const edge = machine.edges[0];
        expect(edge.source[0].ref?.name).toBe('Child1');
        expect(edge.segments[0].target[0].ref?.name).toBe('Child2');
    });

    test('parse machine with qualified names', async () => {
        document = await parse(`
            machine "Test Machine"

            Parent {
                Child1;
                Child2;
            }

            Start;

            Start -> Parent.Child1;
            Parent.Child1 -> Parent.Child2;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(2);

        // First edge: Start -> Parent.Child1
        const edge1 = machine.edges[0];
        expect(edge1.source[0].ref?.name).toBe('Start');
        expect(edge1.segments[0].target[0].ref?.name).toBe('Child1');

        // Second edge: Parent.Child1 -> Parent.Child2
        const edge2 = machine.edges[1];
        expect(edge2.source[0].ref?.name).toBe('Child1');
        expect(edge2.segments[0].target[0].ref?.name).toBe('Child2');
    });

    test('parse machine with deeply nested qualified names', async () => {
        document = await parse(`
            machine "Deep Nesting Test"

            Level1 {
                Level2 {
                    Level3 {
                        DeepNode;
                    }
                }
            }

            Start;
            End;

            Start -> Level1.Level2.Level3.DeepNode;
            Level1.Level2.Level3.DeepNode -> End;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(2);

        const edge1 = machine.edges[0];
        expect(edge1.source[0].ref?.name).toBe('Start');
        expect(edge1.segments[0].target[0].ref?.name).toBe('DeepNode');

        const edge2 = machine.edges[1];
        expect(edge2.source[0].ref?.name).toBe('DeepNode');
        expect(edge2.segments[0].target[0].ref?.name).toBe('End');
    });

    test('parse machine with mixed simple and qualified names', async () => {
        document = await parse(`
            machine "Mixed Names Test"

            Pipeline {
                Task1;
                Task2;
            }

            Start;
            End;

            Start -> Task1;
            Task1 -> Pipeline.Task2;
            Pipeline.Task2 -> End;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(3);
    });

    test('parse machine with qualified names in notes', async () => {
        document = await parse(`
            machine "Notes Test"

            Group {
                Node1;
            }

            note Group.Node1 "This is a note a nested node"
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        // Notes are nodes with type='note' and qualified names are supported for node names
        const noteNodes = machine.nodes.filter(n => n.type?.toLowerCase() === 'note');
        expect(noteNodes).toHaveLength(1);
        expect(noteNodes[0].name).toBe('Group.Node1');
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    if (document.parseResult.parserErrors.length > 0) {
        return s`
            Parser errors:
              ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
        `;
    }
    if (document.parseResult.value === undefined) {
        return `ParseResult is 'undefined'.`;
    }
    if (!isMachine(document.parseResult.value)) {
        return `Root AST object is a ${document.parseResult.value.$type}, expected a 'Machine'.`;
    }
    return undefined;
}
