
# DyGram Syntax Guide

Complete reference for DyGram language syntax.

## Machine Declaration

Every file starts with a machine declaration:

```dygram
machine "Machine Title"
```

[Example: examples/basic/minimal.dygram](../examples/basic/minimal.dygram)

## Node Declarations

### Untyped Nodes

```dygram
nodeName;
```

[Example: examples/basic/simple-nodes-3.dygram](../examples/basic/simple-nodes-3.dygram)

### Typed Nodes

```dygram
task taskNode;
state stateNode;
init initNode;
context contextNode;
```

[Example: examples/basic/typed-nodes.dygram](../examples/basic/typed-nodes.dygram)

### Nodes with Labels

```dygram
task processData "Process User Data";
state waiting "Waiting for Input";
```

[Example: examples/basic/all-node-types.dygram](../examples/basic/all-node-types.dygram)

### Nodes with Attributes

```dygram
nodeName {
    attribute: value;
}
```

#### Attribute Types
- **String**: `name<string>: "value";`
- **Number**: `count<number>: 42;` or `ratio<number>: 3.14;`
- **Boolean**: `enabled<boolean>: true;`
- **Array**: `items: ["a", "b", "c"];`
- **Untyped**: `setting: "value";`

[Example: examples/attributes/basic-attributes.dygram](../examples/attributes/basic-attributes.dygram)

## Edge Declarations

### Basic Edges

```dygram
source -> target;
```

[Example: examples/edges/basic-edges.dygram](../examples/edges/basic-edges.dygram)

### Arrow Types
- `->` - Standard arrow
- `-->` - Dashed arrow
- `=>` - Thick arrow
- `← -->` - Bidirectional arrow

[Example: examples/edges/mixed-arrow-types.dygram](../examples/edges/mixed-arrow-types.dygram)

### Edge Labels

#### Simple Label

```dygram
start -init-> middle;
```

#### Quoted Label

```dygram
middle -"user clicks button"-> end;
```

#### Label with Attributes

```dygram
error -retry: 3; timeout: 5000;-> start;
end -if: '(count > 10)';-> start;
```

[Example: examples/edges/labeled-edges.dygram](../examples/edges/labeled-edges.dygram)

### Chained Edges

```dygram
a -> b -> c -> d;
```

[Example: examples/edge-cases/edge-cases-collection.dygram](../examples/edge-cases/edge-cases-collection.dygram)

## Nesting

Nodes can contain child nodes:

```dygram
parent {
    child1;
    child2;
}
```

### Multiple Levels

```dygram
level1 {
    level2 {
        level3 {
            level4;
        }
    }
}
```

[Example: examples/nesting/deep-nested-5-levels.dygram](../examples/nesting/deep-nested-5-levels.dygram)

### Mixed Nesting with Attributes

```dygram
parent {
    child1 {
        attr: "value";
    }
    child2;
}
```

[Example: examples/nesting/complex-nesting.dygram](../examples/nesting/complex-nesting.dygram)

## Context Definitions

Context nodes define shared configuration:

```dygram
context configName {
    setting1<string>: "value";
    setting2<number>: 100;
}
```

[Example: examples/complex/context-heavy.dygram](../examples/complex/context-heavy.dygram)

## Complete Example

Combining all features:

```dygram
machine "Complete Example"

context config {
    env<string>: "production";
    maxRetries<number>: 3;
    debug<boolean>: false;
    tags: ["generated", "test"];
}

init startup "System Start" {
    priority: "high";
    timeout: 10000;
}

task process1 {
    parallelism: 4;
}

task process2 {
    batchSize: 100;
}

state validation;
state cleanup;

workflow recovery {
    detect;
    analyze;
    fix;
    detect -> analyze -> fix;
}

startup -> process1;
process1 -> process2;
process2 -> validation;
validation -> cleanup;
process1 -on: error;-> recovery;
recovery -timeout: 30000;-> process1;
cleanup -if: '(config.debug == true)';-> startup;
```

[Example: examples/complex/complex-machine.dygram](../examples/complex/complex-machine.dygram)

## Identifiers

### Valid Identifiers
- Start with letter or underscore: `_node`, `node1`, `myNode`
- Contain letters, numbers, underscores: `node_123`, `my_node_2`

[Example: examples/edge-cases/special-characters.dygram](../examples/edge-cases/special-characters.dygram)

### Unicode Identifiers
Full Unicode support in identifiers and labels:

```dygram
start "開始";
process "処理";
```

[Example: examples/complex/unicode-machine.dygram](../examples/complex/unicode-machine.dygram)

## Known Limitations

- Quoted node identifiers (e.g., `"node with spaces"`) are not supported
- Negative numbers in attributes are not currently supported

See [Testing Approach](testing-approach.html) for validation details.

## See Also

- [Language Overview](language-overview.html) - Conceptual introduction
- [Examples Index](examples-index.html) - All examples organized by category
- [Testing Approach](testing-approach.html) - Validation methodology

