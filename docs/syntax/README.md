# Language Reference

Complete reference for the DyGram language syntax. DyGram is a declarative language for defining machines, workflows, state machines, and system architectures.

## Quick Links

**Core Concepts:**
- **[Machines](machines.md)** - Top-level machine declarations
- **[Nodes](nodes.md)** - Building blocks of your machine
- **[Edges](edges.md)** - Relationships and transitions
- **[Attributes](attributes.md)** - Typed metadata and configuration

**Advanced Features:**
- **[Types](types.md)** - Type system and validation
- **[Annotations](annotations.md)** - Semantic metadata
- **[Identifiers](identifiers.md)** - Naming rules and conventions
- **[Qualified Names](qualified-names.md)** - Dot notation for references
- **[Templates](templates.md)** - Template strings and variable references
- **[Imports](imports.md)** - Multi-file projects and modular design

## Getting Started

### Hello World

The simplest DyGram machine:

```dygram
Start -> End;
```

### Basic Workflow

A typical workflow with nodes and edges:

```dygram
machine "Simple Workflow"

Task validate "Validate Input";
Task process "Process Data";
Task complete "Complete Task";

Start -> validate -> process -> complete -> End;
```

### With Types and Attributes

Adding structure and configuration:

```dygram
machine "API Service" {
    version: "1.0.0";
    environment: "production";
};

Context config {
    apiKey<string>: #envApiKey;
    timeout<Duration>: "PT30S";
};

Task authenticate @Critical {
    provider: "OAuth2";
};

Task fetchData @Async {
    endpoint<URL>: "https://api.example.com";
};

Start -> authenticate --> fetchData -> End;
```

## Language Overview

### Machines

Machines are the top-level container. They're optional but provide a way to name and configure your definition.

```dygram
machine "My Machine" @Version("1.0") {
    environment: "production";
};
```

Learn more: **[Machines](machines.md)**

### Nodes

Nodes represent entities in your system: tasks, states, resources, or concepts.

```dygram
Task process;                    // Simple node
Task analyze "Analyze Data";     // With title
State ready @Critical;           // With annotation

Task configured {                // With attributes
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
};
```

Learn more: **[Nodes](nodes.md)**

### Edges

Edges define relationships and transitions between nodes.

```dygram
start -> end;                    // Basic edge
a -> b, c, d;                    // Multiple targets
a -> b -> c -> d;                // Chain syntax

a -label-> b;                    // Labeled edge
a -condition: true-> b;          // With attributes
a --> b;                         // Strong association
a => b;                          // Transformation
```

Learn more: **[Edges](edges.md)**

### Attributes

Attributes add typed configuration and metadata.

```dygram
task myTask {
    name<string>: "Process";
    count<Integer>: 42;
    timeout<Duration>: "PT30S";
    tags<Array<string>>: ["critical", "api"];
};
```

Learn more: **[Attributes](attributes.md)** and **[Types](types.md)**

### Nesting

Nodes can contain other nodes for hierarchical organization:

```dygram
Workflow {
    Task start;
    Task process;
    Task complete;

    start -> process -> complete;
};
```

Reference nested nodes using qualified names:

```dygram
Init -> Workflow.start;
Workflow.complete -> Done;
```

Learn more: **[Qualified Names](qualified-names.md)**

### Annotations

Add semantic metadata with annotations:

```dygram
machine "System" @Critical @Version("2.0")

Task important @Critical @Async {
    priority: 1;
};

start -@style("color: red;")-> end;
```

Learn more: **[Annotations](annotations.md)**

### Templates

Reference dynamic values using template strings:

```dygram
Context config {
    apiUrl: "https://api.example.com";
};

Task apiCall {
    endpoint: "{{ config.apiUrl }}";
};
```

Learn more: **[Templates](templates.md)**

## Complete Example

Here's a comprehensive example demonstrating all major features:

```dygram
machine "Order Processing System" @Version("2.0") @Critical {
    environment: "production";
    region: "us-east-1";
};

// Configuration context
Context config {
    paymentProvider<string>: "stripe";
    inventoryDb<URL>: "https://inventory.example.com";
    timeout<Duration>: "PT5M";
    maxRetries<Integer>: 3;
};

// Payment workflow
Process PaymentWorkflow {
    Task Validate "Validate Payment Method" @Critical;
    Task Process "Process Transaction" @Async;
    Task Confirm "Confirm Payment";

    Validate -> Process -> Confirm;
};

// Inventory workflow
Process InventoryWorkflow {
    Task Check "Check Availability";
    Task Reserve "Reserve Items";
    Task Allocate "Allocate Stock";

    Check -> Reserve -> Allocate;
};

// Main workflow states
State OrderReceived "Order received";
State Processing "Processing order";
State Completed "Order completed";
State Failed "Order failed";

// Wire up workflows
OrderReceived -> PaymentWorkflow.Validate;
PaymentWorkflow.Confirm -> InventoryWorkflow.Check;
InventoryWorkflow.Allocate -> Processing;

Processing -condition: "success";-> Completed;
Processing -condition: "error";-> Failed;

// Fallback path
Failed -retries: 3;-> PaymentWorkflow.Validate;

// Documentation
note PaymentWorkflow "Handles all payment processing with Stripe integration" {
    complexity: "O(1)";
    owner: "Payment Team";
};

note InventoryWorkflow "Manages inventory checking and allocation" {
    database: "{{ config.inventoryDb }}";
    timeout: "{{ config.timeout }}";
};
```

## Key Concepts

### Types Are Optional

DyGram is designed to be flexible. You can write simple, untyped machines:

```dygram
start -> process -> end;
```

Or add types for validation and tooling support:

```dygram
task process {
    count<Integer>: 42;
    id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
};
```

### Semantic, Not Structural

Node types like `Task`, `State`, `Context` are semantic labels, not rigid structural constraints. Use types that make sense for your domain.

### Expressive Edges

Multiple arrow types convey different relationships:
- `->` for transitions
- `-->` for strong dependencies
- `=>` for transformations
- `<|--` for inheritance
- `*-->` for composition
- `o-->` for aggregation

### Hierarchical Organization

Use nesting and qualified names to organize complex systems:

```dygram
API {
    Auth {
        Login;
        Logout;
    }
    Data {
        Fetch;
        Store;
    }
};

Start -> API.Auth.Login -> API.Data.Fetch;
```

## Language Features

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **Machines** | Top-level declarations | [machines.md](machines.md) |
| **Nodes** | Building blocks | [nodes.md](nodes.md) |
| **Edges** | Relationships | [edges.md](edges.md) |
| **Attributes** | Configuration | [attributes.md](attributes.md) |
| **Types** | Type system | [types.md](types.md) |
| **Annotations** | Metadata | [annotations.md](annotations.md) |
| **Nesting** | Hierarchy | [nodes.md#nested-nodes](nodes.md#nested-nodes) |
| **Qualified Names** | Dot notation | [qualified-names.md](qualified-names.md) |
| **Templates** | Variable references | [templates.md](templates.md) |
| **Imports** | Multi-file projects | [imports.md](imports.md) |
| **Comments** | Documentation | Single-line `//` and multi-line `/* */` |

## Common Patterns

### State Machine

```dygram
State Idle;
State Running;
State Paused;
State Stopped;

Idle -start-> Running;
Running -pause-> Paused;
Paused -resume-> Running;
Running -stop-> Stopped;
```

### Task Pipeline

```dygram
Task input "Receive Input";
Task validate "Validate Data";
Task transform "Transform Data";
Task output "Send Output";

input -> validate -> transform -> output;
```

### Hierarchical System

```dygram
System {
    Frontend {
        UI;
        Router;
    }
    Backend {
        API;
        Database;
    }
};

System.Frontend.UI --> System.Backend.API;
System.Backend.API --> System.Backend.Database;
```

### Configuration-Driven

```dygram
Context config {
    apiUrl<URL>: "https://api.example.com";
    timeout<Duration>: "PT30S";
};

Task apiCall {
    endpoint: "{{ config.apiUrl }}";
    timeout: "{{ config.timeout }}";
};
```

## Next Steps

### Learn the Basics
1. Start with **[Nodes](nodes.md)** - understand the building blocks
2. Connect them with **[Edges](edges.md)** - create relationships
3. Add **[Attributes](attributes.md)** - configure your nodes

### Add Structure
4. Use **[Qualified Names](qualified-names.md)** - organize complex systems
5. Apply **[Annotations](annotations.md)** - add semantic metadata
6. Leverage **[Types](types.md)** - ensure data integrity

### Advanced Usage
7. Use **[Templates](templates.md)** - reference dynamic values
8. Study **[Identifiers](identifiers.md)** - master naming conventions
9. Explore examples in the **[Examples Directory](../../examples/)**

### Beyond Syntax
- **[CLI Reference](../cli/README.md)** - Command-line tools
- **[API Reference](../api/README.md)** - Programmatic usage
- **[Examples](../examples/README.md)** - Practical patterns

---

**See Also**: [Grammar Definition](../../src/language/machine.langium) for the formal specification
