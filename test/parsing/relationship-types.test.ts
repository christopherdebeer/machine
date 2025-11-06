import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine, isMachine } from "../../src/language/generated/ast.js";

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length > 0
        ? document.parseResult.parserErrors.map(e => e.message).join('\n')
        : undefined;
}

describe('Relationship type arrow tests', () => {
    test('parse machine with inheritance arrow <|--', async () => {
        const document = await parse(`
            machine "Inheritance Test"
            Parent;
            Child;
            Parent <|-- Child;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const machine = document.parseResult.value;
        expect(machine.edges.length).toBe(1);
        expect(machine.edges[0].segments[0].endType).toBe('<|--');
    });

    test('parse machine with composition arrow *-->', async () => {
        const document = await parse(`
            machine "Composition Test"
            Container;
            Component;
            Container *--> Component;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const machine = document.parseResult.value;
        expect(machine.edges.length).toBe(1);
        expect(machine.edges[0].segments[0].endType).toBe('*-->');
    });

    test('parse machine with aggregation arrow o-->', async () => {
        const document = await parse(`
            machine "Aggregation Test"
            Aggregate;
            Part;
            Aggregate o--> Part;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const machine = document.parseResult.value;
        expect(machine.edges.length).toBe(1);
        expect(machine.edges[0].segments[0].endType).toBe('o-->');
    });

    test('parse machine with mixed relationship types', async () => {
        const document = await parse(`
            machine "Mixed Relationships"
            Base;
            Derived;
            Container;
            Part;
            Client;
            Service;

            Base <|-- Derived;
            Container *--> Part;
            Client --> Service;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const machine = document.parseResult.value;
        expect(machine.edges.length).toBe(3);
        expect(machine.edges[0].segments[0].endType).toBe('<|--');
        expect(machine.edges[1].segments[0].endType).toBe('*-->');
        expect(machine.edges[2].segments[0].endType).toBe('-->');
    });

    test('parse complex relationships with labels', async () => {
        const document = await parse(`
            machine "Complex Relationships"
            DataProcessor;
            Validator;
            Storage;

            DataProcessor *--> Validator;
            DataProcessor o--> Storage;
            DataProcessor <--> Storage;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const machine = document.parseResult.value;
        expect(machine.edges.length).toBe(3);
    });
});

describe('Node label tests', () => {
    test('parse node with title label', async () => {
        const document = await parse(`
            machine "Label Test"
            task processData "Process User Data";
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const machine = document.parseResult.value;
        expect(machine.nodes.length).toBe(1);
        expect(machine.nodes[0].name).toBe('processData');
        expect(machine.nodes[0].title).toBe('Process User Data');
    });

    test('parse multiple nodes with labels', async () => {
        const document = await parse(`
            machine "Multiple Labels"
            task start "Start Process";
            task middle "Middle Process";
            task end "End Process";

            start -> middle;
            middle -> end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const machine = document.parseResult.value;
        expect(machine.nodes.length).toBe(3);
        expect(machine.nodes[0].title).toBe('Start Process');
        expect(machine.nodes[1].title).toBe('Middle Process');
        expect(machine.nodes[2].title).toBe('End Process');
    });
});
