/**
 * Tests for Meta-Tool Manager Dynamic Tool Construction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetaToolManager } from '../../src/language/meta-tool-manager.js';
import { NodeTypeChecker } from '../../src/language/node-type-checker.js';
import type { MachineMutation } from '../../src/language/rails-executor.js';
import type { MachineJSON } from '../../src/language/json/types.js';

type MachineData = MachineJSON;

describe('MetaToolManager - Dynamic Tool Construction', () => {
    let machineData: MachineData;
    let mutations: Array<Omit<MachineMutation, 'timestamp'>>;
    let manager: MetaToolManager;

    beforeEach(() => {
        machineData = {
            title: 'Test Machine',
            nodes: [],
            edges: []
        };

        mutations = [];

        manager = new MetaToolManager(machineData, (mutation) => {
            mutations.push(mutation);
        });
    });

    it('should provide meta-tool definitions', () => {
        const metaTools = manager.getMetaTools();

        expect(metaTools).toHaveLength(7);

        const toolNames = metaTools.map(t => t.name);
        expect(toolNames).toContain('get_machine_definition');
        expect(toolNames).toContain('update_definition');
        expect(toolNames).toContain('construct_tool');
        expect(toolNames).toContain('list_available_tools');
        expect(toolNames).toContain('propose_tool_improvement');
        expect(toolNames).toContain('get_tool_nodes');
        expect(toolNames).toContain('build_tool_from_node');
    });

    it('should construct an agent-backed tool', async () => {
        const result = await manager.constructTool({
            name: 'analyze_sentiment',
            description: 'Analyze sentiment of text',
            input_schema: {
                type: 'object',
                properties: {
                    text: { type: 'string' }
                }
            },
            implementation_strategy: 'agent_backed',
            implementation_details: 'Analyze the sentiment of the provided text and return positive, negative, or neutral'
        });

        expect(result.success).toBe(true);
        expect(result.tool.name).toBe('analyze_sentiment');
        expect(result.tool.strategy).toBe('agent_backed');

        // Check mutation was recorded
        expect(mutations).toHaveLength(1);
        expect(mutations[0].type).toBe('add_node');
        expect(mutations[0].data.mutationType).toBe('tool_constructed');
    });

    it('should construct a code-generation tool', async () => {
        const result = await manager.constructTool({
            name: 'add_numbers',
            description: 'Add two numbers',
            input_schema: {
                type: 'object',
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' }
                }
            },
            implementation_strategy: 'code_generation',
            implementation_details: 'return input.a + input.b;'
        });

        expect(result.success).toBe(true);

        // Execute the tool
        const executeResult = await manager.executeDynamicTool('add_numbers', { a: 5, b: 3 });
        expect(executeResult).toBe(8);
    });

    it('should construct a composition tool', async () => {
        const result = await manager.constructTool({
            name: 'process_pipeline',
            description: 'Process data through multiple steps',
            input_schema: {
                type: 'object',
                properties: {
                    data: { type: 'any' }
                }
            },
            implementation_strategy: 'composition',
            implementation_details: JSON.stringify({
                steps: ['validate', 'transform', 'analyze']
            })
        });

        expect(result.success).toBe(true);
        expect(result.tool.strategy).toBe('composition');
    });

    it('should prevent duplicate tool names', async () => {
        await manager.constructTool({
            name: 'my_tool',
            description: 'First tool',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'agent_backed',
            implementation_details: 'test'
        });

        const result = await manager.constructTool({
            name: 'my_tool',
            description: 'Duplicate tool',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'agent_backed',
            implementation_details: 'test'
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain('already exists');
    });

    it('should list available tools', async () => {
        await manager.constructTool({
            name: 'tool1',
            description: 'Tool 1',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'agent_backed',
            implementation_details: 'test'
        });

        await manager.constructTool({
            name: 'tool2',
            description: 'Tool 2',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'code_generation',
            implementation_details: 'return 42;'
        });

        const result = await manager.listAvailableTools({ filter_type: 'dynamic' });

        expect(result.dynamicTools).toHaveLength(2);
        expect(result.dynamicTools[0].name).toBe('tool1');
        expect(result.dynamicTools[1].name).toBe('tool2');
    });

    it('should list meta tools', async () => {
        const result = await manager.listAvailableTools({ filter_type: 'meta' });

        expect(result.metaTools).toHaveLength(7);
        expect(result.metaTools.map((t: any) => t.name)).toContain('construct_tool');
        expect(result.metaTools.map((t: any) => t.name)).toContain('get_machine_definition');
        expect(result.metaTools.map((t: any) => t.name)).toContain('update_definition');
        expect(result.metaTools.map((t: any) => t.name)).toContain('get_tool_nodes');
        expect(result.metaTools.map((t: any) => t.name)).toContain('build_tool_from_node');
    });

    it('should include source code when requested', async () => {
        await manager.constructTool({
            name: 'test_tool',
            description: 'Test',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'code_generation',
            implementation_details: 'return "hello";'
        });

        const result = await manager.listAvailableTools({
            filter_type: 'dynamic',
            include_source: true
        });

        expect(result.dynamicTools[0].implementation).toBe('return "hello";');
    });

    it('should record tool improvement proposals', async () => {
        const result = await manager.proposeToolImprovement({
            tool_name: 'existing_tool',
            rationale: 'This tool could be more efficient',
            proposed_changes: 'Use caching to improve performance'
        });

        expect(result.success).toBe(true);
        expect(result.proposalCount).toBe(1);

        const proposals = manager.getProposals();
        expect(proposals).toHaveLength(1);
        expect(proposals[0].toolName).toBe('existing_tool');
        expect(proposals[0].rationale).toContain('efficient');

        // Check mutation was recorded
        expect(mutations.some(m =>
            m.type === 'modify_node' &&
            m.data.mutationType === 'tool_improvement_proposed'
        )).toBe(true);
    });

    it('should get dynamic tool definitions', async () => {
        await manager.constructTool({
            name: 'tool1',
            description: 'Tool 1',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'agent_backed',
            implementation_details: 'test'
        });

        const definitions = manager.getDynamicToolDefinitions();

        expect(definitions).toHaveLength(1);
        expect(definitions[0].name).toBe('tool1');
        expect(definitions[0].description).toBe('Tool 1');
    });

    it('should retrieve specific dynamic tool', async () => {
        await manager.constructTool({
            name: 'my_tool',
            description: 'My Tool',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'agent_backed',
            implementation_details: 'test'
        });

        const tool = manager.getDynamicTool('my_tool');

        expect(tool).toBeDefined();
        expect(tool?.definition.name).toBe('my_tool');
        expect(tool?.strategy).toBe('agent_backed');
    });

    it('should handle tool execution errors gracefully', async () => {
        await manager.constructTool({
            name: 'error_tool',
            description: 'Tool that errors',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'code_generation',
            implementation_details: 'throw new Error("Tool error");'
        });

        await expect(async () => {
            await manager.executeDynamicTool('error_tool', {});
        }).rejects.toThrow('Tool execution failed');
    });

    it('should handle missing tool execution', async () => {
        await expect(async () => {
            await manager.executeDynamicTool('nonexistent', {});
        }).rejects.toThrow('not found');
    });

    it('should clear dynamic tools', async () => {
        await manager.constructTool({
            name: 'tool1',
            description: 'Tool 1',
            input_schema: { type: 'object', properties: {} },
            implementation_strategy: 'agent_backed',
            implementation_details: 'test'
        });

        manager.clearDynamicTools();

        const definitions = manager.getDynamicToolDefinitions();
        expect(definitions).toHaveLength(0);
    });

    // Tool Node Tests
    describe('Tool Nodes', () => {
        it('should identify tool nodes with NodeTypeChecker', () => {
            const toolNode = { name: 'my_tool', type: 'Tool' };
            const taskNode = { name: 'my_task', type: 'Task' };
            const stateNode = { name: 'my_state', type: 'State' };

            expect(NodeTypeChecker.isTool(toolNode)).toBe(true);
            expect(NodeTypeChecker.isTool(taskNode)).toBe(false);
            expect(NodeTypeChecker.isTool(stateNode)).toBe(false);
        });

        it('should get all tool nodes from machine data', () => {
            const machineWithTools: MachineData = {
                title: 'Machine with Tools',
                nodes: [
                    {
                        name: 'sentiment_analyzer',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'Analyze sentiment' }
                        ]
                    },
                    {
                        name: 'processor',
                        type: 'Task',
                        attributes: []
                    },
                    {
                        name: 'formatter',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'Format text' },
                            { name: 'input_schema', type: 'string', value: '{"type": "object"}' }
                        ]
                    }
                ],
                edges: []
            };

            const toolManager = new MetaToolManager(machineWithTools, () => {});
            const toolNodes = toolManager.getToolNodes();

            expect(toolNodes).toHaveLength(2);
            expect(toolNodes[0].name).toBe('sentiment_analyzer');
            expect(toolNodes[1].name).toBe('formatter');
        });

        it('should identify loosely defined tool nodes', () => {
            const machineWithTools: MachineData = {
                title: 'Machine with Tools',
                nodes: [
                    {
                        name: 'loose_tool',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'A tool' }
                        ]
                    },
                    {
                        name: 'complete_tool',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'Complete tool' },
                            { name: 'input_schema', type: 'string', value: '{"type": "object"}' },
                            { name: 'output_schema', type: 'string', value: '{"type": "object"}' },
                            { name: 'code', type: 'string', value: 'return {};' }
                        ]
                    }
                ],
                edges: []
            };

            const toolManager = new MetaToolManager(machineWithTools, () => {});
            const toolNodes = toolManager.getToolNodes();

            expect(toolManager.isToolNodeLooselyDefined(toolNodes[0])).toBe(true);
            expect(toolManager.isToolNodeLooselyDefined(toolNodes[1])).toBe(false);
        });

        it('should build tool from node', async () => {
            const machineWithTools: MachineData = {
                title: 'Machine with Tools',
                nodes: [
                    {
                        name: 'my_tool',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'My test tool' }
                        ]
                    }
                ],
                edges: []
            };

            const toolManager = new MetaToolManager(machineWithTools, () => {});
            const toolNodes = toolManager.getToolNodes();

            const result = await toolManager.buildToolFromNode(toolNodes[0], 'agent_backed');

            expect(result.success).toBe(true);
            expect(result.tool.name).toBe('my_tool');
            expect(result.tool.strategy).toBe('agent_backed');

            // Verify it's registered
            const dynamicTool = toolManager.getDynamicTool('my_tool');
            expect(dynamicTool).toBeDefined();
        });

        it('should handle get_tool_nodes meta-tool', async () => {
            const machineWithTools: MachineData = {
                title: 'Machine with Tools',
                nodes: [
                    {
                        name: 'tool1',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'Tool 1' }
                        ]
                    },
                    {
                        name: 'tool2',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'Tool 2' }
                        ]
                    }
                ],
                edges: []
            };

            const toolManager = new MetaToolManager(machineWithTools, () => {});
            const result = await toolManager.getToolNodesHandler({ include_registered: true });

            expect(result.totalCount).toBe(2);
            expect(result.tools).toHaveLength(2);
            expect(result.tools[0].isLooselyDefined).toBe(true);
            expect(result.tools[0].isRegistered).toBe(false);
        });

        it('should handle build_tool_from_node meta-tool', async () => {
            const machineWithTools: MachineData = {
                title: 'Machine with Tools',
                nodes: [
                    {
                        name: 'calculator',
                        type: 'Tool',
                        attributes: [
                            { name: 'description', type: 'string', value: 'Calculate things' }
                        ]
                    }
                ],
                edges: []
            };

            const toolManager = new MetaToolManager(machineWithTools, () => {});
            const result = await toolManager.buildToolFromNodeHandler({
                tool_name: 'calculator',
                strategy: 'code_generation',
                input_schema: {
                    type: 'object',
                    properties: {
                        a: { type: 'number' },
                        b: { type: 'number' }
                    }
                },
                implementation_details: 'return input.a + input.b;'
            });

            expect(result.success).toBe(true);

            // Test execution
            const execResult = await toolManager.executeDynamicTool('calculator', { a: 5, b: 3 });
            expect(execResult).toBe(8);
        });

        it('should handle build_tool_from_node with missing tool', async () => {
            const toolManager = new MetaToolManager({ title: 'Empty', nodes: [], edges: [] }, () => {});
            const result = await toolManager.buildToolFromNodeHandler({
                tool_name: 'nonexistent',
                strategy: 'agent_backed'
            });

            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
        });
    });

    describe('Tool Persistence', () => {
        it('should persist tool nodes in machine definition', async () => {
            let updatedDSL: string | undefined;
            let updatedMachineData: MachineJSON | undefined;

            const manager = new MetaToolManager(machineData, (mutation) => {
                mutations.push(mutation);
            });

            // Set up callback to capture machine updates
            manager.setMachineUpdateCallback((dsl, machineData) => {
                updatedDSL = dsl;
                updatedMachineData = machineData;
            });

            // Construct a tool
            const result = await manager.constructTool({
                name: 'calculate_fibonacci',
                description: 'Calculate Fibonacci number',
                input_schema: {
                    type: 'object',
                    properties: {
                        n: { type: 'number', description: 'Position in sequence' }
                    },
                    required: ['n']
                },
                implementation_strategy: 'code_generation',
                implementation_details: `
                    function fib(n) {
                        if (n <= 1) return n;
                        return fib(n-1) + fib(n-2);
                    }
                    return { result: fib(n) };
                `
            });

            // Verify tool was constructed
            expect(result.success).toBe(true);
            expect(result.dsl).toBeDefined();

            // Verify machine update callback was called
            expect(updatedDSL).toBeDefined();
            expect(updatedMachineData).toBeDefined();

            // Verify tool node was added to machine definition
            expect(updatedMachineData?.nodes).toHaveLength(1);
            const toolNode = updatedMachineData?.nodes[0];
            expect(toolNode?.name).toBe('calculate_fibonacci');
            expect(toolNode?.type).toBe('tool');
            expect(toolNode?.description).toBe('Calculate Fibonacci number');

            // Verify tool node has correct attributes
            const attrs = toolNode?.attributes || [];
            expect(attrs).toHaveLength(3);
            expect(attrs.find(a => a.name === 'input_schema')).toBeDefined();
            expect(attrs.find(a => a.name === 'implementation_strategy')?.value).toBe('code_generation');
            expect(attrs.find(a => a.name === 'implementation')?.value).toContain('function fib');

            // Verify DSL contains tool definition
            expect(updatedDSL).toContain('tool calculate_fibonacci');
        });

        it('should initialize tools from machine definition', async () => {
            // Create machine with existing tool node
            const machineWithTool: MachineJSON = {
                title: 'Machine with Tool',
                nodes: [
                    {
                        name: 'double_number',
                        type: 'tool',
                        description: 'Double a number',
                        attributes: [
                            {
                                name: 'input_schema',
                                value: {
                                    type: 'object',
                                    properties: {
                                        n: { type: 'number' }
                                    }
                                },
                                type: 'json'
                            },
                            {
                                name: 'implementation_strategy',
                                value: 'code_generation',
                                type: 'string'
                            },
                            {
                                name: 'implementation',
                                value: 'return { result: n * 2 };',
                                type: 'string'
                            }
                        ]
                    }
                ],
                edges: []
            };

            const manager = new MetaToolManager(machineWithTool, () => {});

            // Initialize tools from machine definition
            manager.initializeToolsFromMachine();

            // Verify tool is available
            const result = await manager.listAvailableTools({ filter_type: 'dynamic' });
            expect(result.dynamicTools).toHaveLength(1);
            expect(result.dynamicTools[0].name).toBe('double_number');
            expect(result.dynamicTools[0].strategy).toBe('code_generation');
        });

        it('should execute tools loaded from machine definition', async () => {
            // Create machine with tool that performs calculation
            const machineWithTool: MachineJSON = {
                title: 'Machine with Tool',
                nodes: [
                    {
                        name: 'add_ten',
                        type: 'tool',
                        description: 'Add 10 to a number',
                        attributes: [
                            {
                                name: 'input_schema',
                                value: {
                                    type: 'object',
                                    properties: {
                                        value: { type: 'number' }
                                    }
                                },
                                type: 'json'
                            },
                            {
                                name: 'implementation_strategy',
                                value: 'code_generation',
                                type: 'string'
                            },
                            {
                                name: 'implementation',
                                value: 'return value + 10;',
                                type: 'string'
                            }
                        ]
                    }
                ],
                edges: []
            };

            const manager = new MetaToolManager(machineWithTool, () => {});
            manager.initializeToolsFromMachine();

            // Execute the tool
            const result = await manager.executeDynamicTool('add_ten', { value: 5 });

            // The handler wraps the result in { success: true, result: ..., message: ... }
            expect(result.result).toBe(15);
        });
    });
});
