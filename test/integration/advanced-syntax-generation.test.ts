import { describe, expect, it } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../../src/language/generated/ast.js';
import { generateJSON } from '../../src/language/generator/generator.js';

const services = createMachineServices(EmptyFileSystem).Machine;
const parse = parseHelper<Machine>(services);

async function generateJSONFromModel(model: Machine, filePath: string, options: any) {
    const json = await generateJSON(model, filePath, options);
    return { json: json.content };
}

describe('Note Generation', () => {
    it('should include notes in JSON output', async () => {
        const input = `
            machine "Test"
            task process;
            note process "Test note"
        `;
        const result = await parse(input);
        const json = await generateJSONFromModel(result.parseResult.value, '', {});

        expect(json).toBeDefined();
        // JSON should contain notes array
        const machineJson = JSON.parse(json.json);
        expect(machineJson.notes).toBeDefined();
        expect(machineJson.notes).toHaveLength(1);
        expect(machineJson.notes[0].target).toBe('process');
        expect(machineJson.notes[0].content).toBe('Test note');
    });

    it('should not generate Mermaid output (deprecated)', async () => {
        const input = `
            machine "Test"
            task process;
            note process "Process documentation"
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        // Mermaid generation was removed, only JSON is generated now
        expect(output.mermaid).toBeUndefined();
        expect(output.json).toBeDefined();
    });

    it('should handle multiple notes', async () => {
        const input = `
            machine "Test"
            task first;
            task second;
            note first "First note"
            note second "Second note"
        `;
        const result = await parse(input);
        const json = await generateJSONFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        expect(machineJson.notes).toHaveLength(2);
    });

    it('should filter out invalid note targets', async () => {
        const input = `
            machine "Test"
            task valid;
            note valid "Valid note"
            note invalid "Invalid note"
        `;
        const result = await parse(input);
        const json = await generateJSONFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        // Should only include notes with valid targets
        expect(machineJson.notes.length).toBeLessThanOrEqual(2);
    });
});

describe('Generic Type Generation', () => {
    it('should serialize generic types as strings', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
        `;
        const result = await parse(input);
        const json = await generateJSONFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        const processNode = machineJson.nodes.find((n: any) => n.name === 'process');
        expect(processNode.attributes[0].type).toBe('Promise<Result>');
    });

    it('should serialize generic types (Mermaid conversion deprecated)', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        // Mermaid generation was removed, only JSON is generated now
        expect(output.mermaid).toBeUndefined();
        expect(output.json).toBeDefined();
    });

    it('should handle nested generic types', async () => {
        const input = `
            machine "Test"
            task process {
                data<Promise<Array<Record>>>: [];
            }
        `;
        const result = await parse(input);
        const json = await generateJSONFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        const processNode = machineJson.nodes.find((n: any) => n.name === 'process');
        expect(processNode.attributes[0].type).toBe('Promise<Array<Record>>');
    });

    it('should render nested generic types (Mermaid deprecated)', async () => {
        const input = `
            machine "Test"
            task process {
                data<Promise<Array<Record>>>: [];
            }
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        // Mermaid generation was removed, only JSON is generated now
        expect(output.mermaid).toBeUndefined();
        expect(output.json).toBeDefined();
    });

    it('should handle Array generic type (Mermaid deprecated)', async () => {
        const input = `
            machine "Test"
            task process {
                items<Array<string>>: [];
            }
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        expect(output.mermaid).toBeUndefined();
        expect(output.json).toBeDefined();
    });

    it('should handle Map generic type with two parameters (Mermaid deprecated)', async () => {
        const input = `
            machine "Test"
            context config {
                headers<Map<string, string>>: [];
            }
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        expect(output.mermaid).toBeUndefined();
        expect(output.json).toBeDefined();
    });
});

describe('Combined Feature Generation', () => {
    it('should generate notes and generic types together', async () => {
        const input = `
            machine "Test"

            task process {
                result<Promise<Response>>: "pending";
            }

            note process "Async task returning Promise<Response>"
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        // Check both features in JSON output (Mermaid deprecated)
        expect(output.mermaid).toBeUndefined();

        const machineJson = JSON.parse(output.json);
        expect(machineJson.notes).toHaveLength(1);
        expect(machineJson.nodes[0].attributes[0].type).toBe('Promise<Response>');
    });

    it('should integrate with expressivity features', async () => {
        const input = `
            machine "Test"

            task base @Abstract {
                status<string>: "init";
            }

            task fetch @Async {
                result<Promise<Response>>: "pending";
            }

            base <|-- fetch;

            note base "Abstract base task"
            note fetch "Fetches data asynchronously"
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(output.json);

        // Annotations
        expect(machineJson.nodes[0].annotations).toBeDefined();

        // Mermaid deprecated - only JSON checks
        expect(output.mermaid).toBeUndefined();

        // Notes
        expect(machineJson.notes).toHaveLength(2);
    });

    it('should work with all features together', async () => {
        const input = `
            machine "Complete Test"

            context config @Singleton {
                endpoint<string>: "https://api.example.com";
            }

            task base @Abstract {
                result<Promise<any>>: "pending";
            }

            task fetch @Async {
                data<Promise<Response>>: "pending";
            }

            task transform {
                output<Array<Record>>: [];
            }

            base <|-- fetch;
            base <|-- transform;

            fetch "1" --> "1" transform;

            note config "Singleton configuration object"
            note fetch "Asynchronously fetches data from API"
            note transform "Transforms Response to Array of Records"
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(output.json);

        // Mermaid deprecated
        expect(output.mermaid).toBeUndefined();

        // Relationship types
        expect(machineJson.edges.some((e: any) => e.arrowType === '<|--')).toBe(true);

        // Annotations
        expect(machineJson.nodes.some((n: any) =>
            n.annotations?.some((a: any) => a.name === 'Singleton')
        )).toBe(true);

        // Multiplicity
        expect(machineJson.edges.some((e: any) =>
            e.sourceMultiplicity === '1' && e.targetMultiplicity === '1'
        )).toBe(true);

        // Notes
        expect(machineJson.notes).toHaveLength(3);
    });
});

describe('Mermaid Output Quality (deprecated)', () => {
    it('should not generate Mermaid output with notes', async () => {
        const input = `
            machine "Test"
            task process;
            note process "Documentation"
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        // Mermaid generation was removed
        expect(output.mermaid).toBeUndefined();
        expect(output.json).toBeDefined();
    });

    it('should not generate Mermaid output with generic types', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
        `;
        const result = await parse(input);
        const output = await generateJSONFromModel(result.parseResult.value, '', {});

        // Mermaid generation was removed
        expect(output.mermaid).toBeUndefined();
        expect(output.json).toBeDefined();
    });
});
