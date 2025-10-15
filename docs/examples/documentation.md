# Documentation Features Examples

This directory contains examples demonstrating documentation features in DyGram, including notes and generic types.

## Examples

### `notes-and-generics.dygram`
Documentation notes and generic types:
- Using `note for nodeName "content"` syntax
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

Notes attach explanatory documentation to nodes:


#### Multiline Notes

Use `\n` for line breaks:


#### Multiple Notes

Attach multiple notes to a single node:


### Generic Types

Generic types provide type parameters for attributes:


#### Common Generic Patterns

**Promise Types:**

**Collection Types:**

**Function Types:**

## Use Cases

### Documentation Notes

1. **Explain Complex Logic**
   ```dygram
   note for algorithm "Uses Dijkstra's algorithm for shortest path.
   Time complexity: O(V^2)
   Space complexity: O(V)"
   ```

2. **Warnings and Constraints**
   ```dygram
   note for criticalTask "⚠️ WARNING: This operation is irreversible.
   Requires manual approval for production environments."
   ```

3. **Usage Instructions**
   ```dygram
   note for apiCall "Usage:
   1. Set API key in context
   2. Configure timeout
   3. Call with valid payload
   4. Handle response or error"
   ```

4. **Context and Background**
   ```dygram
   note for migrationTask "Legacy System Migration:
   Migrating from Oracle to PostgreSQL.
   Must maintain backward compatibility.
   Expected completion: Q2 2025"
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
note for taskNode "Documentation here"
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
