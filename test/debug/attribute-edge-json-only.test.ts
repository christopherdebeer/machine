import { describe, it, expect } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../../src/language/generated/ast.js';
import { generateJSON } from '../../src/language/generator/generator.js';

const services = createMachineServices(EmptyFileSystem).Machine;
const parse = parseHelper<Machine>(services);

describe('Attribute reference edges - JSON only', () => {
    it('should create correct edges in JSON', async () => {
        const input = `
            machine "Refined"

            parent {
                spouse: "Alice";
                child1 {
                    age: 38;
                }
                child2 {
                    likes: apples;
                }
                note parent "Documenting parent context";
            }

            apples;

            parent.spouse -> parent.child1;
        `;

        const result = await parse(input);
        const json = await generateJSON(result.parseResult.value, '', {});
        const machineJson = JSON.parse(json.content);

        // Test the JSON edge generation
        expect(machineJson.edges).toHaveLength(2);

        const portEdge = machineJson.edges.find((edge: any) => edge.source === 'parent' && edge.target === 'child1');
        expect(portEdge).toBeDefined();
        expect(portEdge?.sourceAttribute).toBe('spouse');
        expect(portEdge?.value?.sourceAttribute).toBe('spouse');

        const inferredEdge = machineJson.edges.find((edge: any) => edge.source === 'child2' && edge.target === 'apples');
        expect(inferredEdge).toBeDefined();
        expect(inferredEdge?.value?.text).toBe('likes');
        expect(inferredEdge?.sourceAttribute).toBe('likes');
    });
});
