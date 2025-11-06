# Documentation Features Examples

This directory contains examples demonstrating documentation features in DyGram, including notes and generic types.

## Examples

### `notes-and-generics.dygram`
Documentation notes and generic types:
- Using `note nodeName "content"` syntax
- Multiline notes with `\n`
- Multiple notes per node
- Generic types: `Promise<T>`, `Array<T>`, `Map<K,V>`
- Nested generics: `Promise<Array<Result>>`
- Type documentation in diagrams

### `complete-phase3.dygram`
Complete example combining Phase 3 features:
- Documentation notes for complex logic
- Generic type annotations
- Warnings and important information
- Step-by-step explanations
- Type contracts

## Key Features

### Documentation Notes

Notes attach explanatory documentation to nodes. The note's name is the target node, and the title is the note content:

```dy
Task myTask "My Task";
Note myTask "This is a note about the task";
```

#### Multiline Notes

Use multiline strings for notes with line breaks:

```dy
Task algorithm "Algorithm";
Note algorithm "Uses Dijkstra's algorithm for shortest path.
Time complexity: O(V^2)
Space complexity: O(V)";
```

#### Multiple Notes

Attach multiple notes to a single node (all notes reference the same target):

```dy
Task process "Process";
Note process "First note about the process";
Note process "Second note with additional details";
```


### Generic Types

Generic types provide type parameters for attributes:


#### Common Generic Patterns

**Promise Types:**

**Collection Types:**

**Function Types:**

## Use Cases

### Documentation Notes

1. **Explain Complex Logic**
   ```dy
   Task algorithm;
   Note algorithm "Uses Dijkstra's algorithm for shortest path.
   Time complexity: O(V^2)
   Space complexity: O(V)";
   ```

2. **Warnings and Constraints**
   ```dy
   Task criticalTask;
   Note criticalTask "⚠️ WARNING: This operation is irreversible.
   Requires manual approval for production environments.";
   ```

3. **Usage Instructions**
   ```dy
   Task apiCall;
   Note apiCall "Usage:
   1. Set API key in context
   2. Configure timeout
   3. Call with valid payload
   4. Handle response or error";
   ```

4. **Context and Background**
   ```dy
   Task migrationTask;
   Note migrationTask "Legacy System Migration:
   Migrating from Oracle to PostgreSQL.
   Must maintain backward compatibility.
   Expected completion: Q2 2025";
   ```

### Generic Types

1. **Type Documentation**
   - Clear type contracts in diagrams
   - Self-documenting APIs
   - IDE/LSP autocomplete support

2. **Type Safety**
   - Future type checking can leverage generic info
   - Catch type errors at compile time
   - Better tooling support

3. **Code Generation**
   - Generate strongly-typed interfaces
   - Create type definitions
   - Generate documentation

## Best Practices

### Documentation Notes

1. **Be Concise**: Keep notes focused and relevant
2. **Use Formatting**: Use line breaks for readability
3. **Highlight Important Info**: Use warnings for critical information
4. **Provide Context**: Explain why, not just what
5. **Keep Updated**: Update notes when behavior changes

### Generic Types

1. **Use Standard Types**: Stick to common generic patterns
2. **Be Specific**: Use concrete type parameters when possible
3. **Document Constraints**: Note any type constraints in notes
4. **Avoid Deep Nesting**: Keep generics to 2-3 levels max
5. **Match Implementation**: Ensure types match actual code

## Mermaid Rendering

**Notes** appear as attached annotations in diagrams:
```mermaid
class taskNode {
  <<task>>
}
note taskNode "Documentation here"
```

**Generic Types** use tilde syntax:
```
Promise<Result> → Promise~Result~
Array<Record> → Array~Record~
Map<K,V> → Map~K,V~
```

## See Also

- [Advanced Features](../../docs/advanced-features.md) - Complete documentation
- [Language Overview](../../docs/language-overview.md) - Core concepts
- [Syntax Guide](../../docs/syntax-guide.md) - Syntax reference

### `complete-phase3.dygram`
Phase 3: Complete Feature Demo

```dy examples/documentation/complete-phase3.dygram
machine "Phase 3: Complete Feature Demo"

// Configuration context with generic types
context apiConfig @Singleton {
    endpoint<string>: "https://api.example.com";
    headers<Map<string, string>>: ["Authorization", "Bearer token"];
    retries<number>: 3;
}

// Abstract base task with generic result type
task BaseTask @Abstract {
    result<Promise<any>>: "pending";
    status<string>: "initialized";
}

// Concrete tasks extending base
task FetchTask @Async {
    data<Promise<Response>>: "pending";
}

task TransformTask {
    output<Array<Record>>: [];
}

// States
state Success {
    message<string>: "Operation completed";
}

state Error {
    error<Optional<string>>: "none";
}

// Relationships with annotations
BaseTask <|-- FetchTask;
BaseTask <|-- TransformTask;

FetchTask "1" --> "1" TransformTask;
TransformTask "1" --> "0..1" Success;
TransformTask "1" --> "0..1" Error;

// Documentation notes
Note apiConfig "Singleton configuration for API access. Contains endpoint URL, authentication headers, and retry policy.";

Note FetchTask "Asynchronous task that fetches data from the API. Returns Promise<Response> which resolves to the HTTP response.";

Note TransformTask "Transforms the raw API response into an array of typed records. Handles data validation and normalization.";

Note Success "Indicates successful completion. All data has been fetched and transformed.";

Note Error "Error state with optional error message. Triggered on API failures or transformation errors.";

```

### `notes-and-generics.dygram`

Phase 3: Notes and Generic Types

```dy examples/documentation/notes-and-generics.dygram
machine "Phase 3: Notes and Generic Types"

// Generic types demonstration
context config {
    items<List<string>>: ["item1", "item2"];
    result<Promise<Result>>: "pending";
}

// Task with generic return type
task fetchData @Async {
    response<Promise<Response>>: "pending";
    timeout<number>: 5000;
}

task processData {
    data<Array<Record>>: [];
}

state complete {
    message<string>: "All done";
}

// Edges
fetchData -> processData;
processData -> complete;

// Notes provide documentation
Note fetchData "Fetches data from external API. Returns Promise<Response> with the fetched data.";
Note processData "Processes the fetched data and transforms it into Array<Record> format.";
Note complete "Final state indicating successful completion of the workflow.";

```
