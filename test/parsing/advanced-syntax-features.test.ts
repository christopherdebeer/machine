import { describe, expect, it } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../../src/language/generated/ast.js';

const services = createMachineServices(EmptyFileSystem).Machine;
const parse = parseHelper<Machine>(services);

describe('Note Support', () => {
    it('should parse basic note syntax', async () => {
        const input = `
            machine "Test"
            task process;
            note for process "This is a note"
        `;
        const result = await parse(input);
        expect(result.parseResult.lexerErrors).toHaveLength(0);
        expect(result.parseResult.parserErrors).toHaveLength(0);
        expect(result.parseResult.value.notes).toHaveLength(1);
        expect(result.parseResult.value.notes?.[0].target.ref?.name).toBe('process');
        expect(result.parseResult.value.notes?.[0].content).toContain('This is a note');
    });

    it('should parse multiple notes', async () => {
        const input = `
            machine "Test"
            task first;
            task second;
            note for first "First note"
            note for second "Second note"
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
        expect(result.parseResult.value.notes).toHaveLength(2);
    });

    it('should parse multiline note content', async () => {
        const input = `
            machine "Test"
            task process;
            note for process "This is a multiline note.
            It spans multiple lines.
            And provides detailed documentation."
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
        expect(result.parseResult.value.notes).toHaveLength(1);
    });
});

describe('Generic Type Support', () => {
    it('should parse simple generic types', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
        `;
        const result = await parse(input);
        expect(result.parseResult.lexerErrors).toHaveLength(0);
        expect(result.parseResult.parserErrors).toHaveLength(0);
        const task = result.parseResult.value.nodes[0];
        expect(task.attributes?.[0].name).toBe('result');
        expect(task.attributes?.[0].type).toBeDefined();
    });

    it('should parse nested generic types', async () => {
        const input = `
            machine "Test"
            task process {
                data<Promise<Array<Record>>>: [];
            }
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
        const task = result.parseResult.value.nodes[0];
        expect(task.attributes?.[0].type).toBeDefined();
    });

    it('should parse Array generic type', async () => {
        const input = `
            machine "Test"
            task process {
                items<Array<string>>: [];
            }
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
    });

    it('should parse Map generic type', async () => {
        const input = `
            machine "Test"
            context config {
                headers<Map<string, string>>: [];
            }
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
    });

    it('should parse Optional generic type', async () => {
        const input = `
            machine "Test"
            state result {
                error<Optional<string>>: "none";
            }
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
    });

    it('should parse List generic type', async () => {
        const input = `
            machine "Test"
            task process {
                queue<List<Task>>: [];
            }
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
    });
});

describe('Combined Features', () => {
    it('should parse notes with generic types', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>>: "pending";
            }
            note for process "Returns Promise<Result>"
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
        expect(result.parseResult.value.notes).toHaveLength(1);
        expect(result.parseResult.value.nodes[0].attributes?.[0].type).toBeDefined();
    });

    it('should parse complex Advanced Syntax example', async () => {
        const input = `
            machine "Complex Advanced Syntax"

            context config @Singleton {
                data<Map<string, any>>: [];
            }

            task fetch @Async {
                response<Promise<Response>>: "pending";
            }

            task transform {
                output<Array<Record>>: [];
            }

            fetch -> transform;

            note for fetch "Fetches data asynchronously"
            note for transform "Transforms the response"
        `;
        const result = await parse(input);
        expect(result.parseResult.parserErrors).toHaveLength(0);
        expect(result.parseResult.value.notes).toHaveLength(2);
        expect(result.parseResult.value.nodes).toHaveLength(3);
        expect(result.parseResult.value.edges).toHaveLength(1);
    });
});

describe('Edge Cases', () => {
    it('should handle note with no target', async () => {
        const input = `
            machine "Test"
            task process;
            note for nonexistent "This should reference an invalid target"
        `;
        const result = await parse(input);
        // Parser should succeed but validator should catch the error
        expect(result.parseResult.parserErrors).toHaveLength(0);
    });

    it('should handle empty generic type', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<>>: "pending";
            }
        `;
        const result = await parse(input);
        // Should parse but may be semantically invalid
        expect(result.parseResult.lexerErrors).toHaveLength(0);
    });

    it('should handle unmatched angle brackets', async () => {
        const input = `
            machine "Test"
            task process {
                result<Promise<Result>: "pending";
            }
        `;
        const result = await parse(input);
        // Should fail to parse due to syntax error
        expect(result.parseResult.parserErrors.length).toBeGreaterThan(0);
    });
});
