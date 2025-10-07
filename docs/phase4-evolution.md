# Phase 4: Code Generation & Evolution

Phase 4 adds the ability for LLM-based tasks to evolve into code-executing tasks over time, with systems for context evolution, type generation, and browser-compatible persistence.

## Overview

Tasks in the Machine DSL can now transition through four evolution stages:

1. **llm_only** - Pure LLM execution (exploration phase)
2. **hybrid** - Generated code with LLM fallback (learning phase)
3. **code_first** - Code execution with LLM for low confidence (optimization phase)
4. **code_only** - Pure code execution (maturity phase)

## Key Features

### 1. Automatic Code Generation

When a task has been executed successfully enough times (>100 executions with >90% success rate), the system automatically generates TypeScript code based on learned patterns:

```typescript
import { EvolutionaryExecutor } from './language/task-evolution.js';
import { MemoryStorage } from './language/storage.js';

const storage = new MemoryStorage();
const executor = new EvolutionaryExecutor(machineData, {}, storage);

// Execute multiple times
for (let i = 0; i < 150; i++) {
    await executor.step();
}

// Task automatically evolves to hybrid stage
```

### 2. Browser-Compatible Storage

Three storage backends with a unified interface:

```typescript
import { createStorage } from './language/storage.js';

// Automatically selects best available storage
const storage = createStorage(); // IndexedDB in browsers, Memory in Node.js

// Or explicitly choose:
const indexedDB = createStorage('indexeddb');
const localStorage = createStorage('localstorage');
const memory = createStorage('memory');
```

**Features:**
- `IndexedDBStorage` - Full-featured browser storage with transactions
- `LocalStorageBackend` - Fallback for browsers without IndexedDB
- `MemoryStorage` - In-memory storage for Node.js and testing

### 3. Machine Versioning

Track machine evolution over time:

```typescript
import { MachinePersistence } from './language/machine-persistence.js';

const persistence = new MachinePersistence(storage);

// Save version
const v1 = await persistence.saveVersion(executor, 'my-machine', {
    avg_execution_time_ms: 100,
    success_rate: 0.95,
    cost_per_execution: 0.01,
    execution_count: 100
});

// Later, load or rollback
const machineData = await persistence.loadVersion('my-machine', v1);
```

### 4. Pattern Library

Reuse learned behaviors across machines:

```typescript
import { PatternLibrary } from './language/machine-persistence.js';

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
    }
});

// Import pattern into another machine
await library.importPattern(executor, 'text_classifier', 'my_task');
```

## Evolution Stages Explained

### Stage 1: llm_only

**Attributes:**
```machine
Task classify {
    prompt: "Classify: {{ input }}";
    evolution_stage: "llm_only";
}
```

**Behavior:**
- Every execution uses LLM
- Highest flexibility, highest cost
- Gathers execution history for pattern learning

### Stage 2: hybrid

**Attributes:**
```machine
Task classify {
    prompt: "Classify: {{ input }}";
    evolution_stage: "hybrid";
    code_path: "generated/classify_v123.ts";
}
```

**Behavior:**
- Tries generated code first
- Falls back to LLM if code confidence < 0.8
- Balances cost and flexibility

### Stage 3: code_first

**Attributes:**
```machine
Task classify {
    evolution_stage: "code_first";
    code_path: "generated/classify_v456.ts";
    llm_threshold: "0.7";
}
```

**Behavior:**
- Executes generated code
- Only uses LLM if confidence < 0.7
- Low cost, handles edge cases

### Stage 4: code_only

**Attributes:**
```machine
Task classify {
    evolution_stage: "code_only";
    code_path: "generated/classify_v789.ts";
}
```

**Behavior:**
- Pure code execution
- No LLM fallback
- Lowest cost, fastest execution

## Manual Evolution

Trigger evolution manually instead of waiting for automatic thresholds:

```typescript
import { EvolutionaryExecutor } from './language/task-evolution.js';

const executor = new EvolutionaryExecutor(machineData, {}, storage);

// Manually evolve a task to next stage
await executor.triggerEvolution('my_task');

// Check current metrics
const metrics = executor.getTaskMetrics();
console.log(metrics.get('my_task'));
```

## Type Generation

Generated code is TypeScript with proper type definitions:

```typescript
// Generated code example
interface TaskExecutionContext {
    attributes: Record<string, any>;
    history: Array<any>;
    machineState: any;
}

interface TaskExecutionResult {
    output: any;
    confidence: number;
    metadata: {
        execution_time_ms: number;
        code_version?: string;
        used_llm: boolean;
    };
}

export function getConfidence(input: any): number {
    return 0.9; // Based on learned patterns
}

export async function execute(
    input: any,
    context: TaskExecutionContext
): Promise<TaskExecutionResult> {
    // Generated logic based on execution history
    return {
        output: processedResult,
        confidence: 0.95,
        metadata: {
            execution_time_ms: Date.now() - startTime,
            used_llm: false
        }
    };
}
```

## Performance Metrics

Track task performance over time:

```typescript
const metrics = executor.getTaskMetrics().get('my_task');

console.log({
    stage: metrics.stage,
    execution_count: metrics.execution_count,
    success_rate: metrics.success_rate,
    avg_latency: metrics.performance_metrics.avg_execution_time_ms,
    cost_per_execution: metrics.performance_metrics.cost_per_execution
});
```

## Configuration

### Evolution Thresholds

Configure when tasks should evolve:

```typescript
// In EvolutionaryExecutor class
private static readonly EXECUTION_THRESHOLD = 100;
private static readonly SUCCESS_RATE_THRESHOLD = 0.90;
private static readonly HYBRID_CONFIDENCE_THRESHOLD = 0.8;
private static readonly CODE_FIRST_CONFIDENCE_THRESHOLD = 0.7;
```

### Storage Configuration

```typescript
// IndexedDB configuration
const storage = new IndexedDBStorage('my-db-name', 1);

// LocalStorage with custom prefix
const storage = new LocalStorageBackend('myapp:');

// Memory storage (for testing)
const storage = new MemoryStorage();
```

## Complete Example

```typescript
import { EvolutionaryExecutor } from './language/task-evolution.js';
import { createStorage } from './language/storage.js';
import { MachinePersistence, PatternLibrary } from './language/machine-persistence.js';

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
    }
}

// Check evolutions
const mutations = executor.getMutations();
const evolutions = mutations.filter(m => m.type === 'task_evolution');

console.log(`Tasks evolved: ${evolutions.length}`);

// Save evolved patterns to library
for (const evolution of evolutions) {
    const code = await storage.loadCode(evolution.data.code_path);

    await library.savePattern({
        name: evolution.data.task,
        description: `Evolved from ${evolution.data.from_stage} to ${evolution.data.to_stage}`,
        version: Date.now().toString(),
        code,
        performance_metrics: calculateMetrics(executor),
        trained_on: {
            machine_id: 'my-machine',
            task_name: evolution.data.task,
            training_samples: 500
        }
    });
}
```

## Testing

Comprehensive test suite with 16 tests covering:

- Code generation
- Storage backends (IndexedDB, localStorage, memory)
- Machine versioning and rollback
- Pattern library operations
- Task evolution stages
- End-to-end evolution lifecycle

Run tests:
```bash
npm test -- phase4-evolution.test.ts
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

## Future Enhancements

Potential improvements for future phases:

1. **Schema Evolution** - JSON Schema validation for inputs/outputs
2. **Context Management** - Intelligent history pruning and summarization
3. **A/B Testing** - Compare code versions against LLM baseline
4. **Sandboxing** - Secure execution of generated code in isolated environments
5. **Multi-language Support** - Generate code in Python, Go, etc.
6. **Performance Optimization** - JIT compilation, caching strategies
7. **Observability** - Metrics dashboard, execution traces, anomaly detection

## Related Documentation

- [Phase 2: Edges as Tools & Meta Tasks](./phase2-tools.md)
- [Machine Executor API](../src/language/machine-executor.ts)
- [Task Evolution API](../src/language/task-evolution.ts)
- [Storage API](../src/language/storage.ts)
