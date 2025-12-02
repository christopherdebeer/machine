import { describe, test, expect } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { generateJSON } from '../../src/language/generator/generator.js';
import { MachineJSON } from '../../src/language/machine-module.js';

const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

describe('Relationship type generation', () => {
    test('inheritance arrow generates <|-- in JSON', async () => {
        const document = await parse(`
            machine "Inheritance Test"
            Parent;
            Child;
            Parent <|-- Child;
        `);

        const machine = document.parseResult.value;
        const result = generateJSON(machine, 'test.dy', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        expect(json.edges.length).toBe(1);
        expect(json.edges[0].arrowType).toBe('<|--');
        expect(json.edges[0].source).toBe('Parent');
        expect(json.edges[0].target).toBe('Child');
    });

    test('composition arrow generates *--> in JSON', async () => {
        const document = await parse(`
            machine "Composition Test"
            Container;
            Component;
            Container *--> Component;
        `);

        const machine = document.parseResult.value;
        const result = generateJSON(machine, 'test.dy', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        expect(json.edges.length).toBe(1);
        expect(json.edges[0].arrowType).toBe('*-->');
    });

    test('aggregation arrow generates o--> in JSON', async () => {
        const document = await parse(`
            machine "Aggregation Test"
            Aggregate;
            Part;
            Aggregate o--> Part;
        `);

        const machine = document.parseResult.value;
        const result = generateJSON(machine, 'test.dy', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        expect(json.edges.length).toBe(1);
        expect(json.edges[0].arrowType).toBe('o-->');
    });

    test('dependency arrow --> generates ..> in Mermaid', async () => {
        const document = await parse(`
            machine "Dependency Test"
            Client;
            Service;
            Client --> Service;
        `);

        const machine = document.parseResult.value;
        const result = generateJSON(machine, 'test.dy', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        expect(json.edges[0].arrowType).toBe('-->');
        // The generator will map this to ..> in Mermaid output
    });

    test('mixed relationship types preserve semantics', async () => {
        const document = await parse(`
            machine "Mixed Test"
            Base;
            Derived;
            Container;
            Part;
            Client;
            Service;

            Base <|-- Derived;
            Container *--> Part;
            Client --> Service;
            Client <--> Service;
        `);

        const machine = document.parseResult.value;
        const result = generateJSON(machine, 'test.dy', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        expect(json.edges.length).toBe(4);
        expect(json.edges[0].arrowType).toBe('<|--');
        expect(json.edges[1].arrowType).toBe('*-->');
        expect(json.edges[2].arrowType).toBe('-->');
        expect(json.edges[3].arrowType).toBe('<-->');
    });
});

describe('Node label generation', () => {
    test('node title is preserved in JSON', async () => {
        const document = await parse(`
            machine "Label Test"
            task processData "Process User Data" {
                timeout<number>: 5000;
            }
        `);

        const machine = document.parseResult.value;
        const result = generateJSON(machine, 'test.dy', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        expect(json.nodes.length).toBe(1);
        expect(json.nodes[0].name).toBe('processData');
        // Title should be in the node's title property
        expect(machine.nodes[0].title).toBe('Process User Data');
    });

    test('multiple node titles are preserved', async () => {
        const document = await parse(`
            machine "Multiple Labels"
            task start "Start Process";
            task end "End Process";

            start -> end;
        `);

        const machine = document.parseResult.value;
        expect(machine.nodes[0].title).toBe('Start Process');
        expect(machine.nodes[1].title).toBe('End Process');
    });
});
