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

## State Modules (Phase 2)

**State modules** are state nodes with children that act as workflow modules. They provide automatic entry/exit routing and enable powerful workflow composition patterns.

### What is a State Module?

A state module is simply a `state` node that contains child nodes:

```dygram
// This is a state module
state DataPipeline {
    state validate;
    state process;
    state store;

    validate -> process -> store;
}
```

### Module Entry

When you transition to a state module, execution automatically enters at the **first child**:

```dygram
start -> DataPipeline;  // Automatically enters at 'validate' (first child)
```

**Entry Priority:**
1. Task nodes (actual executable work)
2. State nodes (can be entry points for nested modules)
3. Other node types (avoids context nodes)

### Module Exit

Terminal nodes (those with no outbound edges) within a module automatically inherit the module-level exit edges:

```dygram
state Pipeline {
    state task1 -> task2 -> task3;  // task3 is terminal
}

Pipeline -> complete;  // Module-level exit

// When task3 completes, it inherits Pipeline's exit and transitions to 'complete'
```

**Explicit edges always take precedence** over inherited module exits.

### Nested Modules

Modules can contain other modules, creating hierarchical workflows:

```dygram
state OuterPipeline {
    // Nested module
    state ValidationPhase {
        state check -> validate -> verify;
    }

    state ProcessingPhase {
        state transform -> aggregate;
    }

    ValidationPhase -> ProcessingPhase;
}

// Transitioning to OuterPipeline:
// OuterPipeline -> ValidationPhase -> check (enters nested module)
```

### Module Composition Patterns

**Sequential Composition:**
```dygram
state ModuleA { /* ... */ }
state ModuleB { /* ... */ }
state ModuleC { /* ... */ }

start -> ModuleA;
ModuleA -> ModuleB;
ModuleB -> ModuleC;
ModuleC -> end;
```

**Conditional Composition:**
```dygram
state Validation { /* ... */ }
state SuccessPath { /* ... */ }
state ErrorPath { /* ... */ }

start -> Validation;
Validation -success-> SuccessPath;
Validation -error-> ErrorPath;
```

**Module with Error Handling:**
```dygram
state Pipeline {
    state task1 -> task2 -> task3;
}

task handleError;

// Explicit error paths from specific tasks
Pipeline.task2 -error-> handleError;

// Module-level exit for success
Pipeline -> complete;
```

### State Modules vs Simple States

**Simple State** (no children):
```dygram
state ready;
state processing;

ready -> processing;  // Normal state transition
```

**State Module** (with children):
```dygram
state ProcessingModule {
    state step1 -> step2;
}

ready -> ProcessingModule;  // Enters at step1
```

Simple states work exactly as before - only state nodes with children gain module semantics.

### Benefits of State Modules

1. **Encapsulation**: Group related workflow steps into logical modules
2. **Reusability**: Define reusable sub-workflows
3. **Composition**: Build complex workflows from simpler modules
4. **Clarity**: Make workflow structure explicit and hierarchical
5. **Automatic Routing**: No need to explicitly wire entry/exit points

### Example: ETL Pipeline with Modules

```dygram
machine "ETL Pipeline"

// Each phase is a state module
state Extract {
    state fetchData -> validateSource;
}

state Transform {
    state cleanData -> enrichData -> aggregate;
}

state Load {
    state prepareTarget -> writeData -> verifyLoad;
}

// Compose modules
init start;
start -> Extract;
Extract -> Transform;
Transform -> Load;
Load -> complete;
```

When this executes:
1. `start -> Extract` enters at `Extract.fetchData`
2. `Extract.validateSource` (terminal) transitions to `Transform.cleanData`
3. `Transform.aggregate` (terminal) transitions to `Load.prepareTarget`
4. `Load.verifyLoad` (terminal) transitions to `complete`

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

## Optional Types (Phase 3)

**Optional types** allow you to omit explicit type declarations when the node's purpose is clear from its attributes, name, or graph structure. The system automatically infers the type, reducing ceremony while maintaining clarity.

### Why Optional Types?

Traditional approach with explicit types:
```dygram
task fetchData { prompt: "Fetch from API"; }
context apiConfig { url: "https://api.com"; }
state ready;
```

With optional types (same behavior):
```dygram
fetchData { prompt: "Fetch from API"; }  // Inferred as task
apiConfig { url: "https://api.com"; }    // Inferred as context
ready;                                    // Inferred as state
```

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

```dygram
// Explicit
task analyze { prompt: "Analyze data"; }

// Inferred (same behavior)
analyze { prompt: "Analyze data"; }
```

**When to use explicit `task`:**
- When you want to make the type explicit for documentation
- When a task node has no prompt yet (will be added later)

### Context Inference

Contexts are inferred from naming patterns or data-only attributes:

```dygram
// Inferred from name patterns
userContext { id: "123"; }           // has "context"
apiConfig { url: "..."; }            // has "config"
queryResult { rows: []; }            // has "result"
userData { name: "Alice"; }          // has "data"
inputParams { x: 1, y: 2; }          // has "input"
outputData { value: 42; }            // has "output"
appState { status: "running"; }      // has "state" (but not exact "state")

// Inferred from data-only attributes
settings {
    theme: "dark";
    timeout: 5000;
    // No executable attributes → context
}
```

**When to use explicit `context`:**
- When the name doesn't match patterns and attributes are ambiguous
- For clarity in complex machines

### Tool Inference

Tools are inferred from schema-like attributes:

```dygram
// Inferred from schema attributes
calculator {
    input: "{ x: number, y: number }";
    output: "{ result: number }";
}

validator {
    schema: "{ type: 'object', properties: {...} }";
}

api {
    parameters: "{ endpoint: string }";
    returns: "Response";
}
```

### State Inference (Default)

Simple nodes without special attributes default to states:

```dygram
// These are all inferred as states
ready;
waiting;
processing;
idle "Idle State";
```

### Init Inference

Init nodes can be inferred from graph structure (no incoming edges):

```dygram
// This node has no incoming edges, has outgoing → inferred as init
start;
start -> process;

// However, explicit init is recommended for clarity
init start;
```

### Mixing Explicit and Inferred Types

You can freely mix explicit and inferred types:

```dygram
state Pipeline {
    // Explicit type
    task validate {
        prompt: "Validate input";
    }

    // Inferred type (same behavior)
    transform {
        prompt: "Transform data";
    }

    // Inferred as state (default)
    intermediate;

    // Workflow
    validate -> transform -> intermediate;
}
```

### Explicit Type Overrides Inference

Explicit types always take precedence over inference:

```dygram
// Name suggests context, but explicit type makes it a state
state userData {
    // This is a control flow state, not a data context
}

// Has prompt, but explicit type makes it a state
state processor {
    prompt: "This won't execute as a task";
    // Type is state, not task
}
```

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

```dygram
machine "ETL Pipeline with Optional Types"

// Inferred context (name pattern)
apiConfig {
    url: "https://api.example.com";
    timeout: 5000;
}

// Inferred as state module (default)
Pipeline {
    // All inferred as tasks (have prompts)
    extract { prompt: "Extract data from {{ apiConfig.url }}"; }
    transform { prompt: "Transform extracted data"; }
    load { prompt: "Load data into warehouse"; }

    extract -> transform -> load;
}

// Inferred context (name pattern)
results {
    recordCount: 0;
    status: "pending";
}

// Explicit init for clarity
init start;

start -> Pipeline;
Pipeline -reads-> apiConfig;
Pipeline -writes-> results;
```

### Inference Priority Example

When multiple rules could apply, priority determines the type:

```dygram
// Name has "data" (context pattern) BUT has prompt (task rule)
// → Task wins (higher priority)
processData {
    prompt: "Process the data";
    // Inferred as: task
}

// Name has "input" (context pattern) AND has schema (tool rule)
// → Tool wins (higher priority than context)
dataInput {
    schema: "{ type: 'object' }";
    // Inferred as: tool
}

// Name has "config" (context pattern), no other attributes
// → Context wins
appConfig {
    setting: "value";
    // Inferred as: context
}
```

## See Also

- [Context Examples](../context/README.md) - More on context nodes and permissions
- [Workflows Examples](../workflows/README.md) - Complex workflow patterns
- [Advanced Examples](../advanced/README.md) - Advanced language features
