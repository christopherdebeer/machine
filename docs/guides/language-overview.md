# DyGram Language Overview


DyGram is a declarative language for defining state machines, workflows, and process graphs with rich metadata.

## Core Concepts

### Machines
Every DyGram file defines a machine with a title:

```dygram examples/basic/minimal.dygram
machine "Generated Minimal Machine"
```

### Nodes
Nodes are the fundamental building blocks. They can be untyped or have specific types:

**Untyped node:**

```dygram examples/basic/simple-nodes-3.dygram
machine "Simple Node Machine"
node1;
node2;
node3;
```

**Typed nodes:**
- `task` - Represents a processing step or action
- `state` - Represents a system state
- `init` - Initial/entry point
- `context` - Configuration or shared state

```dygram examples/basic/typed-nodes.dygram
machine "Typed Nodes Machine"
task taskNode1;
task taskNode2;
state stateNode1;
state stateNode2;
init initNode1;
init initNode2;
context contextNode1;
context contextNode2;
```

### Node Labels
Nodes can have human-readable labels:

```dygram examples/basic/all-node-types.dygram
machine "All Node Types Test"
init startNode "Initialization Phase";
task processTask "Process Data";
state waitingState;
context configContext {
    setting: "value";
}

regularNode;

startNode -> processTask;
processTask -> waitingState;
waitingState -> regularNode;
```

### Attributes
Nodes can have typed or untyped attributes:

```dygram examples/attributes/basic-attributes.dygram
machine "Attributes Machine"
node1 {
    stringAttr<string>: "test value";
    numberAttr<number>: 42.5;
    boolAttr<boolean>: true;
    arrayAttr: ["a", "b", "c"];
    untypedAttr: "untyped";
    prompt: "an llm prompt";
}
```

### Edges
Edges define transitions between nodes with multiple arrow styles:

```dygram examples/edges/mixed-arrow-types.dygram
machine "Mixed Arrow Types"

// This example demonstrates the syntax of different arrow types
// For semantic meanings, see: relationship-types.dygram

// -> : Standard arrow (association)
a;
b;
a -> b;

// --> : Dashed arrow (dependency)
c;
b --> c;

// => : Fat arrow (emphasis/critical path)
d;
c => d;

// <--> : Bidirectional arrow (mutual relationship)
e;
d <--> e;

// Circular connection back to start
e -> a;
```

### Edge Labels
Edges can have labels and attributes:

```dygram examples/edges/labeled-edges.dygram
machine "Labeled Edges Machine"
start;
middle;
end;
error;

start -init-> middle;
middle -"process complete"-> end;
middle -timeout: 5000;-> error;
error -retry: 3; logLevel: 0;-> start;
end -if: '(count > 10)';-> start;
```

### Nesting
Nodes can contain child nodes to create hierarchies:

```dygram examples/nesting/complex-nesting.dygram
machine "Complex Nesting Test"
root {
    level1a {
        level2a {
            level3a;
            level3b {
                level4;
            }
        }
        level2b;
    }
    level1b {
        level2c;
        level2d {
            level3c;
        }
    }
}
```

### Context Nodes
Context nodes define shared configuration and data storage:

```dygram
context appConfig {
    environment<string>: "production";
    maxRetries<number>: 3;
    debug<boolean>: false;
}
```

[Example: examples/complex/context-heavy.dygram](../examples/complex/context-heavy.dygram)

### Enhanced Context Management
Tasks can dynamically read and write context values using built-in tools:

**Setting context values:**

```dygram
Task generateData {
  meta: true;
  prompt: "Generate data and store it using set_context_value tool";
};

context output {
  result<string>: "";
  timestamp<number>: 0;
};
```

**Reading context values with template variables:**

```dygram
Task processData {
  prompt: "Process the data: {{output.result}} from {{output.timestamp}}";
};
```

[Example: examples/context/context-management.mach](../examples/context/context-management.mach)
[Example: examples/context/template-variables.mach](../examples/context/template-variables.mach)

**Available Context Tools:**
- `set_context_value(nodeName, attributeName, value)` - Store values with type validation
- `get_context_value(nodeName, attributeName)` - Retrieve stored values
- `list_context_nodes()` - List all context nodes and their values

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

## Advanced Features

DyGram includes powerful features for expressing complex relationships and validating your state machines:

- **Relationship Types** - Use semantic arrows (`->`, `-->`, `← |--`, `*-->`, `o-->`, `← -->`, `=>`) to express different relationships
- **Multiplicity** - Specify cardinality (`"1"`, `"*"`, `"0..1"`, `"1..*"`) for quantitative relationships
- **Annotations** - Add metadata with `@Abstract`, `@Singleton`, `@Async`, `@Deprecated`, `@Critical`
- **Dependency Inference** - Automatically detect dependencies from `{{ template.variables }}`
- **Generic Types** - Use parameterized types like `Promise<Result>`, `Array<Record>`, `Map<K,V>`
- **Documentation Notes** - Attach explanatory notes with `note for node "content"`
- **Type Checking** - Validate attribute types and infer types from values
- **Graph Validation** - Detect unreachable nodes, cycles, orphans, and structural issues
- **Semantic Validation** - Enforce node type rules and annotation compatibility

**Example:**

```dygram
machine "Advanced Example"

context Config @Singleton {
    apiKey<string>: "secret";
}

task BaseHandler @Abstract;
task APIHandler @Async {
    response<Promise<Response>>: null;
}

BaseHandler <|-- APIHandler;
APIHandler --> Config;  // Dependency

note for APIHandler "Handles API requests asynchronously.
Uses {{ Config.apiKey }} for authentication."
```

See [Advanced Features](advanced-features.html) for comprehensive documentation.

## Next Steps

- Read the [Syntax Guide](syntax-guide.html) for complete syntax details
- Explore [Advanced Features](advanced-features.html) for relationship types, validation, and more
- Browse the [Examples Index](examples-index.html) for more patterns
- Learn about [Runtime & Evolution](runtime-and-evolution.html) for execution details
- Check [Testing Approach](testing-approach.html) for validation methodology

