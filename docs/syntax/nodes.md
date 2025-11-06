# Nodes

Nodes are the fundamental building blocks of a DyGram machine. They represent states, tasks, concepts, resources, or any entity in your system.

## Basic Syntax

The simplest node is just an identifier:

```dy examples/syntax/machine-basic.dygram
nodeName;
```

## With Type

Nodes can have an optional type prefix:

```dy examples/syntax/node-types.dygram
Task process;
State ready;
Input data;
Output result;
```

### Common Node Types

Node types are case-insensitive and semantic. Common types include:

- **`Task`** - Work to be performed
- **`State`** - System state
- **`Input`** - Data input
- **`Output`** - Data output
- **`Context`** - Contextual information
- **`Resource`** - External resources
- **`Concept`** - Abstract concepts
- **`Implementation`** - Concrete implementations
- **`Process`** - Business processes
- **`Note`** - Documentation annotations (see [Notes](#notes))

You can use any identifier as a type - DyGram doesn't restrict type names.

## With Title

Add a human-readable title after the node name:

```dy examples/syntax/node-title.dygram
Task process "Process the data";
```

## With Attributes

Nodes can have typed attributes in a block:

```dy examples/syntax/node-attributes.dygram
Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 4096;
};
```

See [Attributes](attributes.md) for detailed syntax and type options.

## With Annotations

Annotate nodes with metadata:

```dy examples/syntax/node-annotations.dygram
Task critical @Critical @Async;
Resource legacy @Deprecated("Use newResource instead");
```

See [Annotations](annotations.md) for available annotation types.

## Nested Nodes

Nodes can contain other nodes, creating hierarchical structure:

```dy examples/syntax/node-nesting.dygram
Process workflow {
    Task start "Initialize";
    Task validate "Validate input";
    Task process "Process data";

    start -> validate -> process;
};
```

### Referencing Nested Nodes

Nested nodes can be referenced using [qualified names](qualified-names.md):

```dy
Workflow {
    task Step1;
    task Step2;
}

Start -> Workflow.Step1;
Workflow.Step1 -> Workflow.Step2;
```

## Qualified Names

Nodes can be defined with qualified names for quick scaffolding:

```dy
// Create implicit namespace structure
task API.Authentication "Auth handler";
task API.DataFetch "Data retrieval";

Start -> API.Authentication -> API.DataFetch -> End;
```

See the [Qualified Names Guide](qualified-names.md) for comprehensive documentation on this feature.

## Notes

Notes are special nodes that attach documentation to other nodes:

```dy
Task process;

Note process "This task handles data processing";
```

Notes have special behavior:
- Create an inferred dashed edge to their target node
- Render with a note shape in diagrams
- Target node is specified by the note's name

With attributes and annotations:

```dy
Note process "Processing Details" @Critical {
    complexity: "O(n)";
    author: "Team A";
};
```

## Complete Node Syntax

A node can combine all features:

```dy
Type NodeName "Title" @Annotation1 @Annotation2("value") {
    attribute1: "value1";
    attribute2<number>: 42;
    nested<Array<string>>: ["a", "b"];
};
```

## Best Practices

### Naming Conventions
- Use **camelCase** or **PascalCase** for node names
- Use **descriptive names** that indicate purpose
- Use **consistent casing** throughout your machine

### Type Usage
- Use **semantic types** that convey meaning
- Be **consistent** with type names across your machine
- Consider **domain-specific types** (e.g., `Handler`, `Service`, `Repository`)

### Nesting
- Nest nodes to show **logical grouping**
- Keep nesting **2-3 levels deep** maximum
- Use [qualified names](qualified-names.md) for **quick scaffolding**

### Documentation
- Use **Notes** for important documentation
- Add **annotations** for metadata
- Include **attributes** for configuration

## Examples

### Minimal Node
```dy
process;
```

### Typed Node with Title
```dy
Task authenticate "Authenticate user";
```

### Fully Featured Node
```dy
Task processPayment "Process Payment Transaction" @Critical @Async {
    provider: "stripe";
    timeout<Duration>: "PT30S";
    retries<number>: 3;
    fallback: #backupProcessor;
};
```

### Nested Workflow
```dy
Process OrderWorkflow "Order Processing" @Version("2.0") {
    State Received "Order received";
    State Processing "Processing order";
    State Completed "Order completed";
    State Failed "Order failed";

    Received -> Processing;
    Processing -> Completed;
    Processing -> Failed;
};
```

### Quick Scaffolding with Qualified Names
```dy
// Rapidly define structure without explicit nesting
task Auth.Login "Login handler";
task Auth.Logout "Logout handler";
task Data.Fetch "Fetch data";
task Data.Store "Store data";

Auth.Login -> Data.Fetch -> Data.Store -> Auth.Logout;
```

## See Also

- [Qualified Names](qualified-names.md) - Dot notation for references and definitions
- [Edges](edges.md) - Connecting nodes with relationships
- [Attributes](attributes.md) - Typed configuration for nodes
- [Annotations](annotations.md) - Metadata for nodes
- [Identifiers](identifiers.md) - Naming rules and conventions
