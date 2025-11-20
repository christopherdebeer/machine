import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MachineExecutor } from '../../src/language/executor.js';
import type { MachineJSON } from '../../src/language/json/types.js';
import { InteractiveTestClient } from '../../src/language/interactive-test-client.js';
import * as fs from 'fs';

type MachineData = MachineJSON;

/**
 * Task Node Execution Tests - Now Using Interactive Test Client
 *
 * These tests use InteractiveTestClient which communicates with an agent
 * (like test-agent-responder.js) for intelligent LLM responses.
 *
 * To run these tests:
 *   Terminal 1: node scripts/test-agent-responder.js
 *   Terminal 2: npm test test/validating/task-execution.test.ts
 *
 * See test/CLAUDE.md for more details.
 */

describe('Task Node Execution (Interactive)', () => {
    let executor: MachineExecutor;
    let mockMachineData: MachineData;
    let client: InteractiveTestClient;
    const queueDir = '.dygram-test-queue';

    beforeEach(() => {
        // Clean up queue from previous runs
        if (fs.existsSync(queueDir)) {
            fs.rmSync(queueDir, { recursive: true });
        }

        // Create interactive client
        client = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir,
            recordResponses: true,
            recordingsDir: 'test/fixtures/recordings/task-execution',
            timeout: 10000
        });

        // Setup test machine data
        mockMachineData = {
            title: 'Test Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'task',
                    attributes: [
                        { name: 'title', type: 'string', value: 'Test Task' },
                        { name: 'desc', type: 'string', value: 'A test task description' },
                        { name: 'prompt', type: 'string', value: 'Please process this test task' }
                    ]
                },
                {
                    name: 'analysis',
                    type: 'task',
                    attributes: [
                        { name: 'title', type: 'string', value: 'Analysis Task' },
                        { name: 'desc', type: 'string', value: 'An analysis task' },
                        { name: 'prompt', type: 'string', value: 'Please analyze this data' },
                        { name: 'taskType', type: 'string', value: 'analysis' }
                    ]
                },
                {
                    name: 'end',
                    type: 'end'
                }
            ],
            edges: [
                { source: 'start', target: 'analysis' },
                { source: 'analysis', target: 'end' }
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

    it('should execute a basic task node', async () => {
        const result = await executor.step();
        expect(result).toBe(true);

        const context = executor.getContext();
        expect(context.history.length).toBeGreaterThan(0);
        // The task should have transitioned from start
        expect(context.currentNode).not.toBe('start');
    });

    it('should execute an analysis task node with specific template', async () => {
        // First step to move past start node
        await executor.step();

        // Execute analysis node (if not already at end)
        const context1 = executor.getContext();
        if (context1.currentNode !== 'end') {
            await executor.step();
        }

        const context = executor.getContext();
        expect(context.history.length).toBeGreaterThanOrEqual(1);
        // Should have visited the analysis node or reached end
        expect(['analysis', 'end']).toContain(context.currentNode);
    });

    it('should execute all nodes in sequence', async () => {
        const finalState = await executor.execute();
        const context = executor.getContext();

        // Should have completed execution
        expect(context.currentNode).toBe('end');
        expect(context.history.length).toBeGreaterThan(0);
        expect(context.visitedNodes.size).toBeGreaterThanOrEqual(2);
    });

    it('should handle missing attributes gracefully', async () => {
        const minimalMachine: MachineData = {
            title: 'Minimal Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'task'
                },
                {
                    name: 'end',
                    type: 'end'
                }
            ],
            edges: [
                { source: 'start', target: 'end' }
            ]
        };

        const minimalClient = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir,
            recordResponses: false,
            timeout: 10000
        });

        const minimalExecutor = new MachineExecutor(minimalMachine, { llm: minimalClient as any });
        const result = await minimalExecutor.step();
        expect(result).toBe(true);

        const context = minimalExecutor.getContext();
        expect(context.history.length).toBeGreaterThan(0);
        // Should have transitioned from start
        expect(context.currentNode).not.toBe('start');
    });
});
