/**
 * Tests for Agent SDK Bridge Agent SDK Integration
 */

import { describe, it, expect } from 'vitest';
import { AgentSDKBridge } from '../../src/language/agent-sdk-bridge.js';
import { MetaToolManager } from '../../src/language/meta-tool-manager.js';
import type { MachineExecutionContext } from '../../src/language/rails-executor.js';
import type { MachineJSON } from '../../src/language/json/types.js';

type MachineData = MachineJSON;

describe('AgentSDKBridge - Agent SDK Integration', () => {
    it('should initialize with default config', () => {
        const machineData: MachineData = {
            title: 'Test Machine',
            nodes: [],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'start',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const metaToolManager = new MetaToolManager(machineData, () => {});
        const bridge = new AgentSDKBridge(machineData, context, metaToolManager);

        expect(bridge).toBeDefined();
    });

    it('should track conversation history', async () => {
        const machineData: MachineData = {
            title: 'Test',
            nodes: [
                { name: 'task1', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] }
            ],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'task1',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const metaToolManager = new MetaToolManager(machineData, () => {});
        const bridge = new AgentSDKBridge(machineData, context, metaToolManager);

        await bridge.invokeAgent('task1', 'System prompt', []);

        const history = bridge.getConversationHistory();
        expect(history.length).toBeGreaterThan(0);
        expect(history.some(m => m.role === 'system')).toBe(true);
        expect(history.some(m => m.role === 'user')).toBe(true);
    });

    it('should track execution history', async () => {
        const machineData: MachineData = {
            title: 'Test',
            nodes: [
                { name: 'task1', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] }
            ],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'task1',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const metaToolManager = new MetaToolManager(machineData, () => {});
        const bridge = new AgentSDKBridge(machineData, context, metaToolManager, undefined, { persistHistory: true });

        await bridge.invokeAgent('task1', 'System prompt', []);

        const execHistory = bridge.getExecutionHistory();
        expect(execHistory.length).toBe(1);
        expect(execHistory[0].nodeName).toBe('task1');
    });

    it('should clear conversation history', async () => {
        const machineData: MachineData = {
            title: 'Test',
            nodes: [
                { name: 'task1', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] }
            ],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'task1',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const metaToolManager = new MetaToolManager(machineData, () => {});
        const bridge = new AgentSDKBridge(machineData, context, metaToolManager);

        await bridge.invokeAgent('task1', 'System prompt', []);
        expect(bridge.getConversationHistory().length).toBeGreaterThan(0);

        await bridge.clearConversationHistory();
        expect(bridge.getConversationHistory().length).toBe(0);
    });

    it('should estimate token usage', async () => {
        const machineData: MachineData = {
            title: 'Test',
            nodes: [
                { name: 'task1', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] }
            ],
            edges: []
        };

        const context: MachineExecutionContext = {
            currentNode: 'task1',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        const metaToolManager = new MetaToolManager(machineData, () => {});
        const bridge = new AgentSDKBridge(machineData, context, metaToolManager);

        await bridge.invokeAgent('task1', 'System prompt', []);

        const usage = bridge.getTokenUsageEstimate();
        expect(usage.input).toBeGreaterThan(0);
    });
});
