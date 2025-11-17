/**
 * Shared settings module for both Monaco and CodeMirror playgrounds
 * Consolidates localStorage management and API configuration
 */

// Storage keys
const STORAGE_KEYS = {
    MODEL: 'dygram_selected_model',
    API_KEY: 'dygram_api_key',
    PROVIDER: 'dygram_provider' // 'anthropic' or 'bedrock'
} as const;

export type Provider = 'anthropic' | 'bedrock';

export interface PlaygroundSettings {
    model: string;
    apiKey: string;
    provider: Provider;
}

/**
 * Model format mappings
 * Maps between Anthropic API format and AWS Bedrock format
 */
const ANTHROPIC_TO_BEDROCK: Record<string, string> = {
    'claude-3-5-sonnet-20241022': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'claude-3-sonnet-20240229': 'anthropic.claude-3-sonnet-20240229-v1:0',
    'claude-3-opus-20240229': 'anthropic.claude-3-opus-20240229-v1:0',
    'claude-3-haiku-20240307': 'anthropic.claude-3-haiku-20240307-v1:0',
    'claude-haiku-4-5-20251001': 'anthropic.claude-haiku-4-5-20251001-v1:0',
    'claude-sonnet-4-5-20250929': 'anthropic.claude-sonnet-4-5-20250929-v1:0'
};

const BEDROCK_TO_ANTHROPIC: Record<string, string> = Object.fromEntries(
    Object.entries(ANTHROPIC_TO_BEDROCK).map(([k, v]) => [v, k])
);

/**
 * Default models per provider
 */
const DEFAULT_MODELS: Record<Provider, string> = {
    anthropic: 'claude-3-5-sonnet-20241022',
    bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0'
};

/**
 * Check if a model ID is in Bedrock format
 */
export function isBedrockModel(modelId: string): boolean {
    return modelId.startsWith('anthropic.') && modelId.includes(':');
}

/**
 * Detect provider from model ID
 */
export function detectProvider(modelId: string): Provider {
    return isBedrockModel(modelId) ? 'bedrock' : 'anthropic';
}

/**
 * Convert model ID between formats
 */
export function convertModelId(modelId: string, targetProvider: Provider): string {
    const currentProvider = detectProvider(modelId);

    // No conversion needed if already in target format
    if (currentProvider === targetProvider) {
        return modelId;
    }

    // Convert between formats
    if (targetProvider === 'bedrock') {
        return ANTHROPIC_TO_BEDROCK[modelId] || DEFAULT_MODELS.bedrock;
    } else {
        return BEDROCK_TO_ANTHROPIC[modelId] || DEFAULT_MODELS.anthropic;
    }
}

/**
 * Get API key from environment variable or localStorage
 */
function getApiKey(): string {
    // In browser environment, we can't access process.env directly
    // But we can check if it was injected during build time
    const envApiKey = typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY;
    const localStorageApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);

    // Priority: environment variable > localStorage > empty string
    return envApiKey || localStorageApiKey || '';
}

/**
 * Load settings from localStorage with environment variable support
 * Defaults to Anthropic provider
 */
export function loadSettings(): PlaygroundSettings {
    const apiKey = getApiKey();
    const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL);
    const savedProvider = (localStorage.getItem(STORAGE_KEYS.PROVIDER) || 'anthropic') as Provider;

    // If no saved model, use default for saved provider
    let model = savedModel || DEFAULT_MODELS[savedProvider];

    // Ensure model matches provider format
    const modelProvider = detectProvider(model);
    if (modelProvider !== savedProvider) {
        model = convertModelId(model, savedProvider);
    }

    return {
        model,
        apiKey,
        provider: savedProvider
    };
}

/**
 * Save settings to localStorage
 */
export function saveSettings(model: string, apiKey: string, provider?: Provider): void {
    // Auto-detect provider from model if not explicitly provided
    const detectedProvider = provider || detectProvider(model);

    localStorage.setItem(STORAGE_KEYS.MODEL, model);
    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    localStorage.setItem(STORAGE_KEYS.PROVIDER, detectedProvider);
}

/**
 * Get model ID for a specific provider
 * Converts the current model to the target provider format
 */
export function getModelForProvider(settings: PlaygroundSettings, targetProvider: Provider): string {
    return convertModelId(settings.model, targetProvider);
}

/**
 * Extract model ID from machine definition (if specified)
 * Machine definitions can override the default model
 * Supports both Anthropic and Bedrock formats
 */
export function extractMachineModelId(machineData: any): string | undefined {
    // Check for model specification in machine attributes
    if (machineData.attributes) {
        for (const attr of machineData.attributes) {
            if (attr.name === 'modelId' || attr.name === 'model') {
                // Remove quotes if present
                return String(attr.value).replace(/^["']|["']$/g, '');
            }
        }
    }

    return undefined;
}

/**
 * Get effective model ID for execution
 * Priority: machine definition > user settings > default
 */
export function getEffectiveModelId(
    machineData: any,
    settings: PlaygroundSettings,
    preferredProvider: Provider = 'anthropic'
): string {
    // 1. Check machine definition first (highest priority)
    const machineModel = extractMachineModelId(machineData);
    if (machineModel) {
        // Convert to preferred provider format if needed
        return convertModelId(machineModel, preferredProvider);
    }

    // 2. Use user settings
    return getModelForProvider(settings, preferredProvider);
}

/**
 * Available Anthropic models for dropdown
 */
export const ANTHROPIC_MODELS = [
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
];

/**
 * Available Bedrock models for dropdown
 */
export const BEDROCK_MODELS = [
    { id: 'anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude Sonnet 4.5' },
    { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet' },
    { id: 'anthropic.claude-3-sonnet-20240229-v1:0', name: 'Claude 3 Sonnet' },
    { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude 3 Opus' },
    { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku' }
];

/**
 * Get models list for current provider
 */
export function getModelsForProvider(provider: Provider) {
    return provider === 'anthropic' ? ANTHROPIC_MODELS : BEDROCK_MODELS;
}
