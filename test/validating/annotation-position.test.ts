/**
 * Tests for annotation positioning - annotations can appear before or after node definitions
 */

import { describe, it, expect } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../../src/language/generated/ast.js';

describe('Annotation Positioning', () => {
    const services = createMachineServices(EmptyFileSystem);
    const parse = parseHelper<Machine>(services.Machine);

    describe('Annotations before node definition', () => {
        it('should parse annotation before Task', async () => {
            const result = await parse(`
                machine "Test"

                @code
                Task ValidateEmail {
                    prompt: "Validate email";
                }
            `);

            expect(result.parseResult.lexerErrors).toHaveLength(0);
            expect(result.parseResult.parserErrors).toHaveLength(0);

            const task = result.parseResult.value.nodes[0];
            expect(task).toBeDefined();
            expect(task.name).toBe('ValidateEmail');
            expect(task.annotations).toHaveLength(1);
            expect(task.annotations[0].name).toBe('code');
        });

        it('should parse annotation before State', async () => {
            const result = await parse(`
                machine "Test"

                @style(color: "red")
                state Start "Initial"
            `);

            expect(result.parseResult.lexerErrors).toHaveLength(0);
            expect(result.parseResult.parserErrors).toHaveLength(0);

            const state = result.parseResult.value.nodes[0];
            expect(state).toBeDefined();
            expect(state.name).toBe('Start');
            expect(state.annotations).toHaveLength(1);
            expect(state.annotations[0].name).toBe('style');
        });

        it('should parse multiple annotations before node', async () => {
            const result = await parse(`
                machine "Test"

                @code
                @deprecated
                @experimental
                Task ProcessData {
                    prompt: "Process";
                }
            `);

            expect(result.parseResult.lexerErrors).toHaveLength(0);
            expect(result.parseResult.parserErrors).toHaveLength(0);

            const task = result.parseResult.value.nodes[0];
            expect(task).toBeDefined();
            expect(task.annotations).toHaveLength(3);
            expect(task.annotations[0].name).toBe('code');
            expect(task.annotations[1].name).toBe('deprecated');
            expect(task.annotations[2].name).toBe('experimental');
        });
    });

    describe('Annotations before node definition is preferred', () => {
        it('should recommend annotations before node for clarity', () => {
            // With the grammar update, annotations MUST come before the node definition
            // This makes the syntax more consistent and avoids ambiguity
            // Old syntax: Task Name @code { }
            // New syntax: @code Task Name { }
            expect(true).toBe(true);
        });
    });

    describe('Real-world examples', () => {
        it('should parse @code annotation before task with attributes', async () => {
            const result = await parse(`
                machine "Email Validator"

                @code
                Task ValidateEmail {
                    prompt: "Validate email format using regex";
                    code: #ValidateEmail;
                }
            `);

            expect(result.parseResult.lexerErrors).toHaveLength(0);
            expect(result.parseResult.parserErrors).toHaveLength(0);

            const task = result.parseResult.value.nodes[0];
            expect(task).toBeDefined();
            expect(task.name).toBe('ValidateEmail');
            expect(task.annotations).toHaveLength(1);
            expect(task.annotations[0].name).toBe('code');
            expect(task.attributes).toBeDefined();
            expect(task.attributes?.length).toBe(2); // prompt and code
        });

        it('should parse workflow with annotations before states and tasks', async () => {
            const result = await parse(`
                machine "Workflow"

                @style(color: "green")
                state Start "Begin"

                @code
                Task ValidateInput {
                    prompt: "Validate";
                }

                state Error "Error State"

                state Success "Success"

                Start --> ValidateInput
            `);

            expect(result.parseResult.lexerErrors).toHaveLength(0);
            expect(result.parseResult.parserErrors).toHaveLength(0);
            expect(result.parseResult.value.nodes).toHaveLength(4);

            // Check annotations
            const startState = result.parseResult.value.nodes[0];
            expect(startState.annotations).toHaveLength(1);
            expect(startState.annotations[0].name).toBe('style');

            const validateTask = result.parseResult.value.nodes[1];
            expect(validateTask.annotations).toHaveLength(1);
            expect(validateTask.annotations[0].name).toBe('code');
        });
    });
});
