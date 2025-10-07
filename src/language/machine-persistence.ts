/**
 * Machine versioning and persistence
 */

import { MachineData, MachineExecutor, MachineMutation } from './machine-executor.js';
import { StorageBackend, MachineVersion, PerformanceMetrics, LearnedPattern } from './storage.js';

export class MachinePersistence {
    private versions: MachineVersion[] = [];
    private storage: StorageBackend;
    private versionCounter: number = 0;

    constructor(storage: StorageBackend) {
        this.storage = storage;
    }

    /**
     * Save current machine state as a new version
     */
    async saveVersion(
        executor: MachineExecutor,
        machineId: string,
        metrics: PerformanceMetrics
    ): Promise<string> {
        this.versionCounter++;
        const version: MachineVersion = {
            version: `v${Date.now()}_${this.versionCounter}`,
            timestamp: new Date().toISOString(),
            machine_data: executor.getMachineDefinition(),
            mutations_since_last: executor.getMutations(),
            performance_metrics: metrics,
            parent_version: this.versions.length > 0
                ? this.versions[this.versions.length - 1].version
                : undefined
        };

        this.versions.push(version);

        // Persist to storage
        await this.storage.saveMachineVersion(`machine_${machineId}_${version.version}`, version);

        return version.version;
    }

    /**
     * Load a specific version
     */
    async loadVersion(machineId: string, versionId: string): Promise<MachineData | null> {
        const version = await this.storage.loadMachineVersion(`machine_${machineId}_${versionId}`);
        return version ? version.machine_data : null;
    }

    /**
     * List all versions for a machine
     */
    async listVersions(machineId: string): Promise<string[]> {
        return await this.storage.listMachineVersions(machineId);
    }

    /**
     * Rollback to a previous version
     */
    async rollback(machineId: string, versionId: string): Promise<MachineData | null> {
        const version = await this.storage.loadMachineVersion(`machine_${machineId}_${versionId}`);

        if (!version) {
            return null;
        }

        // Remove versions after this one from in-memory array
        const index = this.versions.findIndex(v => v.version === versionId);
        if (index !== -1) {
            this.versions = this.versions.slice(0, index + 1);
        }

        return version.machine_data;
    }

    /**
     * Get version history
     */
    getVersionHistory(): MachineVersion[] {
        return [...this.versions];
    }

    /**
     * Save generated code for a task
     */
    async saveGeneratedCode(path: string, code: string): Promise<void> {
        await this.storage.saveCode(path, code);
    }

    /**
     * Load generated code for a task
     */
    async loadGeneratedCode(path: string): Promise<string | null> {
        return await this.storage.loadCode(path);
    }
}

/**
 * Pattern library for reusable learned behaviors
 */
export class PatternLibrary {
    private storage: StorageBackend;

    constructor(storage: StorageBackend) {
        this.storage = storage;
    }

    /**
     * Save a learned pattern to the library
     */
    async savePattern(pattern: LearnedPattern): Promise<void> {
        await this.storage.savePattern(pattern);
    }

    /**
     * Get the best version of a pattern
     */
    async getBestPattern(name: string): Promise<LearnedPattern | null> {
        return await this.storage.loadPattern(name);
    }

    /**
     * Get a specific version of a pattern
     */
    async getPattern(name: string, version: string): Promise<LearnedPattern | null> {
        return await this.storage.loadPattern(name, version);
    }

    /**
     * List all available patterns
     */
    async listPatterns(): Promise<LearnedPattern[]> {
        return await this.storage.listPatterns();
    }

    /**
     * Import a pattern into a machine executor
     */
    async importPattern(
        executor: MachineExecutor,
        patternName: string,
        targetTaskName: string
    ): Promise<void> {
        const pattern = await this.getBestPattern(patternName);

        if (!pattern) {
            throw new Error(`Pattern ${patternName} not found`);
        }

        // Update task to use the learned pattern
        executor.modifyNode(targetTaskName, {
            evolution_stage: 'code_only',
            code_path: `pattern:${pattern.name}:${pattern.version}`,
            pattern_library_ref: patternName,
            input_schema: pattern.input_schema ? JSON.stringify(pattern.input_schema) : undefined,
            output_schema: pattern.output_schema ? JSON.stringify(pattern.output_schema) : undefined
        });

        // Also save the code to storage
        if (pattern.code) {
            await this.storage.saveCode(`pattern:${pattern.name}:${pattern.version}`, pattern.code);
        }
    }
}
