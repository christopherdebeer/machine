/**
 * Annotation Processor
 * Handles parsing and processing of node, edge, and machine annotations
 */

import { NodeAnnotation, EdgeAnnotation, ErrorHandlingStrategy } from './types.js';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
    maxAttempts: number;
    backoffType: 'fixed' | 'exponential';
    initialDelay?: number;
    maxDelay?: number;
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
    duration: number; // milliseconds
}

/**
 * Node annotation processing result
 */
export interface ProcessedNodeAnnotations {
    retry?: RetryPolicy;
    timeout?: TimeoutConfig;
    checkpoint?: boolean;
    lazy?: boolean;
    eager?: boolean;
    meta?: boolean;
}

/**
 * Edge annotation processing result
 */
export interface ProcessedEdgeAnnotations {
    auto?: boolean;
    barrier?: string;
    priority?: number;
    parallel?: boolean;
}

/**
 * Machine annotation processing result
 */
export interface ProcessedMachineAnnotations {
    concurrent?: number;
    errorHandling?: ErrorHandlingStrategy;
    retryPolicy?: 'fixed' | 'exponential';
}

/**
 * AnnotationProcessor parses and validates annotations
 */
export class AnnotationProcessor {
    /**
     * Process node annotations
     */
    static processNodeAnnotations(annotations?: NodeAnnotation[]): ProcessedNodeAnnotations {
        if (!annotations || annotations.length === 0) {
            return {};
        }

        const result: ProcessedNodeAnnotations = {};

        for (const annotation of annotations) {
            switch (annotation.name.toLowerCase()) {
                case 'retry': {
                    const attempts = this.parseRetryAnnotation(annotation.value);
                    result.retry = {
                        maxAttempts: attempts,
                        backoffType: 'exponential',
                        initialDelay: 1000,
                        maxDelay: 30000
                    };
                    break;
                }

                case 'timeout': {
                    const duration = this.parseTimeoutAnnotation(annotation.value);
                    result.timeout = { duration };
                    break;
                }

                case 'checkpoint': {
                    result.checkpoint = true;
                    break;
                }

                case 'lazy': {
                    result.lazy = true;
                    break;
                }

                case 'eager': {
                    result.eager = true;
                    break;
                }

                case 'meta': {
                    result.meta = true;
                    break;
                }

                default:
                    // Unknown annotation - log but don't fail
                    console.debug(`Unknown node annotation: @${annotation.name}`);
            }
        }

        return result;
    }

    /**
     * Process edge annotations
     */
    static processEdgeAnnotations(annotations?: EdgeAnnotation[]): ProcessedEdgeAnnotations {
        if (!annotations || annotations.length === 0) {
            return {};
        }

        const result: ProcessedEdgeAnnotations = {};

        for (const annotation of annotations) {
            switch (annotation.name.toLowerCase()) {
                case 'auto': {
                    result.auto = true;
                    break;
                }

                case 'barrier': {
                    result.barrier = annotation.value || 'default';
                    break;
                }

                case 'priority': {
                    result.priority = this.parsePriorityAnnotation(annotation.value);
                    break;
                }

                case 'parallel': {
                    result.parallel = true;
                    break;
                }

                default:
                    // Unknown annotation - log but don't fail
                    console.debug(`Unknown edge annotation: @${annotation.name}`);
            }
        }

        return result;
    }

    /**
     * Process machine-level annotations
     */
    static processMachineAnnotations(annotations?: NodeAnnotation[]): ProcessedMachineAnnotations {
        if (!annotations || annotations.length === 0) {
            return {};
        }

        const result: ProcessedMachineAnnotations = {};

        for (const annotation of annotations) {
            switch (annotation.name.toLowerCase()) {
                case 'concurrent': {
                    result.concurrent = this.parseConcurrentAnnotation(annotation.value);
                    break;
                }

                case 'errorhandling': {
                    result.errorHandling = this.parseErrorHandlingAnnotation(annotation.value);
                    break;
                }

                case 'retrypolicy': {
                    result.retryPolicy = this.parseRetryPolicyAnnotation(annotation.value);
                    break;
                }

                default:
                    // Unknown annotation - log but don't fail
                    console.debug(`Unknown machine annotation: @${annotation.name}`);
            }
        }

        return result;
    }

    /**
     * Parse @retry annotation value
     */
    private static parseRetryAnnotation(value?: string): number {
        if (!value) return 3; // Default retry count

        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) {
            console.warn(`Invalid @retry value: ${value}, using default (3)`);
            return 3;
        }

        return Math.min(num, 10); // Cap at 10 retries
    }

    /**
     * Parse @timeout annotation value (in milliseconds)
     */
    private static parseTimeoutAnnotation(value?: string): number {
        if (!value) return 30000; // Default 30 seconds

        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) {
            console.warn(`Invalid @timeout value: ${value}, using default (30000ms)`);
            return 30000;
        }

        return Math.min(num, 300000); // Cap at 5 minutes
    }

    /**
     * Parse @priority annotation value
     */
    private static parsePriorityAnnotation(value?: string): number {
        if (!value) return 0; // Default priority

        const num = parseInt(value, 10);
        if (isNaN(num)) {
            console.warn(`Invalid @priority value: ${value}, using default (0)`);
            return 0;
        }

        return num;
    }

    /**
     * Parse @concurrent annotation value
     */
    private static parseConcurrentAnnotation(value?: string): number {
        if (!value) return 4; // Default concurrency

        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) {
            console.warn(`Invalid @concurrent value: ${value}, using default (4)`);
            return 4;
        }

        return Math.min(num, 100); // Cap at 100 concurrent paths
    }

    /**
     * Parse @errorHandling annotation value
     */
    private static parseErrorHandlingAnnotation(value?: string): ErrorHandlingStrategy {
        if (!value) return 'continue'; // Default strategy

        const strategy = value.toLowerCase().replace(/['"]/g, '');

        if (strategy === 'fail-fast' || strategy === 'failfast') {
            return 'fail-fast';
        } else if (strategy === 'continue') {
            return 'continue';
        } else if (strategy === 'compensate') {
            return 'compensate';
        }

        console.warn(`Invalid @errorHandling value: ${value}, using default (continue)`);
        return 'continue';
    }

    /**
     * Parse @retryPolicy annotation value
     */
    private static parseRetryPolicyAnnotation(value?: string): 'fixed' | 'exponential' {
        if (!value) return 'exponential'; // Default policy

        const policy = value.toLowerCase().replace(/['"]/g, '');

        if (policy === 'fixed') {
            return 'fixed';
        } else if (policy === 'exponential') {
            return 'exponential';
        }

        console.warn(`Invalid @retryPolicy value: ${value}, using default (exponential)`);
        return 'exponential';
    }

    /**
     * Validate annotation combinations
     */
    static validateNodeAnnotations(annotations: ProcessedNodeAnnotations): string[] {
        const errors: string[] = [];

        // Lazy and eager are mutually exclusive
        if (annotations.lazy && annotations.eager) {
            errors.push('Node cannot have both @lazy and @eager annotations');
        }

        return errors;
    }

    /**
     * Check if a node should retry on failure
     */
    static shouldRetry(
        annotations: ProcessedNodeAnnotations,
        attemptCount: number
    ): boolean {
        if (!annotations.retry) return false;
        return attemptCount < annotations.retry.maxAttempts;
    }

    /**
     * Calculate retry delay based on policy
     */
    static calculateRetryDelay(
        annotations: ProcessedNodeAnnotations,
        attemptCount: number
    ): number {
        if (!annotations.retry) return 0;

        const { backoffType, initialDelay = 1000, maxDelay = 30000 } = annotations.retry;

        if (backoffType === 'fixed') {
            return initialDelay;
        }

        // Exponential backoff: delay = initialDelay * 2^attemptCount
        const delay = initialDelay * Math.pow(2, attemptCount);
        return Math.min(delay, maxDelay);
    }
}
