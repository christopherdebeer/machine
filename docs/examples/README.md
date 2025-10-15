# DyGram Examples

Comprehensive collection of DyGram language examples demonstrating various features and use cases.

## Example Categories

### [Advanced Features](advanced.md)
Advanced DyGram features including:
- Annotations (@Abstract, @Singleton, @Async, @Deprecated, @Critical)
- Multiplicity and cardinality in relationships
- Relationship types and semantic arrows
- Dependency inference
- Error handling patterns

### [Context Management](context.md)
Context nodes and context value management:
- Using `set_context_value` tool to store values dynamically
- Using `get_context_value` tool to retrieve stored values
- Type-safe context attribute management
- Context nodes as data stores during execution
- Template variable resolution

### [Documentation Features](documentation.md)
Documentation features including:
- Documentation notes with `note for nodeName "content"` syntax
- Multiline notes
- Generic types: `Promise<T>`, `Array<T>`, `Map<K,V>`
- Type documentation in diagrams

### [Meta-Programming](meta-programming.md)
Meta-programming capabilities for dynamic machine modification:
- Inspecting machine structure with `get_machine_definition`
- Modifying machines dynamically with `update_definition`
- Dynamic tool construction and registration
- Self-evolving machines
- Tool discovery and improvement

### [Model Configuration](model-configuration.md)
Configuring Claude model IDs at different levels:
- Task-level model configuration
- Machine-level defaults
- CLI parameter overrides
- Environment variable configuration
- Priority order and best practices

### [Nesting](nesting.md)
Hierarchical structures and namespaces:
- Qualified names with dot notation
- Context inheritance in nested structures
- State modules with automatic entry/exit routing
- Deep nesting and complex hierarchies

### [Rails-Based Architecture](rails.md)
Execution model with automated transitions:
- Automated vs agent-controlled transitions
- Single agent workflow guidance
- Phase-specific context
- Intelligent agent decisions
- Meta-programming integration

### [Validation](validation.md)
Comprehensive validation system:
- Type checking and type validation
- Graph structure validation
- Semantic validation
- Error detection and handling

### [Workflows](workflows.md)
Real-world workflow examples:
- User onboarding workflows
- Order processing systems
- Timeout and cancellation handling
- Complex state management

## Additional Examples

For basic examples demonstrating fundamental language constructs, see the `/examples` directory in the repository:
- `/basic` - Core syntax and node types
- `/attributes` - Node attribute syntax and typing
- `/edges` - Edge types and transitions
- `/edge-cases` - Edge case handling
- `/complex` - Complex real-world scenarios
- `/stress` - Performance and stress testing

## Running Examples

Execute any example file using the DyGram CLI:

```bash
npx dygram examples/[category]/[file].dygram
```

For example:
```bash
npx dygram examples/rails/auto-transitions.mach
```

See the [CLI Reference](../reference/cli-reference.md) for more options.
