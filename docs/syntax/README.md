# DyGram Syntax Reference

Complete reference for the DyGram language syntax.

## Table of Contents

## Machine Declaration

Every DyGram file can optionally start with a machine declaration:

```dygram
machine "My Machine"
```

With annotations:

```dygram
machine "Production System" @Critical @Version("2.0")
```

With machine-level attributes:

```dygram
machine "API Service" {
    version: "1.0.0";
    environment: "production";
};
```

## Nodes

Nodes are the fundamental building blocks of a machine.

### Basic Syntax

```dygram
nodeName;
```

### With Optional Type

```dygram
Task process;
State ready;
Input data;
Output result;
```

Common node types: `Task`, `State`, `Input`, `Output`, `Context`, `Resource`, `Concept`, `Implementation`, etc.

### With Title

```dygram
Task process "Process the data";
```

### With Attributes

```dygram
Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 4096;
};
```

### With Annotations

```dygram
Task critical @Critical @Async;
Resource legacy @Deprecated("Use newResource instead");
```

### Nested Nodes

```dygram
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

```dygram
start -> end;
```

### Multiple Targets

```dygram
start -> task1, task2, task3;
```

### Chain Syntax

```dygram
start -> process -> validate -> complete;
```

### Arrow Types

DyGram supports multiple arrow types for semantic relationships:

```dygram
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

```dygram
a -label-> b;
a --label--> b;
a =label=> b;
```

### Edge Attributes

```dygram
a -condition: true, priority: 1-> b;
```

### Multiplicity

```dygram
User "1" --> "*" Post;
Order "1" --> "1..*" LineItem;
```

### Edge Annotations

```dygram
a -@style("color: red; stroke-width: 3px")-> b;
```

## Attributes

Attributes add metadata and configuration to nodes.

### Basic Attributes

```dygram
name: "value";
count: 42;
enabled: true;
```

### Typed Attributes

```dygram
port<number>: 3000;
host<string>: "localhost";
timeout<Duration>: "30s";
```

### Generic Types

```dygram
results<Array<string>>: ["a", "b", "c"];
data<Map<string, number>>: #dataMap;
promise<Promise<Result>>: #pending;
```

### Array Values

```dygram
tags: ["api", "production", "critical"];
ports: [8080, 8081, 8082];
```

### External References

```dygram
config: #globalConfig;
handler: #processHandler;
```

## Types

DyGram supports type annotations for validation.

### Built-in Types

- `string` - Text values
- `number` - Numeric values (integers and floats)
- `boolean` - true/false
- `Date` - ISO 8601 dates
- `UUID` - UUID strings
- `URL` - Valid URLs
- `Duration` - Time durations
- `Integer` - Integer numbers only
- `Float` - Floating-point numbers

### Generic Types

```dygram
Array<T>
List<T>
Map<K, V>
Promise<T>
Result<T, E>
```

### Custom Types

You can use any identifier as a type:

```dygram
user<User>: #currentUser;
config<AppConfig>: #config;
```

## Annotations

Annotations add semantic metadata to nodes and edges.

### Node Annotations

```dygram
@Abstract
@Singleton
@Async
@Deprecated
@Critical
@ReadOnly
```

With values:

```dygram
@Version("2.0")
@Author("John Doe")
@Since("2024-01-15")
@Deprecated("Use NewTask instead")
```

Multiple annotations:

```dygram
Task important @Critical @Async @Version("1.0");
```

### Edge Annotations

```dygram
start -@style("color: blue")-> end;
a -@weight(5)-> b;
```

## Notes

Notes attach documentation to nodes:

```dygram
Task process;

note process "This task handles data processing";
```

With title and attributes:

```dygram
note process "Processing Details" @Critical {
    complexity: "O(n)";
    author: "Team A";
};
```

## Comments

### Single-line Comments

```dygram
// This is a comment
Task process; // inline comment
```

### Multi-line Comments

```dygram
/*
 * This is a multi-line comment
 * explaining complex logic
 */
Task analyze;
```

## Identifiers

Identifiers must start with a letter or underscore, followed by letters, digits, or underscores:

```dygram
validName
_private
user123
handle_event
```

### Qualified Names

Reference nested nodes using dot notation:

```dygram
workflow.start -> workflow.process;
parent.child.grandchild;
```

## Strings

### Double-quoted Strings

```dygram
title: "Hello World";
```

### Multi-line Strings

```dygram
prompt: "This is a long prompt
that spans multiple lines
and preserves formatting";
```

## Numbers

```dygram
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
note fetchData "Fetches data from external API" @Documentation {
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
