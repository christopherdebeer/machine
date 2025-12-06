/**
 * Test: Async edges as spawn tools
 *
 * Verifies that @async edges on task nodes with prompts
 * become spawn_async_to_X tools instead of auto-spawning.
 */
import { describe, it, expect } from 'vitest';
import { buildTools } from '../../src/language/execution/effect-builder.js';
import type { MachineJSON } from '../../src/language/json/types.js';
import type { ExecutionState } from '../../src/language/execution/runtime-types.js';

describe('Async Edge Tools', () => {
    const machineJSON: MachineJSON = {
        title: 'Async with Prompt Test',
        nodes: [
            {
                name: 'coordinator',
                type: 'task',
                attributes: [
                    { name: 'prompt', value: 'Coordinate parallel work' }
                ]
            },
            {
                name: 'taskA',
                type: 'task',
                attributes: [
                    { name: 'prompt', value: 'Task A prompt' }
                ]
            },
            {
                name: 'taskB',
                type: 'task',
                attributes: [
                    { name: 'prompt', value: 'Task B prompt' }
                ]
            },
            {
                name: 'waitForResults',
                type: 'state',
                attributes: []
            }
        ],
        edges: [
            {
                source: 'coordinator',
                target: 'taskA',
                annotations: [{ name: 'async' }]
            },
            {
                source: 'coordinator',
                target: 'taskB',
                annotations: [{ name: 'async' }]
            },
            {
                source: 'coordinator',
                target: 'waitForResults'
            }
        ],
        attributes: [],
        annotations: []
    };

    const state: ExecutionState = {
        paths: [{
            id: 'path_0',
            currentNode: 'coordinator',
            status: 'active',
            history: [],
            stepCount: 0,
            nodeInvocationCounts: {},
            stateTransitions: [],
            startTime: Date.now()
        }],
        context: {},
        metadata: {
            stepCount: 0,
            errorCount: 0,
            startTime: Date.now(),
            elapsedTime: 0
        },
        limits: {
            maxSteps: 100,
            maxNodeInvocations: 10,
            timeout: 60000,
            cycleDetectionWindow: 10
        },
        machineSnapshot: machineJSON
    };

    it('should generate spawn_async tools for @async edges on task with prompt', () => {
        const tools = buildTools(machineJSON, state, 'path_0', 'coordinator');

        // Check for spawn_async tools
        const spawnAsyncTools = tools.filter(t => t.name.startsWith('spawn_async_to_'));

        expect(spawnAsyncTools.length).toBe(2);
        expect(spawnAsyncTools.map(t => t.name)).toContain('spawn_async_to_taskA');
        expect(spawnAsyncTools.map(t => t.name)).toContain('spawn_async_to_taskB');
    });

    it('should generate transition tool for non-async edge', () => {
        const tools = buildTools(machineJSON, state, 'path_0', 'coordinator');

        // Check for regular transition tool
        const transitionTools = tools.filter(t => t.name.startsWith('transition_to_'));

        expect(transitionTools.length).toBe(1);
        expect(transitionTools[0].name).toBe('transition_to_waitForResults');
    });

    it('spawn_async tools should have await_result parameter', () => {
        const tools = buildTools(machineJSON, state, 'path_0', 'coordinator');

        const spawnTool = tools.find(t => t.name === 'spawn_async_to_taskA');
        expect(spawnTool).toBeDefined();

        const schema = spawnTool!.input_schema as any;
        expect(schema.properties).toHaveProperty('await_result');
        expect(schema.properties.await_result.type).toBe('boolean');
    });
});
