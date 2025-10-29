# Language Reference

Complete reference for the DyGram language syntax.

## Table of Contents

## Machine Declaration

Every DyGram file can optionally start with a machine declaration:

```dygram examples/syntax/machine-title.dygram
machine "My Machine"
```

With annotations:

```dygram examples/syntax/machine-annotation.dygram
machine "Production System" @Critical @Version("2.0")
```

With machine-level attributes:

```dygram examples/syntax/machine-attributes.dygram
machine "API Service" {
    version: "1.0.0";
    environment: "production";
};
```

## Nodes

Nodes are the fundamental building blocks of a machine.

### Basic Syntax

```dygram examples/syntax/machine-basic.dygram
nodeName;
```

### With Optional Type

```dygram examples/syntax/node-types.dygram
Task process;
State ready;
Input data;
Output result;
```

Common node types: `Task`, `State`, `Input`, `Output`, `Context`, `Resource`, `Concept`, `Implementation`, etc.

### With Title

```dygram examples/syntax/node-title.dygram
Task process "Process the data";
```

### With Attributes

```dygram examples/syntax/node-attributes.dygram
Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 4096;
};
```

### With Annotations

```dygram examples/syntax/node-annotations.dygram
Task critical @Critical @Async;
Resource legacy @Deprecated("Use newResource instead");
```

### Nested Nodes

```dygram examples/syntax/node-nesting.dygram
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

```dygram examples/syntax/edge-basic.dygram
start -> end;
```

### Multiple Targets

```dygram examples/syntax/edge-multiple-targets.dygram
start -> task1, task2, task3;
```

### Chain Syntax

```dygram examples/syntax/edge-chaining.dygram
start -> process -> validate -> complete;
```

### Arrow Types

DyGram supports multiple arrow types for semantic relationships:

```dygram examples/syntax/edge-types.dygram
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

```dygram examples/syntax/edge-labels.dygram
a -label-> b;
a --label--> b;
a =label=> b;
```

### Edge Attributes

```dygram examples/syntax/edge-attributes.dygram
a -condition: true, priority: 1-> b;
```

### Multiplicity

```dygram examples/syntax/edge-multiplicity.dygram
User "1" --> "*" Post;
Order "1" --> "1..*" LineItem;
```

### Edge Annotations

```dygram examples/syntax/edge-annotations.dygram
a -@style("color: red; stroke-width: 3px")-> b;
```

## Attributes

Attributes add metadata and configuration to nodes.

### Basic Attributes

```dygram examples/syntax/attributes.dygram
name: "value";
count: 42;
enabled: true;
```

### Typed Attributes

```dygram examples/syntax/typed-attributes.dygram
port<number>: 3000;
host<string>: "localhost";
timeout<Duration>: "30s";
```

### Generic Types

```dygram examples/syntax/types-generic.dygram
results<Array<string>>: ["a", "b", "c"];
data<Map<string, number>>: #dataMap;
promise<Promise<Result>>: #pending;
```

### Array Values

```dygram examples/syntax/types-array.dygram
tags: ["api", "production", "critical"];
ports: [8080, 8081, 8082];
```

### External References

```dygram !examples/syntax/external-references.dygram
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
```dygram examples/syntax/types-built-in.dygram
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
```dygram examples/syntax/validated-generics.dygram
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

```dygram examples/syntax/comments-singleline.dygram
// This is a comment
Task process; // inline comment
```

### Multi-line Comments

```dygram examples/syntax/comments-multiline.dygram
/*
 * This is a multi-line comment
 * explaining complex logic
 */
Task analyze;
```

## Identifiers

Identifiers must start with a letter or underscore, followed by letters, digits, or underscores:

```dygram examples/syntax/node-identifiers.dygram
validName;
_private;
user123;
handle_event;
```

### Qualified Names

Reference nested nodes using dot notation:

```dygram examples/syntax/node-qualified-ids.dygram
workflow.start -> workflow.process;
parent.child.grandchild;
```

## Strings

### Double-quoted Strings

```dygram examples/syntax/strings.dygram
title: "Hello World";
```

### Multi-line Strings

```dygram examples/syntax/strings-multiline.dygram
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
