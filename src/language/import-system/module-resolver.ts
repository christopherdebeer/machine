/**
 * Module Resolution Layer for DyGram Import System
 *
 * Provides interfaces and implementations for resolving module paths
 * across different contexts (filesystem, URLs, virtual filesystem)
 */

import { URI } from 'langium';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Result of module resolution
 */
export interface ResolvedModule {
    /** Canonical URI of the resolved module */
    uri: URI;
    /** Original import path from the import statement */
    importPath: string;
    /** Resolved absolute path or URL */
    resolvedPath: string;
    /** Module content (if already loaded) */
    content?: string;
}

/**
 * Base interface for module resolvers
 */
export interface ModuleResolver {
    /**
     * Check if this resolver can handle the given import path
     * @param importPath The path from the import statement
     * @param fromUri The URI of the file containing the import
     */
    canResolve(importPath: string, fromUri: URI): boolean;

    /**
     * Resolve an import path to a module URI
     * @param importPath The path from the import statement
     * @param fromUri The URI of the file containing the import
     * @returns Resolved module information or undefined if not found
     */
    resolve(importPath: string, fromUri: URI): Promise<ResolvedModule | undefined>;
}

/**
 * Filesystem-based module resolver
 * Handles relative paths (./file, ../file) and resolves .dygram extensions
 */
export class FileSystemResolver implements ModuleResolver {
    constructor(
        private readonly extensions: string[] = ['.dygram', '.mach']
    ) {}

    canResolve(importPath: string, fromUri: URI): boolean {
        // Handle relative paths starting with ./ or ../
        return importPath.startsWith('./') || importPath.startsWith('../');
    }

    async resolve(importPath: string, fromUri: URI): Promise<ResolvedModule | undefined> {
        // Get the directory of the importing file
        const fromPath = URI.parse(fromUri.toString()).fsPath;
        const fromDir = path.dirname(fromPath);

        // Try the path as-is first
        let resolvedPath = path.resolve(fromDir, importPath);

        // If no extension, try adding supported extensions
        if (!path.extname(importPath)) {
            for (const ext of this.extensions) {
                const pathWithExt = resolvedPath + ext;
                if (fs.existsSync(pathWithExt)) {
                    resolvedPath = pathWithExt;
                    break;
                }
            }
        }

        // Check if the resolved path exists
        if (!fs.existsSync(resolvedPath)) {
            return undefined;
        }

        // Read the file content
        const content = fs.readFileSync(resolvedPath, 'utf-8');

        return {
            uri: URI.file(resolvedPath),
            importPath,
            resolvedPath,
            content
        };
    }
}

/**
 * URL-based module resolver
 * Handles HTTP/HTTPS URLs for remote imports
 */
export class URLResolver implements ModuleResolver {
    private cache: Map<string, ResolvedModule> = new Map();

    canResolve(importPath: string, fromUri: URI): boolean {
        return importPath.startsWith('http://') || importPath.startsWith('https://');
    }

    async resolve(importPath: string, fromUri: URI): Promise<ResolvedModule | undefined> {
        // Check cache first
        if (this.cache.has(importPath)) {
            return this.cache.get(importPath);
        }

        try {
            // Fetch the module content
            const response = await fetch(importPath);
            if (!response.ok) {
                return undefined;
            }

            const content = await response.text();
            const resolved: ResolvedModule = {
                uri: URI.parse(importPath),
                importPath,
                resolvedPath: importPath,
                content
            };

            // Cache the result
            this.cache.set(importPath, resolved);
            return resolved;
        } catch (error) {
            // Failed to fetch
            return undefined;
        }
    }

    /**
     * Clear the cache for a specific URL or all URLs
     */
    clearCache(url?: string): void {
        if (url) {
            this.cache.delete(url);
        } else {
            this.cache.clear();
        }
    }
}

/**
 * Virtual filesystem resolver for playground/browser environments
 * Resolves modules from an in-memory file system
 */
export class VirtualFSResolver implements ModuleResolver {
    constructor(
        private readonly virtualFS: Map<string, string>,
        private readonly extensions: string[] = ['.dygram', '.mach']
    ) {}

    canResolve(importPath: string, fromUri: URI): boolean {
        // In virtual FS, we handle relative paths
        return importPath.startsWith('./') || importPath.startsWith('../');
    }

    async resolve(importPath: string, fromUri: URI): Promise<ResolvedModule | undefined> {
        // Get the directory of the importing file
        const fromPath = fromUri.path;
        const fromDir = path.dirname(fromPath);

        // Resolve the relative path
        let resolvedPath = path.posix.resolve(fromDir, importPath);

        // Normalize to forward slashes
        resolvedPath = resolvedPath.replace(/\\/g, '/');

        // Try the path as-is first
        if (this.virtualFS.has(resolvedPath)) {
            return {
                uri: URI.parse(resolvedPath),
                importPath,
                resolvedPath,
                content: this.virtualFS.get(resolvedPath)
            };
        }

        // If no extension, try adding supported extensions
        if (!path.extname(importPath)) {
            for (const ext of this.extensions) {
                const pathWithExt = resolvedPath + ext;
                if (this.virtualFS.has(pathWithExt)) {
                    return {
                        uri: URI.parse(pathWithExt),
                        importPath,
                        resolvedPath: pathWithExt,
                        content: this.virtualFS.get(pathWithExt)
                    };
                }
            }
        }

        return undefined;
    }

    /**
     * Add or update a file in the virtual filesystem
     */
    setFile(path: string, content: string): void {
        this.virtualFS.set(path, content);
    }

    /**
     * Remove a file from the virtual filesystem
     */
    removeFile(path: string): void {
        this.virtualFS.delete(path);
    }

    /**
     * Check if a file exists in the virtual filesystem
     */
    hasFile(path: string): boolean {
        return this.virtualFS.has(path);
    }
}

/**
 * Composite module resolver that tries multiple resolvers in order
 */
export class CompositeModuleResolver implements ModuleResolver {
    constructor(
        private readonly resolvers: ModuleResolver[]
    ) {}

    canResolve(importPath: string, fromUri: URI): boolean {
        return this.resolvers.some(r => r.canResolve(importPath, fromUri));
    }

    async resolve(importPath: string, fromUri: URI): Promise<ResolvedModule | undefined> {
        for (const resolver of this.resolvers) {
            if (resolver.canResolve(importPath, fromUri)) {
                const result = await resolver.resolve(importPath, fromUri);
                if (result) {
                    return result;
                }
            }
        }
        return undefined;
    }

    /**
     * Add a resolver to the chain
     */
    addResolver(resolver: ModuleResolver): void {
        this.resolvers.push(resolver);
    }
}
