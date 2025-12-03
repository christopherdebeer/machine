/**
 * Execution State Management for CLI Interactive Mode
 *
 * Provides persistent state for turn-by-turn execution across separate CLI calls.
 * Each execution is stored in .dygram/executions/<id>/ with state, metadata, and history.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { MachineJSON } from '../language/json/types.js';
import type { TurnState } from '../language/execution/turn-types.js';

/**
 * Execution state file format
 */
export interface ExecutionStateFile {
    version: string;                      // State format version
    machineHash: string;                  // Hash of machine definition
    executionState: {                     // From executor.getExecutionState()
        currentNode: string;
        pathId: string;
        visitedNodes: string[];
        attributes: Record<string, any>;
        contextValues: Record<string, any>;
        turnState?: TurnState;            // If in mid-turn
    };
    status: 'in_progress' | 'complete' | 'error' | 'paused';
    lastUpdated: string;                  // ISO timestamp
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
    id: string;                           // Execution ID
    machineFile?: string;                 // Original machine file path (if from file)
    machineSource: 'file' | 'stdin';      // Source type
    startedAt: string;                    // ISO timestamp
    lastExecutedAt: string;               // ISO timestamp
    turnCount: number;                    // Total turns executed
    stepCount: number;                    // Total steps executed
    status: 'in_progress' | 'complete' | 'error' | 'paused';
    mode: 'interactive' | 'playback' | 'auto';
    nextPathId?: string;                  // For --step-path mode: next path to step (round-robin)
    clientConfig?: {                      // Client configuration
        type: 'playback' | 'interactive' | 'api';
        recordingsDir?: string;
        playbackDir?: string;
    };
}

/**
 * Turn history entry (JSONL format)
 */
export interface TurnHistoryEntry {
    turn: number;
    timestamp: string;
    node: string;
    tools: string[];
    output?: string;
    status: string;
}

/**
 * Options for loading or creating execution
 */
export interface LoadExecutionOptions {
    machineSource: string;       // File path or machine DSL source
    isStdin?: boolean;           // True if source is stdin (not file)
    executionId?: string;        // Explicit ID, or undefined for "last"
    playback?: string;           // Playback directory
    record?: string;             // Recording directory
    force?: boolean;             // Force new execution even if state exists
    isInteractive?: boolean;     // Interactive mode with stdin/stdout
    input?: any;                 // Input data for this turn (LLM response)
}

/**
 * State directory configuration
 */
export const STATE_CONFIG = {
    baseDir: '.dygram',
    executionsDir: 'executions',
    lastSymlink: 'last',
    stateFileName: 'state.json',
    metadataFileName: 'metadata.json',
    machineFileName: 'machine.json',
    historyFileName: 'history.jsonl',
    stateVersion: '1.0'
};

/**
 * Get the base state directory path
 */
export function getStateBaseDir(): string {
    return path.join(process.cwd(), STATE_CONFIG.baseDir, STATE_CONFIG.executionsDir);
}

/**
 * Get execution directory path
 */
export function getExecutionDir(executionId: string): string {
    return path.join(getStateBaseDir(), executionId);
}

/**
 * Generate a unique execution ID
 */
export function generateExecutionId(): string {
    const timestamp = new Date().toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, '')
        .replace('T', '-');
    return `exec-${timestamp}`;
}

/**
 * Generate hash of machine definition for validation
 */
export function hashMachine(machineData: MachineJSON): string {
    const json = JSON.stringify(machineData, Object.keys(machineData).sort());
    return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Get the "last" execution ID from symlink
 */
export async function getLastExecutionId(): Promise<string | null> {
    const baseDir = getStateBaseDir();
    const lastLink = path.join(baseDir, STATE_CONFIG.lastSymlink);

    try {
        const stats = await fs.lstat(lastLink);
        if (stats.isSymbolicLink()) {
            const target = await fs.readlink(lastLink);
            return path.basename(target);
        }
    } catch (error) {
        // Symlink doesn't exist
    }

    return null;
}

/**
 * Update the "last" symlink to point to an execution
 */
export async function updateLastSymlink(executionId: string): Promise<void> {
    const baseDir = getStateBaseDir();
    const lastLink = path.join(baseDir, STATE_CONFIG.lastSymlink);

    // Remove existing symlink
    try {
        await fs.unlink(lastLink);
    } catch {
        // Doesn't exist, that's fine
    }

    // Create new symlink
    await fs.symlink(executionId, lastLink);
}

/**
 * Check if execution exists
 */
export async function executionExists(executionId: string): Promise<boolean> {
    const execDir = getExecutionDir(executionId);
    const stateFile = path.join(execDir, STATE_CONFIG.stateFileName);

    try {
        await fs.access(stateFile);
        return true;
    } catch {
        return false;
    }
}

/**
 * Load execution state from file
 */
export async function loadExecutionState(executionId: string): Promise<ExecutionStateFile> {
    const execDir = getExecutionDir(executionId);
    const stateFile = path.join(execDir, STATE_CONFIG.stateFileName);

    const content = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(content);
}

/**
 * Save execution state to file
 */
export async function saveExecutionState(
    executionId: string,
    state: ExecutionStateFile
): Promise<void> {
    const execDir = getExecutionDir(executionId);
    const stateFile = path.join(execDir, STATE_CONFIG.stateFileName);

    await fs.mkdir(execDir, { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Load execution metadata from file
 */
export async function loadExecutionMetadata(executionId: string): Promise<ExecutionMetadata> {
    const execDir = getExecutionDir(executionId);
    const metadataFile = path.join(execDir, STATE_CONFIG.metadataFileName);

    const content = await fs.readFile(metadataFile, 'utf-8');
    return JSON.parse(content);
}

/**
 * Save execution metadata to file
 */
export async function saveExecutionMetadata(
    executionId: string,
    metadata: ExecutionMetadata
): Promise<void> {
    const execDir = getExecutionDir(executionId);
    const metadataFile = path.join(execDir, STATE_CONFIG.metadataFileName);

    await fs.mkdir(execDir, { recursive: true });
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
}

/**
 * Save machine snapshot to file
 */
export async function saveMachineSnapshot(
    executionId: string,
    machineData: MachineJSON
): Promise<void> {
    const execDir = getExecutionDir(executionId);
    const machineFile = path.join(execDir, STATE_CONFIG.machineFileName);

    await fs.mkdir(execDir, { recursive: true });
    await fs.writeFile(machineFile, JSON.stringify(machineData, null, 2));
}

/**
 * Load machine snapshot from file
 */
export async function loadMachineSnapshot(executionId: string): Promise<MachineJSON> {
    const execDir = getExecutionDir(executionId);
    const machineFile = path.join(execDir, STATE_CONFIG.machineFileName);

    const content = await fs.readFile(machineFile, 'utf-8');
    return JSON.parse(content);
}

/**
 * Append entry to turn history (JSONL format)
 */
export async function appendTurnHistory(
    executionId: string,
    entry: TurnHistoryEntry
): Promise<void> {
    const execDir = getExecutionDir(executionId);
    const historyFile = path.join(execDir, STATE_CONFIG.historyFileName);

    await fs.mkdir(execDir, { recursive: true });
    await fs.appendFile(historyFile, JSON.stringify(entry) + '\n');
}

/**
 * Load turn history
 */
export async function loadTurnHistory(executionId: string): Promise<TurnHistoryEntry[]> {
    const execDir = getExecutionDir(executionId);
    const historyFile = path.join(execDir, STATE_CONFIG.historyFileName);

    try {
        const content = await fs.readFile(historyFile, 'utf-8');
        return content
            .trim()
            .split('\n')
            .filter(line => line.length > 0)
            .map(line => JSON.parse(line));
    } catch {
        return [];
    }
}

/**
 * List all executions
 */
export async function listExecutions(): Promise<ExecutionMetadata[]> {
    const baseDir = getStateBaseDir();

    try {
        const entries = await fs.readdir(baseDir);
        const executions: ExecutionMetadata[] = [];

        for (const entry of entries) {
            if (entry === STATE_CONFIG.lastSymlink) continue;

            try {
                const metadata = await loadExecutionMetadata(entry);
                executions.push(metadata);
            } catch {
                // Skip invalid executions
            }
        }

        // Sort by last executed time (most recent first)
        executions.sort((a, b) =>
            new Date(b.lastExecutedAt).getTime() - new Date(a.lastExecutedAt).getTime()
        );

        return executions;
    } catch {
        return [];
    }
}

/**
 * Remove execution
 */
export async function removeExecution(executionId: string): Promise<void> {
    const execDir = getExecutionDir(executionId);

    // Check if this is the "last" execution
    const lastId = await getLastExecutionId();
    if (lastId === executionId) {
        // Remove last symlink
        const baseDir = getStateBaseDir();
        const lastLink = path.join(baseDir, STATE_CONFIG.lastSymlink);
        try {
            await fs.unlink(lastLink);
        } catch {
            // Already removed
        }
    }

    // Remove execution directory
    await fs.rm(execDir, { recursive: true, force: true });
}

/**
 * Result of cleaning executions
 */
export interface CleanExecutionsResult {
    cleaned: number;    // Successfully removed
    pending: number;    // In progress or paused (not cleaned when --all not provided)
    error: number;      // With error status (not cleaned when --all not provided)
    failed: number;     // Failed to remove
}

/**
 * Clean completed executions
 */
export async function cleanCompletedExecutions(options: { all?: boolean } = {}): Promise<CleanExecutionsResult> {
    const executions = await listExecutions();
    const result: CleanExecutionsResult = {
        cleaned: 0,
        pending: 0,
        error: 0,
        failed: 0
    };

    for (const execution of executions) {
        if (options.all || execution.status === 'complete') {
            try {
                await removeExecution(execution.id);
                result.cleaned++;
            } catch {
                // Failed to remove
                result.failed++;
            }
        } else {
            // Not cleaned - categorize by status
            if (execution.status === 'error') {
                result.error++;
            } else {
                // in_progress or paused
                result.pending++;
            }
        }
    }

    return result;
}
