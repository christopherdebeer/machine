/**
 * Multi-File Linker for Import System
 *
 * Handles linking across multiple DyGram files
 */

import { AstNode, DefaultLinker, LinkingError, Reference } from 'langium';
import { LangiumServices } from 'langium/lsp';
import { WorkspaceManager } from './workspace-manager.js';
import { ImportStatement, Machine, isNode, Node } from '../generated/ast.js';

/**
 * Enhanced linker that supports multi-file imports
 */
export class MultiFileLinker extends DefaultLinker {
    private workspaceManager?: WorkspaceManager;

    constructor(services: LangiumServices) {
        super(services);
    }

    /**
     * Set the workspace manager
     */
    setWorkspaceManager(manager: WorkspaceManager): void {
        this.workspaceManager = manager;
    }

    /**
     * Override getCandidate to include imported symbols
     */
    override getCandidate(refInfo: Reference): AstNode | LinkingError {
        // Try the default linking first (local symbols)
        const localCandidate = super.getCandidate(refInfo);

        // If we found a local candidate, return it
        if (localCandidate && !(localCandidate instanceof Error)) {
            return localCandidate;
        }

        // If no local candidate, try imported symbols
        const importedCandidate = this.findImportedSymbol(refInfo);
        if (importedCandidate) {
            return importedCandidate;
        }

        // Return the original error if no candidate found
        return localCandidate;
    }

    /**
     * Find a symbol in imported modules
     */
    private findImportedSymbol(refInfo: Reference): AstNode | undefined {
        if (!this.workspaceManager) {
            return undefined;
        }

        // Get the containing machine
        const machine = this.getMachineContainer(refInfo.container);
        if (!machine || !machine.imports || machine.imports.length === 0) {
            return undefined;
        }

        const refText = this.getRefText(refInfo);
        if (!refText) {
            return undefined;
        }

        // Search through imports
        for (const importStmt of machine.imports) {
            const candidate = this.findSymbolInImport(importStmt, refText);
            if (candidate) {
                return candidate;
            }
        }

        return undefined;
    }

    /**
     * Find a symbol in a specific import
     */
    private findSymbolInImport(importStmt: ImportStatement, symbolName: string): AstNode | undefined {
        // Check if this symbol is imported
        const importedSymbol = importStmt.symbols.find(s => {
            const alias = s.alias || this.getShortName(s.name);
            return alias === symbolName;
        });

        if (!importedSymbol) {
            return undefined;
        }

        // Get the imported module
        const moduleInfo = this.getModuleInfo(importStmt);
        if (!moduleInfo) {
            return undefined;
        }

        const importedMachine = moduleInfo.document.parseResult.value;

        // Find the actual node in the imported machine
        return this.findNodeInMachine(importedMachine, importedSymbol.name);
    }

    /**
     * Get module info for an import statement
     */
    private getModuleInfo(importStmt: ImportStatement): any {
        // This is a simplified version - in reality, we'd need to resolve the
        // import path to a URI and look it up in the workspace manager
        // For now, returning undefined as this requires async operations
        return undefined;
    }

    /**
     * Find a node by name in a machine
     */
    private findNodeInMachine(machine: Machine, qualifiedName: string): Node | undefined {
        const allNodes = this.getAllNodes(machine);

        // Try exact match
        const exactMatch = allNodes.find(n => n.name === qualifiedName);
        if (exactMatch) {
            return exactMatch;
        }

        // Try matching by short name
        const shortName = this.getShortName(qualifiedName);
        return allNodes.find(n => {
            const nodeShortName = this.getShortName(n.name);
            return nodeShortName === shortName;
        });
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
     * Get the short name from a qualified name
     */
    private getShortName(qualifiedName: string): string {
        const parts = qualifiedName.split('.');
        return parts[parts.length - 1];
    }

    /**
     * Get the reference text
     */
    private getRefText(refInfo: Reference): string | undefined {
        return refInfo.$refText;
    }

    /**
     * Get the Machine container for any AST node
     */
    private getMachineContainer(node: AstNode): Machine | undefined {
        let current: AstNode | undefined = node;
        while (current && !('imports' in current)) {
            current = current.$container;
        }
        return current as Machine;
    }
}

/**
 * Linking phase manager for multi-file projects
 */
export class LinkingPhaseManager {
    /**
     * Execute multi-file linking in phases:
     * 1. Parse all files
     * 2. Resolve imports
     * 3. Link cross-file references
     * 4. Link internal references
     */
    async executeLinking(
        workspaceManager: WorkspaceManager,
        linker: MultiFileLinker
    ): Promise<void> {
        // Phase 1: Ensure all documents are parsed
        const modules = workspaceManager.getAllModules();
        for (const module of modules) {
            if (module.document.state < 2) { // DocumentState.Parsed
                await module.document.parseDocument();
            }
        }

        // Phase 2: Build dependency graph (already done by workspace manager)
        const orderedDocs = workspaceManager.getDocumentsInOrder();
        if (!orderedDocs) {
            throw new Error('Circular dependencies detected');
        }

        // Phase 3 & 4: Link in dependency order
        for (const doc of orderedDocs) {
            if (doc.state < 4) { // DocumentState.Linked
                // Trigger linking
                doc.references?.forEach(ref => {
                    if (!ref.ref) {
                        linker.getCandidate(ref);
                    }
                });
            }
        }
    }
}
