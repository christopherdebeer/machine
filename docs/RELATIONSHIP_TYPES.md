# Relationship Types in DyGram

DyGram supports multiple relationship types to express different semantic meanings in your state machine diagrams. These relationship types are mapped to Mermaid class diagram relationships for visual representation.

## Supported Relationship Types

### 1. Association (`->`)
**Syntax:** `source -> target`

The default relationship type, representing a simple association or connection between two nodes.

**Mermaid Output:** `-->`

```dygram
machine "Association Example"
client;
server;
client -> server;
```

### 2. Dependency (`-->`)
**Syntax:** `source --> target`

Represents a dependency relationship where the source depends on the target but doesn't have strong ownership.

**Mermaid Output:** `..>` (dashed arrow)

```dygram
machine "Dependency Example"
task process;
context config;
process --> config;  // process depends on config
```

### 3. Inheritance (`<|--`)
**Syntax:** `parent <|-- child`

Represents an inheritance or "is-a" relationship where the child inherits from the parent.

**Mermaid Output:** `<|--`

```dygram
machine "Inheritance Example"
task BaseProcessor;
task DataProcessor;
BaseProcessor <|-- DataProcessor;  // DataProcessor is a BaseProcessor
```

### 4. Composition (`*-->`)
**Syntax:** `container *--> component`

Represents a strong "owns-a" relationship where the container owns the component with a strong lifecycle dependency. When the container is destroyed, the component is also destroyed.

**Mermaid Output:** `*--`

```dygram
machine "Composition Example"
task Workflow;
task Step;
Workflow *--> Step;  // Workflow owns Step
```

### 5. Aggregation (`o-->`)
**Syntax:** `aggregate o--> part`

Represents a weak "has-a" relationship where the aggregate contains the part but doesn't control its lifecycle. The part can exist independently of the aggregate.

**Mermaid Output:** `o--`

```dygram
machine "Aggregation Example"
task Team;
task Member;
Team o--> Member;  // Team has Members, but Members can exist independently
```

### 6. Bidirectional (`<-->`)
**Syntax:** `source <--> target`

Represents a two-way relationship where both nodes reference each other.

**Mermaid Output:** `<-->`

```dygram
machine "Bidirectional Example"
state frontend;
state backend;
frontend <--> backend;  // Two-way communication
```

### 7. Fat Arrow (`=>`)
**Syntax:** `source => target`

Alternative association syntax, useful for emphasizing important transitions.

**Mermaid Output:** `-->`

```dygram
machine "Fat Arrow Example"
task initialize;
task execute;
initialize => execute;
```

## Complete Example

```dygram
machine "Comprehensive Relationship Example"

// Define nodes
task BaseProcessor "Base Processor";
task DataProcessor "Data Processor";
task Validator "Data Validator";
context Config "Configuration";
state Storage "Data Storage";

// Inheritance - DataProcessor extends BaseProcessor
BaseProcessor <|-- DataProcessor;

// Composition - DataProcessor owns Validator
DataProcessor *--> Validator;

// Aggregation - DataProcessor uses Storage
DataProcessor o--> Storage;

// Dependency - DataProcessor depends on Config
DataProcessor --> Config;

// Association - Validator interacts with Storage
Validator -> Storage;

// Bidirectional - Two-way communication
DataProcessor <--> Storage;
```

## Execution Semantics

While these relationship types primarily affect visual representation, they can also influence execution behavior:

1. **Inheritance (`<|--`)**: Can be used to establish type hierarchies for validation and code generation
2. **Composition (`*-->`)**: Suggests strong lifecycle coupling - when the parent is destroyed, children should be too
3. **Aggregation (`o-->`)**: Indicates shared ownership - components can outlive the aggregate
4. **Dependency (`-->`)**: Suggests loose coupling - useful for dependency injection and configuration

## When to Use Each Type

| Relationship | Use When | Example |
|--------------|----------|---------|
| `->` | Simple connection or transition | `task1 -> task2` |
| `-->` | Dependency on configuration or service | `task --> config` |
| `<\|--` | Type inheritance or extension | `BaseTask <\|-- SpecificTask` |
| `*-->` | Strong ownership (part of) | `Workflow *--> Step` |
| `o-->` | Weak ownership (uses) | `Team o--> Member` |
| `<-->` | Bidirectional communication | `Frontend <--> Backend` |
| `=>` | Important or primary transition | `init => main` |

## Best Practices

1. **Be Consistent**: Use relationship types consistently across your machine definitions
2. **Match Semantics**: Choose the relationship type that best matches the actual semantic relationship
3. **Document Intent**: Use node labels and edge attributes to clarify the relationship purpose
4. **Consider Execution**: Think about how relationships affect execution flow and lifecycle

## Validation

The DyGram validator ensures:
- All referenced nodes exist
- Relationship syntax is correct
- No circular dependencies in inheritance hierarchies (future feature)
- Type compatibility in relationships (future feature)

## Future Enhancements

Planned enhancements for relationship types include:
- Multiplicity support (1-to-many, many-to-many)
- Validation of type hierarchies
- Automatic dependency inference from context references
- Custom relationship styling based on attributes
