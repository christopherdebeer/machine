/**
 * Executor Factory
 *
 * Creates the appropriate executor based on configuration.
 * Supports both production RailsExecutor and experimental BootstrapExecutor.
 */

import { RailsExecutor, MachineExecutorConfig, MachineData } from './rails-executor.js';
import { BootstrapExecutor, createBootstrapExecutor } from './bootstrap-executor.js';
import { BootstrapTools } from './bootstrap-tools.js';
import { generateJSON } from './generator/generator.js';

/**
 * Unified executor interface for both Rails and Bootstrap executors
 */
export interface UnifiedExecutor {
    execute(): Promise<{
        currentNode: string;
        errorCount: number;
        visitedNodes: Set<string>;
        attributes: Map<string, any>;
        history: Array<{
            from: string;
            to: string;
            transition: string;
            timestamp: string;
            output?: string;
        }>;
    }>;
    setMachineUpdateCallback?(callback: (dsl: string) => Promise<void>): void;
    getMutations?(): any[];
}

/**
 * Create an executor based on configuration
 *
 * @param machineData - The machine data to execute
 * @param config - Configuration including useBootstrap flag
 * @returns Either a RailsExecutor or BootstrapExecutor based on config
 */
export async function createExecutor(
    machineData: MachineData,
    config: MachineExecutorConfig = {}
): Promise<UnifiedExecutor> {
    if (config.useBootstrap) {
        console.log('🔬 [EXPERIMENTAL] Using Bootstrap Executor');
        console.log('   Note: Bootstrap executor is experimental and has limited functionality');
        console.log('   - No agent SDK integration');
        console.log('   - No meta-tool support');
        console.log('   - Simplified execution model');
        console.log('   To use production executor, remove --use-bootstrap flag\n');

        // Create bootstrap executor with core tools
        const executor = createBootstrapExecutor(BootstrapTools.getCoreTools());

        // Set the machine data
        const bootstrapExecutor = new BootstrapExecutor(
            machineData,
            {
                maxSteps: config.limits?.maxSteps,
                maxNodeInvocations: config.limits?.maxNodeInvocations
            }
        );

        // Register all core tools
        for (const tool of BootstrapTools.getCoreTools()) {
            bootstrapExecutor.registerTool(tool.name, tool.implementation);
        }

        return bootstrapExecutor;
    } else {
        // Use production RailsExecutor
        return await RailsExecutor.create(machineData, config);
    }
}

/**
 * Check if bootstrap executor is available and functional
 */
export function isBootstrapAvailable(): boolean {
    try {
        // Try to create a simple bootstrap executor
        const executor = new BootstrapExecutor();
        return executor.hasTool('parse_dygram') || true; // Bootstrap is available
    } catch {
        return false;
    }
}

/**
 * Get executor information
 */
export function getExecutorInfo(config: MachineExecutorConfig): {
    type: 'rails' | 'bootstrap';
    isExperimental: boolean;
    features: string[];
    limitations?: string[];
} {
    if (config.useBootstrap) {
        return {
            type: 'bootstrap',
            isExperimental: true,
            features: [
                'Minimal ~400 line core',
                'Tool-based extension',
                'Basic execution loop',
                'Core tools (parse, validate, generate, execute)'
            ],
            limitations: [
                'No agent SDK integration',
                'No meta-tool support (construct_tool, get_machine_definition, update_definition)',
                'Simplified condition evaluation',
                'No machine update callbacks',
                'No mutation tracking'
            ]
        };
    } else {
        return {
            type: 'rails',
            isExperimental: false,
            features: [
                'Full agent SDK integration',
                'Meta-tool support',
                'Advanced condition evaluation',
                'Machine self-modification',
                'Mutation tracking',
                'Rails pattern execution',
                'Tool registry',
                'AgentSDKBridge'
            ]
        };
    }
}
