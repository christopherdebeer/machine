# Context Management Examples

This directory contains examples demonstrating context nodes and context value management in DyGram.

## Examples

### `context-management.mach`
Enhanced context value management with storage and retrieval:
- Using `set_context_value` tool to store values dynamically
- Using `get_context_value` tool to retrieve stored values
- Type-safe context attribute management
- Context nodes as data stores during execution

### `template-variables.mach`
Template variable resolution and dynamic prompts:
- Using `{{nodeName.attributeName}}` syntax in prompts
- Dynamic value substitution during execution
- Automatic dependency inference from template variables
- Context-driven task execution

### `nested-access.dygram`
Nested attribute access patterns:
- Multi-level context structures
- Dot notation for nested access: `{{context.level1.level2.attribute}}`
- Deep nesting (3+ levels)
- Type safety in nested structures
- Multiple context references in single task
- Organized configuration hierarchies

## Context Node Patterns

### Pattern 1: Configuration Storage

<ExampleLoader path="examples/generated/example-1.dygram" height="400px" />


### Pattern 2: Dynamic Value Storage

<ExampleLoader path="examples/generated/example-2.dygram" height="400px" />


### Pattern 3: Template Variable Usage

<ExampleLoader path="examples/generated/example-3.dygram" height="400px" />


### Pattern 4: Nested Context

<ExampleLoader path="examples/generated/example-4.dygram" height="400px" />


## Available Context Tools

When `meta: true` is set on a Task node, these tools become available:

- `set_context_value(nodeName, attributeName, value)` - Store values with type validation
- `get_context_value(nodeName, attributeName)` - Retrieve stored values
- `list_context_nodes()` - List all context nodes and their current values

## Best Practices

1. **Use Contexts for Configuration**: Store configuration values in context nodes
2. **Type Your Attributes**: Always specify types for better validation
3. **Use Template Variables**: Reference context values using `{{}}` syntax
4. **Organize Hierarchically**: Use nesting for related configuration
5. **Keep Nesting Shallow**: Limit nesting to 3-4 levels maximum
6. **Document Context Purpose**: Use clear names and notes to explain context usage

## See Also

- [Language Overview](../../docs/language-overview.md) - Context node documentation
- [Context & Schema Guide](../../docs/context-and-schema-guide.md) - Detailed context patterns
- [Advanced Features](../../docs/advanced-features.md) - Dependency inference
