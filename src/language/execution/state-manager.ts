/**
 * State Manager - Phase 3
 *
 * Provides state management features:
 * - Checkpoint/restore execution state
 * - Execution replay from checkpoint
 * - State serialization/deserialization
 */

import type { ExecutionPath } from './types.js';
import type { MachineJSON as MachineData } from '../json/types.js';

/**
 * Execution checkpoint
 */
export interface ExecutionCheckpoint {
    id: string;
    timestamp: string;
    machineData: MachineData;
    paths: ExecutionPath[];
    sharedContext: Record<string, any>;
    metadata: {
        stepCount: number;
        description?: string;
    };
}

/**
 * State Manager
 *
 * Manages execution state checkpoints and replay
 */
export class StateManager {
    private checkpoints: Map<string, ExecutionCheckpoint> = new Map();
    private maxCheckpoints: number;

    constructor(maxCheckpoints: number = 100) {
        this.maxCheckpoints = maxCheckpoints;
    }

    /**
     * Create a checkpoint of current execution state
     */
    createCheckpoint(
        machineData: MachineData,
        paths: ExecutionPath[],
        sharedContext: Record<string, any>,
        stepCount: number,
        description?: string
    ): string {
        const id = this.generateCheckpointId();

        // Deep clone to prevent mutations
        const checkpoint: ExecutionCheckpoint = {
            id,
            timestamp: new Date().toISOString(),
            machineData: JSON.parse(JSON.stringify(machineData)),
            paths: JSON.parse(JSON.stringify(paths)),
            sharedContext: JSON.parse(JSON.stringify(sharedContext)),
            metadata: {
                stepCount,
                description
            }
        };

        this.checkpoints.set(id, checkpoint);

        // Enforce max checkpoints (FIFO)
        if (this.checkpoints.size > this.maxCheckpoints) {
            const firstKey = this.checkpoints.keys().next().value;
            this.checkpoints.delete(firstKey);
        }

        console.log(`📸 Checkpoint created: ${id} (step ${stepCount})`);
        return id;
    }

    /**
     * Restore execution state from checkpoint
     */
    restoreCheckpoint(checkpointId: string): ExecutionCheckpoint | null {
        const checkpoint = this.checkpoints.get(checkpointId);

        if (!checkpoint) {
            console.warn(`⚠️ Checkpoint not found: ${checkpointId}`);
            return null;
        }

        console.log(`🔄 Restoring checkpoint: ${checkpointId} from ${checkpoint.timestamp}`);

        // Return deep clone to prevent mutations
        return JSON.parse(JSON.stringify(checkpoint));
    }

    /**
     * Get checkpoint metadata without full state
     */
    getCheckpointMetadata(checkpointId: string): Pick<ExecutionCheckpoint, 'id' | 'timestamp' | 'metadata'> | null {
        const checkpoint = this.checkpoints.get(checkpointId);

        if (!checkpoint) {
            return null;
        }

        return {
            id: checkpoint.id,
            timestamp: checkpoint.timestamp,
            metadata: checkpoint.metadata
        };
    }

    /**
     * List all checkpoints
     */
    listCheckpoints(): Array<Pick<ExecutionCheckpoint, 'id' | 'timestamp' | 'metadata'>> {
        return Array.from(this.checkpoints.values()).map(cp => ({
            id: cp.id,
            timestamp: cp.timestamp,
            metadata: cp.metadata
        }));
    }

    /**
     * Delete a checkpoint
     */
    deleteCheckpoint(checkpointId: string): boolean {
        const deleted = this.checkpoints.delete(checkpointId);

        if (deleted) {
            console.log(`🗑️ Checkpoint deleted: ${checkpointId}`);
        }

        return deleted;
    }

    /**
     * Clear all checkpoints
     */
    clearCheckpoints(): void {
        this.checkpoints.clear();
        console.log('🗑️ All checkpoints cleared');
    }

    /**
     * Serialize checkpoint to JSON string
     */
    serializeCheckpoint(checkpointId: string): string | null {
        const checkpoint = this.checkpoints.get(checkpointId);

        if (!checkpoint) {
            return null;
        }

        return JSON.stringify(checkpoint, null, 2);
    }

    /**
     * Deserialize checkpoint from JSON string
     */
    deserializeCheckpoint(json: string): string | null {
        try {
            const checkpoint: ExecutionCheckpoint = JSON.parse(json);

            // Validate checkpoint structure
            if (!checkpoint.id || !checkpoint.timestamp || !checkpoint.machineData ||
                !checkpoint.paths || !checkpoint.sharedContext) {
                throw new Error('Invalid checkpoint structure');
            }

            this.checkpoints.set(checkpoint.id, checkpoint);
            console.log(`📥 Checkpoint imported: ${checkpoint.id}`);

            return checkpoint.id;
        } catch (error) {
            console.error('Failed to deserialize checkpoint:', error);
            return null;
        }
    }

    /**
     * Export all checkpoints to JSON
     */
    exportAllCheckpoints(): string {
        const checkpointsArray = Array.from(this.checkpoints.values());
        return JSON.stringify(checkpointsArray, null, 2);
    }

    /**
     * Import checkpoints from JSON
     */
    importCheckpoints(json: string): number {
        try {
            const checkpointsArray: ExecutionCheckpoint[] = JSON.parse(json);

            if (!Array.isArray(checkpointsArray)) {
                throw new Error('Expected array of checkpoints');
            }

            let importedCount = 0;
            for (const checkpoint of checkpointsArray) {
                if (checkpoint.id && checkpoint.timestamp && checkpoint.machineData) {
                    this.checkpoints.set(checkpoint.id, checkpoint);
                    importedCount++;
                }
            }

            console.log(`📥 Imported ${importedCount} checkpoints`);
            return importedCount;
        } catch (error) {
            console.error('Failed to import checkpoints:', error);
            return 0;
        }
    }

    /**
     * Create a checkpoint diff (compare two checkpoints)
     */
    compareCheckpoints(checkpointId1: string, checkpointId2: string): {
        pathChanges: string[];
        contextChanges: string[];
        stepDifference: number;
    } | null {
        const cp1 = this.checkpoints.get(checkpointId1);
        const cp2 = this.checkpoints.get(checkpointId2);

        if (!cp1 || !cp2) {
            return null;
        }

        const pathChanges: string[] = [];
        const contextChanges: string[] = [];

        // Compare paths
        if (cp1.paths.length !== cp2.paths.length) {
            pathChanges.push(`Path count changed: ${cp1.paths.length} -> ${cp2.paths.length}`);
        }

        // Compare shared context
        const keys1 = Object.keys(cp1.sharedContext);
        const keys2 = Object.keys(cp2.sharedContext);

        for (const key of new Set([...keys1, ...keys2])) {
            const val1 = JSON.stringify(cp1.sharedContext[key]);
            const val2 = JSON.stringify(cp2.sharedContext[key]);

            if (val1 !== val2) {
                contextChanges.push(`${key}: ${val1} -> ${val2}`);
            }
        }

        return {
            pathChanges,
            contextChanges,
            stepDifference: cp2.metadata.stepCount - cp1.metadata.stepCount
        };
    }

    /**
     * Generate unique checkpoint ID
     */
    private generateCheckpointId(): string {
        return `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get statistics about checkpoints
     */
    getStats(): {
        totalCheckpoints: number;
        oldestCheckpoint?: string;
        newestCheckpoint?: string;
        totalSize: number;
    } {
        const checkpoints = Array.from(this.checkpoints.values());

        if (checkpoints.length === 0) {
            return {
                totalCheckpoints: 0,
                totalSize: 0
            };
        }

        // Sort by timestamp
        checkpoints.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Estimate size
        const totalSize = JSON.stringify(checkpoints).length;

        return {
            totalCheckpoints: checkpoints.length,
            oldestCheckpoint: checkpoints[0].id,
            newestCheckpoint: checkpoints[checkpoints.length - 1].id,
            totalSize
        };
    }
}
