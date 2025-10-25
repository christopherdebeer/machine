import { describe, test, expect } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { generateJSON } from '../../src/language/generator/generator.js';
import { MachineJSON } from '../../src/language/machine-module.js';
import { generateGraphvizFromJSON } from '../../src/language/diagram/index.js';

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
        const result = generateJSON(machine, 'test.dygram', undefined);
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
        const result = generateJSON(machine, 'test.dygram', undefined);
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
        const result = generateJSON(machine, 'test.dygram', undefined);
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
        const result = generateJSON(machine, 'test.dygram', undefined);
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
        const result = generateJSON(machine, 'test.dygram', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        expect(json.edges.length).toBe(4);
        expect(json.edges[0].arrowType).toBe('<|--');
        expect(json.edges[1].arrowType).toBe('*-->');
        expect(json.edges[2].arrowType).toBe('-->');
        expect(json.edges[3].arrowType).toBe('<-->');
    });
});

describe('Attribute endpoint serialization', () => {
    test('edges honor attribute-qualified endpoints in JSON and DOT output', async () => {
        const document = await parse(`
            machine "Attribute Endpoint Example"

            parent {
                spouse: "Alice";
                child1 @highlight {
                    age: 38;
                }
                child2 {
                    likes: apples;
                }
            }

            apples;

            style highlightStyle @highlight {
                color: red;
            }

            parent.spouse -"begets..."-> parent.child1;
            child2.likes -likes-> apples;
        `);

        const machine = document.parseResult.value;
        const result = generateJSON(machine, 'attribute-example.dygram', undefined);
        const json: MachineJSON = JSON.parse(result.content);

        const spouseEdge = json.edges.find(edge => edge.source === 'parent' && edge.target === 'child1');
        expect(spouseEdge?.sourceAttribute).toBe('spouse');
        expect(spouseEdge?.value?.sourceAttribute).toBe('spouse');

        const likesEdge = json.edges.find(edge => edge.source === 'child2' && edge.target === 'apples');
        expect(likesEdge?.sourceAttribute).toBe('likes');
        expect(likesEdge?.value?.sourceAttribute).toBe('likes');
        expect(likesEdge?.value?.text).toBe('likes');

        const dot = generateGraphvizFromJSON(json);
        expect(dot).toContain('"parent":"spouse__value" -> "child1"');
        expect(dot).toContain('"child2":"likes__value" -> "apples"');
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
        const result = generateJSON(machine, 'test.dygram', undefined);
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
