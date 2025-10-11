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
- `mixed-arrow-types.dygram` - All arrow variants (→, -->, =>, <-->) with explanatory comments
- `quoted-labels.dygram` - Labels with special characters and spaces
- `relationship-types.dygram` - **NEW**: Comprehensive demonstration of all relationship types with semantic meanings

### `/nesting`
Hierarchical node structures:
- `nested-2-levels.dygram` - Two levels of parent-child nesting
- `nested-3-levels.dygram` - Three levels of nesting
- `complex-nesting.dygram` - Mixed nesting with 4+ levels
- `deep-nested-5-levels.dygram` - Deep hierarchy validation

### `/context`
Context nodes and context value management:
- `context-management.mach` - Context value storage and retrieval with set_context_value/get_context_value tools
- `template-variables.mach` - Template variable resolution using {{nodeName.attributeName}} syntax
- `nested-access.dygram` - **NEW**: Nested attribute access patterns with multi-level contexts

### `/advanced`
Advanced language features (formerly `/phase2`):
- `annotations.dygram` - Annotation system (@Abstract, @Singleton, @Deprecated, @Async, @Critical)
- `multiplicity.dygram` - Multiplicity and cardinality in relationships
- `dependency-inference.dygram` - Automatic dependency inference from template variables
- `complete-example.dygram` - Comprehensive example combining all advanced features
- `error-handling.dygram` - **NEW**: Common error handling patterns (retry, circuit breaker, fallback, etc.)
- `optional-types.dygram` - **NEW**: Optional types and null handling with `?` suffix

### `/documentation`
Documentation features (formerly `/phase3`):
- `notes-and-generics.dygram` - Documentation notes and generic types
- `complete-phase3.dygram` - Complete example with notes and generic type annotations

### `/validation`
Validation features (formerly `/phase4`):
- `type-checking.dygram` - Type validation and type inference
- `graph-validation.dygram` - Graph structure validation
- `semantic-validation.dygram` - Semantic validation of design patterns
- `complete-validated.dygram` - Complete validated example demonstrating all validation features

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

### `/workflows`
Real-world workflow examples:
- `user-onboarding.dygram` - User registration and onboarding flow
- `order-processing.dygram` - E-commerce order lifecycle
- `ci-cd-pipeline.dygram` - Continuous integration and deployment pipeline
- `smart-task-prioritizer.dygram` - AI-powered task prioritization workflow
- `code-generation-demo.dygram` - Complete code generation workflow
- `data-pipeline.dygram` - **NEW**: ETL data pipeline with error handling and monitoring

### `/rails` 🆕
Rails-Based Architecture examples:
- `auto-transitions.mach` - Automated vs agent-controlled transitions
- `dynamic-tool-construction.mach` - Agent-constructed tools
- `self-improving-pipeline.mach` - Complete meta-programming workflow
- `phase-specific-context.mach` - Permission-based context access
- `tool-review-improvement.mach` - Tool evolution and improvement

## What's New

### Recent Additions (2025-10-11)

1. **🆕 Rails-Based Architecture Examples**: New `/rails` directory with 5 comprehensive examples
   - Automated vs agent-controlled transitions
   - Dynamic tool construction
   - Self-improving pipelines with meta-programming
   - Phase-specific context with permissions
   - Tool review and improvement workflows

### Previous Additions (2025-10-10)

1. **Reorganized for Clarity**: Renamed phase directories to feature-based names
   - `phase2/` → `advanced/` (clearer intent)
   - `phase3/` → `documentation/` (focused on docs features)
   - `phase4/` → `validation/` (validation-specific)

2. **New Examples**:
   - `edges/relationship-types.dygram` - Comprehensive relationship types guide
   - `advanced/error-handling.dygram` - 8 error handling patterns
   - `advanced/optional-types.dygram` - Optional types and null handling
   - `context/nested-access.dygram` - Multi-level context access patterns
   - `workflows/data-pipeline.dygram` - Complete ETL pipeline example

3. **Enhanced Documentation**:
   - Added README.md files to each feature directory
   - Improved inline comments in examples
   - Better cross-referencing between examples

4. **Improved Examples**:
   - Enhanced `mixed-arrow-types.dygram` with explanatory comments
   - Better organization of context management examples

## Usage

These examples are referenced by:
- **Integration tests** in `test/integration/generative.test.ts`
- **Documentation** in `docs/`
- **Language validation** for parser completeness and transformation losslessness

Each example demonstrates specific language features and validates the full pipeline:
```
DyGram source → AST → JSON → Mermaid diagram
```

### Running Examples

```bash
# Parse and validate an example
npx dygram parseAndValidate examples/basic/minimal.dygram

# Generate outputs from an example
npx dygram generate examples/workflows/data-pipeline.dygram -f json,html -d output/

# Execute an example with LLM tasks (requires ANTHROPIC_API_KEY)
npx dygram execute examples/workflows/smart-task-prioritizer.dygram
```

## Learning Path

**For Beginners:**
1. Start with `/basic` - Learn fundamental syntax
2. Explore `/attributes` - Understand node attributes
3. Study `/edges` - Master transitions and relationships
4. Review `/context` - Learn context management

**For Intermediate Users:**
5. Dive into `/advanced` - Annotations, multiplicity, error handling
6. Explore `/documentation` - Notes and generic types
7. Study `/validation` - Type checking and graph validation
8. Review `/workflows` - Real-world examples

**For Advanced Users:**
9. Examine `/rails` - 🆕 Rails-Based Architecture and meta-programming
10. Explore `/complex` - Complex patterns
11. Challenge yourself with `/stress` - Performance considerations
12. Explore edge cases in `/edge-cases`

## See Also

- [Syntax Guide](../docs/syntax-guide.md) - Complete syntax reference
- [Language Overview](../docs/language-overview.md) - Conceptual introduction
- [Advanced Features](../docs/advanced-features.md) - Advanced feature documentation
- [Examples Index](../docs/examples-index.md) - Organized by feature
- [Testing Approach](../docs/testing-approach.md) - Validation methodology
