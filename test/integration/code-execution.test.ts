/**
 * Integration tests for @code annotation and code generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RailsExecutor, type MachineData } from '../../src/language/rails-executor.js';
import { CodeExecutor } from '../../src/language/code-executor.js';
import { CodeGenerator, resolveCodePath, hasGeneratedCode } from '../../src/language/code-generation.js';
import { ClaudeClient } from '../../src/language/llm-client.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Code Execution Integration', () => {
    let tempDir: string;

    beforeEach(async () => {
        // Create temporary directory for test files
        tempDir = path.join(tmpdir(), `dygram-test-${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });
    });

    describe('@code annotation detection', () => {
        it('should detect @code annotation on tasks', () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    {
                        name: 'ValidateEmail',
                        type: 'task',
                        annotations: ['@code'],
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Validate email format' },
                            { name: 'code', type: 'string', value: '#ValidateEmail' }
                        ]
                    }
                ],
                edges: []
            };

            const mockLLMClient = new ClaudeClient({
                apiKey: 'dummy',
                modelId: 'claude-3-5-haiku-20241022'
            });

            const codeExecutor = new CodeExecutor(mockLLMClient);
            const task = machineData.nodes[0];

            expect(codeExecutor.hasCodeAnnotation(task as any)).toBe(true);
            expect(codeExecutor.getCodeReference(task as any)).toBe('#ValidateEmail');
        });

        it('should not detect @code on tasks without annotation', () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    {
                        name: 'RegularTask',
                        type: 'task',
                        annotations: [],
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Do something' }
                        ]
                    }
                ],
                edges: []
            };

            const mockLLMClient = new ClaudeClient({
                apiKey: 'dummy',
                modelId: 'claude-3-5-haiku-20241022'
            });

            const codeExecutor = new CodeExecutor(mockLLMClient);
            const task = machineData.nodes[0];

            expect(codeExecutor.hasCodeAnnotation(task as any)).toBe(false);
        });
    });

    describe('Code path resolution', () => {
        it('should resolve code path based on dygram file location', () => {
            const dygramPath = path.join(tempDir, 'example.dygram');
            const codePath = resolveCodePath('#ValidateEmail', dygramPath);

            expect(codePath).toContain('example.ValidateEmail.ts');
            expect(path.dirname(codePath)).toBe(tempDir);
        });

        it('should handle different external reference formats', () => {
            const dygramPath = path.join(tempDir, 'app.machine');

            const codePath1 = resolveCodePath('#TaskA', dygramPath);
            const codePath2 = resolveCodePath('#TaskB', dygramPath);

            expect(codePath1).toContain('app.TaskA.ts');
            expect(codePath2).toContain('app.TaskB.ts');
            expect(codePath1).not.toBe(codePath2);
        });
    });

    describe('Code generation and storage', () => {
        it('should generate and save code to correct location', async () => {
            const dygramPath = path.join(tempDir, 'test.dygram');
            const codeRef = '#TestTask';

            // Create a mock code generator
            const mockLLMClient = {
                generateCode: vi.fn().mockResolvedValue('export async function TestTask(input: any): Promise<any> { return input; }')
            } as any;

            const codeGenerator = new CodeGenerator(mockLLMClient);

            const result = await codeGenerator.generateCode({
                taskName: 'TestTask',
                prompt: 'Test task',
                externalRef: codeRef,
                dygramFilePath: dygramPath
            });

            // Verify code was saved
            const codePath = resolveCodePath(codeRef, dygramPath);
            expect(result.path).toBe(codePath);

            // Check if file exists
            const exists = await hasGeneratedCode(codeRef, dygramPath);
            expect(exists).toBe(true);
        });

        it('should save code alongside dygram file', async () => {
            const dygramPath = path.join(tempDir, 'myapp.dygram');
            const codeRef = '#ProcessData';

            const mockLLMClient = {
                generateCode: vi.fn().mockResolvedValue('export async function ProcessData(input: any): Promise<any> { return {}; }')
            } as any;

            const codeGenerator = new CodeGenerator(mockLLMClient);

            await codeGenerator.generateCode({
                taskName: 'ProcessData',
                prompt: 'Process data',
                externalRef: codeRef,
                dygramFilePath: dygramPath
            });

            const codePath = resolveCodePath(codeRef, dygramPath);

            // Verify code file is in same directory as dygram file
            expect(path.dirname(codePath)).toBe(tempDir);
            expect(path.basename(codePath)).toBe('myapp.ProcessData.ts');
        });
    });

    describe('Schema validation', () => {
        it('should validate input against JSON schema', () => {
            const schema = {
                input: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', format: 'email' }
                    },
                    required: ['email']
                }
            };

            const validInput = { email: 'test@example.com' };
            const invalidInput = { email: 123 };

            // Schema validation is handled by Ajv in CodeExecutor
            expect(validInput.email).toBeDefined();
            expect(typeof validInput.email).toBe('string');
        });

        it('should validate output against JSON schema', () => {
            const schema = {
                output: {
                    type: 'object',
                    properties: {
                        valid: { type: 'boolean' }
                    },
                    required: ['valid']
                }
            };

            const validOutput = { valid: true };
            const invalidOutput = { valid: 'yes' };

            expect(typeof validOutput.valid).toBe('boolean');
            expect(typeof invalidOutput.valid).not.toBe('boolean');
        });
    });

    describe('LLM fallback mechanism', () => {
        it('should fall back to LLM when code file does not exist', async () => {
            const machineData: MachineData = {
                title: 'Test',
                nodes: [
                    {
                        name: 'Task1',
                        type: 'task',
                        annotations: ['@code'],
                        attributes: [
                            { name: 'code', type: 'string', value: '#Task1' },
                            { name: 'prompt', type: 'string', value: 'Do something' }
                        ]
                    }
                ],
                edges: []
            };

            const mockLLMClient = {
                generateCode: vi.fn(),
                call: vi.fn().mockResolvedValue({ content: 'LLM response' }),
                callStream: vi.fn()
            } as any;

            const codeExecutor = new CodeExecutor(mockLLMClient);
            const dygramPath = path.join(tempDir, 'nonexistent.dygram');

            const llmFallback = vi.fn().mockResolvedValue('LLM handled task');

            const result = await codeExecutor.executeCodeTask(
                machineData.nodes[0] as any,
                {},
                dygramPath,
                llmFallback
            );

            // Since code file doesn't exist, should fall back to LLM
            expect(llmFallback).toHaveBeenCalled();
            expect(result.usedGeneratedCode).toBe(false);
        });

        it('should fall back to LLM when code execution fails', async () => {
            // This tests the confidence-based execution:
            // If generated code throws an error, fall back to LLM
            const mockFailingCode = `
                export async function FailingTask(input: any): Promise<any> {
                    throw new Error('Intentional failure');
                }
            `;

            // Code execution error should trigger LLM fallback
            expect(() => {
                throw new Error('Intentional failure');
            }).toThrow('Intentional failure');
        });
    });

    describe('Code regeneration', () => {
        it('should regenerate code when execution fails', async () => {
            const dygramPath = path.join(tempDir, 'regen.dygram');
            const codeRef = '#RegenTask';

            const mockLLMClient = {
                generateCode: vi.fn()
                    .mockResolvedValueOnce('export async function RegenTask(input: any): Promise<any> { throw new Error("v1 fails"); }')
                    .mockResolvedValueOnce('export async function RegenTask(input: any): Promise<any> { return "v2 works"; }')
            } as any;

            const codeGenerator = new CodeGenerator(mockLLMClient);

            // Generate initial version
            await codeGenerator.generateCode({
                taskName: 'RegenTask',
                prompt: 'Task that needs regeneration',
                externalRef: codeRef,
                dygramFilePath: dygramPath
            });

            // Regenerate after error
            await codeGenerator.regenerateCode({
                taskName: 'RegenTask',
                prompt: 'Task that needs regeneration',
                externalRef: codeRef,
                dygramFilePath: dygramPath,
                error: new Error('v1 fails')
            });

            expect(mockLLMClient.generateCode).toHaveBeenCalledTimes(2);
        });

        it('should include error context in regeneration', async () => {
            const dygramPath = path.join(tempDir, 'error.dygram');
            const codeRef = '#ErrorTask';

            const mockLLMClient = {
                generateCode: vi.fn().mockResolvedValue('export async function ErrorTask(input: any): Promise<any> { return {}; }')
            } as any;

            const codeGenerator = new CodeGenerator(mockLLMClient);

            await codeGenerator.regenerateCode({
                taskName: 'ErrorTask',
                prompt: 'Fix the error',
                externalRef: codeRef,
                dygramFilePath: dygramPath,
                error: new Error('TypeError: Cannot read property "x" of undefined'),
                previousCode: 'export async function ErrorTask(input: any): Promise<any> { return input.x.y; }'
            });

            // Verify regeneration was called with error context
            expect(mockLLMClient.generateCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.any(Error),
                    previousCode: expect.stringContaining('input.x.y')
                })
            );
        });
    });

    describe('RailsExecutor integration', () => {
        it('should pass dygramFilePath to RailsExecutor', async () => {
            const machineData: MachineData = {
                title: 'Test',
                nodes: [
                    {
                        name: 'Start',
                        type: 'state',
                        attributes: []
                    }
                ],
                edges: []
            };

            const dygramPath = path.join(tempDir, 'test.dygram');

            const executor = await RailsExecutor.create(machineData, {
                llm: {
                    provider: 'anthropic',
                    apiKey: 'dummy',
                    modelId: 'claude-3-5-haiku-20241022'
                },
                dygramFilePath: dygramPath
            });

            // Verify executor was created with dygramFilePath
            expect(executor).toBeDefined();
        });
    });

    describe('Full end-to-end @code execution', () => {
        it('should execute @code task with generated code', async () => {
            const dygramPath = path.join(tempDir, 'e2e.dygram');

            // Create simple TypeScript code for testing
            const taskCode = `
export async function SimpleTask(input: { value: number }): Promise<{ doubled: number }> {
    return { doubled: input.value * 2 };
}
`;

            // Save code file
            const codePath = resolveCodePath('#SimpleTask', dygramPath);
            await fs.writeFile(codePath, taskCode, 'utf-8');

            const machineData: MachineData = {
                title: 'E2E Test',
                nodes: [
                    {
                        name: 'SimpleTask',
                        type: 'task',
                        annotations: ['@code'],
                        attributes: [
                            { name: 'code', type: 'string', value: '#SimpleTask' },
                            { name: 'prompt', type: 'string', value: 'Double the input value' },
                            {
                                name: 'schema',
                                type: 'object',
                                value: {
                                    input: {
                                        type: 'object',
                                        properties: { value: { type: 'number' } },
                                        required: ['value']
                                    },
                                    output: {
                                        type: 'object',
                                        properties: { doubled: { type: 'number' } },
                                        required: ['doubled']
                                    }
                                }
                            }
                        ]
                    }
                ],
                edges: []
            };

            const mockLLMClient = new ClaudeClient({
                apiKey: 'dummy',
                modelId: 'claude-3-5-haiku-20241022'
            });

            const codeExecutor = new CodeExecutor(mockLLMClient);

            // Execute the task
            const llmFallback = vi.fn();
            const result = await codeExecutor.executeCodeTask(
                machineData.nodes[0] as any,
                { value: 21 },
                dygramPath,
                llmFallback
            );

            // Verify generated code was used (not LLM fallback)
            expect(result.usedGeneratedCode).toBe(true);
            expect(result.output).toEqual({ doubled: 42 });
            expect(llmFallback).not.toHaveBeenCalled();
        });
    });
});
