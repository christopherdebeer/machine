/**
 * Bootstrap Tools - Layer 1: Core Tool Definitions
 *
 * These are the essential tools that form the bridge between
 * the minimal bootstrap executor and existing TypeScript implementations.
 *
 * Each tool wraps existing functionality and makes it available
 * to Layer 2 (Dygram-in-Dygram) machines.
 */

import { BootstrapTool, BootstrapContext } from './bootstrap-executor.js';
import { MachineData } from './base-executor.js';
import { createMachineServices } from './machine-module.js';
import { extractAstNode } from '../cli/cli-util.js';
import { NodeFileSystem } from 'langium/node';
import { Machine } from './generated/ast.js';
import { GraphValidator } from './graph-validator.js';
import { generateJSON, generateGraphviz } from './generator/generator.js';
import { RailsExecutor, MachineExecutorConfig } from './rails-executor.js';

/**
 * Core bootstrap tools registry
 */
export class BootstrapTools {
    /**
     * parse_dygram: Parse Dygram source code to AST
     *
     * Input: { code: string, filepath?: string }
     * Output: { machine: Machine, errors: string[] }
     */
    static parse_dygram: BootstrapTool = {
        name: 'parse_dygram',
        description: 'Parse Dygram source code to AST',
        implementation: async (input: { code: string; filepath?: string }, context: BootstrapContext) => {
            try {
                const services = createMachineServices(NodeFileSystem).Machine;

                // Parse the code using Langium's document builder
                const filePath = input.filepath || '<memory>';
                const machine = await extractAstNode<Machine>(filePath, services);

                return {
                    machine,
                    errors: []
                };
            } catch (error) {
                return {
                    machine: null,
                    errors: [error instanceof Error ? error.message : String(error)]
                };
            }
        }
    };

    /**
     * validate_machine: Validate machine structure, types, and detect cycles
     *
     * Input: { machine: Machine }
     * Output: { valid: boolean, errors: string[], warnings: string[] }
     */
    static validate_machine: BootstrapTool = {
        name: 'validate_machine',
        description: 'Validate machine structure, types, and detect cycles',
        implementation: async (input: { machine: Machine }, context: BootstrapContext) => {
            try {
                const validator = new GraphValidator(input.machine);
                const result = validator.validate();

                const errors: string[] = [];
                const warnings: string[] = [];

                // Collect validation issues
                if (result.unreachableNodes && result.unreachableNodes.length > 0) {
                    warnings.push(`Unreachable nodes: ${result.unreachableNodes.join(', ')}`);
                }

                if (result.orphanedNodes && result.orphanedNodes.length > 0) {
                    warnings.push(`Orphaned nodes: ${result.orphanedNodes.join(', ')}`);
                }

                if (result.cycles && result.cycles.length > 0) {
                    warnings.push(`Detected ${result.cycles.length} cycle(s)`);
                }

                if (result.missingEntryPoints) {
                    errors.push('No entry points found');
                }

                return {
                    valid: result.valid,
                    errors,
                    warnings: result.warnings || warnings
                };
            } catch (error) {
                return {
                    valid: false,
                    errors: [error instanceof Error ? error.message : String(error)],
                    warnings: []
                };
            }
        }
    };

    /**
     * generate_json: Generate JSON representation of machine
     *
     * Input: { machine: Machine, destination?: string }
     * Output: { json: string, filepath?: string }
     */
    static generate_json: BootstrapTool = {
        name: 'generate_json',
        description: 'Generate JSON representation of machine',
        implementation: async (input: { machine: Machine; destination?: string }, context: BootstrapContext) => {
            try {
                const result = generateJSON(input.machine, '', input.destination);
                return {
                    json: result.content,
                    filepath: result.filePath
                };
            } catch (error) {
                throw new Error(`generate_json failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };

    /**
     * generate_graphviz: Generate Graphviz DOT visualization
     *
     * Input: { machine: Machine, destination?: string }
     * Output: { dot: string, filepath?: string }
     */
    static generate_graphviz: BootstrapTool = {
        name: 'generate_graphviz',
        description: 'Generate Graphviz DOT visualization',
        implementation: async (input: { machine: Machine; destination?: string }, context: BootstrapContext) => {
            try {
                const result = generateGraphviz(input.machine, '', input.destination);
                return {
                    dot: result.content,
                    filepath: result.filePath
                };
            } catch (error) {
                throw new Error(`generate_graphviz failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };

    /**
     * execute_machine: Execute a machine using rails pattern
     *
     * Input: { machineData: MachineData, config?: MachineExecutorConfig }
     * Output: { result: any, history: any[] }
     */
    static execute_machine: BootstrapTool = {
        name: 'execute_machine',
        description: 'Execute a machine using rails pattern',
        implementation: async (input: { machineData: MachineData; config?: MachineExecutorConfig }, context: BootstrapContext) => {
            try {
                const executor = new RailsExecutor(input.machineData, input.config || {});
                const result = await executor.execute();
                return {
                    result: {
                        currentNode: result.currentNode,
                        errorCount: result.errorCount,
                        visitedNodes: Array.from(result.visitedNodes),
                        attributes: Object.fromEntries(result.attributes)
                    },
                    history: result.history || []
                };
            } catch (error) {
                throw new Error(`execute_machine failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };

    /**
     * construct_tool: Dynamically construct a new tool
     *
     * Input: { name: string, description: string, input_schema: any, implementation_strategy: string, implementation_details: string }
     * Output: { success: boolean, message: string, tool_name?: string }
     */
    static construct_tool: BootstrapTool = {
        name: 'construct_tool',
        description: 'Dynamically construct a new tool',
        implementation: async (input: any, context: BootstrapContext) => {
            // Meta-tools require MetaToolManager instance
            // Check if MetaToolManager is available in context
            const metaToolManager = (context as any).metaToolManager;
            if (!metaToolManager) {
                throw new Error('construct_tool requires MetaToolManager instance - must be provided in context');
            }

            try {
                const result = await metaToolManager.constructTool({
                    name: input.name,
                    description: input.description,
                    input_schema: input.input_schema,
                    implementation_strategy: input.implementation_strategy || 'agent_backed',
                    implementation_details: input.implementation_details
                });

                return result;
            } catch (error) {
                return {
                    success: false,
                    message: error instanceof Error ? error.message : String(error)
                };
            }
        }
    };

    /**
     * get_machine_definition: Get current machine definition
     *
     * Input: { format?: 'json' | 'dsl' | 'both' }
     * Output: { json?: object, dsl?: string, format: string }
     */
    static get_machine_definition: BootstrapTool = {
        name: 'get_machine_definition',
        description: 'Get current machine definition',
        implementation: async (input: { format?: 'json' | 'dsl' | 'both' }, context: BootstrapContext) => {
            // Meta-tools require MetaToolManager instance
            const metaToolManager = (context as any).metaToolManager;
            if (!metaToolManager) {
                throw new Error('get_machine_definition requires MetaToolManager instance - must be provided in context');
            }

            try {
                const result = await metaToolManager.getMachineDefinition(input);
                return result;
            } catch (error) {
                throw new Error(`get_machine_definition failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };

    /**
     * update_definition: Update machine definition
     *
     * Input: { machine: MachineData, reason: string }
     * Output: { success: boolean, message: string, dsl?: string }
     */
    static update_definition: BootstrapTool = {
        name: 'update_definition',
        description: 'Update machine definition',
        implementation: async (input: { machine: MachineData; reason: string }, context: BootstrapContext) => {
            // Meta-tools require MetaToolManager instance
            const metaToolManager = (context as any).metaToolManager;
            if (!metaToolManager) {
                throw new Error('update_definition requires MetaToolManager instance - must be provided in context');
            }

            try {
                const result = await metaToolManager.updateDefinition(input);
                return result;
            } catch (error) {
                return {
                    success: false,
                    message: error instanceof Error ? error.message : String(error)
                };
            }
        }
    };

    /**
     * Get all core bootstrap tools
     */
    static getAllTools(): BootstrapTool[] {
        return [
            BootstrapTools.parse_dygram,
            BootstrapTools.validate_machine,
            BootstrapTools.generate_json,
            BootstrapTools.generate_graphviz,
            BootstrapTools.execute_machine,
            BootstrapTools.construct_tool,
            BootstrapTools.get_machine_definition,
            BootstrapTools.update_definition
        ];
    }

    /**
     * Get core tools (excluding meta-tools)
     */
    static getCoreTools(): BootstrapTool[] {
        return [
            BootstrapTools.parse_dygram,
            BootstrapTools.validate_machine,
            BootstrapTools.generate_json,
            BootstrapTools.generate_graphviz,
            BootstrapTools.execute_machine
        ];
    }

    /**
     * Get meta-tools only
     */
    static getMetaTools(): BootstrapTool[] {
        return [
            BootstrapTools.construct_tool,
            BootstrapTools.get_machine_definition,
            BootstrapTools.update_definition
        ];
    }
}

/**
 * Tool contracts documentation
 */
export const TOOL_CONTRACTS = {
    parse_dygram: {
        input: {
            code: 'string - Dygram source code to parse',
            filepath: 'string? - Optional file path for error reporting'
        },
        output: {
            ast: 'MachineData - Parsed machine structure',
            errors: 'string[] - Parse errors if any'
        },
        implementation: 'src/language/main.ts:parseDocument'
    },

    validate_machine: {
        input: {
            machine: 'MachineData - Machine to validate'
        },
        output: {
            valid: 'boolean - Whether machine is valid',
            errors: 'string[] - Validation errors'
        },
        implementation: 'src/language/graph-validator.ts:GraphValidator.validate'
    },

    generate_json: {
        input: {
            machine: 'MachineData - Machine to serialize',
            destination: 'string? - Optional output file path'
        },
        output: {
            json: 'string - JSON representation',
            filepath: 'string? - Written file path if destination provided'
        },
        implementation: 'src/language/generator/generator.ts:generateJSON'
    },

    generate_graphviz: {
        input: {
            machine: 'MachineData - Machine to visualize',
            destination: 'string? - Optional output file path'
        },
        output: {
            dot: 'string - Graphviz DOT format',
            filepath: 'string? - Written file path if destination provided'
        },
        implementation: 'src/language/diagram/graphviz-generator.ts:generateGraphviz'
    },

    execute_machine: {
        input: {
            machineData: 'MachineData - Machine to execute',
            config: 'ExecutorConfig? - Optional execution configuration'
        },
        output: {
            result: 'any - Execution result',
            history: 'any[] - Execution history'
        },
        implementation: 'src/language/rails-executor.ts:RailsExecutor.execute'
    },

    construct_tool: {
        input: {
            name: 'string - Tool name',
            description: 'string - Tool description',
            implementation_details: 'object - Implementation strategy and details'
        },
        output: {
            success: 'boolean - Whether construction succeeded',
            tool_name: 'string - Name of constructed tool'
        },
        implementation: 'src/language/meta-tool-manager.ts:MetaToolManager.constructTool'
    },

    get_machine_definition: {
        input: {
            machine_name: 'string? - Optional machine name (defaults to current)'
        },
        output: {
            definition: 'MachineData - Machine definition'
        },
        implementation: 'src/language/meta-tool-manager.ts:MetaToolManager.getMachineDefinition'
    },

    update_definition: {
        input: {
            machine_name: 'string - Machine to update',
            updates: 'object - Updates to apply'
        },
        output: {
            success: 'boolean - Whether update succeeded',
            new_version: 'string - New version identifier'
        },
        implementation: 'src/language/meta-tool-manager.ts:MetaToolManager.updateDefinition'
    }
};
