# Multi-Path Execution: Current Status and Implementation Gap

## Summary

**Status**: Infrastructure exists but **not yet implemented** in the execution flow.

The codebase has all the building blocks for multi-path/parallel execution (PathManager, annotation processing, synchronization primitives), but the RailsExecutor currently only executes a **single path**. The visualizer component can display multiple paths, but the executor never creates them.

## Current Implementation

### What Exists (Infrastructure)

1. **PathManager** (`src/language/execution/path-manager.ts`)
   - `createPath(startNode)` - Creates new execution paths
   - `getActivePaths()` - Retrieves active paths
   - `recordTransition()` - Tracks path history
   - `updatePathStatus()` - Manages path lifecycle
   - Full path state tracking (history, invocation counts, status)

2. **AnnotationProcessor** (`src/language/execution/annotation-processor.ts`)
   - Recognizes `@parallel` edge annotation
   - Recognizes `@concurrent(N)` machine annotation
   - Parses and validates all parallel-related syntax

3. **TransitionManager** (`src/language/execution/transition-manager.ts`)
   - `hasParallelAnnotation(edge)` - Detects @parallel edges
   - Edge annotation extraction and processing

4. **SynchronizationManager** (`src/language/execution/synchronization-manager.ts`)
   - Barrier support for path coordination
   - Wait/release mechanisms for multi-path sync

5. **ContextManager** (`src/language/execution/context-manager.ts`)
   - Context locking for concurrent writes
   - Permission-based access control
   - Version tracking for optimistic concurrency

### What's Missing (Execution Logic)

The **RailsExecutor** only executes a single path:

```typescript
// Current implementation in rails-executor.ts:879
async step(): Promise<boolean> {
    const nodeName = this.context.currentNode;  // ❌ Single path only

    if (!nodeName) {
        return false;
    }

    // ... all logic works with this.context (single execution context)
    // ... never creates or manages multiple paths
}
```

**Key Missing Pieces:**

1. **No path creation on @parallel edges**
   - When encountering `A -[@parallel]-> B, C`, should create two paths
   - Currently just transitions to first target

2. **No multi-path execution loop**
   - `step()` should iterate over `pathManager.getActivePaths()`
   - Execute each active path concurrently or sequentially
   - Handle path completion, merging, and synchronization

3. **No fork/join logic**
   - Should create paths when forking
   - Should synchronize at barriers
   - Should merge paths when appropriate

4. **No concurrent start node support**
   - Multiple start nodes should create multiple initial paths
   - Currently only supports single start node

## The Gap

### Current Execution Flow

```
┌─────────────────────────────────────┐
│ RailsExecutor.step()               │
│                                     │
│  1. Get this.context.currentNode   │ ← Single path
│  2. Evaluate transitions            │
│  3. Transition to next node         │
│  4. Update this.context             │ ← Single context
│                                     │
│  PathManager is NEVER used          │ ❌
└─────────────────────────────────────┘
```

### Required Execution Flow

```
┌────────────────────────────────────────────┐
│ RailsExecutor.step()                      │
│                                            │
│  1. Get pathManager.getActivePaths()      │ ← Multi-path
│  2. For each active path:                 │
│     a. Get path.currentNode               │
│     b. Evaluate transitions               │
│     c. If @parallel edge:                 │
│        - Create new paths for each target │ ✓
│     d. Update path context                │
│  3. Check synchronization barriers        │ ✓
│  4. Merge completed paths if needed       │ ✓
│                                            │
└────────────────────────────────────────────┘
```

## Code Evidence

### PathManager is initialized but never used

```typescript
// rails-executor.ts:149
this.pathManager = new PathManager(this.limits.maxSteps, this.limits.maxNodeInvocations);

// But nowhere in the codebase is pathManager.createPath() called!
// Search results show:
// - Definition: path-manager.ts:32
// - Usage: NONE ❌
```

### @parallel annotation is parsed but never acted upon

```typescript
// annotation-processor.ts:145
case 'parallel': {
    result.parallel = true;  // Parsed ✓
    break;
}

// transition-manager.ts:93
hasParallelAnnotation(edge: AnnotatedEdge): boolean {
    return edge.annotations.some(a => a.name === 'parallel');  // Detected ✓
}

// But nowhere is this used to create multiple paths! ❌
```

## Planned Implementation (from docs/development/execution-model-redesign.md)

### Phase 1: Core Refactoring and Concurrency Foundation
- **Parallel path execution loop** - Iterate over active paths
- **PathManager integration** - Create/manage multiple paths
- **Fork logic** - Create paths on @parallel edges
- **Concurrent execution** - Process paths in parallel

### Phase 2: Enhanced Semantics and Synchronization
- **@parallel edge support** - Fork execution on annotated edges
- **@concurrent(N) machine annotation** - Limit concurrent paths
- **Barrier synchronization** - Wait for multiple paths to reach same point

### Phase 3: Production Features
- **Resource limits** - Concurrent path limits, memory management
- **Path visualization** - Real-time multi-path UI (already done! ✓)

## What Would Enable Multi-Path Execution

### Minimal Implementation (Single-Path Fork)

Modify `RailsExecutor.step()` to detect @parallel and fork:

```typescript
async step(): Promise<boolean> {
    const nodeName = this.context.currentNode;

    // ... existing checks ...

    // NEW: Check for parallel transitions
    const outboundEdges = this.getOutboundEdges(nodeName);
    const parallelEdges = outboundEdges.filter(e =>
        this.transitionManager?.hasParallelAnnotation(e)
    );

    if (parallelEdges.length > 0) {
        // Fork execution: create a path for each parallel edge
        for (const edge of parallelEdges) {
            const pathId = this.pathManager?.createPath(edge.target);
            console.log(`Created parallel path ${pathId} to ${edge.target}`);
        }

        // Current path completes or waits
        this.context.currentNode = '';
        return false;
    }

    // ... existing transition logic ...
}
```

### Full Implementation (Multi-Path Execution Loop)

Replace single-path execution with multi-path loop:

```typescript
async step(): Promise<boolean> {
    // Get all active paths
    const activePaths = this.pathManager?.getActivePaths() || [];

    // If no paths, use legacy single-path mode
    if (activePaths.length === 0) {
        return this.stepSinglePath();  // Current implementation
    }

    // Execute each active path
    for (const path of activePaths) {
        const nodeName = path.currentNode;

        // ... evaluate transitions for this path ...

        // If @parallel edge, create new paths
        if (hasParallelTransitions) {
            for (const target of parallelTargets) {
                this.pathManager.createPath(target);
            }
        }

        // Update path state
        this.pathManager.recordTransition(path.id, nodeName, nextNode, 'transition');
    }

    // Check if any paths are still active
    return this.pathManager.hasActivePaths();
}
```

## Impact on Visualizer

The **ExecutionStateVisualizer** component (just created) is **already prepared** for multi-path:

```typescript
// ExecutionStateVisualizer.tsx:78
if (managers?.path) {
    paths = managers.path.getActivePaths();  // ✓ Ready for multiple paths
}

// Shows each path with color coding
paths.forEach(path => {
    nodes.push({
        name: path.currentNode,
        pathId: path.id,
        isActive: path.status === 'active'
    });
});
```

**Result**: Once PathManager is used by executor, visualizer will immediately show multiple paths with no code changes needed!

## Conclusion

**Current State**:
- ✅ All infrastructure exists (PathManager, annotations, sync primitives)
- ✅ Visualizer supports multi-path display
- ❌ Executor never creates or manages multiple paths
- ❌ @parallel annotation has no effect on execution

**To Enable Multi-Path**:
1. Modify `RailsExecutor.step()` to detect @parallel edges
2. Call `pathManager.createPath()` when forking
3. Iterate over `pathManager.getActivePaths()` instead of single context
4. Handle path synchronization at barriers
5. Update context management for path-specific state

**Estimated Effort**:
- Minimal fork support (single split): ~2-4 hours
- Full multi-path execution loop: ~1-2 days
- Production-ready with sync/barriers: ~1 week

The infrastructure is excellent and well-designed. It just needs to be **wired into the execution flow**.
