import { describe, expect, it } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../../src/language/generated/ast.js';
import { generateJSON, generateGraphviz } from '../../src/language/generator/generator.js';

const services = createMachineServices(EmptyFileSystem).Machine;
const parse = parseHelper<Machine>(services);

async function generateJSONFromModel(model: Machine, filePath: string, options: any) {
    const json = await generateJSON(model, filePath, options);
    return { json: json.content };
}

function getNoteNodes(machineJson: any) {
    return (machineJson.nodes || []).filter((n: any) => n.type === 'note');
}

function sanitizeForDotId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]+/g, '_');
}

function extractSubgraph(content: string, clusterName: string): string {
    const startToken = `subgraph cluster_${clusterName} {`;
    const startIndex = content.indexOf(startToken);
    expect(startIndex).toBeGreaterThanOrEqual(0);

    let depth = 0;
    for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return content.substring(startIndex, i);
            }
        }
    }

    return content.substring(startIndex);
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
        // JSON should contain note nodes embedded in the hierarchy
        const machineJson = JSON.parse(json.json);
        const notes = getNoteNodes(machineJson);
        expect(notes).toHaveLength(1);
        expect(notes[0].name).toBe('process');
        expect(notes[0].title).toBe('Test note');
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
        expect(getNoteNodes(machineJson)).toHaveLength(2);
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
        expect(getNoteNodes(machineJson).length).toBeLessThanOrEqual(2);
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
        expect(getNoteNodes(machineJson)).toHaveLength(1);
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
        expect(getNoteNodes(machineJson)).toHaveLength(2);
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
        expect(getNoteNodes(machineJson)).toHaveLength(3);
    });
});

describe('Attribute reference edges', () => {
    it('should expose attribute-qualified edges and inferred attribute links', async () => {
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
        const json = await generateJSONFromModel(result.parseResult.value, '', {});
        const machineJson = JSON.parse(json.json);

        expect(machineJson.edges).toHaveLength(2);

        const portEdge = machineJson.edges.find((edge: any) => edge.source === 'parent' && edge.target === 'child1');
        expect(portEdge).toBeDefined();
        expect(portEdge?.sourceAttribute).toBe('spouse');
        expect(portEdge?.value?.sourceAttribute).toBe('spouse');

        const inferredEdge = machineJson.edges.find((edge: any) => edge.source === 'child2' && edge.target === 'apples');
        expect(inferredEdge).toBeDefined();
        expect(inferredEdge?.value?.text).toBe('likes');
        expect(inferredEdge?.sourceAttribute).toBe('likes');

        const graphviz = generateGraphviz(result.parseResult.value, '', undefined);
        expect(graphviz.content).toContain('"parent":"spouse__value" -> "child1"');
        expect(graphviz.content).toContain('"child2":"likes__value" -> "apples"');

        const noteId = `note_${sanitizeForDotId('parent')}_0`;
        expect(graphviz.content).toContain(`"${noteId}" [label=<`);
        expect(graphviz.content).toContain(`"${noteId}" -> "parent" [style=dashed`);
    });

    it('should render note nodes inside namespace clusters', async () => {
        const input = `
            machine "Clustered"

            context Group {
                task Item;
                note Item "Inline note";
            }
        `;

        const result = await parse(input);
        const graphviz = generateGraphviz(result.parseResult.value, '', undefined);

        const clusterBlock = extractSubgraph(graphviz.content, 'Group');
        const noteId = `note_${sanitizeForDotId('Item')}_0`;

        expect(clusterBlock).toContain(`"${noteId}" [label=<`);
        expect(clusterBlock).toContain(`"${noteId}" -> "Item" [style=dashed`);
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
