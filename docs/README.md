# DyGram Documentation

DyGram is a domain-specific language for defining state machines, workflows, and process graphs with rich metadata and hierarchical structures.

## Documentation Index

### Core Documentation
- **[Language Overview](language-overview.md)** - High-level introduction to DyGram concepts
- **[Syntax Guide](syntax-guide.md)** - Complete language syntax reference with examples
- **[Advanced Features](advanced-features.md)** - Relationship types, multiplicity, annotations, generics, and validation
- **[Context & Schema Guide](context-and-schema-guide.md)** - Enhanced context value management and schema validation
- **[Runtime & Evolution](runtime-and-evolution.md)** - Execution engine, automatic code generation, and task evolution
- **[Testing Approach](testing-approach.md)** - Generative testing methodology and validation
- **[Validation Error Handling](VALIDATION_ERROR_HANDLING.md)** - Complete validation error reference
- **[Examples Index](examples-index.md)** - Categorized list of all examples with descriptions

### Language Features

#### Basic Features
- **Nodes** - Basic building blocks with optional types (task, state, init, context)
- **Attributes** - Typed and untyped metadata on nodes
- **Edges** - Transitions with labels, conditions, and multiple arrow styles
- **Nesting** - Hierarchical structures with unlimited depth
- **Context** - Shared configuration and state
- **Unicode Support** - Full internationalization for identifiers and labels

#### Advanced Features
- **Relationship Types** - 7 semantic arrow types (association, dependency, inheritance, composition, aggregation, bidirectional, emphasis)
- **Multiplicity** - Cardinality expressions (1, *, 0..1, 1..*, ranges)
- **Annotations** - Semantic metadata (@Abstract, @Singleton, @Async, @Deprecated, @Critical)
- **Dependency Inference** - Automatic detection from template variables
- **Generic Types** - Parameterized types (Promise\<T\>, Array\<T\>, Map\<K,V\>)
- **Documentation Notes** - Inline notes attached to nodes
- **Type Checking** - Attribute type validation and inference
- **Graph Validation** - Reachability, cycles, orphans, entry/exit points
- **Semantic Validation** - Node type rules and annotation compatibility

See [Advanced Features](advanced-features.md) for details.

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
