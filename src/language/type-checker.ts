/**
 * Type Checker
 * Validates type annotations, infers types, and checks compatibility
 */

import type { Machine, Node, Attribute, AttributeValue } from './generated/ast.js';
import {
    ValidationContext,
    ValidationSeverity,
    ValidationCategory,
    createValidationError,
    TypeErrorCodes
} from './validation-errors.js';

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

    constructor(machine: Machine) {
        this.machine = machine;
        this.nodeMap = this.buildNodeMap();
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
     * Convert TypeDef AST node to string representation
     */
    private typeDefToString(typeDef: any): string {
        if (typeof typeDef === 'string') {
            return typeDef;
        }

        if (!typeDef || !typeDef.base) {
            return 'any';
        }

        let result = typeDef.base;

        if (typeDef.generics && typeDef.generics.length > 0) {
            const genericStrs = typeDef.generics.map((g: any) => this.typeDefToString(g));
            result += '<' + genericStrs.join(', ') + '>';
        }

        return result;
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

        // Handle AST node values
        if (typeof value === 'object' && value !== null) {
            // Check if value property exists and is populated
            if ('value' in value && (value as any).value !== undefined) {
                const val = (value as any).value;

                if (typeof val === 'string') {
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

                // Check if it's an array
                if (cstText.startsWith('[') && cstText.endsWith(']')) {
                    // Check if it's an empty array
                    const trimmed = cstText.substring(1, cstText.length - 1).trim();
                    if (trimmed === '') {
                        throw new Error('Unable to infer type for empty array');
                    }
                    // For arrays, we'd need more sophisticated parsing
                    // For now, return Array<any>
                    return 'Array<any>';
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

        return false;
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

        // Infer value type and check compatibility
        const inferredType = this.inferType(attr.value);
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
}
