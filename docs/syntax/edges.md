# Edges

Edges define relationships and transitions between nodes. They are the connective tissue that brings your machine to life.

## Basic Syntax

The simplest edge connects two nodes:

```dygram examples/syntax/edge-basic.dygram
start -> end;
```

## Multiple Targets

One source can connect to multiple targets:

```dygram examples/syntax/edge-multiple-targets.dygram
start -> task1, task2, task3;
```

## Chain Syntax

Chain multiple edges together for readability:

```dygram examples/syntax/edge-chaining.dygram
start -> process -> validate -> complete;
```

This is equivalent to:
```dygram
start -> process;
process -> validate;
validate -> complete;
```

## Arrow Types

DyGram supports multiple arrow types to convey different relationship semantics:

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

### Arrow Type Semantics

| Arrow | Syntax | Meaning |
|-------|--------|---------|
| `->` | Single arrow | Default transition or flow |
| `-->` | Double arrow | Strong association or dependency |
| `=>` | Fat arrow | Transformation or mapping |
| `<\|--` | Inheritance | Class inheritance or specialization |
| `*-->` | Composition | Strong ownership (part-of relationship) |
| `o-->` | Aggregation | Weak ownership (has-a relationship) |
| `<-->` | Bidirectional | Two-way relationship |

## Edge Labels

Add descriptive labels to edges:

```dygram examples/syntax/edge-labels.dygram
a -label-> b;
a --label--> b;
a =label=> b;
```

Labels appear between the dashes/equals of the arrow syntax.

## Edge Attributes

Add typed attributes to edges:

```dygram examples/syntax/edge-attributes.dygram
a -condition: true, priority: 1-> b;
```

Attributes appear between the first dash and the arrow head, separated by semicolons:

```dygram
source -attr1: value1; attr2: value2;-> target;
```

### With Qualified Node Names

Edge attributes work seamlessly with [qualified names](qualified-names.md):

```dygram
Start -priority: 1;-> Workflow.Step1;
Workflow.Step1 -weight: 0.8; condition: "ready";-> Workflow.Step2;
```

See [Attributes](attributes.md) for detailed type syntax.

## Multiplicity

Specify cardinality for relationships:

```dygram examples/syntax/edge-multiplicity.dygram
User "1" --> "*" Post;
Order "1" --> "1..*" LineItem;
```

Common multiplicity patterns:
- `"1"` - Exactly one
- `"0..1"` - Zero or one
- `"*"` - Zero or many
- `"1..*"` - One or many
- `"0..*"` - Zero or many (equivalent to `"*"`)
- `"3..5"` - Between 3 and 5

## Edge Annotations

Annotate edges with metadata:

```dygram examples/syntax/edge-annotations.dygram
a -@style("color: red; stroke-width: 3px")-> b;
```

Multiple annotations:

```dygram
a -@Critical @Async-> b;
```

See [Annotations](annotations.md) for available annotation types.

## Complete Edge Syntax

An edge can combine all features:

```dygram
Source "1" -label; attr1: value1; attr2: value2; @Annotation-> "0..*" Target;
```

## Advanced Patterns

### Conditional Edges

Edges can have conditions that control when they should be active using `when:`, `unless:`, or `if:` keywords in the label:

```dygram
Processing -when: status == "valid"-> Success;
Processing -when: status == "invalid"-> Failure;
Processing -unless: errorCount > 0-> Continue;
```

#### Visual Indicators for Conditional Edges

DyGram automatically evaluates edge conditions in static mode (before runtime) and applies visual styling to indicate their likely active/inactive status:

- **Active edges** (condition evaluates to `true`):
  - Style: **solid** line
  - Color: **green** (#4CAF50)
  - Width: **2px** (slightly thicker)

- **Inactive edges** (condition evaluates to `false`):
  - Style: **dashed** line
  - Color: **gray** (#9E9E9E)
  - Width: **1px** (thinner)

- **Error edges** (condition evaluation failed):
  - Style: **dashed** line
  - Color: **red** (#D32F2F)
  - Width: **1px**

These visual indicators provide immediate feedback about which edges are likely to be traversed based on default or machine-level attribute values. See [Edge Conditions](../archived/guides/edge-conditions.md) for detailed condition syntax.

#### Condition Evaluation Context

Conditions are evaluated using machine-level attributes as defaults:

```dygram
machine MyWorkflow {
    maxRetries: 3;
    errorCount: 0;
}

Start -> Process;
Process -when: errorCount > 0-> Retry;
Process -when: retryCount < maxRetries-> Process;
Retry -> End;
```

In this example, the edge `Process -when: errorCount > 0-> Retry` would be visually rendered as **inactive** (gray, dashed) because `errorCount` defaults to `0` at the machine level.

### Weighted Edges

Express priority or weight:

```dygram
Start -weight: 0.8-> Primary;
Start -weight: 0.2-> Fallback;
```

### Labeled Workflows

Create readable state machines:

```dygram
Idle -start-> Processing;
Processing -success-> Complete;
Processing -error-> Failed;
Failed -retry-> Processing;
```

### Complex Relationships

Mix different arrow types:

```dygram
// Inheritance
Animal <|-- Dog;
Animal <|-- Cat;

// Composition
House *--> Room;

// Aggregation
Department o--> Employee;

// Transformation
RawData => ProcessedData;
```

## Best Practices

### Arrow Type Selection
- Use **`->`** for default workflows and transitions
- Use **`-->`** for strong dependencies and associations
- Use **`=>`** for data transformations
- Use **`<|--`** for inheritance hierarchies
- Use **`*-->`** for composition (strong ownership)
- Use **`o-->`** for aggregation (weak ownership)

### Labels
- Keep labels **short and descriptive**
- Use **action verbs** for transitions (e.g., `submit`, `validate`, `process`)
- Use **conditions** for branching (e.g., `success`, `failure`, `timeout`)

### Attributes
- Use for **conditional logic** (`condition: "expr"`)
- Use for **weights** and **priorities** (`weight: 0.8`, `priority: 1`)
- Use for **configuration** (`timeout: 5000`, `retries: 3`)

### Chaining
- Use **chains** for linear workflows
- Break chains at **decision points**
- Keep chains **readable** (max 4-5 nodes)

## Examples

### Simple Workflow
```dygram
Start -> Validate -> Process -> Complete;
```

### Branching Logic
```dygram
Start -> Validate;
Validate -success-> Process;
Validate -failure-> Error;
Process -> Complete;
```

### Labeled State Machine
```dygram
Idle -start-> Running;
Running -pause-> Paused;
Paused -resume-> Running;
Running -stop-> Stopped;
Running -error-> Failed;
Failed -retry-> Running;
```

### Complex Relationships
```dygram
// Inheritance
Vehicle <|-- Car;
Vehicle <|-- Truck;

// Composition
Car *--> Engine;
Car *--> Wheels;

// Aggregation
Company o--> Employee;

// Dependencies
Frontend --> Backend;
Backend --> Database;
```

### Weighted Workflow
```dygram
Start -> Process;
Process -weight: 0.9; condition: "success";-> Complete;
Process -weight: 0.1; condition: "error";-> Retry;
Retry -attempts: 3;-> Process;
Retry -exhausted: true;-> Failed;
```

### With Qualified Names
```dygram
Workflow {
    task Validate;
    task Process;
    task Complete;
}

Start -priority: 1;-> Workflow.Validate;
Workflow.Validate -weight: 0.8; condition: "valid";-> Workflow.Process;
Workflow.Process -> Workflow.Complete;
Workflow.Complete -> End;
```

## See Also

- [Nodes](nodes.md) - Defining the entities connected by edges
- [Attributes](attributes.md) - Typed edge attributes
- [Annotations](annotations.md) - Edge metadata
- [Qualified Names](qualified-names.md) - Referencing nested nodes in edges
