# Context Write Implementation Missing

## Critical Finding

During investigation of runtime diagram visualization, discovered that **context writes are not implemented**.

**Location**: `src/language/execution/effect-executor.ts:365-372`

```typescript
// Context write
if (toolName.startsWith('write_')) {
    // TODO: Implement context writing (needs state mutation)
    return {
        success: true,
        context: toolName.replace('write_', ''),
        written: Object.keys(input.data || {})
    };
}
```

## Impact

This explains ALL the visualization issues:

1. **Diagrams show static values** ✗
   - Context writes succeed but don't actually update state
   - Diagram reads from static machine definition
   - No runtime values to display

2. **ExecutionState has no context** ✗
   - Context values never stored anywhere
   - No path-local context
   - No global context map

3. **VisualizationState incomplete** ✗
   - Can't show runtime context values
   - Only shows structural state (nodes, paths)

## Current Architecture Gap

### What Exists
- ✅ Context nodes defined in machine (structure)
- ✅ `write_contextName` tools generated
- ✅ Agents can call write tools
- ✅ Tools return success

### What's Missing
- ❌ Context value storage in ExecutionState
- ❌ Context value storage in Path
- ❌ Context mutation during execution
- ❌ Context value retrieval for reads
- ❌ Context propagation to diagram

## Architecture Questions

### Where should context be stored?

**Option 1: Global in ExecutionState**
```typescript
interface ExecutionState {
    ...
    globalContext: Map<string, Map<string, any>>;  // contextName -> attributes
}
```
✅ Simple
❌ Not path-specific
❌ Concurrency issues with multiple paths

**Option 2: Path-local**
```typescript
interface Path {
    ...
    context: Map<string, Map<string, any>>;  // contextName -> attributes
}
```
✅ Path-specific
✅ Supports concurrent execution
❌ More complex to merge for visualization

**Option 3: Hybrid**
```typescript
interface ExecutionState {
    globalContext: Map<string, Map<string, any>>;  // Shared contexts
    ...
}

interface Path {
    localContext: Map<string, Map<string, any>>;   // Path-specific
}
```
✅ Flexible
❌ Complex merging logic
❌ Unclear semantics

### How should reads work?

**Option A: Tool-based** (current pattern)
```typescript
// Agent calls read_contextName tool
if (toolName.startsWith('read_')) {
    const contextName = toolName.replace('read_', '');
    return getContextValues(state, path, contextName);
}
```

**Option B: Implicit in prompts**
```typescript
// Context values interpolated in prompts
prompt: "Check if {{ Requirements.needsCustomTool }}"
// No explicit read tool needed
```

Currently: Both patterns exist but neither works!

### Should context be immutable or mutable?

**Immutable** (functional)
- Writes create new state
- Easy to checkpoint
- Easy to rollback
- More memory

**Mutable** (imperative)
- Writes modify in place
- Less memory
- Harder to checkpoint
- Current architecture leans this way

## Proposed Implementation

### Phase 1: Global Mutable Context (Simplest)

**1. Add context to ExecutionState**
```typescript
// runtime-types.ts
interface ExecutionState {
    version: string;
    machineSnapshot: MachineJSON;
    paths: Path[];
    limits: ExecutionLimits;
    metadata: { ... };
    globalContext: Map<string, Map<string, any>>;  // NEW
}
```

**2. Initialize context from machine**
```typescript
// execution-runtime.ts - when creating initial state
function createInitialState(machineJSON: MachineJSON): ExecutionState {
    const globalContext = new Map<string, Map<string, any>>();

    // Extract context nodes and their initial values
    for (const node of machineJSON.nodes) {
        if (node.type === 'Context') {
            const contextValues = new Map<string, any>();

            // Extract attribute values from node
            for (const attr of node.attributes || []) {
                contextValues.set(attr.name, attr.value);
            }

            globalContext.set(node.name, contextValues);
        }
    }

    return {
        ...
        globalContext
    };
}
```

**3. Implement write_contextName**
```typescript
// effect-executor.ts
if (toolName.startsWith('write_')) {
    const contextName = toolName.replace('write_', '');

    // Get current state (needs to be passed to effect executor)
    const contextValues = this.currentState.globalContext.get(contextName);

    if (!contextValues) {
        return {
            success: false,
            error: `Context '${contextName}' not found`
        };
    }

    // Update values
    for (const [key, value] of Object.entries(input.data || {})) {
        contextValues.set(key, value);
    }

    return {
        success: true,
        context: contextName,
        written: Object.keys(input.data || {})
    };
}
```

**4. Implement read_contextName**
```typescript
if (toolName.startsWith('read_')) {
    const contextName = toolName.replace('read_', '');
    const contextValues = this.currentState.globalContext.get(contextName);

    if (!contextValues) {
        return {
            success: false,
            error: `Context '${contextName}' not found`
        };
    }

    // Convert Map to object for agent
    const data: Record<string, any> = {};
    contextValues.forEach((value, key) => {
        data[key] = value;
    });

    return {
        success: true,
        context: contextName,
        data
    };
}
```

**5. Update RuntimeContext conversion**
```typescript
// graphviz-generator.ts
function executionStateToRuntimeContext(state: ExecutionState): RuntimeContext {
    ...

    // Extract context values from globalContext
    const attributes = new Map<string, any>();
    state.globalContext.forEach((contextValues, contextName) => {
        contextValues.forEach((value, attrName) => {
            // Flatten: "contextName.attrName" -> value
            attributes.set(`${contextName}.${attrName}`, value);
        });
    });

    return {
        currentNode: activePath.currentNode,
        errorCount: state.metadata.errorCount,
        visitedNodes,
        attributes,  // NOW HAS VALUES!
        ...
    };
}
```

### Phase 2: Path-local Context (Later)

After Phase 1 works:
- Add `localContext` to Path
- Implement isolation between paths
- Add merge strategy for visualization

## Dependencies

**This fix requires**:
1. Access to `currentState` in `EffectExecutor`
2. State mutation (not just effects)
3. Context initialization in runtime

**Current blocker**: EffectExecutor is stateless, only produces effects. Needs refactoring to have state access or needs new effect type for context mutation.

## Alternative: Context Effects

Instead of direct mutation, emit context mutation effects:

```typescript
interface ContextWriteEffect {
    type: 'context_write';
    contextName: string;
    data: Record<string, any>;
}

interface ContextReadEffect {
    type: 'context_read';
    contextName: string;
}
```

Runtime applies these effects to state. Keeps EffectExecutor pure.

## Recommendation

1. **Short term**: Document that context writes don't work
2. **Medium term**: Implement Phase 1 (global mutable context)
3. **Long term**: Implement Phase 2 (path-local context)

## Testing

Once implemented, test with:
```dy
context Counter {
    value: 0
}

task increment {
    prompt: "Add 1 to Counter.value"
}

increment -writes-> Counter
```

Expected:
- ✅ write_Counter succeeds AND stores value
- ✅ Diagram shows Counter.value: 1 after write
- ✅ read_Counter returns updated value

## Related Issues

- Diagram visualization showing static values
- Runtime state not reflecting agent changes
- Context reads returning undefined
