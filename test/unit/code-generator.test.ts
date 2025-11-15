/**
 * Unit tests for CodeGenerator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeGenerator } from '../../src/language/code-generation.js';
import type { LLMClient } from '../../src/language/llm-client.js';

describe('CodeGenerator', () => {
    let mockLLMClient: LLMClient;
    let codeGenerator: CodeGenerator;

    beforeEach(() => {
        mockLLMClient = {
            generateCode: vi.fn(),
            call: vi.fn(),
            callStream: vi.fn()
        } as any;
        codeGenerator = new CodeGenerator(mockLLMClient);
    });

    describe('generateCode', () => {
        it('should generate code with basic input', async () => {
            const mockCode = `export async function ValidateEmail(input: any): Promise<any> {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(input);
}`;

            (mockLLMClient.generateCode as any).mockResolvedValue(mockCode);

            const result = await codeGenerator.generateCode({
                taskName: 'ValidateEmail',
                prompt: 'Validate email format',
                externalRef: '#ValidateEmail',
                dygramFilePath: '/test/example.dygram'
            });

            expect(result.code).toBe(mockCode);
            expect(result.path).toContain('example.ValidateEmail.ts');
            expect(mockLLMClient.generateCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    taskName: 'ValidateEmail',
                    prompt: 'Validate email format'
                })
            );
        });

        it('should include schema in generation when provided', async () => {
            const mockCode = `export async function ProcessData(input: { data: string }): Promise<{ result: number }> {
    return { result: input.data.length };
}`;

            (mockLLMClient.generateCode as any).mockResolvedValue(mockCode);

            const result = await codeGenerator.generateCode({
                taskName: 'ProcessData',
                prompt: 'Process input data',
                schema: {
                    input: { type: 'object', properties: { data: { type: 'string' } } },
                    output: { type: 'object', properties: { result: { type: 'number' } } }
                },
                externalRef: '#ProcessData',
                dygramFilePath: '/test/example.dygram'
            });

            expect(result.code).toBe(mockCode);
            expect(mockLLMClient.generateCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    schema: expect.objectContaining({
                        input: expect.any(Object),
                        output: expect.any(Object)
                    })
                })
            );
        });

        it('should save generated code to file', async () => {
            const mockCode = 'export async function Test(input: any): Promise<any> { return input; }';
            (mockLLMClient.generateCode as any).mockResolvedValue(mockCode);

            const result = await codeGenerator.generateCode({
                taskName: 'Test',
                prompt: 'Test task',
                externalRef: '#Test',
                dygramFilePath: '/test/example.dygram'
            });

            expect(result.path).toContain('.Test.ts');
            // Note: File saving is tested in integration tests
        });
    });

    describe('regenerateCode', () => {
        it('should regenerate code with error context', async () => {
            const mockCode = `export async function ValidateEmail(input: string): Promise<boolean> {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(input);
}`;

            (mockLLMClient.generateCode as any).mockResolvedValue(mockCode);

            const result = await codeGenerator.regenerateCode({
                taskName: 'ValidateEmail',
                prompt: 'Validate email format',
                externalRef: '#ValidateEmail',
                dygramFilePath: '/test/example.dygram',
                previousCode: 'export async function ValidateEmail(input: any): Promise<any> { return false; }',
                error: new Error('Type mismatch: expected boolean, got any')
            });

            expect(result.code).toBe(mockCode);
            expect(mockLLMClient.generateCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    previousCode: expect.any(String),
                    error: expect.any(Error)
                })
            );
        });

        it('should regenerate code with schema mismatch', async () => {
            const mockCode = 'export async function Test(input: string): Promise<number> { return 42; }';
            (mockLLMClient.generateCode as any).mockResolvedValue(mockCode);

            const result = await codeGenerator.regenerateCode({
                taskName: 'Test',
                prompt: 'Test task',
                schema: {
                    input: { type: 'string' },
                    output: { type: 'number' }
                },
                externalRef: '#Test',
                dygramFilePath: '/test/example.dygram',
                previousCode: 'export async function Test(input: any): Promise<any> { return "wrong"; }',
                schemaMismatch: { expected: 'number', actual: 'string' }
            });

            expect(result.code).toBe(mockCode);
        });
    });

    describe('Code path resolution', () => {
        it('should resolve code path correctly for external reference', () => {
            const { resolveCodePath } = require('../../src/language/code-generation.js');

            const path = resolveCodePath('#ValidateEmail', '/test/example.dygram');
            expect(path).toContain('example.ValidateEmail.ts');
        });

        it('should handle different file extensions', () => {
            const { resolveCodePath } = require('../../src/language/code-generation.js');

            const path = resolveCodePath('#Task', '/test/app.machine');
            expect(path).toContain('app.Task.ts');
        });
    });

    describe('Error handling', () => {
        it('should throw error when LLM client fails', async () => {
            (mockLLMClient.generateCode as any).mockRejectedValue(new Error('API Error'));

            await expect(
                codeGenerator.generateCode({
                    taskName: 'Test',
                    prompt: 'Test',
                    externalRef: '#Test',
                    dygramFilePath: '/test/example.dygram'
                })
            ).rejects.toThrow('API Error');
        });

        it('should throw error for invalid external reference', async () => {
            await expect(
                codeGenerator.generateCode({
                    taskName: 'Test',
                    prompt: 'Test',
                    externalRef: 'InvalidRef', // Missing #
                    dygramFilePath: '/test/example.dygram'
                })
            ).rejects.toThrow();
        });
    });
});
