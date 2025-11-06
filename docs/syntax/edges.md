# Edges

Edges define relationships and transitions between nodes. They are the connective tissue that brings your machine to life.

## Basic Syntax

The simplest edge connects two nodes:

```dy examples/syntax/edge-basic.dygram
start -> end;
```

## Multiple Targets

One source can connect to multiple targets:

```dy examples/syntax/edge-multiple-targets.dygram
start -> task1, task2, task3;
```

## Chain Syntax

Chain multiple edges together for readability:

```dy examples/syntax/edge-chaining.dygram
start -> process -> validate -> complete;
```

This is equivalent to:
```dy
start -> process;
process -> validate;
validate -> complete;
```

## Arrow Types

DyGram supports multiple arrow types to convey different relationship semantics:

```dy examples/syntax/edge-types.dygram
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

```dy examples/syntax/edge-labels.dygram
a -label-> b;
a --label--> b;
a =label=> b;
```

Labels appear between the dashes/equals of the arrow syntax.

## Edge Attributes

Add typed attributes to edges:

```dy examples/syntax/edge-attributes.dygram
a -condition: true, priority: 1-> b;
```

Attributes appear between the first dash and the arrow head, separated by semicolons:

```dy
source -attr1: value1; attr2: value2;-> target;
```

### With Qualified Node Names

Edge attributes work seamlessly with [qualified names](qualified-names.md):

```dy
Start -priority: 1;-> Workflow.Step1;
Workflow.Step1 -weight: 0.8; condition: "ready";-> Workflow.Step2;
```

See [Attributes](attributes.md) for detailed type syntax.

## Multiplicity

Specify cardinality for relationships:

```dy examples/syntax/edge-multiplicity.dygram
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

```dy examples/syntax/edge-annotations.dygram
a -@style("color: red; stroke-width: 3px")-> b;
```

Multiple annotations:

```dy
a -@Critical @Async-> b;
```

See [Annotations](annotations.md) for available annotation types.

## Complete Edge Syntax

An edge can combine all features:

```dy
Source "1" -label; attr1: value1; attr2: value2; @Annotation-> "0..*" Target;
```

## Advanced Patterns

### Conditional Edges

Edges can have conditions that control when they should be active using `when:`, `unless:`, or `if:` keywords in the label:

```dy examples/syntax/edge-conditional.dygram
machine "Conditional Edges Example" {
    status: "valid";
    errorCount: 0;
}

task Processing;
task Success;
task Failure;
task Continue;

Processing -when: 'status == "valid"';-> Success;
Processing -when: 'status == "invalid"';-> Failure;
Processing -unless: 'errorCount > 0';-> Continue;
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

```dy examples/syntax/edge-condition-context.dygram
machine "Condition Evaluation Context" {
    maxRetries: 3;
    errorCount: 0;
    retryCount: 0;
}

task Start;
task Process;
task Retry;
task End;

Start -> Process;
Process -when: 'errorCount > 0';-> Retry;
Process -when: 'retryCount < maxRetries';-> Retry;
Retry -> End;
```

In this example, the edge `Process -when: 'errorCount > 0';-> Retry` would be visually rendered as **inactive** (gray, dashed) because `errorCount` defaults to `0` at the machine level.

### Weighted Edges

Express priority or weight:

```dy
Start -weight: 0.8-> Primary;
Start -weight: 0.2-> Fallback;
```

### Labeled Workflows

Create readable state machines:

```dy
Idle -start-> Processing;
Processing -success-> Complete;
Processing -error-> Failed;
Failed -retry-> Processing;
```

### Complex Relationships

Mix different arrow types:

```dy
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
```dy
Start -> Validate -> Process -> Complete;
```

### Branching Logic
```dy
Start -> Validate;
Validate -success-> Process;
Validate -failure-> Error;
Process -> Complete;
```

### Labeled State Machine
```dy
Idle -start-> Running;
Running -pause-> Paused;
Paused -resume-> Running;
Running -stop-> Stopped;
Running -error-> Failed;
Failed -retry-> Running;
```

### Complex Relationships
```dy
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
```dy
Start -> Process;
Process -weight: 0.9; condition: "success";-> Complete;
Process -weight: 0.1; condition: "error";-> Retry;
Retry -attempts: 3;-> Process;
Retry -exhausted: true;-> Failed;
```

### With Qualified Names
```dy
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
