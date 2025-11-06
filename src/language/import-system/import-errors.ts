/**
 * Error classes and types for the import system
 */

import { URI } from 'langium';
import { AstNode } from 'langium';

/**
 * Base class for import-related errors
 */
export class ImportError extends Error {
    constructor(
        message: string,
        public readonly importPath: string,
        public readonly sourceUri?: URI,
        public readonly node?: AstNode
    ) {
        super(message);
        this.name = 'ImportError';
    }
}

/**
 * Error thrown when a module cannot be resolved
 */
export class ModuleNotFoundError extends ImportError {
    constructor(
        importPath: string,
        sourceUri?: URI,
        node?: AstNode
    ) {
        super(
            `Cannot resolve module: "${importPath}"`,
            importPath,
            sourceUri,
            node
        );
        this.name = 'ModuleNotFoundError';
    }
}

/**
 * Error thrown when a circular dependency is detected
 */
export class CircularDependencyError extends ImportError {
    constructor(
        public readonly cycle: string[],
        sourceUri?: URI,
        node?: AstNode
    ) {
        const cycleStr = cycle.join(' -> ');
        super(
            `Circular dependency detected: ${cycleStr}`,
            cycle[0],
            sourceUri,
            node
        );
        this.name = 'CircularDependencyError';
    }
}

/**
 * Error thrown when an imported symbol is not found in the module
 */
export class SymbolNotFoundError extends ImportError {
    constructor(
        public readonly symbolName: string,
        importPath: string,
        sourceUri?: URI,
        node?: AstNode
    ) {
        super(
            `Symbol "${symbolName}" not found in module "${importPath}"`,
            importPath,
            sourceUri,
            node
        );
        this.name = 'SymbolNotFoundError';
    }
}

/**
 * Error thrown when a symbol name collision occurs
 */
export class SymbolCollisionError extends ImportError {
    constructor(
        public readonly symbolName: string,
        public readonly firstSource: string,
        public readonly secondSource: string,
        sourceUri?: URI,
        node?: AstNode
    ) {
        super(
            `Symbol "${symbolName}" is imported from both "${firstSource}" and "${secondSource}"`,
            firstSource,
            sourceUri,
            node
        );
        this.name = 'SymbolCollisionError';
    }
}

/**
 * Error thrown when a module has invalid syntax or cannot be parsed
 */
export class ModuleParseError extends ImportError {
    constructor(
        importPath: string,
        public readonly parseError: Error,
        sourceUri?: URI,
        node?: AstNode
    ) {
        super(
            `Failed to parse module "${importPath}": ${parseError.message}`,
            importPath,
            sourceUri,
            node
        );
        this.name = 'ModuleParseError';
    }
}

/**
 * Error thrown when a URL import fails (network error, not found, etc.)
 */
export class URLImportError extends ImportError {
    constructor(
        importPath: string,
        public readonly statusCode?: number,
        public readonly statusText?: string,
        sourceUri?: URI,
        node?: AstNode
    ) {
        const detail = statusCode ? ` (${statusCode} ${statusText})` : '';
        super(
            `Failed to fetch module from URL "${importPath}"${detail}`,
            importPath,
            sourceUri,
            node
        );
        this.name = 'URLImportError';
    }
}

/**
 * Diagnostic information for import validation
 */
export interface ImportDiagnostic {
    severity: 'error' | 'warning' | 'info';
    message: string;
    importPath: string;
    sourceUri?: URI;
    node?: AstNode;
    code?: string;
}

/**
 * Helper function to create diagnostics from errors
 */
export function errorToDiagnostic(error: ImportError): ImportDiagnostic {
    return {
        severity: 'error',
        message: error.message,
        importPath: error.importPath,
        sourceUri: error.sourceUri,
        node: error.node,
        code: error.name
    };
}

/**
 * Type guard to check if an error is an ImportError
 */
export function isImportError(error: unknown): error is ImportError {
    return error instanceof ImportError;
}
