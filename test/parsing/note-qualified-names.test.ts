import { describe, expect, test } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { parseHelper } from 'langium/test';
import { Machine } from '../../src/language/generated/ast.js';
import { EmptyFileSystem } from 'langium';

const services = createMachineServices({ connection: undefined, ...EmptyFileSystem });
const parse = parseHelper<Machine>(services.Machine);

describe('Note Qualified Names', () => {
    test('note with qualified name should remain at root with qualified target', async () => {
        const text = `
machine "Quick Scaffolding"

task API.DataFetch "Fetches data from database";
task API.Response "Formats and returns response";

Start -> API.Authentication -> API.DataFetch -> API.Response -> End;

note API.Authentication "Handles user authentication";
        `;

        const result = await parse(text);

        // Should have no parse errors
        expect(result.parseResult.parserErrors).toHaveLength(0);
        expect(result.parseResult.value).toBeDefined();

        const machine = result.parseResult.value;

        // Should create API parent node for tasks
        expect(machine.nodes).toBeDefined();
        const apiNode = machine.nodes.find(n => n.name === 'API');
        expect(apiNode).toBeDefined();
        expect(apiNode?.nodes).toBeDefined();

        // API should have DataFetch and Response as children (tasks are expanded)
        expect(apiNode?.nodes.length).toBe(2);

        const dataFetchNode = apiNode?.nodes.find(n => n.name === 'DataFetch');
        expect(dataFetchNode).toBeDefined();
        expect(dataFetchNode?.type).toBe('task');
        expect(dataFetchNode?.title).toBe('Fetches data from database');

        const responseNode = apiNode?.nodes.find(n => n.name === 'Response');
        expect(responseNode).toBeDefined();
        expect(responseNode?.type).toBe('task');
        expect(responseNode?.title).toBe('Formats and returns response');

        // Note should be at root level, NOT nested under API
        const authNode = machine.nodes.find(n => n.name === 'API.Authentication' && n.type === 'note');
        expect(authNode).toBeDefined();
        expect(authNode?.type).toBe('note');
        expect(authNode?.title).toBe('Handles user authentication');

        // The note should have a target attribute pointing to API.Authentication
        expect(authNode?.attributes).toBeDefined();
        const targetAttr = authNode?.attributes.find(a => a.name === 'target');
        expect(targetAttr).toBeDefined();
        expect(targetAttr?.value).toBeDefined();

        // The target should be the full qualified name
        const primitiveValue = (targetAttr?.value as any);
        expect(primitiveValue.$type).toBe('PrimitiveValue');
        expect(primitiveValue.value).toBe('API.Authentication'); // Should be full qualified name
    });

    test('note with simple name should work as before', async () => {
        const text = `
machine "Simple Note"

task API.DataFetch "Fetches data";

note DataFetch "Simple note";
        `;

        const result = await parse(text);

        expect(result.parseResult.parserErrors).toHaveLength(0);

        const machine = result.parseResult.value;

        // Should have API parent and DataFetch note at root
        const dataFetchNote = machine.nodes.find(n => n.name === 'DataFetch' && n.type === 'note');
        expect(dataFetchNote).toBeDefined();

        // Target should be simple name
        const targetAttr = dataFetchNote?.attributes.find(a => a.name === 'target');
        expect(targetAttr).toBeDefined();
        const primitiveValue = (targetAttr?.value as any);
        expect(primitiveValue.value).toBe('DataFetch');
    });
});
