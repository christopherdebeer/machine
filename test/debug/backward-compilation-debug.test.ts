import { describe, it } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from '../../src/language/generated/ast.js';
import { generateJSON, generateDSL } from '../../src/language/generator/generator.js';

describe('Backward Compilation Debug', () => {
    it('should debug labeled edge round-trip', async () => {
        const services = createMachineServices(EmptyFileSystem);
        const parse = parseHelper<Machine>(services.Machine);

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

        console.log('\n=== ORIGINAL DSL ===');
        console.log(original);

        const doc1 = await parse(original);
        const machine1 = doc1.parseResult.value as Machine;
        const jsonResult = generateJSON(machine1, 'test.mach', undefined);
        const machineJson = JSON.parse(jsonResult.content);

        console.log('\n=== FIRST JSON (DSL → JSON) ===');
        console.log('Edges:', JSON.stringify(machineJson.edges, null, 2));

        const regeneratedDSL = generateDSL(machineJson);

        console.log('\n=== REGENERATED DSL (JSON → DSL) ===');
        console.log(regeneratedDSL);

        const doc2 = await parse(regeneratedDSL);
        const machine2 = doc2.parseResult.value as Machine;
        const jsonResult2 = generateJSON(machine2, 'test.mach', undefined);
        const machineJson2 = JSON.parse(jsonResult2.content);

        console.log('\n=== SECOND JSON (DSL → JSON → DSL → JSON) ===');
        console.log('Edges:', JSON.stringify(machineJson2.edges, null, 2));

        // Compare
        const initEdge1 = machineJson.edges.find((e: any) => e.source === 'start');
        const initEdge2 = machineJson2.edges.find((e: any) => e.source === 'start');

        console.log('\n=== COMPARISON ===');
        console.log('First JSON init edge value:', initEdge1?.value);
        console.log('Second JSON init edge value:', initEdge2?.value);
    });
});
