# Language Reference

Complete reference for the DyGram language syntax.

## Table of Contents

## Machine Declaration

Every DyGram file can optionally start with a machine declaration:

```dygram !no-extract
machine "My Machine"
```

With annotations:

```dygram !no-extract
machine "Production System" @Critical @Version("2.0")
```

With machine-level attributes:

```dygram !no-extract
machine "API Service" {
    version: "1.0.0";
    environment: "production";
};
```

## Nodes

Nodes are the fundamental building blocks of a machine.

### Basic Syntax

```dygram !no-extract
nodeName;
```

### With Optional Type

```dygram !no-extract
Task process;
State ready;
Input data;
Output result;
```

Common node types: `Task`, `State`, `Input`, `Output`, `Context`, `Resource`, `Concept`, `Implementation`, etc.

### With Title

```dygram !no-extract
Task process "Process the data";
```

### With Attributes

```dygram !no-extract
Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 4096;
};
```

### With Annotations

```dygram !no-extract
Task critical @Critical @Async;
Resource legacy @Deprecated("Use newResource instead");
```

### Nested Nodes

```dygram !no-extract
Process workflow {
    Task start "Initialize";
    Task validate "Validate input";
    Task process "Process data";

    start -> validate -> process;
};
```

## Edges

Edges define relationships and transitions between nodes.

### Basic Edges

```dygram !no-extract
start -> end;
```

### Multiple Targets

```dygram !no-extract
start -> task1, task2, task3;
```

### Chain Syntax

```dygram !no-extract
start -> process -> validate -> complete;
```

### Arrow Types

DyGram supports multiple arrow types for semantic relationships:

```dygram !no-extract
// Single arrow (default transition)
a -> b;

// Double arrow (strong association)
a --> b;

// Fat arrow (transformation)
a => b;

// Inheritance
Child <|-- Parent;

// Composition (strong ownership)
Container *--> Component;

// Aggregation (weak ownership)
Group o--> Member;

// Bidirectional
a <--> b;
```

### Edge Labels

```dygram !no-extract
a -label-> b;
a --label--> b;
a =label=> b;
```

### Edge Attributes

```dygram !no-extract
a -condition: true, priority: 1-> b;
```

### Multiplicity

```dygram !no-extract
User "1" --> "*" Post;
Order "1" --> "1..*" LineItem;
```

### Edge Annotations

```dygram !no-extract
a -@style("color: red; stroke-width: 3px")-> b;
```

## Attributes

Attributes add metadata and configuration to nodes.

### Basic Attributes

```dygram !no-extract
name: "value";
count: 42;
enabled: true;
```

### Typed Attributes

```dygram !no-extract
port<number>: 3000;
host<string>: "localhost";
timeout<Duration>: "30s";
```

### Generic Types

```dygram !no-extract
results<Array<string>>: ["a", "b", "c"];
data<Map<string, number>>: #dataMap;
promise<Promise<Result>>: #pending;
```

### Array Values

```dygram !no-extract
tags: ["api", "production", "critical"];
ports: [8080, 8081, 8082];
```

### External References

```dygram !no-extract
config: #globalConfig;
handler: #processHandler;
```

## Types

DyGram supports type annotations for validation using Zod-powered runtime type checking.

### Built-in Types

**Primitive Types:**
- `string` - Text values
- `number` - Numeric values (integers and floats)
- `boolean` - true/false

**Specialized String Types:**
- `Date` - ISO 8601 datetime strings (e.g., `"2025-10-22T13:30:00Z"`)
  - Must include time and timezone (Z format)
- `UUID` - UUID strings (e.g., `"550e8400-e29b-41d4-a716-446655440000"`)
- `URL` - Valid URLs (e.g., `"https://example.com"`)
- `Duration` - ISO 8601 durations (e.g., `"P1Y2M3D"`, `"PT4H5M6S"`)

**Numeric Subtypes:**
- `Integer` - Integer numbers only (validates at runtime)
- `Float` - Floating-point numbers (alias for `number`)

**Example:**
```dygram !no-extract
task myTask {
  id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
  createdAt<Date>: "2025-10-22T13:30:00Z";
  endpoint<URL>: "https://api.example.com";
  timeout<Duration>: "PT1H30M";
  count<Integer>: 42;
  price<Float>: 19.99;
}
```

### Generic Types

Generic types support parameterized validation:

```dygram !no-extract
Array<T>        # Array of type T (e.g., Array<Date>)
List<T>         # Alias for Array<T>
Map<K, V>       # Map with keys of type K and values of type V
Promise<T>      # Promise resolving to type T (structural only)
Result<T, E>    # Result type (structural only)
```

**Example with validated generics:**
```dygram !no-extract
task myTask {
  // Array elements are validated as Dates
  dates<Array<Date>>: ["2025-10-22T13:30:00Z", "2025-10-23T14:00:00Z"];

  // Array elements are validated as Integers
  counts<Array<Integer>>: [1, 2, 3];
}
```

### Custom Types

You can register custom types programmatically using the TypeRegistry:

```typescript
import { z } from 'zod';

// Get the type registry from TypeChecker
const typeChecker = new TypeChecker(machine);
const registry = typeChecker.getTypeRegistry();

// Register a custom Email type
registry.register('Email', z.string().email());

// Register a custom SemVer type
registry.register('SemVer', z.string().regex(/^\d+\.\d+\.\d+$/));
```

Then use them in your DyGram files:

```dygram !no-extract
user {
  email<Email>: "user@example.com";
  version<SemVer>: "1.2.3";
}
```

## Annotations

Annotations add semantic metadata to nodes and edges.

### Node Annotations

```dygram !no-extract
@Abstract
@Singleton
@Async
@Deprecated
@Critical
@ReadOnly
```

With values:

```dygram !no-extract
@Version("2.0")
@Author("John Doe")
@Since("2024-01-15")
@Deprecated("Use NewTask instead")
```

Multiple annotations:

```dygram !no-extract
Task important @Critical @Async @Version("1.0");
```

### Edge Annotations

```dygram !no-extract
start -@style(color: blue;)-> end;
a -@weight(5)-> b;
```

## Notes

Notes attach documentation to nodes. The note's name references the target node, and the title contains the note content:

```dygram !no-extract
Task process;

Note process "This task handles data processing";
```

With annotations and attributes:

```dygram !no-extract
Note process "Processing Details" @Critical {
    complexity: "O(n)";
    author: "Team A";
};
```

Notes create an inferred dashed edge to their target node and render with a note shape in diagrams. Node types (including `Note`) are case-insensitive, so `note`, `Note`, and `NOTE` are all equivalent.

## Comments

### Single-line Comments

```dygram !no-extract
// This is a comment
Task process; // inline comment
```

### Multi-line Comments

```dygram !no-extract
/*
 * This is a multi-line comment
 * explaining complex logic
 */
Task analyze;
```

## Identifiers

Identifiers must start with a letter or underscore, followed by letters, digits, or underscores:

```dygram !no-extract
validName
_private
user123
handle_event
```

### Qualified Names

Reference nested nodes using dot notation:

```dygram !no-extract
workflow.start -> workflow.process;
parent.child.grandchild;
```

## Strings

### Double-quoted Strings

```dygram !no-extract
title: "Hello World";
```

### Multi-line Strings

```dygram !no-extract
prompt: "This is a long prompt
that spans multiple lines
and preserves formatting";
```

## Numbers

```dygram !no-extract
count: 42;
price: 19.99;
scientific: 1.5e10;
temperature: -273.15;
```

## Complete Example

```dygram examples/syntax/complete.dygram
machine "Complete Syntax Demo" @Version("1.0") {
    environment: "demo";
};

// Context node with typed attributes
Context config {
    apiKey<string>: "secret";
    maxRetries<number>: 3;
    timeout<Duration>: "30s";
    endpoints<Array<string>>: ["api.example.com"];
};

// Task with annotations
Task fetchData @Async @Critical {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
};

// State nodes
State ready "Ready State";
State processing "Processing";
State complete "Complete";

// Workflow with nested nodes
Process workflow "Main Workflow" {
    Task validate "Validate Input";
    Task transform "Transform Data";
    Task save "Save Results";

    validate -> transform -> save;
};

// Various edge types
ready -> fetchData;
fetchData --> processing;
processing => complete;

// Edges with attributes and multiplicity
config "1" -provides-> "*" workflow;

// Notes
Note fetchData "Fetches data from external API" @Documentation {
    complexity: "O(1)";
    author: "System";
};
```

## Next Steps

- **[CLI Reference](../cli/README.md)** - Learn command-line tools
- **[API Reference](../api/README.md)** - Programmatic usage
- **[Examples](../examples/README.md)** - Practical patterns

---

**See Also**: [Grammar Definition](../../src/language/machine.langium) for the formal specification
