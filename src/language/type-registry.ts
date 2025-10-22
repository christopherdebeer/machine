/**
 * Type Registry
 * Manages type validators using Zod for semantic type checking
 */

import { z, ZodType } from 'zod';

export interface ValidationResult {
    valid: boolean;
    data?: any;
    message?: string;
    path?: (string | number)[];
    code?: string;
}

/**
 * Registry for managing type validators
 * Provides built-in validators for common types and allows custom type registration
 */
export class TypeRegistry {
    private schemas = new Map<string, ZodType>();

    constructor() {
        this.registerBuiltInTypes();
    }

    /**
     * Register all built-in type validators
     */
    private registerBuiltInTypes(): void {
        // Primitive types
        this.register('string', z.string());
        this.register('number', z.number());
        this.register('boolean', z.boolean());

        // Specialized string types with semantic validation
        this.register('Date', z.string().datetime({ message: 'Must be a valid ISO 8601 date string' }));
        this.register('UUID', z.string().uuid({ message: 'Must be a valid UUID string' }));
        this.register('URL', z.string().url({ message: 'Must be a valid URL' }));

        // Duration: ISO 8601 duration format (e.g., P1Y2M3DT4H5M6S)
        this.register('Duration', z.string().regex(
            /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/,
            { message: 'Must be a valid ISO 8601 duration (e.g., P1Y2M3D, PT4H5M6S)' }
        ));

        // Numeric subtypes
        this.register('Integer', z.number().int({ message: 'Must be an integer' }));
        this.register('Float', z.number());

        // Generic types - these are handled specially in TypeChecker
        // We register them here for completeness, but they accept any value
        // since the actual validation happens with parameterized schemas
        this.register('Array', z.any());
        this.register('List', z.any());
        this.register('Map', z.any());
        this.register('Promise', z.any());
        this.register('Result', z.any());

        // Any type - accepts everything
        this.register('any', z.any());
    }

    /**
     * Register a custom type validator
     * @param name - The type name (e.g., "Email", "SemVer")
     * @param schema - The Zod schema for validation
     */
    public register(name: string, schema: ZodType): void {
        this.schemas.set(name, schema);
    }

    /**
     * Check if a type is registered
     * @param typeName - The type name to check
     * @returns true if the type has a registered validator
     */
    public has(typeName: string): boolean {
        return this.schemas.has(typeName);
    }

    /**
     * Get the Zod schema for a type
     * @param typeName - The type name
     * @returns The Zod schema, or undefined if not registered
     */
    public getSchema(typeName: string): ZodType | undefined {
        return this.schemas.get(typeName);
    }

    /**
     * Validate a value against a registered type
     * @param typeName - The type name (e.g., "Date", "UUID")
     * @param value - The value to validate
     * @returns Validation result with success status and error details
     */
    public validate(typeName: string, value: any): ValidationResult {
        const schema = this.schemas.get(typeName);

        // If type not registered, skip validation (assume it's a custom type)
        if (!schema) {
            return { valid: true };
        }

        const result = schema.safeParse(value);

        if (result.success) {
            return { valid: true, data: result.data };
        }

        // Get first error from Zod v3 issues array
        const firstError = result.error.issues[0];

        if (!firstError) {
            return {
                valid: false,
                message: `Validation failed for type ${typeName}`
            };
        }

        return {
            valid: false,
            message: firstError.message,
            path: firstError.path,
            code: firstError.code
        };
    }

    /**
     * Create a schema for Array<T> with element type validation
     * @param elementType - The element type name
     * @returns A Zod array schema with element validation
     */
    public createArraySchema(elementType: string): ZodType {
        const elementSchema = this.schemas.get(elementType);

        if (!elementSchema) {
            // If element type is unknown, accept any array
            return z.array(z.any());
        }

        return z.array(elementSchema);
    }

    /**
     * Create a schema for Map<K, V> / Record<K, V>
     * @param keyType - The key type name
     * @param valueType - The value type name
     * @returns A Zod record schema
     */
    public createMapSchema(keyType: string, valueType: string): ZodType {
        const valueSchema = this.schemas.get(valueType) || z.any();

        // Zod records always have string keys
        return z.record(valueSchema);
    }

    /**
     * Validate a value against a parameterized generic type (e.g., Array<Date>)
     * @param baseType - The base type (e.g., "Array")
     * @param genericParams - The generic parameters (e.g., ["Date"])
     * @param value - The value to validate
     * @returns Validation result
     */
    public validateGenericType(
        baseType: string,
        genericParams: string[],
        value: any
    ): ValidationResult {
        // Handle Array<T> and List<T>
        if ((baseType === 'Array' || baseType === 'List') && genericParams.length === 1) {
            const arraySchema = this.createArraySchema(genericParams[0]);
            const result = arraySchema.safeParse(value);

            if (result.success) {
                return { valid: true, data: result.data };
            }

            // Get first error from Zod v3 issues array
            const firstError = result.error.issues[0];

            if (!firstError) {
                return {
                    valid: false,
                    message: `Validation failed for ${baseType}<${genericParams[0]}>`
                };
            }

            return {
                valid: false,
                message: firstError.message,
                path: firstError.path,
                code: firstError.code
            };
        }

        // Handle Map<K, V> and Record<K, V>
        if ((baseType === 'Map' || baseType === 'Record') && genericParams.length === 2) {
            const mapSchema = this.createMapSchema(genericParams[0], genericParams[1]);
            const result = mapSchema.safeParse(value);

            if (result.success) {
                return { valid: true, data: result.data };
            }

            // Get first error from Zod v3 issues array
            const firstError = result.error.issues[0];

            if (!firstError) {
                return {
                    valid: false,
                    message: `Validation failed for ${baseType}<${genericParams.join(', ')}>`
                };
            }

            return {
                valid: false,
                message: firstError.message,
                path: firstError.path,
                code: firstError.code
            };
        }

        // For other generic types (Promise, Result, etc.), skip runtime validation
        // These are structural types that can't be meaningfully validated at this stage
        return { valid: true };
    }

    /**
     * Get all registered type names
     * @returns Array of registered type names
     */
    public getRegisteredTypes(): string[] {
        return Array.from(this.schemas.keys());
    }
}

/**
 * Create a default TypeRegistry instance
 */
export function createTypeRegistry(): TypeRegistry {
    return new TypeRegistry();
}
