/**
 * Tests for Rails Executor: Automated Transitions
 */

import { describe, it, expect } from 'vitest';
import { RailsExecutor, MachineData } from '../../src/language/rails-executor.js';

describe('RailsExecutor - Automated Transitions', () => {
    it('should automatically transition through state nodes', async () => {
        const machineData: MachineData = {
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

        const executor = new RailsExecutor(machineData);

        // Execute one step - should auto-transition from start to processing
        const step1 = await executor.step();
        expect(step1).toBe(true);

        const context1 = executor.getContext();
        expect(context1.currentNode).toBe('processing');

        // Execute another step - should auto-transition to complete
        const step2 = await executor.step();
        expect(step2).toBe(true);

        const context2 = executor.getContext();
        expect(context2.currentNode).toBe('complete');

        // No more steps - terminal node
        const step3 = await executor.step();
        expect(step3).toBe(false);
    });

    it('should respect @auto annotations', async () => {
        const machineData: MachineData = {
            title: 'Auto Annotation Test',
            nodes: [
                { name: 'start', type: 'task', attributes: [{ name: 'prompt', type: 'string', value: 'Test' }] },
                { name: 'next', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'next', label: '@auto' }
            ]
        };

        const executor = new RailsExecutor(machineData);

        // Even though start is a task node, @auto should force auto-transition
        const step1 = await executor.step();
        expect(step1).toBe(true);

        const context = executor.getContext();
        expect(context.currentNode).toBe('next');
    });

    it('should evaluate simple conditions for auto-transition', async () => {
        const machineData: MachineData = {
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

        const executor = new RailsExecutor(machineData);

        // errorCount is 0 by default
        const step1 = await executor.step();
        expect(step1).toBe(true);

        const context = executor.getContext();
        expect(context.currentNode).toBe('successPath');
    });

    it('should track execution history', async () => {
        const machineData: MachineData = {
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

        const executor = new RailsExecutor(machineData);

        await executor.step();
        await executor.step();

        const context = executor.getContext();
        expect(context.history).toHaveLength(2);
        expect(context.history[0].from).toBe('start');
        expect(context.history[0].to).toBe('middle');
        expect(context.history[1].from).toBe('middle');
        expect(context.history[1].to).toBe('end');
    });

    it('should mark visited nodes', async () => {
        const machineData: MachineData = {
            title: 'Visited Nodes Test',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'next', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'next' }
            ]
        };

        const executor = new RailsExecutor(machineData);

        await executor.step();

        const context = executor.getContext();
        expect(context.visitedNodes.has('start')).toBe(true);
        expect(context.currentNode).toBe('next');
    });

    it('should update activeState for state nodes', async () => {
        const machineData: MachineData = {
            title: 'Active State Test',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'processing', type: 'state' }
            ],
            edges: [
                { source: 'start', target: 'processing' }
            ]
        };

        const executor = new RailsExecutor(machineData);

        await executor.step();

        const context = executor.getContext();
        expect(context.activeState).toBe('processing');
    });

    it('should complete full execution automatically for state-only machines', async () => {
        const machineData: MachineData = {
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

        const executor = new RailsExecutor(machineData);

        await executor.execute();

        const context = executor.getContext();
        expect(context.currentNode).toBe('end');
        expect(context.history).toHaveLength(3);
    });
});
