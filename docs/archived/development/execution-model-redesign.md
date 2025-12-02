# Execution Model Redesign

**Status**: Design Proposal
**Date**: 2025-11-03
**Author**: Claude (based on issue #348)

## Executive Summary

This document analyzes the existing RailsExecutor implementation and proposes a redesigned execution model that is lean, modular, and expressive. The goal is to support both quick/loose sketch machines and detailed production machines without requiring parallel render paths or complex abstractions.

## Analysis of Existing Implementation

### Current Architecture

The existing execution infrastructure consists of:

1. **BaseExecutor** (`base-executor.ts`):
   - Shared base class with core execution logic
   - CEL-based condition evaluation
   - Cycle detection and safety limits
   - Template variable resolution
   - Mutation tracking

2. **RailsExecutor** (`rails-executor.ts`):
   - "Rails pattern" implementation (recommended)
   - Automated vs. agent-controlled transitions
   - State module support with hierarchical entry
   - Context permissions based on edges
   - Meta-tool support for self-modification
   - Agent SDK integration

3. **MachineExecutor** (`machine-executor.ts`):
   - Deprecated legacy executor
   - Kept for backward compatibility

### Core Execution Concepts

#### Node Types

The system uses explicit and inferred node types (via `NodeTypeChecker`):

- **task**: Executable nodes with prompts (agent decisions)
- **state**: Control flow nodes (automated transitions)
- **context**: Data storage nodes (shared state)
- **init**: Entry point nodes (no incoming edges)
- **tool**: Callable tools with schemas
- **style**: Visual metadata (filtered from execution)

#### Edge Semantics

Edges control transitions and have multiple semantic layers:

1. **Transition Edges**: Control flow between nodes
2. **Data Edges**: Context access (reads/writes/stores)
3. **Annotations**: `@auto` forces automatic transition
4. **Conditions**: `when:`, `unless:`, `if:` for conditional transitions
5. **Permissions**: Inferred from edge labels (read, write, store)

#### Starting Points

The executor currently starts from:
- Node named "start" (case-insensitive)
- First node if no "start" found
- For state modules: first child node (preferring task over context)

### Key Features

#### 1. Automated Transitions

Automatic transitions occur when:
- Single edge from state/init node
- Edge has `@auto` annotation
- Edge has simple deterministic condition that evaluates to true
- Node is terminal (within state module)

#### 2. State Modules

State nodes with children act as modules:
- Automatic entry to first child
- Recursive module entry (nested modules)
- Terminal nodes inherit parent module exits
- Module-level edges apply to all terminal children

#### 3. Context Permissions

Access control based on edge semantics:
- Task → Context: write permission
- Context → Task: read permission
- Edge labels specify operations: `reads`, `writes`, `stores`
- Field-level permissions: `write: field1, field2`

#### 4. Meta-Programming

Tasks with `meta: true` can:
- Read machine definition
- Add/remove nodes and edges
- Modify node attributes
- Track mutations for versioning

#### 5. Safety Features

- **Max steps**: Global limit (default 1000)
- **Max node invocations**: Per-node limit (default 100)
- **Timeout**: Wall-clock time limit (default 5 minutes)
- **Cycle detection**: Checks for repeating state patterns
- **Node-specific limits**: `maxSteps` attribute on nodes

## Analysis of Requirements

### Where to Start?

**Previous approach**: Single entry point ("start" node or first node)

**New decision**: **Support multiple start nodes by default**

**Rationale**:
- Production machines often have independent workflows
- Parallel execution paths improve performance
- Different entry points for different execution modes
- Natural fit for event-driven architectures

**Multiple start node detection**:
1. All nodes with `init` type
2. All nodes named "start*" (case-insensitive)
3. All non-data nodes without incoming edges
4. Explicit start nodes via machine configuration

**Execution semantics**:
- Each start node initiates an independent execution path
- Paths execute concurrently by default
- Shared context requires synchronization
- Execution completes when all paths reach terminal nodes or limits

### Edge Type Semantics

**Current implementation** has implicit semantics:

1. **Plain labels**: Descriptive text, no special meaning
2. **Conditional expressions**: `when:`, `unless:`, `if:`
3. **Annotations**: `@auto` for forced automation
4. **Arrow types**: Currently visual only (not semantic)
5. **Inferred dependencies**: Context access from edge direction

**Gaps identified**:
- No explicit data flow edges vs control flow edges
- Arrow types (→, =>, -->, etc.) are visual, not semantic
- No parallel/concurrent edge semantics
- No priority/weight for transition selection
- No async/await semantics

**Recommendation**: Add semantic edge types:
- **Control edges**: State transitions (default)
- **Data edges**: Context access (read/write/store)
- **Dependency edges**: Execution order constraints
- **Parallel edges**: Concurrent execution paths
- Use arrow types as hints: `->` control, `-->` data, `=>` transform

### Annotation Impact

**Current annotations**:
- `@auto`: Force automatic transition
- `@style(...)`: Visual styling (execution-agnostic)

**Missing annotations**:
- `@parallel`: Execute edges concurrently
- `@priority(N)`: Transition priority
- `@lazy`: Delay execution until needed
- `@cache`: Memoize results
- `@retry(N)`: Automatic retry on failure
- `@timeout(ms)`: Per-node timeout

**Recommendation**: Annotations should be:
- **Optional by default**: No annotations = sensible defaults
- **Progressive enhancement**: Add detail incrementally
- **Execution hints**: Guide but don't constrain
- **Modular**: Composable without conflicts

### Machine-Level Attributes

**Current support**: Limits in executor config only

**Needed**:
- `maxSteps`: Global step limit
- `timeout`: Execution timeout
- `concurrency`: Parallel execution limit
- `retryPolicy`: Global retry behavior
- `errorHandling`: Continue/stop on error
- `logging`: Execution trace detail

**Recommendation**: Three-tier configuration:
1. **Executor config**: Default limits (code)
2. **Machine attributes**: Override defaults (DSL)
3. **Node attributes**: Override machine (DSL)

### Visualization/Serialization Sync

**Current approach**: Separate visualization in `RuntimeVisualizer`

**Issue**: Potential drift between execution state and rendered state

**Current solution**: Visualizer reads directly from executor context

**Gaps**:
- No bidirectional sync (visual changes don't affect execution)
- Runtime mutations not reflected in original DSL
- Snapshot vs. live state tension

**Recommendation**:
- Keep single source of truth: `MachineData` + `ExecutionContext`
- Visualizer is read-only view
- Mutations update `MachineData` directly
- Serialize back to DSL via `toMachineDefinition()`
- Use mutation log for versioning/replay

## Proposed Execution Model

### Core Principles

1. **Lean**: Minimal abstractions, direct implementation
2. **Modular**: Separate concerns (transition, evaluation, tool execution)
3. **Progressive**: Works for sketches, scales to production
4. **Explicit when needed**: Defaults for quick prototyping, annotations for control
5. **Single render path**: One execution model, one visualization
6. **Concurrent by default**: Support multiple start nodes and parallel execution paths

### Architecture

```
┌─────────────────────────────────────────────┐
│           Execution Engine                  │
├─────────────────────────────────────────────┤
│  - Start node detection                     │
│  - Step execution loop                      │
│  - Safety checks (limits, cycles, timeout)  │
│  - Execution context management             │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│Transition│ │ Context  │ │   Tool   │
│ Manager  │ │ Manager  │ │ Manager  │
└──────────┘ └──────────┘ └──────────┘
        │           │           │
        └───────────┼───────────┘
                    ▼
        ┌─────────────────────┐
        │  Evaluation Engine  │
        ├─────────────────────┤
        │  - CEL evaluator    │
        │  - Edge conditions  │
        │  - Template vars    │
        └─────────────────────┘
```

### Multiple Start Nodes: Deep Dive

#### Motivation

Production machines often require parallel workflows:

```dy
machine "Data Pipeline"

// Three independent start nodes
init DataIngestion "Ingest data from API"
init HealthCheck "Monitor system health"
init UserRequests "Process user requests"

// Each has independent flow
DataIngestion -> ValidateData -> TransformData -> StoreData
HealthCheck -> CheckMetrics -> AlertIfNeeded
UserRequests -> AuthenticateUser -> ProcessRequest -> SendResponse
```

This machine has three concurrent entry points, each managing a different concern.

#### Execution Model

**Initialization**:
```javascript
function initialize(machine) {
  // Find all start nodes
  const startNodes = detectStartNodes(machine)

  // Create execution path for each
  const paths = startNodes.map(node => ({
    id: generatePathId(),
    currentNode: node,
    history: [node],
    context: createPathContext(),
    status: 'active'
  }))

  return {
    paths,
    sharedContext: createSharedContext(),
    startTime: Date.now()
  }
}
```

**Execution loop**:
```javascript
async function execute(executionState) {
  while (hasActivePaths(executionState)) {
    // Process all active paths in parallel
    const updates = await Promise.all(
      executionState.paths
        .filter(p => p.status === 'active')
        .map(path => executePathStep(path, executionState.sharedContext))
    )

    // Apply updates
    updates.forEach(update => applyPathUpdate(executionState, update))

    // Check global limits
    if (exceedsLimits(executionState)) break
  }

  return executionState
}
```

#### Synchronization Strategies

**1. Context Locking**

When multiple paths access shared context:

```javascript
class ContextManager {
  async read(contextName, pathId) {
    // Reads are concurrent
    return this.contexts[contextName].value
  }

  async write(contextName, pathId, value) {
    // Writes are serialized
    await this.locks[contextName].acquire()
    try {
      this.contexts[contextName].value = value
      this.contexts[contextName].version++
    } finally {
      this.locks[contextName].release()
    }
  }
}
```

**2. Path Barriers**

Wait for multiple paths to reach a point:

```dy
// Parallel processing with synchronization
init Worker1, Worker2, Worker3

Worker1 -> Process1 -> @barrier("sync_point")
Worker2 -> Process2 -> @barrier("sync_point")
Worker3 -> Process3 -> @barrier("sync_point")

// Continue after all reach barrier
@barrier("sync_point") -> Aggregate -> Finish
```

**3. Message Passing**

Paths communicate via context channels:

```dy
context Channel { messages: [] }

init Producer "Generate messages"
init Consumer "Process messages"

Producer --> Channel  // writes
Consumer --> Channel  // reads

Producer -[when: "Channel.messages.length < 10"]-> Producer
Consumer -[when: "Channel.messages.length > 0"]-> Consumer
```

#### Path Lifecycle

**States**:
- `active`: Path is executing
- `waiting`: Path is blocked (barrier, condition)
- `completed`: Path reached terminal node
- `failed`: Path hit error or limit
- `cancelled`: Path was stopped externally

**Transitions**:
```
active -> waiting: Blocked on condition or barrier
waiting -> active: Condition met or barrier released
active -> completed: Reached terminal node
active -> failed: Error, timeout, or limit exceeded
any -> cancelled: External cancellation
```

#### Safety and Limits

**Per-path limits**:
- Maximum steps per path
- Maximum node invocations per path
- Timeout per path

**Global limits**:
- Maximum total steps (all paths)
- Maximum concurrent paths
- Global execution timeout
- Memory limits

```dy
machine "With Limits" {
  maxSteps: 1000              // Global limit
  maxConcurrentPaths: 10      // Concurrent paths
  timeout: 300000             // 5 minutes total
  perPathMaxSteps: 100        // Each path limit
}
```

#### Error Handling

**Strategies**:

1. **Fail-fast**: Any path failure stops all paths
   ```javascript
   machine "CriticalSystem" @errorHandling("fail-fast")
   ```

2. **Continue**: Path failures don't affect other paths
   ```javascript
   machine "ResilientSystem" @errorHandling("continue")
   ```

3. **Compensate**: Failed path triggers rollback
   ```javascript
   machine "TransactionalSystem" @errorHandling("compensate")
   ```

#### Visualization Considerations

**Rendering multiple active nodes**:
- Highlight all active paths in different colors
- Show path IDs in node labels
- Animate transitions per path
- Display path status in sidebar

**Examples**:
```
Path 1 (active): Start -> Task1 -> [Task2] -> End
Path 2 (waiting): Init -> Check -> [Blocked on condition]
Path 3 (completed): Setup -> Process -> Done
```

#### Implementation Implications

**Phase 1 additions**:
- `PathManager`: Track and coordinate execution paths
- `SynchronizationManager`: Handle barriers and locks
- Update `ExecutionContext` to support multiple paths
- Modify transition logic for concurrent execution

**Phase 2 additions**:
- Barrier annotations (`@barrier("name")`)
- Path communication primitives
- Error handling strategies
- Path-specific attributes

**Phase 3 additions**:
- Advanced synchronization (semaphores, channels)
- Path priorities and scheduling
- Dynamic path creation
- Path lifecycle hooks

### Key Components

#### 1. Transition Manager

**Responsibilities**:
- Determine available transitions from current node
- Classify transitions (auto vs. agent)
- Evaluate edge conditions
- Select next node (automatic or via agent)
- Handle state module entry/exit

**Algorithm**:
```
function evaluateTransition(node):
  edges = getOutboundEdges(node)

  // Check for single-edge auto-transition
  if edges.length == 1 and (isState(node) or isInit(node)):
    if evaluateCondition(edges[0]):
      return autoTransition(edges[0])

  // Check for @auto annotated edges
  for edge in edges:
    if hasAutoAnnotation(edge) and evaluateCondition(edge):
      return autoTransition(edge)

  // Check for simple deterministic conditions
  for edge in edges:
    if isSimpleCondition(edge) and evaluateCondition(edge):
      return autoTransition(edge)

  // Requires agent decision
  return requiresAgentDecision(node, edges)
```

#### 2. Context Manager

**Responsibilities**:
- Resolve context access permissions
- Handle read/write operations
- Validate attribute types
- Track context mutations

**Access resolution**:
```
function getContextPermissions(task, context):
  edges = getEdgesBetween(task, context)
  permissions = { read: false, write: false, store: false }

  for edge in edges:
    if edge.source == task and edge.target == context:
      // Outbound edge from task = write permission
      if edge.label contains "write" or "store":
        permissions.write = true
        permissions.store = true

    if edge.source == context and edge.target == task:
      // Inbound edge to task = read permission
      permissions.read = true

  return permissions
```

#### 3. Tool Manager

**Responsibilities**:
- Register static and dynamic tools
- Generate tool definitions from edges
- Execute tool calls
- Handle tool results

**Tool types**:
- **Transition tools**: `transition_to_<target>`
- **Context tools**: `read_<context>`, `write_<context>`
- **Meta tools**: `add_node`, `modify_node`, etc.
- **Custom tools**: From tool nodes

#### 4. Evaluation Engine

**Responsibilities**:
- Evaluate CEL expressions safely
- Resolve template variables
- Validate conditions
- Handle evaluation errors

**Context for evaluation**:
```javascript
{
  errorCount: number,
  activeState: string,
  attributes: {
    [nodeName]: {
      [attrName]: value
    }
  }
}
```

### Execution Flow

```
1. Initialize
   - Load machine definition
   - Find all start nodes (multiple supported)
   - Create execution paths for each start node
   - Create shared context
   - Set up safety limits (per-path and global)

2. Execute Loop
   while hasActivePaths() and not global_limits_exceeded:
     // Process all active paths concurrently
     for each path in paths.filter(p => p.status === 'active'):
       a. Get current node for path
       b. Track invocation (check per-path limits)
       c. Track state transition (check cycles)
       d. Check path and global timeouts

       e. Evaluate automated transitions
          - Single edge from state/init
          - @auto annotation
          - Simple deterministic condition

       f. If auto transition found:
          - Transition to target
          - Update path state
          - Continue to next path

       g. If no auto transition:
          - Check if requires agent decision
          - Build system prompt
          - Get available tools
          - Invoke agent (async)
          - Process tool calls
          - Handle context synchronization if needed
          - Transition based on agent choice

       h. If no outbound edges:
          - Terminal node reached
          - Mark path as completed

       i. Handle path barriers:
          - If at barrier, mark path as waiting
          - Check if all required paths at barrier
          - If barrier complete, resume all waiting paths

3. Return Results
   - Execution context (all paths)
   - Per-path history
   - Shared context state
   - Mutations
   - Final status for each path
```

### Edge Semantic Types

Introduce explicit edge types via arrow syntax and annotations:

```dy
// Control flow (default)
Start -> Process -> End

// Data flow
Task --> Context      // read/write data
Context --> Task      // read-only

// Transform/computation
Input => Transform => Output

// Conditional
Process -[when: "x > 0"]-> Success
Process -[unless: "x > 0"]-> Failure

// Automatic
Process -[@auto]-> Next

// Parallel (future)
Fork --parallel--> Branch1, Branch2
```

### Node Execution Strategy

Different node types have different execution strategies:

| Node Type | Execution | Transitions | Example |
|-----------|-----------|-------------|---------|
| init | Skip | Auto (single edge) | Entry point |
| state | Skip | Auto (single edge) | Control states |
| task | Agent/LLM | Agent choice | Work nodes |
| context | Skip | N/A (data only) | Shared state |
| tool | Skip | N/A (callable) | Functions |

### Start Node Detection

**Multiple start nodes supported by default**. Detection algorithm:

1. **Explicit init nodes**: All nodes with `init` type
2. **Named start nodes**: All nodes matching "start*" pattern (case-insensitive)
3. **Inference**: All non-data nodes with no incoming edges and at least one outgoing edge
4. **Configuration override**: `startNodes: ["Node1", "Node2"]` in machine attributes
5. **Single start fallback**: If none found, use first node in definition

**Examples**:

```dy
// Multiple explicit starts
init Workflow1, Workflow2, Workflow3

// Mixed detection
init Start1        // Explicit
state Start2       // Named pattern
task Orphan        // No incoming edges

// Configuration override
machine "MyMachine" {
  startNodes: ["CustomEntry1", "CustomEntry2"]
}
```

**Backward compatibility**: Machines with single start node work unchanged

### Annotation System

**Node annotations**:
```dy
task MyTask @retry(3) @timeout(5000) {
  prompt: "Do work"
}

state Critical @checkpoint {
  // Save state here
}

context Data @persistent {
  value: 0
}
```

**Edge annotations**:
```dy
A -[@auto, @log("Moving to B")]-> B
C -[@parallel]-> D, E
F -[@priority(1)]-> G
F -[@priority(2)]-> H
```

**Machine annotations**:
```dy
machine "My Machine" @concurrent(4) @retryPolicy("exponential") {
  maxSteps: 1000
  timeout: 300000
}
```

### Progressive Enhancement

**Level 1: Sketch** (minimal syntax)
```dy
machine "Quick Test"

Start -> Process -> End
```
Behavior: Auto-transitions through states

**Level 2: Basic tasks** (add prompts)
```dy
machine "With Tasks"

Start -> Analyze -> Report -> End

task Analyze {
  prompt: "Analyze the data"
}

task Report {
  prompt: "Generate report"
}
```
Behavior: Agent decisions at tasks, auto-transitions between

**Level 3: Data flow** (add context)
```dy
machine "With Context"

context Data { value: 0 }

Start -> Compute -> End

task Compute {
  prompt: "Calculate result"
}

Compute --> Data  // write
```
Behavior: Tasks can read/write context

**Level 4: Conditions** (add logic)
```dy
machine "With Conditions"

context Counter { count: 0 }

Start -> Check -> Process -> Check

task Process {
  prompt: "Do work and increment"
}

Check -[when: "Counter.count < 3"]-> Process
Check -[when: "Counter.count >= 3"]-> End

Process --> Counter
```
Behavior: Loop with exit condition

**Level 5: Advanced** (annotations, meta)
```dy
machine "Advanced" @concurrent(2) {
  maxSteps: 500
}

context Data { items: [] }

Start -> Fetch -> Transform -> Store -> End

task Fetch @retry(3) {
  prompt: "Fetch data from API"
  meta: true
}

task Transform @timeout(10000) {
  prompt: "Transform data"
}

Fetch --> Data
Transform --> Data
```
Behavior: Full production features

## Implementation Plan

### Phase 1: Core Refactoring and Concurrency Foundation (Weeks 1-3)

1. **Extract Core Managers**
   - Move transition evaluation to `TransitionManager`
   - Move context permissions to `ContextManager`
   - Move tool registration to `ToolManager`
   - Centralize CEL evaluation in `EvaluationEngine`

2. **Multiple Start Nodes Infrastructure**
   - Implement `PathManager` for execution path tracking
   - Update `ExecutionContext` to support multiple active paths
   - Create path state management (active, waiting, completed, failed)
   - Implement start node detection algorithm

3. **Basic Concurrency Support**
   - Parallel path execution loop
   - Per-path and global safety limits
   - Path-level history and state tracking
   - Backward compatibility with single-start machines

4. **Context Synchronization (Basic)**
   - Add locking mechanism for shared context writes
   - Implement concurrent reads
   - Track context version numbers
   - Basic race condition prevention

### Phase 2: Enhanced Semantics and Synchronization (Weeks 4-6)

1. **Edge Type System**
   - Define semantic edge types (control, data, dependency)
   - Map arrow syntax to types (→, -->, =>)
   - Update DSL parser and generators
   - Update visualizer for edge types

2. **Annotation System**
   - Support node annotations (@retry, @timeout, @checkpoint)
   - Support edge annotations (@auto, @parallel, @priority)
   - Support machine annotations (@concurrent, @errorHandling)
   - Update parser grammar

3. **Advanced Synchronization**
   - Implement `SynchronizationManager`
   - Add barrier annotations (@barrier)
   - Path waiting and resumption logic
   - Message passing via context channels

4. **Error Handling Strategies**
   - Fail-fast mode (any failure stops all)
   - Continue mode (isolated failures)
   - Compensate mode (rollback on failure)
   - Per-path error boundaries

### Phase 3: Production Features and Optimization (Weeks 7-9)

1. **Enhanced Safety and Limits**
   - Per-node timeout annotations
   - Retry policies (exponential backoff, fixed)
   - Circuit breaker pattern
   - Resource limits (memory, concurrent paths)

2. **Execution Modes**
   - Eager execution (default, immediate)
   - Groundwork for lazy evaluation
   - Add @lazy and @eager annotations
   - Dependency graph analysis

3. **State Management**
   - Checkpoint/restore for paths
   - Execution replay from checkpoint
   - Mutation tracking and audit log
   - Serialization of execution state

4. **Testing and Documentation**
   - Comprehensive unit tests for managers
   - Integration tests for concurrent execution
   - Test barrier and synchronization primitives
   - Update all documentation
   - Create migration guide
   - Add examples for parallel workflows

### Phase 4: Advanced Features (Future)

1. **Dynamic Path Creation**
   - Spawn new paths at runtime
   - Dynamic fan-out patterns
   - Path termination and cleanup

2. **Lazy Evaluation**
   - On-demand node execution
   - Dependency-driven execution
   - Smart execution planning

3. **Advanced Synchronization**
   - Semaphores for resource limits
   - Channels for message passing
   - Path priorities and scheduling
   - Deadlock detection

4. **Visualization Enhancements**
   - Real-time multi-path visualization
   - Path timeline view
   - Resource utilization graphs
   - Barrier and sync point indicators

## Design Decisions

### 1. Parallel Execution
**Question**: Should we support concurrent node execution?

**Decision**: **YES** - Support multiple start nodes by default

**Rationale**:
- Enables parallel workflows and concurrent task execution
- Multiple start nodes allow different execution paths to run simultaneously
- Essential for production-grade machines with independent workflows
- Complexity is manageable with proper synchronization primitives

**Implications**:
- Need to handle multiple active nodes in execution context
- Require synchronization for shared context access
- Must track multiple execution paths independently
- Safety limits apply per-path and globally

### 2. Async Transitions
**Question**: Should edges support async/await semantics?

**Decision**: **YES** - Handle via task nodes and dependencies, not edges explicitly

**Rationale**:
- Task nodes naturally support async operations (API calls, delays)
- Edges remain declarative (relationships, not execution)
- Dependencies can be expressed through edge conditions
- Keeps edge semantics simple and compositional

**Implementation**:
- Task nodes execute asynchronously by nature
- Use `when:` conditions to wait for completion
- Context updates signal completion to waiting paths
- No special edge syntax needed

### 3. Dynamic Graphs
**Question**: Should execution support runtime graph modification beyond meta-tools?

**Decision**: **LIMITED** - Meta-tools only, but entirely possible when active

**Rationale**:
- Meta-tools provide controlled, auditable graph modification
- Unrestricted runtime changes make execution unpredictable
- Meta-tool approach maintains single source of truth
- Sufficient for self-modifying agents and adaptive workflows

**Constraints**:
- Only nodes with `meta: true` can modify graph
- Modifications logged in mutation history
- Changes affect subsequent execution, not current step
- Graph validation runs after modifications

### 4. Execution Modes
**Question**: Should we support different execution strategies (eager, lazy, etc.)?

**Decision**: **START WITH EAGER** - Prepare groundwork for lazy in near future

**Rationale**:
- Eager execution is simpler and more predictable
- Covers 90% of use cases immediately
- Lazy evaluation useful for optimization and large graphs
- Architecture should support both modes

**Roadmap**:
- Phase 1-2: Eager execution only
- Phase 3: Add lazy evaluation annotations
- Future: Smart execution planning based on graph analysis

**Groundwork**:
- Design edge semantics to support lazy evaluation
- Use annotations (`@lazy`, `@eager`) for hints
- Track node dependencies for lazy resolution

### 5. Subgraphs
**Question**: Should we support modular subgraph composition?

**Decision**: **STATE MODULES PROVIDE THIS** - Enhance if needed

**Rationale**:
- State modules already support hierarchical composition
- Nested modules provide namespace isolation
- Module-level edges support reusable patterns
- Additional composition can be added later

**Enhancement opportunities**:
- Import/export of state modules
- Module parameterization
- Module libraries
- Dynamic module loading

## Success Criteria

1. **Lean**: less than 500 lines per manager component
2. **Modular**: Clear separation of concerns, testable in isolation
3. **Expressive**: Supports all current features plus new annotations
4. **Progressive**: Works for 3-node sketch and 100-node production
5. **Single path**: No parallel execution/rendering logic
6. **Performance**: No regression vs. current implementation
7. **Compatible**: Existing machines work with minimal changes

## Next Steps

1. Review this design with stakeholders
2. Create implementation tasks in GitHub
3. Start with Phase 1 (Core Refactoring)
4. Iterate based on feedback

## References

- Issue #348: Original request
- `rails-executor.ts`: Current implementation
- `base-executor.ts`: Shared base logic
- CLAUDE.md: Documentation standards
