# Runtime & Evolution System

DyGram's runtime system executes machines with support for LLM-powered tasks, automatic code generation, and intelligent evolution from exploratory prompts to optimized code.

## Machine Executor

The `MachineExecutor` is the core runtime that executes DyGram machines, managing state, task execution, and transitions.

### Basic Execution


```typescript
import { createMachineServices } from 'dygram';
import { MachineExecutor } from 'dygram/language/machine-executor';

// Parse machine definition
const services = createMachineServices(EmptyFileSystem);
const machineData = services.Machine.parser.LangiumParser.parse(code);

// Create executor
const executor = new MachineExecutor(machineData, config);

// Execute step-by-step
await executor.step();

// Or run until completion
while (!executor.isComplete()) {
    await executor.step();

```


### Execution Context

The executor maintains:
- **Current state** - Active node in the machine
- **History** - Log of all state transitions
- **Mutations** - Record of runtime changes to the machine
- **Task outputs** - Results from executed tasks

### Runtime Visualization

The executor provides rich runtime visualization capabilities that show the current execution state with visual indicators and execution history.

#### Runtime Diagram Generation


```typescript
// Generate runtime visualization
const runtimeDiagram = executor.toMermaidRuntime();
console.log(runtimeDiagram);
```


**Runtime diagrams include:**
- **Status indicators**: ▶️ (current), ✅ (visited), ⏸️ (pending)
- **Execution counts**: Visit counts and edge traversal counts
- **Runtime values**: Current attribute values and execution status
- **Execution history**: Complete path with timestamps and outputs
- **Color coding**: Green (current), blue (visited), yellow (pending)

#### Visual State Representation

Runtime diagrams use the same `classDiagram-v2` format as static diagrams for consistency, but with enhanced runtime overlays:


```mermaid
---
title: "Task Management [RUNTIME]"
config:
  class:
    hideEmptyMembersBox: true
---
classDiagram-v2

  class task["✅ task"] {
    <`<Input>`>
    +status: VISITED
    +visits: 1
    +description: "Process this task"
    +priority: 5

  class process["▶️ process"] {
    <`<Task>`>
    +status: CURRENT
    +prompt: "Analyze task: {{ task.description }}"

  class output["⏸️ output"] {
    <`<Result>`>
    +status: PENDING
    +result: "TBD"

  %% Runtime State Styling
  classDef currentNode fill:#4CAF50,stroke:#2E7D32,stroke-width:4px,color:#fff
  classDef visitedNode fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff
  classDef pendingNode fill:#FFC107,stroke:#F57F17,stroke-width:1px,color:#000

  class task visitedNode
  class process currentNode
  class output pendingNode

  task --> process : requires [1x]
  process --> output : produces

  %% Execution Path:
  %% 1. task → process (requires) at 15:30:45
  %%    Output: Task analyzed successfully
```


#### Mobile Playground Integration

The mobile playground provides an interactive runtime visualization experience:

- **Real-time updates**: Diagrams update as execution progresses
- **Execution history**: Shows step-by-step execution with LLM outputs
- **Error handling**: Graceful handling of empty machines and errors
- **Environment variables**: Support for `ANTHROPIC_API_KEY` configuration

#### Advanced Visualization Features


```typescript
import { VisualizingMachineExecutor } from 'dygram/language/runtime-visualizer';

// Enhanced executor with visualization features
const visualExecutor = new VisualizingMachineExecutor(machineData, config);

// Execute with visualization
await visualExecutor.step();

// Generate enhanced runtime diagram
const diagram = visualExecutor.generateRuntimeVisualization();
```


**Enhanced features:**
- **Safe context handling**: Prevents circular reference errors
- **Mobile optimization**: Optimized for mobile playground rendering
- **Runtime summaries**: Condensed execution information
- **Performance metrics**: Execution timing and statistics

## Task Evolution System

Tasks in DyGram can automatically evolve from LLM-based exploration to efficient code execution through four stages.

### Evolution Stages

#### Stage 1: llm_only (Exploration)

Pure LLM execution - every invocation uses the language model.


```dygram
Task classify {
    prompt: "Classify the text: {{ input }}";
    evolution_stage: "llm_only";

```


**Characteristics:**
- Highest flexibility and adaptability
- Highest cost per execution
- Gathers execution history for pattern learning
- Ideal for exploration and prototyping

#### Stage 2: hybrid (Learning)

Generated code with LLM fallback - tries code first, falls back to LLM on low confidence.


```dygram
Task classify {
    prompt: "Classify the text: {{ input }}";
    evolution_stage: "hybrid";
    code_path: "generated/classify_v123.ts";

```


**Characteristics:**
- Code handles common cases (confidence ≥ 0.8)
- LLM handles edge cases and novel inputs
- Balanced cost and performance
- Continues learning from LLM executions

#### Stage 3: code_first (Optimization)

Code-first with selective LLM assistance - only uses LLM when code confidence is below threshold.


```dygram
Task classify {
    evolution_stage: "code_first";
    code_path: "generated/classify_v456.ts";
    llm_threshold: "0.7";

```


**Characteristics:**
- Code handles most cases (confidence ≥ 0.7)
- LLM only for low-confidence scenarios
- Low cost with safety net
- Fine-tunable threshold

#### Stage 4: code_only (Maturity)

Pure code execution - no LLM fallback, fully optimized.


```dygram
Task classify {
    evolution_stage: "code_only";
    code_path: "generated/classify_v789.ts";

```


**Characteristics:**
- Fastest execution
- Lowest cost (no LLM calls)
- Deterministic behavior
- Requires high confidence in generated code

### Automatic Evolution

The `EvolutionaryExecutor` automatically triggers evolution when tasks meet performance thresholds:

```typescript
import { EvolutionaryExecutor } from 'dygram/language/task-evolution';
import { createStorage } from 'dygram/language/storage';

const storage = createStorage(); // Auto-selects best available
const executor = new EvolutionaryExecutor(machineData, {}, storage);

// Execute many times - evolution happens automatically
for (let i = 0; i < 500; i++) {
    await executor.step();

// Check which tasks evolved
const mutations = executor.getMutations();
const evolutions = mutations.filter(m => m.type === 'task_evolution');
console.log(\`\${evolutions.length} tasks evolved\`);
```

**Evolution Triggers:**
- Execution count ≥ 100
- Success rate ≥ 90%
- Stable execution patterns

### Manual Evolution

Trigger evolution on-demand:


```typescript
const executor = new EvolutionaryExecutor(machineData, {}, storage);

// Force evolution to next stage
await executor.triggerEvolution('my_task');

// Check current metrics
const metrics = executor.getTaskMetrics();
console.log(metrics.get('my_task'));
```


## Code Generation

Generated code is TypeScript with proper type definitions and confidence scoring.

### Generated Code Structure


```typescript
interface TaskExecutionContext {
    attributes: Record<string, any>;
    history: Array<any>;
    machineState: any;

interface TaskExecutionResult {
    output: any;
    confidence: number;
    metadata: {
        execution_time_ms: number;
        code_version?: string;
        used_llm: boolean;
    };

export function getConfidence(input: any): number {
    // Pattern matching based on learned executions
    return 0.9;

export async function execute(
    input: any,
    context: TaskExecutionContext
): Promise`<TaskExecutionResult>` {
    const startTime = Date.now();

    // Generated logic from execution history
    const output = processInput(input);

    return {
        output,
        confidence: 0.95,
        metadata: {
            execution_time_ms: Date.now() - startTime,
            used_llm: false

    };

```


### Code Generation Process

1. **Pattern Analysis** - Analyze execution history for patterns
2. **Type Inference** - Infer input/output types from data
3. **Logic Synthesis** - Generate TypeScript from patterns
4. **Confidence Modeling** - Create confidence scoring function
5. **Module Creation** - Package as executable module

## Storage & Persistence

Browser-compatible storage with unified API across environments.

### Storage Backends


```typescript
import { createStorage } from 'dygram/language/storage';

// Auto-select best available (IndexedDB > localStorage > memory)
const storage = createStorage();

// Or explicitly choose:
const indexedDB = createStorage('indexeddb');
const localStorage = createStorage('localstorage');
const memory = createStorage('memory');
```


**Backend Capabilities:**

| Backend | Environment | Persistence | Capacity | Performance |
|---------|-------------|-------------|----------|-------------|
| IndexedDB | Browser | ✅ Persistent | ~1GB+ | High |
| LocalStorage | Browser | ✅ Persistent | ~5-10MB | Medium |
| Memory | Node.js/Browser | ❌ Session-only | Unlimited | Highest |

### Machine Versioning

Track machine evolution over time with full version control:


```typescript
import { MachinePersistence } from 'dygram/language/machine-persistence';

const persistence = new MachinePersistence(storage);

// Save version with metrics
const versionId = await persistence.saveVersion(
    executor,
    'my-machine',
    {
        avg_execution_time_ms: 100,
        success_rate: 0.95,
        cost_per_execution: 0.01,
        execution_count: 100

);

// Load specific version
const machineData = await persistence.loadVersion('my-machine', versionId);

// List all versions
const versions = await persistence.listVersions('my-machine');

// Rollback to previous version
await persistence.rollbackToVersion('my-machine', previousVersionId);
```


### Pattern Library

Reuse learned behaviors across machines:


```typescript
import { PatternLibrary } from 'dygram/language/machine-persistence';

const library = new PatternLibrary(storage);

// Save a pattern
await library.savePattern({
    name: 'text_classifier',
    description: 'Classifies text into categories',
    version: 'v1',
    code: generatedCode,
    performance_metrics: {
        avg_execution_time_ms: 50,
        success_rate: 0.95,
        cost_per_execution: 0.005,
        execution_count: 1000
    },
    trained_on: {
        machine_id: 'classifier-machine',
        task_name: 'classify',
        training_samples: 1000

});

// Import pattern into another machine
await library.importPattern(executor, 'text_classifier', 'my_task');

// List all patterns
const patterns = await library.listPatterns();

// Get specific pattern
const pattern = await library.getPattern('text_classifier');
```


## Performance Metrics

Track task performance over time:


```typescript
const metrics = executor.getTaskMetrics().get('my_task');

console.log({
    stage: metrics.stage,                    // Current evolution stage
    execution_count: metrics.execution_count, // Total executions
    success_rate: metrics.success_rate,      // Success rate (0-1)
    avg_latency: metrics.performance_metrics.avg_execution_time_ms,
    cost_per_execution: metrics.performance_metrics.cost_per_execution
});
```


### Metrics Collected

- **Execution time** - Average latency per execution
- **Success rate** - Percentage of successful executions
- **Cost** - LLM API cost per execution
- **Execution count** - Total number of executions
- **Evolution history** - When and why tasks evolved

## Configuration

### Evolution Thresholds

Customize when tasks should evolve (modify in `EvolutionaryExecutor`):


```typescript
private static readonly EXECUTION_THRESHOLD = 100;        // Min executions
private static readonly SUCCESS_RATE_THRESHOLD = 0.90;    // Min success rate
private static readonly HYBRID_CONFIDENCE_THRESHOLD = 0.8; // Stage 2 threshold
private static readonly CODE_FIRST_CONFIDENCE_THRESHOLD = 0.7; // Stage 3 threshold
```


### Storage Configuration


```typescript
// IndexedDB with custom database name and version
const storage = new IndexedDBStorage('my-db-name', 1);

// LocalStorage with custom key prefix
const storage = new LocalStorageBackend('myapp:');

// Memory storage (useful for testing)
const storage = new MemoryStorage();
```


## Complete Example

```typescript
import { EvolutionaryExecutor } from 'dygram/language/task-evolution';
import { createStorage } from 'dygram/language/storage';
import { MachinePersistence, PatternLibrary } from 'dygram/language/machine-persistence';

// Setup
const storage = createStorage();
const persistence = new MachinePersistence(storage);
const library = new PatternLibrary(storage);
const executor = new EvolutionaryExecutor(machineData, {}, storage);

// Execute and evolve
for (let i = 0; i < 500; i++) {
    await executor.step();

    // Save version every 100 executions
    if (i % 100 === 0) {
        const metrics = calculateMetrics(executor);
        await persistence.saveVersion(executor, 'my-machine', metrics);


// Check evolutions
const mutations = executor.getMutations();
const evolutions = mutations.filter(m => m.type === 'task_evolution');
console.log(\`\${evolutions.length} tasks evolved\`);

// Save evolved patterns to library
for (const evolution of evolutions) {
    const code = await storage.loadCode(evolution.data.code_path);
    const metrics = executor.getTaskMetrics().get(evolution.data.task);

    await library.savePattern({
        name: evolution.data.task,
        description: \`Evolved from \${evolution.data.from_stage} to \${evolution.data.to_stage}\`,
        version: Date.now().toString(),
        code,
        performance_metrics: metrics.performance_metrics,
        trained_on: {
            machine_id: 'my-machine',
            task_name: evolution.data.task,
            training_samples: metrics.execution_count

    });

// Reuse pattern in another machine
const otherExecutor = new EvolutionaryExecutor(otherMachineData, {}, storage);
await library.importPattern(otherExecutor, 'my_task', 'imported_task');
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EvolutionaryExecutor                      │
├─────────────────────────────────────────────────────────────┤
│  - Extends MachineExecutor                                   │
│  - Tracks task metrics                                       │
│  - Triggers evolution based on thresholds                    │
│  - Loads and caches generated code modules                   │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
         ┌──────────▼──────────┐ ┌─────▼──────────┐
         │  CodeGeneration     │ │    Storage     │
         ├─────────────────────┤ ├────────────────┤
         │ - Generate TS code  │ │ - IndexedDB    │
         │ - Type generation   │ │ - localStorage │
         │ - Compile prompts   │ │ - Memory       │
         └─────────────────────┘ └────────────────┘
                    │                   │
         ┌──────────▼──────────┐ ┌─────▼──────────┐
         │  MachinePersistence │ │ PatternLibrary │
         ├─────────────────────┤ ├────────────────┤
         │ - Versioning        │ │ - Save patterns│
         │ - Rollback          │ │ - Import       │
         │ - History tracking  │ │ - Reuse code   │
         └─────────────────────┘ └────────────────┘
```

## Best Practices

### 1. Start with LLM-only

Begin with pure LLM execution to explore the problem space:


```dygram
Task analyze {
    prompt: "Analyze: {{ input }}";
    // evolution_stage defaults to "llm_only"

```


### 2. Let Evolution Happen Naturally

Trust the automatic evolution thresholds for most cases. Manual evolution is for special scenarios.

### 3. Save Versions Regularly

Create version snapshots during development:


```typescript
// After significant changes
await persistence.saveVersion(executor, 'my-machine', metrics);
```


### 4. Build a Pattern Library

Reuse successful patterns across projects:


```typescript
// Extract and save good patterns
await library.savePattern({ ... });

// Import into new machines
await library.importPattern(newExecutor, patternName, taskName);
```


### 5. Monitor Metrics

Track performance to understand evolution impact:

```typescript
const metrics = executor.getTaskMetrics();
for (const [task, data] of metrics) {
    console.log(\`\${task}: \${data.stage} (\${data.success_rate})\`);
}
```

## Future Enhancements

Potential improvements for future development:

1. **Schema Evolution** - JSON Schema validation for inputs/outputs
2. **Context Management** - Intelligent history pruning and summarization
3. **A/B Testing** - Compare code versions against LLM baseline
4. **Sandboxing** - Secure execution of generated code in isolated environments
5. **Multi-language Support** - Generate code in Python, Go, etc.
6. **Performance Optimization** - JIT compilation, caching strategies
7. **Observability** - Metrics dashboard, execution traces, anomaly detection

## Related Documentation

- [Language Overview](language-overview.html) - DyGram syntax and concepts
- [Syntax Guide](syntax-guide.html) - Complete language reference
- [Testing Approach](testing-approach.html) - Testing methodology
- [Examples Index](examples-index.html) - Example machines