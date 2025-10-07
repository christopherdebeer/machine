import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MachineExecutor, MachineData } from '../../src/language/machine-executor';
import { BedrockClient } from '../../src/language/bedrock-client';

// Mock the BedrockClient
vi.mock('../../src/language/bedrock-client', () => {
    return {
        BedrockClient: vi.fn().mockImplementation(() => ({
            invokeModel: vi.fn().mockImplementation(async (prompt: string) => {
                // Simple mock that returns a response based on the prompt content
                if (prompt.includes('analysis')) {
                    return 'Analysis complete: Mock analysis result';
                }
                return 'Task complete: Mock task result';
            }),
            invokeWithTools: vi.fn().mockImplementation(async (messages: any[], tools: any[]) => {
                // Mock tool-based invocation
                const prompt = typeof messages[0].content === 'string' ? messages[0].content : '';
                const text = prompt.includes('analysis')
                    ? 'Analysis complete: Mock analysis result'
                    : 'Task complete: Mock task result';

                return {
                    content: [{ type: 'text', text }],
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

describe('Task Node Execution', () => {
    let executor: MachineExecutor;
    let mockMachineData: MachineData;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Setup test machine data
        mockMachineData = {
            title: 'Test Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'task',
                    attributes: [
                        { name: 'title', type: 'string', value: 'Test Task' },
                        { name: 'desc', type: 'string', value: 'A test task description' },
                        { name: 'prompt', type: 'string', value: 'Please process this test task' }
                    ]
                },
                {
                    name: 'analysis',
                    type: 'task',
                    attributes: [
                        { name: 'title', type: 'string', value: 'Analysis Task' },
                        { name: 'desc', type: 'string', value: 'An analysis task' },
                        { name: 'prompt', type: 'string', value: 'Please analyze this data' },
                        { name: 'taskType', type: 'string', value: 'analysis' }
                    ]
                },
                {
                    name: 'end',
                    type: 'end'
                }
            ],
            edges: [
                { source: 'start', target: 'analysis' },
                { source: 'analysis', target: 'end' }
            ]
        };

        executor = new MachineExecutor(mockMachineData);
    });

    it('should execute a basic task node', async () => {
        const result = await executor.step();
        expect(result).toBe(true);

        const context = executor.getContext();
        expect(context.history).toHaveLength(1);
        expect(context.history[0].output).toContain('Task complete');
    });

    it('should execute an analysis task node with specific template', async () => {
        // First step to move past start node
        await executor.step();

        // Execute analysis node
        const result = await executor.step();
        expect(result).toBe(true);

        const context = executor.getContext();
        expect(context.history).toHaveLength(2);
        expect(context.history[1].output).toContain('Analysis complete');
    });

    it('should execute all nodes in sequence', async () => {
        const context = await executor.execute();
        expect(context.history).toHaveLength(2);
        expect(context.visitedNodes.size).toBe(2);
        expect(context.currentNode).toBe('end');
    });

    it('should handle missing attributes gracefully', async () => {
        const minimalMachine: MachineData = {
            title: 'Minimal Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'task'
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

        const minimalExecutor = new MachineExecutor(minimalMachine);
        const result = await minimalExecutor.step();
        expect(result).toBe(true);

        const context = minimalExecutor.getContext();
        expect(context.history).toHaveLength(1);
        expect(context.history[0].output).toBeDefined();
    });
});
