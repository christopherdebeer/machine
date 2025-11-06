/**
 * Multi-File Generator
 *
 * Merges multiple DyGram files into a single unified representation
 */

import { Machine, Node, Edge, Attribute, ImportStatement, isNode } from '../generated/ast.js';
import { WorkspaceManager } from './workspace-manager.js';
import { LangiumDocument } from 'langium';

/**
 * Metadata about the source of a merged element
 */
export interface SourceMetadata {
    /** Original file URI */
    sourceFile: string;
    /** Original qualified name (if different from merged name) */
    originalName?: string;
}

/**
 * Result of merging multiple machines
 */
export interface MergedMachine {
    /** The merged machine AST */
    machine: Machine;
    /** Metadata mapping element names to their sources */
    sourceMap: Map<string, SourceMetadata>;
    /** List of all source files included */
    sourceFiles: string[];
}

/**
 * Merges multiple DyGram files into a single machine
 */
export class MultiFileGenerator {
    constructor(private readonly workspaceManager?: WorkspaceManager) {}

    /**
     * Generate merged machine from entry document (convenience method for CLI)
     * @param entryDoc Entry point document
     * @param workspace Workspace manager (overrides constructor workspace)
     */
    async generate(entryDoc: LangiumDocument<Machine>, workspace: WorkspaceManager): Promise<Machine> {
        const generator = new MultiFileGenerator(workspace);
        const merged = await generator.mergeMachines(entryDoc.uri.toString());
        return merged.machine;
    }

    /**
     * Merge all modules in the workspace into a single machine
     */
    async mergeMachines(entryPoint: string): Promise<MergedMachine> {
        if (!this.workspaceManager) {
            throw new Error('WorkspaceManager is required for mergeMachines');
        }

        // Get documents in dependency order
        const orderedDocs = this.workspaceManager.getDocumentsInOrder();
        if (!orderedDocs) {
            throw new Error('Cannot merge machines: circular dependencies detected');
        }

        // Find the entry point document
        const entryDoc = orderedDocs.find(doc =>
            doc.uri.toString().includes(entryPoint) ||
            doc.uri.fsPath === entryPoint
        );

        if (!entryDoc) {
            throw new Error(`Entry point not found: ${entryPoint}`);
        }

        // Create the merged machine starting from entry point
        const entryMachine = entryDoc.parseResult.value;
        const sourceMap = new Map<string, SourceMetadata>();
        const sourceFiles: string[] = [];

        // Start with a copy of the entry point machine
        const merged: Machine = {
            $type: 'Machine',
            title: entryMachine.title,
            annotations: [...(entryMachine.annotations || [])],
            attributes: [...(entryMachine.attributes || [])],
            nodes: [...(entryMachine.nodes || [])],
            edges: [...(entryMachine.edges || [])],
            imports: [] // Clear imports in the merged result
        };

        // Track the entry file
        sourceFiles.push(entryDoc.uri.toString());
        this.recordSources(merged.nodes, entryDoc.uri.toString(), sourceMap);

        // Recursively merge imported modules
        await this.mergeImports(entryMachine, entryDoc, merged, sourceMap, sourceFiles, new Set());

        return {
            machine: merged,
            sourceMap,
            sourceFiles
        };
    }

    /**
     * Recursively merge imports into the target machine
     */
    private async mergeImports(
        sourceMachine: Machine,
        sourceDoc: LangiumDocument<Machine>,
        target: Machine,
        sourceMap: Map<string, SourceMetadata>,
        sourceFiles: string[],
        visited: Set<string>
    ): Promise<void> {
        if (!sourceMachine.imports || sourceMachine.imports.length === 0) {
            return;
        }

        const sourceUri = sourceDoc.uri.toString();
        if (visited.has(sourceUri)) {
            return;
        }
        visited.add(sourceUri);

        // Process each import
        for (const importStmt of sourceMachine.imports) {
            await this.mergeImport(importStmt, sourceDoc, target, sourceMap, sourceFiles, visited);
        }
    }

    /**
     * Merge a single import into the target machine
     */
    private async mergeImport(
        importStmt: ImportStatement,
        sourceDoc: LangiumDocument<Machine>,
        target: Machine,
        sourceMap: Map<string, SourceMetadata>,
        sourceFiles: string[],
        visited: Set<string>
    ): Promise<void> {
        // Get the imported module info
        const moduleInfo = this.workspaceManager.getModuleInfo(sourceDoc.uri);
        if (!moduleInfo) {
            return;
        }

        // Find the dependency that matches this import
        const importedUri = moduleInfo.dependencies.find(dep => {
            // This is simplified - in reality we'd need to resolve the import path
            return dep.toString().includes(importStmt.path);
        });

        if (!importedUri) {
            return;
        }

        const importedModuleInfo = this.workspaceManager.getModuleInfo(importedUri);
        if (!importedModuleInfo) {
            return;
        }

        const importedMachine = importedModuleInfo.document.parseResult.value;

        // Track this source file
        if (!sourceFiles.includes(importedUri.toString())) {
            sourceFiles.push(importedUri.toString());
        }

        // Merge each imported symbol
        for (const symbol of importStmt.symbols) {
            const symbolName = symbol.name;
            const alias = symbol.alias || this.getShortName(symbolName);

            // Find the node in the imported machine
            const node = this.findNodeInMachine(importedMachine, symbolName);
            if (node) {
                // Clone the node and add it to the target
                const clonedNode = this.cloneNode(node);

                // Rename if aliased
                if (symbol.alias) {
                    clonedNode.name = symbol.alias;
                }

                target.nodes.push(clonedNode);

                // Record source metadata
                sourceMap.set(alias, {
                    sourceFile: importedUri.toString(),
                    originalName: symbolName !== alias ? symbolName : undefined
                });
            }
        }

        // Recursively merge imports of the imported module
        await this.mergeImports(
            importedMachine,
            importedModuleInfo.document,
            target,
            sourceMap,
            sourceFiles,
            visited
        );
    }

    /**
     * Record source metadata for nodes
     */
    private recordSources(
        nodes: Node[],
        sourceFile: string,
        sourceMap: Map<string, SourceMetadata>
    ): void {
        for (const node of nodes) {
            sourceMap.set(node.name, { sourceFile });

            // Record nested nodes
            if (node.nodes && node.nodes.length > 0) {
                this.recordSources(node.nodes, sourceFile, sourceMap);
            }
        }
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
     * Clone a node (deep copy)
     */
    private cloneNode(node: Node): Node {
        return {
            $type: 'Node',
            $container: undefined as any, // Will be set by Langium
            name: node.name,
            type: node.type,
            title: node.title,
            annotations: node.annotations ? [...node.annotations] : [],
            attributes: node.attributes ? [...node.attributes] : [],
            nodes: node.nodes ? node.nodes.map(n => this.cloneNode(n)) : [],
            edges: node.edges ? [...node.edges] : []
        };
    }

    /**
     * Get short name from qualified name
     */
    private getShortName(qualifiedName: string): string {
        const parts = qualifiedName.split('.');
        return parts[parts.length - 1];
    }
}

/**
 * Helper to create a merged machine JSON representation
 */
export function createMergedMachineJSON(merged: MergedMachine): any {
    const machine = merged.machine;

    return {
        title: machine.title,
        annotations: machine.annotations,
        attributes: machine.attributes,
        nodes: machine.nodes,
        edges: machine.edges,
        _metadata: {
            sourceFiles: merged.sourceFiles,
            entryPoint: merged.sourceFiles[0],
            generatedAt: new Date().toISOString(),
            multiFile: true
        }
    };
}
