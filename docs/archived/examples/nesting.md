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

### `nested-2-levels.dygram`
Nested Machine

```dy examples/nesting/nested-2-levels.dygram
machine "Nested Machine"
level1 {
    level2a;
    level2b;
}
```

### `nested-3-levels.dygram`
Nested Machine

```dy examples/nesting/nested-3-levels.dygram
machine "Nested Machine"
level1 {
    level2a {
        level3a;
        level3b;
    }
    level2b {
        level3c;
        level3d;
    }
}
```

### `optional-types-example.dygram`
Optional Types Example

```dy examples/nesting/optional-types-example.dygram
machine "Optional Types Example"

// ═══════════════════════════════════════════════════════════════════
// OPTIONAL TYPES - Types can be inferred when not explicitly provided
// ═══════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────
// 1. TASK INFERENCE - Nodes with 'prompt' attribute are inferred as tasks
// ────────────────────────────────────────────────────────────────────

// Explicit task type (traditional approach)
task explicitTask {
    prompt: "Analyze the data";
}

// Inferred task type (prompt attribute makes it a task)
inferredTask {
    prompt: "Transform the results";
}

// Both are functionally equivalent!
note explicitTask "Traditional explicit task type"
note inferredTask "Type inferred from 'prompt' attribute - same behavior as explicit task"

// ────────────────────────────────────────────────────────────────────
// 2. CONTEXT INFERENCE - Data nodes are inferred as contexts
// ────────────────────────────────────────────────────────────────────

// Explicit context type
context apiConfig {
    url: "https://api.example.com";
    timeout: 5000;
}

// Inferred context from name pattern (contains "config")
appConfig {
    apiKey: "xxx";
    retries: 3;
}

// Inferred context from data attributes only
settings {
    theme: "dark";
    language: "en";
}

note apiConfig "Explicit context type"
note appConfig "Type inferred from name containing 'config'"
note settings "Type inferred from having only data attributes"

// ────────────────────────────────────────────────────────────────────
// 3. STATE INFERENCE - Simple nodes default to state (control flow)
// ────────────────────────────────────────────────────────────────────

// Explicit state type
state explicitReady "Ready State";

// Inferred state (default for simple nodes)
waiting "Waiting";
processing "Processing";

note explicitReady "Explicit state type"
note waiting "Type inferred as state (default for simple nodes)"

// ────────────────────────────────────────────────────────────────────
// 4. TOOL INFERENCE - Nodes with schema-like attributes are inferred as tools
// ────────────────────────────────────────────────────────────────────

// Explicit tool type
tool explicitCalculator {
    input: "{ x: number, y: number }";
    output: "{ result: number }";
}

// Inferred tool from schema attributes
formatter {
    input: "{ data: string }";
    output: "{ formatted: string }";
}

note explicitCalculator "Explicit tool type"
note formatter "Type inferred from input/output schema attributes"

// ────────────────────────────────────────────────────────────────────
// 5. INIT INFERENCE - Nodes with no incoming edges can be inferred as init
// ────────────────────────────────────────────────────────────────────

// Explicit init type
init start "Entry Point";

// Note: Init inference requires graph analysis, so explicit type is recommended
// for clarity. However, the system can infer init from graph structure.

// ────────────────────────────────────────────────────────────────────
// 6. MIXED USAGE - Explicit and inferred types work together seamlessly
// ────────────────────────────────────────────────────────────────────

state Pipeline {
    // Explicit types
    task validateExplicit {
        prompt: "Validate input";
    }

    // Inferred types (same behavior)
    validate {
        prompt: "Validate input";
    }

    transform {
        prompt: "Transform data";
    }

    intermediate "Processing"; // Inferred as state

    store {
        prompt: "Store results";
    }

    // Workflow
    validate -> transform -> intermediate -> store;
}

// ────────────────────────────────────────────────────────────────────
// 7. CONTEXT INHERITANCE WITH INFERRED TYPES
// ────────────────────────────────────────────────────────────────────

// Inferred context from name
globalConfig {
    environment: "production";
}

state DataPipeline {
    // These tasks automatically inherit read access to globalConfig
    extract {
        prompt: "Extract data from {{ globalConfig.environment }}";
    }

    processData { // "Data" in name, but has prompt → inferred as task (priority)
        prompt: "Process extracted data";
    }
}

DataPipeline -reads-> globalConfig;

// ────────────────────────────────────────────────────────────────────
// 8. EXPLICIT TYPE OVERRIDES INFERENCE
// ────────────────────────────────────────────────────────────────────

// Force a node to be a state even though it has data-like name
state userData {
    // This is a control flow state, not a context
    // Explicit type overrides name-based inference
}

// ────────────────────────────────────────────────────────────────────
// KEY BENEFITS OF OPTIONAL TYPES
// ────────────────────────────────────────────────────────────────────

// 1. LESS CEREMONY: Don't need to specify type when it's obvious
// 2. CLEANER SYNTAX: Focus on attributes, not type declarations
// 3. BACKWARD COMPATIBLE: All explicit types still work
// 4. FLEXIBLE: Mix explicit and inferred types freely
// 5. CLEAR OVERRIDES: Explicit type always wins over inference

// ────────────────────────────────────────────────────────────────────
// INFERENCE PRIORITY (from highest to lowest)
// ────────────────────────────────────────────────────────────────────

// 1. Explicit type (always wins)
// 2. Has 'prompt' attribute → task
// 3. Has schema attributes (input/output/parameters/schema/returns) → tool
// 4. Name matches patterns (context/data/input/output/result/config) OR
//    has only data attributes → context
// 5. No incoming edges + has outgoing edges → init (requires edges)
// 6. Default → state

// ────────────────────────────────────────────────────────────────────
// MAIN WORKFLOW
// ────────────────────────────────────────────────────────────────────

start -> explicitTask -> inferredTask;
inferredTask -> Pipeline;
Pipeline -> waiting -> processing;

```

### `semantic-nesting-example.dygram`
Semantic Nesting Example

```dy examples/nesting/semantic-nesting-example.dygram
machine "Semantic Nesting Example"

// Context nodes at the top level
context globalConfig {
    apiEndpoint: "https://api.example.com";
    timeout: 5000;
    retryCount: 3;
}

// Data Pipeline with nested structure and context inheritance
task DataPipeline "Data Processing Pipeline" {

    // Context shared within the pipeline
    context pipelineState {
        recordsProcessed: 0;
        errors: 0;
        status: "initializing";
    }

    // Validation phase
    task ValidationPhase "Data Validation" {
        task fetchData {
            prompt: "Fetch data from the API endpoint specified in globalConfig";
        }

        task validateSchema {
            prompt: "Validate the data schema";
        }

        task checkQuality {
            prompt: "Check data quality metrics";
        }
    }

    // Processing phase
    task ProcessingPhase "Data Transformation" {
        task transform {
            prompt: "Transform the validated data";
        }

        task enrich {
            prompt: "Enrich data with additional information";
        }

        task aggregate {
            prompt: "Aggregate processed data";
        }
    }

    // Storage phase
    task StoragePhase "Data Storage" {
        context storageConfig {
            database: "primary";
            batchSize: 100;
        }

        task prepareData {
            prompt: "Prepare data for storage";
        }

        task writeData {
            prompt: "Write data to storage";
        }

        task verifyStorage {
            prompt: "Verify data was stored correctly";
        }
    }
}

// Simple workflow coordinator at top level
task start {
    prompt: "Initialize the data pipeline";
}

task end {
    prompt: "Finalize and report results";
}

// Workflow using qualified names to reference nested nodes
start -> DataPipeline.ValidationPhase.fetchData;

// Within ValidationPhase
DataPipeline.ValidationPhase.fetchData -> DataPipeline.ValidationPhase.validateSchema;
DataPipeline.ValidationPhase.validateSchema -> DataPipeline.ValidationPhase.checkQuality;

// Transition to ProcessingPhase
DataPipeline.ValidationPhase.checkQuality -> DataPipeline.ProcessingPhase.transform;

// Within ProcessingPhase
DataPipeline.ProcessingPhase.transform -> DataPipeline.ProcessingPhase.enrich;
DataPipeline.ProcessingPhase.enrich -> DataPipeline.ProcessingPhase.aggregate;

// Transition to StoragePhase
DataPipeline.ProcessingPhase.aggregate -> DataPipeline.StoragePhase.prepareData;

// Within StoragePhase
DataPipeline.StoragePhase.prepareData -> DataPipeline.StoragePhase.writeData;
DataPipeline.StoragePhase.writeData -> DataPipeline.StoragePhase.verifyStorage;

// Complete the pipeline
DataPipeline.StoragePhase.verifyStorage -> end;

// Context relationships
// DataPipeline reads global configuration
DataPipeline -reads-> globalConfig;

// DataPipeline writes to its own state
DataPipeline -writes-> DataPipeline.pipelineState;

// ValidationPhase tasks inherit read access to globalConfig and pipelineState
// No explicit edges needed - inheritance provides access

// ProcessingPhase tasks also inherit access
// ProcessingPhase.transform updates pipeline state
DataPipeline.ProcessingPhase.transform -writes-> DataPipeline.pipelineState;

// StoragePhase has its own config and inherits parent contexts
// StoragePhase nodes can read storageConfig, pipelineState, and globalConfig
DataPipeline.StoragePhase.writeData -writes-> DataPipeline.pipelineState;

// Error handling node at top level
task handleError {
    prompt: "Handle any errors that occurred during pipeline execution";
}

// Error transitions (can be triggered from any phase)
DataPipeline.ValidationPhase.validateSchema -error-> handleError;
DataPipeline.ProcessingPhase.transform -error-> handleError;
DataPipeline.StoragePhase.writeData -error-> handleError;

note DataPipeline "This pipeline demonstrates semantic nesting with qualified names and context inheritance. Child tasks automatically inherit read-only access to parent context nodes."

note DataPipeline.ValidationPhase.fetchData "This task inherits read access to globalConfig (from DataPipeline) and pipelineState (from DataPipeline) without explicit edges."

note DataPipeline.StoragePhase.prepareData "This task inherits access to globalConfig and pipelineState from ancestors, plus storageConfig from its direct parent."

```

### `state-modules-example.dygram`
State Modules Example - ETL Pipeline

```dy examples/nesting/state-modules-example.dygram
machine "State Modules Example - ETL Pipeline"

// Global configuration context
context globalConfig {
    apiUrl: "https://api.example.com";
    timeout: 5000;
    environment: "production";
}

// State module for data extraction
state Extract "Data Extraction Module" {
    state fetchData "Fetch from API" {
        prompt: "Fetch data from the API endpoint";
    }

    state validateSource "Validate Source Data" {
        prompt: "Validate that source data is complete and well-formed";
    }

    // Internal flow within Extract module
    fetchData -> validateSource;
}

// State module for data transformation
state Transform "Data Transformation Module" {
    context transformConfig {
        batchSize: 1000;
        parallelism: 4;
    }

    state cleanData "Clean Data" {
        prompt: "Remove invalid entries and normalize data";
    }

    state enrichData "Enrich Data" {
        prompt: "Add calculated fields and enrichments";
    }

    state aggregate "Aggregate Results" {
        prompt: "Aggregate data by specified dimensions";
    }

    // Internal flow within Transform module
    cleanData -> enrichData -> aggregate;
}

// State module for data loading
state Load "Data Loading Module" {
    context loadConfig {
        targetDatabase: "warehouse";
        writeMode: "append";
    }

    state prepareTarget "Prepare Target" {
        prompt: "Ensure target table exists and is ready";
    }

    state writeData "Write Data" {
        prompt: "Write processed data to target";
    }

    state verifyLoad "Verify Load" {
        prompt: "Verify all data was loaded correctly";
    }

    // Internal flow within Load module
    prepareTarget -> writeData -> verifyLoad;
}

// Entry and exit points for the pipeline
init start;
state complete;
state failed;

// Module composition - entry points are automatically determined
// Entering Extract module goes to Extract.fetchData (first task)
start -> Extract;

// Module exits - when validateSource completes, transition to Transform
// Transform module entry goes to Transform.cleanData (first task)
Extract -> Transform;

// When aggregate completes, transition to Load
// Load module entry goes to Load.prepareTarget (first task)
Transform -> Load;

// When verifyLoad completes, transition to complete
// This demonstrates module-level exit routing
Load -> complete;

// Error handling - specific nodes can have explicit error paths
Extract.fetchData -error-> failed;
Transform.cleanData -error-> failed;
Load.writeData -error-> failed;

// Context relationships
// Extract module reads global config
Extract -reads-> globalConfig;

// Transform reads config and has its own context
Transform -reads-> globalConfig;

// Load reads config and has its own context
Load -reads-> globalConfig;

// Child nodes within each module inherit parent context access automatically
// For example, Extract.fetchData can read globalConfig without explicit edge
// Transform.cleanData can read both globalConfig and Transform.transformConfig

note Extract "State module with automatic entry at fetchData. Terminal node validateSource inherits parent's exit edge to Transform."

note Transform "Nested state module with internal context. Entry at cleanData, exit from aggregate to Load module."

note Load "State module demonstrating context inheritance. Child nodes inherit access to both globalConfig and loadConfig."

note start "Pipeline starts here and enters the Extract module at its first child (fetchData)."

note Extract.validateSource "Terminal node within Extract module. No explicit outbound edge, so it inherits the module-level exit to Transform."

```

### `deep-nested-5-levels.dygram`

Deep Nested Machine

```dy examples/nesting/deep-nested-5-levels.dygram
machine "Deep Nested Machine"
level1 {
    level2 {
        level3 {
            level4 {
                level5a;
                level5b;
            }
        }
    }
}
```
