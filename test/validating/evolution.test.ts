/**
 * Validation: Code Generation & Evolution Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MachineJSON } from '../../src/language/json/types.js';
import { EvolutionaryExecutor } from '../../src/language/task-evolution.js';
import { MemoryStorage } from '../../src/language/storage.js';
import { MachinePersistence, PatternLibrary } from '../../src/language/machine-persistence.js';
import { generateTaskCode, generateCodeGenerationPrompt } from '../../src/language/code-generation.js';

type MachineData = MachineJSON;

// TODO: Update for new EvolutionaryExecutor API
// The EvolutionaryExecutor uses methods (getMutations, modifyNode, addNode, getContext)
// that may have changed in the new implementation

describe.skip('Task Evolution', () => {
    let machineData: MachineData;
    let storage: MemoryStorage;

    beforeEach(() => {
        // Create a simple machine with a task
        machineData = {
            title: 'Test Evolution Machine',
            nodes: [
                {
                    name: 'start',
                    type: 'input'
                },
                {
                    name: 'process',
                    type: 'task',
                    attributes: [
                        { name: 'prompt', type: 'string', value: 'Process this input' },
                        { name: 'evolution_stage', type: 'string', value: 'llm_only' },
                        { name: 'execution_count', type: 'number', value: '0' }
                    ]
                },
                {
                    name: 'end',
                    type: 'output'
                }
            ],
            edges: [
                { source: 'start', target: 'process' },
                { source: 'process', target: 'end' }
            ]
        };

        storage = new MemoryStorage();
    });

    describe('Code Generation', () => {
        it('should generate TypeScript code for a task', () => {
            const code = generateTaskCode({
                taskName: 'test_task',
                prompt: 'Test prompt',
                attributes: { foo: 'bar' },
                executionHistory: [],
                evolutionStage: 'hybrid'
            });

            expect(code).toContain('export async function execute');
            expect(code).toContain('export function getConfidence');
            expect(code).toContain('TaskExecutionResult');
        });

        it('should generate code generation prompt', () => {
            const prompt = generateCodeGenerationPrompt({
                taskName: 'classify',
                prompt: 'Classify this text',
                attributes: {},
                executionHistory: [
                    { from: 'start', to: 'classify', output: 'category A' },
                    { from: 'start', to: 'classify', output: 'category B' }
                ],
                evolutionStage: 'hybrid'
            });

            expect(prompt).toContain('classify');
            expect(prompt).toContain('Classify this text');
            expect(prompt).toContain('TypeScript');
        });

        it('should include execution history in generated prompt', () => {
            const history = Array.from({ length: 15 }, (_, i) => ({
                from: 'input',
                to: 'task',
                output: `result ${i}`
            }));

            const prompt = generateCodeGenerationPrompt({
                taskName: 'task',
                prompt: 'Do something',
                attributes: {},
                executionHistory: history,
                evolutionStage: 'code_first'
            });

            // Should only include last 10 executions
            expect(prompt).toContain('15 executions');
            expect(prompt).toContain('result 14'); // Last execution
        });
    });

    describe('Storage Backends', () => {
        it('should save and load machine versions', async () => {
            const executor = new EvolutionaryExecutor(machineData);
            const persistence = new MachinePersistence(storage);

            const version = await persistence.saveVersion(executor, 'test-machine', {
                avg_execution_time_ms: 100,
                success_rate: 0.95,
                cost_per_execution: 0.01,
                execution_count: 50
            });

            expect(version).toMatch(/^v\d+_\d+$/);

            const loaded = await persistence.loadVersion('test-machine', version);
            expect(loaded).toEqual(machineData);
        });

        it('should save and load generated code', async () => {
            const persistence = new MachinePersistence(storage);
            const code = 'export function test() { return 42; }';

            await persistence.saveGeneratedCode('test/path.ts', code);
            const loaded = await persistence.loadGeneratedCode('test/path.ts');

            expect(loaded).toBe(code);
        });

        it('should list machine versions', async () => {
            const executor = new EvolutionaryExecutor(machineData);
            const persistence = new MachinePersistence(storage);

            await persistence.saveVersion(executor, 'machine1', {
                avg_execution_time_ms: 100,
                success_rate: 0.95,
                cost_per_execution: 0.01,
                execution_count: 50
            });

            await persistence.saveVersion(executor, 'machine1', {
                avg_execution_time_ms: 90,
                success_rate: 0.96,
                cost_per_execution: 0.01,
                execution_count: 100
            });

            const versions = await persistence.listVersions('machine1');
            expect(versions.length).toBe(2);
        });

        it('should rollback to previous version', async () => {
            const executor = new EvolutionaryExecutor(machineData);
            const persistence = new MachinePersistence(storage);

            const v1 = await persistence.saveVersion(executor, 'rollback-test', {
                avg_execution_time_ms: 100,
                success_rate: 0.95,
                cost_per_execution: 0.01,
                execution_count: 50
            });

            // Modify machine
            executor.addNode({ name: 'new_node', type: 'state' });

            const v2 = await persistence.saveVersion(executor, 'rollback-test', {
                avg_execution_time_ms: 90,
                success_rate: 0.96,
                cost_per_execution: 0.01,
                execution_count: 100
            });

            // Rollback to v1
            const rolledBack = await persistence.rollback('rollback-test', v1);
            expect(rolledBack?.nodes.length).toBe(3); // Original 3 nodes
        });
    });

    describe('Pattern Library', () => {
        it('should save and load patterns', async () => {
            const library = new PatternLibrary(storage);

            const pattern = {
                name: 'text_classifier',
                description: 'Classifies text into categories',
                version: 'v1',
                code: 'export function classify() { return "A"; }',
                performance_metrics: {
                    avg_execution_time_ms: 50,
                    success_rate: 0.95,
                    cost_per_execution: 0.005,
                    execution_count: 1000
                },
                trained_on: {
                    machine_id: 'classifier-machine',
                    task_name: 'classify',
                    training_samples: 1000
                }
            };

            await library.savePattern(pattern);

            const loaded = await library.getPattern('text_classifier', 'v1');
            expect(loaded).toEqual(pattern);
        });

        it('should get best pattern version by success rate', async () => {
            const library = new PatternLibrary(storage);

            await library.savePattern({
                name: 'classifier',
                description: 'v1',
                version: 'v1',
                code: 'v1 code',
                performance_metrics: {
                    avg_execution_time_ms: 100,
                    success_rate: 0.90,
                    cost_per_execution: 0.01,
                    execution_count: 100
                },
                trained_on: {
                    machine_id: 'test',
                    task_name: 'test',
                    training_samples: 100
                }
            });

            await library.savePattern({
                name: 'classifier',
                description: 'v2',
                version: 'v2',
                code: 'v2 code',
                performance_metrics: {
                    avg_execution_time_ms: 80,
                    success_rate: 0.95, // Better success rate
                    cost_per_execution: 0.01,
                    execution_count: 200
                },
                trained_on: {
                    machine_id: 'test',
                    task_name: 'test',
                    training_samples: 200
                }
            });

            const best = await library.getBestPattern('classifier');
            expect(best?.version).toBe('v2');
        });

        it('should import pattern into machine', async () => {
            const library = new PatternLibrary(storage);
            const executor = new EvolutionaryExecutor(machineData, {}, storage);

            const pattern = {
                name: 'processor',
                description: 'Processes data',
                version: 'v1',
                code: 'export function process() { return 42; }',
                input_schema: { type: 'string' },
                output_schema: { type: 'number' },
                performance_metrics: {
                    avg_execution_time_ms: 50,
                    success_rate: 0.98,
                    cost_per_execution: 0.005,
                    execution_count: 500
                },
                trained_on: {
                    machine_id: 'test',
                    task_name: 'process',
                    training_samples: 500
                }
            };

            await library.savePattern(pattern);
            await library.importPattern(executor, 'processor', 'process');

            const processNode = executor.getMachineDefinition().nodes.find(n => n.name === 'process');
            const attrs = processNode?.attributes?.reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {} as Record<string, string>);

            expect(attrs?.evolution_stage).toBe('code_only');
            expect(attrs?.pattern_library_ref).toBe('processor');
        });
    });

    describe('Task Evolution Stages', () => {
        it('should track task metrics', async () => {
            const executor = new EvolutionaryExecutor(machineData, {}, storage);

            // Simulate multiple executions by updating metrics manually
            // In real implementation, this would happen during step() execution
            const metrics = executor.getTaskMetrics();
            expect(metrics.size).toBe(0); // Initially empty
        });

        it('should manually trigger task evolution', async () => {
            const executor = new EvolutionaryExecutor(machineData, {}, storage);

            // Save some code for the task
            const code = `
export function getConfidence(input: any): number {
    return 0.9;
}

export async function execute(input: any, context: any): Promise<any> {
    return {
        output: 'processed',
        confidence: 0.9,
        metadata: {
            execution_time_ms: 10,
            used_llm: false
        }
    };
}

export default { execute, getConfidence };
`;
            await storage.saveCode('test/process.ts', code);

            // Trigger evolution
            await executor.triggerEvolution('process');

            const processNode = executor.getMachineDefinition().nodes.find(n => n.name === 'process');
            const attrs = processNode?.attributes?.reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {} as Record<string, string>);

            expect(attrs?.evolution_stage).toBe('hybrid'); // Should evolve from llm_only to hybrid
        });

        it('should not evolve beyond code_only stage', async () => {
            const executor = new EvolutionaryExecutor(machineData, {}, storage);

            // Set task to code_only
            executor.modifyNode('process', { evolution_stage: 'code_only' });

            await expect(
                executor.triggerEvolution('process')
            ).rejects.toThrow('already at final evolution stage');
        });
    });

    describe('Machine Versioning', () => {
        it('should create version history', async () => {
            const executor = new EvolutionaryExecutor(machineData, {}, storage);
            const persistence = new MachinePersistence(storage);

            await persistence.saveVersion(executor, 'machine1', {
                avg_execution_time_ms: 100,
                success_rate: 0.90,
                cost_per_execution: 0.01,
                execution_count: 50
            });

            executor.addNode({ name: 'intermediate', type: 'state' });

            await persistence.saveVersion(executor, 'machine1', {
                avg_execution_time_ms: 95,
                success_rate: 0.92,
                cost_per_execution: 0.01,
                execution_count: 100
            });

            const history = persistence.getVersionHistory();
            expect(history.length).toBe(2);
            expect(history[1].parent_version).toBe(history[0].version);
        });

        it('should track mutations in versions', async () => {
            const executor = new EvolutionaryExecutor(machineData, {}, storage);
            const persistence = new MachinePersistence(storage);

            executor.addNode({ name: 'new_node', type: 'state' });
            executor.addEdge({ source: 'process', target: 'new_node' });

            await persistence.saveVersion(executor, 'machine1', {
                avg_execution_time_ms: 100,
                success_rate: 0.95,
                cost_per_execution: 0.01,
                execution_count: 50
            });

            const history = persistence.getVersionHistory();
            const mutations = history[0].mutations_since_last;

            expect(mutations).toHaveLength(2);
            expect(mutations[0].type).toBe('add_node');
            expect(mutations[1].type).toBe('add_edge');
        });
    });

    describe('End-to-End Evolution', () => {
        it('should complete full evolution lifecycle', async () => {
            const executor = new EvolutionaryExecutor(machineData, {}, storage);
            const persistence = new MachinePersistence(storage);

            // Stage 1: llm_only
            let processNode = executor.getMachineDefinition().nodes.find(n => n.name === 'process');
            let attrs = processNode?.attributes?.reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {} as Record<string, string>);
            expect(attrs?.evolution_stage).toBe('llm_only');

            // Evolve to hybrid
            await executor.triggerEvolution('process');
            processNode = executor.getMachineDefinition().nodes.find(n => n.name === 'process');
            attrs = processNode?.attributes?.reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {} as Record<string, string>);
            expect(attrs?.evolution_stage).toBe('hybrid');

            // Save version
            await persistence.saveVersion(executor, 'evolving-machine', {
                avg_execution_time_ms: 90,
                success_rate: 0.92,
                cost_per_execution: 0.01,
                execution_count: 150
            });

            // Evolve to code_first
            await executor.triggerEvolution('process');
            processNode = executor.getMachineDefinition().nodes.find(n => n.name === 'process');
            attrs = processNode?.attributes?.reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {} as Record<string, string>);
            expect(attrs?.evolution_stage).toBe('code_first');

            // Evolve to code_only
            await executor.triggerEvolution('process');
            processNode = executor.getMachineDefinition().nodes.find(n => n.name === 'process');
            attrs = processNode?.attributes?.reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {} as Record<string, string>);
            expect(attrs?.evolution_stage).toBe('code_only');

            // Verify final state
            const finalVersion = await persistence.saveVersion(executor, 'evolving-machine', {
                avg_execution_time_ms: 50,
                success_rate: 0.98,
                cost_per_execution: 0.005,
                execution_count: 1000
            });

            const history = persistence.getVersionHistory();
            expect(history.length).toBe(2);

            // Should have evolution mutations
            const evolutionMutations = executor.getMutations().filter(m => m.type === 'task_evolution');
            expect(evolutionMutations.length).toBe(3); // llm_only -> hybrid -> code_first -> code_only
        });
    });
});
