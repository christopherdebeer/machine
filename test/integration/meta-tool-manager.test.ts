/**
 * Tests for Meta-Tool Manager Phase 3: Dynamic Tool Construction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetaToolManager } from '../../src/language/meta-tool-manager.js';
import type { MachineData, MachineMutation } from '../../src/language/rails-executor.js';

describe('MetaToolManager - Phase 3: Dynamic Tool Construction', () => {
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

        expect(metaTools).toHaveLength(3);

        const toolNames = metaTools.map(t => t.name);
        expect(toolNames).toContain('construct_tool');
        expect(toolNames).toContain('list_available_tools');
        expect(toolNames).toContain('propose_tool_improvement');
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

        expect(result.metaTools).toHaveLength(3);
        expect(result.metaTools.map((t: any) => t.name)).toContain('construct_tool');
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
});
