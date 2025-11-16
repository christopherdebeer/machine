/**
 * Path Manager
 * Responsible for managing multiple concurrent execution paths
 */

import { ExecutionPath, PathState } from './types.js';
import { ExecutionLimits } from '../base-executor.js';

/**
 * PathManager handles lifecycle and coordination of multiple execution paths
 */
export class PathManager {
    private paths: Map<string, ExecutionPath>;
    private limits: Required<ExecutionLimits>;
    private pathIdCounter: number = 0;

    constructor(limits: Required<ExecutionLimits>) {
        this.paths = new Map();
        this.limits = limits;
    }

    /**
     * Generate a unique path ID
     */
    private generatePathId(): string {
        return `path_${++this.pathIdCounter}`;
    }

    /**
     * Create a new execution path
     */
    createPath(startNode: string): string {
        const pathId = this.generatePathId();
        const path: ExecutionPath = {
            id: pathId,
            currentNode: startNode,
            history: [],
            status: 'active',
            stepCount: 0,
            nodeInvocationCounts: new Map(),
            stateTransitions: [],
            startTime: Date.now(),
            // Path-specific context (Phase 3)
            attributes: new Map(),
            contextReads: new Set(),
            contextWrites: new Set(),
            errorCount: 0
        };

        this.paths.set(pathId, path);
        return pathId;
    }

    /**
     * Get a path by ID
     */
    getPath(pathId: string): ExecutionPath | undefined {
        return this.paths.get(pathId);
    }

    /**
     * Get all paths
     */
    getAllPaths(): ExecutionPath[] {
        return Array.from(this.paths.values());
    }

    /**
     * Get all active paths
     */
    getActivePaths(): ExecutionPath[] {
        return this.getAllPaths().filter(p => p.status === 'active');
    }

    /**
     * Check if there are any active paths
     */
    hasActivePaths(): boolean {
        return this.getActivePaths().length > 0;
    }

    /**
     * Update path status
     */
    updatePathStatus(pathId: string, status: PathState): void {
        const path = this.paths.get(pathId);
        if (path) {
            path.status = status;
        }
    }

    /**
     * Record a transition in a path
     */
    recordTransition(
        pathId: string,
        fromNode: string,
        toNode: string,
        transition: string,
        output?: string
    ): void {
        const path = this.paths.get(pathId);
        if (!path) return;

        path.history.push({
            from: fromNode,
            to: toNode,
            transition,
            timestamp: new Date().toISOString(),
            output
        });

        path.currentNode = toNode;
        path.stepCount++;
    }

    /**
     * Track node invocation for a path
     */
    trackNodeInvocation(pathId: string, nodeName: string): void {
        const path = this.paths.get(pathId);
        if (!path) return;

        const currentCount = path.nodeInvocationCounts.get(nodeName) || 0;
        path.nodeInvocationCounts.set(nodeName, currentCount + 1);
    }

    /**
     * Track state transition for a path
     */
    trackStateTransition(pathId: string, stateName: string): void {
        const path = this.paths.get(pathId);
        if (!path) return;

        path.stateTransitions.push({
            state: stateName,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Check if path exceeds per-path limits
     */
    checkPathLimits(pathId: string, nodeName?: string, nodeMaxSteps?: number): { exceeded: boolean; reason?: string } {
        const path = this.paths.get(pathId);
        if (!path) {
            return { exceeded: false };
        }

        // Check per-path step limit
        if (path.stepCount >= this.limits.maxSteps) {
            return {
                exceeded: true,
                reason: `Path ${pathId} exceeded maximum steps (${this.limits.maxSteps})`
            };
        }

        // Check per-path timeout
        const elapsed = Date.now() - path.startTime;
        if (elapsed > this.limits.timeout) {
            return {
                exceeded: true,
                reason: `Path ${pathId} exceeded timeout (${this.limits.timeout}ms)`
            };
        }

        // Check per-node invocation limit if node specified
        if (nodeName) {
            const invocations = path.nodeInvocationCounts.get(nodeName) || 0;

            // Node-specific limit takes precedence
            const maxInvocations = nodeMaxSteps ?? this.limits.maxNodeInvocations;

            if (invocations >= maxInvocations) {
                return {
                    exceeded: true,
                    reason: `Node '${nodeName}' in path ${pathId} exceeded maximum invocations (${maxInvocations})`
                };
            }
        }

        return { exceeded: false };
    }

    /**
     * Check global limits across all paths
     */
    checkGlobalLimits(): { exceeded: boolean; reason?: string } {
        // Check total number of paths
        const totalPaths = this.paths.size;
        const maxPaths = 100; // TODO: make configurable

        if (totalPaths > maxPaths) {
            return {
                exceeded: true,
                reason: `Total number of paths (${totalPaths}) exceeded maximum (${maxPaths})`
            };
        }

        // Check total steps across all paths
        const totalSteps = this.getAllPaths().reduce((sum, p) => sum + p.stepCount, 0);
        const globalMaxSteps = this.limits.maxSteps * 10; // 10x per-path limit

        if (totalSteps > globalMaxSteps) {
            return {
                exceeded: true,
                reason: `Total steps across all paths (${totalSteps}) exceeded global maximum (${globalMaxSteps})`
            };
        }

        return { exceeded: false };
    }

    /**
     * Detect cycles in a path's state transitions
     */
    detectCycle(pathId: string): boolean {
        const path = this.paths.get(pathId);
        if (!path) return false;

        const recentTransitions = path.stateTransitions.slice(-this.limits.cycleDetectionWindow);

        if (recentTransitions.length < 3) {
            return false;
        }

        // Look for repeated subsequences
        for (let patternLength = 2; patternLength <= Math.floor(recentTransitions.length / 2); patternLength++) {
            const pattern = recentTransitions.slice(-patternLength).map(t => t.state).join('->');
            const prevPattern = recentTransitions.slice(-patternLength * 2, -patternLength).map(t => t.state).join('->');

            if (pattern === prevPattern && pattern.length > 0) {
                console.warn(
                    `⚠️ Cycle detected in path ${pathId}: Pattern '${pattern}' repeated`
                );
                return true;
            }
        }

        return false;
    }

    /**
     * Get summary statistics for all paths
     */
    getStatistics(): {
        totalPaths: number;
        activePaths: number;
        completedPaths: number;
        failedPaths: number;
        totalSteps: number;
    } {
        const allPaths = this.getAllPaths();

        return {
            totalPaths: allPaths.length,
            activePaths: allPaths.filter(p => p.status === 'active').length,
            completedPaths: allPaths.filter(p => p.status === 'completed').length,
            failedPaths: allPaths.filter(p => p.status === 'failed').length,
            totalSteps: allPaths.reduce((sum, p) => sum + p.stepCount, 0)
        };
    }

    /**
     * Remove a path from tracking
     */
    removePath(pathId: string): void {
        this.paths.delete(pathId);
    }

    /**
     * Clear all paths
     */
    clearAllPaths(): void {
        this.paths.clear();
        this.pathIdCounter = 0;
    }
}
