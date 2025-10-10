# Advanced Features Examples

This directory contains examples demonstrating advanced DyGram features including relationship types, annotations, multiplicity, dependency inference, and error handling patterns.

## Examples

### `annotations.dygram`
Annotation system demonstrating metadata on nodes:
- `@Abstract` - Abstract base classes that cannot be instantiated
- `@Singleton` - Single instance pattern
- `@Deprecated("reason")` - Deprecated nodes with migration guidance
- `@Async` - Asynchronous execution
- `@Critical` - Critical path components
- Multiple annotations on single nodes

### `multiplicity.dygram`
Multiplicity and cardinality in relationships:
- `"1"` - Exactly one (one-to-one)
- `"*"` - Zero or more (one-to-many)
- `"0..1"` - Zero or one (optional)
- `"1..*"` - One or more (required one-to-many)
- `"2..5"` - Specific range relationships
- Validation of multiplicity constraints

### `dependency-inference.dygram`
Automatic dependency inference from template variables:
- Template variable syntax: `{{nodeName.attributeName}}`
- Automatic dependency edge creation
- Multiple context dependencies
- Nested attribute references
- Compile-time validation of references

### `complete-example.dygram`
Comprehensive example combining all Phase 2 features:
- All relationship types
- Multiplicity annotations
- Dependency inference
- Multiple node types
- Real-world patterns

### `error-handling.dygram`
Common error handling patterns:
- Try-Catch-Finally pattern
- Retry with exponential backoff
- Circuit breaker pattern
- Fallback pattern
- Timeout handling
- Compensating transactions (Saga pattern)
- Dead letter queue pattern
- Validation with detailed errors

### `optional-types.dygram`
Optional types and null handling:
- Optional type syntax with `?` suffix
- Null value handling
- Optional vs required fields
- Optional relationships
- Optional generic types
- Null coalescing patterns
- Type inference with optionals

## Key Concepts

### Relationship Types

DyGram supports semantic relationship types:

| Arrow | Meaning | Use Case |
|-------|---------|----------|
| `->` | Association | Standard transitions |
| `-->` | Dependency | Configuration dependencies |
| `<\|--` | Inheritance | Type hierarchies |
| `*-->` | Composition | Strong ownership |
| `o-->` | Aggregation | Weak ownership |
| `<-->` | Bidirectional | Mutual dependencies |
| `=>` | Fat Arrow | Critical paths |

### Annotations

Annotations provide metadata about nodes:

```dygram
task BaseHandler @Abstract {
    desc: "Base class";
}

context Config @Singleton {
    apiKey: "secret";
}

task OldAPI @Deprecated("Use NewAPI") {
    endpoint: "/v1/old";
}

task AsyncTask @Async @Critical {
    timeout: 5000;
}
```

### Multiplicity

Express quantitative relationships:

```dygram
User "1" -> "*" Order;        // One user, many orders
Order "1" -> "1" Payment;      // One-to-one
Student "*" -> "*" Course;     // Many-to-many
User "1" -> "0..1" Profile;    // Optional relationship
```

### Dependency Inference

Template variables automatically create dependencies:

```dygram
context config {
    timeout<number>: 5000;
}

task apiCall {
    prompt: "Call API with {{config.timeout}}ms timeout";
}
// Automatic dependency: apiCall ..> config
```

### Optional Types

Use `?` suffix for nullable types:

```dygram
task userProfile {
    userId<string>: "user123";       // Required
    phoneNumber<string?>: null;      // Optional
    avatar<string?>: null;           // Optional
}
```

## Usage

These examples demonstrate:
- **Expressive relationships** - Clear semantic meaning
- **Type safety** - Optional and required types
- **Error resilience** - Comprehensive error handling
- **Metadata** - Rich annotations and documentation
- **Validation** - Compile-time checks

## See Also

- [Advanced Features](../../docs/advanced-features.md) - Complete documentation
- [Syntax Guide](../../docs/syntax-guide.md) - Syntax reference
- [Examples Index](../../docs/examples-index.md) - All examples
