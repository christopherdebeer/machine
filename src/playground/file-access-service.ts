/**
 * File Access Service
 *
 * Provides a unified interface for file operations that prefers API access
 * but falls back to VirtualFileSystem when API is unavailable.
 */

import { VirtualFileSystem, type VirtualFile } from './virtual-filesystem.js'
import { isFileApiAvailable, listFiles, readFile as readFileApi, writeFile as writeFileApi, type FileInfo } from '../api/files-api.js'

export interface FileAccessFile {
    path: string;
    content: string;
    name: string;
    category?: string;
    source: 'api' | 'vfs';
}

export interface FileAccessOptions {
    workingDir?: string;
    preferApi?: boolean;
}

export class FileAccessService {
    private vfs: VirtualFileSystem;
    private apiAvailable: boolean | null = null;
    private workingDir: string;

    constructor(vfs: VirtualFileSystem, options: FileAccessOptions = {}) {
        this.vfs = vfs;
        this.workingDir = options.workingDir || 'examples';
    }

    /**
     * Check if the file API is available
     */
    async checkApiAvailability(): Promise<boolean> {
        if (this.apiAvailable === null) {
            this.apiAvailable = await isFileApiAvailable();
        }
        return this.apiAvailable;
    }

    /**
     * Force refresh API availability check
     */
    async refreshApiAvailability(): Promise<boolean> {
        this.apiAvailable = await isFileApiAvailable();
        return this.apiAvailable;
    }

    /**
     * Read a file - tries API first, falls back to VFS
     */
    async readFile(path: string): Promise<string | undefined> {
        const apiAvailable = await this.checkApiAvailability();

        if (apiAvailable) {
            try {
                const content = await readFileApi(path, this.workingDir);
                return content;
            } catch (error) {
                console.warn('Failed to read from API, falling back to VFS:', error);
            }
        }

        // Fallback to VFS
        return this.vfs.readFile(path);
    }

    /**
     * Write a file - writes to both API and VFS when possible
     */
    async writeFile(path: string, content: string): Promise<void> {
        // Always write to VFS
        this.vfs.writeFile(path, content);
        this.vfs.saveToLocalStorage();

        // Try to write to API if available
        const apiAvailable = await this.checkApiAvailability();
        if (apiAvailable) {
            try {
                await writeFileApi(path, content, this.workingDir);
            } catch (error) {
                console.warn('Failed to write to API (write-protected or unavailable):', error);
                // Not a critical error - VFS write succeeded
            }
        }
    }

    /**
     * Delete a file from VFS (API files are read-only)
     */
    deleteFile(path: string): boolean {
        const result = this.vfs.deleteFile(path);
        if (result) {
            this.vfs.saveToLocalStorage();
        }
        return result;
    }

    /**
     * List all files - combines API and VFS files
     */
    async listAllFiles(): Promise<FileAccessFile[]> {
        const files: FileAccessFile[] = [];
        const apiAvailable = await this.checkApiAvailability();

        // Get files from API
        if (apiAvailable) {
            try {
                const response = await listFiles(this.workingDir);
                for (const fileInfo of response.files) {
                    files.push({
                        path: fileInfo.path,
                        content: '', // Content loaded on demand
                        name: fileInfo.name,
                        category: fileInfo.category,
                        source: 'api'
                    });
                }
            } catch (error) {
                console.warn('Failed to list files from API:', error);
            }
        }

        // Get files from VFS
        const vfsFiles = this.vfs.getAllFiles();
        for (const vfsFile of vfsFiles) {
            // Don't duplicate if already in API files
            const existsInApi = files.some(f => f.path === vfsFile.path);
            if (!existsInApi) {
                const pathParts = vfsFile.path.split('/').filter(p => p.length > 0);
                const filename = pathParts[pathParts.length - 1];
                const name = filename.replace(/\.(dygram|mach)$/, '')
                    .split('-')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');

                files.push({
                    path: vfsFile.path,
                    content: vfsFile.content,
                    name,
                    category: pathParts.length > 1 ? pathParts[0] : 'root',
                    source: 'vfs'
                });
            }
        }

        return files;
    }

    /**
     * Load import examples from API if available, otherwise use VFS
     */
    async loadImportExamples(): Promise<FileAccessFile[]> {
        const apiAvailable = await this.checkApiAvailability();

        if (apiAvailable) {
            try {
                // Try to load from examples/imports/ directory via API
                const response = await listFiles('examples');
                const importFiles = response.files.filter(f =>
                    f.category === 'imports' || f.path.includes('/imports/')
                );

                if (importFiles.length > 0) {
                    return importFiles.map(f => ({
                        path: f.path,
                        content: '', // Loaded on demand
                        name: f.name,
                        category: 'imports',
                        source: 'api' as const
                    }));
                }
            } catch (error) {
                console.warn('Failed to load import examples from API:', error);
            }
        }

        // Fallback: return VFS files in /imports/ or root
        const vfsFiles = this.vfs.getAllFiles().filter(f =>
            f.path.startsWith('/imports/') || f.path.startsWith('/')
        );

        return vfsFiles.map(f => {
            const pathParts = f.path.split('/').filter(p => p.length > 0);
            const filename = pathParts[pathParts.length - 1];
            const name = filename.replace(/\.(dygram|mach)$/, '')
                .split('-')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');

            return {
                path: f.path,
                content: f.content,
                name,
                category: 'imports',
                source: 'vfs' as const
            };
        });
    }

    /**
     * Check if a file exists (checks both API and VFS)
     */
    async exists(path: string): Promise<boolean> {
        // Check VFS first (faster)
        if (this.vfs.exists(path)) {
            return true;
        }

        // Check API
        const apiAvailable = await this.checkApiAvailability();
        if (apiAvailable) {
            try {
                await readFileApi(path, this.workingDir);
                return true;
            } catch {
                return false;
            }
        }

        return false;
    }

    /**
     * Get the VirtualFileSystem instance for direct access
     */
    getVFS(): VirtualFileSystem {
        return this.vfs;
    }

    /**
     * Get API availability status
     */
    isApiAvailable(): boolean | null {
        return this.apiAvailable;
    }

    /**
     * Get working directory
     */
    getWorkingDir(): string {
        return this.workingDir;
    }

    /**
     * Set working directory
     */
    setWorkingDir(dir: string): void {
        this.workingDir = dir;
    }
}
