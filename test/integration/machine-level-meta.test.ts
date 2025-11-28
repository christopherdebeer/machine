/**
 * Test suite for machine-level meta attribute
 * Verifies that meta tools are available when meta: true is set at machine level
 */

import { describe, expect, test } from 'vitest';
import { buildTools } from '../../src/language/execution/effect-builder.js';
import type { MachineJSON } from '../../src/language/json/types.js';
import type { ExecutionState } from '../../src/language/execution/runtime-types.js';

describe('Machine-level meta attribute', () => {
    test('meta tools are available when meta: true at machine level', () => {
        const machineData: MachineJSON = {
            title: 'Dynamic Tool Builder',
            attributes: [
                { name: 'meta', value: true }
            ],
            nodes: [
                {
                    name: 'start',
                    type: 'State',
                    attributes: [
                        { name: 'prompt', value: 'Use list_available_tools meta-tool to see what tools exist.' }
                    ]
                },
                {
                    name: 'end',
                    type: 'State'
                }
            ],
            edges: [
                { source: 'start', target: 'end' }
            ]
        };

        // Create a minimal execution state
        const state: ExecutionState = {
            machineSnapshot: machineData,
            paths: [
                {
                    id: 'path-1',
                    currentNode: 'start',
                    status: 'active',
                    stepCount: 0,
                    history: [],
                    nodeInvocationCounts: {},
                    stateTransitions: [],
                    startTime: new Date().toISOString()
                }
            ],
            metadata: {
                stepCount: 0,
                elapsedTime: 0,
                errorCount: 0,
                startTime: new Date().toISOString()
            },
            limits: {
                maxSteps: 1000,
                maxNodeInvocations: 100,
                timeout: 300000,
                cycleDetectionWindow: 20
            }
        };

        // Build tools for the start node
        const tools = buildTools(machineData, state, 'path-1', 'start');

        // Verify meta tools are included
        const hasAddNode = tools.some(t => t.name === 'add_node');
        const hasAddEdge = tools.some(t => t.name === 'add_edge');

        expect(hasAddNode).toBe(true);
        expect(hasAddEdge).toBe(true);
    });

    test('meta tools are available when meta: "true" as string at machine level', () => {
        const machineData: MachineJSON = {
            title: 'Test Machine',
            attributes: [
                { name: 'meta', value: 'true' }
            ],
            nodes: [
                {
                    name: 'task1',
                    type: 'Task',
                    attributes: [
                        { name: 'prompt', value: 'Do something' }
                    ]
                }
            ],
            edges: []
        };

        const state: ExecutionState = {
            machineSnapshot: machineData,
            paths: [
                {
                    id: 'path-1',
                    currentNode: 'task1',
                    status: 'active',
                    stepCount: 0,
                    history: [],
                    nodeInvocationCounts: {},
                    stateTransitions: [],
                    startTime: new Date().toISOString()
                }
            ],
            metadata: {
                stepCount: 0,
                elapsedTime: 0,
                errorCount: 0,
                startTime: new Date().toISOString()
            },
            limits: {
                maxSteps: 1000,
                maxNodeInvocations: 100,
                timeout: 300000,
                cycleDetectionWindow: 20
            }
        };

        const tools = buildTools(machineData, state, 'path-1', 'task1');

        const hasAddNode = tools.some(t => t.name === 'add_node');
        const hasAddEdge = tools.some(t => t.name === 'add_edge');

        expect(hasAddNode).toBe(true);
        expect(hasAddEdge).toBe(true);
    });

    test('node-level meta still works', () => {
        const machineData: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                {
                    name: 'metaTask',
                    type: 'Task',
                    attributes: [
                        { name: 'prompt', value: 'Do something' },
                        { name: 'meta', value: 'true' }
                    ]
                }
            ],
            edges: []
        };

        const state: ExecutionState = {
            machineSnapshot: machineData,
            paths: [
                {
                    id: 'path-1',
                    currentNode: 'metaTask',
                    status: 'active',
                    stepCount: 0,
                    history: [],
                    nodeInvocationCounts: {},
                    stateTransitions: [],
                    startTime: new Date().toISOString()
                }
            ],
            metadata: {
                stepCount: 0,
                elapsedTime: 0,
                errorCount: 0,
                startTime: new Date().toISOString()
            },
            limits: {
                maxSteps: 1000,
                maxNodeInvocations: 100,
                timeout: 300000,
                cycleDetectionWindow: 20
            }
        };

        const tools = buildTools(machineData, state, 'path-1', 'metaTask');

        const hasAddNode = tools.some(t => t.name === 'add_node');
        const hasAddEdge = tools.some(t => t.name === 'add_edge');

        expect(hasAddNode).toBe(true);
        expect(hasAddEdge).toBe(true);
    });

    test('meta tools are NOT available when meta is not set', () => {
        const machineData: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                {
                    name: 'normalTask',
                    type: 'Task',
                    attributes: [
                        { name: 'prompt', value: 'Do something' }
                    ]
                }
            ],
            edges: []
        };

        const state: ExecutionState = {
            machineSnapshot: machineData,
            paths: [
                {
                    id: 'path-1',
                    currentNode: 'normalTask',
                    status: 'active',
                    stepCount: 0,
                    history: [],
                    nodeInvocationCounts: {},
                    stateTransitions: [],
                    startTime: new Date().toISOString()
                }
            ],
            metadata: {
                stepCount: 0,
                elapsedTime: 0,
                errorCount: 0,
                startTime: new Date().toISOString()
            },
            limits: {
                maxSteps: 1000,
                maxNodeInvocations: 100,
                timeout: 300000,
                cycleDetectionWindow: 20
            }
        };

        const tools = buildTools(machineData, state, 'path-1', 'normalTask');

        const hasMetaTools = tools.some(t => t.name === 'add_node' || t.name === 'add_edge');

        expect(hasMetaTools).toBe(false);
    });
});
