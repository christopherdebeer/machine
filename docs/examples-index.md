# Examples Index

Comprehensive index of all DyGram examples organized by category.

## Basic Examples

Fundamental language constructs and core syntax.

| Example | Description | Features |
|---------|-------------|----------|
| [minimal.dygram](../examples/basic/minimal.dygram) | Simplest possible machine | Machine declaration only |
| [empty-and-minimal.dygram](../examples/basic/empty-and-minimal.dygram) | Single node machine | Basic node declaration |
| [simple-nodes-3.dygram](../examples/basic/simple-nodes-3.dygram) | Multiple untyped nodes | Node lists |
| [typed-nodes.dygram](../examples/basic/typed-nodes.dygram) | All node type keywords | task, state, init, context |
| [all-node-types.dygram](../examples/basic/all-node-types.dygram) | Complete node types with labels and edges | Full node type demonstration |

## Attribute Examples

Node attributes with various types and values.

| Example | Description | Features |
|---------|-------------|----------|
| [basic-attributes.dygram](../examples/attributes/basic-attributes.dygram) | Typed and untyped attributes | string, number, boolean, arrays |
| [deep-attributes.dygram](../examples/attributes/deep-attributes.dygram) | Complex attributes with long values | Decimal numbers, long strings, multiple attributes |

## Edge Examples

Transitions, labels, and arrow types.

| Example | Description | Features |
|---------|-------------|----------|
| [basic-edges.dygram](../examples/edges/basic-edges.dygram) | Simple node connections | Standard arrows |
| [labeled-edges.dygram](../examples/edges/labeled-edges.dygram) | Edge labels and attributes | Text labels, attribute labels |
| [mixed-arrow-types.dygram](../examples/edges/mixed-arrow-types.dygram) | All arrow variants | →, -->, =>, <--> |
| [quoted-labels.dygram](../examples/edges/quoted-labels.dygram) | Quoted labels with special characters | Spaces, punctuation in labels |

## Nesting Examples

Hierarchical structures with parent-child relationships.

| Example | Description | Features |
|---------|-------------|----------|
| [nested-2-levels.dygram](../examples/nesting/nested-2-levels.dygram) | Two-level hierarchy | Simple nesting |
| [nested-3-levels.dygram](../examples/nesting/nested-3-levels.dygram) | Three-level hierarchy | Multiple branches |
| [complex-nesting.dygram](../examples/nesting/complex-nesting.dygram) | Mixed nesting patterns | 4+ levels, multiple branches |
| [deep-nested-5-levels.dygram](../examples/nesting/deep-nested-5-levels.dygram) | Deep hierarchy validation | 5 levels of nesting |

## Context Management Examples

Advanced context value management and schema validation.

| Example | Description | Features |
|---------|-------------|----------|
| [context-management.mach](../examples/context-management.mach) | Context value storage and retrieval | set_context_value, get_context_value, typed attributes |
| [template-variables.mach](../examples/template-variables.mach) | Template variable resolution | {{nodeName.attributeName}} syntax, dynamic prompts |

## Complex Examples

Real-world patterns and advanced features.

| Example | Description | Features |
|---------|-------------|----------|
| [complex-machine.dygram](../examples/complex/complex-machine.dygram) | Full-featured machine | Context, workflows, conditions, multiple node types |
| [unicode-machine.dygram](../examples/complex/unicode-machine.dygram) | Unicode support demonstration | Chinese, Japanese characters, emoji |
| [context-heavy.dygram](../examples/complex/context-heavy.dygram) | Multiple context definitions | Rich context attributes |

## Stress Test Examples

Performance and scale validation.

| Example | Description | Features |
|---------|-------------|----------|
| [large-50-nodes.dygram](../examples/stress/large-50-nodes.dygram) | 50 nodes with connections | Large graph, cross-connections, attributes |

## Edge Case Examples

Boundary conditions and unusual patterns.

| Example | Description | Features |
|---------|-------------|----------|
| [special-characters.dygram](../examples/edge-cases/special-characters.dygram) | Special characters in identifiers | Underscores, numbers, emoji |
| [edge-cases-collection.dygram](../examples/edge-cases/edge-cases-collection.dygram) | Unusual patterns | Empty nodes, multiple edges, chained transitions |

## Usage in Tests

All examples are validated by the generative test suite in `test/integration/generative.test.ts`. Each example validates:

- **Parse Completeness** - All nodes captured in AST
- **Transform Losslessness** - DyGram → JSON → Mermaid preserves semantics
- **Output Validity** - Generated Mermaid diagrams are syntactically correct

See [Testing Approach](testing-approach.md) for methodology details.

## See Also

- [Syntax Guide](syntax-guide.md) - Detailed syntax reference
- [Language Overview](language-overview.md) - Conceptual introduction
- [Testing Approach](testing-approach.md) - Validation details
