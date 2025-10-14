/**
 * Tests for Agent Context Builder Dynamic Context System Prompts
 */

import { describe, it, expect } from 'vitest';
import { AgentContextBuilder } from '../../src/language/agent-context-builder.js';
import type { MachineData, MachineExecutionContext } from '../../src/language/rails-executor.js';

describe('AgentContextBuilder - Dynamic Context System Prompts', () => {
    it('should build basic system prompt with role and position', () => {
        const machineData: MachineData = {
            title: 'Test Machine',
            nodes: [
                {
                    name: 'analyze',
                    type: 'task',
                    attributes: [
                        { name: 'prompt', type: 'string', value: 'Analyze the data' }
                    ]
                }
            ],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'analyze',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const prompt = builder.buildSystemPrompt('analyze');

        expect(prompt).toContain('# Role');
        expect(prompt).toContain('state machine workflow');
        expect(prompt).toContain('# Current Position');
        expect(prompt).toContain('**Node**: analyze');
        expect(prompt).toContain('**Type**: task');
        expect(prompt).toContain('**Objective**: Analyze the data');
    });

    it('should include accessible context nodes with permissions', () => {
        const machineData: MachineData = {
            title: 'Context Test',
            nodes: [
                {
                    name: 'process',
                    type: 'task',
                    attributes: [{ name: 'prompt', type: 'string', value: 'Process data' }]
                },
                {
                    name: 'input',
                    type: 'context',
                    attributes: [
                        { name: 'data', type: 'string', value: 'test data' }
                    ]
                },
                {
                    name: 'output',
                    type: 'context',
                    attributes: []
                }
            ],
            edges: [
                { source: 'process', target: 'input', label: 'reads' },
                { source: 'process', target: 'output', label: 'writes' }
            ]
        };

        const context: MachineExecutionContext = {
            currentNode: 'process',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const prompt = builder.buildSystemPrompt('process');

        expect(prompt).toContain('# Available Context');
        expect(prompt).toContain('## input');
        expect(prompt).toContain('**Permissions**: read');
        expect(prompt).toContain('## output');
        expect(prompt).toContain('**Permissions**: write');
    });

    it('should show field-level permissions', () => {
        const machineData: MachineData = {
            title: 'Field Permissions Test',
            nodes: [
                {
                    name: 'task1',
                    type: 'task',
                    attributes: [{ name: 'prompt', type: 'string', value: 'Test' }]
                },
                {
                    name: 'context1',
                    type: 'context',
                    attributes: []
                }
            ],
            edges: [
                { source: 'task1', target: 'context1', label: 'write: field1,field2' }
            ]
        };

        const context: MachineExecutionContext = {
            currentNode: 'task1',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const prompt = builder.buildSystemPrompt('task1');

        expect(prompt).toContain('**Accessible Fields**: field1, field2');
    });

    it('should include available transitions', () => {
        const machineData: MachineData = {
            title: 'Transitions Test',
            nodes: [
                { name: 'start', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Start' }] },
                { name: 'success', type: 'state' },
                { name: 'failure', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'success', label: 'on success' },
                { source: 'start', target: 'failure', label: 'on failure' }
            ]
        };

        const context: MachineExecutionContext = {
            currentNode: 'start',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const prompt = builder.buildSystemPrompt('start');

        expect(prompt).toContain('# Available Transitions');
        expect(prompt).toContain('## success');
        expect(prompt).toContain('## failure');
    });

    it('should include meta-programming section when meta=true', () => {
        const machineData: MachineData = {
            title: 'Meta Test',
            nodes: [
                {
                    name: 'evolver',
                    type: 'task',
                    attributes: [
                        { name: 'prompt', type: 'string', value: 'Evolve the machine' },
                        { name: 'meta', type: 'boolean', value: 'true' }
                    ]
                }
            ],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'evolver',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const prompt = builder.buildSystemPrompt('evolver');

        expect(prompt).toContain('# Meta-Programming Capabilities');
        expect(prompt).toContain('get_machine_definition');
        expect(prompt).toContain('add_node');
        expect(prompt).toContain('add_edge');
        expect(prompt).toContain('construct_tool');
    });

    it('should show execution state information', () => {
        const machineData: MachineData = {
            title: 'State Test',
            nodes: [
                { name: 'current', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] }
            ],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'current',
            errorCount: 3,
            activeState: 'processing',
            visitedNodes: new Set(['start', 'middle']),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const prompt = builder.buildSystemPrompt('current');

        expect(prompt).toContain('**Visited Nodes**: 2');
        expect(prompt).toContain('**Error Count**: 3');
        expect(prompt).toContain('**Active State**: processing');
    });

    it('should not include @auto transitions', () => {
        const machineData: MachineData = {
            title: 'Auto Transition Test',
            nodes: [
                { name: 'task1', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] },
                { name: 'auto_next', type: 'state' },
                { name: 'manual_next', type: 'state' }
            ],
            edges: [
                { source: 'task1', target: 'auto_next', label: '@auto' },
                { source: 'task1', target: 'manual_next', label: 'manual' }
            ]
        };

        const context: MachineExecutionContext = {
            currentNode: 'task1',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const prompt = builder.buildSystemPrompt('task1');

        // Should include manual transition
        expect(prompt).toContain('manual_next');

        // Should NOT include @auto transition
        expect(prompt).not.toContain('auto_next');
    });

    it('should extract context permissions correctly', () => {
        const machineData: MachineData = {
            title: 'Permissions Test',
            nodes: [
                { name: 'task1', type: 'task', attributes: [] },
                { name: 'readCtx', type: 'context', attributes: [] },
                { name: 'writeCtx', type: 'context', attributes: [] },
                { name: 'storeCtx', type: 'context', attributes: [] }
            ],
            edges: [
                { source: 'task1', target: 'readCtx', label: 'reads' },
                { source: 'task1', target: 'writeCtx', label: 'writes' },
                { source: 'task1', target: 'storeCtx', label: 'stores' }
            ]
        };

        const context: MachineExecutionContext = {
            currentNode: 'task1',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const builder = new AgentContextBuilder(machineData, context);
        const contexts = builder.getAccessibleContextNodes('task1');

        expect(contexts.get('readCtx')?.canRead).toBe(true);
        expect(contexts.get('readCtx')?.canWrite).toBe(false);

        expect(contexts.get('writeCtx')?.canWrite).toBe(true);
        expect(contexts.get('writeCtx')?.canRead).toBe(false);

        expect(contexts.get('storeCtx')?.canStore).toBe(true);
    });
});
