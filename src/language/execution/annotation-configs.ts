/**
 * Standard Annotation Configurations
 *
 * Defines configs for all built-in DyGram annotations using the
 * unified annotation processor pattern.
 */

import type { AnnotationConfig } from './unified-annotation-processor.js';
import { UnifiedAnnotationProcessor } from './unified-annotation-processor.js';
import type { BarrierConfig, AsyncConfig } from './runtime-types.js';

export const BarrierAnnotationConfig: AnnotationConfig<BarrierConfig> = {
    names: ['barrier', 'wait', 'sync', 'join', 'merge'],
    defaultValue: { id: 'default', merge: false },

    aliasDefaults: new Map([
        ['join', { merge: true }],
        ['merge', { merge: true }]
    ]),

    parse: (match) => {
        // Determine base merge default from alias
        const baseMerge = match.name === 'join' || match.name === 'merge';

        // Attribute form takes precedence
        if (match.attributes) {
            return {
                id: UnifiedAnnotationProcessor.parseString(
                    match.attributes.id,
                    'default'
                ),
                merge: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.merge,
                    baseMerge
                )
            };
        }

        // Value form
        if (match.value) {
            return {
                id: match.value.replace(/['"]/g, ''),
                merge: baseMerge
            };
        }

        // Simple form
        return {
            id: 'default',
            merge: baseMerge
        };
    },

    validate: (config) => {
        const errors: string[] = [];
        if (!config.id || config.id.trim() === '') {
            errors.push('Barrier id cannot be empty');
        }
        return errors;
    }
};

export const AsyncAnnotationConfig: AnnotationConfig<AsyncConfig> = {
    names: ['async', 'spawn', 'parallel', 'fork'],
    defaultValue: { enabled: true },

    parse: (match) => {
        // Attribute form
        if (match.attributes) {
            return {
                enabled: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.enabled,
                    true
                )
            };
        }

        // Value form: treat as enabled flag
        if (match.value) {
            const enabled = match.value.toLowerCase() !== 'false';
            return { enabled };
        }

        // Simple form
        return { enabled: true };
    }
};

/**
 * Meta configuration
 * Controls meta-programming behavior
 */
export interface MetaConfig {
    enabled: boolean;
}

export const MetaAnnotationConfig: AnnotationConfig<MetaConfig> = {
    names: ['meta'],
    defaultValue: { enabled: true },

    parse: (match) => {
        // Attribute form
        if (match.attributes) {
            return {
                enabled: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.enabled,
                    true
                )
            };
        }

        // Value form: treat as enabled flag
        if (match.value) {
            const enabled = match.value.toLowerCase() !== 'false';
            return { enabled };
        }

        // Simple form
        return { enabled: true };
    }
};

/**
 * StrictMode configuration
 * Controls validation strictness
 */
export interface StrictModeConfig {
    enabled: boolean;
}

export const StrictModeAnnotationConfig: AnnotationConfig<StrictModeConfig> = {
    names: ['strictmode', 'strict'],
    defaultValue: { enabled: true },

    parse: (match) => {
        // Attribute form
        if (match.attributes) {
            return {
                enabled: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.enabled,
                    true
                )
            };
        }

        // Value form: treat as enabled flag
        if (match.value) {
            const enabled = match.value.toLowerCase() !== 'false';
            return { enabled };
        }

        // Simple form
        return { enabled: true };
    }
};
