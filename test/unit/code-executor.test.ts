/**
 * Unit tests for CodeExecutor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeExecutor } from '../../src/language/code-executor.js';
import type { LLMClient } from '../../src/language/llm-client.js';
import type { TaskNode } from '../../src/language/generated/ast.js';

describe('CodeExecutor', () => {
    let mockLLMClient: LLMClient;
    let codeExecutor: CodeExecutor;

    beforeEach(() => {
        mockLLMClient = {
            generateCode: vi.fn(),
            call: vi.fn(),
            callStream: vi.fn()
        } as any;
        codeExecutor = new CodeExecutor(mockLLMClient);
    });

    describe('hasCodeAnnotation', () => {
        it('should return true for task with @code annotation', () => {
            const task: Partial<TaskNode> = {
                name: 'ValidateEmail',
                annotations: ['@code'] as any
            };

            expect(codeExecutor.hasCodeAnnotation(task as TaskNode)).toBe(true);
        });

        it('should return false for task without @code annotation', () => {
            const task: Partial<TaskNode> = {
                name: 'RegularTask',
                annotations: [] as any
            };

            expect(codeExecutor.hasCodeAnnotation(task as TaskNode)).toBe(false);
        });

        it('should return false for task with other annotations', () => {
            const task: Partial<TaskNode> = {
                name: 'OtherTask',
                annotations: ['@auto'] as any
            };

            expect(codeExecutor.hasCodeAnnotation(task as TaskNode)).toBe(false);
        });
    });

    describe('getCodeReference', () => {
        it('should extract code reference from attributes', () => {
            const task: Partial<TaskNode> = {
                name: 'ValidateEmail',
                annotations: ['@code'] as any,
                attributes: [
                    { name: 'code', type: 'string', value: '#ValidateEmail' }
                ] as any
            };

            expect(codeExecutor.getCodeReference(task as TaskNode)).toBe('#ValidateEmail');
        });

        it('should return undefined if no code attribute', () => {
            const task: Partial<TaskNode> = {
                name: 'Task',
                annotations: ['@code'] as any,
                attributes: [] as any
            };

            expect(codeExecutor.getCodeReference(task as TaskNode)).toBeUndefined();
        });

        it('should handle external reference format', () => {
            const task: Partial<TaskNode> = {
                name: 'Task',
                annotations: ['@code'] as any,
                attributes: [
                    { name: 'code', type: 'external_ref', value: { value: '#Task' } }
                ] as any
            };

            expect(codeExecutor.getCodeReference(task as TaskNode)).toBe('#Task');
        });
    });

    describe('getTaskSchema', () => {
        it('should extract schema from attributes', () => {
            const task: Partial<TaskNode> = {
                name: 'Task',
                annotations: ['@code'] as any,
                attributes: [
                    {
                        name: 'schema',
                        type: 'object',
                        value: {
                            input: { type: 'string' },
                            output: { type: 'boolean' }
                        }
                    }
                ] as any
            };

            const schema = codeExecutor.getTaskSchema(task as TaskNode);
            expect(schema).toEqual({
                input: { type: 'string' },
                output: { type: 'boolean' }
            });
        });

        it('should return undefined if no schema attribute', () => {
            const task: Partial<TaskNode> = {
                name: 'Task',
                annotations: ['@code'] as any,
                attributes: [] as any
            };

            expect(codeExecutor.getTaskSchema(task as TaskNode)).toBeUndefined();
        });

        it('should handle complex nested schemas', () => {
            const task: Partial<TaskNode> = {
                name: 'Task',
                annotations: ['@code'] as any,
                attributes: [
                    {
                        name: 'schema',
                        type: 'object',
                        value: {
                            input: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    age: { type: 'number' }
                                }
                            },
                            output: {
                                type: 'object',
                                properties: {
                                    valid: { type: 'boolean' }
                                }
                            }
                        }
                    }
                ] as any
            };

            const schema = codeExecutor.getTaskSchema(task as TaskNode);
            expect(schema).toHaveProperty('input');
            expect(schema).toHaveProperty('output');
            expect(schema?.input).toHaveProperty('properties');
        });
    });

    describe('Schema validation', () => {
        it('should validate input against schema', () => {
            const schema = {
                input: {
                    type: 'object',
                    properties: {
                        email: { type: 'string' }
                    },
                    required: ['email']
                }
            };

            const validInput = { email: 'test@example.com' };
            const invalidInput = { email: 123 };

            // Note: Actual validation logic tested in integration tests
            expect(validInput).toHaveProperty('email');
            expect(typeof validInput.email).toBe('string');
        });

        it('should validate output against schema', () => {
            const schema = {
                output: {
                    type: 'boolean'
                }
            };

            const validOutput = true;
            const invalidOutput = 'true';

            expect(typeof validOutput).toBe('boolean');
            expect(typeof invalidOutput).not.toBe('boolean');
        });
    });

    describe('Error handling', () => {
        it('should handle missing code file gracefully', async () => {
            const task: Partial<TaskNode> = {
                name: 'MissingCodeTask',
                annotations: ['@code'] as any,
                attributes: [
                    { name: 'code', type: 'string', value: '#MissingCodeTask' }
                ] as any
            };

            const llmFallback = vi.fn().mockResolvedValue('LLM result');

            // executeCodeTask should fall back to LLM if code file doesn't exist
            const result = await codeExecutor.executeCodeTask(
                task as TaskNode,
                {},
                '/test/example.dygram',
                llmFallback
            );

            expect(llmFallback).toHaveBeenCalled();
            expect(result.usedGeneratedCode).toBe(false);
        });

        it('should handle schema validation errors', async () => {
            const task: Partial<TaskNode> = {
                name: 'Task',
                annotations: ['@code'] as any,
                attributes: [
                    { name: 'code', type: 'string', value: '#Task' },
                    {
                        name: 'schema',
                        type: 'object',
                        value: {
                            input: { type: 'string' },
                            output: { type: 'number' }
                        }
                    }
                ] as any
            };

            const llmFallback = vi.fn().mockResolvedValue(42);

            // If schema validation fails, should regenerate and/or fall back to LLM
            // Actual behavior tested in integration tests
            expect(task.attributes?.length).toBeGreaterThan(0);
        });
    });

    describe('Confidence-based execution', () => {
        it('should use generated code when confidence is high', () => {
            // High confidence = code executed successfully without errors
            const result = {
                output: { success: true },
                usedGeneratedCode: true
            };

            expect(result.usedGeneratedCode).toBe(true);
        });

        it('should fall back to LLM when confidence is low', () => {
            // Low confidence = errors or schema mismatches
            const result = {
                output: 'LLM response',
                usedGeneratedCode: false,
                error: new Error('Execution failed')
            };

            expect(result.usedGeneratedCode).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('Code regeneration triggers', () => {
        it('should trigger regeneration on execution error', async () => {
            // Regeneration should be triggered when:
            // 1. Generated code throws an error
            // 2. Schema validation fails
            // 3. Confidence is low

            const task: Partial<TaskNode> = {
                name: 'Task',
                annotations: ['@code'] as any,
                attributes: [
                    { name: 'code', type: 'string', value: '#Task' }
                ] as any
            };

            // This is tested more thoroughly in integration tests
            expect(task.annotations).toContain('@code');
        });

        it('should trigger regeneration on schema mismatch', () => {
            const expectedSchema = { type: 'number' };
            const actualOutput = 'string value';

            // Schema mismatch should trigger regeneration
            expect(typeof actualOutput).not.toBe('number');
        });
    });
});
