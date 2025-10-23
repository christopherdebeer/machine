import { describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import type { Machine } from '../../src/language/generated/ast.js';
import { generateJSON } from '../../src/language/generator/generator.js';

const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

describe('Node Type Capitalization Normalization', () => {
    test('should normalize Task to task in JSON output', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            Task preprocess @Async {
                prompt: "Process the data";
            }
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const result = generateJSON(machine);
        const json = JSON.parse(result.content);

        // Verify the type is normalized to lowercase
        expect(json.nodes[0].type).toBe('task');
        expect(json.nodes[0].name).toBe('preprocess');
    });

    test('should normalize TASK to task in JSON output', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            TASK analyze {
                prompt: "Analyze the results";
            }
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const result = generateJSON(machine);
        const json = JSON.parse(result.content);

        expect(json.nodes[0].type).toBe('task');
        expect(json.nodes[0].name).toBe('analyze');
    });

    test('should normalize Context to context in JSON output', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            Context userInput {
                data: "test";
            }
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const result = generateJSON(machine);
        const json = JSON.parse(result.content);

        expect(json.nodes[0].type).toBe('context');
        expect(json.nodes[0].name).toBe('userInput');
    });

    test('should normalize Init to init in JSON output', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            Init start;
            Task process;
            
            start -> process;
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const result = generateJSON(machine);
        const json = JSON.parse(result.content);

        const initNode = json.nodes.find((n: any) => n.name === 'start');
        expect(initNode.type).toBe('init');
    });

    test('should not show @Async warning for Task with capital T', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            Task preprocess @Async {
                prompt: "Process the data";
            }
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        // Validate the document
        const validationErrors = await services.Machine.validation.DocumentValidator.validateDocument(document);
        
        // Should not have any warnings about @Async on non-task nodes
        const asyncWarnings = validationErrors.filter(e => 
            e.message.includes('@Async annotation is typically used only on task nodes')
        );
        
        expect(asyncWarnings).toHaveLength(0);
    });

    test('should not show @Async warning for TASK in all caps', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            TASK analyze @Async {
                prompt: "Analyze the results";
            }
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const validationErrors = await services.Machine.validation.DocumentValidator.validateDocument(document);
        
        const asyncWarnings = validationErrors.filter(e => 
            e.message.includes('@Async annotation is typically used only on task nodes')
        );
        
        expect(asyncWarnings).toHaveLength(0);
    });

    test('should handle mixed case types correctly', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            TaSk mixed {
                prompt: "Mixed case task";
            }
            
            CoNtExT data {
                value: "test";
            }
            
            InIt start;
            
            start -> mixed;
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value;
        const result = generateJSON(machine);
        const json = JSON.parse(result.content);

        // All types should be normalized to lowercase
        expect(json.nodes.find((n: any) => n.name === 'mixed').type).toBe('task');
        expect(json.nodes.find((n: any) => n.name === 'data').type).toBe('context');
        expect(json.nodes.find((n: any) => n.name === 'start').type).toBe('init');
    });

    test('should validate init node semantics with capitalized Init', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            Init orphanedInit;
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const validationErrors = await services.Machine.validation.DocumentValidator.validateDocument(document);
        
        // Should still get warning about init node with no outgoing edges
        const initWarnings = validationErrors.filter(e => 
            e.message.includes('Init node') && e.message.includes('no outgoing edges')
        );
        
        expect(initWarnings.length).toBeGreaterThan(0);
    });

    test('should validate context node semantics with capitalized Context', async () => {
        const document = await parse(s`
            machine "Test Machine"
            
            Context config {
                value: "test";
            }
            
            Task process;
            
            process -> config;
        `);

        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const validationErrors = await services.Machine.validation.DocumentValidator.validateDocument(document);
        
        // Should get warning about context node with incoming edges
        const contextWarnings = validationErrors.filter(e => 
            e.message.includes('Context node') && e.message.includes('incoming edges')
        );
        
        expect(contextWarnings.length).toBeGreaterThan(0);
    });
});
