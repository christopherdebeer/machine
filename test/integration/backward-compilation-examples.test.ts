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

/**
 * Remove $sourceRange fields from JSON for comparison
 * $sourceRange contains line/character positions that will differ in DSL round-trips
 * due to formatting differences, but don't indicate semantic changes
 */
function removeSourceRanges(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => removeSourceRanges(item));
    }

    if (typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
            if (key === '$sourceRange') {
                // Skip $sourceRange fields
                continue;
            }
            result[key] = removeSourceRanges(obj[key]);
        }
        return result;
    }

    return obj;
}

const exampleFiles = [
    'examples/basic/hello-world.dy',
    'examples/basic/simple-workflow.dy',
    'examples/state-machines/traffic-light.dy',
    'examples/state-machines/connection-manager.dy',
    'examples/workflows/conditional-workflow.dy',
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

            // Normalize both JSONs by removing $sourceRange fields which differ due to formatting
            const normalized1 = removeSourceRanges(machineJson1);
            const normalized2 = removeSourceRanges(machineJson2);

            // Compare key properties
            expect(normalized2.title).toBe(normalized1.title);
            expect(normalized2.nodes.length).toBe(normalized1.nodes.length);
            expect(normalized2.edges.length).toBe(normalized1.edges.length);

            // Check node names are preserved
            const nodeNames1 = normalized1.nodes.map((n: any) => n.name).sort();
            const nodeNames2 = normalized2.nodes.map((n: any) => n.name).sort();
            expect(nodeNames2).toEqual(nodeNames1);
        });
    });
});
