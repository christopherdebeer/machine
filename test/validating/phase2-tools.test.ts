import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MachineExecutor, MachineData } from '../../src/language/machine-executor';
import {
    BedrockClient,
    ToolDefinition,
    ModelResponse,
    ConversationMessage
} from '../../src/language/bedrock-client';

// Mock the BedrockClient
vi.mock('../../src/language/bedrock-client', () => {
    const mockInvokeModel = vi.fn();
    const mockInvokeWithTools = vi.fn();

    return {
        BedrockClient: vi.fn().mockImplementation(() => ({
            invokeModel: mockInvokeModel,
            invokeWithTools: mockInvokeWithTools,
            extractText: (response: ModelResponse) => {
                const textBlocks = response.content.filter(
                    (block: any) => block.type === 'text'
                );
                return textBlocks.map((block: any) => block.text).join('\n');
            },
            extractToolUses: (response: ModelResponse) => {
                return response.content.filter(
                    (block: any) => block.type === 'tool_use'
                );
            }
        }))
    };
});

describe('Phase 2: Tool-Based Execution', () => {
    let executor: MachineExecutor;
    let mockMachineData: MachineData;
    let mockBedrockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup test machine data with branching paths
        mockMachineData = {
            title: 'Test Router Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'task',
                    attributes: [
                        { name: 'prompt', type: 'string', value: 'Classify this input' }
                    ]
                },
                {
                    name: 'pathA',
                    type: 'state'
                },
                {
                    name: 'pathB',
                    type: 'state'
                },
                {
                    name: 'end',
                    type: 'end'
                }
            ],
            edges: [
                { source: 'start', target: 'pathA', type: 'option_a' },
                { source: 'start', target: 'pathB', type: 'option_b' },
                { source: 'pathA', target: 'end' },
                { source: 'pathB', target: 'end' }
            ]
        };

        executor = new MachineExecutor(mockMachineData);
        mockBedrockClient = (BedrockClient as any).mock.results[0].value;
    });

    describe('Transition Tools', () => {
        it('should generate transition tools from outbound edges', async () => {
            // Mock LLM to choose pathA
            mockBedrockClient.invokeWithTools.mockResolvedValueOnce({
                content: [
                    { type: 'text', text: 'I will choose path A' },
                    {
                        type: 'tool_use',
                        id: 'tool_1',
                        name: 'transition',
                        input: { target: 'pathA', reason: 'This input matches criteria for path A' }
                    }
                ],
                stop_reason: 'tool_use'
            });

            await executor.step();

            // Verify the tool was provided to the LLM
            const callArgs = mockBedrockClient.invokeWithTools.mock.calls[0];
            const tools: ToolDefinition[] = callArgs[1];

            expect(tools).toHaveLength(1);
            expect(tools[0].name).toBe('transition');
            expect(tools[0].input_schema.properties.target.enum).toContain('pathA');
            expect(tools[0].input_schema.properties.target.enum).toContain('pathB');

            // Verify the transition was made
            const context = executor.getContext();
            expect(context.currentNode).toBe('pathA');
        });

        it('should let LLM choose pathB via transition tool', async () => {
            // Mock LLM to choose pathB
            mockBedrockClient.invokeWithTools.mockResolvedValueOnce({
                content: [
                    { type: 'text', text: 'I will choose path B' },
                    {
                        type: 'tool_use',
                        id: 'tool_1',
                        name: 'transition',
                        input: { target: 'pathB', reason: 'This input matches criteria for path B' }
                    }
                ],
                stop_reason: 'tool_use'
            });

            await executor.step();

            const context = executor.getContext();
            expect(context.currentNode).toBe('pathB');
            expect(context.history[0].transition).toBe('option_b');
        });

        it('should fallback to first transition if no tool use', async () => {
            // Mock LLM without tool use
            mockBedrockClient.invokeWithTools.mockResolvedValueOnce({
                content: [
                    { type: 'text', text: 'Processing input' }
                ],
                stop_reason: 'end_turn'
            });

            await executor.step();

            const context = executor.getContext();
            // Should take first available transition (pathA)
            expect(context.currentNode).toBe('pathA');
        });
    });

    describe('Meta Tools', () => {
        let metaMachineData: MachineData;

        beforeEach(() => {
            metaMachineData = {
                title: 'Self-Improving Machine',
                nodes: [
                    {
                        name: 'start',
                        type: 'task',
                        attributes: [
                            { name: 'meta', type: 'boolean', value: 'true' },
                            { name: 'prompt', type: 'string', value: 'Analyze and improve' }
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

            executor = new MachineExecutor(metaMachineData);
            mockBedrockClient = (BedrockClient as any).mock.results[0].value;
        });

        it('should provide meta tools to tasks with meta=true', async () => {
            mockBedrockClient.invokeWithTools.mockResolvedValueOnce({
                content: [
                    { type: 'text', text: 'Analyzing machine structure' }
                ],
                stop_reason: 'end_turn'
            });

            await executor.step();

            const callArgs = mockBedrockClient.invokeWithTools.mock.calls[0];
            const tools: ToolDefinition[] = callArgs[1];

            // Should have transition tool + 6 meta tools
            expect(tools.length).toBeGreaterThan(1);

            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('get_machine_definition');
            expect(toolNames).toContain('add_node');
            expect(toolNames).toContain('add_edge');
            expect(toolNames).toContain('modify_node');
            expect(toolNames).toContain('remove_node');
            expect(toolNames).toContain('get_execution_context');
        });

        it('should allow adding nodes via meta tools', async () => {
            // Mock LLM adding a new node
            mockBedrockClient.invokeWithTools
                .mockResolvedValueOnce({
                    content: [
                        { type: 'text', text: 'I will add a new node' },
                        {
                            type: 'tool_use',
                            id: 'tool_1',
                            name: 'add_node',
                            input: {
                                name: 'newNode',
                                type: 'state',
                                attributes: { label: 'New Node' }
                            }
                        }
                    ],
                    stop_reason: 'tool_use'
                })
                .mockResolvedValueOnce({
                    content: [
                        { type: 'text', text: 'Node added, transitioning' },
                        {
                            type: 'tool_use',
                            id: 'tool_2',
                            name: 'transition',
                            input: { target: 'end', reason: 'Done' }
                        }
                    ],
                    stop_reason: 'tool_use'
                });

            await executor.step();

            const machineData = executor.getMachineDefinition();
            expect(machineData.nodes).toHaveLength(3); // start, end, newNode
            expect(machineData.nodes.find(n => n.name === 'newNode')).toBeDefined();
        });

        it('should allow adding edges via meta tools', async () => {
            // First add a node, then add an edge to it
            mockBedrockClient.invokeWithTools
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_1',
                            name: 'add_node',
                            input: { name: 'newNode', type: 'state' }
                        }
                    ],
                    stop_reason: 'tool_use'
                })
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_2',
                            name: 'add_edge',
                            input: { source: 'start', target: 'newNode', type: 'new_path' }
                        }
                    ],
                    stop_reason: 'tool_use'
                })
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_3',
                            name: 'transition',
                            input: { target: 'end', reason: 'Done' }
                        }
                    ],
                    stop_reason: 'tool_use'
                });

            await executor.step();

            const machineData = executor.getMachineDefinition();
            expect(machineData.edges).toHaveLength(2); // original + new
            expect(machineData.edges.find(e => e.target === 'newNode')).toBeDefined();
        });

        it('should allow modifying nodes via meta tools', async () => {
            mockBedrockClient.invokeWithTools
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_1',
                            name: 'modify_node',
                            input: {
                                name: 'start',
                                attributes: { newAttr: 'newValue' }
                            }
                        }
                    ],
                    stop_reason: 'tool_use'
                })
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_2',
                            name: 'transition',
                            input: { target: 'end', reason: 'Done' }
                        }
                    ],
                    stop_reason: 'tool_use'
                });

            await executor.step();

            const machineData = executor.getMachineDefinition();
            const startNode = machineData.nodes.find(n => n.name === 'start');
            expect(startNode?.attributes?.find(a => a.name === 'newAttr')).toBeDefined();
        });

        it('should track mutations', async () => {
            mockBedrockClient.invokeWithTools
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_1',
                            name: 'add_node',
                            input: { name: 'newNode', type: 'state' }
                        }
                    ],
                    stop_reason: 'tool_use'
                })
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_2',
                            name: 'transition',
                            input: { target: 'end', reason: 'Done' }
                        }
                    ],
                    stop_reason: 'tool_use'
                });

            await executor.step();

            const mutations = executor.getMutations();
            expect(mutations).toHaveLength(1);
            expect(mutations[0].type).toBe('add_node');
            expect(mutations[0].data.name).toBe('newNode');
        });
    });

    describe('Runtime Visualization', () => {
        it('should generate runtime Mermaid state diagram', async () => {
            mockBedrockClient.invokeWithTools.mockResolvedValueOnce({
                content: [
                    {
                        type: 'tool_use',
                        id: 'tool_1',
                        name: 'transition',
                        input: { target: 'pathA', reason: 'test' }
                    }
                ],
                stop_reason: 'tool_use'
            });

            await executor.step();

            const mermaid = executor.toMermaidRuntime();

            expect(mermaid).toContain('stateDiagram-v2');
            expect(mermaid).toContain('▶️ CURRENT'); // Current node marker
            expect(mermaid).toContain('✓ VISITED'); // Visited node marker
            expect(mermaid).toContain('%% Execution Path:'); // Path comment
        });

        it('should generate runtime Mermaid class diagram', async () => {
            mockBedrockClient.invokeWithTools.mockResolvedValueOnce({
                content: [
                    {
                        type: 'tool_use',
                        id: 'tool_1',
                        name: 'transition',
                        input: { target: 'pathA', reason: 'test' }
                    }
                ],
                stop_reason: 'tool_use'
            });

            await executor.step();

            const mermaid = executor.toMermaidRuntimeClass();

            expect(mermaid).toContain('classDiagram');
            expect(mermaid).toContain('CURRENT');
            expect(mermaid).toContain('VISITED');
            expect(mermaid).toContain('currentNode'); // CSS class
            expect(mermaid).toContain('visitedNode'); // CSS class
        });

        it('should show traversal counts in runtime diagram', async () => {
            // Execute multiple steps
            mockBedrockClient.invokeWithTools
                .mockResolvedValueOnce({
                    content: [
                        {
                            type: 'tool_use',
                            id: 'tool_1',
                            name: 'transition',
                            input: { target: 'pathA', reason: 'test' }
                        }
                    ],
                    stop_reason: 'tool_use'
                })
                .mockResolvedValueOnce({
                    content: [
                        { type: 'text', text: 'Moving to end' }
                    ],
                    stop_reason: 'end_turn'
                });

            await executor.step();
            await executor.step();

            const mermaid = executor.toMermaidRuntime();

            // Should show traversal count
            expect(mermaid).toMatch(/\[1x\]/); // Edge traversed once
        });
    });

    describe('DSL Serialization', () => {
        it('should serialize modified machine back to DSL', async () => {
            executor.addNode({
                name: 'newNode',
                type: 'state',
                attributes: { label: 'New Node' }
            });

            executor.addEdge({
                source: 'start',
                target: 'newNode',
                type: 'new_route'
            });

            const dsl = executor.toMachineDefinition();

            expect(dsl).toContain('machine "Test Router Machine"');
            expect(dsl).toContain('state newNode');
            expect(dsl).toContain('label: "New Node"');
            expect(dsl).toContain('start -new_route-> newNode');
        });
    });
});
