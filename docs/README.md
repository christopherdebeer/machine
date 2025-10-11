# DyGram Documentation

DyGram is a domain-specific language for defining state machines, workflows, and process graphs with rich metadata and hierarchical structures.

## Getting Started

- **[Quick Start](QuickStart.mdx)** - Get up and running quickly
- **[Language Overview](LanguageOverview.mdx)** - High-level introduction to DyGram concepts
- **[Syntax Guide](SyntaxGuide.mdx)** - Complete language syntax reference with examples

## Core Documentation

### Language Features
- **[Advanced Features](AdvancedFeatures.mdx)** - Relationship types, multiplicity, annotations, generics, and validation
- **[Context & Schema Guide](ContextAndSchemaGuide.mdx)** - Enhanced context value management and schema validation
- **[Grammar Reference](GrammarReference.mdx)** - Complete grammar specification
- **[Events](Events.mdx)** - Event system and handling

### Runtime & Development
- **[Runtime & Evolution](RuntimeAndEvolution.mdx)** - Execution engine, automatic code generation, and task evolution
- **[Meta-Programming](MetaProgramming.mdx)** - Dynamic machine modification and self-evolving machines
- **[Evolution](Evolution.mdx)** - System evolution and development patterns
- **[Testing Approach](TestingApproach.mdx)** - Testing methodology and validation
- **[Generative Testing](GenerativeTesting.mdx)** - Generative testing strategy and implementation
- **[Validation Error Handling](ValidationErrorHandling.mdx)** - Complete validation error reference

### Integration & Tools
- **[Integration](Integration.mdx)** - Integration with other systems and tools
- **[VS Code Extension](VscodeExtension.mdx)** - Editor support and features
- **[API](Api.mdx)** - API reference and usage
- **[Libraries](Libraries.mdx)** - Available libraries and packages
- **[LLM Client Usage](LlmClientUsage.mdx)** - Using DyGram with LLM clients

### Examples & Tutorials
- **[Examples Index](ExamplesIndex.mdx)** - Categorized list of all examples with descriptions
- **[Examples](Examples.mdx)** - Example patterns and use cases

### Development Resources
- **[Langium Quickstart](LangiumQuickstart.mdx)** - Getting started with Langium development
- **[React + MDX Setup](ReactMdxSetup.mdx)** - Documentation system architecture

### Blog & Community
- **[Blog](Blog.mdx)** - Articles and updates
- **[Home](Index.mdx)** - Documentation home page

## Archive

Historical phase documentation has been consolidated into the main guides. See [archive/](archive/) for reference.

## Language Features Overview

### Basic Features
- **Nodes** - Basic building blocks with optional types (task, state, init, context)
- **Attributes** - Typed and untyped metadata on nodes
- **Edges** - Transitions with labels, conditions, and multiple arrow styles
- **Nesting** - Hierarchical structures with unlimited depth
- **Context** - Shared configuration and state
- **Unicode Support** - Full internationalization for identifiers and labels

### Advanced Features
- **Relationship Types** - 7 semantic arrow types (association, dependency, inheritance, composition, aggregation, bidirectional, emphasis)
- **Multiplicity** - Cardinality expressions (1, *, 0..1, 1..*, ranges)
- **Annotations** - Semantic metadata (@Abstract, @Singleton, @Async, @Deprecated, @Critical)
- **Dependency Inference** - Automatic detection from template variables
- **Generic Types** - Parameterized types (Promise\<T\>, Array\<T\>, Map\<K,V\>)
- **Documentation Notes** - Inline notes attached to nodes
- **Type Checking** - Attribute type validation and inference
- **Graph Validation** - Reachability, cycles, orphans, entry/exit points
- **Semantic Validation** - Node type rules and annotation compatibility

See [Advanced Features](AdvancedFeatures.mdx) for details.

## Transformation Pipeline

DyGram supports transformations to multiple output formats:
```
DyGram source → AST → JSON → Mermaid diagrams
```

All transformations are validated for:
- **Completeness** - No information lost during parsing
- **Losslessness** - Round-trip transformations preserve semantics
- **Validity** - Output formats are syntactically correct

## Contributing

For information on contributing to the documentation or the project, see the main [README](../README.md).
