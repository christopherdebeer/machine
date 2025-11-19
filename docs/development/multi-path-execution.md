# Multi-Path Execution Model

**Status**: Implemented
**Date**: 2025-11-19
**Related**: Execution Runtime Refactor

---

## Overview

DyGram supports **true concurrent multi-path execution** where machines with multiple start nodes execute multiple independent paths simultaneously. This enables:

- **Parallel workflows** - Multiple entry points executing concurrently
- **Independent agents** - Separate execution contexts per path
- **Concurrent state inspection** - Visualize all paths simultaneously
- **Path coordination** - Barrier synchronization between paths (future)

---

## Start Node Detection

A node is considered a **start node** if it meets any of these criteria (in priority order):

### Priority 1: Named "Start"
```dygram
machine "Single Start"

state start "Entry Point"
state process "Processing"

start --> process
```

### Priority 2: @start Annotation
```dygram
machine "Multiple Starts"

state @start pathA "Path A Entry"
state @start pathB "Path B Entry"
state @start pathC "Path C Entry"
state merge "Convergence Point"

pathA --> merge
pathB --> merge
pathC --> merge
```

### Priority 3: No Incoming Edges (Entry Points)
```dygram
machine "Inferred Starts"

// Entry1 and Entry2 have no incoming edges
state entry1 "Entry Point 1"
state entry2 "Entry Point 2"
state middle "Middle State"
state end "End State"

entry1 --> middle
entry2 --> middle
middle --> end
```

**Note**: Explicit start nodes (named or annotated) take precedence over inferred entry points.

---

## Path Lifecycle

### Path States

Each path has one of these states:

| State | Description |
|-------|-------------|
| `active` | Currently executing, can transition |
| `waiting` | Waiting for external input (agent decision, barrier) |
| `completed` | Successfully reached terminal node |
| `failed` | Encountered error or limit exceeded |
| `cancelled` | Manually cancelled by user |

### Path Creation

Paths are created during initialization:

1. **Find all start nodes** (using priority rules above)
2. **Create one path per start node**
3. **Initialize each path** with:
   - Unique ID (`path_0`, `path_1`, etc.)
   - Current node (start node)
   - Empty history
   - Status: `active`
   - Step count: 0
   - Start time: current timestamp

### Path Execution

Each call to `step()` processes **all active paths concurrently**:

```typescript
// One step advances ALL paths
const result = await executor.step();

// Result includes effects from all paths
result.effects.forEach(effect => {
    if (effect.type === 'log') {
        console.log(`[${effect.category}] ${effect.message}`);
    }
});
```

### Path Completion

A path completes when:
- It reaches a **terminal node** (no outbound edges)
- It encounters an **error**
- It exceeds **execution limits**
- It is **manually cancelled**

The machine completes when **all paths** are no longer active.

---

## Execution State

### Path Data Structure

```typescript
interface Path {
    id: string;                              // Unique identifier
    currentNode: string;                     // Where this path is now
    status: PathStatus;                      // active | waiting | completed | failed
    history: Transition[];                   // Full transition history
    stepCount: number;                       // Steps taken by this path
    nodeInvocationCounts: Record<string, number>;  // Per-node visit counts
    stateTransitions: Array<{...}>;          // State change history
    startTime: number;                       // When this path started
}
```

### Execution State

```typescript
interface ExecutionState {
    version: string;                         // State schema version
    machineSnapshot: MachineJSON;            // Immutable machine definition
    paths: Path[];                           // ALL paths (active, completed, failed)
    limits: ExecutionLimits;                 // Resource constraints
    metadata: {
        stepCount: number;                   // Total steps (all paths)
        startTime: number;                   // Execution start
        elapsedTime: number;                 // Time elapsed
        errorCount: number;                  // Total errors
    };
}
```

**Key Design Principles**:
- ✅ **JSON-serializable** - No Maps, Sets, or functions
- ✅ **Immutable** - Never modified in place
- ✅ **Inspectable** - Full state visible for debugging
- ✅ **Versionable** - Schema version for evolution

---

## Visualization State

### Purpose

The `VisualizationState` provides a **multi-path-optimized view** for UIs and inspectors:

```typescript
interface VisualizationState {
    // Current positions (one per active path)
    currentNodes: Array<{
        pathId: string;
        nodeName: string;
    }>;

    // All paths (active, completed, failed)
    allPaths: Path[];

    // Active paths only
    activePaths: Path[];

    // Node states (aggregated across ALL paths)
    nodeStates: Record<string, {
        visitCount: number;           // Total visits from all paths
        lastVisited?: string;          // Most recent visit timestamp
        isActive: boolean;             // Any path currently here?
        activeInPaths: string[];       // Which paths are here now
        contextValues?: Record<string, any>;
    }>;

    // Metadata (global)
    stepCount: number;
    elapsedTime: number;
    errorCount: number;
    totalPaths: number;
    activePathCount: number;
    completedPathCount: number;
    failedPathCount: number;

    // Available transitions (per path)
    availableTransitions: Array<{
        pathId: string;                // Which path this is for
        fromNode: string;
        toNode: string;
        isAutomatic: boolean;
        condition?: string;
    }>;
}
```

### Visualization Examples

#### Example 1: Two Concurrent Paths

```dygram
machine "Parallel Processing"

state @start inputA "Input A"
state @start inputB "Input B"
state processA "Process A"
state processB "Process B"
state merge "Merge Results"

inputA --> processA --> merge
inputB --> processB --> merge
```

**After 1 Step**:
```typescript
vizState.currentNodes = [
    { pathId: 'path_0', nodeName: 'processA' },
    { pathId: 'path_1', nodeName: 'processB' }
];

vizState.nodeStates['processA'] = {
    visitCount: 1,
    isActive: true,
    activeInPaths: ['path_0']
};

vizState.nodeStates['processB'] = {
    visitCount: 1,
    isActive: true,
    activeInPaths: ['path_1']
};
```

#### Example 2: Paths Converging

```dygram
machine "Converging Paths"

state @start start1
state @start start2
state shared "Shared Node"
state end

start1 --> shared --> end
start2 --> shared
```

**After Convergence**:
```typescript
vizState.nodeStates['shared'] = {
    visitCount: 2,              // Both paths visited
    isActive: true,
    activeInPaths: ['path_0', 'path_1'],  // Both paths here now
    lastVisited: '2025-11-19T13:45:32Z'
};
```

---

## Use Cases

### Parallel Workflows

Execute independent workflows concurrently:

```dygram
machine "Multi-Agent System"

task @start agentA "Research Agent" {
    prompt: "Research topic A"
}

task @start agentB "Research Agent" {
    prompt: "Research topic B"
}

task @start agentC "Research Agent" {
    prompt: "Research topic C"
}

context results "Aggregated Results"

agentA -writes-> results
agentB -writes-> results
agentC -writes-> results

task synthesis "Synthesize All Results" {
    prompt: "Combine research from all agents"
}

results -reads-> synthesis
```

**Execution**:
- 3 paths start simultaneously
- Each agent executes independently
- All write to shared context
- Synthesis task waits for all agents (barrier pattern)

### Pipeline Stages

Multiple inputs processing through shared stages:

```dygram
machine "Data Pipeline"

state @start input1 "Input Source 1"
state @start input2 "Input Source 2"
state @start input3 "Input Source 3"

task validate "Validation Stage" {
    prompt: "Validate input data"
}

task transform "Transform Stage" {
    prompt: "Transform data"
}

task output "Output Stage"

input1 --> validate --> transform --> output
input2 --> validate
input3 --> validate
```

**Execution**:
- 3 inputs start simultaneously
- All flow through same validation/transform stages
- Node visit counts show processing volume
- Individual path histories track data lineage

---

## Path Coordination (Future)

### Barriers

Wait for all paths to reach a synchronization point:

```dygram
machine "Barrier Sync"

state @start pathA
state @start pathB
state @barrier sync "Wait for All"
state continue "Continue Together"

pathA --> sync --> continue
pathB --> sync
```

**Behavior**:
- Path A reaches sync → status becomes `waiting`
- Path B reaches sync → both paths released
- Both paths continue from `continue` node

### Message Passing

Paths can communicate via channels:

```dygram
machine "Inter-Path Communication"

task @start sender "Send Message" {
    prompt: "Generate message"
}

task @start receiver "Receive Message" {
    prompt: "Wait for and process message"
}

channel messages

sender -sends-> messages
messages -delivers-> receiver
```

---

## Implementation Notes

### Step Execution

The `step()` function processes all active paths:

```typescript
function step(state: ExecutionState): ExecutionResult {
    const activePaths = getActivePaths(state);

    if (activePaths.length === 0) {
        return { status: 'complete', ... };
    }

    // Process each active path
    let nextState = state;
    for (const path of activePaths) {
        const result = stepPath(nextState, path.id);
        nextState = result.nextState;
        effects.push(...result.effects);
    }

    return { nextState, effects, status };
}
```

### Path Independence

Each path maintains:
- **Independent history** - Transitions specific to this path
- **Independent step count** - Steps taken by this path
- **Independent invocation counts** - Per-node visit counts for this path
- **Independent status** - Can complete/fail independently

### State Aggregation

Visualization aggregates across paths:
- **Visit counts** - Sum of all path visits
- **Active nodes** - Union of current nodes from all paths
- **Timestamps** - Most recent across all paths

---

## Testing

Comprehensive tests in `test/integration/multi-path-execution.test.ts`:

- ✅ Multiple start nodes detection
- ✅ @start annotation support
- ✅ Entry point inference
- ✅ Concurrent path execution
- ✅ Asymmetric path completion
- ✅ Visualization state correctness
- ✅ Node visit aggregation
- ✅ Per-path transitions

---

## API Reference

### Executor Methods

```typescript
// Get current execution state
const state = executor.getState();

// Get visualization-optimized state
const vizState = executor.getVisualizationState();

// Access paths
state.paths.forEach(path => {
    console.log(`${path.id}: ${path.currentNode} (${path.status})`);
});

// Access active paths
const activePaths = state.paths.filter(p => p.status === 'active');

// Get path by ID
const path = state.paths.find(p => p.id === 'path_0');
```

### State Inspection

```typescript
// Check if specific path is at a node
const path0AtNode = state.paths[0].currentNode === 'nodeA';

// Get all nodes currently active
const activeNodes = vizState.currentNodes.map(cn => cn.nodeName);

// Check if node is active in any path
const isActive = vizState.nodeStates['nodeA'].isActive;

// Get which paths are at a node
const pathsAtNode = vizState.nodeStates['nodeA'].activeInPaths;
```

---

## Performance Considerations

### Concurrent Processing

- Each `step()` processes all active paths in sequence (not parallel)
- Paths share machine state (read-only)
- Path state updates are immutable (no conflicts)
- Effects from all paths collected and returned together

### Scalability

- **Path overhead**: ~200 bytes per path
- **History overhead**: ~100 bytes per transition
- **Recommended limit**: less than 100 concurrent paths
- **Monitor**: `vizState.activePathCount`

### Optimization

For very large path counts:
- Implement path pooling
- Lazy history evaluation
- Selective visualization updates
- Path pruning strategies

---

## Related Documentation

- [Execution Runtime Refactor](./execution-refactor-analysis.md)
- [Execution Model Redesign](./execution-model-redesign.md)
- [Runtime Execution Examples](../examples/runtime-execution.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-19
**Implemented**: ✅ Yes
