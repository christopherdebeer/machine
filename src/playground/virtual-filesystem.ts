/**
 * Virtual File System for Playground
 *
 * Provides an in-memory file system for the browser-based playground
 * with localStorage persistence.
 */

export interface VirtualFile {
    path: string;
    content: string;
    lastModified: number;
}

export class VirtualFileSystem {
    private files = new Map<string, VirtualFile>();
    private readonly storageKey: string;

    constructor(storageKey: string = 'dygram-vfs') {
        this.storageKey = storageKey;
    }

    /**
     * Read a file from the virtual filesystem
     */
    readFile(path: string): string | undefined {
        const file = this.files.get(this.normalizePath(path));
        return file?.content;
    }

    /**
     * Write a file to the virtual filesystem
     */
    writeFile(path: string, content: string): void {
        const normalizedPath = this.normalizePath(path);
        this.files.set(normalizedPath, {
            path: normalizedPath,
            content,
            lastModified: Date.now()
        });
    }

    /**
     * Delete a file from the virtual filesystem
     */
    deleteFile(path: string): boolean {
        return this.files.delete(this.normalizePath(path));
    }

    /**
     * Check if a file exists
     */
    exists(path: string): boolean {
        return this.files.has(this.normalizePath(path));
    }

    /**
     * List all files in a directory
     */
    listFiles(directory: string = '/'): string[] {
        const normalizedDir = this.normalizePath(directory);
        const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/';

        const files: string[] = [];

        for (const path of this.files.keys()) {
            if (directory === '/' || path.startsWith(dirWithSlash)) {
                const relativePath = directory === '/' ? path : path.slice(dirWithSlash.length);
                // Only include direct children (not nested in subdirectories)
                if (!relativePath.includes('/') || relativePath.endsWith('/')) {
                    files.push(path);
                }
            }
        }

        return files.sort();
    }

    /**
     * List all directories in a directory
     */
    listDirectories(directory: string = '/'): string[] {
        const normalizedDir = this.normalizePath(directory);
        const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/';

        const directories = new Set<string>();

        for (const path of this.files.keys()) {
            if (path.startsWith(dirWithSlash)) {
                const relativePath = path.slice(dirWithSlash.length);
                const slashIndex = relativePath.indexOf('/');
                if (slashIndex !== -1) {
                    const subdir = dirWithSlash + relativePath.slice(0, slashIndex);
                    directories.add(subdir);
                }
            }
        }

        return Array.from(directories).sort();
    }

    /**
     * Get all files in the filesystem
     */
    getAllFiles(): VirtualFile[] {
        return Array.from(this.files.values());
    }

    /**
     * Get file metadata
     */
    getFileInfo(path: string): VirtualFile | undefined {
        return this.files.get(this.normalizePath(path));
    }

    /**
     * Clear all files from the filesystem
     */
    clear(): void {
        this.files.clear();
    }

    /**
     * Get the number of files in the filesystem
     */
    get size(): number {
        return this.files.size;
    }

    /**
     * Normalize a file path
     */
    private normalizePath(path: string): string {
        // Remove vfs:// protocol if present
        let normalized = path.replace(/^vfs:\/\//, '');

        // Ensure path starts with /
        if (!normalized.startsWith('/')) {
            normalized = '/' + normalized;
        }

        // Remove trailing slashes except for root
        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }

        // Resolve . and .. segments
        const segments = normalized.split('/').filter(s => s.length > 0);
        const resolved: string[] = [];

        for (const segment of segments) {
            if (segment === '.') {
                continue;
            } else if (segment === '..') {
                if (resolved.length > 0) {
                    resolved.pop();
                }
            } else {
                resolved.push(segment);
            }
        }

        return '/' + resolved.join('/');
    }

    /**
     * Resolve a relative path from a base path
     */
    resolvePath(fromPath: string, toPath: string): string {
        // If toPath is absolute, return it normalized
        if (toPath.startsWith('/')) {
            return this.normalizePath(toPath);
        }

        // Get directory of fromPath
        const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/'));

        // Combine and normalize
        return this.normalizePath(fromDir + '/' + toPath);
    }

    /**
     * Save the filesystem to localStorage
     */
    saveToLocalStorage(): void {
        try {
            const data = {
                version: 1,
                files: Array.from(this.files.entries()).map(([path, file]) => ({
                    path,
                    content: file.content,
                    lastModified: file.lastModified
                }))
            };
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }

    /**
     * Load the filesystem from localStorage
     */
    loadFromLocalStorage(): boolean {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) {
                return false;
            }

            const parsed = JSON.parse(data);

            // Handle version 1 format
            if (parsed.version === 1 && Array.isArray(parsed.files)) {
                this.files.clear();
                for (const file of parsed.files) {
                    this.files.set(file.path, {
                        path: file.path,
                        content: file.content,
                        lastModified: file.lastModified || Date.now()
                    });
                }
                return true;
            }

            // Handle legacy format (array of [path, content] tuples)
            if (Array.isArray(parsed)) {
                this.files.clear();
                for (const [path, content] of parsed) {
                    this.files.set(path, {
                        path,
                        content,
                        lastModified: Date.now()
                    });
                }
                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            return false;
        }
    }

    /**
     * Import files from a plain object
     */
    importFiles(files: Record<string, string>): void {
        for (const [path, content] of Object.entries(files)) {
            this.writeFile(path, content);
        }
    }

    /**
     * Export files as a plain object
     */
    exportFiles(): Record<string, string> {
        const result: Record<string, string> = {};
        for (const [path, file] of this.files) {
            result[path] = file.content;
        }
        return result;
    }
}
