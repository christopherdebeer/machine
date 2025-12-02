# Edge Conditions

DyGram supports conditional edge transitions using the Common Expression Language (CEL) for safe, sandboxed expression evaluation.

## Overview

Edge conditions allow you to control when a transition should occur based on runtime state, attributes, or other variables. Conditions are evaluated using CEL, which provides a secure alternative to JavaScript `eval()`.

## Basic Syntax

Conditions can be specified on edges using labels with the `if:`, `when:`, or `unless:` keywords:


## CEL Expression Syntax

### Comparison Operators

CEL uses standard comparison operators:

- `==` - Equal to (note: use `==`, not `===`)
- `!=` - Not equal to (note: use `!=`, not `!==`)
- `<` - Less than
- `>` - Greater than
- `<=` - Less than or equal to
- `>=` - Greater than or equal to

```dy examples/syntax/edge-numeric-comparison.dygram
machine "Numeric Comparison Examples" {
    maxRetries: 3;
    errorCount: 0;
}

task Start;
task Process;
task Retry;
task Success;

Start -> Process;
Process -when: errorCount < maxRetries-> Retry;
Process -when: errorCount >= maxRetries-> Success;
```

### Logical Operators

Combine conditions using logical operators:

- `&&` - Logical AND
- `||` - Logical OR
- `!` - Logical NOT

```dy examples/syntax/edge-logical-operators.dygram
machine "Logical Operator Examples" {
    errorCount: 0;
    maxRetries: 3;
    status: "ready";
}

task Start;
task Process;
task Retry;
task Failed;
task Success;

Start -> Process;
Process -when: errorCount > 0 && errorCount < maxRetries-> Retry;
Process -when: errorCount >= maxRetries || status == "failed"-> Failed;
Process -when: errorCount == 0 && status == "ready"-> Success;
```

### Parentheses

Use parentheses to group expressions and control evaluation order:

```dy examples/syntax/edge-parentheses.dygram
machine "Parentheses Grouping Example" {
    errorCount: 0;
    retryCount: 2;
    maxRetries: 3;
    status: "processing";
}

task Start;
task Process;
task Retry;
task Override;
task Complete;

Start -> Process;
Process -when: (errorCount > 0 && retryCount < maxRetries) || status == "override"-> Retry;
Process -when: errorCount == 0 && (status == "complete" || status == "success")-> Complete;
Process -when: status == "override"-> Override;
```


## Variable Access

### Built-in Variables

DyGram provides several built-in variables:

- `errorCount` - Number of errors that have occurred
- `errors` - Alias for `errorCount` (backward compatibility)
- `activeState` - Name of the current active state

```dy examples/syntax/edge-builtin-variables.dygram
machine "Built-in Variables Example" {
    errorThreshold: 5;
}

task Start;
task Process;
task HandleErrors;
task Complete;

Start -> Process;
Process -when: errorCount > 0-> HandleErrors;
Process -when: errorCount == 0-> Complete;
HandleErrors -when: errorCount < errorThreshold-> Process;
```

### Attribute Access

Access node attributes using dot notation:

```dy examples/syntax/edge-attribute-access.dygram
machine "Attribute Access Example" {
    maxRetries: 3;
    timeout: 5000;
    priority: 1;
}

task Start;
task Process;
task Retry;
task Timeout;
task Success;

Start -> Process;
Process -when: priority > 0-> Success;
Process -when: timeout > 3000-> Timeout;
Process -when: maxRetries > 2-> Retry;
```

### Nested Attribute Access

```dy examples/syntax/edge-nested-attributes.dygram
machine "Nested Attribute Access Example" {
    config: { enabled: true, maxRetries: 3 };
    settings: { retry: { maxAttempts: 5 } };
}

task Start;
task Process;
task Retry;
task Disabled;

Start -> Process;
Process -when: config.enabled == true-> Retry;
Process -when: config.enabled == false-> Disabled;
```

### Template Variable Syntax

You can use template variable syntax `{{ nodeName.attributeName }}` which is automatically converted to CEL syntax:


## Real-World Examples

### Retry Logic

```dy examples/advanced/retry-logic.dygram
machine "Retry Logic Pattern" {
    errorCount: 0;
    retryCount: 0;
    maxRetries: 3;
}

task Start;
task Process;
task Retry;
task Failed;
task Success;

Start -> Process;
Process -when: errorCount > 0 && retryCount < maxRetries-> Retry;
Process -when: errorCount > 0 && retryCount >= maxRetries-> Failed;
Process -when: errorCount == 0-> Success;
Retry -> Process;
```

### Circuit Breaker Pattern

```dy examples/advanced/circuit-breaker.dygram
machine "Circuit Breaker Pattern" {
    errorCount: 0;
    threshold: 5;
    circuitOpen: false;
}

task Start;
task Process;
task OpenCircuit;
task CloseCircuit;
task Failed;

Start -> Process;
Process -when: errorCount > threshold && circuitOpen == false-> OpenCircuit;
Process -when: circuitOpen == true-> Failed;
OpenCircuit -when: errorCount < threshold-> CloseCircuit;
CloseCircuit -> Process;
```

### State-Based Routing

```dy examples/advanced/state-routing.dygram
machine "State-Based Routing" {
    status: "pending";
    priority: 1;
}

task Start;
task Process;
task Success;
task Failure;
task Pending;
task HighPriority;

Start -> Process;
Process -when: status == "success"-> Success;
Process -when: status == "failure"-> Failure;
Process -when: status == "pending"-> Pending;
Process -when: priority > 5-> HighPriority;
```


## Migration from JavaScript eval()

Prior to version 0.3.5, DyGram used JavaScript `eval()` for condition evaluation, which posed security risks. The CEL integration provides a safe, sandboxed alternative.

### Key Differences

1. **Equality Operators**: Use `==` and `!=` instead of `===` and `!==`
2. **Variable Access**: Variables are accessed directly by name (no need for special syntax)
3. **Sandboxed**: No access to JavaScript globals or functions
4. **Type Safety**: CEL enforces type checking

### Automatic Conversion

The executor automatically converts JavaScript-style operators to CEL equivalents:


## Visual Indicators

DyGram provides visual feedback for conditional edges in static diagrams by evaluating conditions before runtime:

### Edge Styling Based on Evaluation

- **Active edges** (condition evaluates to `true`):
  - Rendered as **solid green** lines (penwidth=2)
  - Indicates the edge is likely to be traversed

- **Inactive edges** (condition evaluates to `false`):
  - Rendered as **dashed gray** lines (penwidth=1)
  - Indicates the edge is unlikely to be traversed

- **Error edges** (evaluation failed):
  - Rendered as **dashed red** lines (penwidth=1)
  - Indicates a problem with the condition expression

### Static Evaluation Context

Conditions are evaluated using machine-level attributes as defaults:

```dy
machine Workflow {
    maxRetries: 3;
    errorThreshold: 5;
}

task Start;
task Process;
task Retry;
task Failed;

Start -> Process;
Process -when: errorCount < errorThreshold-> Retry;  // Evaluated as true (0 < 5)
Process -when: errorCount >= errorThreshold-> Failed; // Evaluated as false (0 >= 5)
```

In this example:
- The edge to `Retry` would be rendered in **green** (solid) because `errorCount` defaults to `0` and the condition `0 < 5` evaluates to `true`
- The edge to `Failed` would be rendered in **gray** (dashed) because `0 >= 5` evaluates to `false`

This provides immediate visual feedback about the likely execution paths before runtime.

## Best Practices

1. **Keep Conditions Simple**: Complex conditions can be hard to debug. Consider breaking complex logic into multiple nodes.

2. **Use Descriptive Variable Names**: Make conditions self-documenting.

3. **Leverage Context Nodes**: Store configuration and state in context nodes for better organization.

4. **Test Edge Cases**: Ensure your conditions handle boundary cases correctly.

5. **Use Parentheses**: Even when not strictly necessary, parentheses improve readability.

6. **Consider Default Values**: Remember that static visual indicators use default values (errorCount=0, activeState='') unless machine-level attributes override them.

## Error Handling

If a condition fails to evaluate (syntax error, undefined variable, etc.), the condition returns `false` by default (fail-safe behavior). This prevents unexpected transitions when conditions are malformed.


## See Also

- [Advanced Features](./AdvancedFeatures.mdx)
- [Syntax Guide](./SyntaxGuide.mdx)
- [Error Handling Examples](../examples/advanced/error-handling.dy)
- [CEL Language Specification](https://github.com/google/cel-spec)
