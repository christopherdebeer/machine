# DyGram Language Overview

DyGram is a declarative language for defining state machines, workflows, and process graphs with rich metadata.

## Core Concepts

### Machines
Every DyGram file defines a machine with a title:
```dygram
machine "My Machine"
```
[Example: examples/basic/minimal.dygram](../examples/basic/minimal.dygram)

### Nodes
Nodes are the fundamental building blocks. They can be untyped or have specific types:

**Untyped node:**
```dygram
myNode;
```
[Example: examples/basic/simple-nodes-3.dygram](../examples/basic/simple-nodes-3.dygram)

**Typed nodes:**
- `task` - Represents a processing step or action
- `state` - Represents a system state
- `init` - Initial/entry point
- `context` - Configuration or shared state

```dygram
task processData;
state waiting;
init startup;
context config;
```
[Example: examples/basic/typed-nodes.dygram](../examples/basic/typed-nodes.dygram)

### Node Labels
Nodes can have human-readable labels:
```dygram
init startup "System Initialization";
task process "Process User Data";
```
[Example: examples/basic/all-node-types.dygram](../examples/basic/all-node-types.dygram)

### Attributes
Nodes can have typed or untyped attributes:
```dygram
myNode {
    name<string>: "Primary";
    count<number>: 42;
    enabled<boolean>: true;
    tags: ["tag1", "tag2"];
}
```
[Example: examples/attributes/basic-attributes.dygram](../examples/attributes/basic-attributes.dygram)

### Edges
Edges define transitions between nodes with multiple arrow styles:
```dygram
start -> middle;      // Standard transition
middle --> end;       // Dashed transition
error => recovery;    // Thick arrow
a <--> b;            // Bidirectional
```
[Example: examples/edges/mixed-arrow-types.dygram](../examples/edges/mixed-arrow-types.dygram)

### Edge Labels
Edges can have labels and attributes:
```dygram
start -init-> middle;
middle -"user action"-> end;
error -retry: 3; timeout: 5000;-> start;
```
[Example: examples/edges/labeled-edges.dygram](../examples/edges/labeled-edges.dygram)

### Nesting
Nodes can contain child nodes to create hierarchies:
```dygram
parent {
    child1;
    child2 {
        grandchild;
    }
}
```
[Example: examples/nesting/complex-nesting.dygram](../examples/nesting/complex-nesting.dygram)

### Context Nodes
Context nodes define shared configuration:
```dygram
context appConfig {
    environment<string>: "production";
    maxRetries<number>: 3;
    debug<boolean>: false;
}
```
[Example: examples/complex/context-heavy.dygram](../examples/complex/context-heavy.dygram)

## Real-World Example

Here's a complete machine demonstrating multiple features:
```dygram
machine "User Authentication System"

context config {
    maxRetries<number>: 3;
    timeout<number>: 30000;
}

init landing "Landing Page";
task authenticate "Verify Credentials";
state authenticated "User Authenticated";
state locked "Account Locked";

landing -"user login"-> authenticate;
authenticate -"success"-> authenticated;
authenticate -"failure"-> landing;
authenticate -retry: config.maxRetries;-> locked;
locked -timeout: config.timeout;-> landing;
```
[Example: examples/complex/complex-machine.dygram](../examples/complex/complex-machine.dygram)

## Unicode Support

DyGram fully supports Unicode in identifiers and labels:
```dygram
machine "Unicode Machine 🔄"
start "開始";
process "処理";
end "終了";

start -"ユーザーイベント"-> process;
```
[Example: examples/complex/unicode-machine.dygram](../examples/complex/unicode-machine.dygram)

## Next Steps

- Read the [Syntax Guide](syntax-guide.md) for complete syntax details
- Browse the [Examples Index](examples-index.md) for more patterns
- Learn about [Testing Approach](testing-approach.md) for validation methodology
