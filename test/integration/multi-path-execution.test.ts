/**
 * Tests for Multi-Path Execution with Multiple Start Nodes
 */

import { describe, it, expect } from 'vitest';
import { MachineExecutor, type MachineJSON } from '../../src/language/executor.js';

describe('Multi-Path Execution', () => {
    describe('Multiple Start Nodes', () => {
        it('should create a path for each node with @start annotation', () => {
            const machineData: MachineJSON = {
                title: 'Multi-Start Machine',
                nodes: [
                    { name: 'PathA', type: 'task', annotations: [{ name: 'start' }] },
                    { name: 'PathB', type: 'task', annotations: [{ name: 'start' }] },
                    { name: 'PathC', type: 'task', annotations: [{ name: 'start' }] },
                    { name: 'End', type: 'state' }
                ],
                edges: [
                    { source: 'PathA', target: 'End' },
                    { source: 'PathB', target: 'End' },
                    { source: 'PathC', target: 'End' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            const state = executor.getState();

            // Should have 3 initial paths
            expect(state.paths).toHaveLength(3);
            expect(state.paths[0].currentNode).toBe('PathA');
            expect(state.paths[1].currentNode).toBe('PathB');
            expect(state.paths[2].currentNode).toBe('PathC');

            // All paths should be active
            expect(state.paths.every(p => p.status === 'active')).toBe(true);
        });

        it('should create paths for multiple nodes with no incoming edges', () => {
            const machineData: MachineJSON = {
                title: 'Multiple Entry Points',
                nodes: [
                    { name: 'Entry1', type: 'task' },
                    { name: 'Entry2', type: 'task' },
                    { name: 'Middle', type: 'task' },
                    { name: 'End', type: 'state' }
                ],
                edges: [
                    { source: 'Entry1', target: 'Middle' },
                    { source: 'Entry2', target: 'Middle' },
                    { source: 'Middle', target: 'End' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            const state = executor.getState();

            // Should have 2 paths (Entry1 and Entry2 have no incoming edges)
            expect(state.paths).toHaveLength(2);

            const currentNodes = state.paths.map(p => p.currentNode).sort();
            expect(currentNodes).toEqual(['Entry1', 'Entry2']);
        });

        it('should prefer named "start" nodes over entry points', () => {
            const machineData: MachineJSON = {
                title: 'Named Start Priority',
                nodes: [
                    { name: 'Start', type: 'task' },  // Named "start"
                    { name: 'EntryPoint', type: 'task' }, // No incoming edges
                    { name: 'End', type: 'state' }
                ],
                edges: [
                    { source: 'Start', target: 'End' },
                    { source: 'EntryPoint', target: 'End' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            const state = executor.getState();

            // Should only start from "Start" node
            expect(state.paths).toHaveLength(1);
            expect(state.paths[0].currentNode).toBe('Start');
        });
    });

    describe('Concurrent Path Execution', () => {
        it('should execute all paths concurrently in a single step', async () => {
            const machineData: MachineJSON = {
                title: 'Concurrent Execution',
                nodes: [
                    { name: 'Start1', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'Start2', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'Next1', type: 'state' },
                    { name: 'Next2', type: 'state' }
                ],
                edges: [
                    { source: 'Start1', target: 'Next1' },
                    { source: 'Start2', target: 'Next2' }
                ]
            };

            const executor = new MachineExecutor(machineData);

            // Execute one step - should advance both paths
            await executor.step();

            const state = executor.getState();

            // Both paths should have transitioned
            expect(state.paths[0].currentNode).toBe('Next1');
            expect(state.paths[1].currentNode).toBe('Next2');

            // Both paths should have history
            expect(state.paths[0].history).toHaveLength(1);
            expect(state.paths[1].history).toHaveLength(1);
        });

        it('should handle paths finishing at different times', async () => {
            const machineData: MachineJSON = {
                title: 'Asymmetric Paths',
                nodes: [
                    { name: 'StartA', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'StartB', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'EndA', type: 'state' },  // Short path
                    { name: 'MiddleB', type: 'state' },
                    { name: 'EndB', type: 'state' }    // Longer path
                ],
                edges: [
                    { source: 'StartA', target: 'EndA' },  // 1 hop
                    { source: 'StartB', target: 'MiddleB' },
                    { source: 'MiddleB', target: 'EndB' }   // 2 hops
                ]
            };

            const executor = new MachineExecutor(machineData);

            // Step 1: Both paths advance
            await executor.step();
            let state = executor.getState();
            expect(state.paths[0].currentNode).toBe('EndA');
            expect(state.paths[1].currentNode).toBe('MiddleB');

            // Step 2: Only path B can advance (A is at terminal)
            await executor.step();
            state = executor.getState();
            expect(state.paths[0].currentNode).toBe('EndA');
            expect(state.paths[0].status).toBe('completed');
            expect(state.paths[1].currentNode).toBe('EndB');

            // Step 3: Path B reaches terminal
            await executor.step();
            state = executor.getState();
            expect(state.paths[1].status).toBe('completed');
        });
    });

    describe('Visualization State', () => {
        it('should clearly show all paths in visualization state', () => {
            const machineData: MachineJSON = {
                title: 'Multi-Path Visualization',
                nodes: [
                    { name: 'Start1', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'Start2', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'Start3', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'End', type: 'state' }
                ],
                edges: [
                    { source: 'Start1', target: 'End' },
                    { source: 'Start2', target: 'End' },
                    { source: 'Start3', target: 'End' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            const vizState = executor.getVisualizationState();

            // Should show all 3 current nodes
            expect(vizState.currentNodes).toHaveLength(3);
            expect(vizState.currentNodes.map(n => n.nodeName).sort()).toEqual([
                'Start1',
                'Start2',
                'Start3'
            ]);

            // Should show path counts
            expect(vizState.totalPaths).toBe(3);
            expect(vizState.activePathCount).toBe(3);
            expect(vizState.completedPathCount).toBe(0);
            expect(vizState.failedPathCount).toBe(0);

            // Should show all paths
            expect(vizState.allPaths).toHaveLength(3);
            expect(vizState.activePaths).toHaveLength(3);

            // Node states should show which paths are at each node
            expect(vizState.nodeStates['Start1'].isActive).toBe(true);
            expect(vizState.nodeStates['Start1'].activeInPaths).toContain('path_0');
            expect(vizState.nodeStates['Start2'].isActive).toBe(true);
            expect(vizState.nodeStates['Start2'].activeInPaths).toContain('path_1');
            expect(vizState.nodeStates['Start3'].isActive).toBe(true);
            expect(vizState.nodeStates['Start3'].activeInPaths).toContain('path_2');
        });

        it('should aggregate node visit counts across all paths', async () => {
            const machineData: MachineJSON = {
                title: 'Shared Node Visits',
                nodes: [
                    { name: 'Start1', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'Start2', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'Shared', type: 'state' },
                    { name: 'End', type: 'state' }
                ],
                edges: [
                    { source: 'Start1', target: 'Shared' },
                    { source: 'Start2', target: 'Shared' },
                    { source: 'Shared', target: 'End' }
                ]
            };

            const executor = new MachineExecutor(machineData);

            // Execute one step - both paths transition to Shared
            await executor.step();

            const vizState = executor.getVisualizationState();

            // Shared node should be active in both paths
            expect(vizState.nodeStates['Shared'].isActive).toBe(true);
            expect(vizState.nodeStates['Shared'].activeInPaths).toHaveLength(2);
            expect(vizState.nodeStates['Shared'].activeInPaths).toContain('path_0');
            expect(vizState.nodeStates['Shared'].activeInPaths).toContain('path_1');

            // Visit count should be 2 (one from each path)
            expect(vizState.nodeStates['Shared'].visitCount).toBe(2);
        });

        it('should show available transitions per path', () => {
            const machineData: MachineJSON = {
                title: 'Per-Path Transitions',
                nodes: [
                    { name: 'Start1', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'Start2', type: 'state', annotations: [{ name: 'start' }] },
                    { name: 'A', type: 'state' },
                    { name: 'B', type: 'state' }
                ],
                edges: [
                    { source: 'Start1', target: 'A' },
                    { source: 'Start2', target: 'B' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            const vizState = executor.getVisualizationState();

            // Should have transitions for both paths
            expect(vizState.availableTransitions).toHaveLength(2);

            // Each transition should specify which path it belongs to
            const pathIds = vizState.availableTransitions.map(t => t.pathId);
            expect(pathIds).toContain('path_0');
            expect(pathIds).toContain('path_1');

            // Verify correct targets
            const path0Transition = vizState.availableTransitions.find(t => t.pathId === 'path_0');
            const path1Transition = vizState.availableTransitions.find(t => t.pathId === 'path_1');

            expect(path0Transition?.toNode).toBe('A');
            expect(path1Transition?.toNode).toBe('B');
        });
    });
});
