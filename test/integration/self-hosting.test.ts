/**
 * Integration tests for Dygram self-hosting system
 * Tests Layer 1 (Bootstrap), Layer 2 (Dygram-in-Dygram), and Layer 3 (Meta-System)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createBootstrapExecutor } from '../../src/language/bootstrap-executor.js';
import { BootstrapTools } from '../../src/language/bootstrap-tools.js';
import { MachineData } from '../../src/language/base-executor.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Self-Hosting Integration Tests', () => {
    let executor: ReturnType<typeof createBootstrapExecutor>;

    beforeEach(() => {
        executor = createBootstrapExecutor(BootstrapTools.getCoreTools());
    });

    describe('Layer 1: Bootstrap Core', () => {
        it('should register all core tools', () => {
            const tools = BootstrapTools.getCoreTools();
            expect(tools).toHaveLength(5);
            expect(tools.map(t => t.name)).toContain('parse_dygram');
            expect(tools.map(t => t.name)).toContain('validate_machine');
            expect(tools.map(t => t.name)).toContain('generate_json');
            expect(tools.map(t => t.name)).toContain('generate_graphviz');
            expect(tools.map(t => t.name)).toContain('execute_machine');
        });

        it('should execute simple machine with tool invocation', async () => {
            const machineData: MachineData = {
                title: 'Test Machine',
                nodes: [
                    {
                        name: 'start',
                        type: 'Task',
                        attributes: [
                            { key: 'uses', value: 'validate_machine' }
                        ]
                    },
                    {
                        name: 'end',
                        type: 'Result',
                        attributes: []
                    }
                ],
                edges: [
                    { source: 'start', target: 'end' }
                ]
            };

            const context = executor.getContext();
            const result = await executor.executeNode('start', machineData, context);

            expect(result.success).toBe(true);
            expect(result.nextNodes).toContain('end');
        });
    });

    describe('Layer 2: Parser Machine', () => {
        it('should load parser machine definition', () => {
            const parserPath = resolve(__dirname, '../../examples/self-hosting/parser-machine.dygram');
            const content = readFileSync(parserPath, 'utf-8');

            expect(content).toContain('machine "Dygram Parser"');
            expect(content).toContain('uses: "parse_dygram"');
            expect(content).toContain('uses: "validate_machine"');
        });

        it('should have correct pipeline structure', () => {
            const parserPath = resolve(__dirname, '../../examples/self-hosting/parser-machine.dygram');
            const content = readFileSync(parserPath, 'utf-8');

            // Check pipeline: source -> parse -> validate -> ast
            expect(content).toContain('source -> parse');
            expect(content).toContain('parse -> validateSyntax');
            expect(content).toContain('validateSyntax -> ast');
        });
    });

    describe('Layer 2: Generator Machine', () => {
        it('should load generator machine definition', () => {
            const generatorPath = resolve(__dirname, '../../examples/self-hosting/generator-machine.dygram');
            const content = readFileSync(generatorPath, 'utf-8');

            expect(content).toContain('machine "Dygram Generator"');
            expect(content).toContain('uses: "generate_json"');
            expect(content).toContain('uses: "generate_graphviz"');
        });

        it('should support multiple output formats', () => {
            const generatorPath = resolve(__dirname, '../../examples/self-hosting/generator-machine.dygram');
            const content = readFileSync(generatorPath, 'utf-8');

            expect(content).toContain('generateJSON');
            expect(content).toContain('generateGraphviz');
            expect(content).toContain('selectFormat');
        });
    });

    describe('Layer 2: Runtime Machine', () => {
        it('should load runtime machine definition', () => {
            const runtimePath = resolve(__dirname, '../../examples/self-hosting/runtime-machine.dygram');
            const content = readFileSync(runtimePath, 'utf-8');

            expect(content).toContain('machine "Dygram Runtime Executor"');
            expect(content).toContain('uses: "execute_machine"');
        });

        it('should have execution loop structure', () => {
            const runtimePath = resolve(__dirname, '../../examples/self-hosting/runtime-machine.dygram');
            const content = readFileSync(runtimePath, 'utf-8');

            // Check for loop structure
            expect(content).toContain('evaluateNode');
            expect(content).toContain('checkTransitions');
            expect(content).toContain('determineNextNode');
            expect(content).toContain('checkLimits');
            expect(content).toContain('State completed');
            expect(content).toContain('State failed');
        });
    });

    describe('Layer 3: Meta-System Machine', () => {
        it('should load meta-system machine definition', () => {
            const metaPath = resolve(__dirname, '../../examples/self-hosting/meta-system-machine.dygram');
            const content = readFileSync(metaPath, 'utf-8');

            expect(content).toContain('machine "Dygram Self-Improvement System"');
            expect(content).toContain('@Meta');
            expect(content).toContain('uses: "get_machine_definition"');
            expect(content).toContain('uses: "update_definition"');
        });

        it('should have self-improvement cycle', () => {
            const metaPath = resolve(__dirname, '../../examples/self-hosting/meta-system-machine.dygram');
            const content = readFileSync(metaPath, 'utf-8');

            // Check self-improvement cycle
            expect(content).toContain('inspectSystem');
            expect(content).toContain('identifyImprovements');
            expect(content).toContain('proposeChanges');
            expect(content).toContain('validateProposal');
            expect(content).toContain('applyChanges');
            expect(content).toContain('testChanges');
            expect(content).toContain('rollbackIfNeeded');
        });
    });

    describe('Complete Workflow', () => {
        it('should load complete workflow machine', () => {
            const workflowPath = resolve(__dirname, '../../examples/self-hosting/complete-workflow.dygram');
            const content = readFileSync(workflowPath, 'utf-8');

            expect(content).toContain('machine "Dygram Complete Self-Hosting Workflow"');
            expect(content).toContain('@SelfHosted');
        });

        it('should reference all Layer 2 machines', () => {
            const workflowPath = resolve(__dirname, '../../examples/self-hosting/complete-workflow.dygram');
            const content = readFileSync(workflowPath, 'utf-8');

            expect(content).toContain('machineRef: "DygramParser"');
            expect(content).toContain('machineRef: "DygramGenerator"');
            expect(content).toContain('machineRef: "DygramRuntimeExecutor"');
            expect(content).toContain('machineRef: "DygramSelfImprovementSystem"');
        });

        it('should have conditional execution paths', () => {
            const workflowPath = resolve(__dirname, '../../examples/self-hosting/complete-workflow.dygram');
            const content = readFileSync(workflowPath, 'utf-8');

            expect(content).toContain('shouldExecute');
            expect(content).toContain('shouldImprove');
            expect(content).toContain('readyToExecute');
            expect(content).toContain('readyToImprove');
        });
    });

    describe('Tool Integration', () => {
        it('should successfully invoke parse_dygram tool', async () => {
            const tool = BootstrapTools.parse_dygram;
            const context = executor.getContext();

            const simpleCode = `
                machine "Test" @Version("1.0")
                Input start { value<string>: "test"; }
                Result end { output<string>: ""; }
                start -> end;
            `;

            const result = await tool.implementation(
                { code: simpleCode, filepath: 'test.dygram' },
                context
            );

            expect(result).toHaveProperty('machine');
            expect(result).toHaveProperty('errors');
            expect(result.errors).toHaveLength(0);
        });

        it('should successfully invoke validate_machine tool', async () => {
            const parseTool = BootstrapTools.parse_dygram;
            const validateTool = BootstrapTools.validate_machine;
            const context = executor.getContext();

            const simpleCode = `
                machine "Test" @Version("1.0")
                Input start { value<string>: "test"; }
                Result end { output<string>: ""; }
                start -> end;
            `;

            const parseResult = await parseTool.implementation(
                { code: simpleCode, filepath: 'test.dygram' },
                context
            );

            expect(parseResult.machine).toBeTruthy();

            const validateResult = await validateTool.implementation(
                { machine: parseResult.machine },
                context
            );

            expect(validateResult).toHaveProperty('valid');
            expect(validateResult).toHaveProperty('errors');
            expect(validateResult).toHaveProperty('warnings');
        });

        it('should successfully invoke generate_json tool', async () => {
            const parseTool = BootstrapTools.parse_dygram;
            const generateTool = BootstrapTools.generate_json;
            const context = executor.getContext();

            const simpleCode = `
                machine "Test" @Version("1.0")
                Input start { value<string>: "test"; }
                Result end { output<string>: ""; }
                start -> end;
            `;

            const parseResult = await parseTool.implementation(
                { code: simpleCode, filepath: 'test.dygram' },
                context
            );

            expect(parseResult.machine).toBeTruthy();

            const generateResult = await generateTool.implementation(
                { machine: parseResult.machine },
                context
            );

            expect(generateResult).toHaveProperty('json');
            expect(generateResult.json).toBeTruthy();
            expect(() => JSON.parse(generateResult.json)).not.toThrow();
        });

        it('should successfully invoke generate_graphviz tool', async () => {
            const parseTool = BootstrapTools.parse_dygram;
            const generateTool = BootstrapTools.generate_graphviz;
            const context = executor.getContext();

            const simpleCode = `
                machine "Test" @Version("1.0")
                Input start { value<string>: "test"; }
                Result end { output<string>: ""; }
                start -> end;
            `;

            const parseResult = await parseTool.implementation(
                { code: simpleCode, filepath: 'test.dygram' },
                context
            );

            expect(parseResult.machine).toBeTruthy();

            const generateResult = await generateTool.implementation(
                { machine: parseResult.machine },
                context
            );

            expect(generateResult).toHaveProperty('dot');
            expect(generateResult.dot).toContain('digraph');
            expect(generateResult.dot).toContain('start');
            expect(generateResult.dot).toContain('end');
        });
    });

    describe('Architecture Validation', () => {
        it('should have all three layers implemented', () => {
            // Layer 1: Bootstrap Core
            const bootstrapTools = BootstrapTools.getCoreTools();
            expect(bootstrapTools.length).toBeGreaterThan(0);

            // Layer 2: Machine files exist
            const parserPath = resolve(__dirname, '../../examples/self-hosting/parser-machine.dygram');
            const generatorPath = resolve(__dirname, '../../examples/self-hosting/generator-machine.dygram');
            const runtimePath = resolve(__dirname, '../../examples/self-hosting/runtime-machine.dygram');

            expect(() => readFileSync(parserPath, 'utf-8')).not.toThrow();
            expect(() => readFileSync(generatorPath, 'utf-8')).not.toThrow();
            expect(() => readFileSync(runtimePath, 'utf-8')).not.toThrow();

            // Layer 3: Meta-system exists
            const metaPath = resolve(__dirname, '../../examples/self-hosting/meta-system-machine.dygram');
            expect(() => readFileSync(metaPath, 'utf-8')).not.toThrow();
        });

        it('should demonstrate meta-circular evaluation capability', () => {
            const workflowPath = resolve(__dirname, '../../examples/self-hosting/complete-workflow.dygram');
            const content = readFileSync(workflowPath, 'utf-8');

            // Complete workflow demonstrates full self-hosting
            expect(content).toContain('parseSource');
            expect(content).toContain('generateOutputs');
            expect(content).toContain('executeMachine');
            expect(content).toContain('improveSystem');
        });
    });
});
