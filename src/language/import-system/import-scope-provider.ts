/**
 * Import-aware Scope Provider
 *
 * Extends the scope system to resolve symbols from imported modules
 */

import { AstNode, AstNodeDescription, ReferenceInfo, Scope, stream } from 'langium';
import { MachineScopeProvider } from '../machine-scope.js';
import { ImportStatement, ImportedSymbol, Machine, Node, isNode } from '../generated/ast.js';
import { WorkspaceManager } from './workspace-manager.js';

/**
 * Scope provider that handles imported symbols
 */
export class ImportScopeProvider extends MachineScopeProvider {
    constructor(
        services: any,
        private readonly workspaceManager?: WorkspaceManager
    ) {
        super(services);
    }

    /**
     * Override getScope to include imported symbols
     */
    override getScope(context: ReferenceInfo): Scope {
        // Get the base scope (local symbols)
        const baseScope = super.getScope(context);

        // If we're resolving node references, add imported symbols
        if (context.property === 'source' || context.property === 'target') {
            const machine = this.getMachineContainer(context.container);
            if (machine && machine.imports && machine.imports.length > 0) {
                // Get imported symbols
                const importedDescriptions = this.getImportedSymbolDescriptions(machine);

                if (importedDescriptions.length > 0) {
                    // Create a scope with imported symbols that delegates to the base scope
                    const importScope = this.createScope(stream(importedDescriptions), baseScope);
                    return importScope;
                }
            }
        }

        return baseScope;
    }

    /**
     * Get all symbol descriptions from imported modules
     */
    private getImportedSymbolDescriptions(machine: Machine): AstNodeDescription[] {
        const descriptions: AstNodeDescription[] = [];
        const symbolMap = new Map<string, { node: Node; sourceModule: string }>();

        if (!machine.imports || !this.workspaceManager) {
            return descriptions;
        }

        // Process each import statement
        for (const importStmt of machine.imports) {
            const moduleInfo = this.getModuleInfoForImport(importStmt);
            if (!moduleInfo) {
                continue;
            }

            const importedMachine = moduleInfo.document.parseResult.value;

            // Process each imported symbol
            for (const symbol of importStmt.symbols) {
                const symbolName = symbol.name;
                const alias = symbol.alias || this.getShortName(symbolName);

                // Find the node in the imported module
                const node = this.findNodeInMachine(importedMachine, symbolName);
                if (node) {
                    // Check for collisions
                    if (symbolMap.has(alias)) {
                        // Symbol collision - we'll let validation handle this
                        continue;
                    }

                    symbolMap.set(alias, {
                        node,
                        sourceModule: importStmt.path
                    });

                    // Create a description for this symbol
                    descriptions.push(
                        this.descriptions.createDescription(node, alias)
                    );
                }
            }
        }

        return descriptions;
    }

    /**
     * Get module info for an import statement
     */
    private getModuleInfoForImport(importStmt: ImportStatement): any {
        if (!this.workspaceManager) {
            return undefined;
        }

        // Get the URI of the importing file
        const machine = importStmt.$container;
        const sourceDoc = this.getDocument(machine);
        if (!sourceDoc) {
            return undefined;
        }

        // This would need to resolve the import path to a URI
        // For now, we'll return undefined as this requires async resolution
        // which will be handled by the linker
        return undefined;
    }

    /**
     * Get the document containing an AST node
     */
    private getDocument(node: AstNode): any {
        return node.$document;
    }

    /**
     * Find a node by qualified name in a machine
     */
    private findNodeInMachine(machine: Machine, qualifiedName: string): Node | undefined {
        const allNodes = this.getAllNodesInMachine(machine);

        // Try exact match first
        const exactMatch = allNodes.find(n => n.name === qualifiedName);
        if (exactMatch) {
            return exactMatch;
        }

        // Try matching by short name if qualified
        const shortName = this.getShortName(qualifiedName);
        return allNodes.find(n => {
            const nodeShortName = this.getShortName(n.name);
            return nodeShortName === shortName;
        });
    }

    /**
     * Get all nodes in a machine (including nested)
     */
    private getAllNodesInMachine(machine: Machine): Node[] {
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
     * Get the short name from a qualified name
     */
    private getShortName(qualifiedName: string): string {
        const parts = qualifiedName.split('.');
        return parts[parts.length - 1];
    }

    /**
     * Helper to get the Machine container (from parent class, made accessible)
     */
    private getMachineContainer(node: AstNode): Machine | undefined {
        let current: AstNode | undefined = node;
        while (current && !('title' in current && 'imports' in current)) {
            current = current.$container;
        }
        return current as Machine;
    }
}

/**
 * Symbol registry for tracking imported symbols and their sources
 */
export class ImportedSymbolRegistry {
    private symbols = new Map<string, {
        node: Node;
        importPath: string;
        alias: string;
    }[]>();

    /**
     * Register an imported symbol
     */
    registerSymbol(
        targetMachine: Machine,
        node: Node,
        importPath: string,
        originalName: string,
        alias?: string
    ): void {
        const machineKey = this.getMachineKey(targetMachine);
        const effectiveAlias = alias || this.getShortName(originalName);

        if (!this.symbols.has(machineKey)) {
            this.symbols.set(machineKey, []);
        }

        this.symbols.get(machineKey)!.push({
            node,
            importPath,
            alias: effectiveAlias
        });
    }

    /**
     * Get all imported symbols for a machine
     */
    getSymbols(machine: Machine): Array<{
        node: Node;
        importPath: string;
        alias: string;
    }> {
        const machineKey = this.getMachineKey(machine);
        return this.symbols.get(machineKey) || [];
    }

    /**
     * Check if a symbol exists in a machine
     */
    hasSymbol(machine: Machine, symbolName: string): boolean {
        const symbols = this.getSymbols(machine);
        return symbols.some(s => s.alias === symbolName);
    }

    /**
     * Get the source of a symbol
     */
    getSymbolSource(machine: Machine, symbolName: string): string | undefined {
        const symbols = this.getSymbols(machine);
        const symbol = symbols.find(s => s.alias === symbolName);
        return symbol?.importPath;
    }

    /**
     * Clear all symbols
     */
    clear(): void {
        this.symbols.clear();
    }

    /**
     * Get a unique key for a machine
     */
    private getMachineKey(machine: Machine): string {
        return machine.$document?.uri.toString() || 'unknown';
    }

    /**
     * Get short name from qualified name
     */
    private getShortName(qualifiedName: string): string {
        const parts = qualifiedName.split('.');
        return parts[parts.length - 1];
    }
}
