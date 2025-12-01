# Meta-Programming Runtime Behavior Analysis

**Date**: 2025-11-30
**Status**: Analysis Complete, Fix Pending

## Issue Report

During execution, the runtime visualization shows the updated machine (with new tool nodes from meta operations), but after execution completes, the editor reverts to the original machine definition.

## Root Cause Analysis

### Current Behavior

1. **During Execution**:
   - Meta tools (e.g., `construct_tool`) modify the machine definition
   - `MetaToolManager.onMachineUpdate(dsl, machineData)` is called
   - Executor updates `currentState.machineSnapshot` with new machine data
   - Runtime visualization correctly displays the updated machine
   - ✅ **New nodes/edges ARE immediately available to the executor**

2. **After Execution Completes**:
   - Executor holds the updated machine in `currentState.machineSnapshot`
   - BUT: Playground doesn't capture the updated DSL
   - Editor still shows original source code
   - ❌ **Machine updates are lost when execution ends**

### Why New Nodes/Edges ARE Available During Execution

The execution runtime uses `state.machineSnapshot` for all operations:

**File**: `src/language/execution/execution-runtime.ts:186`
```typescript
function step(state: ExecutionState): StepResult {
    // ...
    const machineJSON = state.machineSnapshot;  // ← Uses snapshot!

    // All operations use machineJSON from snapshot:
    const node = machineJSON.nodes.find(n => n.name === nodeName);
    const autoTransition = evaluateAutomatedTransitions(machineJSON, nextState, pathId);
    const parallelEdges = getParallelEdges(machineJSON, nodeName);
    // etc.
}
```

This means:
- ✅ New tool nodes are immediately available for use
- ✅ New state nodes can be transitioned to
- ✅ New edges are followed during execution
- ✅ Context nodes created dynamically are accessible

**Example Flow**:
```
Step 1: Agent calls construct_tool("fibonacci")
    ↓
    Tool node added to state.machineSnapshot
    ↓
Step 2: Agent can immediately use "fibonacci" tool
    ↓
    Executor finds tool in state.machineSnapshot.nodes
    ↓
    Tool executes successfully
```

## Infrastructure Analysis

### Executor Machine Update Flow

**File**: `src/language/executor.ts`

```typescript
constructor(machineJSON: MachineJSON, config: MachineExecutorConfig = {}) {
    // ...

    // Internal machine update handler
    this.metaToolManager.setMachineUpdateCallback((dsl: string, machineData: MachineJSON) => {
        // 1. Update snapshot (for runtime use)
        this.currentState.machineSnapshot = machineData;

        // 2. Call user callback (for UI/persistence)
        if (this.machineUpdateCallback) {
            this.machineUpdateCallback(dsl);  // ← This is the missing link!
        }
    });
}

// Public API to set callback
setMachineUpdateCallback(callback: (dsl: string) => void): void {
    this.machineUpdateCallback = callback;
}
```

### Playground Missing Callback Setup

**File**: `src/components/CodeMirrorPlayground.tsx:1517-1543`

```typescript
const handleExecute = useCallback(async () => {
    // ...

    // Create executor
    exec = await MachineExecutor.create(machineJSON, { llm: {...} });

    setExecutor(exec);

    // ✅ Sets state change callback (for visualization)
    if (typeof exec.setOnStateChangeCallback === 'function') {
        exec.setOnStateChangeCallback(() => {
            updateRuntimeVisualization(exec);
        });
    }

    // ❌ MISSING: Machine update callback (for editor source)
    // Should be:
    // exec.setMachineUpdateCallback((dsl: string) => {
    //     setSource(dsl);  // Update editor
    //     setCurrentMachineData(exec.getMachineDefinition());  // Update data
    // });

    // Execute machine
    await exec.execute();

    // Final update
    await updateRuntimeVisualization(exec);
}, [...]);
```

## Fix Strategy

### Required Changes

1. **Add Machine Update Callback in Playground** (`src/components/CodeMirrorPlayground.tsx`):
   ```typescript
   // After creating executor
   exec.setMachineUpdateCallback((dsl: string) => {
       console.log('[Playground] Machine updated via meta-programming:', dsl);
       setSource(dsl);  // Update editor source
       setCurrentMachineData(exec.getMachineDefinition());  // Update machine data
   });
   ```

2. **Same Fix for Monaco Playground** (`src/components/MonacoPlayground.tsx`):
   - Apply identical changes

3. **Update CLI** (`src/cli/main.ts`):
   - Set callback to save updated DSL to file (if --save flag?)
   - Or output updated machine to stdout

### Benefits After Fix

1. ✅ **Persistence**: Machine updates persist after execution
2. ✅ **Inspectability**: Users can see what the machine evolved into
3. ✅ **Editability**: Users can manually edit the evolved machine
4. ✅ **Shareability**: Evolved machines can be saved and shared
5. ✅ **Debugging**: Clear what changes meta-programming made

### Testing Plan

1. Create machine with meta task that constructs a tool
2. Execute machine
3. Verify:
   - ✅ Tool is usable during same execution
   - ✅ Editor source updates to show tool node
   - ✅ Re-execution uses tool from definition (not recreating)
   - ✅ Saving evolved machine preserves tool

## Q&A

### Q: Are new nodes/edges created during execution available to the agent/executor?

**A**: ✅ **YES, immediately available!**

The executor uses `state.machineSnapshot` which is updated in real-time during execution. When meta tools modify the machine:

1. `state.machineSnapshot` is updated
2. All subsequent `step()` calls use the updated snapshot
3. New nodes/edges are immediately usable

**Example**: If step 5 creates a new tool node, step 6 can use that tool.

### Q: Why does the machine revert after execution?

**A**: ❌ **Missing callback in playground**

The executor correctly maintains the updated machine in memory, but the playground doesn't capture it because `setMachineUpdateCallback` is never called. After execution:

- Executor has updated machine in `currentState.machineSnapshot`
- Playground still has original source in editor
- No persistence mechanism to save updates

### Q: Can I manually access the updated machine after execution?

**A**: ✅ **YES, via executor API**

```typescript
// After execution completes
const updatedMachineData = executor.getMachineDefinition();
const updatedDSL = generateDSL(updatedMachineData);
console.log(updatedDSL);  // See evolved machine
```

But this requires manual code - the fix should do this automatically.

## Implementation Priority

**Priority**: HIGH

This is a core feature of meta-programming. Without proper machine update capture:
- Users lose all meta-programming changes
- Meta-programming appears "broken" to users
- Defeats the purpose of the meta-programming vision

## Related Documentation

- [Meta-Programming Architecture Analysis](./meta-programming-architecture-analysis.md)
- [Context Read/Write Implementation](./context-read-write-implementation.md)
- [Execution Visualization Runtime Issues](./execution-visualization-runtime-issues.md)
