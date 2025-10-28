/**
 * Bootstrap Tools - Layer 1: Core Tool Definitions
 *
 * These are the essential tools that form the bridge between
 * the minimal bootstrap executor and existing TypeScript implementations.
 *
 * Each tool wraps existing functionality and makes it available
 * to Layer 2 (Dygram-in-Dygram) machines.
 */

import { BootstrapToolFunction, BootstrapTool, BootstrapContext } from './bootstrap-executor.js';
import { MachineData } from './base-executor.js';

/**
 * Core bootstrap tools registry
 */
export class BootstrapTools {
    /**
     * parse_dygram: Parse Dygram source code to AST
     *
     * Input: { code: string, filepath?: string }
     * Output: { ast: MachineData, errors: string[] }
     */
    static parse_dygram: BootstrapTool = {
        name: 'parse_dygram',
        description: 'Parse Dygram source code to AST',
        implementation: async (input: { code: string; filepath?: string }, context: BootstrapContext) => {
            // This would call the actual parser from main.ts
            // For now, this is a placeholder that shows the interface
            throw new Error('parse_dygram requires integration with src/language/main.ts:parseDocument');
        }
    };

    /**
     * validate_machine: Validate machine structure, types, and detect cycles
     *
     * Input: { machine: MachineData }
     * Output: { valid: boolean, errors: string[] }
     */
    static validate_machine: BootstrapTool = {
        name: 'validate_machine',
        description: 'Validate machine structure, types, and detect cycles',
        implementation: async (input: { machine: MachineData }, context: BootstrapContext) => {
            // This would call graph-validator.ts
            throw new Error('validate_machine requires integration with src/language/graph-validator.ts');
        }
    };

    /**
     * generate_json: Generate JSON representation of machine
     *
     * Input: { machine: MachineData, destination?: string }
     * Output: { json: string, filepath?: string }
     */
    static generate_json: BootstrapTool = {
        name: 'generate_json',
        description: 'Generate JSON representation of machine',
        implementation: async (input: { machine: MachineData; destination?: string }, context: BootstrapContext) => {
            // This would call generator/generator.ts:generateJSON
            throw new Error('generate_json requires integration with src/language/generator/generator.ts');
        }
    };

    /**
     * generate_graphviz: Generate Graphviz DOT visualization
     *
     * Input: { machine: MachineData, destination?: string }
     * Output: { dot: string, filepath?: string }
     */
    static generate_graphviz: BootstrapTool = {
        name: 'generate_graphviz',
        description: 'Generate Graphviz DOT visualization',
        implementation: async (input: { machine: MachineData; destination?: string }, context: BootstrapContext) => {
            // This would call diagram/graphviz-generator.ts
            throw new Error('generate_graphviz requires integration with src/language/diagram/graphviz-generator.ts');
        }
    };

    /**
     * execute_machine: Execute a machine using rails pattern
     *
     * Input: { machineData: MachineData, config?: any }
     * Output: { result: any, history: any[] }
     */
    static execute_machine: BootstrapTool = {
        name: 'execute_machine',
        description: 'Execute a machine using rails pattern',
        implementation: async (input: { machineData: MachineData; config?: any }, context: BootstrapContext) => {
            // This would call rails-executor.ts:RailsExecutor
            throw new Error('execute_machine requires integration with src/language/rails-executor.ts');
        }
    };

    /**
     * construct_tool: Dynamically construct a new tool
     *
     * Input: { name: string, description: string, implementation_details: any }
     * Output: { success: boolean, tool_name: string }
     */
    static construct_tool: BootstrapTool = {
        name: 'construct_tool',
        description: 'Dynamically construct a new tool',
        implementation: async (input: any, context: BootstrapContext) => {
            // This would call meta-tool-manager.ts:constructTool
            throw new Error('construct_tool requires integration with src/language/meta-tool-manager.ts');
        }
    };

    /**
     * get_machine_definition: Get current machine definition
     *
     * Input: { machine_name?: string }
     * Output: { definition: MachineData }
     */
    static get_machine_definition: BootstrapTool = {
        name: 'get_machine_definition',
        description: 'Get current machine definition',
        implementation: async (input: { machine_name?: string }, context: BootstrapContext) => {
            // This would call meta-tool-manager.ts:getMachineDefinition
            throw new Error('get_machine_definition requires integration with src/language/meta-tool-manager.ts');
        }
    };

    /**
     * update_definition: Update machine definition
     *
     * Input: { machine_name: string, updates: any }
     * Output: { success: boolean, new_version: string }
     */
    static update_definition: BootstrapTool = {
        name: 'update_definition',
        description: 'Update machine definition',
        implementation: async (input: { machine_name: string; updates: any }, context: BootstrapContext) => {
            // This would call meta-tool-manager.ts:updateDefinition
            throw new Error('update_definition requires integration with src/language/meta-tool-manager.ts');
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
