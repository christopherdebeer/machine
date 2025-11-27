# Checkpoints: State Persistence and Time Travel

DyGram provides a powerful checkpoint system that allows you to capture, restore, and manage execution state snapshots. Checkpoints enable state persistence, execution branching, debugging workflows, and time-travel debugging.

## Table of Contents

- [Overview](#overview)
- [Creating Checkpoints](#creating-checkpoints)
- [Restoring Checkpoints](#restoring-checkpoints)
- [Checkpoint Serialization](#checkpoint-serialization)
- [Checkpoint Management](#checkpoint-management)
- [Comparing Checkpoints](#comparing-checkpoints)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)

## Overview

A checkpoint captures the complete execution state at a specific moment, including:

- **Machine structure** (nodes, edges, configuration)
- **Execution paths** (all active, completed, and failed paths)
- **Shared context** (all context values and data)
- **Metadata** (step count, timestamp, description)

Checkpoints are immutable snapshots stored in memory and can be serialized to JSON for persistence.

### Checkpoint Structure

```typescript
interface ExecutionCheckpoint {
    id: string;                      // Unique identifier
    timestamp: string;               // ISO 8601 timestamp
    machineData: MachineJSON;        // Complete machine structure
    paths: ExecutionPath[];          // All execution paths
    sharedContext: Record<string, any>; // Context state
    metadata: {
        stepCount: number;           // Execution step count
        description?: string;        // Optional description
    };
}
```

## Creating Checkpoints

### Declarative Checkpoints with @checkpoint

Use the `@checkpoint` annotation to automatically capture state when a node executes.

```dygram
machine "Auto Checkpoint Example"

context ProcessState {
  processedCount: 0
  results: []
}

state Start "Initialize process"
state Critical "Critical processing step" @checkpoint
state Risky "Risky operation" @checkpoint
state Final "Finalization"

Start -> Critical -> Risky -> Final
```

**When nodes with `@checkpoint` execute:**
- State is automatically captured
- Checkpoint ID is logged
- Checkpoint is stored in memory

### Programmatic Checkpoints

Create checkpoints programmatically via the executor API.

```typescript
import { MachineExecutor } from 'dygram';

const executor = new MachineExecutor(machineData, options);

// Create checkpoint with description
const checkpointId = executor.createCheckpoint("Before data transformation");

console.log(`Checkpoint created: ${checkpointId}`);
// Output: 📸 Checkpoint created: cp_1732485234567_abc123xyz
```

### When Checkpoints Are Created

Checkpoints are captured:
1. **Automatically** when a node with `@checkpoint` annotation executes
2. **Programmatically** when `executor.createCheckpoint()` is called
3. **On demand** for debugging or testing purposes

## Restoring Checkpoints

Restore execution to a previous state using checkpoint IDs.

```typescript
// Execute some steps
await executor.run();

// Something went wrong - restore to checkpoint
const restored = executor.restoreCheckpoint(checkpointId);

if (restored) {
    console.log('State restored successfully');
    console.log(`Restored to step: ${restored.metadata.stepCount}`);

    // Continue execution from restored state
    await executor.run();
} else {
    console.error('Checkpoint not found');
}
```

### Restore Behavior

When a checkpoint is restored:
- **Machine structure** is reset to checkpoint state
- **All execution paths** are restored (active, completed, failed)
- **Context values** revert to checkpoint values
- **Step counter** resets to checkpoint step count
- **Current execution** can continue from restored state

### Example: Try-Restore Pattern

```dygram
machine "Transactional Workflow"

context Transaction {
  committed: false
  rollbackPoint: ""
}

Task begin "Begin transaction" {
  prompt: "Initialize transaction and create checkpoint"
  model: "claude-3-5-sonnet-20241022"
}

Task process "Process data" @checkpoint
Task validate "Validate results"
Task commit "Commit transaction"

begin -> process -> validate -> commit
```

Programmatic usage:

```typescript
// Begin transaction
const transactionCheckpoint = executor.createCheckpoint("Transaction start");

try {
    await executor.step(); // process
    await executor.step(); // validate

    if (validationFailed) {
        throw new Error("Validation failed");
    }

    await executor.step(); // commit
} catch (error) {
    console.log("Rolling back transaction...");
    executor.restoreCheckpoint(transactionCheckpoint);
}
```

## Checkpoint Serialization

Export and import checkpoints to/from JSON for persistence.

### Serialize Single Checkpoint

```typescript
// Create checkpoint
const checkpointId = executor.createCheckpoint("Critical state");

// Get StateManager instance
const stateManager = executor.getStateManager();

// Serialize to JSON string
const serialized = stateManager.serializeCheckpoint(checkpointId);

// Save to file or database
await fs.writeFile('checkpoint.json', serialized);
```

### Deserialize Checkpoint

```typescript
// Load from file
const json = await fs.readFile('checkpoint.json', 'utf-8');

// Deserialize and add to state manager
const restoredId = stateManager.deserializeCheckpoint(json);

if (restoredId) {
    console.log(`Checkpoint imported: ${restoredId}`);

    // Restore execution to imported state
    executor.restoreCheckpoint(restoredId);
}
```

### Export All Checkpoints

```typescript
// Export all checkpoints to JSON array
const allCheckpoints = stateManager.exportAllCheckpoints();

await fs.writeFile('all-checkpoints.json', allCheckpoints);
```

### Import Multiple Checkpoints

```typescript
// Load checkpoint collection
const json = await fs.readFile('all-checkpoints.json', 'utf-8');

// Import all checkpoints
const importedCount = stateManager.importCheckpoints(json);

console.log(`Imported ${importedCount} checkpoints`);
```

### Checkpoint JSON Format

```json
{
  "id": "cp_1732485234567_abc123xyz",
  "timestamp": "2025-11-24T23:00:34.567Z",
  "machineData": {
    "nodes": [...],
    "edges": [...],
    "attributes": {...}
  },
  "paths": [
    {
      "id": "path_0",
      "nodeHistory": ["Start", "Critical"],
      "status": "active"
    }
  ],
  "sharedContext": {
    "processedCount": 42,
    "results": [...]
  },
  "metadata": {
    "stepCount": 15,
    "description": "Before risky operation"
  }
}
```

## Checkpoint Management

### List Checkpoints

Get metadata for all stored checkpoints.

```typescript
const stateManager = executor.getStateManager();

// Get checkpoint metadata (no full state)
const checkpoints = stateManager.listCheckpoints();

checkpoints.forEach(cp => {
    console.log(`${cp.id} - ${cp.timestamp}`);
    console.log(`  Step: ${cp.metadata.stepCount}`);
    console.log(`  Desc: ${cp.metadata.description || 'N/A'}`);
});
```

### Get Checkpoint Metadata

Retrieve metadata without loading full state.

```typescript
const metadata = stateManager.getCheckpointMetadata(checkpointId);

if (metadata) {
    console.log(`Checkpoint: ${metadata.id}`);
    console.log(`Created: ${metadata.timestamp}`);
    console.log(`Steps: ${metadata.metadata.stepCount}`);
}
```

### Delete Checkpoint

Remove a specific checkpoint.

```typescript
const deleted = stateManager.deleteCheckpoint(checkpointId);

if (deleted) {
    console.log('Checkpoint deleted');
} else {
    console.log('Checkpoint not found');
}
```

### Clear All Checkpoints

Remove all stored checkpoints.

```typescript
stateManager.clearCheckpoints();
console.log('All checkpoints cleared');
```

### Checkpoint Statistics

Get statistics about stored checkpoints.

```typescript
const stats = stateManager.getStats();

console.log(`Total checkpoints: ${stats.totalCheckpoints}`);
console.log(`Oldest: ${stats.oldestCheckpoint}`);
console.log(`Newest: ${stats.newestCheckpoint}`);
console.log(`Total size: ${stats.totalSize} bytes`);
```

### Checkpoint Limits

By default, the StateManager stores up to 100 checkpoints using FIFO eviction.

```typescript
// Configure max checkpoints (constructor parameter)
const stateManager = new StateManager(50); // Store max 50 checkpoints

// When limit exceeded:
// - Oldest checkpoint is automatically deleted
// - New checkpoint is stored
// - Console warning is logged
```

## Comparing Checkpoints

Compare two checkpoints to see what changed.

```typescript
const checkpoint1 = executor.createCheckpoint("Before processing");

// Execute some steps
await executor.step();
await executor.step();

const checkpoint2 = executor.createCheckpoint("After processing");

// Compare checkpoints
const diff = stateManager.compareCheckpoints(checkpoint1, checkpoint2);

if (diff) {
    console.log('Path changes:');
    diff.pathChanges.forEach(change => console.log(`  - ${change}`));

    console.log('Context changes:');
    diff.contextChanges.forEach(change => console.log(`  - ${change}`));

    console.log(`Step difference: ${diff.stepDifference}`);
}
```

### Comparison Output

```typescript
{
    pathChanges: [
        "Path count changed: 1 -> 3",
        // Additional path differences
    ],
    contextChanges: [
        "processedCount: 0 -> 42",
        "results: [] -> [{...}]"
    ],
    stepDifference: 5  // checkpoint2 is 5 steps ahead
}
```

## Use Cases

### State Persistence Across Sessions

Save execution state and resume later.

```typescript
// Before shutdown
const checkpointId = executor.createCheckpoint("Session end");
const serialized = stateManager.serializeCheckpoint(checkpointId);
await db.save('last-session', serialized);

// After restart
const saved = await db.load('last-session');
const restoredId = stateManager.deserializeCheckpoint(saved);
executor.restoreCheckpoint(restoredId);

console.log('Session restored - continuing execution');
await executor.run();
```

### Execution Branching

Create multiple execution branches from a single checkpoint.

```dygram
machine "Branching Experiment"

context Experiment {
  algorithm: "baseline"
  score: 0
}

state Setup "Setup experiment" @checkpoint
state Baseline "Run baseline"
state Experimental "Run experimental"
state Compare "Compare results"

Setup -> Baseline
Setup -> Experimental
Baseline -> Compare
Experimental -> Compare
```

```typescript
// Create checkpoint before branching
const branchPoint = executor.createCheckpoint("Experiment setup complete");

// Branch 1: Baseline algorithm
executor.restoreCheckpoint(branchPoint);
context.algorithm = "baseline";
await executor.run();
const baselineScore = context.score;

// Branch 2: Experimental algorithm
executor.restoreCheckpoint(branchPoint);
context.algorithm = "experimental";
await executor.run();
const experimentalScore = context.score;

// Compare results
console.log(`Baseline: ${baselineScore}`);
console.log(`Experimental: ${experimentalScore}`);
```

### Debugging Time-Travel

Step through execution and return to previous states.

```typescript
const debugger = {
    checkpoints: [],

    recordStep: async (executor) => {
        const id = executor.createCheckpoint(`Step ${debugger.checkpoints.length}`);
        debugger.checkpoints.push(id);
        await executor.step();
    },

    stepBack: (executor) => {
        if (debugger.checkpoints.length > 1) {
            debugger.checkpoints.pop(); // Remove current
            const previous = debugger.checkpoints[debugger.checkpoints.length - 1];
            executor.restoreCheckpoint(previous);
        }
    },

    stepForward: async (executor) => {
        await debugger.recordStep(executor);
    }
};

// Debug session
await debugger.recordStep(executor); // Step 0
await debugger.recordStep(executor); // Step 1
await debugger.recordStep(executor); // Step 2

debugger.stepBack(executor); // Back to Step 1
debugger.stepBack(executor); // Back to Step 0
await debugger.stepForward(executor); // Forward to Step 1
```

### Transactional Workflows

Implement rollback on error.

```dygram
machine "Data Pipeline with Rollback"

context Pipeline {
  inputData: []
  processedData: []
  committed: false
}

Task loadData "Load input data"
Task transform "Transform data" @checkpoint
Task validate "Validate output"
Task commit "Commit to database"
Task rollback "Rollback on error"

loadData -> transform -> validate
validate -> commit
validate -> rollback
```

```typescript
let checkpointId;

executor.on('node:enter', (nodeName) => {
    if (nodeName === 'transform') {
        checkpointId = executor.createCheckpoint('Before transform');
    }
});

executor.on('node:error', (nodeName, error) => {
    if (checkpointId) {
        console.log('Error detected - rolling back');
        executor.restoreCheckpoint(checkpointId);
    }
});
```

### Testing and Validation

Create test scenarios with known states.

```typescript
import { describe, it, expect } from 'vitest';

describe('Machine execution', () => {
    it('should handle error recovery', async () => {
        const executor = new MachineExecutor(machineData);

        // Execute to critical point
        await executor.runUntil('CriticalStep');
        const checkpoint = executor.createCheckpoint('Test checkpoint');

        // Test error scenario
        context.simulateError = true;
        await executor.run();
        expect(executor.getStatus()).toBe('failed');

        // Restore and test success scenario
        executor.restoreCheckpoint(checkpoint);
        context.simulateError = false;
        await executor.run();
        expect(executor.getStatus()).toBe('completed');
    });
});
```

## Best Practices

### When to Create Checkpoints

**✅ Good checkpoint locations:**
- Before risky or expensive operations
- Before branching logic
- Before external API calls
- At logical transaction boundaries
- Before user input or LLM invocations

**❌ Avoid checkpoints:**
- In tight loops (creates memory overhead)
- After every single step (use step counter instead)
- For trivial operations

### Checkpoint Naming

Use descriptive names for programmatic checkpoints:

```typescript
// ✅ Good: Descriptive
executor.createCheckpoint("Before API call to payment processor");
executor.createCheckpoint("User confirmed data - ready to commit");

// ❌ Bad: Generic
executor.createCheckpoint("checkpoint1");
executor.createCheckpoint("temp");
```

### Memory Management

Checkpoints are stored in memory and can grow large.

```typescript
// Configure max checkpoints
const stateManager = new StateManager(20); // Limit to 20 checkpoints

// Periodically clear old checkpoints
const stats = stateManager.getStats();
if (stats.totalSize > 1024 * 1024) { // Greater than 1MB
    const checkpoints = stateManager.listCheckpoints();
    const oldestId = checkpoints[0].id;
    stateManager.deleteCheckpoint(oldestId);
}
```

### Serialization for Long-term Storage

Don't rely on in-memory checkpoints for persistence.

```typescript
// ✅ Good: Serialize important checkpoints
const criticalCheckpoint = executor.createCheckpoint("Production deployment");
const serialized = stateManager.serializeCheckpoint(criticalCheckpoint);
await database.save('deployment-checkpoint', serialized);

// ❌ Bad: Assuming in-memory persistence
// executor.createCheckpoint("Important state"); // Lost on restart
```

### Testing with Checkpoints

Use checkpoints to create reproducible test scenarios.

```typescript
// Create test fixture checkpoint
const testExecutor = new MachineExecutor(machineData);
await testExecutor.runUntil('TestState');
const fixtureCheckpoint = testExecutor.createCheckpoint("Test fixture");
const fixtureJson = stateManager.serializeCheckpoint(fixtureCheckpoint);

// Save for test suite
await fs.writeFile('test/fixtures/test-state.json', fixtureJson);

// Use in tests
const fixture = await fs.readFile('test/fixtures/test-state.json', 'utf-8');
const checkpointId = stateManager.deserializeCheckpoint(fixture);
executor.restoreCheckpoint(checkpointId);
```

### Checkpoint Comparison for Debugging

Use comparison to understand execution changes.

```typescript
const before = executor.createCheckpoint("Before suspected issue");

// Execute problematic code
await executor.step();
await executor.step();

const after = executor.createCheckpoint("After suspected issue");

// Analyze what changed
const diff = stateManager.compareCheckpoints(before, after);
console.log('Debugging - what changed:');
console.log(diff);
```

## API Reference

### Executor Methods

```typescript
class MachineExecutor {
    // Create checkpoint
    createCheckpoint(description?: string): string;

    // Restore from checkpoint
    restoreCheckpoint(checkpointId: string): ExecutionCheckpoint | null;

    // Get state manager
    getStateManager(): StateManager;
}
```

### StateManager Methods

```typescript
class StateManager {
    constructor(maxCheckpoints?: number);

    // Checkpoint operations
    createCheckpoint(
        machineData: MachineJSON,
        paths: ExecutionPath[],
        sharedContext: Record<string, any>,
        stepCount: number,
        description?: string
    ): string;

    restoreCheckpoint(checkpointId: string): ExecutionCheckpoint | null;

    // Metadata operations
    getCheckpointMetadata(checkpointId: string): CheckpointMetadata | null;
    listCheckpoints(): CheckpointMetadata[];

    // Management
    deleteCheckpoint(checkpointId: string): boolean;
    clearCheckpoints(): void;

    // Serialization
    serializeCheckpoint(checkpointId: string): string | null;
    deserializeCheckpoint(json: string): string | null;
    exportAllCheckpoints(): string;
    importCheckpoints(json: string): number;

    // Analysis
    compareCheckpoints(id1: string, id2: string): CheckpointDiff | null;
    getStats(): CheckpointStats;
}
```

### Types

```typescript
interface ExecutionCheckpoint {
    id: string;
    timestamp: string;
    machineData: MachineJSON;
    paths: ExecutionPath[];
    sharedContext: Record<string, any>;
    metadata: {
        stepCount: number;
        description?: string;
    };
}

interface CheckpointMetadata {
    id: string;
    timestamp: string;
    stepCount: number;
    description?: string;
}

interface CheckpointDiff {
    pathChanges: string[];
    contextChanges: string[];
    stepDifference: number;
}

interface CheckpointStats {
    totalCheckpoints: number;
    oldestCheckpoint?: string;
    newestCheckpoint?: string;
    totalSize: number;
}
```

## Summary

DyGram's checkpoint system provides:

1. **State Capture** - Snapshot execution state at any point
2. **Time Travel** - Restore to previous states
3. **Persistence** - Serialize/deserialize checkpoints to JSON
4. **Branching** - Create multiple execution paths from one state
5. **Debugging** - Analyze execution changes over time
6. **Testing** - Create reproducible test scenarios

Use checkpoints strategically to create resilient, debuggable, and testable workflows.
