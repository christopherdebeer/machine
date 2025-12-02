/**
 * Dynamic model fetcher for Anthropic models
 * Fetches available models from the Anthropic API with localStorage caching
 */

import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_MODELS } from './shared-settings.js'

const CACHE_KEY = 'dygram_models_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ModelInfo {
    id: string;
    name: string;
    created_at?: string;
    display_name?: string;
}

interface ModelCache {
    models: ModelInfo[];
    timestamp: number;
}

/**
 * Convert Anthropic API model to our ModelInfo format
 */
function convertApiModel(apiModel: any): ModelInfo {
    return {
        id: apiModel.id,
        name: apiModel.display_name || apiModel.id,
        created_at: apiModel.created_at,
        display_name: apiModel.display_name
    };
}

/**
 * Load models from localStorage cache
 */
function loadCachedModels(): ModelInfo[] | null {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const cache: ModelCache = JSON.parse(cached);
        const now = Date.now();

        // Check if cache is still valid
        if (now - cache.timestamp < CACHE_TTL_MS) {
            return cache.models;
        }

        // Cache expired
        return null;
    } catch (error) {
        console.warn('Failed to load models cache:', error);
        return null;
    }
}

/**
 * Save models to localStorage cache
 */
function saveCachedModels(models: ModelInfo[]): void {
    try {
        const cache: ModelCache = {
            models,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.warn('Failed to save models cache:', error);
    }
}

/**
 * Clear the models cache
 */
export function clearModelsCache(): void {
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch (error) {
        console.warn('Failed to clear models cache:', error);
    }
}

/**
 * Fetch available models from Anthropic API
 * Returns cached models if available and not expired
 * Falls back to hardcoded models on error
 */
export async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
    // Check cache first
    const cachedModels = loadCachedModels();
    if (cachedModels) {
        return cachedModels;
    }

    // If no API key, return hardcoded models
    if (!apiKey || apiKey.trim() === '') {
        return ANTHROPIC_MODELS;
    }

    try {
        // Initialize Anthropic client
        const client = new Anthropic({
            apiKey: apiKey,
            dangerouslyAllowBrowser: true // Required for browser usage
        });

        // Fetch models list
        const response = await client.models.list();

        // Convert to our format
        const models: ModelInfo[] = response.data.map(convertApiModel);

        // Filter to only Claude models and sort by creation date (newest first)
        const claudeModels = models
            .filter(m => m.id.startsWith('claude-'))
            .sort((a, b) => {
                if (a.created_at && b.created_at) {
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                }
                return 0;
            });

        // Cache the results
        saveCachedModels(claudeModels);

        return claudeModels;
    } catch (error) {
        console.warn('Failed to fetch models from API, using hardcoded list:', error);

        // Fallback to hardcoded models
        return ANTHROPIC_MODELS;
    }
}

/**
 * Get models with loading state management
 * This is useful for React components that need to show loading states
 */
export async function getModelsWithFallback(apiKey: string): Promise<{
    models: ModelInfo[];
    fromCache: boolean;
    fromApi: boolean;
}> {
    const cachedModels = loadCachedModels();

    if (cachedModels) {
        return {
            models: cachedModels,
            fromCache: true,
            fromApi: false
        };
    }

    if (!apiKey || apiKey.trim() === '') {
        return {
            models: ANTHROPIC_MODELS,
            fromCache: false,
            fromApi: false
        };
    }

    try {
        const client = new Anthropic({
            apiKey: apiKey,
            dangerouslyAllowBrowser: true
        });

        const response = await client.models.list();
        const models: ModelInfo[] = response.data
            .map(convertApiModel)
            .filter(m => m.id.startsWith('claude-'))
            .sort((a, b) => {
                if (a.created_at && b.created_at) {
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                }
                return 0;
            });

        saveCachedModels(models);

        return {
            models,
            fromCache: false,
            fromApi: true
        };
    } catch (error) {
        console.warn('Failed to fetch models from API:', error);
        return {
            models: ANTHROPIC_MODELS,
            fromCache: false,
            fromApi: false
        };
    }
}
