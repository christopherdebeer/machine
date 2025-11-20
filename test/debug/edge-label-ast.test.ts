import { describe, it } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';

describe('Debug Edge Label Parsing', () => {
    it('should show AST structure for edge with quoted condition', async () => {
        const services = createMachineServices(EmptyFileSystem);
        const content = `machine "Test"
state A @start
state B
A -when: "status == 'valid'"-> B`;

        const document = services.Machine.shared.workspace.LangiumDocumentFactory.fromString(content, 'test.dy');
        await services.Machine.shared.workspace.DocumentBuilder.build([document], {});

        const machine = document.parseResult.value;

        console.log('\n=== MACHINE AST DEBUG ===');
        console.log('Machine type:', machine.$type);
        console.log('Machine keys:', Object.keys(machine));

        // Find edges
        const edges = machine.edges || (machine.body && machine.body.edges) || [];
        console.log('Edges found:', edges.length);

        if (edges.length === 0) {
            console.log('No edges found!');
            return;
        }

        const edge = edges[0];

        console.log('\n=== EDGE AST DEBUG ===');
        console.log('Edge keys:', Object.keys(edge));
        console.log('Segments:', edge.segments?.length);
        if (!edge.segments || edge.segments.length === 0) {
            console.log('No segments found!');
            return;
        }
        console.log('First segment label:', edge.segments[0].label);

        if (edge.segments[0].label && edge.segments[0].label[0]) {
            const label = edge.segments[0].label[0];
            console.log('\nLabel type:', label.$type);
            console.log('Label.value:', label.value);

            if (label.value && label.value[0]) {
                const attr = label.value[0];
                console.log('\nAttribute name:', attr.name);
                console.log('Attribute value:', attr.value);
                console.log('Attribute value type:', typeof attr.value);
                console.log('Attribute value length:', attr.value?.length);
                console.log('Attribute value (JSON):', JSON.stringify(attr.value));

                // Check if there's a $cstNode
                if (attr.$cstNode) {
                    console.log('\nCST Node text:', attr.$cstNode.text);
                }
                if ((attr as any).value?.$cstNode) {
                    console.log('Value CST Node text:', (attr as any).value.$cstNode.text);
                }

                // Test the regex
                const testRegex = /^["']|["']$/g;
                const result = attr.value.replace(testRegex, '');
                console.log('\nAfter regex replacement:', result);
                console.log('Result length:', result.length);
                console.log('Result (JSON):', JSON.stringify(result));
            }
        }
    });
});
