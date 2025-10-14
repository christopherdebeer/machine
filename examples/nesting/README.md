# Nesting Examples

This directory contains examples demonstrating DyGram's nesting and namespace features.

## Overview

DyGram supports semantic nesting that goes beyond simple visual grouping. Nested nodes create hierarchical namespaces with two powerful features:

1. **Qualified Names**: Reference nested nodes using dot notation (e.g., `Parent.Child`, `Level1.Level2.Node`)
2. **Context Inheritance**: Child nodes automatically inherit read-only access to context nodes accessible by their parent nodes

## Basic Nesting

### Simple Hierarchy

```dygram
machine "Basic Nesting"

Parent {
    Child1;
    Child2;
}

// Can reference using simple names (backward compatible)
Child1 -> Child2;
```

### Qualified Names

```dygram
machine "Qualified Names"

Pipeline {
    task Start;
    task End;
}

External;

// Reference nested nodes using qualified names
External -> Pipeline.Start;
Pipeline.Start -> Pipeline.End;
Pipeline.End -> External;
```

## Context Inheritance

Child nodes automatically inherit **read-only** access to context nodes accessible by their parent nodes. This eliminates repetitive edge declarations and makes context relationships more intuitive.

### Basic Inheritance

```dygram
machine "Context Inheritance"

Pipeline {
    context config {
        apiUrl: "https://api.example.com";
    }

    task FetchData {
        prompt: "Fetch data from API";
        // Automatically has read access to config - no edge needed!
    }

    task ProcessData {
        prompt: "Process the fetched data";
        // Also has read access to config
    }
}

// Parent node has explicit access to config
Pipeline -reads-> Pipeline.config;

// Children inherit this access automatically
```

### Multi-Level Inheritance

```dygram
machine "Multi-Level Inheritance"

context globalSettings {
    timeout: 5000;
}

Workflow {
    context workflowState {
        status: "running";
    }

    Phase1 {
        task Task1 {
            // Inherits read access to:
            // - globalSettings (from Workflow's parent)
            // - workflowState (from Workflow)
        }
    }
}

Workflow -reads-> globalSettings;
Workflow -writes-> Workflow.workflowState;
```

### Inheritance Rules

1. **Read-Only**: Children inherit contexts as **read-only**, never write or store permissions
2. **Automatic**: No explicit edges needed for inherited access
3. **Explicit Override**: Explicit edges on child nodes take precedence over inherited access
4. **Transitive**: Inheritance is transitive through multiple levels (grandparent → parent → child)

### Example: Explicit Override

```dygram
machine "Override Example"

Pipeline {
    context data;

    task Reader {
        // Inherits read-only access
    }

    task Writer {
        // Explicit edge overrides inherited read-only with write access
    }
}

Pipeline -reads-> Pipeline.data;

// Writer explicitly gets write access (overrides inherited read-only)
Pipeline.Writer -writes-> Pipeline.data;
```

## Examples in this Directory

### `nested-2-levels.dygram`
Simple 2-level nesting structure demonstrating basic hierarchy.

### `nested-3-levels.dygram`
3-level nesting showing deeper hierarchies.

### `complex-nesting.dygram`
Complex nesting with multiple branches up to 4 levels deep.

### `deep-nested-5-levels.dygram`
Demonstrates 5-level deep nesting to test parser depth limits.

### `semantic-nesting-example.dygram` ⭐ **NEW**
Comprehensive example showing:
- Qualified names for referencing nested nodes
- Context inheritance across multiple levels
- Practical data pipeline with phases
- Mix of inherited and explicit context access
- Notes explaining the inheritance behavior

## Key Benefits

### 1. Clear Organization
Nesting creates logical groupings that reflect your workflow structure:

```dygram
DataPipeline {
    ValidationPhase { /* validation tasks */ }
    ProcessingPhase { /* processing tasks */ }
    StoragePhase { /* storage tasks */ }
}
```

### 2. Reduced Boilerplate
Context inheritance eliminates repetitive edge declarations:

```dygram
// Before: Explicit edges for every task
task1 -reads-> config;
task2 -reads-> config;
task3 -reads-> config;

// After: Single edge for parent, children inherit
Pipeline -reads-> config;
Pipeline {
    task1; // Inherits read access
    task2; // Inherits read access
    task3; // Inherits read access
}
```

### 3. Better Scoping
Qualified names prevent naming collisions and make references explicit:

```dygram
Pipeline1.Task1 -> Pipeline2.Task1;  // Clear which tasks
```

### 4. Intuitive Context Access
Context inheritance matches natural expectations - child contexts can see parent contexts, just like lexical scoping in programming languages.

## Usage Notes

### Backward Compatibility
Simple names still work for backward compatibility:
```dygram
Pipeline {
    Child;
}

// Both work:
Child -> End;              // Simple name
Pipeline.Child -> End;     // Qualified name
```

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

## See Also

- [Context Examples](../context/README.md) - More on context nodes and permissions
- [Workflows Examples](../workflows/README.md) - Complex workflow patterns
- [Advanced Examples](../advanced/README.md) - Advanced language features
