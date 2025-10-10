# Validation Error Handling

This document describes the comprehensive validation error handling system introduced in Phase 4, including runtime validation, error propagation, and machine-definable error behavior.

## Overview

The validation error handling system provides:

- **Robust Type System**: Structured error types with severity levels, categories, and detailed metadata
- **Error Accumulation**: ValidationContext for collecting and managing errors during validation
- **Node Error Flagging**: Track which nodes have errors and whether they're blocked from execution
- **Recovery Strategies**: Machine-definable behavior for handling validation errors
- **Runtime Integration**: Seamless integration with TypeChecker, GraphValidator, and semantic validation

## Core Concepts

### 1. Validation Errors

Every validation error is represented by a `ValidationError` object with:

```typescript
interface ValidationError {
    severity: ValidationSeverity;        // ERROR, WARNING, INFO, HINT
    category: ValidationCategory;        // TYPE, SEMANTIC, GRAPH, STRUCTURAL, RUNTIME
    code: string;                        // Programmatic error code
    message: string;                     // Human-readable message
    location?: ValidationLocation;       // Where the error occurred
    expected?: string;                   // Expected value/type
    actual?: string;                     // Actual value/type
    suggestion?: string;                 // Suggested fix
    context?: Record<string, any>;       // Additional data
    timestamp?: Date;                    // When error occurred
}
```

### 2. Severity Levels

```typescript
enum ValidationSeverity {
    ERROR = 'error',      // Critical - prevents execution
    WARNING = 'warning',  // May cause issues - allows execution
    INFO = 'info',        // Informational
    HINT = 'hint'         // Improvement suggestion
}
```

### 3. Error Categories

```typescript
enum ValidationCategory {
    TYPE = 'type',            // Type system violations
    SEMANTIC = 'semantic',    // Semantic rule violations
    GRAPH = 'graph',          // Graph structure issues
    STRUCTURAL = 'structural', // Syntax issues
    RUNTIME = 'runtime'       // Runtime execution errors
}
```

### 4. ValidationContext

The `ValidationContext` class accumulates errors during validation:

```typescript
const context = new ValidationContext();

// Add errors
context.addError(createValidationError('Type mismatch', {
    severity: ValidationSeverity.ERROR,
    category: ValidationCategory.TYPE,
    location: { node: 'myTask', property: 'count' }
}));

// Query errors
const hasErrors = context.hasErrors();
const errorCount = context.getErrorCount();
const criticalErrors = context.hasCriticalErrors();

// Filter errors
const typeErrors = context.getErrorsByCategory(ValidationCategory.TYPE);
const errors = context.getErrorsBySeverity(ValidationSeverity.ERROR);

// Get summary
const summary = context.getSummary();
```

## Usage Examples

### Type Validation with Error Handling

```typescript
import { TypeChecker } from './type-checker.js';
import { ValidationContext } from './validation-errors.js';

// Parse machine
const machine = /* ... */;

// Create validation context
const context = new ValidationContext();

// Run type validation
const typeChecker = new TypeChecker(machine);
typeChecker.validateAllAttributesWithContext(context);

// Check results
if (context.hasCriticalErrors()) {
    console.error('Validation failed!');

    // Get detailed errors
    const errors = context.getErrors();
    errors.forEach(error => {
        console.error(`[${error.severity}] ${error.message}`);
        if (error.suggestion) {
            console.log(`  Suggestion: ${error.suggestion}`);
        }
    });
}
```

### Graph Validation with Error Handling

```typescript
import { GraphValidator } from './graph-validator.js';
import { ValidationContext, GraphErrorCodes } from './validation-errors.js';

const context = new ValidationContext();
const graphValidator = new GraphValidator(machine);
graphValidator.validateWithContext(context);

// Check for specific issues
const cycles = context.getErrors()
    .filter(e => e.code === GraphErrorCodes.CYCLE_DETECTED);

if (cycles.length > 0) {
    console.warn('Cycles detected in graph:');
    cycles.forEach(error => {
        console.warn(`  ${error.message}`);
        console.warn(`  Path: ${error.context?.cyclePath.join(' → ')}`);
    });
}
```

### Node Error Flagging

```typescript
const context = new ValidationContext();

// Validate machine (errors will automatically flag nodes)
typeChecker.validateAllAttributesWithContext(context);
graphValidator.validateWithContext(context);

// Check which nodes are blocked
const nodeFlag = context.getNodeFlag('myTask');
if (nodeFlag?.isBlocked) {
    console.error(`Node '${nodeFlag.nodeName}' is blocked from execution`);
    console.error(`Errors (${nodeFlag.errors.length}):`);
    nodeFlag.errors.forEach(error => {
        console.error(`  - ${error.message}`);
    });
}

// Get all blocked nodes
const summary = context.getSummary();
console.log(`Blocked nodes: ${summary.blockedNodes.join(', ')}`);
```

## Recovery Strategies

Define how the machine should handle validation errors:

### Built-in Strategies

```typescript
enum RecoveryStrategy {
    ABORT = 'abort',        // Stop execution immediately
    SKIP = 'skip',          // Skip the problematic node/step
    DEFAULT = 'default',    // Use a default value
    RETRY = 'retry',        // Retry the operation
    CONTINUE = 'continue',  // Continue with warning
    CUSTOM = 'custom'       // Invoke custom handler
}
```

### Setting Recovery Actions

```typescript
const context = new ValidationContext();

// Set recovery strategy for specific node
context.setRecoveryAction('myTask', {
    strategy: RecoveryStrategy.DEFAULT,
    defaultValue: 0
});

// Set retry strategy
context.setRecoveryAction('apiCall', {
    strategy: RecoveryStrategy.RETRY,
    maxRetries: 3,
    retryDelay: 1000
});

// Set custom handler
context.setRecoveryAction('customNode', {
    strategy: RecoveryStrategy.CUSTOM,
    handler: (error) => {
        console.log('Custom recovery:', error.message);
        return { recovered: true };
    }
});
```

### Machine-Level Error Behavior

```typescript
interface ErrorBehaviorConfig {
    defaultStrategy?: RecoveryStrategy;
    nodeStrategies?: Map<string, RecoveryStrategy>;
    categoryStrategies?: Map<ValidationCategory, RecoveryStrategy>;
    onError?: (error: ValidationError, context: ValidationContext) => void;
    failFast?: boolean;
    maxErrors?: number;
}

// Example configuration
const errorBehavior: ErrorBehaviorConfig = {
    defaultStrategy: RecoveryStrategy.CONTINUE,
    failFast: false,
    maxErrors: 10,
    onError: (error, context) => {
        // Log to monitoring system
        console.error(`Validation error: ${error.message}`);
    }
};
```

## Error Codes

### Type Error Codes

```typescript
const TypeErrorCodes = {
    TYPE_MISMATCH: 'TYPE_MISMATCH',
    MISSING_VALUE: 'MISSING_VALUE',
    INVALID_GENERIC: 'INVALID_GENERIC',
    INCOMPATIBLE_TYPE: 'INCOMPATIBLE_TYPE',
    UNDEFINED_REFERENCE: 'UNDEFINED_REFERENCE',
};
```

### Graph Error Codes

```typescript
const GraphErrorCodes = {
    UNREACHABLE_NODE: 'UNREACHABLE_NODE',
    CYCLE_DETECTED: 'CYCLE_DETECTED',
    ORPHANED_NODE: 'ORPHANED_NODE',
    MISSING_ENTRY: 'MISSING_ENTRY',
    MISSING_EXIT: 'MISSING_EXIT',
};
```

### Semantic Error Codes

```typescript
const SemanticErrorCodes = {
    INVALID_ANNOTATION: 'INVALID_ANNOTATION',
    INVALID_TRANSITION: 'INVALID_TRANSITION',
    INCOMPATIBLE_RELATIONSHIP: 'INCOMPATIBLE_RELATIONSHIP',
    INVALID_NODE_TYPE: 'INVALID_NODE_TYPE',
};
```

## Integration with Existing Validation

The new error handling system integrates seamlessly with Langium's validation system:

```typescript
export class MachineValidator {
    checkAttributeTypeCompatibility(attr: Attribute, accept: ValidationAcceptor): void {
        if (!attr.type) return;

        const machine = this.getMachineFromAttribute(attr);
        if (!machine) return;

        const typeChecker = new TypeChecker(machine);
        const result = typeChecker.validateAttributeType(attr);

        if (!result.valid && result.message) {
            // Determine the appropriate property to highlight
            const property = attr.value ? 'value' : 'type';
            accept('error', result.message, { node: attr, property });
        }
    }
}
```

## Best Practices

### 1. Always Use ValidationContext for Complex Validation

```typescript
// Good
const context = new ValidationContext();
typeChecker.validateAllAttributesWithContext(context);
graphValidator.validateWithContext(context);

// Check all results at once
if (context.hasCriticalErrors()) {
    handleErrors(context.getErrors());
}
```

### 2. Provide Helpful Suggestions

```typescript
const error = createValidationError('Type mismatch', {
    expected: 'number',
    actual: 'string',
    suggestion: 'Change the value to a number or update the type to string'
});
```

### 3. Use Appropriate Severity Levels

- **ERROR**: Prevents execution, critical issues
- **WARNING**: May cause issues but allows execution
- **INFO**: Informational, no action required
- **HINT**: Suggestions for improvement

### 4. Flag Nodes with Errors

The system automatically flags nodes when errors have location information:

```typescript
context.addError(createValidationError('Error message', {
    location: { node: 'myTask', property: 'count' }
}));

// Node is automatically flagged
const flag = context.getNodeFlag('myTask');
```

### 5. Generate Summaries for Reporting

```typescript
const summary = context.getSummary();

console.log(`Validation Summary:
  Total Errors: ${summary.totalErrors}
  Critical: ${summary.errorCount}
  Warnings: ${summary.warningCount}
  Blocked Nodes: ${summary.blockedNodes.join(', ')}

  By Category:
    Type: ${summary.errorsByCategory.type}
    Graph: ${summary.errorsByCategory.graph}
    Semantic: ${summary.errorsByCategory.semantic}
`);
```

## Runtime Error Handling

### Checking Node Status Before Execution

```typescript
function executeNode(nodeName: string, context: ValidationContext) {
    // Check if node is blocked
    if (context.isNodeBlocked(nodeName)) {
        console.error(`Cannot execute ${nodeName}: node is blocked`);

        // Get recovery action
        const recovery = context.getRecoveryAction(nodeName);
        if (recovery) {
            return handleRecovery(recovery, context.getNodeErrors(nodeName));
        }

        throw new Error(`Node ${nodeName} is blocked and has no recovery strategy`);
    }

    // Execute node
    // ...
}
```

### Implementing Recovery Handlers

```typescript
function handleRecovery(action: RecoveryAction, errors: ValidationError[]) {
    switch (action.strategy) {
        case RecoveryStrategy.SKIP:
            console.log('Skipping node');
            return { skipped: true };

        case RecoveryStrategy.DEFAULT:
            console.log('Using default value:', action.defaultValue);
            return action.defaultValue;

        case RecoveryStrategy.RETRY:
            console.log(`Retrying (max ${action.maxRetries} attempts)`);
            return retryWithDelay(action.maxRetries, action.retryDelay);

        case RecoveryStrategy.CUSTOM:
            return action.handler?.(errors[0]);

        case RecoveryStrategy.ABORT:
            throw new Error('Execution aborted');

        case RecoveryStrategy.CONTINUE:
            console.warn('Continuing despite errors');
            return { continued: true };
    }
}
```

## Codex Feedback Fix

The primary issue addressed by this system was the early return in attribute validation:

**Before:**
```typescript
checkAttributeTypeCompatibility(attr: Attribute, accept: ValidationAcceptor): void {
    if (!attr.type || !attr.value) return;  // ❌ Bypasses validation
    // ...
}
```

**After:**
```typescript
checkAttributeTypeCompatibility(attr: Attribute, accept: ValidationAcceptor): void {
    if (!attr.type) return;  // ✅ Only skip if no type annotation

    // TypeChecker now handles missing values correctly
    const result = typeChecker.validateAttributeType(attr);
    // ...
}
```

This ensures that attributes like `count<number>;` (with type but no value) are properly validated and flagged as errors unless the type is optional (`count<number?>;`).

## API Reference

### Creating Errors

```typescript
createValidationError(
    message: string,
    options?: {
        severity?: ValidationSeverity;
        category?: ValidationCategory;
        code?: string;
        location?: ValidationLocation;
        expected?: string;
        actual?: string;
        suggestion?: string;
        context?: Record<string, any>;
    }
): ValidationError
```

### ValidationContext Methods

```typescript
class ValidationContext {
    addError(error: ValidationError): void;
    getErrors(): ValidationError[];
    getErrorsBySeverity(severity: ValidationSeverity): ValidationError[];
    getErrorsByCategory(category: ValidationCategory): ValidationError[];
    getNodeErrors(nodeName: string): ValidationError[];
    getNodeFlag(nodeName: string): NodeErrorFlag | undefined;
    isNodeBlocked(nodeName: string): boolean;
    setRecoveryAction(nodeName: string, action: RecoveryAction): void;
    getRecoveryAction(nodeName: string): RecoveryAction | undefined;
    hasErrors(): boolean;
    hasCriticalErrors(): boolean;
    getErrorCount(): number;
    getSummary(): ValidationSummary;
    clear(): void;
}
```

## See Also

- [Phase 4 Features](./PHASE4_FEATURES.md)
- [Type Checking System](./PHASE4_FEATURES.md#phase-413-type-checking-system)
- [Graph Validation](./PHASE4_FEATURES.md#phase-414-graph-validation)
- [Semantic Validation](./PHASE4_FEATURES.md#phase-415-semantic-validation)
