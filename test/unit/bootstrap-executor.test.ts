/**
 * Tests for Bootstrap Executor (Layer 1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BootstrapExecutor, createBootstrapExecutor, BootstrapContext, BootstrapTool } from '../../src/language/bootstrap-executor.js';
import { MachineData } from '../../src/language/base-executor.js';

describe('BootstrapExecutor', () => {
    let executor: BootstrapExecutor;

    beforeEach(() => {
        executor = new BootstrapExecutor();
    });

    describe('Tool Registration', () => {
        it('should register a tool', () => {
            const mockTool = async (input: any) => ({ result: 'success' });
            executor.registerTool('test_tool', mockTool);

            expect(executor.hasTool('test_tool')).toBe(true);
        });

        it('should list registered tools', () => {
            const mockTool = async (input: any) => ({ result: 'success' });
            executor.registerTool('tool1', mockTool);
            executor.registerTool('tool2', mockTool);

            const tools = executor.getRegisteredTools();
            expect(tools).toContain('tool1');
            expect(tools).toContain('tool2');
            expect(tools.length).toBe(2);
        });

        it('should invoke a registered tool', async () => {
            const mockTool = async (input: any, context: BootstrapContext) => {
                return { result: 'success', input };
            };
            executor.registerTool('test_tool', mockTool);

            const context = executor.getContext();
            const result = await executor.invokeTool('test_tool', { data: 'test' }, context);

            expect(result.result).toBe('success');
            expect(result.input.data).toBe('test');
        });

        it('should throw error for unregistered tool', async () => {
            const context = executor.getContext();
            await expect(
                executor.invokeTool('nonexistent_tool', {}, context)
            ).rejects.toThrow('Tool not found: nonexistent_tool');
        });
    });

    describe('Node Execution', () => {
        it('should execute a simple task node', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    { name: 'task1', type: 'Task' }
                ],
                edges: []
            };

            const context = executor.getContext();
            const result = await executor.executeNode('task1', machineData, context);

            expect(result.success).toBe(true);
            expect(context.visitedNodes).toContain('task1');
            expect(context.nodeInvocationCounts.get('task1')).toBe(1);
        });

        it('should execute a task node with tool invocation', async () => {
            const mockTool = async (input: any) => ({ computed: 42 });
            executor.registerTool('compute', mockTool);

            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    {
                        name: 'computeTask',
                        type: 'Task',
                        attributes: [
                            { name: 'uses', type: 'string', value: '"compute"' }
                        ]
                    }
                ],
                edges: []
            };

            const context = executor.getContext();
            const result = await executor.executeNode('computeTask', machineData, context);

            expect(result.success).toBe(true);
            expect(result.output).toEqual({ computed: 42 });
        });

        it('should handle input node with attributes', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    {
                        name: 'input1',
                        type: 'Input',
                        attributes: [
                            { name: 'value', type: 'string', value: '"hello"' },
                            { name: 'count', type: 'number', value: '42' }
                        ]
                    }
                ],
                edges: []
            };

            const context = executor.getContext();
            const result = await executor.executeNode('input1', machineData, context);

            expect(result.success).toBe(true);
            expect(context.attributes.get('input1.value')).toBe('hello');
            expect(context.attributes.get('input1.count')).toBe(42);
        });

        it('should handle result node', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    {
                        name: 'result1',
                        type: 'Result',
                        attributes: [
                            { name: 'success', type: 'boolean', value: 'true' },
                            { name: 'data', type: 'string', value: '"output"' }
                        ]
                    }
                ],
                edges: []
            };

            const context = executor.getContext();
            const result = await executor.executeNode('result1', machineData, context);

            expect(result.success).toBe(true);
            expect(result.output).toEqual({
                success: true,
                data: 'output'
            });
        });

        it('should return error for nonexistent node', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [],
                edges: []
            };

            const context = executor.getContext();
            const result = await executor.executeNode('nonexistent', machineData, context);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Node not found');
        });

        it('should track node invocation counts', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    { name: 'task1', type: 'Task' }
                ],
                edges: []
            };

            const context = executor.getContext();

            await executor.executeNode('task1', machineData, context);
            await executor.executeNode('task1', machineData, context);
            await executor.executeNode('task1', machineData, context);

            expect(context.nodeInvocationCounts.get('task1')).toBe(3);
        });
    });

    describe('Edge Following', () => {
        it('should follow an edge between nodes', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    { name: 'node1', type: 'Task' },
                    { name: 'node2', type: 'Task' }
                ],
                edges: [
                    { source: 'node1', target: 'node2' }
                ]
            };

            const context = executor.getContext();
            context.currentNode = 'node1';

            await executor.followEdge('node1', 'node2', machineData, context);

            expect(context.currentNode).toBe('node2');
            expect(context.history.length).toBe(1);
            expect(context.history[0].from).toBe('node1');
            expect(context.history[0].to).toBe('node2');
        });

        it('should throw error for nonexistent edge', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    { name: 'node1', type: 'Task' },
                    { name: 'node2', type: 'Task' }
                ],
                edges: []
            };

            const context = executor.getContext();
            context.currentNode = 'node1';

            await expect(
                executor.followEdge('node1', 'node2', machineData, context)
            ).rejects.toThrow('No edge found from node1 to node2');
        });

        it('should record transition history', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    { name: 'a', type: 'Task' },
                    { name: 'b', type: 'Task' },
                    { name: 'c', type: 'Task' }
                ],
                edges: [
                    { source: 'a', target: 'b' },
                    { source: 'b', target: 'c' }
                ]
            };

            const context = executor.getContext();
            context.currentNode = 'a';

            await executor.followEdge('a', 'b', machineData, context);
            await executor.followEdge('b', 'c', machineData, context);

            expect(context.history.length).toBe(2);
            expect(context.history[0]).toMatchObject({ from: 'a', to: 'b' });
            expect(context.history[1]).toMatchObject({ from: 'b', to: 'c' });
        });
    });

    describe('Transition Finding', () => {
        it('should find available transitions', () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    { name: 'start', type: 'Task' },
                    { name: 'option1', type: 'Task' },
                    { name: 'option2', type: 'Task' }
                ],
                edges: [
                    { source: 'start', target: 'option1' },
                    { source: 'start', target: 'option2' }
                ]
            };

            const transitions = executor.findTransitions('start', machineData);

            expect(transitions).toContain('option1');
            expect(transitions).toContain('option2');
            expect(transitions.length).toBe(2);
        });

        it('should return empty array for node with no outgoing edges', () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    { name: 'terminal', type: 'Task' }
                ],
                edges: []
            };

            const transitions = executor.findTransitions('terminal', machineData);

            expect(transitions).toEqual([]);
        });
    });

    describe('Context Management', () => {
        it('should return current context', () => {
            const context = executor.getContext();

            expect(context).toHaveProperty('currentNode');
            expect(context).toHaveProperty('visitedNodes');
            expect(context).toHaveProperty('attributes');
            expect(context).toHaveProperty('history');
        });

        it('should reset context', () => {
            const context = executor.getContext();
            context.currentNode = 'test';
            context.visitedNodes.push('node1');
            context.attributes.set('key', 'value');

            executor.resetContext();

            const newContext = executor.getContext();
            expect(newContext.currentNode).toBe('');
            expect(newContext.visitedNodes).toEqual([]);
            expect(newContext.attributes.size).toBe(0);
        });
    });

    describe('Helper Function', () => {
        it('should create executor with pre-registered tools', () => {
            const tools: BootstrapTool[] = [
                {
                    name: 'tool1',
                    description: 'Test tool 1',
                    implementation: async () => ({ result: 'tool1' })
                },
                {
                    name: 'tool2',
                    description: 'Test tool 2',
                    implementation: async () => ({ result: 'tool2' })
                }
            ];

            const exec = createBootstrapExecutor(tools);

            expect(exec.hasTool('tool1')).toBe(true);
            expect(exec.hasTool('tool2')).toBe(true);
        });
    });
});
