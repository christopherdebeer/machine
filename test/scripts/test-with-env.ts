#!/usr/bin/env node

/**
 * Test script to validate ANTHROPIC_API_KEY environment variable support
 * Usage: ANTHROPIC_API_KEY=your-key npm run test:env
 */

import { describe, it, expect } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import type { Machine } from '../../src/language/generated/ast.js';
import { MachineExecutor } from '../../src/language/machine-executor.js';
import type {
    MachineJson,
    MachineJsonAttribute,
    MachineJsonEdge,
    MachineJsonNode
} from '../../src/language/types/machine-json.js';

const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

/**
 * Helper function to convert parsed Machine AST to MachineData format
 */
function convertToMachineData(machine: Machine): MachineJson {
    const nodes: MachineJsonNode[] = [];
    const edges: MachineJsonEdge[] = [];

    machine.nodes?.forEach(node => {
        const attributes: MachineJsonAttribute[] = [];

        if (node.attributes && node.attributes.length > 0) {
            node.attributes.forEach(attr => {
                const attribute: MachineJsonAttribute = {
                    name: String(attr.name || ''),
                    type: attr.type ? String(attr.type) : undefined,
                    value: ''
                };

                if (attr.value) {
                    if (typeof attr.value === 'string') {
                        attribute.value = attr.value;
                    } else if (attr.value.value !== undefined) {
                        attribute.value = String(attr.value.value);
                    } else {
                        attribute.value = String(attr.value);
                    }
                }

                attributes.push(attribute);
            });
        }

        nodes.push({
            name: String(node.name || ''),
            type: node.type ? String(node.type) : undefined,
            title: node.title ? String(node.title) : undefined,
            parent: node.$container && node.$container.$type === 'Node' && typeof (node.$container as { name?: string }).name === 'string'
                ? String((node.$container as { name?: string }).name)
                : undefined,
            attributes
        });
    });

    machine.edges?.forEach(edge => {
        edge.segments?.forEach(segment => {
            edge.source?.forEach(sourceRef => {
                segment.target?.forEach(targetRef => {
                    const edgeData: MachineJsonEdge = {
                        source: String(sourceRef.ref?.name || ''),
                        target: String(targetRef.ref?.name || '')
                    };

                    if (segment.label && segment.label.length > 0) {
                        const labelParts: string[] = [];
                        segment.label.forEach(edgeType => {
                            edgeType.value?.forEach(attr => {
                                if (attr.text) {
                                    labelParts.push(String(attr.text));
                                } else if (attr.name) {
                                    labelParts.push(String(attr.name));
                                }
                            });
                        });
                        if (labelParts.length > 0) {
                            edgeData.label = labelParts.join(' ');
                        }
                    }

                    if (segment.endType) {
                        edgeData.type = String(segment.endType);
                    }

                    edges.push(edgeData);
                });
            });
        });
    });

    const machineJson: MachineJson = {
        title: String(machine.title || 'Untitled Machine'),
        nodes,
        edges
    };

    return machineJson;
}

describe('Environment Variable Integration Tests', () => {
    it('should read ANTHROPIC_API_KEY from environment', () => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            console.warn('⚠️  ANTHROPIC_API_KEY not set - skipping environment variable test');
            console.warn('   Run with: ANTHROPIC_API_KEY=your-key npm run test:env');
            return;
        }

        expect(apiKey).toBeDefined();
        expect(typeof apiKey).toBe('string');
        expect(apiKey.length).toBeGreaterThan(0);
        
        console.log('✅ ANTHROPIC_API_KEY found:', apiKey.substring(0, 10) + '...');
    });

    it('should create LLM config with environment API key', async () => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            console.warn('⚠️  Skipping LLM config test - no API key');
            return;
        }

        const source = `machine "Environment Test"
            Task analyze {
                prompt: "Test with environment API key";
            }
            Result output {
                status: "complete";
            }
            analyze -> output;`;

        const document = await parse(source);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const machineData = convertToMachineData(machine);

        // Create LLM config using environment variable
        const llmConfig = {
            llm: {
                provider: 'anthropic' as const,
                apiKey: apiKey,
                modelId: 'claude-3-5-sonnet-20241022'
            }
        };

        expect(llmConfig.llm.apiKey).toBe(apiKey);

        // Test executor creation
        const executor = new MachineExecutor(machineData, llmConfig);
        expect(executor).toBeDefined();

        // Test context serialization (should not have circular references)
        const context = executor.getContext();
        expect(() => JSON.stringify(context)).not.toThrow();

        console.log('✅ LLM config created successfully with environment API key');
    });

    it('should execute task node with real API key (if provided)', async () => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            console.warn('⚠️  Skipping execution test - no API key');
            return;
        }

        const source = `machine "Real Execution Test"
            Task greet {
                prompt: "Say hello and explain what you do in one sentence.";
            }
            Result done {
                status: "complete";
            }
            greet -> done;`;

        const document = await parse(source);
        const machine = document.parseResult.value as Machine;
        const machineData = convertToMachineData(machine);

        const llmConfig = {
            llm: {
                provider: 'anthropic' as const,
                apiKey: apiKey,
                modelId: 'claude-3-5-sonnet-20241022'
            }
        };

        console.log('🚀 Creating executor with real API key...');
        const executor = await MachineExecutor.create(machineData, llmConfig);
        
        console.log('🔄 Executing one step...');
        const stepped = await executor.step();
        expect(stepped).toBe(true);

        const context = executor.getContext();
        expect(context.history).toHaveLength(1);
        expect(context.history[0].output).toBeDefined();
        expect(typeof context.history[0].output).toBe('string');
        expect(context.history[0].output!.length).toBeGreaterThan(0);

        console.log('✅ Real execution completed successfully');
        console.log('📝 LLM Output:', context.history[0].output?.substring(0, 100) + '...');

        // Test that deprecated runtime diagram method throws
        expect(() => executor.toMermaidRuntime()).toThrow('Mermaid support has been removed');

        console.log('✅ Verified Mermaid methods throw deprecation error');
    }, 30000); // 30 second timeout for real API calls
});

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🧪 Running environment variable integration tests...');
    console.log('📋 Environment check:');
    console.log('   - ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set');
    console.log('   - NODE_ENV:', process.env.NODE_ENV || 'undefined');
    console.log('');
}
