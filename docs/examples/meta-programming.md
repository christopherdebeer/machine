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
```dygram examples/meta/attribute.dygram
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
```dygram examples/meta/monitor.dygram
Task monitor {
    meta: true;
    prompt: "If metrics exceed threshold, add error handling";
}

monitor -reads-> metrics;
```

### Pattern 2: Configuration-Driven Modification
```dygram examplse/meta/config.dygram
Task adapter {
    meta: true;
    prompt: "Based on config.mode, add appropriate nodes";
}

adapter -reads-> config;
```

### Pattern 3: Multi-Stage Evolution
```dygram examples/meta/multi-stage-evolution.dygram
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

```dygram examples/tools/basic.dygram
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

```dygram examples/tools/build.dygram
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

### `tool-creation.dygram`

Tool Creation Example

```dygram examples/meta-programming/tool-creation.dygram
machine "Tool Creation Example"

// Demonstrates dynamic tool construction with loosely defined Tool nodes
// When meta: true is enabled, the agent can build out tool definitions

// A loosely defined tool - just has a name and basic description
Tool sentiment_analyzer {
    description: "Analyze sentiment of text and return score";
}

// A more complete tool with input schema but no implementation
Tool data_transformer {
    description: "Transform data from one format to another";
    input_schema: '{"type": "object", "properties": {"data": {"type": "string"}, "target_format": {"type": "string"}}}';
}

// Task with meta capability to build out tools
Task builder {
    meta: true;
    prompt: "Inspect the tool nodes (sentiment_analyzer and data_transformer). For each tool, use construct_tool to register them with complete input_schema, output_schema, and an implementation strategy. For sentiment_analyzer, use 'agent_backed' strategy. For data_transformer, use 'code_generation' strategy with sample JavaScript code.";
}

// Task that will use the tools after they are built
Task processor {
    prompt: "Use the sentiment_analyzer tool to analyze: 'This is a great product!'. Then use data_transformer to convert some sample JSON to YAML format.";
}

State complete {
    desc: "Processing complete";
}

// Workflow
builder -uses-> sentiment_analyzer, data_transformer;
builder -> processor;
processor -> complete;

```

### `self-healing.dygram`

Self-Healing Pipeline

```dygram examples/meta-programming/self-healing.dygram
machine "Self-Healing Pipeline"

// Demonstrates meta-programming capabilities for self-healing systems
// The monitor task can add error handling nodes if error rate is too high

context metrics {
    errorCount<number>: 0;
    successRate<number>: 1.0;
    totalRequests<number>: 0;
}

Task monitor {
    meta: true;
    prompt: "Monitor the metrics context. If errorCount > 3 or successRate < 0.7, use get_machine_definition to inspect the current structure, then use update_definition to add retry logic and error handler nodes. Add a 'retryHandler' Task node and 'errorRecovery' State node with edges: processing -> retryHandler -> errorRecovery -> processing.";
}

State processing {
    desc: "Main processing state";
}

State complete {
    desc: "Pipeline completed successfully";
}

// Workflow
monitor -reads-> metrics;
monitor -> processing;
processing -> complete;

```

### `self-modifying-pipeline.dygram`

Self-Modifying Pipeline

```dygram examples/meta-programming/self-modifying-pipeline.dygram
machine "Self-Modifying Pipeline"

// Demonstrates basic meta-programming where an agent modifies the machine structure

State start;

Task optimizer {
    meta: true;
    prompt: "Analyze the current pipeline using get_machine_definition. If the pipeline is simple (fewer than 5 nodes), add a validation step before processing and an audit step after processing. Use update_definition to add these nodes.";
}

State processing {
    desc: "Main data processing";
}

State complete {
    desc: "Processing complete";
}

// Initial workflow
start -> optimizer;
optimizer -> processing;
processing -> complete;

```

### `conditional-evolution.dygram`

Conditional Evolution System

```dygram examples/meta-programming/conditional-evolution.dygram
machine "Conditional Evolution System"

// Demonstrates context-driven meta-programming evolution

context config {
    mode<string>: "production";
    maxRetries<number>: 3;
    enableLogging<boolean>: true;
}

context performance {
    avgResponseTime<number>: 0;
    peakMemory<number>: 0;
}

State start;

Task adapter {
    meta: true;
    prompt: "Read the config and performance contexts. Use get_machine_definition to see the current structure. Based on conditions, modify the machine:
    - If mode='production' and maxRetries > 1: add retry logic with exponential backoff
    - If avgResponseTime > 1000ms: add caching layer
    - If enableLogging=true: add logging nodes at key points
    Use update_definition to apply changes.";
}

State processing {
    desc: "Main processing logic";
}

State complete {
    desc: "System operation complete";
}

// Edges
start -> adapter;
adapter -reads-> config;
adapter -reads-> performance;
adapter -> processing;
processing -> complete;

```

### `rails-meta-example.dygram`

Rails-Based Meta-Programming

```dygram examples/meta-programming/rails-meta-example.dygram
machine "Rails-Based Meta-Programming"

// Demonstrates meta-programming with rails-based execution model
// Rails allow agents to modify the machine while tracking mutations

context system {
    version<string>: "1.0.0";
    features<string>: "basic";
}

Task analyzer {
    meta: true;
    prompt: "Analyze the system context using get_context_value. Get the current machine definition with get_machine_definition. If features='basic', evolve the machine to add advanced features: add 'authentication' Task, 'authorization' Task, and 'audit' State nodes. Use update_definition with a clear reason for the modification.";
}

State init {
    desc: "System initialization";
}

Task process {
    prompt: "Execute main processing logic";
}

State complete {
    desc: "Execution complete";
}

// Workflow with rails
init -> analyzer;
analyzer -reads-> system;
analyzer -> process;
process -> complete;

```
