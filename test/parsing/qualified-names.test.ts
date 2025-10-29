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

    test('qualified name collision handling - explicit qualified child', async () => {
        document = await parse(`
            machine "Collision Test"

            Group {
                task Child "Simple child";
                note Group.Child "Explicit qualified child";
            }

            Start;
            End;

            Start -> Child;
            Child -> Group.Child;
            Group.Child -> End;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(3);

        // Edge 1: Start -> Child (should resolve to simple child)
        const edge1 = machine.edges[0];
        expect(edge1.source[0].ref?.name).toBe('Start');
        expect(edge1.segments[0].target[0].ref?.name).toBe('Child');

        // Edge 2: Child -> Group.Child (simple to explicit qualified)
        const edge2 = machine.edges[1];
        expect(edge2.source[0].ref?.name).toBe('Child');
        expect(edge2.segments[0].target[0].ref?.name).toBe('Group.Child');

        // Edge 3: Group.Child -> End (explicit qualified to end)
        const edge3 = machine.edges[2];
        expect(edge3.source[0].ref?.name).toBe('Group.Child');
        expect(edge3.segments[0].target[0].ref?.name).toBe('End');
    });

    test('root-level qualified name node', async () => {
        document = await parse(`
            machine "Root Qualified Test"

            note Namespace.Item "Creating a node with qualified name at root level";
            Start;

            Start -> Namespace.Item;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(1);

        const edge = machine.edges[0];
        expect(edge.source[0].ref?.name).toBe('Start');
        // Should resolve to the note with name "Namespace.Item"
        expect(edge.segments[0].target[0].ref?.name).toBe('Namespace.Item');
    });

    test('partial path qualification in nested context', async () => {
        document = await parse(`
            machine "Partial Path Test"

            Outer {
                Middle {
                    Inner {
                        task DeepTask "Deeply nested task";
                    }
                }
            }

            Start;

            // Reference with full path
            Start -> Outer.Middle.Inner.DeepTask;

            // Reference with partial paths should also work
            Outer.Middle.Inner.DeepTask -> Start;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(2);
    });

    test('nested qualified name with matching parent', async () => {
        document = await parse(`
            machine "Matching Parent Test"

            Pipeline {
                task Pipeline.Step1 "Explicit qualified matches parent";
                task Step2 "Simple name";
            }

            Start;

            Start -> Pipeline.Step1;
            Pipeline.Step1 -> Step2;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(2);

        const edge1 = machine.edges[0];
        expect(edge1.segments[0].target[0].ref?.name).toBe('Pipeline.Step1');

        const edge2 = machine.edges[1];
        expect(edge2.source[0].ref?.name).toBe('Pipeline.Step1');
        expect(edge2.segments[0].target[0].ref?.name).toBe('Step2');
    });

    test('simple name reference priority within nested context', async () => {
        document = await parse(`
            machine "Local Priority Test"

            Group1 {
                task Task "Task in Group1";
            }

            Group2 {
                task Task "Task in Group2";
                note LocalNote "Local to Group2";
            }

            // Qualified references should be unambiguous
            Group1.Task -> Group2.Task;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(1);

        const edge = machine.edges[0];
        expect(edge.source[0].ref?.name).toBe('Task');
        expect(edge.segments[0].target[0].ref?.name).toBe('Task');

        // Both should resolve (even though they have the same simple name)
        // The qualified names make them unambiguous
        expect(edge.source[0].ref).toBeDefined();
        expect(edge.segments[0].target[0].ref).toBeDefined();
    });

    test('qualified names with edge attributes', async () => {
        document = await parse(`
            machine "Qualified Names with Edge Attributes"

            Group {
                task Child1 "First child";
                task Child2 "Second child";
            }

            Start;
            End;

            // Qualified names in source/target with edge attributes
            Start -priority: 1;-> Group.Child1;
            Group.Child1 -weight: 0.8; condition: "ready";-> Group.Child2;
            Group.Child2 -timeout: 5000;-> End;

            // Edge attributes with values that look like qualified names
            Start -to: "Group.Child1";-> End;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(4);

        // Verify qualified name references work with edge attributes
        const edge1 = machine.edges[0];
        expect(edge1.source[0].ref?.name).toBe('Start');
        expect(edge1.segments[0].target[0].ref?.name).toBe('Child1');

        const edge2 = machine.edges[1];
        expect(edge2.source[0].ref?.name).toBe('Child1');
        expect(edge2.segments[0].target[0].ref?.name).toBe('Child2');

        const edge3 = machine.edges[2];
        expect(edge3.source[0].ref?.name).toBe('Child2');
        expect(edge3.segments[0].target[0].ref?.name).toBe('End');

        const edge4 = machine.edges[3];
        expect(edge4.source[0].ref?.name).toBe('Start');
        expect(edge4.segments[0].target[0].ref?.name).toBe('End');
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
