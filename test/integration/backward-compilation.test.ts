import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine, isMachine } from "../../src/language/generated/ast.js";
import { generateJSON, generateDSL } from "../../src/language/generator/generator.js";

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

/**
 * Backward compilation test suite
 * Tests JSON -> DSL backward compilation and round-trip losslessness
 * (DSL -> JSON -> DSL should produce equivalent result)
 */

describe('Backward Compilation: JSON -> DSL', () => {
    test('Minimal machine: round-trip', async () => {
        const original = `machine "Minimal Machine"`;

        // Forward: DSL -> JSON
        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        // Backward: JSON -> DSL
        const regeneratedDSL = generateDSL(machineJson);

        // Forward again: DSL -> JSON
        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        // Compare JSON representations (should be identical)
        expect(machineJson2.title).toBe(machineJson.title);
        expect(machineJson2.nodes.length).toBe(machineJson.nodes.length);
        expect(machineJson2.edges.length).toBe(machineJson.edges.length);
    });

    test('Simple nodes: round-trip', async () => {
        const original = `
            machine "Simple Nodes"
            node1;
            node2;
            node3;
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        expect(machineJson2.title).toBe(machineJson.title);
        expect(machineJson2.nodes.length).toBe(3);
        expect(machineJson2.nodes.map((n: any) => n.name).sort()).toEqual(['node1', 'node2', 'node3']);
    });

    test('Typed nodes: round-trip', async () => {
        const original = `
            machine "Typed Nodes"
            state start;
            task process;
            state end;
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        expect(machineJson2.nodes.length).toBe(3);
        const startNode = machineJson2.nodes.find((n: any) => n.name === 'start');
        expect(startNode.type).toBe('state');
        const processNode = machineJson2.nodes.find((n: any) => n.name === 'process');
        expect(processNode.type).toBe('task');
    });

    test('Node with title: round-trip', async () => {
        const original = `
            machine "Titled Nodes"
            start "Starting Point";
            middle "Processing Phase";
            end "Final State";
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        const startNode = machineJson2.nodes.find((n: any) => n.name === 'start');
        expect(startNode.title).toBe('Starting Point');
    });

    test('Node with attributes: round-trip', async () => {
        const original = `
            machine "Attributes Machine"
            node1 {
                stringAttr<string>: "test value";
                numberAttr<number>: 42.5;
                boolAttr<boolean>: true;
                arrayAttr: ["a", "b", "c"];
                untypedAttr: "untyped";
            }
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        const node = machineJson2.nodes.find((n: any) => n.name === 'node1');
        expect(node).toBeDefined();
        expect(node.attributes.length).toBe(5);

        const stringAttr = node.attributes.find((a: any) => a.name === 'stringAttr');
        expect(stringAttr.value).toBe('test value');
        expect(stringAttr.type).toBe('string');

        const numberAttr = node.attributes.find((a: any) => a.name === 'numberAttr');
        expect(numberAttr.value).toBe(42.5);
        expect(numberAttr.type).toBe('number');

        const arrayAttr = node.attributes.find((a: any) => a.name === 'arrayAttr');
        expect(arrayAttr.value).toEqual(['a', 'b', 'c']);
    });

    test('Simple edges: round-trip', async () => {
        const original = `
            machine "Simple Edges"
            start;
            middle;
            end;
            start -> middle;
            middle -> end;
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        expect(machineJson2.edges.length).toBe(2);
        const edge1 = machineJson2.edges.find((e: any) => e.source === 'start' && e.target === 'middle');
        expect(edge1).toBeDefined();
        const edge2 = machineJson2.edges.find((e: any) => e.source === 'middle' && e.target === 'end');
        expect(edge2).toBeDefined();
    });

    test('Labeled edges: round-trip', async () => {
        const original = `
            machine "Labeled Edges"
            start;
            middle;
            end;
            error;
            start -init-> middle;
            middle -"process complete"-> end;
            middle -timeout: 5000;-> error;
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        expect(machineJson2.edges.length).toBe(3);

        const initEdge = machineJson2.edges.find((e: any) => e.source === 'start');
        expect(initEdge.value?.text).toBe('init');

        const processEdge = machineJson2.edges.find((e: any) => e.target === 'end');
        expect(processEdge.value?.text).toBe('process complete');
    });

    test('Multiple arrow types: round-trip', async () => {
        const original = `
            machine "Arrow Types"
            s1;
            s2;
            s3;
            s4;
            s5;
            s1 -> s2;
            s2 --> s3;
            s3 => s4;
            s4 <--> s5;
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        expect(machineJson2.edges.length).toBe(4);

        const edge1 = machineJson2.edges.find((e: any) => e.source === 's1');
        expect(edge1.arrowType).toBe('->');

        const edge2 = machineJson2.edges.find((e: any) => e.source === 's2');
        expect(edge2.arrowType).toBe('-->');

        const edge3 = machineJson2.edges.find((e: any) => e.source === 's3');
        expect(edge3.arrowType).toBe('=>');

        const edge4 = machineJson2.edges.find((e: any) => e.source === 's4');
        expect(edge4.arrowType).toBe('<-->');
    });

    test('Annotations: round-trip', async () => {
        const original = `
            machine "Annotated Machine"
            node1 @Abstract;
            node2 @Deprecated("Use node3 instead");
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        const node1 = machineJson2.nodes.find((n: any) => n.name === 'node1');
        expect(node1.annotations).toBeDefined();
        expect(node1.annotations.length).toBe(1);
        expect(node1.annotations[0].name).toBe('Abstract');

        const node2 = machineJson2.nodes.find((n: any) => n.name === 'node2');
        expect(node2.annotations).toBeDefined();
        expect(node2.annotations[0].name).toBe('Deprecated');
        expect(node2.annotations[0].value).toBe('Use node3 instead');
    });

    test('Notes: round-trip', async () => {
        const original = `
            machine "Machine with Notes"
            node1;
            node2;
            note for node1 "This is an important node"
            note for node2 "This node processes data"
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        expect(machineJson2.notes).toBeDefined();
        expect(machineJson2.notes.length).toBe(2);

        const note1 = machineJson2.notes.find((n: any) => n.target === 'node1');
        expect(note1.content).toBe('This is an important node');

        const note2 = machineJson2.notes.find((n: any) => n.target === 'node2');
        expect(note2.content).toBe('This node processes data');
    });

    test('Multiplicity: round-trip', async () => {
        const original = `
            machine "Multiplicity Test"
            entity1;
            entity2;
            entity1 "1" -> "1..*" entity2;
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        const edge = machineJson2.edges[0];
        expect(edge.sourceMultiplicity).toBe('1');
        expect(edge.targetMultiplicity).toBe('1..*');
    });

    test('Generic types: round-trip', async () => {
        const original = `
            machine "Generic Types"
            node1 {
                result<Promise<Result>>: "pending";
                items<Array<string>>: ["item1", "item2"];
            }
        `;

        const doc1 = await parse(original);
        expect(doc1.parseResult.parserErrors).toHaveLength(0);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        const regeneratedDSL = generateDSL(machineJson);

        const doc2 = await parse(regeneratedDSL);
        expect(doc2.parseResult.parserErrors).toHaveLength(0);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        const node = machineJson2.nodes.find((n: any) => n.name === 'node1');
        const resultAttr = node.attributes.find((a: any) => a.name === 'result');
        expect(resultAttr.type).toBe('Promise<Result>');

        const itemsAttr = node.attributes.find((a: any) => a.name === 'items');
        expect(itemsAttr.type).toBe('Array<string>');
    });
});
