/**
 * Validation Error Types and Runtime Error Handling
 *
 * Provides a robust type system for validation errors with runtime
 * error handling capabilities, including error propagation, severity
 * levels, and machine-definable error behavior.
 */

/**
 * Severity levels for validation errors
 */
export enum ValidationSeverity {
    /** Critical error that prevents execution */
    ERROR = 'error',
    /** Warning that may cause issues but doesn't prevent execution */
    WARNING = 'warning',
    /** Informational message */
    INFO = 'info',
    /** Hint for improvement */
    HINT = 'hint'
}

/**
 * Categories of validation errors
 */
export enum ValidationCategory {
    /** Type system violations */
    TYPE = 'type',
    /** Semantic rule violations */
    SEMANTIC = 'semantic',
    /** Graph structure issues */
    GRAPH = 'graph',
    /** Structural syntax issues */
    STRUCTURAL = 'structural',
    /** Runtime execution errors */
    RUNTIME = 'runtime'
}

/**
 * Location information for validation errors
 */
export interface ValidationLocation {
    /** Node or element name */
    node?: string;
    /** Property name within the node */
    property?: string;
    /** Line number in source */
    line?: number;
    /** Column number in source */
    column?: number;
    /** File path */
    file?: string;
}

/**
 * Validation error with detailed information
 */
export interface ValidationError {
    /** Error severity */
    severity: ValidationSeverity;
    /** Error category */
    category: ValidationCategory;
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Location information */
    location?: ValidationLocation;
    /** Expected value or type */
    expected?: string;
    /** Actual value or type */
    actual?: string;
    /** Additional context data */
    context?: Record<string, any>;
    /** Suggested fix or recovery action */
    suggestion?: string;
    /** Timestamp when error occurred */
    timestamp?: Date;
}

/**
 * Error recovery strategy
 */
export enum RecoveryStrategy {
    /** Stop execution immediately */
    ABORT = 'abort',
    /** Skip the problematic node/step */
    SKIP = 'skip',
    /** Use a default value */
    DEFAULT = 'default',
    /** Retry the operation */
    RETRY = 'retry',
    /** Continue with warning */
    CONTINUE = 'continue',
    /** Invoke custom handler */
    CUSTOM = 'custom'
}

/**
 * Recovery action for validation errors
 */
export interface RecoveryAction {
    /** Recovery strategy to apply */
    strategy: RecoveryStrategy;
    /** Custom handler function (for CUSTOM strategy) */
    handler?: (error: ValidationError) => any;
    /** Default value (for DEFAULT strategy) */
    defaultValue?: any;
    /** Maximum retry attempts (for RETRY strategy) */
    maxRetries?: number;
    /** Delay between retries in ms */
    retryDelay?: number;
}

/**
 * Node/step error flagging with metadata
 */
export interface NodeErrorFlag {
    /** Node name */
    nodeName: string;
    /** Node type */
    nodeType?: string;
    /** Collection of errors for this node */
    errors: ValidationError[];
    /** Whether node is blocked from execution */
    isBlocked: boolean;
    /** Recovery action if defined */
    recovery?: RecoveryAction;
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Validation context for error accumulation
 */
export class ValidationContext {
    private errors: ValidationError[] = [];
    private nodeFlags: Map<string, NodeErrorFlag> = new Map();
    private recoveryActions: Map<string, RecoveryAction> = new Map();

    /**
     * Add an error to the context
     */
    addError(error: ValidationError): void {
        this.errors.push({
            ...error,
            timestamp: error.timestamp || new Date()
        });

        // Flag the node if location is specified
        if (error.location?.node) {
            this.flagNode(error.location.node, error);
        }
    }

    /**
     * Flag a node with an error
     */
    private flagNode(nodeName: string, error: ValidationError): void {
        const existing = this.nodeFlags.get(nodeName);

        if (existing) {
            existing.errors.push(error);
            // Block node if error severity is ERROR
            if (error.severity === ValidationSeverity.ERROR) {
                existing.isBlocked = true;
            }
        } else {
            this.nodeFlags.set(nodeName, {
                nodeName,
                errors: [error],
                isBlocked: error.severity === ValidationSeverity.ERROR,
                metadata: {}
            });
        }
    }

    /**
     * Set recovery action for a node
     */
    setRecoveryAction(nodeName: string, action: RecoveryAction): void {
        this.recoveryActions.set(nodeName, action);

        const flag = this.nodeFlags.get(nodeName);
        if (flag) {
            flag.recovery = action;
        }
    }

    /**
     * Get recovery action for a node
     */
    getRecoveryAction(nodeName: string): RecoveryAction | undefined {
        return this.recoveryActions.get(nodeName);
    }

    /**
     * Get all errors
     */
    getErrors(): ValidationError[] {
        return [...this.errors];
    }

    /**
     * Get errors by severity
     */
    getErrorsBySeverity(severity: ValidationSeverity): ValidationError[] {
        return this.errors.filter(e => e.severity === severity);
    }

    /**
     * Get errors by category
     */
    getErrorsByCategory(category: ValidationCategory): ValidationError[] {
        return this.errors.filter(e => e.category === category);
    }

    /**
     * Get errors for a specific node
     */
    getNodeErrors(nodeName: string): ValidationError[] {
        const flag = this.nodeFlags.get(nodeName);
        return flag ? [...flag.errors] : [];
    }

    /**
     * Get node error flag
     */
    getNodeFlag(nodeName: string): NodeErrorFlag | undefined {
        return this.nodeFlags.get(nodeName);
    }

    /**
     * Get all node flags
     */
    getAllNodeFlags(): Map<string, NodeErrorFlag> {
        return new Map(this.nodeFlags);
    }

    /**
     * Check if node is blocked
     */
    isNodeBlocked(nodeName: string): boolean {
        const flag = this.nodeFlags.get(nodeName);
        return flag?.isBlocked ?? false;
    }

    /**
     * Check if there are any errors
     */
    hasErrors(): boolean {
        return this.errors.length > 0;
    }

    /**
     * Check if there are any critical errors
     */
    hasCriticalErrors(): boolean {
        return this.errors.some(e => e.severity === ValidationSeverity.ERROR);
    }

    /**
     * Get error count
     */
    getErrorCount(): number {
        return this.errors.length;
    }

    /**
     * Get error count by severity
     */
    getErrorCountBySeverity(severity: ValidationSeverity): number {
        return this.errors.filter(e => e.severity === severity).length;
    }

    /**
     * Clear all errors
     */
    clear(): void {
        this.errors = [];
        this.nodeFlags.clear();
        this.recoveryActions.clear();
    }

    /**
     * Generate a summary report
     */
    getSummary(): ValidationSummary {
        return {
            totalErrors: this.errors.length,
            errorCount: this.getErrorCountBySeverity(ValidationSeverity.ERROR),
            warningCount: this.getErrorCountBySeverity(ValidationSeverity.WARNING),
            infoCount: this.getErrorCountBySeverity(ValidationSeverity.INFO),
            hintCount: this.getErrorCountBySeverity(ValidationSeverity.HINT),
            blockedNodes: Array.from(this.nodeFlags.values())
                .filter(f => f.isBlocked)
                .map(f => f.nodeName),
            errorsByCategory: {
                [ValidationCategory.TYPE]: this.getErrorsByCategory(ValidationCategory.TYPE).length,
                [ValidationCategory.SEMANTIC]: this.getErrorsByCategory(ValidationCategory.SEMANTIC).length,
                [ValidationCategory.GRAPH]: this.getErrorsByCategory(ValidationCategory.GRAPH).length,
                [ValidationCategory.STRUCTURAL]: this.getErrorsByCategory(ValidationCategory.STRUCTURAL).length,
                [ValidationCategory.RUNTIME]: this.getErrorsByCategory(ValidationCategory.RUNTIME).length,
            }
        };
    }
}

/**
 * Validation summary
 */
export interface ValidationSummary {
    totalErrors: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    hintCount: number;
    blockedNodes: string[];
    errorsByCategory: Record<ValidationCategory, number>;
}

/**
 * Result of validation with errors
 */
export interface ValidationResult<T = any> {
    /** Whether validation passed */
    valid: boolean;
    /** Result data if validation passed */
    data?: T;
    /** Validation context with accumulated errors */
    context: ValidationContext;
}

/**
 * Machine-level error behavior configuration
 */
export interface ErrorBehaviorConfig {
    /** Global recovery strategy */
    defaultStrategy?: RecoveryStrategy;
    /** Node-specific recovery strategies */
    nodeStrategies?: Map<string, RecoveryStrategy>;
    /** Category-specific recovery strategies */
    categoryStrategies?: Map<ValidationCategory, RecoveryStrategy>;
    /** Custom error handler */
    onError?: (error: ValidationError, context: ValidationContext) => void;
    /** Whether to stop on first error */
    failFast?: boolean;
    /** Maximum errors before stopping */
    maxErrors?: number;
}

/**
 * Helper function to create validation errors
 */
export function createValidationError(
    message: string,
    options: {
        severity?: ValidationSeverity;
        category?: ValidationCategory;
        code?: string;
        location?: ValidationLocation;
        expected?: string;
        actual?: string;
        suggestion?: string;
        context?: Record<string, any>;
    } = {}
): ValidationError {
    return {
        severity: options.severity ?? ValidationSeverity.ERROR,
        category: options.category ?? ValidationCategory.STRUCTURAL,
        code: options.code ?? 'VALIDATION_ERROR',
        message,
        location: options.location,
        expected: options.expected,
        actual: options.actual,
        suggestion: options.suggestion,
        context: options.context,
        timestamp: new Date()
    };
}

/**
 * Error code constants for type checking
 */
export const TypeErrorCodes = {
    TYPE_MISMATCH: 'TYPE_MISMATCH',
    MISSING_VALUE: 'MISSING_VALUE',
    INVALID_GENERIC: 'INVALID_GENERIC',
    INCOMPATIBLE_TYPE: 'INCOMPATIBLE_TYPE',
    UNDEFINED_REFERENCE: 'UNDEFINED_REFERENCE',
} as const;

/**
 * Error code constants for graph validation
 */
export const GraphErrorCodes = {
    UNREACHABLE_NODE: 'UNREACHABLE_NODE',
    CYCLE_DETECTED: 'CYCLE_DETECTED',
    ORPHANED_NODE: 'ORPHANED_NODE',
    MISSING_ENTRY: 'MISSING_ENTRY',
    MISSING_EXIT: 'MISSING_EXIT',
} as const;

/**
 * Error code constants for semantic validation
 */
export const SemanticErrorCodes = {
    INVALID_ANNOTATION: 'INVALID_ANNOTATION',
    INVALID_TRANSITION: 'INVALID_TRANSITION',
    INCOMPATIBLE_RELATIONSHIP: 'INCOMPATIBLE_RELATIONSHIP',
    INVALID_NODE_TYPE: 'INVALID_NODE_TYPE',
} as const;
