# Attribute Behavior Exploration

## Overview

This document explores how attributes behave across different levels of the machine hierarchy: root (machine), namespaces (parent nodes), and leaf nodes. This is exploratory analysis only - no runtime behavior changes are implemented.

## Current State

### Attribute Sources

1. **Root Level (Machine)**
   - Now supports attributes directly on the machine definition
   - Examples: `version`, `description`, `modelId`, configuration settings
   - Use case: Global machine metadata and configuration

2. **Namespace Level (Parent Nodes)**
   - Parent nodes with children can have attributes
   - Examples: Namespace-level configuration, shared state within a module
   - Use case: Shared configuration for child nodes

3. **Leaf Node Level**
   - Individual nodes have attributes
   - Examples: Node-specific data, prompts, parameters
   - Use case: Node behavior and data

4. **Context Nodes (via -reads-> edges)**
   - Tasks and states link to context/data nodes for runtime data
   - Examples: Application state, user data, configuration
   - Use case: Dynamic runtime values that change during execution

## Potential Behavior Patterns

### Pattern 1: Attribute Inheritance (Read-Only Cascade)

**Concept**: Child nodes automatically inherit read-only access to parent and root attributes.

**Example**:
```dy
machine "Pipeline" {
    apiUrl: "https://api.example.com";
    timeout<number>: 5000;
}

task DataPipeline "Data Processing" {
    batchSize<number>: 100;

    task validate {
        // Could access: machine.apiUrl, machine.timeout, DataPipeline.batchSize
        // All read-only by default
    }
}
```

**Benefits**:
- Reduces boilerplate (no need for explicit -reads-> edges to parents)
- Natural scoping - closer scopes shadow outer scopes
- Configuration can be set once at appropriate level

**Challenges**:
- Needs clear shadowing rules (does child's `timeout` override parent's?)
- May conflict with explicit context edges (-reads->)

### Pattern 2: Attribute Namespacing

**Concept**: Attributes are accessed via fully qualified names to avoid ambiguity.

**Example**:
```dy
task analyze {
    prompt: "Analyze {{ $machine.apiUrl }} with timeout {{ $root.timeout }}";
    // Or: {{ DataPipeline.batchSize }}
}
```

**Benefits**:
- No ambiguity about which attribute is referenced
- Clear ownership model
- Works naturally with existing qualified name syntax

**Challenges**:
- More verbose
- Requires templating system to support namespace access

### Pattern 3: Attribute Overriding (Prototype Chain)

**Concept**: Attributes resolve like JavaScript prototype chain - check local first, then parent, then root.

**Example**:
```dy
machine "System" {
    modelId: "claude-3-5-haiku-20241022";  // Default
}

task ComplexAnalysis {
    modelId: "claude-3-5-sonnet-20241022";  // Override for this tree

    task quickCheck {
        // Uses "claude-3-5-sonnet-20241022" from parent
    }

    task deepAnalysis {
        modelId: "claude-4-sonnet-latest";  // Override again
        // Uses "claude-4-sonnet-latest"
    }
}
```

**Benefits**:
- Intuitive behavior (closest wins)
- Supports configuration at appropriate granularity
- Already works this way for modelId (task > machine > env > default)

**Challenges**:
- May make debugging harder ("where did this value come from?")
- Needs clear rules for different attribute types

### Pattern 4: Explicit vs Implicit Data Flow

**Current Behavior**:
- Tasks/states use `-reads->` and `-writes->` edges to context nodes for runtime data
- This is explicit and permission-controlled

**Question**: Should node/namespace/root attributes behave differently from context nodes?

**Option A: Attributes are Static, Context is Dynamic**
- Machine/namespace/node attributes: Static configuration (modelId, timeout, etc.)
- Context nodes: Runtime data that changes during execution (user state, counters, etc.)
- Attributes are read-only inherited, context requires explicit edges

**Option B: Unified Model**
- All data (attributes and context) flows via same mechanism
- Remove distinction between "configuration" and "data"
- Always use explicit edges for clarity

## Existing Behavior to Consider

### Context Inheritance (Already Implemented)
From the README:
```dy
task DataPipeline {
    context pipelineState { recordsProcessed: 0; }

    task validate {
        // Automatically inherits read access to pipelineState
    }
}
```

**This already provides attribute inheritance for context nodes!**

### Model Selection (Already Implemented)
Priority order:
1. Task-level `modelId` attribute
2. CLI parameter
3. Machine-level config node `modelId`
4. Environment variable
5. Default

**This already implements attribute overriding for modelId!**

## Recommendations

### Short Term (Current PR)
- ✅ Enable machine-level attributes using same grammar as nodes
- ✅ Visualize all attributes properly
- ❌ No behavior changes to runtime

### Medium Term (Consider for Future)

1. **Formalize Attribute vs Context**
   - Attributes: Static configuration (modelId, timeout, retries, etc.)
   - Context: Dynamic runtime data (state, counters, user data)
   - Attributes inherit read-only by default
   - Context requires explicit edges and permissions

2. **Extend ModelId Pattern**
   - Apply same override pattern to other "configuration" attributes
   - Clear documentation of override priorities
   - Could support: `defaultModel`, `maxRetries`, `timeout`, etc.

3. **Qualified Access in Templates**
   - Support `{{ $machine.version }}`, `{{ $parent.batchSize }}` in prompts
   - Makes data flow explicit and traceable
   - Aligns with existing qualified name syntax

### Long Term (Future Design)

1. **Attribute Type System**
   - Mark certain attributes as "inheritable" vs "local"
   - Define shadowing/override rules per attribute type
   - Support attribute annotations: `@override`, `@readonly`, `@inherited`

2. **Schema Validation**
   - Validate that nodes have required attributes from parent/root
   - Type check attribute access in templates
   - Catch configuration errors at parse time

## Questions for Further Exploration

1. **Shadowing**: If both parent and child have `timeout`, which wins? Should this be configurable?

2. **Side Effects**: Should writing to inherited attributes be allowed? If so, does it shadow or mutate parent?

3. **Serialization**: How do we serialize runtime state that includes inherited values? Show only local or show resolved?

4. **Meta-Programming**: If tasks can modify the machine, can they add/change attributes? Should this affect already-running siblings?

5. **Validation**: Should we validate that referenced parent attributes exist at parse time? Or allow dynamic addition?

## Conclusion

The machine now supports attributes at all levels (root, namespace, leaf) using a unified grammar. The current implementation focuses on **declaration and visualization** without changing runtime behavior.

Future work could explore:
- Making configuration attributes (like `modelId`) follow a consistent inheritance pattern
- Supporting qualified attribute access in templates
- Formalizing the distinction between static configuration (attributes) and dynamic data (context)

The existing context inheritance and modelId override patterns provide good precedents for future attribute behavior design.
