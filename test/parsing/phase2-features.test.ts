import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';

/**
 * Tests for Phase 2 features: multiplicity, annotations, and dependency inference
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

describe('Phase 2.5: Multiplicity Parsing', () => {
    it('should parse edge with source multiplicity', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "1" -> B;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const edge = machine.edges[0];
        expect(edge.segments[0].sourceMultiplicity).toBe('"1"');
    });

    it('should parse edge with target multiplicity', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A -> "*" B;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const edge = machine.edges[0];
        expect(edge.segments[0].targetMultiplicity).toBe('"*"');
    });

    it('should parse edge with both multiplicities', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "1" -> "*" B;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const edge = machine.edges[0];
        expect(edge.segments[0].sourceMultiplicity).toBe('"1"');
        expect(edge.segments[0].targetMultiplicity).toBe('"*"');
    });

    it('should parse range multiplicity', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "1..5" -> "2..10" B;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const edge = machine.edges[0];
        expect(edge.segments[0].sourceMultiplicity).toBe('"1..5"');
        expect(edge.segments[0].targetMultiplicity).toBe('"2..10"');
    });

    it('should parse optional multiplicity', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "0..1" -> "1..*" B;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const edge = machine.edges[0];
        expect(edge.segments[0].sourceMultiplicity).toBe('"0..1"');
        expect(edge.segments[0].targetMultiplicity).toBe('"1..*"');
    });

    it('should parse multiplicity with different arrow types', async () => {
        const text = `machine "Test"
            state A;
            state B;
            state C;
            state D;
            A "1" --> "*" B;
            B "1" *--> "1..*" C;
            C "0..1" o--> "*" D;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        expect(machine.edges).toHaveLength(3);

        // Check first edge (dependency)
        expect(machine.edges[0].segments[0].sourceMultiplicity).toBe('"1"');
        expect(machine.edges[0].segments[0].targetMultiplicity).toBe('"*"');

        // Check second edge (composition)
        expect(machine.edges[1].segments[0].sourceMultiplicity).toBe('"1"');
        expect(machine.edges[1].segments[0].targetMultiplicity).toBe('"1..*"');

        // Check third edge (aggregation)
        expect(machine.edges[2].segments[0].sourceMultiplicity).toBe('"0..1"');
        expect(machine.edges[2].segments[0].targetMultiplicity).toBe('"*"');
    });
});

describe('Phase 2.7: Annotation Parsing', () => {
    it('should parse node with single annotation', async () => {
        const text = `machine "Test"
            state Node @Abstract;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const node = machine.nodes[0];
        expect(node.annotations).toHaveLength(1);
        expect(node.annotations[0].name).toBe('Abstract');
    });

    it('should parse node with annotation with value', async () => {
        const text = `machine "Test"
            state Node @Deprecated("Use NewNode instead");`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const node = machine.nodes[0];
        expect(node.annotations).toHaveLength(1);
        expect(node.annotations[0].name).toBe('Deprecated');
        expect(node.annotations[0].value).toBe('"Use NewNode instead"');
    });

    it('should parse node with multiple annotations', async () => {
        const text = `machine "Test"
            task Node @Abstract @Critical @Async;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const node = machine.nodes[0];
        expect(node.annotations).toHaveLength(3);
        expect(node.annotations[0].name).toBe('Abstract');
        expect(node.annotations[1].name).toBe('Critical');
        expect(node.annotations[2].name).toBe('Async');
    });

    it('should parse annotation on node with attributes', async () => {
        const text = `machine "Test"
            task Node @Singleton {
                value<number>: 42;
                name<string>: "test";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const node = machine.nodes[0];
        expect(node.annotations).toHaveLength(1);
        expect(node.annotations[0].name).toBe('Singleton');
        expect(node.attributes).toHaveLength(2);
    });

    it('should parse annotation with title', async () => {
        const text = `machine "Test"
            task Node "My Node" @Abstract {
                desc: "A node";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const node = machine.nodes[0];
        expect(node.title).toBe('"My Node"');
        expect(node.annotations).toHaveLength(1);
        expect(node.annotations[0].name).toBe('Abstract');
    });
});

describe('Phase 2: Combined Features', () => {
    it('should parse complete example with all Phase 2 features', async () => {
        const text = `machine "Complete Test"
            context config @Singleton {
                url<string>: "https://api.example.com";
            }

            task BaseTask @Abstract;
            task ConcreteTask @Async @Critical {
                prompt: "Use {{ config.url }}";
            }

            BaseTask <|-- ConcreteTask;
            ConcreteTask "1" --> "*" config;`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;

        // Check nodes
        expect(machine.nodes).toHaveLength(3);

        // Check config has annotation
        const config = machine.nodes[0];
        expect(config.annotations).toHaveLength(1);
        expect(config.annotations[0].name).toBe('Singleton');

        // Check BaseTask has annotation
        const baseTask = machine.nodes[1];
        expect(baseTask.annotations).toHaveLength(1);
        expect(baseTask.annotations[0].name).toBe('Abstract');

        // Check ConcreteTask has multiple annotations
        const concreteTask = machine.nodes[2];
        expect(concreteTask.annotations).toHaveLength(2);
        expect(concreteTask.annotations[0].name).toBe('Async');
        expect(concreteTask.annotations[1].name).toBe('Critical');

        // Check ConcreteTask has template reference
        const promptAttr = concreteTask.attributes?.find(a => a.name === 'prompt');
        expect(promptAttr).toBeDefined();

        // Check edges
        expect(machine.edges).toHaveLength(2);

        // Check inheritance edge
        const inheritEdge = machine.edges[0];
        expect(inheritEdge.segments[0].endType).toBe('<|--');

        // Check multiplicity edge
        const multEdge = machine.edges[1];
        expect(multEdge.segments[0].sourceMultiplicity).toBe('"1"');
        expect(multEdge.segments[0].targetMultiplicity).toBe('"*"');
    });
});
