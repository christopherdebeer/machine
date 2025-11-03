/**
 * Error Handling Manager
 * Implements error handling strategies for multi-path execution
 */

import { ErrorHandlingStrategy, PathState } from './types.js';
import { PathManager } from './path-manager.js';

/**
 * Error context for handling decisions
 */
export interface ErrorContext {
    pathId: string;
    nodeName: string;
    error: Error;
    attemptCount: number;
}

/**
 * Error handling result
 */
export interface ErrorHandlingResult {
    action: 'retry' | 'fail-path' | 'fail-all' | 'compensate' | 'continue';
    reason: string;
    delay?: number;
}

/**
 * Compensation action
 */
export interface CompensationAction {
    pathId: string;
    nodeName: string;
    action: () => Promise<void>;
}

/**
 * ErrorHandlingManager coordinates error handling across execution paths
 */
export class ErrorHandlingManager {
    private strategy: ErrorHandlingStrategy;
    private pathManager: PathManager;
    private compensationActions: Map<string, CompensationAction[]>;

    constructor(strategy: ErrorHandlingStrategy, pathManager: PathManager) {
        this.strategy = strategy;
        this.pathManager = pathManager;
        this.compensationActions = new Map();
    }

    /**
     * Set the error handling strategy
     */
    setStrategy(strategy: ErrorHandlingStrategy): void {
        this.strategy = strategy;
    }

    /**
     * Get the current error handling strategy
     */
    getStrategy(): ErrorHandlingStrategy {
        return this.strategy;
    }

    /**
     * Handle an error that occurred during path execution
     */
    handleError(context: ErrorContext): ErrorHandlingResult {
        console.error(
            `❌ Error in path ${context.pathId} at node '${context.nodeName}':`,
            context.error.message
        );

        switch (this.strategy) {
            case 'fail-fast':
                return this.handleFailFast(context);

            case 'continue':
                return this.handleContinue(context);

            case 'compensate':
                return this.handleCompensate(context);

            default:
                return this.handleContinue(context);
        }
    }

    /**
     * Fail-fast strategy: Any path failure stops all paths
     */
    private handleFailFast(context: ErrorContext): ErrorHandlingResult {
        // Mark all active paths as cancelled
        const activePaths = this.pathManager.getActivePaths();
        for (const path of activePaths) {
            if (path.id !== context.pathId) {
                this.pathManager.updatePathStatus(path.id, 'cancelled');
            }
        }

        // Mark the failed path
        this.pathManager.updatePathStatus(context.pathId, 'failed');

        return {
            action: 'fail-all',
            reason: `Fail-fast: Path ${context.pathId} error triggered global failure`
        };
    }

    /**
     * Continue strategy: Path failures don't affect other paths
     */
    private handleContinue(context: ErrorContext): ErrorHandlingResult {
        // Mark only this path as failed
        this.pathManager.updatePathStatus(context.pathId, 'failed');

        return {
            action: 'fail-path',
            reason: `Continue: Path ${context.pathId} failed, other paths unaffected`
        };
    }

    /**
     * Compensate strategy: Failed path triggers rollback
     */
    private handleCompensate(context: ErrorContext): ErrorHandlingResult {
        // Mark path as failed
        this.pathManager.updatePathStatus(context.pathId, 'failed');

        // Trigger compensation actions for this path
        const actions = this.compensationActions.get(context.pathId) || [];
        if (actions.length > 0) {
            console.log(`🔄 Triggering ${actions.length} compensation actions for path ${context.pathId}`);

            // Execute compensations asynchronously (best effort)
            this.executeCompensations(actions).catch(err => {
                console.error(`⚠️ Compensation failed for path ${context.pathId}:`, err);
            });
        }

        return {
            action: 'compensate',
            reason: `Compensate: Path ${context.pathId} failed, executing ${actions.length} compensation actions`
        };
    }

    /**
     * Execute compensation actions in reverse order (LIFO)
     */
    private async executeCompensations(actions: CompensationAction[]): Promise<void> {
        // Execute in reverse order (undo most recent first)
        for (let i = actions.length - 1; i >= 0; i--) {
            const compensation = actions[i];
            try {
                await compensation.action();
                console.log(`✅ Compensation completed for node '${compensation.nodeName}'`);
            } catch (error) {
                console.error(`❌ Compensation failed for node '${compensation.nodeName}':`, error);
                // Continue with remaining compensations
            }
        }
    }

    /**
     * Register a compensation action for a path
     */
    registerCompensation(pathId: string, nodeName: string, action: () => Promise<void>): void {
        const actions = this.compensationActions.get(pathId) || [];
        actions.push({ pathId, nodeName, action });
        this.compensationActions.set(pathId, actions);
    }

    /**
     * Clear compensation actions for a path (e.g., after successful completion)
     */
    clearCompensations(pathId: string): void {
        this.compensationActions.delete(pathId);
    }

    /**
     * Get compensation actions for a path
     */
    getCompensations(pathId: string): CompensationAction[] {
        return this.compensationActions.get(pathId) || [];
    }

    /**
     * Check if an error should stop execution entirely
     */
    shouldStopExecution(result: ErrorHandlingResult): boolean {
        return result.action === 'fail-all';
    }

    /**
     * Check if an error should trigger path failure
     */
    shouldFailPath(result: ErrorHandlingResult): boolean {
        return result.action === 'fail-path' || result.action === 'compensate';
    }

    /**
     * Check if an error should trigger retry
     */
    shouldRetry(result: ErrorHandlingResult): boolean {
        return result.action === 'retry';
    }

    /**
     * Get error statistics
     */
    getStatistics(): {
        totalCompensations: number;
        pathsWithCompensations: number;
    } {
        let totalCompensations = 0;
        for (const actions of this.compensationActions.values()) {
            totalCompensations += actions.length;
        }

        return {
            totalCompensations,
            pathsWithCompensations: this.compensationActions.size
        };
    }

    /**
     * Clear all compensation actions
     */
    clearAll(): void {
        this.compensationActions.clear();
    }
}
