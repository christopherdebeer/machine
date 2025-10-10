import { describe, expect, it } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../../src/language/generated/ast.js';
import { generateJSON, generateMermaid } from '../../src/language/generator/generator.js';

const services = createMachineServices(EmptyFileSystem).Machine;
const parse = parseHelper<Machine>(services);

async function generateMermaidFromModel(model: Machine, filePath: string, options: any) {
    const json = await generateJSON(model, filePath, options);
    const mermaid = await generateMermaid(model, filePath, options);
    return { json: json.content, mermaid: mermaid.content };
}

describe('Phase 3: Note Generation', () => {
    it('should include notes in JSON output', async () => {
        const input = `
            machine "Test"
            task process;
            note for process "Test note"
        `;
        const result = await parse(input);
        const json = await generateMermaidFromModel(result.parseResult.value, '', {});

        expect(json).toBeDefined();
        // JSON should contain notes array
        const machineJson = JSON.parse(json.json);
        expect(machineJson.notes).toBeDefined();
        expect(machineJson.notes).toHaveLength(1);
        expect(machineJson.notes[0].target).toBe('process');
        expect(machineJson.notes[0].content).toBe('Test note');
    });

    it('should render notes in Mermaid output', async () => {
        const input = `
            machine "Test"
            task process;
            note for process "Process documentation"
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        expect(output.mermaid).toContain('note for process');
        expect(output.mermaid).toContain('Process documentation');
    });

    it('should handle multiple notes', async () => {
        const input = `
            machine "Test"
            task first;
            task second;
            note for first "First note"
            note for second "Second note"
        `;
        const result = await parse(input);
        const json = await generateMermaidFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        expect(machineJson.notes).toHaveLength(2);
    });

    it('should filter out invalid note targets', async () => {
        const input = `
            machine "Test"
            task valid;
            note for valid "Valid note"
            note for invalid "Invalid note"
        `;
        const result = await parse(input);
        const json = await generateMermaidFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        // Should only include notes with valid targets
        expect(machineJson.notes.length).toBeLessThanOrEqual(2);
    });
});

describe('Phase 3: Generic Type Generation', () => {
    it('should serialize generic types as strings', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
        `;
        const result = await parse(input);
        const json = await generateMermaidFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        const processNode = machineJson.nodes.find((n: any) => n.name === 'process');
        expect(processNode.attributes[0].type).toBe('Promise<Result>');
    });

    it('should convert generic types to Mermaid tildes', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        // Should convert < > to ~ ~
        expect(output.mermaid).toContain('Promise~Result~');
    });

    it('should handle nested generic types', async () => {
        const input = `
            machine "Test"
            task process {
                data<Promise<Array<Record>>>: [];
            }
        `;
        const result = await parse(input);
        const json = await generateMermaidFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(json.json);
        const processNode = machineJson.nodes.find((n: any) => n.name === 'process');
        expect(processNode.attributes[0].type).toBe('Promise<Array<Record>>');
    });

    it('should render nested generic types in Mermaid', async () => {
        const input = `
            machine "Test"
            task process {
                data<Promise<Array<Record>>>: [];
            }
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        // Should handle nested conversion
        expect(output.mermaid).toContain('Promise~Array~Record~~');
    });

    it('should handle Array generic type', async () => {
        const input = `
            machine "Test"
            task process {
                items<Array<string>>: [];
            }
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        expect(output.mermaid).toContain('Array~string~');
    });

    it('should handle Map generic type with two parameters', async () => {
        const input = `
            machine "Test"
            context config {
                headers<Map<string, string>>: [];
            }
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        expect(output.mermaid).toContain('Map~string, string~');
    });
});

describe('Phase 3: Combined Feature Generation', () => {
    it('should generate notes and generic types together', async () => {
        const input = `
            machine "Test"

            task process {
                result<Promise<Response>>: "pending";
            }

            note for process "Async task returning Promise<Response>"
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        // Check both features in output
        expect(output.mermaid).toContain('Promise~Response~');
        expect(output.mermaid).toContain('note for process');

        const machineJson = JSON.parse(output.json);
        expect(machineJson.notes).toHaveLength(1);
        expect(machineJson.nodes[0].attributes[0].type).toBe('Promise<Response>');
    });

    it('should integrate with Phase 2 features', async () => {
        const input = `
            machine "Test"

            task base @Abstract {
                status<string>: "init";
            }

            task fetch @Async {
                result<Promise<Response>>: "pending";
            }

            base <|-- fetch;

            note for base "Abstract base task"
            note for fetch "Fetches data asynchronously"
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(output.json);

        // Phase 2: Annotations
        expect(machineJson.nodes[0].annotations).toBeDefined();

        // Phase 2: Relationship types
        expect(output.mermaid).toContain('<|--');

        // Phase 3: Generic types
        expect(output.mermaid).toContain('Promise~Response~');

        // Phase 3: Notes
        expect(machineJson.notes).toHaveLength(2);
    });

    it('should work with all phases together', async () => {
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

            note for config "Singleton configuration object"
            note for fetch "Asynchronously fetches data from API"
            note for transform "Transforms Response to Array of Records"
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        const machineJson = JSON.parse(output.json);

        // Phase 1: Relationship types
        expect(output.mermaid).toContain('<|--');
        expect(machineJson.edges.some((e: any) => e.arrowType === '<|--')).toBe(true);

        // Phase 2: Annotations
        expect(machineJson.nodes.some((n: any) =>
            n.annotations?.some((a: any) => a.name === 'Singleton')
        )).toBe(true);

        // Phase 2: Multiplicity
        expect(machineJson.edges.some((e: any) =>
            e.sourceMultiplicity === '1' && e.targetMultiplicity === '1'
        )).toBe(true);

        // Phase 3: Generic types
        expect(output.mermaid).toContain('Promise~Response~');
        expect(output.mermaid).toContain('Array~Record~');

        // Phase 3: Notes
        expect(machineJson.notes).toHaveLength(3);
    });
});

describe('Phase 3: Mermaid Output Quality', () => {
    it('should produce valid Mermaid syntax with notes', async () => {
        const input = `
            machine "Test"
            task process;
            note for process "Documentation"
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        // Should have classDiagram-v2 declaration
        expect(output.mermaid).toContain('classDiagram-v2');

        // Should have note syntax
        expect(output.mermaid).toContain('note for process "Documentation"');
    });

    it('should produce valid Mermaid syntax with generic types', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
        `;
        const result = await parse(input);
        const output = await generateMermaidFromModel(result.parseResult.value, '', {});

        // Should use tilde notation
        expect(output.mermaid).toContain('Promise~Result~');

        // Should not contain angle brackets (invalid in Mermaid)
        expect(output.mermaid).not.toContain('Promise<Result>');
    });
});
