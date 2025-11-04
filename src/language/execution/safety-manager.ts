/**
 * Safety Manager - Phase 3
 *
 * Provides enhanced safety features:
 * - Circuit breaker pattern for node failures
 * - Per-node timeout enforcement
 * - Resource limits and monitoring
 * - Rate limiting
 */

import type { MachineData } from '../base-executor.js';

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker for a node
 */
export interface CircuitBreaker {
    nodeName: string;
    state: CircuitState;
    failureCount: number;
    lastFailureTime?: number;
    successCount: number;
    lastSuccessTime?: number;
}

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
    totalSteps: number;
    totalPaths: number;
    activePaths: number;
    totalNodeInvocations: number;
    startTime: number;
    elapsedTime: number;
}

/**
 * Safety limits configuration
 */
export interface SafetyLimits {
    // Circuit breaker
    circuitBreakerThreshold?: number;      // Failures before opening circuit (default: 5)
    circuitBreakerTimeout?: number;        // Time to wait before half-open (default: 60000ms)
    circuitBreakerSuccessThreshold?: number; // Successes in half-open before closing (default: 2)

    // Timeouts
    defaultNodeTimeout?: number;           // Default per-node timeout (default: 30000ms)
    globalTimeout?: number;                // Global execution timeout (default: 300000ms)

    // Resource limits
    maxConcurrentPaths?: number;           // Maximum concurrent paths (default: 10)
    maxTotalSteps?: number;                // Maximum total steps (default: 10000)
    maxMemoryMB?: number;                  // Maximum memory usage (default: 512MB)
}

/**
 * Safety Manager
 *
 * Manages circuit breakers, timeouts, and resource limits for safe execution
 */
export class SafetyManager {
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();
    private nodeTimeouts: Map<string, number> = new Map();
    private limits: Required<SafetyLimits>;
    private startTime: number;
    private machineData: MachineData;

    constructor(machineData: MachineData, limits?: SafetyLimits) {
        this.machineData = machineData;
        this.startTime = Date.now();

        // Initialize limits with defaults
        this.limits = {
            circuitBreakerThreshold: limits?.circuitBreakerThreshold ?? 5,
            circuitBreakerTimeout: limits?.circuitBreakerTimeout ?? 60000,
            circuitBreakerSuccessThreshold: limits?.circuitBreakerSuccessThreshold ?? 2,
            defaultNodeTimeout: limits?.defaultNodeTimeout ?? 30000,
            globalTimeout: limits?.globalTimeout ?? 300000,
            maxConcurrentPaths: limits?.maxConcurrentPaths ?? 10,
            maxTotalSteps: limits?.maxTotalSteps ?? 10000,
            maxMemoryMB: limits?.maxMemoryMB ?? 512
        };

        // Extract per-node timeouts from annotations
        this.extractNodeTimeouts();
    }

    /**
     * Extract timeout annotations from nodes
     */
    private extractNodeTimeouts(): void {
        for (const node of this.machineData.nodes) {
            // Look for @timeout(ms) annotation in node attributes
            if (node.attributes) {
                const timeoutAttr = node.attributes.find(
                    a => a.name === 'timeout' || a.name === 'maxTimeout'
                );
                if (timeoutAttr) {
                    const timeout = parseInt(timeoutAttr.value);
                    if (!isNaN(timeout) && timeout > 0) {
                        this.nodeTimeouts.set(node.name, timeout);
                    }
                }
            }
        }
    }

    /**
     * Get circuit breaker for a node (create if doesn't exist)
     */
    private getCircuitBreaker(nodeName: string): CircuitBreaker {
        if (!this.circuitBreakers.has(nodeName)) {
            this.circuitBreakers.set(nodeName, {
                nodeName,
                state: 'closed',
                failureCount: 0,
                successCount: 0
            });
        }
        return this.circuitBreakers.get(nodeName)!;
    }

    /**
     * Check if circuit breaker allows execution
     */
    canExecuteNode(nodeName: string): boolean {
        const breaker = this.getCircuitBreaker(nodeName);

        switch (breaker.state) {
            case 'closed':
                return true;

            case 'open':
                // Check if timeout has passed to move to half-open
                const timeSinceFailure = Date.now() - (breaker.lastFailureTime || 0);
                if (timeSinceFailure >= this.limits.circuitBreakerTimeout) {
                    breaker.state = 'half-open';
                    breaker.successCount = 0;
                    return true;
                }
                return false;

            case 'half-open':
                return true;

            default:
                return false;
        }
    }

    /**
     * Record successful node execution
     */
    recordSuccess(nodeName: string): void {
        const breaker = this.getCircuitBreaker(nodeName);
        breaker.lastSuccessTime = Date.now();

        switch (breaker.state) {
            case 'half-open':
                breaker.successCount++;
                if (breaker.successCount >= this.limits.circuitBreakerSuccessThreshold) {
                    // Close circuit after threshold successes
                    breaker.state = 'closed';
                    breaker.failureCount = 0;
                }
                break;

            case 'closed':
                // Reset failure count on success
                breaker.failureCount = 0;
                break;
        }
    }

    /**
     * Record failed node execution
     */
    recordFailure(nodeName: string, error: Error): void {
        const breaker = this.getCircuitBreaker(nodeName);
        breaker.lastFailureTime = Date.now();
        breaker.failureCount++;

        if (breaker.failureCount >= this.limits.circuitBreakerThreshold) {
            // Open circuit after threshold failures
            breaker.state = 'open';
            console.warn(
                `⚠️ Circuit breaker opened for node '${nodeName}' after ${breaker.failureCount} failures. ` +
                `Will retry in ${this.limits.circuitBreakerTimeout}ms`
            );
        }
    }

    /**
     * Get timeout for a node (node-specific or default)
     */
    getNodeTimeout(nodeName: string): number {
        return this.nodeTimeouts.get(nodeName) ?? this.limits.defaultNodeTimeout;
    }

    /**
     * Check if global timeout has been exceeded
     */
    checkGlobalTimeout(): void {
        const elapsed = Date.now() - this.startTime;
        if (elapsed > this.limits.globalTimeout) {
            throw new Error(
                `Global execution timeout exceeded (${this.limits.globalTimeout}ms). ` +
                `Elapsed: ${elapsed}ms`
            );
        }
    }

    /**
     * Check if resource limits are exceeded
     */
    checkResourceLimits(usage: ResourceUsage): void {
        // Check concurrent paths
        if (usage.activePaths > this.limits.maxConcurrentPaths) {
            throw new Error(
                `Maximum concurrent paths exceeded (${this.limits.maxConcurrentPaths}). ` +
                `Active paths: ${usage.activePaths}`
            );
        }

        // Check total steps
        if (usage.totalSteps > this.limits.maxTotalSteps) {
            throw new Error(
                `Maximum total steps exceeded (${this.limits.maxTotalSteps}). ` +
                `Total steps: ${usage.totalSteps}`
            );
        }

        // Check memory (if available in Node.js)
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;
            if (memoryMB > this.limits.maxMemoryMB) {
                throw new Error(
                    `Maximum memory usage exceeded (${this.limits.maxMemoryMB}MB). ` +
                    `Current usage: ${memoryMB.toFixed(2)}MB`
                );
            }
        }
    }

    /**
     * Get circuit breaker statistics
     */
    getCircuitBreakerStats(): Array<{
        nodeName: string;
        state: CircuitState;
        failureCount: number;
        successCount: number;
    }> {
        return Array.from(this.circuitBreakers.values()).map(breaker => ({
            nodeName: breaker.nodeName,
            state: breaker.state,
            failureCount: breaker.failureCount,
            successCount: breaker.successCount
        }));
    }

    /**
     * Reset circuit breaker for a node
     */
    resetCircuitBreaker(nodeName: string): void {
        const breaker = this.getCircuitBreaker(nodeName);
        breaker.state = 'closed';
        breaker.failureCount = 0;
        breaker.successCount = 0;
        breaker.lastFailureTime = undefined;
        breaker.lastSuccessTime = undefined;
    }

    /**
     * Reset all circuit breakers
     */
    resetAllCircuitBreakers(): void {
        for (const nodeName of this.circuitBreakers.keys()) {
            this.resetCircuitBreaker(nodeName);
        }
    }
}
