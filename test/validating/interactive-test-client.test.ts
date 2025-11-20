/**
 * Tests for Interactive Test Client - Proof of Concept
 *
 * This validates that the interactive testing approach is feasible.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InteractiveTestClient } from '../../src/language/interactive-test-client.js';
import { MachineExecutor } from '../../src/language/executor.js';
import type { MachineJSON } from '../../src/language/json/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout as delay } from 'timers/promises';

describe('InteractiveTestClient - Feasibility Tests', () => {
    const queueDir = '.dygram-test-queue-test';

    beforeEach(() => {
        // Clean up queue
        if (fs.existsSync(queueDir)) {
            fs.rmSync(queueDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean up queue
        if (fs.existsSync(queueDir)) {
            fs.rmSync(queueDir, { recursive: true });
        }
    });

    it('should create queue directories', () => {
        const client = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir,
            recordResponses: false
        });

        expect(fs.existsSync(path.join(queueDir, 'requests'))).toBe(true);
        expect(fs.existsSync(path.join(queueDir, 'responses'))).toBe(true);
    });

    it('should send request and wait for response (manual response)', async () => {
        const client = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir,
            recordResponses: false,
            timeout: 5000
        });

        // Simulate agent responding in parallel
        const agentSimulation = async () => {
            // Wait for request file to appear
            await delay(100);

            const requestsPath = path.join(queueDir, 'requests');
            const files = fs.readdirSync(requestsPath);

            if (files.length === 0) {
                throw new Error('No request file found');
            }

            const requestFile = files[0];
            const requestPath = path.join(requestsPath, requestFile);
            const request = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));

            console.log('[Agent Simulation] Received request:', request.requestId);
            console.log('[Agent Simulation] Tools:', request.tools.map((t: any) => t.name));

            // Simulate agent making intelligent choice
            const selectedTool = request.tools[0]; // For now, just pick first
            const response = {
                type: 'llm_invocation_response',
                requestId: request.requestId,
                timestamp: new Date().toISOString(),
                reasoning: 'Agent simulation chose first tool',
                response: {
                    content: [
                        { type: 'text', text: 'Agent response' },
                        {
                            type: 'tool_use',
                            id: 'sim-tool-1',
                            name: selectedTool.name,
                            input: { reason: 'agent decision' }
                        }
                    ],
                    stop_reason: 'tool_use'
                }
            };

            // Write response
            const responsePath = path.join(
                queueDir,
                'responses',
                `${request.requestId}.json`
            );
            fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));

            console.log('[Agent Simulation] Sent response');
        };

        // Start agent simulation
        const agentPromise = agentSimulation();

        // Make request
        const response = await client.invokeWithTools(
            [{ role: 'user', content: 'Test prompt' }],
            [
                {
                    name: 'test_tool',
                    description: 'A test tool',
                    input_schema: {
                        type: 'object',
                        properties: {
                            reason: { type: 'string' }
                        }
                    }
                }
            ]
        );

        await agentPromise;

        expect(response.stop_reason).toBe('tool_use');
        expect(response.content).toHaveLength(2);
        expect(response.content[1].type).toBe('tool_use');
    });

    it('should work with MachineExecutor', async () => {
        const machineData: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'task',
                    attributes: [
                        { name: 'prompt', type: 'string', value: 'Choose a path' }
                    ]
                },
                { name: 'pathA', type: 'state' },
                { name: 'pathB', type: 'state' },
                { name: 'end', type: 'end' }
            ],
            edges: [
                { source: 'start', target: 'pathA' },
                { source: 'start', target: 'pathB' },
                { source: 'pathA', target: 'end' },
                { source: 'pathB', target: 'end' }
            ]
        };

        const client = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir,
            recordResponses: true,
            recordingsDir: 'test/fixtures/recordings-poc'
        });

        // Simulate agent making intelligent decision
        const agentSimulation = async () => {
            await delay(200);

            const requestsPath = path.join(queueDir, 'requests');
            const files = fs.readdirSync(requestsPath);

            for (const file of files) {
                const requestPath = path.join(requestsPath, file);
                const request = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));

                console.log('[Agent] Processing request for machine:', request.context.machineTitle);

                // Find transition tool for pathA
                const transitionTool = request.tools.find((t: any) =>
                    t.name.includes('pathA')
                );

                if (transitionTool) {
                    const response = {
                        type: 'llm_invocation_response',
                        requestId: request.requestId,
                        timestamp: new Date().toISOString(),
                        reasoning: 'Chose pathA based on prompt context',
                        response: {
                            content: [
                                { type: 'text', text: 'I will choose path A' },
                                {
                                    type: 'tool_use',
                                    id: 'tool-1',
                                    name: transitionTool.name,
                                    input: { reason: 'Intelligent agent choice' }
                                }
                            ],
                            stop_reason: 'tool_use'
                        }
                    };

                    const responsePath = path.join(
                        queueDir,
                        'responses',
                        `${request.requestId}.json`
                    );
                    fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));
                }
            }
        };

        const executor = new MachineExecutor(machineData, { llm: client as any });

        // Start agent simulation
        const agentPromise = agentSimulation();

        // Execute one step
        await executor.step();

        await agentPromise;

        const context = executor.getContext();
        console.log('Current node after step:', context.currentNode);

        // Should have transitioned to pathA (or at least transitioned somewhere)
        expect(context.currentNode).not.toBe('start');
    });

    it('should record responses for playback', async () => {
        const recordingsDir = 'test/fixtures/recordings-test';

        const client = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir,
            recordResponses: true,
            recordingsDir
        });

        // Simulate agent
        const agentSimulation = async () => {
            await delay(100);
            const requestsPath = path.join(queueDir, 'requests');
            const files = fs.readdirSync(requestsPath);
            const requestPath = path.join(requestsPath, files[0]);
            const request = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));

            const response = {
                type: 'llm_invocation_response',
                requestId: request.requestId,
                timestamp: new Date().toISOString(),
                response: {
                    content: [{ type: 'text', text: 'Recorded response' }],
                    stop_reason: 'end_turn'
                }
            };

            const responsePath = path.join(
                queueDir,
                'responses',
                `${request.requestId}.json`
            );
            fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));
        };

        const agentPromise = agentSimulation();

        await client.invokeWithTools(
            [{ role: 'user', content: 'Test' }],
            []
        );

        await agentPromise;

        // Check recording was saved
        const recordings = fs.readdirSync(recordingsDir);
        expect(recordings.length).toBeGreaterThan(0);

        // Clean up
        fs.rmSync(recordingsDir, { recursive: true });
    });
});
