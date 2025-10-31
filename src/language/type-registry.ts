/**
 * Type Registry
 * Manages type validators using Zod for semantic type checking
 */

import { z, ZodType } from 'zod';
import type { Node, Attribute } from './generated/ast.js';

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
    private nodeTypes = new Map<string, Node>();

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

        // Duration: ISO 8601 duration format OR shorthand format
        // ISO 8601: P1Y2M3DT4H5M6S
        // Shorthand: 30s, 5min, 2h, 3d, 1w, etc.
        this.register('Duration', z.string().refine(
            (val) => {
                // Check ISO 8601 format
                const iso8601Pattern = /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/;
                if (iso8601Pattern.test(val)) {
                    return true;
                }

                // Check shorthand format: number followed by unit
                // Supported units: s (seconds), m/min (minutes), h/hr (hours), d (days), w (weeks), y (years)
                const shorthandPattern = /^(\d+(?:\.\d+)?)(s|ms|m|min|h|hr|d|w|y)$/i;
                return shorthandPattern.test(val);
            },
            {
                message: 'Must be a valid ISO 8601 duration (e.g., P1Y2M3D, PT4H5M6S) or shorthand format (e.g., 30s, 5min, 2h, 3d)'
            }
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

    /**
     * Register a node as a type definition
     * This allows any node to be used as a structural type
     * @param node - The node to register as a type
     */
    public registerNodeType(node: Node): void {
        this.nodeTypes.set(node.name, node);

        // Create a Zod schema from the node's attributes
        const schema = this.nodeToZodSchema(node);
        this.register(node.name, schema);
    }

    /**
     * Check if a type name refers to a registered node type
     * @param typeName - The type name to check
     * @returns true if the type is a registered node
     */
    public isNodeType(typeName: string): boolean {
        return this.nodeTypes.has(typeName);
    }

    /**
     * Get a registered node type by name
     * @param typeName - The type name
     * @returns The node, or undefined if not registered
     */
    public getNodeType(typeName: string): Node | undefined {
        return this.nodeTypes.get(typeName);
    }

    /**
     * Convert a node's attributes to a Zod object schema
     * This enables structural validation of values against node types
     * @param node - The node to convert
     * @returns A Zod object schema
     */
    private nodeToZodSchema(node: Node): ZodType {
        const shape: Record<string, ZodType> = {};

        node.attributes.forEach(attr => {
            if (attr.type) {
                // Get the type string for this attribute
                const typeStr = this.getTypeString(attr.type);
                const typeInfo = this.parseTypeString(typeStr);

                // Get or create schema for this type
                const attrSchema = this.getOrCreateSchemaForType(typeInfo);

                // Handle optional types
                shape[attr.name] = typeInfo.isOptional
                    ? attrSchema.optional()
                    : attrSchema;
            } else {
                // No type annotation, accept any value
                shape[attr.name] = z.any();
            }
        });

        return z.object(shape);
    }

    /**
     * Parse a type string into components
     * Simple parser for basic type syntax
     */
    private parseTypeString(typeStr: string): { baseType: string; genericParams?: string[]; isOptional?: boolean } {
        typeStr = typeStr.trim();

        const isOptional = typeStr.endsWith('?');
        if (isOptional) {
            typeStr = typeStr.slice(0, -1).trim();
        }

        const genericMatch = typeStr.match(/^([^<]+)<(.+)>$/);
        if (genericMatch) {
            const baseType = genericMatch[1].trim();
            const paramsStr = genericMatch[2];
            const genericParams = this.parseGenericParams(paramsStr);
            return { baseType, genericParams, isOptional };
        }

        return { baseType: typeStr, isOptional };
    }

    /**
     * Parse generic parameters (simple comma-split for now)
     */
    private parseGenericParams(paramsStr: string): string[] {
        const params: string[] = [];
        let current = '';
        let depth = 0;

        for (const char of paramsStr) {
            if (char === '<') {
                depth++;
                current += char;
            } else if (char === '>') {
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                params.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            params.push(current.trim());
        }

        return params;
    }

    /**
     * Get type string from TypeDef AST node
     * This is a simplified version - full implementation would be in TypeChecker
     */
    private getTypeString(typeDef: any): string {
        // Simple extraction - this would ideally use typeDefToString from TypeChecker
        // but we can't import it here to avoid circular dependencies
        if (typeof typeDef === 'string') {
            return typeDef;
        }

        if (typeDef.base) {
            let result = typeDef.base;
            if (typeDef.generics && typeDef.generics.length > 0) {
                const generics = typeDef.generics.map((g: any) => this.getTypeString(g));
                result += '<' + generics.join(', ') + '>';
            }
            if (typeDef.optional) {
                result += '?';
            }
            return result;
        }

        return 'any';
    }

    /**
     * Get or create a Zod schema for a given type
     */
    private getOrCreateSchemaForType(typeInfo: { baseType: string; genericParams?: string[]; isOptional?: boolean }): ZodType {
        // Check if it's a registered type
        const existingSchema = this.schemas.get(typeInfo.baseType);
        if (existingSchema) {
            return existingSchema;
        }

        // Handle generic types
        if (typeInfo.genericParams && typeInfo.genericParams.length > 0) {
            if (typeInfo.baseType === 'Array' || typeInfo.baseType === 'List') {
                return this.createArraySchema(typeInfo.genericParams[0]);
            } else if (typeInfo.baseType === 'Map' || typeInfo.baseType === 'Record') {
                return this.createMapSchema(typeInfo.genericParams[0], typeInfo.genericParams[1] || 'any');
            }
        }

        // Default to any for unknown types
        return z.any();
    }
}

/**
 * Create a default TypeRegistry instance
 */
export function createTypeRegistry(): TypeRegistry {
    return new TypeRegistry();
}
