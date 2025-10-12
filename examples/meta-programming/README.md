# Meta-Programming Examples

Examples demonstrating DyGram's meta-programming capabilities that allow agents to inspect and modify machine definitions at runtime.

## Overview

When a Task node has `meta: true`, the agent executing that task gains access to special meta-tools:
- `get_machine_definition` - Inspect current machine structure
- `update_definition` - Modify the machine dynamically

## Examples

### `self-healing.dygram`
Self-healing pipeline that monitors error metrics and adds error handling nodes when needed.

**Features:**
- Context-based monitoring (errorCount, successRate)
- Dynamic addition of retry logic
- Error recovery nodes added at runtime
- Demonstrates defensive programming patterns

**Test it:**
```bash
# Requires ANTHROPIC_API_KEY environment variable
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram exec examples/meta-programming/self-healing.dygram

# View the updated machine (saved as self-healing-updated.machine)
cat self-healing-updated.machine
```

### `self-modifying-pipeline.dygram`
Basic meta-programming example where an agent optimizes a simple pipeline.

**Features:**
- Machine structure inspection
- Conditional node addition (validation, audit)
- Simple evolution pattern
- Good starting point for learning meta-programming

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram exec examples/meta-programming/self-modifying-pipeline.dygram
```

### `conditional-evolution.dygram`
Context-driven machine evolution based on configuration and performance metrics.

**Features:**
- Multiple context nodes (config, performance)
- Conditional modifications based on runtime data
- Production-ready patterns (retry logic, caching, logging)
- Demonstrates multi-factor decision making

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram exec examples/meta-programming/conditional-evolution.dygram
```

### `rails-meta-example.dygram`
Meta-programming with rails-based execution model showing mutation tracking.

**Features:**
- Rails-based execution architecture
- System feature evolution
- Clear mutation tracking with reasons
- Demonstrates version progression (basic → advanced)

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram exec examples/meta-programming/rails-meta-example.dygram

# Check mutations log in output
cat rails-meta-example-result.json
```

### `global-meta-example.dygram`
Machine-level `@meta` annotation with node-level override capabilities.

**Features:**
- Global `@meta` annotation enables meta-programming for all Task nodes
- Individual nodes can opt-out with `meta: false`
- Demonstrates security patterns (limiting meta access)
- Shows annotation inheritance and override behavior

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram exec examples/meta-programming/global-meta-example.dygram
```

## Key Concepts

### Enabling Meta-Programming

**Option 1: Node-Level (Traditional)**
Add `meta: true` to individual Task nodes:
```machine
Task analyzer {
    meta: true;
    prompt: "Analyze and modify the machine...";
}
```

**Option 2: Machine-Level (New)**
Use `@meta` annotation to enable meta-programming for all Task nodes:
```machine
machine "My Machine"
@meta

Task analyzer {
    // Automatically has meta capabilities
    prompt: "Analyze and modify the machine...";
}

Task executor {
    // Opt-out for security
    meta: false;
    prompt: "Execute without meta access";
}
```

The machine-level `@meta` annotation enables meta-programming by default for all Task nodes, while individual nodes can override with `meta: false` to opt-out.

### Meta-Tools Available

**get_machine_definition:**
```json
{
    "format": "both"  // Options: "json", "dsl", "both"
}
```

**update_definition:**
```json
{
    "machine": {
        "title": "Updated Machine",
        "nodes": [...],
        "edges": [...]
    },
    "reason": "Clear explanation of changes"
}
```

### CLI Integration

When an agent modifies the machine:
- Updated DSL is saved to `{filename}-updated.machine`
- Mutations are logged in the result JSON
- Original machine file is never modified

### Playground Integration

In the playground:
- Monaco editor automatically updates with new DSL
- Diagram regenerates to show new structure
- Execution log shows "Machine definition updated by agent"

## Usage Patterns

### Pattern 1: Monitoring-Based Evolution
```machine
Task monitor {
    meta: true;
    prompt: "If metrics exceed threshold, add error handling";
}

monitor -reads-> metrics;
```

### Pattern 2: Configuration-Driven Modification
```machine
Task adapter {
    meta: true;
    prompt: "Based on config.mode, add appropriate nodes";
}

adapter -reads-> config;
```

### Pattern 3: Multi-Stage Evolution
```machine
Task stage1 {
    meta: true;
    prompt: "Add validation nodes";
}

Task stage2 {
    meta: true;
    prompt: "Optimize by removing redundant nodes";
}

stage1 -> stage2;
```

## Best Practices

1. **Always inspect first**: Call `get_machine_definition` before modifying
2. **Provide clear reasons**: Include descriptive reasons in `update_definition`
3. **Test incrementally**: Make small changes, test, then iterate
4. **Use context**: Read context values to make informed decisions
5. **Track mutations**: Review mutation logs to understand evolution

## Safety & Validation

All machine updates are validated:
- Must have `title` (string)
- Must have `nodes` (array)
- Must have `edges` (array)
- Invalid updates are rejected with error messages

Annotations on nodes and edges are preserved during updates.

## See Also

- [Meta-Programming Documentation](../../docs/MetaProgramming.mdx)
- [Rails-Based Architecture](../../docs/RailsBasedArchitecture.md)
- [Context & Schema Guide](../../docs/ContextAndSchemaGuide.mdx)
