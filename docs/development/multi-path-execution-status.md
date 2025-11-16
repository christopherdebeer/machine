# Multi-Path Execution: Implementation Status

**Last Updated**: 2025-01-16
**Status**: ✅ **Core multi-path execution IMPLEMENTED** (Phase 1 complete)

## Executive Summary

Multi-path execution is now **fully functional** for automated transitions. The executor automatically detects multiple entry points, creates execution paths, and handles `@parallel` edge forking. The visualizer displays all active paths with real-time updates.

**What Works Now**:
- ✅ Automatic multi-entry point detection
- ✅ Path creation for each start node
- ✅ Multi-path execution loop
- ✅ @parallel edge support (explicit forking)
- ✅ Path status tracking (active, completed, failed, waiting)
- ✅ Real-time visualization with color-coded paths
- ✅ Proper edge condition evaluation (not always true)
- ✅ JSON-based annotation reading (not label parsing)

**What's Outstanding**:
- ⏳ Agent decisions in multi-path mode
- ⏳ Path-specific context management
- ⏳ Synchronization barriers (@barrier annotation)
- ⏳ Path merging and join logic
- ⏳ @concurrent(N) machine-level concurrency limits
- ⏳ Shared context with locks for concurrent writes

---

## Implementation Status by Component

### ✅ IMPLEMENTED: Core Multi-Path Execution

#### 1. Automatic Entry Point Detection
**File**: `src/language/rails-executor.ts:initializePaths()`

```typescript
private initializePaths(): void {
    const startNodes = this.transitionManager.findStartNodes();

    if (startNodes.length === 1) {
        // Single entry: legacy mode
        this.context.currentNode = startNodes[0];
    } else {
        // Multiple entries: create paths
        for (const startNode of startNodes) {
            const pathId = this.pathManager.createPath(startNode);
        }
    }
}
```

**Detection Logic** (from `TransitionManager.findStartNodes()`):
1. Explicit `type: init` nodes
2. Named "start*" nodes (case-insensitive)
3. **Inferred**: Nodes with no incoming edges (excludes context/style)
4. Fallback: First non-context node

**Example Output**:
```
📍 Multiple entry points detected: 3 paths
  ✓ Created path path_1 at NodeA
  ✓ Created path path_2 at NodeB
  ✓ Created path path_3 at NodeC
```

#### 2. Multi-Path Execution Loop
**File**: `src/language/rails-executor.ts:stepMultiPath()`

Processes all active paths in each step:

```typescript
private async stepMultiPath(): Promise<boolean> {
    const activePaths = this.pathManager.getActivePaths();

    for (const path of activePaths) {
        // Check for @parallel edges (fork)
        const parallelEdges = outboundEdges.filter(e =>
            this.transitionManager?.hasParallelAnnotation(e)
        );

        if (parallelEdges.length > 0) {
            // Create new paths for forking
            for (const edge of parallelEdges) {
                this.pathManager.createPath(edge.target);
            }
            this.pathManager.updatePathStatus(path.id, 'completed');
            continue;
        }

        // Check for automated transitions
        const autoTransition = this.evaluateAutomatedTransitions(nodeName);
        if (autoTransition) {
            this.pathManager.recordTransition(...);
            pathObj.currentNode = autoTransition.target;
            continue;
        }

        // Handle agent decisions, terminals, etc.
    }
}
```

**Example Output**:
```
🔀 Step: 3 active path(s)

  📍 Path path_1: NodeA
    → NodeA2 (auto)

  📍 Path path_2: NodeB
    🔱 Forking at NodeB: 2 parallel paths
      ✓ Created parallel path path_4 to NodeB1
      ✓ Created parallel path path_5 to NodeB2
```

#### 3. @parallel Edge Support
**File**: `src/language/rails-executor.ts:stepMultiPath()`

Detects and processes `@parallel` annotations:

```typescript
const parallelEdges = outboundEdges.filter(e =>
    this.transitionManager?.hasParallelAnnotation(e)
);

if (parallelEdges.length > 0) {
    for (const edge of parallelEdges) {
        const newPathId = this.pathManager.createPath(edge.target);
    }
}
```

**Usage in DyGram**:
```dygram
Fork -[@parallel]-> PathA, PathB, PathC
```

#### 4. Fixed Visualizer
**File**: `src/components/ExecutionStateVisualizer.tsx`

**Before** (broken):
```typescript
// ❌ Parsed labels with regex
const annotations = label.match(/@\w+/g);
const canTransition = true; // Always true!
```

**After** (fixed):
```typescript
// ✅ Uses TransitionManager for structured data
const outgoingEdges = managers.transition.getOutboundEdges(currentNode);
const annotations = edge.annotations?.map(a => `@${a.name}`);
const canTransition = await exec.evaluateCondition(condition); // Real evaluation
```

**Changes**:
- Uses `TransitionManager.getOutboundEdges()` for annotated edges
- Reads `edge.annotations` (not regex parsing of labels)
- Calls `executor.evaluateCondition()` for proper CEL evaluation
- Made `BaseExecutor.evaluateCondition()` public for UI access

---

## Outstanding Work (Detailed)

### ⏳ 1. Agent Decisions in Multi-Path Mode

**Current State**: Agent nodes marked as "waiting" in multi-path
**File**: `src/language/rails-executor.ts:1191`

```typescript
if (this.requiresAgentDecision(nodeName)) {
    console.log(`🤖 Agent decision required (multi-path not yet supported)`);
    this.pathManager.updatePathStatus(path.id, 'waiting');
    continue;
}
```

**Required Changes**:

#### 1.1. Path-Specific Agent Context
Each path needs isolated agent invocation:

```typescript
// Build system prompt with path-specific context
const systemPrompt = this.buildSystemPrompt(nodeName, path.id);

// Invoke agent with path ID in metadata
const agentResponse = await this.invokeLLMAgent(systemPrompt, {
    pathId: path.id,
    pathContext: path.history
});
```

**File**: `src/language/rails-executor.ts`
**Estimated Effort**: 4-6 hours
**Dependencies**: Path-specific context management

#### 1.2. Path-Aware Tool Calls
Tools need to operate on specific path contexts:

```typescript
tools.push({
    name: `transition_to_${transition.target}`,
    description: `[Path ${path.id}] Transition to ${transition.target}`,
    input_schema: {
        type: 'object',
        properties: {
            pathId: { type: 'string', description: 'Execution path ID' }
        }
    }
});
```

**File**: `src/language/rails-executor.ts:buildPhaseTools()`
**Estimated Effort**: 2-3 hours
**Dependencies**: None

#### 1.3. Concurrent Agent Invocations
Support parallel agent calls (optional optimization):

```typescript
// Process agent nodes in parallel (with rate limiting)
const agentPaths = activePaths.filter(p => this.requiresAgentDecision(p.currentNode));

await Promise.all(
    agentPaths.map(path => this.processAgentDecision(path))
);
```

**File**: New file `src/language/execution/parallel-agent-executor.ts`
**Estimated Effort**: 6-8 hours
**Dependencies**: Rate limiting, resource management

---

### ⏳ 2. Path-Specific Context Management

**Current State**: All paths share `this.context.attributes`
**Problem**: Context mutations affect all paths

**Required Changes**:

#### 2.1. Per-Path Context Storage
Each path needs isolated context:

```typescript
// In ExecutionPath interface
interface ExecutionPath {
    id: string;
    currentNode: string;
    history: Array<...>;
    status: PathState;
    // NEW: Path-specific attributes
    attributes: Map<string, any>;  // ← Add this
    contextReads: Set<string>;     // ← Track reads
    contextWrites: Set<string>;    // ← Track writes
}
```

**File**: `src/language/execution/types.ts`
**Estimated Effort**: 2 hours
**Dependencies**: None

#### 2.2. Context Read/Write with Path ID
All context operations need path awareness:

```typescript
// Old: Global context
this.context.attributes.set('key', value);

// New: Path-specific context
const path = this.pathManager.getPath(pathId);
path.attributes.set('key', value);

// If shared context needed:
this.contextManager.write('contextName', 'key', value, pathId);
```

**File**: `src/language/rails-executor.ts`, `src/language/execution/context-manager.ts`
**Estimated Effort**: 6-8 hours
**Dependencies**: ContextManager locks

#### 2.3. Context Merge on Path Completion
When paths merge, reconcile contexts:

```typescript
mergePathContexts(paths: ExecutionPath[]): Map<string, any> {
    const merged = new Map<string, any>();

    for (const path of paths) {
        for (const [key, value] of path.attributes) {
            // Conflict resolution strategy
            if (merged.has(key) && merged.get(key) !== value) {
                // Use last-write-wins, or throw error, or custom resolver
                this.logger.warn('context', `Conflict on key ${key}`);
            }
            merged.set(key, value);
        }
    }

    return merged;
}
```

**File**: New method in `src/language/execution/path-manager.ts`
**Estimated Effort**: 4 hours
**Dependencies**: Merge strategy design

---

### ⏳ 3. Synchronization Barriers

**Current State**: SynchronizationManager exists but unused
**File**: `src/language/execution/synchronization-manager.ts`

**Required Changes**:

#### 3.1. Barrier Detection in stepMultiPath
Detect edges with `@barrier(name)`:

```typescript
// Check if current node is at a barrier
const barrierAnnotation = this.annotationProcessor.processEdgeAnnotations(
    edge.annotations
).barrier;

if (barrierAnnotation) {
    // Register this path at barrier
    this.synchronizationManager.arriveAtBarrier(barrierAnnotation, path.id);

    // Check if all paths have arrived
    if (this.synchronizationManager.canProceed(barrierAnnotation)) {
        // Release all waiting paths
        this.synchronizationManager.releaseBarrier(barrierAnnotation);
    } else {
        // Mark path as waiting
        this.pathManager.updatePathStatus(path.id, 'waiting');
    }
}
```

**File**: `src/language/rails-executor.ts:stepMultiPath()`
**Estimated Effort**: 4-6 hours
**Dependencies**: Barrier naming scheme

#### 3.2. Barrier Wait Logic
Paths wait until all participants arrive:

```typescript
// In SynchronizationManager
arriveAtBarrier(barrierName: string, pathId: string) {
    if (!this.barriers.has(barrierName)) {
        this.barriers.set(barrierName, new Set());
    }
    this.barriers.get(barrierName)!.add(pathId);
}

canProceed(barrierName: string): boolean {
    const barrier = this.barriers.get(barrierName);
    const expectedPaths = this.getExpectedPathsForBarrier(barrierName);
    return barrier && barrier.size === expectedPaths.size;
}
```

**File**: `src/language/execution/synchronization-manager.ts`
**Estimated Effort**: 3-4 hours
**Dependencies**: Path tracking

#### 3.3. Barrier Configuration
Support both implicit and explicit barriers:

```dygram
// Implicit: all paths from Fork must reach Merge
Fork -[@parallel]-> PathA, PathB
PathA --> Merge @barrier("join1")
PathB --> Merge @barrier("join1")

// Explicit: named barrier with expected count
Merge @barrier("join1", count: 2)
```

**File**: Grammar update in `src/language/machine.langium`
**Estimated Effort**: 4-6 hours
**Dependencies**: Grammar changes, parser updates

---

### ⏳ 4. Path Merging and Join Logic

**Current State**: Paths complete independently

**Required Changes**:

#### 4.1. Detect Merge Points
Find nodes where multiple paths converge:

```typescript
findMergePoints(): Map<string, string[]> {
    const mergePoints = new Map<string, string[]>();

    for (const node of this.machineData.nodes) {
        const incomingEdges = this.machineData.edges.filter(e => e.target === node.name);

        if (incomingEdges.length > 1) {
            const sources = incomingEdges.map(e => e.source);
            mergePoints.set(node.name, sources);
        }
    }

    return mergePoints;
}
```

**File**: New method in `src/language/execution/transition-manager.ts`
**Estimated Effort**: 2 hours
**Dependencies**: None

#### 4.2. Merge Strategy
Define how paths combine:

```typescript
enum MergeStrategy {
    FIRST_WINS,      // First path to arrive continues
    LAST_WINS,       // Wait for all, use last
    BARRIER_SYNC,    // Explicit @barrier annotation
    CONTEXT_MERGE    // Merge contexts, continue as single path
}

async mergePaths(mergeNode: string, paths: ExecutionPath[], strategy: MergeStrategy) {
    switch (strategy) {
        case MergeStrategy.CONTEXT_MERGE:
            const mergedContext = this.mergePathContexts(paths);
            const newPath = this.pathManager.createPath(mergeNode);
            newPath.attributes = mergedContext;

            // Mark original paths as completed
            paths.forEach(p => this.pathManager.updatePathStatus(p.id, 'completed'));
            break;

        // ... other strategies
    }
}
```

**File**: New file `src/language/execution/path-merger.ts`
**Estimated Effort**: 8-10 hours
**Dependencies**: Context merge logic, strategy design

---

### ⏳ 5. Machine-Level Concurrency Limits

**Current State**: `@concurrent(N)` parsed but not enforced
**File**: `src/language/execution/annotation-processor.ts:172`

**Required Changes**:

#### 5.1. Extract Machine Annotations
Parse `@concurrent(N)` at machine level:

```typescript
// In RailsExecutor constructor
const machineAttrs = this.getNodeAttributes(machineData.title);
const machineAnnotations = this.annotationProcessor?.processMachineAnnotations(
    machineAttrs.annotations
);

if (machineAnnotations?.concurrent) {
    this.maxConcurrentPaths = machineAnnotations.concurrent;
}
```

**File**: `src/language/rails-executor.ts:constructor()`
**Estimated Effort**: 2 hours
**Dependencies**: Machine-level attributes

#### 5.2. Enforce Path Limits
Block path creation when at limit:

```typescript
createPath(startNode: string): string | null {
    const activePaths = this.getActivePaths();

    if (activePaths.length >= this.maxConcurrentPaths) {
        this.logger.warn('path', `Path creation blocked: limit of ${this.maxConcurrentPaths} reached`);
        return null;
    }

    return this.createPathUnsafe(startNode);
}
```

**File**: `src/language/execution/path-manager.ts`
**Estimated Effort**: 2 hours
**Dependencies**: None

#### 5.3. Queue Pending Paths
When at limit, queue paths for later:

```typescript
interface PathQueue {
    targetNode: string;
    priority: number;
    createdAt: number;
}

private pendingPaths: PathQueue[] = [];

async step(): Promise<boolean> {
    // Process active paths
    // ...

    // If paths completed, start queued paths
    while (this.canCreatePath() && this.pendingPaths.length > 0) {
        const pending = this.pendingPaths.shift()!;
        this.pathManager.createPath(pending.targetNode);
    }
}
```

**File**: `src/language/rails-executor.ts`
**Estimated Effort**: 4 hours
**Dependencies**: Priority scheme

---

### ⏳ 6. Shared Context with Concurrent Write Locks

**Current State**: ContextManager has locks, but not used

**Required Changes**:

#### 6.1. Lock Acquisition on Write
Acquire lock before context mutation:

```typescript
async writeContext(contextName: string, key: string, value: any, pathId: string) {
    // Try to acquire lock
    const locked = await this.contextManager.acquireLock(contextName, pathId);

    if (!locked) {
        // Lock held by another path
        this.logger.warn('context', `Path ${pathId} waiting for lock on ${contextName}`);
        this.pathManager.updatePathStatus(pathId, 'waiting');
        return;
    }

    try {
        // Perform write
        this.context.attributes.set(key, value);
    } finally {
        // Always release lock
        this.contextManager.releaseLock(contextName, pathId);
    }
}
```

**File**: `src/language/rails-executor.ts`
**Estimated Effort**: 6 hours
**Dependencies**: Lock timeout handling

#### 6.2. Optimistic Concurrency
Use versioning for lock-free reads:

```typescript
interface VersionedContext {
    value: any;
    version: number;
    lastModifiedBy: string; // Path ID
}

async readWithVersion(contextName: string, pathId: string): VersionedContext {
    const context = this.contexts.get(contextName);
    return {
        value: context.value,
        version: context.version,
        lastModifiedBy: context.lastModifiedBy
    };
}

async writeIfUnchanged(
    contextName: string,
    value: any,
    expectedVersion: number,
    pathId: string
): boolean {
    const current = this.contexts.get(contextName);

    if (current.version !== expectedVersion) {
        // Context was modified, write failed
        return false;
    }

    current.value = value;
    current.version++;
    current.lastModifiedBy = pathId;
    return true;
}
```

**File**: `src/language/execution/context-manager.ts`
**Estimated Effort**: 6-8 hours
**Dependencies**: Conflict resolution strategy

---

## Testing Requirements

### Test Cases Needed

#### Multi-Path Basics
1. ✅ **Multiple entry points**: 3 start nodes → 3 paths created
2. ✅ **@parallel fork**: Fork node creates 2+ paths
3. ⏳ **Path completion**: All paths reach terminal nodes
4. ⏳ **Path failure**: One path fails, others continue

#### Agent Decisions
5. ⏳ **Agent in multi-path**: Each path makes independent decisions
6. ⏳ **Concurrent agent calls**: Multiple paths invoke agents simultaneously

#### Context Management
7. ⏳ **Path-specific context**: Each path has isolated attributes
8. ⏳ **Shared context read**: Multiple paths read same context
9. ⏳ **Shared context write**: Lock prevents concurrent writes
10. ⏳ **Context merge**: Paths merge, contexts reconciled

#### Synchronization
11. ⏳ **Barrier wait**: Paths wait at @barrier until all arrive
12. ⏳ **Barrier release**: All paths released simultaneously

#### Limits
13. ⏳ **Concurrency limit**: @concurrent(2) blocks 3rd path
14. ⏳ **Queued paths**: Pending paths start when slots available

---

## Implementation Priority

### Phase 1: Core Basics (COMPLETED ✅)
- [x] Multi-entry point detection
- [x] Multi-path execution loop
- [x] @parallel edge support
- [x] Visualizer integration
- [x] Edge condition evaluation fix

### Phase 2: Agent Integration (HIGH PRIORITY)
**Estimated Effort**: 2-3 days
1. Path-specific agent context (4-6 hours)
2. Path-aware tool calls (2-3 hours)
3. Testing with multi-path agent decisions (4 hours)

### Phase 3: Context Management (HIGH PRIORITY)
**Estimated Effort**: 2-3 days
1. Per-path context storage (2 hours)
2. Context read/write with path ID (6-8 hours)
3. Context merge on path completion (4 hours)
4. Lock acquisition for shared writes (6 hours)

### Phase 4: Synchronization (MEDIUM PRIORITY)
**Estimated Effort**: 2 days
1. Barrier detection (4-6 hours)
2. Barrier wait logic (3-4 hours)
3. Barrier configuration (4-6 hours)

### Phase 5: Path Merging (MEDIUM PRIORITY)
**Estimated Effort**: 2 days
1. Detect merge points (2 hours)
2. Merge strategies (8-10 hours)
3. Testing merge scenarios (4 hours)

### Phase 6: Production Features (LOW PRIORITY)
**Estimated Effort**: 1-2 days
1. Machine-level concurrency limits (2 hours)
2. Enforce path limits (2 hours)
3. Queue pending paths (4 hours)
4. Optimistic concurrency (6-8 hours)

---

## Total Estimated Effort

- **Phase 1 (Core)**: ✅ COMPLETED
- **Phase 2-3 (Agent + Context)**: 4-6 days
- **Phase 4-5 (Sync + Merge)**: 4 days
- **Phase 6 (Production)**: 1-2 days

**Total Outstanding**: ~9-12 days of focused development

---

## Success Criteria

### Minimum Viable (Agent Integration)
- [ ] Paths can invoke agents independently
- [ ] Agent tools operate on correct path context
- [ ] Paths don't interfere with each other's agent state

### Full Feature Set (All Phases)
- [ ] All outstanding items implemented
- [ ] Test coverage for all scenarios
- [ ] Documentation updated
- [ ] Performance benchmarks (paths/sec)

### Production Ready
- [ ] Error handling for all edge cases
- [ ] Resource limits enforced
- [ ] Deadlock detection
- [ ] Monitoring and observability
