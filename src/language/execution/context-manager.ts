/**
 * Context Manager
 * Responsible for context permissions, read/write operations, and synchronization
 */

import { MachineData } from '../base-executor.js';
import { ContextPermissionsResolver } from '../utils/context-permissions.js';
import { ContextPermissions, ContextLock } from './types.js';

/**
 * ContextManager handles context node access with locking for multi-path execution
 */
export class ContextManager {
    private machineData: MachineData;
    private locks: Map<string, ContextLock>;
    private lockTimeout: number = 5000; // 5 seconds default

    constructor(machineData: MachineData) {
        this.machineData = machineData;
        this.locks = new Map();

        // Initialize locks for all context nodes
        this.initializeLocks();
    }

    /**
     * Initialize locks for all context nodes
     */
    private initializeLocks(): void {
        for (const node of this.machineData.nodes) {
            if (node.type?.toLowerCase() === 'context') {
                this.locks.set(node.name, {
                    contextName: node.name,
                    version: 0
                });
            }
        }
    }

    /**
     * Get accessible context nodes for a task node
     */
    getAccessibleContextNodes(
        taskNodeName: string,
        options?: {
            includeInboundEdges?: boolean;
            includeStore?: boolean;
            permissionsMode?: 'legacy' | 'strict';
        }
    ): Map<string, ContextPermissions> {
        return ContextPermissionsResolver.getAccessibleContextNodes(
            taskNodeName,
            this.machineData,
            options
        );
    }

    /**
     * Acquire a lock for writing to a context node
     * Returns true if lock acquired, false if timeout
     */
    async acquireLock(contextName: string, pathId: string): Promise<boolean> {
        const lock = this.locks.get(contextName);
        if (!lock) {
            throw new Error(`Context ${contextName} not found`);
        }

        const startTime = Date.now();

        // Wait until lock is available
        while (lock.lockedBy && lock.lockedBy !== pathId) {
            if (Date.now() - startTime > this.lockTimeout) {
                console.warn(`⚠️ Lock timeout for context ${contextName} by path ${pathId}`);
                return false;
            }
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Acquire lock
        lock.lockedBy = pathId;
        lock.lockTime = Date.now();
        return true;
    }

    /**
     * Release a lock for a context node
     */
    releaseLock(contextName: string, pathId: string): void {
        const lock = this.locks.get(contextName);
        if (!lock) {
            throw new Error(`Context ${contextName} not found`);
        }

        if (lock.lockedBy === pathId) {
            lock.lockedBy = undefined;
            lock.lockTime = undefined;
        }
    }

    /**
     * Read from a context node (concurrent reads allowed)
     */
    async read(contextName: string, pathId: string, fields?: string[]): Promise<any> {
        const node = this.machineData.nodes.find(n => n.name === contextName);
        if (!node) {
            throw new Error(`Context node ${contextName} not found`);
        }

        const attributes = this.getNodeAttributes(contextName);

        // Filter by requested fields if specified
        if (fields && Array.isArray(fields)) {
            const filtered: Record<string, any> = {};
            fields.forEach((field: string) => {
                if (field in attributes) {
                    filtered[field] = attributes[field];
                }
            });
            return filtered;
        }

        return attributes;
    }

    /**
     * Write to a context node (serialized writes with locking)
     */
    async write(contextName: string, pathId: string, data: Record<string, any>): Promise<void> {
        const node = this.machineData.nodes.find(n => n.name === contextName);
        if (!node) {
            throw new Error(`Context node ${contextName} not found`);
        }

        // Acquire lock
        const acquired = await this.acquireLock(contextName, pathId);
        if (!acquired) {
            throw new Error(`Failed to acquire lock for context ${contextName}`);
        }

        try {
            // Update context node attributes
            if (!node.attributes) {
                node.attributes = [];
            }

            Object.entries(data).forEach(([key, value]) => {
                const existingAttr = node.attributes!.find(a => a.name === key);
                if (existingAttr) {
                    existingAttr.value = String(value);
                } else {
                    node.attributes!.push({
                        name: key,
                        type: typeof value === 'number' ? 'number' : 'string',
                        value: String(value)
                    });
                }
            });

            // Increment version
            const lock = this.locks.get(contextName)!;
            lock.version++;
        } finally {
            // Always release lock
            this.releaseLock(contextName, pathId);
        }
    }

    /**
     * Get node attributes as a key-value object
     */
    private getNodeAttributes(nodeName: string): Record<string, any> {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node?.attributes) {
            return {};
        }

        return node.attributes.reduce((acc, attr) => {
            // Simple value extraction
            let value = attr.value;

            // Strip quotes
            if (typeof value === 'string') {
                value = value.replace(/^["']|["']$/g, '');

                // Try to parse JSON-like values
                try {
                    if ((value.startsWith('{') && value.endsWith('}')) ||
                        (value.startsWith('[') && value.endsWith(']'))) {
                        value = JSON.parse(value);
                    }
                } catch {
                    // Keep as string if parsing fails
                }
            }

            acc[attr.name] = value;
            return acc;
        }, {} as Record<string, any>);
    }

    /**
     * Get the current version of a context node
     */
    getContextVersion(contextName: string): number {
        const lock = this.locks.get(contextName);
        return lock?.version ?? 0;
    }

    /**
     * Check if a context is currently locked
     */
    isLocked(contextName: string): boolean {
        const lock = this.locks.get(contextName);
        return !!lock?.lockedBy;
    }
}
