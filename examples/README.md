# DyGram Examples

This directory contains a comprehensive collection of DyGram language examples used for testing and documentation.

## Directory Structure

### `/basic`
Fundamental language constructs demonstrating core syntax:
- `minimal.dygram` - Simplest possible machine
- `empty-and-minimal.dygram` - Single node machine
- `simple-nodes-3.dygram` - Multiple untyped nodes
- `typed-nodes.dygram` - All node type keywords (task, state, init, context)
- `all-node-types.dygram` - Complete demonstration of typed nodes with labels

### `/attributes`
Node attribute syntax and typing:
- `basic-attributes.dygram` - String, number, boolean, and array attributes
- `deep-attributes.dygram` - Complex attributes with multiple types and long values

### `/edges`
Edge and transition syntax:
- `basic-edges.dygram` - Simple connections between nodes
- `labeled-edges.dygram` - Edge labels with text and attributes
- `mixed-arrow-types.dygram` - All arrow variants (→, -->, =>, <-->)
- `quoted-labels.dygram` - Labels with special characters and spaces

### `/nesting`
Hierarchical node structures:
- `nested-2-levels.dygram` - Two levels of parent-child nesting
- `nested-3-levels.dygram` - Three levels of nesting
- `complex-nesting.dygram` - Mixed nesting with 4+ levels
- `deep-nested-5-levels.dygram` - Deep hierarchy validation

### `/context-management`
Enhanced context value management and schema validation:
- `context-management.mach` - Context value storage and retrieval with set_context_value/get_context_value tools
- `template-variables.mach` - Template variable resolution using {{nodeName.attributeName}} syntax

### `/complex`
Real-world patterns and advanced features:
- `complex-machine.dygram` - Full-featured machine with context, workflows, and conditions
- `unicode-machine.dygram` - Unicode identifiers and labels (Chinese, Japanese)
- `context-heavy.dygram` - Multiple context definitions with rich attributes

### `/stress`
Performance and scale testing:
- `large-50-nodes.dygram` - 50 nodes with attributes and cross-connections

### `/edge-cases`
Boundary conditions and unusual patterns:
- `special-characters.dygram` - Underscores, numbers, emojis in identifiers
- `edge-cases-collection.dygram` - Empty nodes, multiple edges, chained transitions

## Usage

These examples are referenced by:
- **Integration tests** in `test/integration/generative.test.ts`
- **Documentation** in `docs/`
- **Language validation** for parser completeness and transformation losslessness

Each example demonstrates specific language features and validates the full pipeline:
```
DyGram source → AST → JSON → Mermaid diagram
```

See `docs/syntax-guide.md` for detailed explanations of each feature.
