# Meta Tools and Machine Updates

## Overview

This document describes how meta tools enable runtime machine definition updates in DyGram, based on deep investigation of the existing implementation.

## Architecture

### Component Flow

```
Agent (LLM)
    ↓ calls update_definition
EffectExecutor.handleToolUse()
    ↓ delegates to
MetaToolManager.updateDefinition()
    ↓ updates
    ├─→ _machineData (internal copy)
    ├─→ onMutation callback → MachineExecutor.mutations[]
    └─→ onMachineUpdate callback → MachineExecutor.currentState.machineSnapshot
        ↓ used by
ExecutionRuntime.step()
    ↓ reads from
state.machineSnapshot
```

### Key Files

| File | Responsibility |
|------|---------------|
| `src/language/meta-tool-manager.ts` | Manages meta tools, handles machine updates |
| `src/language/executor.ts` | Wires MetaToolManager, tracks mutations, provides callbacks |
| `src/language/execution/effect-executor.ts` | Routes tool calls to MetaToolManager |
| `src/language/execution/execution-runtime.ts` | Uses `state.machineSnapshot` for node/edge lookups |
| `src/language/execution/runtime-types.ts` | Defines `ExecutionState` with `machineSnapshot` |

## Implementation Details

### 1. MetaToolManager Initialization

**Location**: `src/language/executor.ts:94-113`

```typescript
// Initialize meta-tool manager with mutation tracking
this.metaToolManager = new MetaToolManager(
    machineJSON,
    (mutation: any) => {
        this.mutations.push(mutation);  // Track mutations
    }
);

// Set up internal machine update handler
this.metaToolManager.setMachineUpdateCallback((dsl: string, machineData: MachineJSON) => {
    // Update the machine snapshot in the current state
    this.currentState.machineSnapshot = machineData;

    // Call user callback if set
    if (this.machineUpdateCallback) {
        this.machineUpdateCallback(dsl);
    }
});
```

**Key Points**:
- MetaToolManager is constructed with the initial `machineJSON`
- Mutation callback pushes to `executor.mutations` array for tracking
- Update callback updates `currentState.machineSnapshot` for runtime use
- User callback (if set) receives the updated DSL string

### 2. Machine Update Flow

**Location**: `src/language/meta-tool-manager.ts:487-546`

When an agent calls `update_definition` tool:

```typescript
async updateDefinition(input: { machine: any; reason: string }): Promise<any> {
    // 1. Validate structure
    if (!machine.title || !Array.isArray(machine.nodes) || !Array.isArray(machine.edges)) {
        return { success: false, message: 'Invalid machine structure...' };
    }

    // 2. Update internal machine data
    const canonicalFields = ['title', 'attributes', 'annotations', 'nodes', 'edges', ...];
    canonicalFields.forEach(field => {
        (this._machineData as any)[field] = (updatedMachine as any)[field];
    });

    // 3. Generate DSL from updated JSON
    const { generateDSL } = await import('./generator/generator.js');
    const dsl = generateDSL(this._machineData);

    // 4. Record mutation event
    this.onMutation({
        type: 'modify_node',
        data: { mutationType: 'machine_updated', reason, machine: {...} }
    });

    // 5. Notify callback (updates currentState.machineSnapshot)
    if (this.onMachineUpdate) {
        this.onMachineUpdate(dsl, JSON.parse(JSON.stringify(this._machineData)));
    }

    return { success: true, dsl, summary: {...} };
}
```

### 3. Runtime Usage of Machine Snapshot

**Location**: `src/language/execution/execution-runtime.ts`

The execution runtime uses `state.machineSnapshot` for all machine definition lookups:

**Finding nodes** (line 186-189):
```typescript
const machineJSON = state.machineSnapshot;
const node = machineJSON.nodes.find(n => n.name === nodeName);
```

**Finding edges** (line 593):
```typescript
const edges = state.machineSnapshot.edges.filter(e => e.source === path.currentNode);
```

**Critical Insight**: Updates to `machineSnapshot` take effect on the **next step()** call, not immediately within the current node execution.

### 4. Execution State Structure

**Location**: `src/language/execution/runtime-types.ts:58-69`

```typescript
export interface ExecutionState {
    version: string;
    machineSnapshot: MachineJSON;     // Machine state at this point (immutable)
    paths: Path[];
    limits: ExecutionLimits;
    metadata: {
        stepCount: number;
        startTime: number;
        elapsedTime: number;
        errorCount: number;
    };
}
```

The `machineSnapshot` field is described as "Machine state at this point (immutable)", but it can be updated between steps via the callback mechanism.

## Timing and Scope of Updates

### When Updates Take Effect

1. **Immediate**: `MetaToolManager._machineData` is updated immediately
2. **Immediate**: Mutation is recorded in `executor.mutations[]`
3. **Immediate**: `currentState.machineSnapshot` is updated
4. **Next Step**: Runtime reads from `state.machineSnapshot` in next `step()` call

### What Gets Updated

When `update_definition` is called with a new machine structure:

✅ **Updated immediately**:
- Node definitions (names, types, attributes)
- Edge definitions (sources, targets, labels)
- Machine attributes
- Machine annotations

❌ **Not affected by update**:
- Current execution paths (paths in flight continue with original structure)
- Tool definitions already built for current node
- LLM conversation history

### Example Timeline

```
T0: Agent in node "analyzer" calls update_definition
    → MetaToolManager._machineData updated
    → currentState.machineSnapshot updated
    → Agent continues in "analyzer" with old tool list

T1: Agent completes "analyzer", transitions to next node
    → Runtime calls step()
    → step() reads from state.machineSnapshot (now has updated definition)
    → New node structure and edges are used

T2: If agent transitions to newly-added node
    → Node exists in machineSnapshot, execution proceeds normally
```

## Dynamic Tool Construction

Dynamic tools (created via `construct_tool`) follow a similar pattern but with immediate availability:

**Location**: `src/language/execution/effect-executor.ts:259-276`

```typescript
// After construct_tool succeeds
if (dynamicToolConstructed && this.metaToolManager) {
    const dynamicTools = this.metaToolManager.getDynamicToolDefinitions();
    // Merge dynamic tools with existing tools
    for (const dynamicTool of dynamicTools) {
        if (!existingToolNames.has(dynamicTool.name)) {
            tools.push(dynamicTool);  // Add to current conversation's tool list
        }
    }
}
```

**Key Difference**: Unlike machine definition updates, dynamic tools are added to the current node's tool list immediately, allowing the agent to use them in the same conversation.

## Callbacks and Notifications

### 1. Mutation Callback

**Set by**: `MachineExecutor` constructor (line 94-98)
**Called when**: Any meta tool modifies the machine
**Purpose**: Track all mutations in `executor.mutations[]`

### 2. Machine Update Callback (Internal)

**Set by**: `MachineExecutor` constructor (line 102-110)
**Called when**: `update_definition` succeeds
**Purpose**: Update `currentState.machineSnapshot` for runtime use

### 3. User Machine Update Callback

**Set by**: `executor.setMachineUpdateCallback(callback)`
**Called when**: `update_definition` succeeds (chained from internal callback)
**Purpose**: Notify external systems (playground, CLI) of DSL changes

**Example (Playground)**:
```typescript
executor.setMachineUpdateCallback((dsl: string) => {
    // Update Monaco editor with new DSL source
    editor.setValue(dsl);
    // Regenerate diagram
    updateDiagram();
});
```

## Testing

### Test Coverage

**Location**: `test/integration/meta-machine-manipulation.test.ts`

Existing tests verify:
- ✅ `get_machine_definition` returns JSON and DSL
- ✅ `update_definition` updates machine data
- ✅ `update_definition` triggers callbacks
- ✅ `update_definition` records mutations
- ✅ Invalid updates are rejected

### Missing Test Coverage

⚠️ **Not currently tested**:
- Execution continuing after machine update
- Transitioning to newly-added nodes
- Removing nodes/edges during execution
- Concurrent updates from multiple paths
- Edge cases: updating while in the updated node

## Limitations and Caveats

### 1. No Retroactive Updates

Once a node begins execution, updating the machine definition does not:
- Change the current node's structure
- Update the tool list for ongoing LLM conversations
- Affect transitions already evaluated

### 2. Path Isolation

Each execution path maintains its position in the machine graph. If a node is removed that an active path is in, the behavior is undefined (untested).

### 3. No Transactional Updates

Machine updates are immediate and cannot be rolled back. If an update causes execution to fail, the machine remains in the updated state.

### 4. Snapshot Copying

The `machineSnapshot` is updated by reference, not deep cloned per step. This means:
- All paths share the same `machineSnapshot` reference
- Updates are visible across all paths immediately
- No history of previous machine states (except in mutations array)

## Best Practices

### 1. Update Before Transition

Agents should call `update_definition` before transitioning to new nodes:

```
✅ Good:
  analyzer: calls update_definition to add "optimizer" node
  analyzer: transitions to optimizer
  optimizer: exists and executes normally

❌ Bad:
  analyzer: transitions to "optimizer" (doesn't exist yet)
  → Error: Node not found
```

### 2. Validate Before Update

Always call `get_machine_definition` before `update_definition`:

```typescript
// 1. Get current structure
const result = await get_machine_definition({ format: 'json' });
const machine = result.json;

// 2. Modify structure
machine.nodes.push({ name: 'newNode', type: 'Task', ... });

// 3. Update
await update_definition({ machine, reason: 'Added newNode' });
```

### 3. Provide Descriptive Reasons

The `reason` field in `update_definition` is used for:
- Mutation tracking
- Debugging
- Execution logs

Be specific: "Added retry handler for API timeouts" not "Updated machine"

### 4. Handle Update Failures

`update_definition` can fail with validation errors:

```typescript
const result = await update_definition({ machine, reason });
if (!result.success) {
    // Handle error: result.message contains details
    // Machine remains in previous state
}
```

## Future Enhancements

### Proposed Improvements

1. **Versioned Snapshots**: Keep history of machine states
2. **Transactional Updates**: Allow rollback on failure
3. **Path-Local Updates**: Updates that only affect specific paths
4. **Update Validation**: Pre-flight checks before applying updates
5. **Migration Paths**: Handle active paths when structure changes
6. **Checkpoint Integration**: Save machine state at checkpoints

### Research Questions

- Should updates create a new execution branch?
- How should concurrent updates from multiple paths be handled?
- Should there be a "preview" mode for updates?
- Can updates be scoped to specific execution contexts?

## Related Documentation

- **User Guide**: `docs/archived/guides/meta-programming.md` (outdated)
- **Tests**: `test/integration/meta-machine-manipulation.test.ts`
- **Examples**: `examples/meta-tools/` (if exists)

## Summary

Meta tools enable runtime machine modification through:

1. **MetaToolManager** holds and updates machine definition
2. **Callbacks** propagate updates to executor and user code
3. **machineSnapshot** in execution state provides runtime access
4. **Next-step effect**: Updates take effect on next `step()` call
5. **Dynamic tools** available immediately (different from machine updates)

The system is well-architected for self-modifying machines, with clear separation between machine definition management (MetaToolManager) and execution (Runtime). The callback mechanism provides flexibility for different environments (playground, CLI) to respond to updates appropriately.
