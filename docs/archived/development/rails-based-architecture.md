# Rails-Based Architecture

**Execution engine that combines automated transitions with intelligent agent decisions**

## Overview

The Rails-Based Architecture is DyGram's execution model that treats your state machine definition as "rails" that guide a single Claude agent through a workflow. The agent makes complex decisions while the system automatically handles deterministic transitions.

### Key Concepts

```
Machine Definition (Rails)
        ↓
   Automated Transitions (deterministic paths)
        ↓
   Agent-Controlled Transitions (complex decisions)
        ↓
   Phase-Specific Context (only relevant data)
        ↓
   Dynamic Tools (constructed as needed)
```

## Architecture Philosophy

**"Rails"** = Your machine structure defines the tracks
**"Agent"** = A single Claude agent rides those tracks
**"Phase-Specific"** = Agent receives only relevant context at each node
**"Meta-Programming"** = Agent can modify the machine and construct tools dynamically

## Execution Flow

### 1. Automated Transitions

Some transitions happen automatically without invoking the agent:

- **State nodes**: Pure state with no computation
- **@auto edges**: Explicitly marked for automation
- **Simple conditions**: Deterministic predicates that can be evaluated locally
- **Single-path**: Only one valid outbound edge

**Example:**
```dy examples/workflows/auto-transition.dygram
machine "Auto Transitions Demo"

State idle;
State processing;

// Automatic transition - no agent needed
idle -@auto-> processing;

// Conditional automatic transition
processing -when: "errorCount > 3"-> error;
```

### 2. Agent-Controlled Transitions

Complex decisions require the agent:

- **Multiple outbound edges**: Branching decisions
- **Task nodes with prompts**: Requires reasoning
- **Complex conditions**: Need external data or analysis
- **Meta-programming**: Machine modification decisions

**Example:**
```examples/workflows/agent-controlled.dygram
Task analyze {
    prompt: "Analyze the data and decide next step";
};

// Agent decides which path via transition tool
analyze -> summarize, retry, abort;
```

## Phase-Specific Context

At each node, the agent receives:

1. **System Prompt** - Tailored to current node
2. **Available Context** - Only accessible context nodes (via edges)
3. **Available Tools** - Transition, context, and meta tools
4. **Execution State** - Current position, history, metrics

### Example System Prompt

When agent is at node `analyze`:

```markdown
You are executing a state machine workflow.

- Node: **analyze** (Task)
- Objective: Analyze the data and decide next step

- **input**: read
  - Fields: data, format
- **metrics**: read, write
  - Fields: errorCount, quality

- **summarize**: Process successful, summarize results
- **retry**: Analysis failed, retry with different approach
- **abort**: Fatal error, terminate workflow

Use the provided tools to accomplish your objective and choose the appropriate transition.
```

## Tools Available to Agent

### 1. Transition Tools

Generated for each valid outbound edge:

```typescript
{
  name: 'transition_to_summarize',
  description: 'Transition to summarize node',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Why this transition?' }
    }
  }
}
```

### 2. Context Tools

Based on edge permissions:

```dy examples/context/permissions.dygram
analyze -reads-> input;
analyze -writes-> metrics;
```

Generates tools:
- `read_input(field?)` - Read input context
- `write_metrics(field, value)` - Update metrics context

### 3. Meta Tools (when `meta: true`)

**construct_tool**: Create new tools dynamically
```typescript
{
  name: 'construct_tool',
  input_schema: {
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      input_schema: { type: 'object' },
      implementation_strategy: {
        enum: ['agent_backed', 'code_generation', 'composition']
      }
    }
  }
}
```

**list_available_tools**: Inspect tool registry

**propose_tool_improvement**: Suggest enhancements to existing tools

## Meta-Programming Capabilities

When a task node has `meta: true`, the agent can modify the machine:

```dy examples/meta/basic.dygram
Task optimizer {
    meta: true;
    prompt: "Monitor metrics and add error handling if needed";
};
```

The agent can:
1. **Construct tools** - Create new capabilities when none exist
2. **Review tools** - Inspect existing tool implementations
3. **Propose improvements** - Suggest enhancements to tools
4. **Modify machine** - Add nodes, edges, or attributes (future)

### Dynamic Tool Construction

**Three implementation strategies:**

1. **Agent-Backed**: Tool execution delegated to agent
```typescript
// Agent creates a tool that it will execute
{
  name: 'analyze_sentiment',
  implementation_strategy: 'agent_backed',
  implementation_details: 'Analyze text sentiment using...'
}
```

2. **Code Generation**: Agent provides executable code
```typescript
{
  name: 'calculate_score',
  implementation_strategy: 'code_generation',
  implementation_details: 'async (input) => { return input.x * 0.8 + input.y * 0.2; }'
}
```

3. **Composition**: Combine existing tools
```typescript
{
  name: 'validate_and_store',
  implementation_strategy: 'composition',
  implementation_details: 'validate_input -> transform_data -> write_output'
}
```

## Agent SDK Integration

The Rails-Based Architecture leverages Claude Agent SDK for:

### Conversation History
- Multi-turn conversation loop at each node
- Automatic context compaction (50 message threshold)
- Full history retained for batch evaluation

### Tool Execution
- Structured tool use with input/output schemas
- Error reporting back to agent
- Result blocks with success/failure status

### Execution Persistence
- Full execution history saved to `execution-history.json`
- Conversation log with all agent interactions
- Token usage estimation
- Mutation tracking

## ToolRegistry Architecture

The **ToolRegistry** provides centralized tool management and execution across the system, replacing scattered dispatch logic with a unified interface.

### Core Responsibilities

1. **Static Tool Registration** - Register tools with fixed definitions
2. **Dynamic Pattern Matching** - Handle pattern-based tools (e.g., `transition_to_*`, `read_*`, `write_*`)
3. **Unified Execution** - Single entry point for all tool execution
4. **Tool Querying** - Check tool availability and filter tool lists

### Integration Points

The ToolRegistry is integrated with three key components:

#### 1. RailsExecutor
Registers dynamic tool patterns during initialization:
```typescript
// Transition tools
toolRegistry.registerDynamic('transition_to_',
  (name, input) => handleTransitionTool(name, input)
);

// Context read tools
toolRegistry.registerDynamic('read_',
  (name, input) => handleReadTool(name, input)
);

// Context write tools
toolRegistry.registerDynamic('write_',
  (name, input) => handleWriteTool(name, input)
);
```

#### 2. AgentSDKBridge
Registers meta-tools and delegates all tool execution to the registry:
```typescript
// Meta-tools are registered during initialization
registerMetaTools() {
  metaTools.forEach(tool => {
    toolRegistry.registerStatic(tool, handler);
  });
}

// Simplified execution - only 2 fallback layers
async executeTool(name, input) {
  if (toolExecutor) return toolExecutor(name, input);
  if (toolRegistry.hasTool(name)) {
    return toolRegistry.executeTool(name, input);
  }
  throw new Error(`Tool ${name} not found`);
}
```

#### 3. MetaToolManager
Automatically registers dynamically constructed tools:
```typescript
// When a tool is constructed, register it with ToolRegistry
const dynamicTool = { definition, handler, ... };
dynamicTools.set(name, dynamicTool);

if (toolRegistry) {
  toolRegistry.registerStatic(definition, handler);
}
```

### Pattern Matching

The registry supports two pattern types:

**String Prefixes:**
```typescript
toolRegistry.registerDynamic('transition_to_', handler);
// Matches: transition_to_ready, transition_to_processing, etc.
```

**Regular Expressions:**
```typescript
toolRegistry.registerDynamic(/^read_[a-z]+$/, handler);
// Matches: read_data, read_config, but not read_Data (case-sensitive)
```

### Diagnostic Tools

For debugging and monitoring:
```typescript
const diagnostics = toolRegistry.getDiagnostics();
// Returns: {
//   staticToolCount: 7,
//   dynamicHandlerCount: 10,
//   patterns: ['transition_to_', 'read_', /^write_/, ...],
//   staticTools: ['get_machine_definition', 'construct_tool', ...]
// }
```

### Benefits

- **Centralized Dispatch** - Single location for all tool routing logic
- **Type Safety** - Proper TypeScript types instead of `any`
- **Simplified Code** - ~100 lines of duplicate dispatch logic eliminated
- **Better Debugging** - Diagnostic methods for troubleshooting tool resolution
- **Flexible Patterns** - Support for both string prefixes and complex RegExp patterns

## Permission Model

Edge labels define context access:

```dy examples/edges/permissions-model.dygram
context database {
    connection<string>: "postgres://localhost/db";
    schema<object>: "{}";
};

// Read-only access
query -reads-> database;

// Read-write access
update -writes-> database;

// Store data (write without read)
store -stores-> database;

// Field-level permissions
task -write: field1,field2-> context;
task -read: field3-> context;
```

## Complete Example

```dy examples/meta/self-improving-pipeline.dygram
machine "Self-Improving Data Pipeline"

// Context nodes
context input {
    data<array>: "[]";
    format<string>: "json";
};

context output {
    processed<array>: "[]";
    metrics<object>: "{}";
};

context toolRegistry {
    customTools<array>: "[]";
};

// State machine
State idle;
State processing;
State optimizing;
State complete;

// Tasks
Task ingest {
    prompt: "Load data from input context";
};

Task process {
    meta: true;
    prompt: "Process the data. If no suitable tool exists, construct one.";
};

Task optimize {
    meta: true;
    prompt: "Review the tools used. Can they be improved?";
};

// Flow with mixed automatic and agent-controlled transitions
idle -@auto-> ingest;                    // Automatic: always start

ingest -reads-> input;
ingest -> process;                        // Agent decides when ready

process -reads-> input;
process -writes-> output;
process -writes-> toolRegistry;           // Can construct tools
process -> optimizing, complete;          // Agent decides: optimize or finish?

optimizing -reads-> toolRegistry;         // Can review tools
optimizing -reads-> output;
optimizing -writes-> toolRegistry;        // Can improve tools
optimizing -when: "metrics.quality > 0.9"-> complete;  // Auto if quality good
optimizing -> process;                    // Agent: try again with improved tools

complete -@auto-> idle;                   // Loop back
```

### Execution Flow

1. **idle → ingest**: Automatic (state node + @auto)
2. **ingest**: Agent loads data, chooses transition
3. **ingest → process**: Agent-controlled
4. **process**: Agent realizes no processing tool exists
   - Uses `construct_tool` to create `analyze_sentiment`
   - Uses new tool to process data
   - Writes results to `output`
   - Chooses transition to `optimizing`
5. **optimizing**: Agent reviews `analyze_sentiment`
   - Quality = 0.85 (< 0.9, so no auto-transition)
   - Uses `propose_tool_improvement`
   - Chooses transition back to `process`
6. **process** (second time): Uses improved tool
   - Quality = 0.92 (> 0.9)
7. **optimizing → complete**: Automatic (condition met)
8. **complete → idle**: Automatic (state node + @auto)

## CLI Usage

```bash
dygram exec file.mach

cat execution-history.json
```

### Configuration

Set API key via environment variable:
```bash
export ANTHROPIC_API_KEY=your_key_here
dygram exec file.mach
```

Or via configuration:
```typescript
const executor = new RailsExecutor(machineData, {
  llm: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  },
  agentSDK: {
    persistExecutionHistory: true,
    historyFile: 'execution-history.json'
  }
});
```

## Playground Integration

The interactive playground supports:

- **▶️ Execute**: Run from start to finish
- **⏭️ Step**: Step-by-step debugging mode
- **⏹️ Stop**: Halt execution
- **🔄 Reset**: Clear state and logs
- **Real-time visualization**: Diagram updates during execution
- **Execution log**: Color-coded messages with timestamps

### Settings

Configure in playground settings panel:
- **API Key**: Your Anthropic API key
- **Model**: Claude model to use (default: claude-sonnet-4-5)
- **Auto-scroll**: Keep log scrolled to latest message

## Execution History

Full audit trail saved for batch evaluation:

```typescript
interface ExecutionHistory {
  machineTitle: string;
  startTime: string;
  endTime: string;
  status: 'completed' | 'error' | 'stopped';

  steps: Array<{
    stepNumber: number;
    currentNode: string;
    transitionType: 'automated' | 'agent-controlled';

    // Agent interaction (if agent-controlled)
    agentInvocation?: {
      systemPrompt: string;
      userPrompt: string;
      conversationHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
      }>;
      toolsUsed: string[];
      transitionChosen: string;
      tokenUsage: {
        input: number;
        output: number;
      };
    };

    // Mutations (if any)
    mutations: MachineMutation[];
  }>;

  summary: {
    totalSteps: number;
    automatedTransitions: number;
    agentDecisions: number;
    toolsConstructed: number;
    toolImprovementsProposed: number;
    totalTokens: number;
  };
}
```

## Benefits

### Efficiency
- Automated transitions reduce LLM calls
- Only invoke agent for complex decisions
- Smart context provisioning reduces token usage

### Clarity
- Phase-specific context prevents overwhelm
- Clear separation of automated vs agent-controlled
- Explicit permission model

### Extensibility
- Dynamic tool construction
- Tool review and improvement
- Meta-programming capabilities

### Production Ready
- Built on Claude Agent SDK
- Automatic context compaction
- Full execution history
- Error handling and recovery

## Advanced Topics

### Parallel Execution (Future)

Support for parallel task execution:

```dy examples/speculative/parallel-execution.dygram
Task analyze {
    prompt: "Analyze data";
};

Task validate {
    prompt: "Validate results";
};

// Parallel execution annotation (future)
start -@parallel-> analyze, validate;

// Join node to merge results
join mergeResults;
analyze -> mergeResults;
validate -> mergeResults;
```

### Distributed Execution (Future)

Cross-machine agent sharing:

```dy examples/speculative/distributed-execution.dygram
// Import agent from another machine

Task process {
    agent: analyzer;  // Use shared agent
    prompt: "Process with analyzer agent";
};
```

### Native Context Compaction (Future)

Integration with Claude's native compaction API:

```typescript
const executor = new RailsExecutor(machineData, {
  agentSDK: {
    compactionStrategy: 'native',  // Use Claude's compaction
    compactionThreshold: 100       // Compact after 100 messages
  }
});
```

## See Also

- [Agent SDK Bridge](agent-sdk-bridge.md) - SDK integration details
- [Meta-Programming](meta-programming.md) - Self-modifying machines
- [LLM Client Usage](LlmClientUsage.mdx) - LLM configuration
- [Examples](../examples/rails/) - Rails pattern examples
