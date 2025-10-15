# DyGram Reference

Technical reference documentation for DyGram language specifications, CLI commands, and APIs.

## Language Reference

### [Grammar Reference](grammar-reference.md)
Complete formal grammar specification for the DyGram language including:
- Lexical structure
- Syntax rules
- Parse tree structure
- Language extensions

### [Events](events.md)
Event system reference covering event types, handlers, and event-driven workflows.

### [Validation Error Handling](validation-error-handling.md)
Complete validation error reference including:
- Type checking errors
- Graph validation errors
- Semantic validation errors
- Error messages and resolution

## Command Line Interface

### [CLI Reference](cli-reference.md)
Complete command-line interface documentation:
- Command syntax and options
- File validation and execution
- Export formats (Mermaid, JSON, HTML)
- Configuration and environment variables

## API Reference

### [API](../Api.mdx)
Programmatic API for using DyGram as a library:
- Parsing DyGram source code
- AST manipulation
- Validation and transformation
- Integration with Node.js applications

## Quick Reference

### Common Commands

```bash
# Validate a file
npx dygram validate file.dygram

# Execute a file
npx dygram file.dygram

# Export to Mermaid
npx dygram export --format mermaid file.dygram

# Export to JSON
npx dygram export --format json file.dygram
```

### Basic Syntax

```dygram
machine "Title"

# Nodes
state nodeName;
task process;
context config;

# Attributes
myNode {
    attr<Type>: value;
};

# Edges
nodeA -> nodeB;
```

## Related Documentation

- [Syntax Guide](../guides/syntax-guide.md) - Language syntax with examples
- [CLI Usage](../getting-started/installation.md#cli-installation) - CLI installation and setup
- [Integration](../integration/README.md) - Integration with other tools
