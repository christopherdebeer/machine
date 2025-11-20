/**
 * Tool-Based Execution Tests - Interactive Mode
 *
 * Tests transition tools and intelligent path selection using InteractiveTestClient.
 *
 * To run:
 *   Terminal 1: node scripts/test-agent-responder.js
 *   Terminal 2: npm test test/validating/tool-execution.test.ts
 *
 * See test/CLAUDE.md for details.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MachineExecutor } from '../../src/language/executor.js';
import type { MachineJSON } from '../../src/language/json/types.js';
import { InteractiveTestClient } from '../../src/language/interactive-test-client.js';
import * as fs from 'fs';

type MachineData = MachineJSON;

describe('Tool-Based Execution (Interactive)', () => {
    let executor: MachineExecutor;
    let mockMachineData: MachineData;
    let client: InteractiveTestClient;
    const queueDir = '.dygram-test-queue';

    beforeEach(() => {
        // Clean up queue
        if (fs.existsSync(queueDir)) {
            fs.rmSync(queueDir, { recursive: true });
        }

        // Create interactive client
        client = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir,
            recordResponses: true,
            recordingsDir: 'test/fixtures/recordings/tool-execution',
            timeout: 10000
        });

        // Setup test machine with branching paths
        mockMachineData = {
            title: 'Test Router Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'task',
                    attributes: [
                        { name: 'prompt', type: 'string', value: 'Classify this input and choose appropriate path' }
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

        executor = new MachineExecutor(mockMachineData, { llm: client as any });
    });

    afterEach(() => {
        // Clean up queue
        if (fs.existsSync(queueDir)) {
            fs.rmSync(queueDir, { recursive: true });
        }
    });

    describe('Transition Tools', () => {
        it('should transition from start node to another node', async () => {
            await executor.step();

            const context = executor.getContext();

            // Should have transitioned from start
            expect(context.currentNode).not.toBe('start');

            // Should be at one of the available paths or already at end
            expect(['pathA', 'pathB', 'end']).toContain(context.currentNode);

            // Should have history
            expect(context.history.length).toBeGreaterThan(0);
        });

        it('should handle multiple transition options', async () => {
            // Execute and see which path agent chooses
            await executor.step();

            const context = executor.getContext();

            // Should have chosen one of the paths
            const validNodes = ['pathA', 'pathB', 'end'];
            expect(validNodes).toContain(context.currentNode);
        });

        it('should complete full execution through branching paths', async () => {
            await executor.execute();

            const context = executor.getContext();

            // Should reach end
            expect(context.currentNode).toBe('end');

            // Should have visited multiple nodes
            expect(context.visitedNodes.size).toBeGreaterThanOrEqual(2);

            // Should have history entries
            expect(context.history.length).toBeGreaterThan(0);
        });
    });

    describe('State Transitions', () => {
        it('should track state transitions', async () => {
            await executor.step();

            const context = executor.getContext();

            // Should have state transitions if available
            if (context.stateTransitions) {
                expect(Array.isArray(context.stateTransitions)).toBe(true);
            }
        });

        it('should visit nodes sequentially', async () => {
            await executor.execute();

            const context = executor.getContext();

            // Check visited nodes
            expect(context.visitedNodes.has('start')).toBe(true);
            expect(context.visitedNodes.has('end')).toBe(true);

            // Should have visited at least one intermediate node
            const intermediateVisited = context.visitedNodes.has('pathA') ||
                                       context.visitedNodes.has('pathB');
            expect(intermediateVisited).toBe(true);
        });
    });

    describe('Complex Routing', () => {
        it('should handle machine with multiple decision points', async () => {
            const complexMachine: MachineData = {
                title: 'Complex Router',
                nodes: [
                    {
                        name: 'start',
                        type: 'task',
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Initial routing decision' }
                        ]
                    },
                    {
                        name: 'checkpoint1',
                        type: 'task',
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Second routing decision' }
                        ]
                    },
                    {
                        name: 'success',
                        type: 'state'
                    },
                    {
                        name: 'alternate',
                        type: 'state'
                    },
                    {
                        name: 'end',
                        type: 'end'
                    }
                ],
                edges: [
                    { source: 'start', target: 'checkpoint1' },
                    { source: 'start', target: 'alternate' },
                    { source: 'checkpoint1', target: 'success' },
                    { source: 'checkpoint1', target: 'alternate' },
                    { source: 'success', target: 'end' },
                    { source: 'alternate', target: 'end' }
                ]
            };

            const complexClient = new InteractiveTestClient({
                mode: 'file-queue',
                queueDir,
                recordResponses: false,
                timeout: 15000
            });

            const complexExecutor = new MachineExecutor(complexMachine, { llm: complexClient as any });

            await complexExecutor.execute();

            const context = complexExecutor.getContext();

            // Should complete
            expect(context.currentNode).toBe('end');

            // Should have made multiple decisions
            expect(context.history.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Error Handling', () => {
        it('should handle machine with no transitions gracefully', async () => {
            const isolatedMachine: MachineData = {
                title: 'Isolated Machine',
                nodes: [
                    {
                        name: 'start',
                        type: 'task',
                        attributes: [
                            { name: 'prompt', type: 'string', value: 'Process task' }
                        ]
                    }
                ],
                edges: []
            };

            const isolatedClient = new InteractiveTestClient({
                mode: 'file-queue',
                queueDir,
                recordResponses: false,
                timeout: 5000
            });

            const isolatedExecutor = new MachineExecutor(isolatedMachine, { llm: isolatedClient as any });

            // Should not throw
            await isolatedExecutor.step();

            const context = isolatedExecutor.getContext();

            // Should still be at start (no transitions available)
            expect(context.currentNode).toBe('start');
        });
    });
});
