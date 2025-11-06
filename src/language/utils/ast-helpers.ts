/**
 * AST Helper Utilities
 *
 * Shared utilities for working with Langium AST nodes and extracting values.
 * This module provides a single source of truth for AST operations across the codebase.
 */

/**
 * Extract the actual value from a Langium AST node
 *
 * Handles various AST node types:
 * - PrimitiveValue nodes (strings, numbers, IDs)
 * - ObjectValue nodes (nested attributes as objects)
 * - ArrayValue nodes (arrays of AttributeValues)
 * - Legacy AST nodes with $type property
 * - CST nodes with text property
 * - String quote removal
 *
 * @param value - The value to extract (can be primitive, AST node, or object)
 * @returns The extracted value as a primitive type, object, or array
 */
export function extractValueFromAST(value: any): any {
    // If not an object, return as-is
    if (!value || typeof value !== 'object') {
        return value;
    }

    // Check if it's a Langium AST node (has $type property)
    if ('$type' in value) {
        const astNode = value as any;

        // Handle new nested attribute types
        switch (astNode.$type) {
            case 'PrimitiveValue':
                // Extract primitive value (string, number, ID)
                if ('value' in astNode) {
                    const primitiveValue = astNode.value;
                    // If it has a CST node, extract text from it
                    if (typeof primitiveValue === 'object' && primitiveValue && '$cstNode' in primitiveValue) {
                        let text = primitiveValue.$cstNode.text;
                        if (typeof text === 'string') {
                            const hasQuotes = /^["']/.test(text);
                            // Remove surrounding quotes
                            text = text.replace(/^["']|["']$/g, '');

                            // If no quotes, try to parse as boolean or number
                            if (!hasQuotes) {
                                // Try boolean
                                if (text === 'true') return true;
                                if (text === 'false') return false;

                                // Try number
                                const numValue = Number(text);
                                if (!isNaN(numValue) && text.trim() !== '') {
                                    return numValue;
                                }
                            }
                        }
                        return text;
                    }
                    // For direct string/number values, remove quotes if string
                    if (typeof primitiveValue === 'string') {
                        const hasQuotes = /^["']/.test(primitiveValue);
                        const cleaned = primitiveValue.replace(/^["']|["']$/g, '');

                        // If no quotes, try to parse as boolean or number
                        if (!hasQuotes) {
                            if (cleaned === 'true') return true;
                            if (cleaned === 'false') return false;

                            const numValue = Number(cleaned);
                            if (!isNaN(numValue) && cleaned.trim() !== '') {
                                return numValue;
                            }
                        }
                        return cleaned;
                    }
                    return primitiveValue;
                }
                break;

            case 'ObjectValue':
                // Convert nested attributes to a plain object
                if ('attributes' in astNode && Array.isArray(astNode.attributes)) {
                    const result: Record<string, any> = {};
                    for (const attr of astNode.attributes) {
                        if (attr.name && attr.value) {
                            result[attr.name] = extractValueFromAST(attr.value);
                        }
                    }
                    return result;
                }
                return {};

            case 'ArrayValue':
                // Convert array of AttributeValues to a plain array
                if ('values' in astNode && Array.isArray(astNode.values)) {
                    return astNode.values.map((v: any) => extractValueFromAST(v));
                }
                return [];

            case 'AttributeValue':
                // Legacy: AttributeValue with direct value property
                if ('value' in astNode) {
                    return extractValueFromAST(astNode.value);
                }
                break;
        }

        // Try to extract text from CST node (legacy support)
        if ('$cstNode' in astNode && astNode.$cstNode && 'text' in astNode.$cstNode) {
            let text = astNode.$cstNode.text;
            if (typeof text === 'string') {
                // Remove surrounding quotes
                text = text.replace(/^["']|["']$/g, '');
            }
            return text;
        }

        // Try to extract from value property (recursive, legacy support)
        if ('value' in astNode) {
            return extractValueFromAST(astNode.value);
        }

        // Fallback: convert to string
        return String(value);
    }

    // Not an AST node, return as-is
    return value;
}

/**
 * Parse an attribute value based on its declared type
 *
 * @param value - The string value to parse
 * @param type - The declared type (e.g., 'string', 'number', 'boolean', 'array', 'object')
 * @returns The parsed value in the correct type
 */
export function parseAttributeValue(value: string, type: string): any {
    switch (type.toLowerCase()) {
        case 'string':
            return value;

        case 'number':
            const num = Number(value);
            return isNaN(num) ? value : num;

        case 'boolean':
            return value.toLowerCase() === 'true';

        case 'array':
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [value];
            } catch {
                return [value];
            }

        case 'object':
            try {
                const parsed = JSON.parse(value);
                return typeof parsed === 'object' && parsed !== null ? parsed : { value };
            } catch {
                return { value };
            }

        default:
            // Try to detect and parse JSON
            if ((value.startsWith('{') && value.endsWith('}')) ||
                (value.startsWith('[') && value.endsWith(']'))) {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
            return value;
    }
}

/**
 * Serialize a value for storage in machine data
 *
 * Now supports nested objects and arrays natively.
 * Objects and arrays are serialized to JSON strings for backward compatibility.
 *
 * @param value - The value to serialize
 * @returns String representation of the value, or JSON for objects/arrays
 */
export function serializeValue(value: any): string {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return String(value);
    }

    // For objects and arrays, use JSON
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(value);
        }
    }

    return String(value);
}

/**
 * Validate if a value matches the expected type
 *
 * @param value - The value to validate
 * @param expectedType - The expected type
 * @returns True if the value matches the expected type
 */
export function validateValueType(value: any, expectedType: string): boolean {
    switch (expectedType.toLowerCase()) {
        case 'string':
            return typeof value === 'string';

        case 'number':
            return typeof value === 'number' && !isNaN(value);

        case 'boolean':
            return typeof value === 'boolean';

        case 'array':
            return Array.isArray(value);

        case 'object':
            return typeof value === 'object' && value !== null && !Array.isArray(value);

        default:
            // For custom types or unknown types, allow any value
            return true;
    }
}
