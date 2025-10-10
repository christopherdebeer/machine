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

## Edge Examples (Extended)

Additional edge examples for relationship types.

| Example | Description | Features |
|---------|-------------|----------|
| [relationship-types.dygram](../examples/edges/relationship-types.dygram) | **NEW**: Comprehensive relationship types guide | All arrow types with semantic meanings, inheritance, composition, aggregation, complete examples |

## Context Management Examples

Context nodes and context value management.

| Example | Description | Features |
|---------|-------------|----------|
| [context-management.mach](../examples/context/context-management.mach) | Context value storage and retrieval | set_context_value, get_context_value, typed attributes |
| [template-variables.mach](../examples/context/template-variables.mach) | Template variable resolution | {{nodeName.attributeName}} syntax, dynamic prompts |
| [nested-access.dygram](../examples/context/nested-access.dygram) | **NEW**: Nested attribute access patterns | Multi-level contexts, dot notation, deep nesting, type-safe nested access |

## Advanced Features Examples

Advanced language features (formerly Phase 2).

| Example | Description | Features |
|---------|-------------|----------|
| [annotations.dygram](../examples/advanced/annotations.dygram) | Annotation system | @Abstract, @Singleton, @Deprecated, @Async, @Critical |
| [multiplicity.dygram](../examples/advanced/multiplicity.dygram) | Multiplicity and cardinality | One-to-many, one-to-one, many-to-many, optional relationships |
| [dependency-inference.dygram](../examples/advanced/dependency-inference.dygram) | Automatic dependency inference | Template variables, automatic edges, multiple dependencies |
| [complete-example.dygram](../examples/advanced/complete-example.dygram) | Complete Phase 2 features | All advanced features combined |
| [error-handling.dygram](../examples/advanced/error-handling.dygram) | **NEW**: Error handling patterns | Retry, circuit breaker, fallback, saga, timeout, DLQ, validation |
| [optional-types.dygram](../examples/advanced/optional-types.dygram) | **NEW**: Optional types and null handling | Optional syntax (?), null values, type safety |

## Documentation Features Examples

Documentation features (formerly Phase 3).

| Example | Description | Features |
|---------|-------------|----------|
| [notes-and-generics.dygram](../examples/documentation/notes-and-generics.dygram) | Notes and generic types | note for syntax, Promise<T>, Array<T>, Map<K,V> |
| [complete-phase3.dygram](../examples/documentation/complete-phase3.dygram) | Complete Phase 3 features | Notes, generics, documentation patterns |

## Validation Features Examples

Validation features (formerly Phase 4).

| Example | Description | Features |
|---------|-------------|----------|
| [type-checking.dygram](../examples/validation/type-checking.dygram) | Type checking and validation | Primitive types, collections, generics, optionals, inference |
| [graph-validation.dygram](../examples/validation/graph-validation.dygram) | Graph structure validation | Unreachable nodes, cycles, orphans, entry/exit points |
| [semantic-validation.dygram](../examples/validation/semantic-validation.dygram) | Semantic validation | Node type rules, annotation compatibility, best practices |
| [complete-validated.dygram](../examples/validation/complete-validated.dygram) | Complete validated example | All validation features, e-commerce system |

## Complex Examples

Real-world patterns and advanced features.

| Example | Description | Features |
|---------|-------------|----------|
| [complex-machine.dygram](../examples/complex/complex-machine.dygram) | Full-featured machine | Context, workflows, conditions, multiple node types |
| [unicode-machine.dygram](../examples/complex/unicode-machine.dygram) | Unicode support demonstration | Chinese, Japanese characters, emoji |
| [context-heavy.dygram](../examples/complex/context-heavy.dygram) | Multiple context definitions | Rich context attributes |

## Workflow Examples

Real-world workflow examples.

| Example | Description | Features |
|---------|-------------|----------|
| [user-onboarding.dygram](../examples/workflows/user-onboarding.dygram) | User onboarding flow | Registration, verification, profile setup |
| [order-processing.dygram](../examples/workflows/order-processing.dygram) | E-commerce order lifecycle | Order states, payment, fulfillment, refunds |
| [ci-cd-pipeline.dygram](../examples/workflows/ci-cd-pipeline.dygram) | CI/CD pipeline | Build, test, deploy, security scanning, rollback |
| [smart-task-prioritizer.dygram](../examples/workflows/smart-task-prioritizer.dygram) | AI task prioritization | LLM analysis, priority assignment, context management |
| [code-generation-demo.dygram](../examples/workflows/code-generation-demo.dygram) | Code generation workflow | Requirements, code gen, tests, docs, validation |
| [data-pipeline.dygram](../examples/workflows/data-pipeline.dygram) | **NEW**: ETL data pipeline | Extract, transform, load, error handling, quality checks, monitoring |

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
