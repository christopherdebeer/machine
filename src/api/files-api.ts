/**
 * API client for file operations
 * Handles communication with the backend file API
 */

export interface FileInfo {
    name: string;
    path: string;
    category: string;
    filename: string;
}

export interface FilesListResponse {
    workingDir: string;
    files: FileInfo[];
    count: number;
}

export interface FileReadResponse {
    path: string;
    content: string;
}

/**
 * Check if the file API is available
 */
export async function isFileApiAvailable(): Promise<boolean> {
    try {
        const response = await fetch('/api/files/list', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

/**
 * List files from the API
 */
export async function listFiles(dir?: string): Promise<FilesListResponse> {
    const url = new URL('/api/files/list', window.location.origin);
    if (dir) {
        url.searchParams.set('dir', dir);
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Read a file from the API
 */
export async function readFile(filePath: string, dir?: string): Promise<string> {
    const url = new URL('/api/files/read', window.location.origin);
    url.searchParams.set('file', filePath);
    if (dir) {
        url.searchParams.set('dir', dir);
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/plain' }
    });

    if (!response.ok) {
        throw new Error(`Failed to read file: ${response.status} ${response.statusText}`);
    }

    // Check if response is JSON (server might return JSON even with text/plain accept header)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        const json: FileReadResponse = await response.json();
        return json.content;
    }

    return response.text();
}

/**
 * Write a file via the API (local mode only)
 */
export async function writeFile(filePath: string, content: string, dir?: string): Promise<void> {
    const response = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file: filePath,
            content,
            dir
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to write file');
    }
}
