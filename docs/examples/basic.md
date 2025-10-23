# Basic Examples

Fundamental concepts and simple machine definitions.

## Hello World

The simplest possible machine:

```dygram
machine "Hello World"

Task greet {
    prompt: "Say hello to the world";
};
```

This minimal example shows:
- A machine with a title
- A single `Task` node
- A `prompt` attribute

## Simple Workflow

A basic linear workflow:

```dygram
machine "Simple Workflow"

Task start "Initialize";
Task process "Process data";
Task complete "Finalize";

start -> process -> complete;
```

Key concepts:
- Multiple nodes with titles
- Sequential edges using `->` arrows
- Chaining: `A -> B -> C` creates two edges

## Nodes with Attributes

Adding configuration to nodes:

```dygram
machine "Configured Tasks"

Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 2048;
    prompt: "Analyze the input data";
};

Input data {
    format: "json";
    schema: #inputSchema;
};

data -> analyze;
```

Attribute features:
- Nodes can have multiple attributes
- Attribute values can be strings, numbers, or references (`#inputSchema`)
- Common LLM configuration: `model`, `temperature`, `max_tokens`, `prompt`

## Multiple Node Types

Different node types for different purposes:

```dygram
machine "Node Types Demo"

Input source "Data source";
Task process "Process data";
State ready "Ready state";
Output result "Final result";
Context config "Configuration";
Resource database "Database connection";

source -> process -> ready -> result;
```

Node types:
- `Input` - Entry points for data
- `Task` - Executable actions (often LLM-powered)
- `State` - State machine states
- `Output` - Exit points for results
- `Context` - Configuration and shared state
- `Resource` - External resources
- `Process` - Container for nested nodes (see advanced examples)

## Next Steps

- **[Workflows](./workflows.md)** - Branching and parallel patterns
- **[State Machines](./state-machines.md)** - State transitions
- **[Advanced Features](./advanced-features.md)** - Nesting and more complex patterns
