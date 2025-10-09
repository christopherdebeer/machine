import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MachineExecutor, MachineData } from '../../src/language/machine-executor';
import { BedrockClient } from '../../src/language/bedrock-client';
import { compilePrompt, TaskPromptContext } from '../../src/language/prompts/task-prompts';

// Mock the BedrockClient
vi.mock('../../src/language/bedrock-client', () => {
    return {
        BedrockClient: vi.fn().mockImplementation(() => ({
            invokeModel: vi.fn().mockImplementation(async (prompt: string) => {
                return 'Task complete: Mock task result';
            }),
            invokeWithTools: vi.fn().mockImplementation(async (messages: any[], tools: any[]) => {
                return {
                    content: [{ type: 'text', text: 'Task complete: Mock task result' }],
                    stop_reason: 'end_turn'
                };
            }),
            extractText: vi.fn().mockImplementation((response: any) => {
                const textBlocks = response.content.filter((block: any) => block.type === 'text');
                return textBlocks.map((block: any) => block.text).join('\n');
            }),
            extractToolUses: vi.fn().mockImplementation((response: any) => {
                return response.content.filter((block: any) => block.type === 'tool_use');
            })
        }))
    };
});

describe('Template Variable Interpolation Bug', () => {
    describe('compilePrompt function', () => {
        it('should properly stringify object attributes instead of [Object object]', () => {
            const context: TaskPromptContext = {
                title: 'Test Task',
                description: 'Test Description',
                prompt: 'Test prompt',
                attributes: {
                    simpleString: 'hello',
                    numberValue: 42,
                    objectValue: { key: 'value', nested: { deep: 'data' } },
                    arrayValue: ['item1', 'item2', 'item3']
                }
            };

            const compiled = compilePrompt(
                'Title: {{title}}\n\nAttributes:\n{{#each attributes}}- {{@key}}: {{this}}\n{{/each}}',
                context
            );

            // Should not contain [Object object]
            expect(compiled).not.toContain('[Object object]');
            expect(compiled).not.toContain('[object Object]');

            // Should contain properly stringified object
            expect(compiled).toContain('objectValue');
            expect(compiled).toContain('key');
            expect(compiled).toContain('value');

            // Should contain properly stringified array
            expect(compiled).toContain('arrayValue');
            expect(compiled).toContain('item1');
            expect(compiled).toContain('item2');
        });

        it('should handle nested objects in attributes', () => {
            const context: TaskPromptContext = {
                title: 'Complex Test',
                attributes: {
                    config: {
                        database: {
                            host: 'localhost',
                            port: 5432
                        }
                    }
                }
            };

            const compiled = compilePrompt(
                'Attributes:\n{{#each attributes}}- {{@key}}: {{this}}\n{{/each}}',
                context
            );

            expect(compiled).not.toContain('[Object object]');
            expect(compiled).toContain('database');
            expect(compiled).toContain('localhost');
            expect(compiled).toContain('5432');
        });
    });

    describe('MachineExecutor template interpolation', () => {
        let executor: MachineExecutor;

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should interpolate object values in task prompts without [Object object]', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    {
                        name: 'input',
                        type: 'Input',
                        attributes: [
                            { name: 'data', type: 'object', value: JSON.stringify({ user: 'john', age: 30 }) },
                            { name: 'tags', type: 'array', value: JSON.stringify(['tag1', 'tag2']) }
                        ]
                    },
                    {
                        name: 'processor',
                        type: 'task',
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Process: {{ input.data }} with tags {{ input.tags }}' }
                        ]
                    },
                    {
                        name: 'end',
                        type: 'end'
                    }
                ],
                edges: [
                    { source: 'input', target: 'processor' },
                    { source: 'processor', target: 'end' }
                ]
            };

            executor = new MachineExecutor(machineData);

            // Move to processor node
            await executor.step();
            await executor.step();

            const context = executor.getContext();

            // Check that the execution history doesn't contain [Object object]
            const hasObjectString = context.history.some(step =>
                step.output && (
                    step.output.includes('[Object object]') ||
                    step.output.includes('[object Object]')
                )
            );

            expect(hasObjectString).toBe(false);
        });

        it('should handle complex nested objects in template variables', async () => {
            const complexObject = {
                user: {
                    name: 'Alice',
                    preferences: {
                        theme: 'dark',
                        notifications: true
                    }
                },
                metadata: {
                    timestamp: '2024-01-01',
                    version: '1.0'
                }
            };

            const machineData: MachineData = {
                title: 'Complex Test Machine',
                nodes: [
                    {
                        name: 'config',
                        type: 'Input',
                        attributes: [
                            { name: 'settings', type: 'object', value: JSON.stringify(complexObject) }
                        ]
                    },
                    {
                        name: 'task',
                        type: 'task',
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Use config: {{ config.settings }}' }
                        ]
                    },
                    {
                        name: 'end',
                        type: 'end'
                    }
                ],
                edges: [
                    { source: 'config', target: 'task' },
                    { source: 'task', target: 'end' }
                ]
            };

            executor = new MachineExecutor(machineData);

            await executor.step();
            await executor.step();

            const context = executor.getContext();

            // Verify no [Object object] in the output
            context.history.forEach(step => {
                if (step.output) {
                    expect(step.output).not.toContain('[Object object]');
                    expect(step.output).not.toContain('[object Object]');
                }
            });
        });

        it('should properly stringify arrays in template variables', async () => {
            const machineData: MachineData = {
                title: 'Array Test Machine',
                nodes: [
                    {
                        name: 'input',
                        type: 'Input',
                        attributes: [
                            { name: 'items', type: 'array', value: JSON.stringify(['apple', 'banana', 'orange']) }
                        ]
                    },
                    {
                        name: 'task',
                        type: 'task',
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Process items: {{ input.items }}' }
                        ]
                    },
                    {
                        name: 'end',
                        type: 'end'
                    }
                ],
                edges: [
                    { source: 'input', target: 'task' },
                    { source: 'task', target: 'end' }
                ]
            };

            executor = new MachineExecutor(machineData);

            await executor.step();
            await executor.step();

            const context = executor.getContext();

            // Arrays should be properly stringified
            context.history.forEach(step => {
                if (step.output) {
                    expect(step.output).not.toContain('[Object object]');
                    expect(step.output).not.toContain('[object Object]');
                }
            });
        });
    });

    describe('Execution history output formatting', () => {
        it('should properly format object outputs in execution history', async () => {
            const machineData: MachineData = {
                title: 'Output Test Machine',
                nodes: [
                    {
                        name: 'start',
                        type: 'task',
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Generate output' }
                        ]
                    },
                    {
                        name: 'end',
                        type: 'end'
                    }
                ],
                edges: [
                    { source: 'start', target: 'end' }
                ]
            };

            const executor = new MachineExecutor(machineData);

            // Manually set output to an object to test formatting
            await executor.step();

            const context = executor.getContext();

            // If output is an object, it should be stringified properly
            context.history.forEach(step => {
                if (step.output && typeof step.output === 'object') {
                    const stringified = String(step.output);
                    expect(stringified).not.toBe('[object Object]');
                }
            });
        });
    });
});
