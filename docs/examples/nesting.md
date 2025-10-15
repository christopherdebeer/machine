# Nesting Examples

This directory contains examples demonstrating DyGram's nesting and namespace features.

## Overview

DyGram supports semantic nesting that goes beyond simple visual grouping. Nested nodes create hierarchical namespaces with powerful features:

1. **Qualified Names** (Phase 1): Reference nested nodes using dot notation (e.g., `Parent.Child`, `Level1.Level2.Node`)
2. **Context Inheritance** (Phase 1): Child nodes automatically inherit read-only access to context nodes accessible by their parent nodes
3. **State Modules** (Phase 2): State nodes with children act as workflow modules with automatic entry/exit routing
4. **Optional Types** (Phase 3): Node types can be inferred from attributes and context, reducing ceremony

## Basic Nesting

### Simple Hierarchy


### Qualified Names


## Context Inheritance

Child nodes automatically inherit **read-only** access to context nodes accessible by their parent nodes. This eliminates repetitive edge declarations and makes context relationships more intuitive.

### Basic Inheritance


### Multi-Level Inheritance


### Inheritance Rules

1. **Read-Only**: Children inherit contexts as **read-only**, never write or store permissions
2. **Automatic**: No explicit edges needed for inherited access
3. **Explicit Override**: Explicit edges on child nodes take precedence over inherited access
4. **Transitive**: Inheritance is transitive through multiple levels (grandparent → parent → child)

### Example: Explicit Override


## Examples in this Directory

### `nested-2-levels.dygram`
Simple 2-level nesting structure demonstrating basic hierarchy.

### `nested-3-levels.dygram`
3-level nesting showing deeper hierarchies.

### `complex-nesting.dygram`
Complex nesting with multiple branches up to 4 levels deep.

### `deep-nested-5-levels.dygram`
Demonstrates 5-level deep nesting to test parser depth limits.

### `semantic-nesting-example.dygram` ⭐ **Phase 1**
Comprehensive example showing qualified names and context inheritance:
- Qualified names for referencing nested nodes
- Context inheritance across multiple levels
- Practical data pipeline with phases
- Mix of inherited and explicit context access
- Notes explaining the inheritance behavior

### `state-modules-example.dygram` ⭐⭐ **Phase 2**
Comprehensive example showing state modules and workflow composition:
- State modules as workflow components
- Module entry and exit routing
- Nested modules (modules within modules)
- Module composition patterns
- Context inheritance with modules
- Error handling across modules
- Complete ETL pipeline example

### `optional-types-example.dygram` ⭐⭐⭐ **Phase 3**
Comprehensive example showing optional type inference:
- Task inference from `prompt` attribute
- Context inference from naming patterns and data attributes
- Tool inference from schema attributes
- State inference as default for control flow
- Init inference from graph structure
- Mixed explicit and inferred types
- Type override with explicit declarations
- Inference priority rules

## Key Benefits

### 1. Clear Organization
Nesting creates logical groupings that reflect your workflow structure:


### 2. Reduced Boilerplate
Context inheritance eliminates repetitive edge declarations:


### 3. Better Scoping
Qualified names prevent naming collisions and make references explicit:


### 4. Intuitive Context Access
Context inheritance matches natural expectations - child contexts can see parent contexts, just like lexical scoping in programming languages.

## State Modules (Phase 2)

**State modules** are state nodes with children that act as workflow modules. They provide automatic entry/exit routing and enable powerful workflow composition patterns.

### What is a State Module?

A state module is simply a `state` node that contains child nodes:


### Module Entry

When you transition to a state module, execution automatically enters at the **first child**:


**Entry Priority:**
1. Task nodes (actual executable work)
2. State nodes (can be entry points for nested modules)
3. Other node types (avoids context nodes)

### Module Exit

Terminal nodes (those with no outbound edges) within a module automatically inherit the module-level exit edges:


**Explicit edges always take precedence** over inherited module exits.

### Nested Modules

Modules can contain other modules, creating hierarchical workflows:


### Module Composition Patterns

**Sequential Composition:**

**Conditional Composition:**

**Module with Error Handling:**

### State Modules vs Simple States

**Simple State** (no children):

**State Module** (with children):

Simple states work exactly as before - only state nodes with children gain module semantics.

### Benefits of State Modules

1. **Encapsulation**: Group related workflow steps into logical modules
2. **Reusability**: Define reusable sub-workflows
3. **Composition**: Build complex workflows from simpler modules
4. **Clarity**: Make workflow structure explicit and hierarchical
5. **Automatic Routing**: No need to explicitly wire entry/exit points

### Example: ETL Pipeline with Modules


When this executes:
1. `start -> Extract` enters at `Extract.fetchData`
2. `Extract.validateSource` (terminal) transitions to `Transform.cleanData`
3. `Transform.aggregate` (terminal) transitions to `Load.prepareTarget`
4. `Load.verifyLoad` (terminal) transitions to `complete`

## Usage Notes

### Backward Compatibility
Simple names still work for backward compatibility:

### Context Inheritance Control
Context inheritance is enabled by default. It follows these principles:
- **Automatic**: Children automatically inherit read access
- **Safe**: Only read access is inherited (never write/store)
- **Overridable**: Explicit edges always take precedence

### When to Use Qualified Names

Use qualified names when:
- You have multiple nested structures with potentially conflicting names
- You want to make parent-child relationships explicit in your workflow
- You need to reference deeply nested nodes from outside their parent

Use simple names when:
- You have a flat structure or minimal nesting
- Node names are unique across the machine
- You prefer concise syntax

## Optional Types (Phase 3)

**Optional types** allow you to omit explicit type declarations when the node's purpose is clear from its attributes, name, or graph structure. The system automatically infers the type, reducing ceremony while maintaining clarity.

### Why Optional Types?

Traditional approach with explicit types:

With optional types (same behavior):

### Inference Rules

The system infers types in **priority order**:

1. **Explicit type always wins** - If you provide a type, that's what it is
2. **Has `prompt` attribute → task** - Nodes with prompts are executable tasks
3. **Has schema attributes → tool** - Nodes with `input`, `output`, `parameters`, `schema`, or `returns` are tools
4. **Name patterns or data attributes → context**:
   - Names containing: `context`, `data`, `input`, `output`, `result`, `config`, `State` (but not "state" alone)
   - OR nodes with only data attributes (no executable attributes like `prompt`, `meta`, `condition`)
5. **Graph structure → init** - Nodes with no incoming edges but has outgoing edges (requires graph analysis)
6. **Default → state** - Simple control flow nodes

### Task Inference

Tasks are inferred from the `prompt` attribute:


**When to use explicit `task`:**
- When you want to make the type explicit for documentation
- When a task node has no prompt yet (will be added later)

### Context Inference

Contexts are inferred from naming patterns or data-only attributes:


**When to use explicit `context`:**
- When the name doesn't match patterns and attributes are ambiguous
- For clarity in complex machines

### Tool Inference

Tools are inferred from schema-like attributes:


### State Inference (Default)

Simple nodes without special attributes default to states:


### Init Inference

Init nodes can be inferred from graph structure (no incoming edges):


### Mixing Explicit and Inferred Types

You can freely mix explicit and inferred types:


### Explicit Type Overrides Inference

Explicit types always take precedence over inference:


### Benefits of Optional Types

1. **Less Ceremony**: Don't type `task` for every node with a `prompt`
2. **Cleaner Syntax**: Focus on what the node does, not what it's called
3. **Natural**: Types flow from purpose (has prompt → it's a task)
4. **Flexible**: Mix explicit and inferred freely
5. **Backward Compatible**: All explicit types still work
6. **Clear Overrides**: Can always force a specific type when needed

### Best Practices

**Use inferred types when:**
- The type is obvious from attributes (has `prompt` → task)
- Names follow conventions (ends in `Config` → context)
- You want concise, clean syntax

**Use explicit types when:**
- You want to override inference (force a type)
- The type isn't clear from attributes/name
- You're documenting/teaching the language
- You want maximum clarity in complex machines

### Example: Complete Data Pipeline


### Inference Priority Example

When multiple rules could apply, priority determines the type:


## See Also

- [Context Examples](../context/README.md) - More on context nodes and permissions
- [Workflows Examples](../workflows/README.md) - Complex workflow patterns
- [Advanced Examples](../advanced/README.md) - Advanced language features
