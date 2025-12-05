/**
 * Standard Annotation Configurations
 *
 * Defines configs for all built-in DyGram annotations using the
 * unified annotation processor pattern.
 */

import type { AnnotationConfig } from './unified-annotation-processor.js';
import { UnifiedAnnotationProcessor } from './unified-annotation-processor.js';
import type { BarrierConfig, AsyncConfig, MapConfig } from './runtime-types.js';

/**
 * Helper to convert qualified name to barrier/group ID
 * E.g., "Context.items" -> "Context_items"
 */
function qualifiedNameToId(qualifiedName: string): string {
    return qualifiedName.replace(/\./g, '_');
}

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

        // Qualified name form: @barrier(Context.results)
        // Infer group ID from the qualified name
        if (match.qualifiedValue) {
            return {
                id: qualifiedNameToId(match.qualifiedValue),
                merge: baseMerge,
                sourceRef: match.qualifiedValue
            };
        }

        // String value form: @barrier("mygroup")
        if (match.value) {
            return {
                id: match.value.replace(/['"]/g, ''),
                merge: baseMerge
            };
        }

        // Simple form: @barrier
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

/**
 * Map configuration
 * Enables data-driven fan-out: spawn one path per item in a collection
 * Aliases: @foreach, @each
 */
export const MapAnnotationConfig: AnnotationConfig<MapConfig> = {
    names: ['map', 'foreach', 'each'],
    defaultValue: { source: '' },

    parse: (match) => {
        // Attribute form: @map(items: Context.items; group: myGroup)
        if (match.attributes) {
            const source = UnifiedAnnotationProcessor.parseString(
                match.attributes.items || match.attributes.source,
                ''
            );
            const group = match.attributes.group
                ? UnifiedAnnotationProcessor.parseString(match.attributes.group, undefined)
                : undefined;

            return {
                source,
                group: group || (source ? qualifiedNameToId(source) : undefined)
            };
        }

        // Qualified name form: @map(Context.items)
        if (match.qualifiedValue) {
            return {
                source: match.qualifiedValue,
                group: qualifiedNameToId(match.qualifiedValue)
            };
        }

        // String value form: @map("Context.items") - treat as source reference
        if (match.value) {
            const source = match.value.replace(/['"]/g, '');
            return {
                source,
                group: qualifiedNameToId(source)
            };
        }

        // Simple form: @map - invalid, source is required
        return { source: '' };
    },

    validate: (config) => {
        const errors: string[] = [];
        if (!config.source || config.source.trim() === '') {
            errors.push('Map annotation requires a source collection (e.g., @map(Context.items))');
        }
        return errors;
    }
};
