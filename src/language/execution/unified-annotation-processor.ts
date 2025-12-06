/**
 * Unified Annotation Processor
 *
 * Provides consistent annotation processing across all DyGram annotations.
 * Supports three forms:
 * - Simple: @name
 * - Value: @name("value")
 * - Attribute: @name(key1: value1; key2: value2)
 */

import type { MachineAnnotationJSON } from '../json/types.js';

/**
 * Annotation match result
 */
export interface AnnotationMatch {
    name: string;           // The actual annotation name used
    value?: string;         // Value from @name("value") form
    qualifiedValue?: string; // Qualified name from @name(Node.attr) form
    attributes?: Record<string, unknown>;  // Attributes from @name(k: v) form
}

/**
 * Annotation configuration
 */
export interface AnnotationConfig<T> {
    /** Primary name and aliases for this annotation (lowercase) */
    names: string[];

    /** Default configuration when annotation is present with no params */
    defaultValue: T;

    /** Parse annotation into typed config */
    parse: (match: AnnotationMatch) => T;

    /** Optional validation */
    validate?: (config: T, match: AnnotationMatch) => string[];

    /** Optional alias-specific defaults */
    aliasDefaults?: Map<string, Partial<T>>;
}

/**
 * Unified annotation processor
 * Handles all annotation forms consistently
 */
export class UnifiedAnnotationProcessor {
    /**
     * Process annotations to find and parse a specific annotation type
     */
    static process<T>(
        annotations: MachineAnnotationJSON[] | undefined,
        config: AnnotationConfig<T>
    ): T | null {
        if (!annotations || annotations.length === 0) {
            return null;
        }

        // Find first matching annotation by name or alias (case-insensitive)
        const annotation = annotations.find(a =>
            config.names.includes(a.name.toLowerCase())
        );

        if (!annotation) {
            return null;
        }

        // Build match object
        const match: AnnotationMatch = {
            name: annotation.name.toLowerCase(),
            value: annotation.value,
            qualifiedValue: annotation.qualifiedValue,
            attributes: annotation.attributes
        };

        // Get base default (may include alias-specific overrides)
        let baseDefault = config.defaultValue;
        if (config.aliasDefaults?.has(match.name)) {
            const aliasOverrides = config.aliasDefaults.get(match.name)!;
            baseDefault = { ...baseDefault, ...aliasOverrides } as T;
        }

        // Parse the annotation
        let result: T;
        try {
            result = config.parse(match);
        } catch (error) {
            console.warn(`Failed to parse @${annotation.name}:`, error);
            return baseDefault;
        }

        // Validate if validator provided
        if (config.validate) {
            const errors = config.validate(result, match);
            if (errors.length > 0) {
                console.warn(`Validation errors for @${annotation.name}:`, errors);
                // Return result anyway but log warnings
            }
        }

        return result;
    }

    /**
     * Helper: Parse boolean attribute value
     */
    static parseBoolean(
        value: unknown,
        defaultValue: boolean
    ): boolean {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (lower === 'true') return true;
            if (lower === 'false') return false;
        }
        return defaultValue;
    }

    /**
     * Helper: Parse string attribute value (strips quotes)
     */
    static parseString(
        value: unknown,
        defaultValue: string
    ): string {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        if (typeof value === 'string') {
            return value.replace(/^["']|["']$/g, '');
        }
        return String(value);
    }

    /**
     * Helper: Parse number attribute value
     */
    static parseNumber(
        value: unknown,
        defaultValue: number,
        min?: number,
        max?: number
    ): number {
        if (value === undefined || value === null) {
            return defaultValue;
        }

        let num: number;
        if (typeof value === 'number') {
            num = value;
        } else if (typeof value === 'string') {
            num = parseInt(value, 10);
            if (isNaN(num)) {
                return defaultValue;
            }
        } else {
            return defaultValue;
        }

        // Apply bounds
        if (min !== undefined) num = Math.max(num, min);
        if (max !== undefined) num = Math.min(num, max);

        return num;
    }
}
