/**
 * Type Checker
 * Validates type annotations, infers types, and checks compatibility
 */

import type { Machine, Node, Attribute, AttributeValue, ArrayValue, ObjectValue, PrimitiveValue, TypeDef } from './generated/ast.js';
import { isArrayValue, isObjectValue, isPrimitiveValue } from './generated/ast.js';
import {
    ValidationContext,
    ValidationSeverity,
    ValidationCategory,
    createValidationError,
    TypeErrorCodes
} from './validation-errors.js';
import { TypeRegistry } from './type-registry.js';

export interface TypeInfo {
    baseType: string;
    genericParams?: string[];
    isOptional?: boolean;
}

export interface TypeCheckResult {
    valid: boolean;
    expectedType?: string;
    actualType?: string;
    message?: string;
}

export class TypeChecker {
    private machine: Machine;
    private nodeMap: Map<string, Node>;
    private typeRegistry: TypeRegistry;
    public isStrictMode: boolean;

    constructor(machine: Machine, typeRegistry?: TypeRegistry) {
        this.machine = machine;
        this.nodeMap = this.buildNodeMap();
        this.typeRegistry = typeRegistry || new TypeRegistry();

        // Check if @StrictMode annotation is present
        this.isStrictMode = machine.annotations?.some(ann => ann.name === 'StrictMode') ?? false;


        // Register all nodes as potential types
        this.registerNodesAsTypes();
    }

    /**
     * Build a map of all nodes by name
     */
    private buildNodeMap(): Map<string, Node> {
        const map = new Map<string, Node>();

        const processNode = (node: Node) => {
            map.set(node.name, node);
            node.nodes.forEach(child => processNode(child));
        };

        this.machine.nodes.forEach(node => processNode(node));
        return map;
    }

    /**
     * Register all nodes as potential types in the type registry
     * This allows any node to be used as a type (Option B)
     */
    private registerNodesAsTypes(): void {
        this.nodeMap.forEach(node => {
            this.typeRegistry.registerNodeType(node);
        });
    }

    /**
     * Check if a type name refers to a node type
     * @param typeName - The type name to check
     * @returns true if the type is a node
     */
    public isNodeType(typeName: string): boolean {
        return this.nodeMap.has(typeName);
    }

    /**
     * Convert TypeDef AST node to string representation
     */
    private typeDefToString(typeDef: TypeDef | string | any): string {
        if (typeof typeDef === 'string') {
            return typeDef;
        }

        if (!typeDef) {
            return 'any';
        }

        // Handle UnionType (e.g., 'idle' | 'in_progress' | 'complete')
        if (typeDef.literals && typeDef.literals.length > 0) {
            const literals = typeDef.literals.map((lit: string) => {
                // Strip quotes from the string literal
                if (typeof lit === 'string') {
                    // Remove surrounding quotes if present
                    return lit.replace(/^["']|["']$/g, '');
                }
                return lit;
            });
            return literals.map(l => `'${l}'`).join(' | ');
        }

        // Handle GenericType or simple type (e.g., Array<string>, Foo, parent.child)
        if (typeDef.base) {
            let result = typeDef.base;

            if (typeDef.generics && typeDef.generics.length > 0) {
                const genericStrs = typeDef.generics.map(g => this.typeDefToString(g));
                result += '<' + genericStrs.join(', ') + '>';
            }

            if (typeDef.optional) {
                result += '?';
            }

            return result;
        }

        return 'any';
    }

    /**
     * Parse a type annotation into components
     * Examples:
     * - "string" => { baseType: "string" }
     * - "Promise<Result>" => { baseType: "Promise", genericParams: ["Result"] }
     * - "Array<string>" => { baseType: "Array", genericParams: ["string"] }
     * - "Map<string, number>" => { baseType: "Map", genericParams: ["string", "number"] }
     */
    public parseType(typeStr: string): TypeInfo {
        // Remove whitespace
        typeStr = typeStr.trim();

        // Check for optional type (ends with ?)
        const isOptional = typeStr.endsWith('?');
        if (isOptional) {
            typeStr = typeStr.slice(0, -1).trim();
        }

        // Check for generic types
        const genericMatch = typeStr.match(/^([^<]+)<(.+)>$/);
        if (genericMatch) {
            const baseType = genericMatch[1].trim();
            const paramsStr = genericMatch[2];

            // Parse generic parameters (handle nested generics)
            const genericParams = this.parseGenericParams(paramsStr);

            return {
                baseType,
                genericParams,
                isOptional
            };
        }

        return {
            baseType: typeStr,
            isOptional
        };
    }

    /**
     * Parse generic parameters, handling nested generics
     * Example: "string, Array<number>" => ["string", "Array<number>"]
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
     * Infer the type of an attribute value
     */
    public inferType(value: AttributeValue | undefined): string {
        if (!value) {
            return 'undefined';
        }

        // Handle AST node values using type guards
        if (typeof value === 'object' && value !== null) {
            // Check for ArrayValue using type guard
            if (isArrayValue(value)) {
                const arrayVal = value as ArrayValue;
                if (arrayVal.values.length === 0) {
                    throw new Error('Unable to infer type for empty array');
                }
                // Recursively infer the type of the first element
                const elementType = this.inferType(arrayVal.values[0]);
                // Check if all elements have the same type
                const allSameType = arrayVal.values.every(v => this.inferType(v) === elementType);
                if (!allSameType) {
                    // If mixed types, return Array<any>
                    return 'Array<any>';
                }
                return `Array<${elementType}>`;
            }

            // Check for ObjectValue using type guard
            if (isObjectValue(value)) {
                const objVal = value as ObjectValue;
                if (objVal.attributes.length === 0) {
                    return 'Object';
                }
                // For now, return Record<string, any>
                // Future enhancement: infer specific object shape
                return 'Record<string, any>';
            }

            // Check for PrimitiveValue using type guard
            if (isPrimitiveValue(value)) {
                const primVal = value as PrimitiveValue;
                const val = primVal.value;

                if (typeof val === 'string') {
                    // Check if the string is actually a number (Langium NUMBER terminal returns string)
                    if (/^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(val)) {
                        return 'number';
                    }
                    // Check if it's a boolean string
                    if (val === 'true' || val === 'false') {
                        return 'boolean';
                    }
                    if (val === 'null') {
                        return 'null';
                    }
                    return 'string';
                } else if (typeof val === 'number') {
                    return 'number';
                } else if (typeof val === 'boolean') {
                    return 'boolean';
                }
            }

            // Fallback: Check if value property exists and is populated
            if ('value' in value && (value as any).value !== undefined) {
                const val = (value as any).value;

                if (typeof val === 'string') {
                    // Check if the string is actually a number (Langium NUMBER terminal returns string)
                    if (/^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(val)) {
                        return 'number';
                    }
                    // Check if it's a boolean string
                    if (val === 'true' || val === 'false') {
                        return 'boolean';
                    }
                    if (val === 'null') {
                        return 'null';
                    }
                    return 'string';
                } else if (typeof val === 'number') {
                    return 'number';
                } else if (typeof val === 'boolean') {
                    return 'boolean';
                } else if (Array.isArray(val)) {
                    // Infer array element type
                    if (val.length === 0) {
                        throw new Error('Unable to infer type for empty array');
                    }
                    const elementType = this.inferType(val[0] as any);
                    return `Array<${elementType}>`;
                }
            }

            // If value property is not set, try to extract from CST
            if ('$cstNode' in value && (value as any).$cstNode) {
                const cstText = (value as any).$cstNode.text.trim();

                if (cstText === 'null') {
                    return 'null';
                }

                // Check if it's a string (quoted)
                if (cstText.startsWith('"') || cstText.startsWith("'")) {
                    return 'string';
                }

                // Check if it's a number
                if (/^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(cstText)) {
                    return 'number';
                }

                // Check if it's a boolean
                if (cstText === 'true' || cstText === 'false') {
                    return 'boolean';
                }

                // Check if it's an object (this shouldn't happen with proper AST parsing)
                if (cstText.startsWith('{') && cstText.endsWith('}')) {
                    return 'Object';
                }

                // Otherwise, assume it's a reference or identifier
                return 'any';
            }
        }

        // Direct primitive values
        if (typeof value === 'string') {
            return 'string';
        } else if (typeof value === 'number') {
            return 'number';
        } else if (typeof value === 'boolean') {
            return 'boolean';
        } else if (Array.isArray(value)) {
            if (value.length === 0) {
                throw new Error('Unable to infer type for empty array');
            }
            const elementType = this.inferType(value[0]);
            return `Array<${elementType}>`;
        }

        return 'any';
    }

    /**
     * Check if two types are compatible
     */
    public areTypesCompatible(declared: string, inferred: string): TypeCheckResult {
        // Parse both types
        const declaredInfo = this.parseType(declared);
        const inferredInfo = this.parseType(inferred);

        // Any is compatible with everything
        if (declaredInfo.baseType === 'any' || inferredInfo.baseType === 'any') {
            return { valid: true };
        }

        // Check base type compatibility
        if (declaredInfo.baseType !== inferredInfo.baseType) {
            // Check for common compatible types
            if (this.areBaseTypesCompatible(declaredInfo.baseType, inferredInfo.baseType)) {
                return { valid: true };
            }

            return {
                valid: false,
                expectedType: declared,
                actualType: inferred,
                message: `Type mismatch: expected ${declared}, got ${inferred}`
            };
        }

        // Check generic parameters if present
        if (declaredInfo.genericParams && inferredInfo.genericParams) {
            if (declaredInfo.genericParams.length !== inferredInfo.genericParams.length) {
                return {
                    valid: false,
                    expectedType: declared,
                    actualType: inferred,
                    message: `Generic parameter count mismatch`
                };
            }

            // Recursively check each generic parameter
            for (let i = 0; i < declaredInfo.genericParams.length; i++) {
                const paramResult = this.areTypesCompatible(
                    declaredInfo.genericParams[i],
                    inferredInfo.genericParams[i]
                );

                if (!paramResult.valid) {
                    return {
                        valid: false,
                        expectedType: declared,
                        actualType: inferred,
                        message: `Generic parameter mismatch at position ${i + 1}`
                    };
                }
            }
        }

        return { valid: true };
    }

    /**
     * Check if base types are compatible (allows for widening conversions)
     */
    private areBaseTypesCompatible(declared: string, inferred: string): boolean {
        // Number literals are compatible with number
        if (declared === 'number' && inferred === 'number') {
            return true;
        }

        // String literals are compatible with string
        if (declared === 'string' && inferred === 'string') {
            return true;
        }

        // Arrays are compatible if element types match
        if (declared.startsWith('Array') && inferred.startsWith('Array')) {
            return true;
        }

        // Specialized string types (Date, UUID, URL, Duration) are compatible with string
        // since they're semantically validated strings
        const stringBasedTypes = ['Date', 'UUID', 'URL', 'Duration'];
        if (stringBasedTypes.includes(declared) && inferred === 'string') {
            return true;
        }

        // Integer and Float are compatible with number
        if ((declared === 'Integer' || declared === 'Float') && inferred === 'number') {
            return true;
        }

        return false;
    }

    /**
     * Extract the raw value from an AttributeValue AST node
     */
    private extractValue(attrValue: AttributeValue): any {
        if (typeof attrValue === 'object' && attrValue !== null) {
            // Handle ArrayValue using type guard
            if (isArrayValue(attrValue)) {
                const arrayVal = attrValue as ArrayValue;
                // Recursively extract values from array elements
                return arrayVal.values.map(v => this.extractValue(v));
            }

            // Handle ObjectValue using type guard
            if (isObjectValue(attrValue)) {
                const objVal = attrValue as ObjectValue;
                const result: Record<string, any> = {};
                objVal.attributes.forEach(attr => {
                    if (attr.value) {
                        result[attr.name] = this.extractValue(attr.value);
                    }
                });
                return result;
            }

            // Handle PrimitiveValue using type guard
            if (isPrimitiveValue(attrValue)) {
                const primVal = attrValue as PrimitiveValue;
                const val = primVal.value;

                // If it's already a primitive, return it
                if (typeof val === 'boolean' || typeof val === 'number') {
                    return val;
                }

                // For string values, check the CST to determine if it was a quoted string
                // Quoted strings should remain strings even if they look like numbers
                if (typeof val === 'string' && '$cstNode' in attrValue && (attrValue as any).$cstNode) {
                    const cstText = (attrValue as any).$cstNode.text.trim();
                    // If it was quoted in the source, keep it as a string
                    if (cstText.startsWith('"') || cstText.startsWith("'")) {
                        return val; // Return the string as-is (Langium already strips quotes)
                    }
                }

                // Convert string booleans to actual booleans
                if (val === 'true') return true;
                if (val === 'false') return false;
                if (val === 'null') return null;

                // Convert unquoted string numbers to actual numbers
                // (This handles NUMBER terminals from the grammar)
                if (typeof val === 'string' && /^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(val)) {
                    return parseFloat(val);
                }

                return val;
            }

            // Fallback: Check if value property exists
            if ('value' in attrValue && (attrValue as any).value !== undefined) {
                const val = (attrValue as any).value;

                // If it's already a primitive, return it
                if (typeof val === 'boolean' || typeof val === 'number') {
                    return val;
                }

                // For string values, check the CST to determine if it was a quoted string
                if (typeof val === 'string' && '$cstNode' in attrValue && (attrValue as any).$cstNode) {
                    const cstText = (attrValue as any).$cstNode.text.trim();
                    // If it was quoted in the source, keep it as a string
                    if (cstText.startsWith('"') || cstText.startsWith("'")) {
                        return val;
                    }
                }

                // Convert string booleans to actual booleans
                if (val === 'true') return true;
                if (val === 'false') return false;
                if (val === 'null') return null;

                // Convert unquoted string numbers to actual numbers
                if (typeof val === 'string' && /^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(val)) {
                    return parseFloat(val);
                }

                return val;
            }

            // Try to extract from CST node
            if ('$cstNode' in attrValue && (attrValue as any).$cstNode) {
                const text = (attrValue as any).$cstNode.text.trim();

                // Remove quotes from strings
                if (text.startsWith('"') || text.startsWith("'")) {
                    return text.slice(1, -1);
                }

                // Parse numbers
                if (/^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(text)) {
                    return parseFloat(text);
                }

                // Parse booleans
                if (text === 'true') return true;
                if (text === 'false') return false;
                if (text === 'null') return null;

                return text;
            }
        }

        return attrValue;
    }

    /**
     * Validate an attribute's type annotation against its value
     */
    public validateAttributeType(attr: Attribute): TypeCheckResult {
        // No type annotation, no validation needed
        if (!attr.type) {
            return { valid: true };
        }


        // Convert TypeDef to string
        const typeStr = this.typeDefToString(attr.type);

        // No value, check if type is optional
        if (!attr.value) {
            const typeInfo = this.parseType(typeStr);
            if (typeInfo.isOptional) {
                return { valid: true };
            }
            return {
                valid: false,
                expectedType: typeStr,
                actualType: 'undefined',
                message: `Attribute '${attr.name}' has type ${typeStr} but no value provided`
            };
        }

        // Parse type information
        const typeInfo = this.parseType(typeStr);

        // Extract the actual value for validation
        const extractedValue = this.extractValue(attr.value);

        if (extractedValue === null) {
            if (typeInfo.isOptional) {
                return { valid: true };
            }
            const inferredType = 'null';
            return {
                valid: false,
                expectedType: typeStr,
                actualType: inferredType,
                message: `Type mismatch: expected ${typeStr}, got ${inferredType}`
            };
        }

        const inferTypeSafely = (): string => {
            try {
                return this.inferType(attr.value);
            } catch (error) {
                if (error instanceof Error && error.message.includes('Unable to infer type for empty array')) {
                    return typeStr;
                }
                throw error;
            }
        };

        const formatTypeMismatchMessage = (message?: string, actualType?: string): string => {
            const inferred = actualType ?? inferTypeSafely();
            const fallback = `Type mismatch: expected ${typeStr}, got ${inferred}`;
            return message ? `${fallback}. ${message}` : fallback;
        };

        // Phase 1: Handle union types (literal types like 'idle' | 'in_progress' | 'complete')
        if (typeStr.includes('|')) {
            // Extract literal values from union type string
            const literals = typeStr.split('|').map(s => s.trim().replace(/^'|'$/g, ''));

            // Check if the extracted value matches any of the literals
            const valueStr = typeof extractedValue === 'string'
                ? extractedValue
                : String(extractedValue);

            if (!literals.includes(valueStr)) {
                const inferredType = inferTypeSafely();
                return {
                    valid: false,
                    expectedType: typeStr,
                    actualType: inferredType,
                    message: `Value "${valueStr}" does not match any of the allowed literals: ${literals.map(l => `'${l}'`).join(', ')}`
                };
            }

            return { valid: true };
        }

        // Phase 2: Semantic validation using Zod
        // Only for types that have semantic meaning (Date, UUID, URL, etc.)
        if (typeInfo.genericParams && typeInfo.genericParams.length > 0) {
            // Handle generic types with Zod
            const zodResult = this.typeRegistry.validateGenericType(
                typeInfo.baseType,
                typeInfo.genericParams,
                extractedValue
            );

            if (!zodResult.valid) {
                const inferredType = inferTypeSafely();
                return {
                    valid: false,
                    expectedType: typeStr,
                    actualType: inferredType,
                    message: formatTypeMismatchMessage(zodResult.message, inferredType)
                };
            }

            // If Zod validation passed for generic type, the type is valid
            return { valid: true };
        } else if (this.typeRegistry.has(typeInfo.baseType)) {
            // Validate non-generic types with Zod (including node types)
            const zodResult = this.typeRegistry.validate(typeInfo.baseType, extractedValue);

            if (!zodResult.valid) {
                const inferredType = inferTypeSafely();
                return {
                    valid: false,
                    expectedType: typeStr,
                    actualType: inferredType,
                    message: formatTypeMismatchMessage(zodResult.message, inferredType)
                };
            }

            // If Zod validation passed, the type is valid
            // Don't fall through to structural validation for registered types
            return { valid: true };
        }

        // Phase 3: Structural validation (existing logic)
        // This ensures type compatibility at the structural level
        // Only reached for types that are not registered in the type registry
        const inferredType = inferTypeSafely();
        return this.areTypesCompatible(typeStr, inferredType);
    }

    /**
     * Validate a template variable reference
     * Example: "{{ config.apiKey }}" => check if config.apiKey exists and is a string
     */
    public validateTemplateReference(reference: string, expectedType?: string): TypeCheckResult {
        // Parse reference path (e.g., "config.apiKey" => ["config", "apiKey"])
        const parts = reference.split('.');
        if (parts.length === 0) {
            return {
                valid: false,
                message: `Invalid template reference: ${reference}`
            };
        }

        // Check if root node exists
        const rootName = parts[0];
        const rootNode = this.nodeMap.get(rootName);
        if (!rootNode) {
            return {
                valid: false,
                message: `Reference to undefined node: ${rootName}`
            };
        }

        // If only node reference, return success
        if (parts.length === 1) {
            return { valid: true };
        }

        // Check if attribute exists
        const attrName = parts[1];
        const attr = rootNode.attributes?.find(a => a.name === attrName);
        if (!attr) {
            return {
                valid: false,
                message: `Node '${rootName}' has no attribute '${attrName}'`
            };
        }

        // Check type compatibility if expected type is provided
        if (expectedType && attr.type) {
            const attrTypeStr = this.typeDefToString(attr.type);
            return this.areTypesCompatible(expectedType, attrTypeStr);
        }

        return { valid: true };
    }

    /**
     * Validate all attributes in the machine
     */
    public validateAllAttributes(): Map<string, TypeCheckResult> {
        const results = new Map<string, TypeCheckResult>();

        const validateNode = (node: Node) => {
            node.attributes?.forEach(attr => {
                const result = this.validateAttributeType(attr);
                if (!result.valid) {
                    results.set(`${node.name}.${attr.name}`, result);
                }
            });

            // Recursively validate child nodes
            node.nodes.forEach(child => validateNode(child));
        };

        this.machine.nodes.forEach(node => validateNode(node));

        return results;
    }

    /**
     * Validate all attributes with ValidationContext for runtime error handling
     */
    public validateAllAttributesWithContext(context: ValidationContext): void {
        const validateNode = (node: Node) => {
            node.attributes?.forEach(attr => {
                const result = this.validateAttributeType(attr);
                if (!result.valid) {
                    context.addError(createValidationError(
                        result.message || 'Type validation failed',
                        {
                            severity: ValidationSeverity.ERROR,
                            category: ValidationCategory.TYPE,
                            code: TypeErrorCodes.TYPE_MISMATCH,
                            location: {
                                node: node.name,
                                property: attr.name
                            },
                            expected: result.expectedType,
                            actual: result.actualType,
                            suggestion: this.generateTypeSuggestion(result)
                        }
                    ));
                }
            });

            // Recursively validate child nodes
            node.nodes.forEach(child => validateNode(child));
        };

        this.machine.nodes.forEach(node => validateNode(node));
    }

    /**
     * Generate a helpful suggestion for type errors
     */
    private generateTypeSuggestion(result: TypeCheckResult): string | undefined {
        if (!result.expectedType || !result.actualType) {
            return undefined;
        }

        if (result.actualType === 'undefined') {
            const typeInfo = this.parseType(result.expectedType);
            if (typeInfo.isOptional) {
                return `Make the type optional with '${result.expectedType}' or provide a value`;
            }
            return `Provide a value of type '${result.expectedType}' or make the type optional with '${result.expectedType}?'`;
        }

        return `Change the value to match type '${result.expectedType}' or update the type annotation to '${result.actualType}'`;
    }

    /**
     * Validate generic type syntax
     */
    public validateGenericType(typeStr: string): TypeCheckResult {
        try {
            const typeInfo = this.parseType(typeStr);

            // Check if generic params are balanced
            const openCount = (typeStr.match(/</g) || []).length;
            const closeCount = (typeStr.match(/>/g) || []).length;

            if (openCount !== closeCount) {
                return {
                    valid: false,
                    message: `Unbalanced generic brackets in type: ${typeStr}`
                };
            }

            // Validate each generic parameter recursively
            if (typeInfo.genericParams) {
                for (const param of typeInfo.genericParams) {
                    const paramResult = this.validateGenericType(param);
                    if (!paramResult.valid) {
                        return paramResult;
                    }
                }
            }

            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                message: `Invalid type syntax: ${typeStr}`
            };
        }
    }

    /**
     * Get the type of a node attribute by path
     * Example: getAttributeType("config", "apiKey") => "string"
     */
    public getAttributeType(nodeName: string, attrName: string): string | null {
        const node = this.nodeMap.get(nodeName);
        if (!node) return null;

        const attr = node.attributes?.find(a => a.name === attrName);
        if (!attr) return null;

        // Return declared type if available, otherwise infer
        if (attr.type) {
            return this.typeDefToString(attr.type);
        }

        return this.inferType(attr.value);
    }

    /**
     * Get the TypeRegistry instance for custom type registration
     * @returns The TypeRegistry instance used by this TypeChecker
     */
    public getTypeRegistry(): TypeRegistry {
        return this.typeRegistry;
    }
}
