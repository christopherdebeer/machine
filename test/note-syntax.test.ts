import { beforeAll, describe, expect, test } from 'vitest';
import { createMachineServices } from '../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from '../src/language/generated/ast.js';

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Note Syntax', () => {
    test('should parse simple note syntax', async () => {
        const text = `
machine "Test"

node1;

note node1 "This is a note about node1";
        `;

        const document = await parse(text);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const noteNode = machine.nodes.find(n => n.type === 'note');
        expect(noteNode).toBeDefined();
        expect(noteNode?.name).toContain('node1');
        expect(noteNode?.title).toBe('"This is a note about node1"');
        const targetAttr = noteNode?.attributes?.find(a => a.name === 'target');
        expect(targetAttr).toBeDefined();
    });

    test('should parse note with annotations', async () => {
        const text = `
machine "Test"

node1;

note node1 "Title" @Critical;
        `;

        const document = await parse(text);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const noteNode = machine.nodes.find(n => n.type === 'note');
        expect(noteNode).toBeDefined();
        expect(noteNode?.annotations).toHaveLength(1);
        expect(noteNode?.annotations?.[0].name).toBe('Critical');
    });

    test('should parse note with attributes', async () => {
        const text = `
machine "Test"

node1;

note node1 "Title" @Critical {
    priority: "high";
    category: "documentation";
}
        `;

        const document = await parse(text);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const noteNode = machine.nodes.find(n => n.type === 'note');
        expect(noteNode).toBeDefined();
        expect(noteNode?.attributes?.length).toBeGreaterThanOrEqual(3);
        const priorityAttr = noteNode?.attributes?.find(a => a.name === 'priority');
        const categoryAttr = noteNode?.attributes?.find(a => a.name === 'category');
        expect(priorityAttr).toBeDefined();
        expect(categoryAttr).toBeDefined();
    });

    test('should validate note target in strict mode', async () => {
        const text = `
machine "Test" @StrictMode

node1;

note node1 "Valid note";

note nonexistent "Invalid note - target does not exist";
        `;

        const document = await parse(text);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        // Check that validation errors are present for undefined target
        const diagnostics = document.diagnostics || [];
        const noteErrors = diagnostics.filter(d =>
            d.message.includes('Note references undefined node')
        );
        expect(noteErrors.length).toBeGreaterThan(0);
    });

    test('should allow undefined note target in non-strict mode', async () => {
        const text = `
machine "Test"

node1;

note node1 "Valid note";
note nonexistent "This should be allowed in non-strict mode";
        `;

        const document = await parse(text);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        
        // In non-strict mode, no validation errors for undefined targets
        const diagnostics = document.diagnostics || [];
        const noteErrors = diagnostics.filter(d => 
            d.message.includes('Note references undefined node')
        );
        expect(noteErrors.length).toBe(0);
    });
});
