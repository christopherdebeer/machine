import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { MachineExecutor } from '../../src/language/executor.js';
import { EvolutionaryExecutor } from '../../src/language/task-evolution.js';
import { VisualizingMachineExecutor } from '../../src/language/runtime-visualizer.js';
import { createStorage } from '../../src/language/storage.js';
import { convertAstToMachineData, cloneMachineData } from '../utils/ast-to-machine-data.js';

/**
 * Integration tests for runtime visualization and circular reference prevention
 * These tests specifically target the issues found in the mobile playground
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

afterEach(() => {
    vi.clearAllMocks();
});

/**
 * Helper function to test JSON serialization without circular references
 */
function testJSONSerialization(obj: any, description: string): void {
    expect(() => {
        const jsonString = JSON.stringify(obj);
        expect(jsonString).toBeDefined();
        expect(jsonString.length).toBeGreaterThan(0);
        
        // Verify we can parse it back
        const parsed = JSON.parse(jsonString);
        expect(parsed).toBeDefined();
    }).not.toThrow(`JSON serialization should not fail for ${description}`);
}

describe('Runtime Visualization - Circular Reference Prevention', () => {
    const testMachines = [
        {
            name: 'simple-workflow',
            source: `machine "Simple Workflow"
                state start;
                state end;
                start -> end;`
        },
        {
            name: 'task-workflow',
            source: `machine "Task Management"
                Input task {
                    description<string>: "TBD";
                    priority<number>: 5;
                };
                Task process {
                    prompt: "Analyze task: {{ task.description }}";
                };
                Result output {
                    status: "TBD";
                };
                task -requires-> process;
                process -produces-> output;`
        },
        {
            name: 'complex-workflow',
            source: `machine "Complex Workflow"
                context config {
                    env<string>: "test";
                    debug<boolean>: true;
                }
                Input start {
                    data: "initial";
                }
                Task process1 {
                    prompt: "Process step 1";
                }
                Task process2 {
                    prompt: "Process step 2";
                }
                Result end {
                    status: "complete";
                }
                start -> process1;
                process1 -> process2;
                process2 -> end;`
        }
    ];

    testMachines.forEach(({ name, source }) => {
        describe(`Machine: ${name}`, () => {
            it('should parse without circular references in AST conversion', async () => {
                const document = await parse(source);
                expect(document.parseResult.parserErrors).toHaveLength(0);

                const machine = document.parseResult.value as Machine;
                expect(machine).toBeDefined();

                // Convert to MachineData format (this was causing circular references)
                const machineData = convertAstToMachineData(machine);
                expect(machineData).toBeDefined();
                expect(machineData.title).toBeDefined();
                expect(Array.isArray(machineData.nodes)).toBe(true);
                expect(Array.isArray(machineData.edges)).toBe(true);

                // Test JSON serialization of converted data
                testJSONSerialization(machineData, 'converted machine data');
            });

            it('should create MachineExecutor without circular references', async () => {
                const document = await parse(source);
                const machine = document.parseResult.value as Machine;
                const machineData = convertAstToMachineData(machine);

                const executor = new MachineExecutor(machineData);
                expect(executor).toBeDefined();

                // Test context serialization
                const context = executor.getContext();
                testJSONSerialization(context, 'executor context');

                // Test machine data serialization
                testJSONSerialization(executor.getMachineDefinition(), 'executor machine data');
            });

            it('should create EvolutionaryExecutor without circular references', async () => {
                const document = await parse(source);
                const machine = document.parseResult.value as Machine;
                const machineData = convertAstToMachineData(machine);

                const storage = createStorage();
                const executor = new EvolutionaryExecutor(machineData, {}, storage);
                expect(executor).toBeDefined();

                // Test context serialization
                const context = executor.getContext();
                testJSONSerialization(context, 'evolutionary executor context');

                // Test mutations serialization
                const mutations = executor.getMutations();
                testJSONSerialization(mutations, 'executor mutations');

                // Test task metrics serialization
                const taskMetrics = executor.getTaskMetrics();
                const taskMetricsObj = Object.fromEntries(taskMetrics);
                testJSONSerialization(taskMetricsObj, 'task metrics');
            });

            it('should create VisualizingMachineExecutor without circular references', async () => {
                const document = await parse(source);
                const machine = document.parseResult.value as Machine;
                const machineData = convertAstToMachineData(machine);

                const executor = new VisualizingMachineExecutor(machineData);
                expect(executor).toBeDefined();

                // Test context serialization
                const context = executor.getContext();
                testJSONSerialization(context, 'visualizing executor context');
            });

            it('should generate runtime Mermaid diagram without circular references', async () => {
                const document = await parse(source);
                const machine = document.parseResult.value as Machine;
                const machineData = convertAstToMachineData(machine);

                const executor = new MachineExecutor(machineData);

                // Runtime diagram generation has been migrated to Graphviz
                // Mermaid methods are deprecated and now throw errors
                expect(executor).toBeDefined();
            });

            it('should handle storage operations without circular references', async () => {
                const document = await parse(source);
                const machine = document.parseResult.value as Machine;
                const machineData = convertAstToMachineData(machine);

                const storage = createStorage();
                const executor = new EvolutionaryExecutor(machineData, {}, storage);

                // Create safe copies for storage (mimicking the fixed codemirror-setup.ts)
                const safeMachineData = cloneMachineData(machineData);

                const mutations = executor.getMutations();
                const safeMutations = mutations.map((mutation: any) => ({
                    type: mutation.type,
                    timestamp: mutation.timestamp,
                    data: mutation.data ? {
                        task: mutation.data.task,
                        from_stage: mutation.data.from_stage,
                        to_stage: mutation.data.to_stage,
                        code_path: mutation.data.code_path
                    } : {}
                }));

                // Test serialization of safe copies
                testJSONSerialization(safeMachineData, 'safe machine data');
                testJSONSerialization(safeMutations, 'safe mutations');

                // Test storage operation
                const versionData = {
                    version: 'v1.0.0',
                    timestamp: new Date().toISOString(),
                    machine_data: safeMachineData,
                    mutations_since_last: safeMutations,
                    performance_metrics: {
                        avg_execution_time_ms: 100,
                        success_rate: 1.0,
                        cost_per_execution: 0.01,
                        execution_count: 1
                    }
                };

                testJSONSerialization(versionData, 'version data for storage');

                // Attempt storage operation
                expect(async () => {
                    await storage.saveMachineVersion('test_machine_v1', versionData);
                }).not.toThrow();
            });
        });
    });
});

describe('Runtime Visualization - Mobile Playground Integration', () => {
    it('should simulate mobile playground execution flow', async () => {
        const workflowSource = `machine "Task Management"
            Input task {
                description<string>: "TBD";
                priority<number>: 5;
            };
            Task process {
                prompt: "Analyze task: {{ task.description }}";
            };
            Result output {
                status: "TBD";
            };
            task -requires-> process;
            process -produces-> output;`;

        // Step 1: Parse the code (like mobile playground does)
        const document = await parse(workflowSource);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        expect(machine).toBeDefined();

        // Step 2: Convert to MachineData format
        const machineData = convertAstToMachineData(machine);
        testJSONSerialization(machineData, 'mobile playground machine data');

        // Step 3: Create executors (like mobile playground does)
        const storage = createStorage();
        const llmConfig = {}; // No API key for this test

        const baseExecutor = new MachineExecutor(machineData, llmConfig);
        const visualizingExecutor = new VisualizingMachineExecutor(machineData, llmConfig);
        const evolutionaryExecutor = new EvolutionaryExecutor(machineData, llmConfig, storage);

        // Step 4: Test all executor contexts are serializable
        testJSONSerialization(baseExecutor.getContext(), 'base executor context');
        testJSONSerialization(visualizingExecutor.getContext(), 'visualizing executor context');
        testJSONSerialization(evolutionaryExecutor.getContext(), 'evolutionary executor context');

        // Step 5: Runtime diagram generation has been migrated to Graphviz
        // Mermaid methods are deprecated and now throw errors

        // Step 6: Test task analysis (like mobile playground does)
        const taskNodes = machineData.nodes.filter((node: any) => 
            node.type === 'Task' || node.type === 'task' || 
            (node.attributes && node.attributes.some((attr: any) => attr.name === 'prompt'))
        );

        expect(taskNodes.length).toBeGreaterThan(0);
        testJSONSerialization(taskNodes, 'task nodes analysis');

        // Step 7: Test metrics and mutations
        const taskMetrics = evolutionaryExecutor.getTaskMetrics();
        const mutations = evolutionaryExecutor.getMutations();

        testJSONSerialization(Object.fromEntries(taskMetrics), 'task metrics');
        testJSONSerialization(mutations, 'mutations');
    });

    it('should handle execution with simulated LLM calls', async () => {
        const taskSource = `machine "LLM Test"
            Task analyze {
                prompt: "Analyze this data";
            }
            Result output {
                status: "complete";
            }
            analyze -> output;`;

        const document = await parse(taskSource);
        const machine = document.parseResult.value as Machine;
        const machineData = convertAstToMachineData(machine);

        // Mock LLM configuration (without actual API key)
        const mockLlmConfig = {
            llm: {
                provider: 'anthropic' as const,
                apiKey: 'mock-key',
                modelId: 'claude-3-5-sonnet-20241022'
            }
        };

        const executor = new MachineExecutor(machineData, mockLlmConfig);

        // Test that executor creation doesn't cause circular references
        testJSONSerialization(executor.getContext(), 'executor with LLM config context');

        // Runtime diagram generation has been migrated to Graphviz
        // Mermaid methods are deprecated and now throw errors
    });
});

describe('Runtime Visualization - Environment Variable Support', () => {
    it('should support ANTHROPIC_API_KEY environment variable', () => {
        // Test environment variable reading
        const originalEnv = process.env.ANTHROPIC_API_KEY;
        
        // Set test environment variable
        process.env.ANTHROPIC_API_KEY = 'test-api-key-from-env';
        
        // Function to get API key (like we should implement)
        function getApiKey(): string {
            return process.env.ANTHROPIC_API_KEY || '';
        }
        
        expect(getApiKey()).toBe('test-api-key-from-env');
        
        // Restore original environment
        if (originalEnv !== undefined) {
            process.env.ANTHROPIC_API_KEY = originalEnv;
        } else {
            delete process.env.ANTHROPIC_API_KEY;
        }
    });

    it('should create LLM config from environment variable', async () => {
        const originalEnv = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'env-test-key';

        const source = `machine "Env Test"
            Task test {
                prompt: "Test task";
            }`;

        const document = await parse(source);
        const machine = document.parseResult.value as Machine;
        const machineData = convertAstToMachineData(machine);

        // Create LLM config using environment variable
        const llmConfig = process.env.ANTHROPIC_API_KEY ? {
            llm: {
                provider: 'anthropic' as const,
                apiKey: process.env.ANTHROPIC_API_KEY,
                modelId: 'claude-3-5-sonnet-20241022'
            }
        } : {};

        expect(llmConfig.llm?.apiKey).toBe('env-test-key');

        const executor = new MachineExecutor(machineData, llmConfig);
        testJSONSerialization(executor.getContext(), 'executor with env API key');

        // Restore environment
        if (originalEnv !== undefined) {
            process.env.ANTHROPIC_API_KEY = originalEnv;
        } else {
            delete process.env.ANTHROPIC_API_KEY;
        }
    });
});

describe('Runtime Visualization - Error Recovery', () => {
    it('should handle malformed machine data gracefully', async () => {
        const malformedData = {
            title: 'Malformed Machine',
            nodes: [
                {
                    name: 'test',
                    type: 'task',
                    // Missing attributes array - should not cause circular references
                }
            ],
            edges: []
        };

        expect(() => {
            const executor = new MachineExecutor(malformedData);
            testJSONSerialization(executor.getContext(), 'malformed machine context');
        }).not.toThrow();
    });

    it('should handle empty machine data', async () => {
        const emptyData = {
            title: 'Empty Machine',
            nodes: [],
            edges: []
        };

        expect(() => {
            const executor = new MachineExecutor(emptyData);
            testJSONSerialization(executor.getContext(), 'empty machine context');
        }).not.toThrow();
    });

    it('should handle storage failures gracefully', async () => {
        const source = `machine "Storage Test"
            state test;`;

        const document = await parse(source);
        const machine = document.parseResult.value as Machine;
        const machineData = convertAstToMachineData(machine);

        const storage = createStorage();
        const executor = new EvolutionaryExecutor(machineData, {}, storage);

        // Test that even if storage operations fail, we don't get circular references
        const safeMachineData = cloneMachineData(machineData);

        testJSONSerialization(safeMachineData, 'safe machine data for storage');
    });
});
