# @StrictMode Annotation

The `@StrictMode` annotation controls how the Machine language handles undefined node references in edges.

## Default Behavior (Non-Strict Mode)

By default, when you reference a node in an edge that hasn't been explicitly defined, the system will **automatically create** that node for you:

```dy examples/annotations/no-strict.dygram
problem;
solution;
problem -> solution;
one -> two;  // 'one' and 'two' are auto-created
```

This results in 4 nodes: `problem`, `solution`, `one`, and `two`.

## Strict Mode

When you add the `@StrictMode` annotation to your machine, all node references must be explicitly defined before use:

```dy examples/annotations/strict.dygram
machine "MyMachine" @StrictMode

problem;
solution;
problem -> solution;
one -> two;  // ERROR: 'one' and 'two' are undefined
```

In strict mode, you'll get linking errors for undefined nodes:
- "Could not resolve reference to Node named 'one'."
- "Could not resolve reference to Node named 'two'."

## Use Cases

### Non-Strict Mode (Default)
- **Rapid prototyping**: Quickly sketch out workflows without defining every node
- **Exploratory design**: Focus on relationships first, details later
- **Simple diagrams**: When node definitions aren't critical

### Strict Mode
- **Production code**: Ensure all nodes are explicitly defined
- **Large projects**: Catch typos and missing definitions early
- **Team collaboration**: Enforce explicit node declarations

## Example: Rapid Prototyping

```dy examples/basic/sketch.dygram
// Quick workflow sketch - nodes auto-created
start -> authenticate -> validate -> process -> complete;
process -> error -> retry -> process;
```

## Example: Strict Production Code

```dy examples/annotations/strict-auth-example.dygram
machine "UserAuth" @StrictMode

init start;
task authenticate;
task validate;
task process;
state complete;
state error;
task retry;

start -> authenticate;
authenticate -> validate;
validate -> process;
process -> complete;
process -> error;
error -> retry;
retry -> process;
