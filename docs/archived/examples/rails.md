# Rails-Based Architecture Examples

This directory contains examples demonstrating DyGram's Rails-Based Architecture execution model.

## What is Rails-Based Architecture?

The Rails-Based Architecture treats your machine definition as "rails" that guide a single Claude agent through a workflow. Some transitions happen automatically (deterministic paths), while others require the agent to make complex decisions.

**Key Concepts:**
- 🛤️ **Rails** = Your machine structure defines the tracks
- 🤖 **Single Agent** = One agent rides those tracks with phase-specific context
- ⚡ **Automated Transitions** = Deterministic paths execute without LLM calls
- 🧠 **Agent Decisions** = Complex branching requires agent reasoning
- 🔧 **Meta-Programming** = Agent can construct tools and modify the machine

## Examples

### 1. `auto-transitions.dy`
**Demonstrates:** Automated vs agent-controlled transitions

Shows how state nodes, `@auto` edges, and simple conditions automatically transition without invoking the agent, improving efficiency.

**Key Features:**
- State nodes with automatic transitions
- `@auto` annotation for forced automation
- Conditional automatic transitions (`when:`, `unless:`)
- Agent-controlled branching decisions

**Run:**
```bash
dygram exec examples/rails/auto-transitions.mach
```

---

### 2. `dynamic-tool-construction.dy`
**Demonstrates:** Dynamic tool creation by the agent

Shows how an agent with `meta: true` can construct new tools when they don't exist in the codebase.

**Key Features:**
- `meta: true` enables meta-programming
- `construct_tool` creates tools dynamically
- Three implementation strategies: agent-backed, code-generation, composition
- Tool registry tracking

**Run:**
```bash
dygram exec examples/rails/dynamic-tool-construction.mach
```

---

### 3. `self-improving-pipeline.dy`
**Demonstrates:** Complete meta-programming workflow

The canonical Rails-Based Architecture example showing a pipeline that constructs tools, uses them, reviews them, improves them, and runs again with better tools.

**Key Features:**
- Tool construction when capabilities missing
- Tool review and improvement proposals
- Iterative refinement loop
- Quality-based automatic transitions
- Full meta-programming lifecycle

**Run:**
```bash
dygram exec examples/rails/self-improving-pipeline.mach
```

---

### 4. `phase-specific-context.dy`
**Demonstrates:** Permission-based context access

Shows how agents receive only relevant context at each node, based on edge permissions. Demonstrates security through least-privilege access.

**Key Features:**
- Edge-based permissions (`-reads->`, `-writes->`, `-stores->`)
- Field-level access control (`-read: field1,field2->`)
- Context isolation for security
- Phase-specific tool availability

**Run:**
```bash
dygram exec examples/rails/phase-specific-context.mach
```

---

### 5. `tool-review-improvement.dy`
**Demonstrates:** Tool review and improvement workflow

Shows how an agent can inspect existing tool implementations, identify deficiencies, propose improvements, and apply them.

**Key Features:**
- `list_available_tools` with source code inspection
- `propose_tool_improvement` for enhancement suggestions
- Iterative improvement loop
- Tool evolution over execution

**Run:**
```bash
dygram exec examples/rails/tool-review-improvement.mach
```

---

## Learning Path

**Beginner:**
1. Start with `auto-transitions.dy` to understand the rails pattern
2. Move to `phase-specific-context.dy` to see permission model

**Intermediate:**
3. Study `dynamic-tool-construction.dy` for meta-programming basics
4. Explore `tool-review-improvement.dy` for tool evolution

**Advanced:**
5. Master `self-improving-pipeline.dy` for complete meta-programming

## Execution Requirements

All examples require:
- **API Key**: Set `ANTHROPIC_API_KEY` environment variable
- **Model**: Uses `claude-sonnet-4-5` by default

```bash
export ANTHROPIC_API_KEY=your_key_here
dygram exec examples/rails/self-improving-pipeline.mach
```

## Execution History

After running any example, check `execution-history.json` for:
- Complete execution trace
- Agent conversation history
- Tools used at each step
- Mutations and tool constructions
- Token usage statistics

```bash
cat execution-history.json | jq
```

## Interactive Playground

Try these examples in the interactive playground:
1. Open http://localhost:5173/playground.html (or your deployed URL)
2. Paste an example machine
3. Configure API key in settings
4. Use execution controls:
   - ▶️ **Execute**: Run to completion
   - ⏭️ **Step**: Debug step-by-step
   - ⏹️ **Stop**: Halt execution
   - 🔄 **Reset**: Clear state

## Key Patterns

### Automated Transition Pattern
```dyine
State idle;
State ready;

// Automatic - no agent invocation
idle -@auto-> ready;
```

### Agent Decision Pattern
```dyine
Task analyze {
    prompt: "Analyze and decide next step";
};

// Agent chooses via transition tool
analyze -> success, retry, abort;
```

### Context Permission Pattern
```dyine
context secrets {
    apiKey<string>: "secret";
};

// Only process can access secrets
process -reads-> secrets;
```

### Tool Construction Pattern
```dyine
Task process {
    meta: true;
    prompt: "Process data. Construct tools if needed.";
};

process -writes-> toolRegistry;
```

### Tool Improvement Pattern
```dyine
Task review {
    meta: true;
    prompt: "Review tools and propose improvements";
};

review -reads-> toolRegistry;
review -writes-> toolRegistry;
```

## See Also

- [Rails-Based Architecture Documentation](../../docs/RailsBasedArchitecture.mdx)
- [Meta-Programming Guide](../../docs/meta-programming.md) (future)
- [LLM Client Usage](../../docs/LlmClientUsage.mdx)
- [Runtime & Evolution](../../docs/RuntimeAndEvolution.mdx)

## Contributing

Have a Rails-Based Architecture pattern to share? Submit a PR with:
1. A new `.dy` file demonstrating the pattern
2. Comprehensive inline comments explaining behavior
3. Update this README with the example description
4. Add test coverage if applicable

### `auto-transitions.dy`

Automated Transitions Demo

```dy examples/rails/auto-transitions.mach
machine "Automated Transitions Demo"

// This example demonstrates automatic transitions that execute
// without invoking the agent, improving efficiency.

// Context for metrics
context metrics {
    errorCount<number>: 0;
    processingTime<number>: 0;
    quality<number>: 0.0;
};

// State nodes (automatically transition)
State idle;
State initializing;
State ready;
State error;
State complete;

// Task nodes (require agent decisions)
Task process {
    prompt: "Process the data and update metrics";
};

Task handleError {
    prompt: "Diagnose and handle the error";
};

// Automatic transitions
// 1. State nodes always auto-transition if they have single outbound edge
idle -> initializing;
initializing -> ready;

// 2. Simple conditions auto-evaluate without agent
ready -> process;  // Agent decides when to start processing

process -reads-> metrics;
process -writes-> metrics;

// 3. Agent decides what to do based on metrics
// The agent can transition to handleError, complete, or retry (back to process)
process -> handleError, complete;

handleError -reads-> metrics;
handleError -writes-> metrics;

// Agent decides: retry or give up
handleError -> process, error;

// Terminal states
error -> idle;      // Restart after error
complete -> idle;   // Restart after completion

// Execution flow:
// 1. idle → initializing → ready: Automatic (state nodes)
// 2. ready → process: Agent-controlled (decides when ready)
// 3. process: Agent processes data, updates metrics
// 4. process → handleError|complete|process: Automatic (conditions)
// 5. handleError: Agent decides retry or give up
// 6. error|complete → idle: Automatic (restart)

```

### `dynamic-tool-construction.dy`

Dynamic Tool Construction Demo

```dy examples/rails/dynamic-tool-construction.mach
machine "Dynamic Tool Construction Demo"

// This example demonstrates how an agent can construct tools
// dynamically when they don't exist in the codebase.

// Context nodes
context input {
    text<string>: "Sample text for analysis";
    language<string>: "en";
};

context output {
    results<string>: "{}";
};

context toolRegistry {
    customTools<string>: "[]";
};

// State machine
State idle;
State complete;

// Task with meta-programming enabled
Task analyze {
    meta: true;
    prompt: "Analyze the input text. If no analysis tool exists, construct one using construct_tool.";
};

// Flow
idle -> analyze;

analyze -reads-> input;
analyze -writes-> output;
analyze -writes-> toolRegistry;  // Can register new tools

analyze -> complete;

complete -> idle;

// Expected agent behavior:
// 1. Agent receives prompt to analyze text
// 2. Agent checks available tools via list_available_tools
// 3. No analysis tool exists
// 4. Agent uses construct_tool:
//    {
//      name: "analyze_sentiment",
//      description: "Analyze text sentiment",
//      input_schema: {
//        type: "object",
//        properties: {
//          text: { type: "string" }
//        }
//      },
//      implementation_strategy: "agent_backed",
//      implementation_details: "Analyze sentiment as positive/negative/neutral..."
//    }
// 5. Tool is registered and immediately available
// 6. Agent uses new analyze_sentiment tool
// 7. Agent writes results to output context
// 8. Agent transitions to complete

```

### `phase-specific-context.dy`

Phase-Specific Context Demo

```dy examples/rails/phase-specific-context.mach
machine "Phase-Specific Context Demo"

// This example demonstrates how agents receive only relevant
// context at each node, based on edge permissions.

// Context nodes
context userInput {
    query<string>: "What is the weather today?";
    userId<string>: "user123";
};

context sessionData {
    history<string>: "[]";
    preferences<string>: "{}";
};

context apiCredentials {
    weatherApiKey<string>: "secret-key";
    openaiApiKey<string>: "secret-key";
};

context results {
    weatherData<string>: "{}";
    response<string>: "";
};

// State machine
State idle;
State complete;

// Tasks with different context permissions
Task parseQuery {
    prompt: "Parse the user query and extract intent";
};

Task fetchWeather {
    prompt: "Fetch weather data from API";
};

Task generateResponse {
    prompt: "Generate a natural language response";
};

// Flow with explicit permissions
idle -> parseQuery;

// parseQuery: Can read user input and session data
parseQuery -reads-> userInput;
parseQuery -reads-> sessionData;
parseQuery -> fetchWeather;

// fetchWeather: Can read query, access API credentials, write results
fetchWeather -read, query-> userInput;           // Field-level: only query field
fetchWeather -reads-> apiCredentials;            // Full access to credentials
fetchWeather -writes-> results;                  // Can write results
fetchWeather -> generateResponse;

// generateResponse: Can read results and session, write final response
generateResponse -reads-> results;
generateResponse -reads-> sessionData;
generateResponse -write, response-> results;     // Field-level: only response field
generateResponse -> complete;

complete -> idle;

// Phase-specific context in action:
//
// At parseQuery:
//   Available Context:
//   - userInput: read (query, userId)
//   - sessionData: read (history, preferences)
//   Available Tools:
//   - read_userInput(field?)
//   - read_sessionData(field?)
//   - transition_to_fetchWeather(reason?)
//
// At fetchWeather:
//   Available Context:
//   - userInput: read (query only)
//   - apiCredentials: read (weatherApiKey, openaiApiKey)
//   - results: write (weatherData, response)
//   Available Tools:
//   - read_userInput(field?) -- limited to 'query'
//   - read_apiCredentials(field?)
//   - write_results(field, value)
//   - transition_to_generateResponse(reason?)
//
// At generateResponse:
//   Available Context:
//   - results: read (weatherData, response)
//   - sessionData: read (history, preferences)
//   - results: write (response only)
//   Available Tools:
//   - read_results(field?)
//   - read_sessionData(field?)
//   - write_results(field, value) -- limited to 'response'
//   - transition_to_complete(reason?)
//
// Notice: apiCredentials are NOT visible to parseQuery or generateResponse
// This demonstrates security through permission-based context access

```

### `self-improving-pipeline.dy`

Self-Improving Data Pipeline

```dy examples/rails/self-improving-pipeline.mach
machine "Self-Improving Data Pipeline"

// This is the complete example from the Rails-Based Architecture docs
// demonstrating meta-programming with tool construction and improvement.

// Context nodes
context input {
    data<string>: "[]";
    format<string>: "json";
};

context output {
    processed<string>: "[]";
    metrics<string>: "{}";
};

context toolRegistry {
    customTools<string>: "[]";
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
idle -> ingest;                           // Start with ingest

ingest -reads-> input;                    // Permission: can read input
ingest -> process;                        // Agent decides when ready

process -reads-> input;                   // Can read input
process -writes-> output;                 // Can write output
process -writes-> toolRegistry;           // Can construct tools
process -> optimizing, complete;          // Agent decides: optimize or finish?

optimizing -reads-> toolRegistry;         // Can review tools
optimizing -reads-> output;               // Can see results
optimizing -writes-> toolRegistry;        // Can improve tools
optimizing -> complete, process;          // Agent: complete or retry with improved tools

complete -> idle;                         // Loop back

// Expected execution flow:
//
// 1. idle → ingest: Automatic (state node + @auto)
//
// 2. ingest:
//    - Agent receives system prompt with context about input
//    - Has tools: read_input, transition_to_process
//    - Loads data, chooses transition to process
//
// 3. ingest → process: Agent-controlled
//
// 4. process (first time):
//    - Agent receives prompt: "Process the data. If no suitable tool exists, construct one."
//    - Has tools: read_input, write_output, write_toolRegistry, construct_tool, transition_to_optimizing, transition_to_complete
//    - Realizes no processing tool exists
//    - Uses construct_tool to create analyze_sentiment tool
//    - Uses new tool to process data
//    - Stores results in output
//    - Decides to transition to optimizing
//
// 5. optimizing (first time):
//    - Agent reviews analyze_sentiment tool
//    - Sees it could be more efficient
//    - Uses propose_tool_improvement to suggest optimization
//    - Checks metrics.quality = 0.85 (< 0.9)
//    - Decides to transition back to process to try improved version
//
// 6. process (second time):
//    - Uses improved analyze_sentiment tool
//    - Quality improves to 0.92
//    - Transitions to optimizing
//
// 7. optimizing (second time):
//    - Condition metrics.quality > 0.9 is true
//    - Automatic transition to complete
//
// 8. complete → idle: Automatic (state node + @auto)

```

### `tool-review-improvement.dy`

Tool Review and Improvement Demo

```dy examples/rails/tool-review-improvement.mach
machine "Tool Review and Improvement Demo"

// This example demonstrates how an agent can review existing
// tools and propose improvements.

// Context nodes
context input {
    numbers<string>: "[10, 20, 30, 40, 50]";
};

context output {
    average<number>: 0;
    median<number>: 0;
    stddev<number>: 0;
};

context toolRegistry {
    tools<string>: "[]";
    improvements<string>: "[]";
};

// State machine
State idle;
State reviewing;
State complete;

// Tasks
Task calculate {
    meta: true;
    prompt: "Calculate statistics. If no tool exists, construct one.";
};

Task review {
    meta: true;
    prompt: "Review the tools used in calculate. Are they efficient? Can they be improved?";
};

Task apply {
    meta: true;
    prompt: "Apply the proposed improvements to tools";
};

// Flow
idle -> calculate;

calculate -reads-> input;
calculate -writes-> output;
calculate -writes-> toolRegistry;
calculate -> reviewing;

reviewing -> review;

review -reads-> toolRegistry;
review -reads-> output;
review -writes-> toolRegistry;  // Can record improvements
review -> apply, complete;      // Agent decides if improvements needed

apply -reads-> toolRegistry;
apply -writes-> toolRegistry;
apply -> calculate;             // Try again with improved tools

complete -> idle;

// Expected execution flow:
//
// 1. idle → calculate: Automatic
//
// 2. calculate (first time):
//    - No statistics tool exists
//    - Agent uses construct_tool to create calculate_stats tool:
//      implementation_strategy: 'code_generation'
//      implementation_details: 'async (input) => {
//        const sum = input.numbers.reduce((a, b) => a + b, 0);
//        return sum / input.numbers.length;
//      }'
//    - Tool is basic, only calculates average
//    - Calculates average, writes to output
//    - Transitions to reviewing
//
// 3. reviewing → review: Automatic
//
// 4. review:
//    - Agent uses list_available_tools(include_source: true)
//    - Sees calculate_stats tool implementation
//    - Realizes it only calculates average, not median or stddev
//    - Uses propose_tool_improvement:
//      tool_name: 'calculate_stats'
//      rationale: 'Current tool only calculates average. Should calculate median and stddev too.'
//      proposed_changes: 'Add median and standard deviation calculations...'
//    - Decides to transition to apply
//
// 5. apply:
//    - Reads improvement proposals from toolRegistry
//    - Updates calculate_stats tool with enhanced implementation
//    - Transitions back to calculate
//
// 6. calculate (second time):
//    - Uses improved calculate_stats tool
//    - Now calculates average, median, and stddev
//    - Writes all results to output
//    - Transitions to reviewing
//
// 7. review (second time):
//    - Tool is now comprehensive
//    - No further improvements needed
//    - Transitions to complete
//
// 8. complete → idle: Automatic

```
