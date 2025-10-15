# Meta-Programming Examples

Examples demonstrating DyGram's meta-programming capabilities that allow agents to inspect and modify machine definitions at runtime.

## Overview

When a Task node has `meta: true`, the agent executing that task gains access to special meta-tools:
- `get_machine_definition` - Inspect current machine structure
- `update_definition` - Modify the machine dynamically
- `get_tool_nodes` - Discover Tool nodes in the machine
- `build_tool_from_node` - Build and register tools from Tool nodes
- `construct_tool` - Create tools dynamically from scratch
- `list_available_tools` - List all available tools
- `propose_tool_improvement` - Suggest improvements to existing tools

## Examples

### `tool-creation.dygram`
Demonstrates dynamic tool construction using Tool nodes.

**Features:**
- Loosely defined Tool nodes (minimal attributes)
- Agent discovers Tool nodes using `get_tool_nodes`
- Agent builds out tools using `build_tool_from_node`
- Multiple implementation strategies (agent_backed, code_generation)
- Tools become available for use after construction

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram exec examples/meta-programming/tool-creation.dygram
```

### `self-healing.dygram`
Self-healing pipeline that monitors error metrics and adds error handling nodes when needed.

**Features:**
- Context-based monitoring (errorCount, successRate)
- Dynamic addition of retry logic
- Error recovery nodes added at runtime
- Demonstrates defensive programming patterns

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram exec examples/meta-programming/self-healing.dygram

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

cat rails-meta-example-result.json
```

## Key Concepts

### Enabling Meta-Programming
Add `meta: true` to Task nodes:
```machine
Task analyzer {
    meta: true;
    prompt: "Analyze and modify the machine...";
}
```

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

## Tool Nodes

Tool nodes are a special node type that represent callable tools with input/output schemas. They can be loosely defined and then built out by agents with `meta: true`.

### Defining Tool Nodes

```machine
// Loosely defined - just name and description
Tool my_tool {
    description: "Does something useful";
}

// More complete - with schemas
Tool calculator {
    description: "Performs calculations";
    input_schema: '{"type": "object", "properties": {"expression": {"type": "string"}}}';
    output_schema: '{"type": "object", "properties": {"result": {"type": "number"}}}';
}

// Fully defined - with implementation
Tool formatter {
    description: "Format text";
    input_schema: '{"type": "object", "properties": {"text": {"type": "string"}}}';
    code: 'return { formatted: input.text.toUpperCase() };';
}
```

### Building Tools from Nodes

When a task has `meta: true`, it can discover and build Tool nodes:

```machine
Task builder {
    meta: true;
    prompt: "Find Tool nodes using get_tool_nodes, then build them using build_tool_from_node";
}

builder -uses-> my_tool;
```

The agent can:
1. Use `get_tool_nodes` to find all Tool nodes
2. Check which are loosely defined (`isLooselyDefined: true`)
3. Use `build_tool_from_node` to complete and register them
4. Choose implementation strategy:
   - `agent_backed`: Agent executes the tool
   - `code_generation`: JavaScript code execution
   - `composition`: Combine existing tools

### Tool Linking

Connect tasks to tools using edges:
- `-uses->`: Task uses the tool
- `-builds->`: Task builds/constructs the tool
- `-improves->`: Task improves the tool

## See Also

- [Meta-Programming Documentation](../../docs/MetaProgramming.mdx)
- [Rails-Based Architecture](../../docs/RailsBasedArchitecture.md)
- [Context & Schema Guide](../../docs/ContextAndSchemaGuide.mdx)
