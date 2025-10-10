/**
 * Enhanced web-compatible version of the machine executor
 * Includes full execution system with evolution, visualization, and LLM support
 */

import { MachineExecutor, type MachineData, type MachineExecutionContext } from './machine-executor.js';
import { EvolutionaryExecutor } from './task-evolution.js';
import { VisualizingMachineExecutor } from './runtime-visualizer.js';
import { createStorage, type StorageBackend } from './storage.js';
import { createLLMClient, type LLMClientConfig } from './llm-client.js';

// Storage keys for settings
const STORAGE_KEYS = {
    MODEL: 'dygram_selected_model',
    API_KEY: 'dygram_api_key'
};

declare global {
    interface Window {
        // Basic executor
        executeMachine: (machineData: MachineData) => Promise<MachineExecutionContext>;
        MachineExecutor: typeof MachineExecutor;
        
        // Enhanced executors
        EvolutionaryExecutor: typeof EvolutionaryExecutor;
        VisualizingMachineExecutor: typeof VisualizingMachineExecutor;
        
        // Storage
        createStorage: typeof createStorage;
        
        // LLM client
        createLLMClient: typeof createLLMClient;
        
        // Helper functions
        getSettings: () => { model: string; apiKey: string };
        saveSettings: (model: string, apiKey: string) => void;
        executeWithEvolution: (machineData: MachineData) => Promise<any>;
        executeWithVisualization: (machineData: MachineData) => Promise<any>;
    }
}

/**
 * Get settings from localStorage
 */
function getSettings(): { model: string; apiKey: string } {
    return {
        model: localStorage.getItem(STORAGE_KEYS.MODEL) || 'claude-3-5-sonnet-20241022',
        apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || ''
    };
}

/**
 * Save settings to localStorage
 */
function saveSettings(model: string, apiKey: string): void {
    localStorage.setItem(STORAGE_KEYS.MODEL, model);
    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
}

/**
 * Execute machine with evolutionary executor
 */
async function executeWithEvolution(machineData: MachineData): Promise<any> {
    const settings = getSettings();
    const storage = createStorage();
    
    const config = settings.apiKey.trim() ? {
        llm: {
            provider: 'anthropic' as const,
            apiKey: settings.apiKey,
            modelId: settings.model
        }
    } : {};
    
    // Create base executor with LLM client if API key provided
    let baseExecutor: MachineExecutor;
    if (config.llm) {
        baseExecutor = await MachineExecutor.create(machineData, config);
    } else {
        baseExecutor = new MachineExecutor(machineData, config);
    }
    
    // Create evolutionary executor
    const executor = new EvolutionaryExecutor(machineData, config, storage);
    
    // Copy LLM client from base executor if available
    if (config.llm && baseExecutor) {
        (executor as any).llmClient = (baseExecutor as any).llmClient;
    }
    
    // Execute step by step
    let executionSteps = 0;
    const maxSteps = 10;
    
    while (executionSteps < maxSteps) {
        const stepped = await executor.step();
        executionSteps++;
        
        if (!stepped) {
            break;
        }
    }
    
    return {
        context: executor.getContext(),
        metrics: executor.getTaskMetrics(),
        mutations: executor.getMutations(),
        steps: executionSteps
    };
}

/**
 * Execute machine with visualization
 */
async function executeWithVisualization(machineData: MachineData): Promise<any> {
    const settings = getSettings();
    
    const config = settings.apiKey.trim() ? {
        llm: {
            provider: 'anthropic' as const,
            apiKey: settings.apiKey,
            modelId: settings.model
        }
    } : {};
    
    // Create visualizing executor
    let executor: VisualizingMachineExecutor;
    if (config.llm) {
        executor = await VisualizingMachineExecutor.create(machineData, config);
    } else {
        executor = new VisualizingMachineExecutor(machineData, config);
    }
    
    // Execute step by step
    let executionSteps = 0;
    const maxSteps = 10;
    
    while (executionSteps < maxSteps) {
        const stepped = await executor.step();
        executionSteps++;
        
        if (!stepped) {
            break;
        }
    }
    
    return {
        context: executor.getContext(),
        runtimeVisualization: executor.getRuntimeVisualization(),
        mobileVisualization: executor.getMobileRuntimeVisualization(),
        summary: executor.getRuntimeSummary(),
        steps: executionSteps
    };
}

// Basic executor (backward compatibility)
window.executeMachine = async (machineData: MachineData): Promise<MachineExecutionContext> => {
    const executor = new MachineExecutor(machineData);
    return await executor.execute();
};

// Export all classes and functions
window.MachineExecutor = MachineExecutor;
window.EvolutionaryExecutor = EvolutionaryExecutor;
window.VisualizingMachineExecutor = VisualizingMachineExecutor;
window.createStorage = createStorage;
window.createLLMClient = createLLMClient;
window.getSettings = getSettings;
window.saveSettings = saveSettings;
window.executeWithEvolution = executeWithEvolution;
window.executeWithVisualization = executeWithVisualization;

// Export for module usage
export {
    MachineExecutor,
    EvolutionaryExecutor,
    VisualizingMachineExecutor,
    createStorage,
    createLLMClient,
    getSettings,
    saveSettings,
    executeWithEvolution,
    executeWithVisualization,
    type MachineData,
    type MachineExecutionContext,
    type StorageBackend,
    type LLMClientConfig
};
