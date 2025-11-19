/**
 * Tests for Rails Executor: Automated Transitions
 */

import { describe, it, expect } from 'vitest';
import { MachineExecutor, type MachineJSON } from '../../src/language/executor.js';

describe('RailsExecutor - Automated Transitions', () => {
    it('should automatically transition through state nodes', async () => {
        const machineData: MachineJSON = {
            title: 'Simple State Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'processing', type: 'state' },
                { name: 'complete', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'processing' },
                { source: 'processing', target: 'complete' }
            ]
        };

        const executor = new MachineExecutor(machineData);

        // Execute one step - should auto-transition from start to processing
        const step1 = await executor.step();
        expect(step1).toBe(true);

        const context1 = executor.getState().paths[0];
        expect(context1.currentNode).toBe('processing');

        // Execute another step - should auto-transition to complete
        const step2 = await executor.step();
        expect(step2).toBe(true);

        const context2 = executor.getState().paths[0];
        expect(context2.currentNode).toBe('complete');

        // No more steps - terminal node
        const step3 = await executor.step();
        expect(step3).toBe(false);
    });

    it('should respect @auto annotations', async () => {
        const machineData: MachineJSON = {
            title: 'Auto Annotation Test',
            nodes: [
                { name: 'start', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] },
                { name: 'next', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'next', label: '@auto' }
            ]
        };

        const executor = new MachineExecutor(machineData);

        // Even though start is a task node, @auto should force auto-transition
        const step1 = await executor.step();
        expect(step1).toBe(true);

        const context = executor.getState().paths[0];
        expect(context.currentNode).toBe('next');
    });

    it('should evaluate simple conditions for auto-transition', async () => {
        const machineData: MachineJSON = {
            title: 'Conditional Auto-Transition',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'errorPath', type: 'state' },
                { name: 'successPath', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'errorPath', label: 'when: "errorCount > 0"' },
                { source: 'start', target: 'successPath', label: 'when: "errorCount === 0"' }
            ]
        };

        const executor = new MachineExecutor(machineData);

        // errorCount is 0 by default
        const step1 = await executor.step();
        expect(step1).toBe(true);

        const context = executor.getState().paths[0];
        expect(context.currentNode).toBe('successPath');
    });

    it('should track execution history', async () => {
        const machineData: MachineJSON = {
            title: 'History Test',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'middle', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'middle' },
                { source: 'middle', target: 'end' }
            ]
        };

        const executor = new MachineExecutor(machineData);

        await executor.step();
        await executor.step();

        const context = executor.getState().paths[0];
        expect(context.history).toHaveLength(2);
        expect(context.history[0].from).toBe('start');
        expect(context.history[0].to).toBe('middle');
        expect(context.history[1].from).toBe('middle');
        expect(context.history[1].to).toBe('end');
    });

    it('should mark visited nodes', async () => {
        const machineData: MachineJSON = {
            title: 'Visited Nodes Test',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'next', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'next' }
            ]
        };

        const executor = new MachineExecutor(machineData);

        await executor.step();

        const context = executor.getState().paths[0];
        expect(context.visitedNodes.has('start')).toBe(true);
        expect(context.currentNode).toBe('next');
    });

    it('should update activeState for state nodes', async () => {
        const machineData: MachineJSON = {
            title: 'Active State Test',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'processing', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'processing' }
            ]
        };

        const executor = new MachineExecutor(machineData);

        await executor.step();

        const context = executor.getState().paths[0];
        expect(context.activeState).toBe('processing');
    });

    it('should complete full execution automatically for state-only machines', async () => {
        const machineData: MachineJSON = {
            title: 'Full Auto Execution',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'step1', type: 'state' },
                { name: 'step2', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'step1' },
                { source: 'step1', target: 'step2' },
                { source: 'step2', target: 'end' }
            ]
        };

        const executor = new MachineExecutor(machineData);

        await executor.execute();

        const context = executor.getState().paths[0];
        expect(context.currentNode).toBe('end');
        expect(context.history).toHaveLength(3);
    });
});
