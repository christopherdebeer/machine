# Execution Runtime Refactor - Deep Analysis

**Date**: 2025-11-19
**Purpose**: Prepare for major refactor to replace complex rails executor with a simpler non-inheritance based execution runtime

---

## Executive Summary

The current execution implementation uses a **class-based inheritance pattern** with significant complexity spread across:
- **BaseExecutor** (abstract base class with 469 lines)
- **RailsExecutor** (extends BaseExecutor, 1228 lines)
- **MachineExecutor** (deprecated, extends BaseExecutor, 1021 lines)
- **10+ Phase 1-3 manager classes** (modular execution concerns)

### Key Findings

1. **Inheritance is the primary complexity driver** - shared state and methods tightly couple execution logic
2. **Machine data is passed to constructors but modified in-place** - mutation tracking exists but isn't first-class
3. **Execution state is scattered** across `context`, `machineData`, `limits`, `mutations`, manager instances
4. **No clear separation** between machine definition (data) and execution runtime (behavior)
5. **Phase 1-3 managers are well-designed** but underutilized - they represent the future direction

### Refactor Goals

✅ **Operate on serialized machine JSON** - execution should consume and produce JSON, not mutate AST
✅ **Eliminate inheritance** - replace with composition/functional approach
✅ **Expose consistent execution state/context** - single source of truth for visualization/inspection
✅ **Encapsulate concerns** - clear boundaries between evaluation, transition, path management, etc.

---

## Current Architecture

### Inheritance Hierarchy

```
BaseExecutor (abstract)
├── RailsExecutor (recommended, 1228 lines)
└── MachineExecutor (deprecated, 1021 lines)
```

**BaseExecutor responsibilities** (src/language/base-executor.ts:68-468):
- Machine data storage (`machineData: MachineData`)
- Execution context (`context: MachineExecutionContext`)
- LLM client management (`llmClient: ClaudeClient`)
- Mutation tracking (`mutations: MachineMutation[]`)
- Execution limits (`limits: Required<ExecutionLimits>`)
- CEL evaluator (`celEvaluator: CelEvaluator`)
- Cycle detection, timeout checking, node invocation tracking
- Condition evaluation, template resolution, attribute parsing
- Abstract methods: `step()`, `execute()`

**Problems with this approach**:
1. **Tight coupling** - subclasses must understand all base class internals
2. **Mutation in place** - `machineData` is modified during execution (see rails-executor.ts:840-855)
3. **Mixed concerns** - evaluation, execution, LLM integration, safety all in one hierarchy
4. **Hard to test** - inheritance makes mocking and isolation difficult
5. **Shared mutable state** - context and machineData are shared references

### Phase 1-3 Managers (The Better Design)

Located in `src/language/execution/`, these are **composition-based, single-responsibility modules**:

**Phase 1 - Core Execution**:
- `EvaluationEngine` - condition evaluation, template resolution, attribute context
- `TransitionManager` - transition logic, state modules, annotations
- `ContextManager` - context node permissions, locking for multi-path
- `PathManager` - multi-path execution tracking

**Phase 2 - Enhanced Semantics**:
- `AnnotationProcessor` - parse @auto, @retry, @timeout, @checkpoint, etc.
- `EdgeTypeResolver` - semantic edge types (control, data, transform)
- `SynchronizationManager` - barriers, message passing between paths
- `ErrorHandlingManager` - fail-fast, continue, compensate strategies

**Phase 3 - Production Features**:
- `SafetyManager` - circuit breakers, timeouts, resource limits
- `StateManager` - checkpoints, replay, state serialization
- `ExecutionLogger` - structured logging with categories/levels

**Why these are better**:
- ✅ **No inheritance** - pure composition
- ✅ **Single responsibility** - each manager has one job
- ✅ **Immutable inputs** - managers don't mutate machine data (mostly)
- ✅ **Testable** - easy to mock and unit test
- ✅ **Reusable** - can be used independently

**Current problem**: RailsExecutor **instantiates but underutilizes** these managers (rails-executor.ts:145-171). They're initialized but most logic still lives in RailsExecutor itself.

---

## How Execution Currently Operates on Machine Data

### Data Flow

```
1. Constructor:
   MachineJSON → BaseExecutor constructor → this.machineData (filtered, stored)

2. Execution:
   this.machineData → evaluateAutomatedTransitions() → transition logic
                    → buildPhaseTools() → tool generation
                    → agentSDKBridge.invokeAgent() → LLM invocation
                    → executeTool() → machine mutation (in-place)

3. Mutation:
   Tool execution → modify this.machineData.nodes[].attributes
                  → recordMutation() → this.mutations[] (audit trail)

4. Output:
   execute() → returns execution context (not machine JSON)
   getMachineDefinition() → returns deep clone of this.machineData
```

### Key Issues

1. **In-place mutation** (rails-executor.ts:840-855):
```typescript
// Writing to context mutates machineData directly
Object.entries(input.data).forEach(([key, value]) => {
    const existingAttr = contextNode.attributes!.find(a => a.name === key);
    if (existingAttr) {
        existingAttr.value = String(value);  // ⚠️ MUTATION
    } else {
        contextNode.attributes!.push({...});  // ⚠️ MUTATION
    }
});
```

2. **No serialization boundary** - execution consumes live JS objects, not JSON
3. **Mutation tracking is separate** - `mutations[]` array tracks changes but doesn't drive state
4. **Context scattered** - execution state lives in multiple places:
   - `this.context` (current node, history, visited, attributes)
   - `this.machineData` (live machine definition)
   - `this.limits` (execution constraints)
   - `this.mutations` (change log)
   - Manager state (paths, locks, checkpoints)

---

## Execution State Management

### Current State Objects

**MachineExecutionContext** (base-executor.ts:17-35):
```typescript
interface MachineExecutionContext {
    currentNode: string;
    currentTaskNode?: string;
    activeState?: string;
    errorCount: number;
    visitedNodes: Set<string>;
    attributes: Map<string, any>;
    history: Array<{from, to, transition, timestamp, output}>;
    nodeInvocationCounts: Map<string, number>;
    stateTransitions: Array<{state, timestamp}>;
}
```

**ExecutionPath** (execution/types.ts:64-79):
```typescript
interface ExecutionPath {
    id: string;
    currentNode: string;
    history: Array<{...}>;
    status: PathState;
    stepCount: number;
    nodeInvocationCounts: Map<string, number>;
    stateTransitions: Array<{...}>;
    startTime: number;
}
```

**ExecutionCheckpoint** (execution/state-manager.ts:16-26):
```typescript
interface ExecutionCheckpoint {
    id: string;
    timestamp: string;
    machineData: MachineData;
    paths: ExecutionPath[];
    sharedContext: Record<string, any>;
    metadata: {stepCount, description};
}
```

### Problems

1. **Duplication** - `MachineExecutionContext` and `ExecutionPath` overlap significantly
2. **Inconsistent serialization** - Sets and Maps don't serialize to JSON cleanly
3. **No versioning** - checkpoint format has no version field for evolution
4. **Partial state** - `MachineExecutionContext` doesn't include limits, mutations, logger state
5. **Not visualization-friendly** - state is optimized for execution, not inspection

---

## Recommended Refactor Strategy

### Goal: Execution as a Pure Function

```typescript
// New paradigm:
interface ExecutionRuntime {
    // Execute one step
    step(
        machineJSON: MachineJSON,      // Input: immutable machine definition
        executionState: ExecutionState  // Input: immutable execution state
    ): ExecutionResult;                // Output: new state + effects

    // Execute until completion
    execute(
        machineJSON: MachineJSON,
        initialState?: ExecutionState
    ): ExecutionTrace;                 // Full execution history
}

// All state in one place
interface ExecutionState {
    version: string;                   // State schema version
    paths: Path[];                     // All execution paths
    machineSnapshot: MachineJSON;      // Machine state at this point
    limits: ExecutionLimits;           // Resource constraints
    metadata: {
        stepCount: number;
        startTime: number;
        elapsedTime: number;
    };
}

// Results are immutable
interface ExecutionResult {
    nextState: ExecutionState;         // New state (never mutate input)
    effects: Effect[];                 // Side effects (LLM calls, logs, etc.)
    status: 'continue' | 'complete' | 'error' | 'waiting';
}
```

### Architecture: Functional Core, Imperative Shell

```
┌─────────────────────────────────────┐
│   Imperative Shell (CLI, Browser)  │
│  - Handle LLM calls                 │
│  - Apply effects                    │
│  - Manage async                     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Functional Core (Pure)         │
│                                      │
│  ExecutionRuntime                   │
│  ├─ TransitionEvaluator             │
│  ├─ ConditionEvaluator              │
│  ├─ StateBuilder                    │
│  ├─ PathCoordinator                 │
│  └─ EffectBuilder                   │
│                                      │
│  All functions:                      │
│  (machineJSON, state) → result      │
└─────────────────────────────────────┘
```

### Key Principles

1. **Immutability** - never mutate inputs, always return new state
2. **Serialization first** - all state must round-trip through JSON
3. **Single state object** - `ExecutionState` is the only runtime state
4. **Effects are data** - describe side effects, don't perform them
5. **Composition over inheritance** - combine pure functions

### Phased Migration

**Phase A: Encapsulate Current System** (IMMEDIATE)
1. Create `ExecutionState` type that wraps all current state
2. Add `toJSON()` / `fromJSON()` methods to executors
3. Extract `buildExecutionState()` helper
4. Write serialization tests

**Phase B: Extract Pure Functions** (NEXT)
1. Move condition evaluation to pure function
2. Move transition evaluation to pure function
3. Move state building to pure function
4. Test each in isolation with JSON inputs

**Phase C: Build New Runtime** (FUTURE)
1. Implement `ExecutionRuntime` interface
2. Migrate Phase 1-3 managers to functional style
3. Build effect system for LLM calls, logs
4. Create adapter for old API compatibility

**Phase D: Migration** (FINAL)
1. Deprecate BaseExecutor hierarchy
2. Update all consumers to new runtime
3. Remove old code

---

## Encapsulation Checklist

### Immediate Actions (Before Refactor)

- [x] ✅ **Document current architecture** (this file)
- [ ] **Extract serialization functions**
  - [ ] `serializeExecutionState(executor): ExecutionState`
  - [ ] `deserializeExecutionState(state): MachineExecutionContext`
  - [ ] Add tests for round-trip serialization
- [ ] **Create unified state type**
  - [ ] Design `ExecutionState` interface
  - [ ] Include version field for evolution
  - [ ] Replace Sets/Maps with arrays/objects for JSON compat
- [ ] **Audit all mutations**
  - [ ] Find all places that modify `machineData` in place
  - [ ] Document mutation patterns
  - [ ] Plan immutable alternatives
- [ ] **Extract visualization state builder**
  - [ ] `buildVisualizationState(executor): VisualizationState`
  - [ ] Include: current node, path history, active states, context values
  - [ ] Make this the canonical state for UI/inspection

### Design Decisions Needed

1. **State versioning strategy** - how to evolve ExecutionState schema?
2. **Effect representation** - how to represent LLM calls, tool invocations?
3. **Multi-path execution** - keep PathManager design or simplify?
4. **Checkpoint compatibility** - migrate old checkpoints or break compatibility?
5. **API surface** - what methods must the new runtime expose?

---

## Specific Code Hotspots

### Files to Refactor First

1. **base-executor.ts:160-187** - `evaluateCondition()` - should be pure function
2. **base-executor.ts:225-235** - `resolveTemplateVariables()` - should be pure function
3. **rails-executor.ts:344-444** - `evaluateAutomatedTransitions()` - core logic, should be pure
4. **rails-executor.ts:820-873** - `handleWriteTool()` - mutates machineData in place
5. **rails-executor.ts:1051-1099** - `execute()` - main execution loop, needs redesign

### Files Already Good (Keep/Adapt)

1. **execution/evaluation-engine.ts** - mostly pure, good separation
2. **execution/path-manager.ts** - clean API, manages path state well
3. **execution/state-manager.ts** - checkpoint/restore is exactly what we need
4. **execution/types.ts** - good type definitions, need minor tweaks

### Files to Deprecate

1. **machine-executor.ts** - already deprecated, remove after migration
2. **base-executor.ts** - replaced by functional runtime

---

## Visualization & Inspection Requirements

For the refactor to succeed, execution state must be **inspection-friendly**:

### Required State for Visualization

```typescript
interface VisualizationState {
    // Current execution position
    currentNodes: string[];           // One per active path
    activePaths: {
        id: string;
        currentNode: string;
        status: PathState;
        history: Transition[];
    }[];

    // Machine state overlay
    nodeStates: Map<string, {
        visitCount: number;
        lastVisited?: string;          // ISO timestamp
        isActive: boolean;
        contextValues?: Record<string, any>;
    }>;

    // Execution metadata
    stepCount: number;
    elapsedTime: number;
    errors: ExecutionError[];

    // Interactive capabilities
    availableTransitions: {
        fromNode: string;
        toNode: string;
        isAutomatic: boolean;
        condition?: string;
    }[];
}
```

### Integration Points

The new runtime should expose:
- `runtime.getState(): ExecutionState` - full state for serialization
- `runtime.getVisualizationState(): VisualizationState` - UI-optimized state
- `runtime.subscribe(callback)` - event stream for real-time updates
- `runtime.checkpoint(): string` - create checkpoint, return ID
- `runtime.restore(id): void` - restore from checkpoint

---

## Migration Risk Assessment

### High Risk
- **Breaking API changes** - CLI, browser playground depend on current API
- **Checkpoint incompatibility** - existing checkpoints won't work
- **Performance regression** - immutability has overhead
- **LLM integration complexity** - async effects are hard to model

### Medium Risk
- **Multi-path execution** - most complex feature, easy to break
- **State module semantics** - nested state entry/exit is subtle
- **Agent SDK integration** - tightly coupled to current design

### Low Risk
- **Condition evaluation** - already uses CEL, easy to extract
- **Template resolution** - pure string transformation
- **Logging** - already modular via ExecutionLogger

---

## Success Metrics

The refactor is successful if:

1. ✅ **All execution operates on MachineJSON** - no AST/internal types
2. ✅ **ExecutionState is fully serializable** - round-trips through JSON.stringify/parse
3. ✅ **No inheritance** - runtime uses composition/functions only
4. ✅ **Execution is testable** - pure functions with JSON inputs
5. ✅ **Visualization is first-class** - state optimized for inspection
6. ✅ **Checkpoints are versioned** - can evolve state schema
7. ✅ **Performance is acceptable** - within 2x of current runtime
8. ✅ **Migration is gradual** - can run old and new side-by-side

---

## Next Steps

1. **Review this analysis** with stakeholders
2. **Design ExecutionState schema** - get agreement on structure
3. **Write serialization tests** - establish baseline for compatibility
4. **Extract first pure function** - start with `evaluateCondition()`
5. **Build effect system** - design how to represent LLM calls
6. **Prototype new runtime** - implement `step()` for simple machines
7. **Benchmark** - compare performance with current system
8. **Plan migration** - identify all consumers of current API

---

## Appendix: Current vs. Proposed

### Current: Inheritance + Mutation

```typescript
class RailsExecutor extends BaseExecutor {
    async step(): Promise<boolean> {
        // Mutates this.context
        this.context.currentNode = nextNode;
        this.context.history.push({...});

        // Mutates this.machineData
        contextNode.attributes!.push({...});

        // Scattered state
        const tools = this.buildPhaseTools(nodeName);
        const result = await this.agentSDKBridge.invokeAgent(...);

        return true;
    }
}
```

### Proposed: Functional + Immutability

```typescript
const runtime: ExecutionRuntime = {
    step(machineJSON, state) {
        // Pure evaluation
        const transitions = evaluateTransitions(machineJSON, state);

        // Build new state (immutable)
        const nextState = {
            ...state,
            paths: state.paths.map(path =>
                path.id === activePathId
                    ? { ...path, currentNode: nextNode, history: [...path.history, transition] }
                    : path
            )
        };

        // Describe effects (don't execute)
        const effects = transitions.requiresAgent
            ? [{ type: 'invoke_llm', prompt, tools }]
            : [];

        return { nextState, effects, status: 'continue' };
    }
};
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-19
**Reviewers**: (pending)
