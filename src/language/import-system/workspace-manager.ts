/**
 * Workspace Manager for Multi-File DyGram Projects
 *
 * Manages a collection of DyGram documents and their dependencies
 */

import { URI, LangiumDocument, LangiumDocuments, DocumentState } from 'langium';
import { DependencyGraph } from './dependency-graph.js';
import { ModuleResolver } from './module-resolver.js';
import { ImportStatement, Machine } from '../generated/ast.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Information about a module in the workspace
 */
export interface ModuleInfo {
    /** URI of the module */
    uri: URI;
    /** Langium document */
    document: LangiumDocument<Machine>;
    /** Import statements in this module */
    imports: ImportStatement[];
    /** URIs of directly imported modules */
    dependencies: URI[];
}

/**
 * Workspace manager for handling multi-file DyGram projects
 */
export class WorkspaceManager {
    private graph: DependencyGraph = new DependencyGraph();
    private modules: Map<string, ModuleInfo> = new Map();

    constructor(
        private readonly documents: LangiumDocuments,
        private readonly resolver: ModuleResolver
    ) {}

    /**
     * Add a document to the workspace
     */
    async addDocument(document: LangiumDocument<Machine>): Promise<void> {
        const uri = document.uri;
        const uriStr = uri.toString();

        // Parse the document if needed
        if (document.state < DocumentState.Parsed) {
            await document.parseDocument();
        }

        // Extract imports
        const machine = document.parseResult.value;
        const imports = machine.imports || [];

        // Resolve dependencies
        const dependencies: URI[] = [];
        for (const importStmt of imports) {
            const resolved = await this.resolver.resolve(importStmt.path, uri);
            if (resolved) {
                dependencies.push(resolved.uri);
            }
        }

        // Create module info
        const moduleInfo: ModuleInfo = {
            uri,
            document,
            imports,
            dependencies
        };

        // Add to modules map
        this.modules.set(uriStr, moduleInfo);

        // Update dependency graph
        this.graph.addModule(uri);
        for (const dep of dependencies) {
            this.graph.addDependency(uri, dep);
        }
    }

    /**
     * Remove a document from the workspace
     */
    removeDocument(uri: URI): void {
        const uriStr = uri.toString();
        this.modules.delete(uriStr);
        this.graph.removeModule(uri);
    }

    /**
     * Update a document in the workspace
     */
    async updateDocument(document: LangiumDocument<Machine>): Promise<void> {
        // Remove old version
        this.removeDocument(document.uri);
        // Add new version
        await this.addDocument(document);
    }

    /**
     * Get module info for a document
     */
    getModuleInfo(uri: URI): ModuleInfo | undefined {
        return this.modules.get(uri.toString());
    }

    /**
     * Get all modules in the workspace
     */
    getAllModules(): ModuleInfo[] {
        return Array.from(this.modules.values());
    }

    /**
     * Get documents in dependency order (dependencies before dependents)
     * Returns null if circular dependencies exist
     */
    getDocumentsInOrder(): LangiumDocument<Machine>[] | null {
        const sorted = this.graph.topologicalSort();
        if (!sorted) {
            return null;
        }

        return sorted
            .map(uri => this.modules.get(uri.toString()))
            .filter((info): info is ModuleInfo => info !== undefined)
            .map(info => info.document);
    }

    /**
     * Get the dependency graph
     */
    getDependencyGraph(): DependencyGraph {
        return this.graph;
    }

    /**
     * Check if there are circular dependencies
     */
    hasCircularDependencies(): boolean {
        return this.graph.detectCycles().length > 0;
    }

    /**
     * Get circular dependencies
     */
    getCircularDependencies(): Array<{ cycle: string[] }> {
        return this.graph.detectCycles();
    }

    /**
     * Get all dependencies of a module (direct and transitive)
     */
    getAllDependencies(uri: URI): URI[] {
        const visited = new Set<string>();
        const result: URI[] = [];

        const visit = (currentUri: URI) => {
            const uriStr = currentUri.toString();
            if (visited.has(uriStr)) {
                return;
            }
            visited.add(uriStr);

            const deps = this.graph.getDependencies(currentUri);
            for (const dep of deps) {
                result.push(dep);
                visit(dep);
            }
        };

        visit(uri);
        return result;
    }

    /**
     * Clear the workspace
     */
    clear(): void {
        this.modules.clear();
        this.graph.clear();
    }

    /**
     * Get the number of modules in the workspace
     */
    get size(): number {
        return this.modules.size;
    }

    /**
     * Load a document and all its dependencies recursively
     */
    async loadDocumentWithDependencies(
        uri: URI,
        loadContent: (uri: URI) => Promise<string>
    ): Promise<void> {
        const uriStr = uri.toString();

        // Skip if already loaded
        if (this.modules.has(uriStr)) {
            return;
        }

        // Load the document content
        const content = await loadContent(uri);

        // Create a text document
        const textDoc = TextDocument.create(uriStr, 'dygram', 1, content);

        // Get or create a Langium document
        let document = this.documents.getDocument(uri);
        if (!document) {
            // Create a new document
            document = this.documents.createDocument(uri, textDoc);
        }

        // Add to workspace
        await this.addDocument(document as LangiumDocument<Machine>);

        // Load dependencies recursively
        const moduleInfo = this.modules.get(uriStr);
        if (moduleInfo) {
            for (const dep of moduleInfo.dependencies) {
                await this.loadDocumentWithDependencies(dep, loadContent);
            }
        }
    }
}
