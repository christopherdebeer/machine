# DyGram Documentation

DyGram is a domain-specific language for defining state machines, workflows, and process graphs with rich metadata and hierarchical structures.

## Documentation Index

### Core Documentation
- **[Syntax Guide](syntax-guide.md)** - Complete language syntax reference with examples
- **[Language Overview](language-overview.md)** - High-level introduction to DyGram concepts
- **[Testing Approach](testing-approach.md)** - Generative testing methodology and validation
- **[Examples Index](examples-index.md)** - Categorized list of all examples with descriptions

### Language Features
- **Nodes** - Basic building blocks with optional types (task, state, init, context)
- **Attributes** - Typed and untyped metadata on nodes
- **Edges** - Transitions with labels, conditions, and multiple arrow styles
- **Nesting** - Hierarchical structures with unlimited depth
- **Context** - Shared configuration and state
- **Unicode Support** - Full internationalization for identifiers and labels

### Transformation Pipeline
DyGram supports transformations to multiple output formats:
```
DyGram source → AST → JSON → Mermaid diagrams
```

All transformations are validated for:
- **Completeness** - No information lost during parsing
- **Losslessness** - Round-trip transformations preserve semantics
- **Validity** - Output formats are syntactically correct

## Quick Start

See [Language Overview](language-overview.md) for a gentle introduction, or jump to [Syntax Guide](syntax-guide.md) for detailed syntax.

Browse [Examples Index](examples-index.md) to see real-world usage patterns.
