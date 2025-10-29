import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine } from "../../src/language/generated/ast.js";
import { generateJSON, generateDSL } from "../../src/language/generator/generator.js";
import * as fs from 'fs';
import * as path from 'path';

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

/**
 * Test backward compilation with real example files
 * Ensures round-trip works with actual DSL files from the examples directory
 */

const exampleFiles = [
    'examples/basic/hello-world.dygram',
    'examples/basic/simple-workflow.dygram',
    'examples/state-machines/traffic-light.dygram',
    'examples/state-machines/connection-manager.dygram',
    'examples/workflows/conditional-workflow.dygram',
];

describe('Backward Compilation with Example Files', () => {
    exampleFiles.forEach(filePath => {
        test(`Round-trip: ${filePath}`, async () => {
            const fullPath = path.join(process.cwd(), filePath);
            const content = fs.readFileSync(fullPath, 'utf-8');

            // Parse original
            const doc1 = await parse(content);
            expect(doc1.parseResult.parserErrors).toHaveLength(0);

            const machine1 = doc1.parseResult.value as Machine;
            const json1 = generateJSON(machine1, filePath, undefined);
            const machineJson1 = JSON.parse(json1.content);

            // Generate DSL from JSON
            const regeneratedDSL = generateDSL(machineJson1);

            // Parse regenerated
            const doc2 = await parse(regeneratedDSL);
            if (doc2.parseResult.parserErrors.length > 0) {
                console.log(`Parse errors in regenerated DSL for ${filePath}:`);
                console.log(regeneratedDSL);
                console.log("Errors:", doc2.parseResult.parserErrors);
            }
            expect(doc2.parseResult.parserErrors).toHaveLength(0);

            const machine2 = doc2.parseResult.value as Machine;
            const json2 = generateJSON(machine2, filePath, undefined);
            const machineJson2 = JSON.parse(json2.content);

            // Compare key properties
            expect(machineJson2.title).toBe(machineJson1.title);
            expect(machineJson2.nodes.length).toBe(machineJson1.nodes.length);
            expect(machineJson2.edges.length).toBe(machineJson1.edges.length);

            // Check node names are preserved
            const nodeNames1 = machineJson1.nodes.map((n: any) => n.name).sort();
            const nodeNames2 = machineJson2.nodes.map((n: any) => n.name).sort();
            expect(nodeNames2).toEqual(nodeNames1);
        });
    });
});
