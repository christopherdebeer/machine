/**
 * API client for recordings operations
 * Handles communication with the backend recordings API
 */

export interface RecordingInfo {
    example: string;
    category: string;
    recordings: string[];
    count: number;
    available: boolean;
    path?: string;
}

export interface Recording {
    request: {
        type: 'llm_invocation_request';
        requestId: string;
        timestamp: string;
        context: any;
        messages: any[];
        tools: any[];
        systemPrompt?: string;
    };
    response: {
        type: 'llm_invocation_response';
        requestId: string;
        timestamp: string;
        reasoning?: string;
        response: any;
    };
    recordedAt: string;
}

/**
 * Check if recordings are available for an example
 */
export async function checkRecordingsAvailable(
    exampleName: string,
    category: string
): Promise<boolean> {
    try {
        const info = await listRecordings(exampleName, category);
        return info.available && info.count > 0;
    } catch (error) {
        console.warn('Failed to check recordings availability:', error);
        return false;
    }
}

/**
 * List recordings for an example
 */
export async function listRecordings(
    exampleName: string,
    category: string
): Promise<RecordingInfo> {
    const url = new URL('/api/recordings/list', window.location.origin);
    url.searchParams.set('example', exampleName);
    url.searchParams.set('category', category);

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Failed to list recordings: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Read a specific recording file
 */
export async function readRecording(
    exampleName: string,
    category: string,
    filename: string
): Promise<Recording> {
    const url = new URL('/api/recordings/read', window.location.origin);
    url.searchParams.set('example', exampleName);
    url.searchParams.set('category', category);
    url.searchParams.set('file', filename);

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Failed to read recording: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Load all recordings for an example
 */
export async function loadAllRecordings(
    exampleName: string,
    category: string
): Promise<Recording[]> {
    const info = await listRecordings(exampleName, category);

    if (!info.available || info.count === 0) {
        return [];
    }

    const recordings: Recording[] = [];
    for (const filename of info.recordings) {
        try {
            const recording = await readRecording(exampleName, category, filename);
            recordings.push(recording);
        } catch (error) {
            console.warn(`Failed to load recording ${filename}:`, error);
        }
    }

    return recordings;
}
