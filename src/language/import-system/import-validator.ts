/**
 * Import Validator
 *
 * Validates import statements and detects import-related errors
 */

import { ValidationAcceptor, AstNode } from 'langium';
import { ImportStatement, ImportedSymbol, Machine, Node, isNode } from '../generated/ast.js';
import { WorkspaceManager } from './workspace-manager.js';
import { ModuleResolver } from './module-resolver.js';
import { DependencyGraph } from './dependency-graph.js';

/**
 * Validates import statements and related issues
 */
export class ImportValidator {
    constructor(
        private readonly workspaceManager?: WorkspaceManager,
        private readonly resolver?: ModuleResolver
    ) {}

    /**
     * Validate all imports in a machine
     */
    checkImports(machine: Machine, accept: ValidationAcceptor): void {
        if (!machine.imports || machine.imports.length === 0) {
            return;
        }

        // Check each import statement
        for (const importStmt of machine.imports) {
            this.checkImportStatement(importStmt, machine, accept);
        }

        // Check for circular dependencies
        this.checkCircularDependencies(machine, accept);

        // Check for symbol collisions across imports
        this.checkSymbolCollisions(machine, accept);
    }

    /**
     * Validate a single import statement
     */
    private checkImportStatement(
        importStmt: ImportStatement,
        machine: Machine,
        accept: ValidationAcceptor
    ): void {
        // Check if path is empty
        if (!importStmt.path || importStmt.path.trim() === '') {
            accept('error', 'Import path cannot be empty', {
                node: importStmt,
                property: 'path'
            });
            return;
        }

        // Check if symbols are empty
        if (!importStmt.symbols || importStmt.symbols.length === 0) {
            accept('error', 'Import must specify at least one symbol', {
                node: importStmt,
                property: 'symbols'
            });
            return;
        }

        // Validate each imported symbol
        for (const symbol of importStmt.symbols) {
            this.checkImportedSymbol(symbol, importStmt, machine, accept);
        }

        // Check if the module can be resolved (if resolver is available)
        if (this.resolver) {
            this.checkModuleResolution(importStmt, machine, accept);
        }
    }

    /**
     * Check if a module can be resolved
     */
    private checkModuleResolution(
        importStmt: ImportStatement,
        machine: Machine,
        accept: ValidationAcceptor
    ): void {
        // This would need async resolution, so we'll leave a placeholder
        // In practice, this would be called during document build phase
        // For now, we'll add a warning if the path looks suspicious
        const path = importStmt.path;

        // Check for common issues
        if (path.startsWith('http://')) {
            accept('warning', 'HTTP imports are insecure. Consider using HTTPS.', {
                node: importStmt,
                property: 'path'
            });
        }

        // Check for absolute paths (not recommended)
        if (path.startsWith('/') && !path.startsWith('//')) {
            accept('warning', 'Absolute paths may not be portable. Consider using relative paths.', {
                node: importStmt,
                property: 'path'
            });
        }
    }

    /**
     * Validate an imported symbol
     */
    private checkImportedSymbol(
        symbol: ImportedSymbol,
        importStmt: ImportStatement,
        machine: Machine,
        accept: ValidationAcceptor
    ): void {
        // Check if symbol name is empty
        if (!symbol.name || symbol.name.trim() === '') {
            accept('error', 'Symbol name cannot be empty', {
                node: symbol,
                property: 'name'
            });
            return;
        }

        // Check if alias is empty (if provided)
        if (symbol.alias !== undefined && symbol.alias.trim() === '') {
            accept('error', 'Alias cannot be empty', {
                node: symbol,
                property: 'alias'
            });
            return;
        }

        // Check if alias collides with local symbols
        const effectiveAlias = symbol.alias || this.getShortName(symbol.name);
        this.checkLocalSymbolCollision(effectiveAlias, symbol, machine, accept);
    }

    /**
     * Check if an imported symbol collides with a local symbol
     */
    private checkLocalSymbolCollision(
        symbolName: string,
        symbol: ImportedSymbol,
        machine: Machine,
        accept: ValidationAcceptor
    ): void {
        // Get all local nodes
        const localNodes = this.getAllNodes(machine);

        // Check if any local node has the same name
        for (const node of localNodes) {
            const nodeName = node.name;
            const nodeShortName = this.getShortName(nodeName);

            if (nodeShortName === symbolName || nodeName === symbolName) {
                accept('error',
                    `Imported symbol "${symbolName}" collides with local node "${nodeName}"`,
                    { node: symbol, property: symbol.alias ? 'alias' : 'name' }
                );
            }
        }
    }

    /**
     * Check for circular dependencies
     */
    private checkCircularDependencies(machine: Machine, accept: ValidationAcceptor): void {
        if (!this.workspaceManager) {
            return;
        }

        const cycles = this.workspaceManager.getCircularDependencies();

        if (cycles.length > 0) {
            // Get the URI of this machine
            const machineUri = machine.$document?.uri.toString();

            // Check if this machine is involved in any cycle
            for (const cycle of cycles) {
                if (cycle.cycle.includes(machineUri || '')) {
                    const cycleStr = cycle.cycle
                        .map(uri => this.getFileNameFromUri(uri))
                        .join(' → ');

                    accept('error',
                        `Circular dependency detected: ${cycleStr}`,
                        { node: machine, property: 'imports' }
                    );
                    break; // Only report one cycle per machine
                }
            }
        }
    }

    /**
     * Check for symbol collisions across imports
     */
    private checkSymbolCollisions(machine: Machine, accept: ValidationAcceptor): void {
        if (!machine.imports || machine.imports.length === 0) {
            return;
        }

        // Track symbols and their sources
        const symbolSources = new Map<string, {
            import: ImportStatement;
            symbol: ImportedSymbol;
        }>();

        // Check each import
        for (const importStmt of machine.imports) {
            for (const symbol of importStmt.symbols) {
                const effectiveAlias = symbol.alias || this.getShortName(symbol.name);

                // Check if this symbol was already imported
                if (symbolSources.has(effectiveAlias)) {
                    const firstSource = symbolSources.get(effectiveAlias)!;
                    accept('error',
                        `Symbol "${effectiveAlias}" is imported from both "${firstSource.import.path}" and "${importStmt.path}"`,
                        { node: symbol, property: symbol.alias ? 'alias' : 'name' }
                    );
                } else {
                    symbolSources.set(effectiveAlias, {
                        import: importStmt,
                        symbol
                    });
                }
            }
        }
    }

    /**
     * Get all nodes in a machine recursively
     */
    private getAllNodes(machine: Machine): Node[] {
        const nodes: Node[] = [];

        const collectNodes = (container: { nodes?: Node[] }) => {
            if (!container.nodes || !Array.isArray(container.nodes)) {
                return;
            }

            for (const node of container.nodes) {
                nodes.push(node);
                if (isNode(node) && node.nodes && node.nodes.length > 0) {
                    collectNodes(node);
                }
            }
        };

        collectNodes(machine);
        return nodes;
    }

    /**
     * Get short name from qualified name
     */
    private getShortName(qualifiedName: string): string {
        const parts = qualifiedName.split('.');
        return parts[parts.length - 1];
    }

    /**
     * Extract filename from URI
     */
    private getFileNameFromUri(uri: string): string {
        const parts = uri.split('/');
        return parts[parts.length - 1] || uri;
    }
}

/**
 * Async validator for checking module resolution
 * This is separate because it requires async operations
 */
export class AsyncImportValidator {
    constructor(
        private readonly resolver: ModuleResolver,
        private readonly workspaceManager?: WorkspaceManager
    ) {}

    /**
     * Validate that all imports can be resolved
     * Returns array of errors
     */
    async validateModuleResolution(machine: Machine): Promise<Array<{
        message: string;
        importStmt: ImportStatement;
    }>> {
        const errors: Array<{ message: string; importStmt: ImportStatement }> = [];

        if (!machine.imports || machine.imports.length === 0) {
            return errors;
        }

        const machineUri = machine.$document?.uri;
        if (!machineUri) {
            return errors;
        }

        // Check each import
        for (const importStmt of machine.imports) {
            try {
                const resolved = await this.resolver.resolve(importStmt.path, machineUri);

                if (!resolved) {
                    errors.push({
                        message: `Cannot resolve module: "${importStmt.path}"`,
                        importStmt
                    });
                    continue;
                }

                // If resolved, check that imported symbols exist in the module
                await this.validateSymbolsExist(importStmt, resolved.content || '');

            } catch (error) {
                errors.push({
                    message: `Error resolving module "${importStmt.path}": ${error}`,
                    importStmt
                });
            }
        }

        return errors;
    }

    /**
     * Validate that imported symbols exist in the module
     */
    private async validateSymbolsExist(
        importStmt: ImportStatement,
        moduleContent: string
    ): Promise<void> {
        // This would require parsing the module content
        // For now, we'll skip this as it requires the full parser
        // In practice, this would be done during the linking phase
    }
}
