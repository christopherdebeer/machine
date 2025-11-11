import { beforeAll, describe, expect, it } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import type { Machine } from '../../src/language/generated/ast.js';
import { serializeMachineToJSON } from '../../src/language/json/serializer.js';
import { generateDotDiagram } from '../../src/language/diagram/graphviz-dot-diagram.js';

let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    const services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

describe('canonical style serialization', () => {
    it('flattens annotations, attributes, and style nodes into canonical JSON', async () => {
        const text = `machine "Styled" @style(rankdir: LR; pad: 0.5)
maxEdgeLabelLength: 55

style highlightStyle @Tagged {
    color: "red";
    penwidth: 3;
}

Task start @Tagged @style("fill: #ffeeee; direction: column") {
    style: {
        shape: box;
        fontname: "Courier";
    }
}

Task end;

start -@style(color: blue; penwidth: 2;)-> end;
`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const json = serializeMachineToJSON(machine);

        expect(json.style).toMatchObject({
            rankdir: 'LR',
            pad: 0.5,
            maxEdgeLabelLength: 55
        });

        const startNode = json.nodes.find(node => node.name === 'start');
        expect(startNode?.style).toMatchObject({
            shape: 'box',
            fontname: 'Courier',
            fillcolor: '#ffeeee',
            rankdir: 'column'
        });

        const styleNode = json.nodes.find(node => node.type === 'style' && node.name === 'highlightStyle');
        expect(styleNode?.style).toMatchObject({
            color: 'red',
            penwidth: 3
        });

        const edge = json.edges.find(e => e.source === 'start' && e.target === 'end');
        expect(edge?.style).toMatchObject({
            color: 'blue',
            penwidth: 2
        });
    });

    it('exposes canonical styles to the diagram generator', async () => {
        const text = `machine "Styled" @style(rankdir: LR; pad: 0.5)
maxEdgeLabelLength: 55

Task start @style("fill: #ffeeee; direction: column") {
    style: {
        shape: box;
    }
}

Task end;

start -@style(color: blue; penwidth: 2;)-> end;
`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const json = serializeMachineToJSON(machine);
        const dot = generateDotDiagram(json);

        expect(dot).toContain('rankdir="LR"');
        expect(dot).toContain('color="blue"');
        expect(dot).toContain('fillcolor="#ffeeee"');
    });
});
