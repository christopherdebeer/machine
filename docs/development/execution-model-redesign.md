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

**Current approach**: Single entry point ("start" node or first node)

**Considerations**:
- ✅ Non-data nodes without incoming edges (init nodes)
- ✅ Support for multiple entry points (different execution modes)
- ❌ Parallel execution from multiple starts
- ❌ Entry points for sub-graphs or modules

**Recommendation**: Keep single entry point for simplicity, but:
- Make start node detection more explicit
- Support init nodes as entry candidates
- Allow execution from any node (for testing/debugging)

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
   - Find start node
   - Create execution context
   - Set up safety limits

2. Execute Loop
   while not terminated and not limit_exceeded:
     a. Get current node
     b. Track invocation (check limits)
     c. Track state transition (check cycles)
     d. Check timeout

     e. Evaluate automated transitions
        - Single edge from state/init
        - @auto annotation
        - Simple deterministic condition

     f. If auto transition found:
        - Transition to target
        - Continue loop

     g. If no auto transition:
        - Check if requires agent decision
        - Build system prompt
        - Get available tools
        - Invoke agent
        - Process tool calls
        - Transition based on agent choice

     h. If no outbound edges:
        - Terminal node reached
        - Exit loop

3. Return Results
   - Execution context
   - History
   - Mutations
   - Final state
```

### Edge Semantic Types

Introduce explicit edge types via arrow syntax and annotations:

```dygram
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

Priority order:

1. Explicit `init` type node
2. Node named "start" (case-insensitive)
3. Node with no incoming edges and outgoing edges
4. First node in definition
5. Configurable via `startNode` in machine attributes

### Annotation System

**Node annotations**:
```dygram
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
```dygram
A -[@auto, @log("Moving to B")]-> B
C -[@parallel]-> D, E
F -[@priority(1)]-> G
F -[@priority(2)]-> H
```

**Machine annotations**:
```dygram
machine "My Machine" @concurrent(4) @retryPolicy("exponential") {
  maxSteps: 1000
  timeout: 300000
}
```

### Progressive Enhancement

**Level 1: Sketch** (minimal syntax)
```dygram
machine "Quick Test"

Start -> Process -> End
```
Behavior: Auto-transitions through states

**Level 2: Basic tasks** (add prompts)
```dygram
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
```dygram
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
```dygram
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
```dygram
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

### Phase 1: Core Refactoring (Weeks 1-2)

1. **Extract Transition Logic**
   - Move transition evaluation to `TransitionManager`
   - Centralize auto-transition rules
   - Support state module entry

2. **Extract Context Logic**
   - Move context permissions to `ContextManager`
   - Centralize access control
   - Support field-level permissions

3. **Extract Tool Logic**
   - Move tool registration to `ToolManager`
   - Dynamic tool generation
   - Meta-tool support

### Phase 2: Enhanced Semantics (Weeks 3-4)

1. **Edge Type System**
   - Define semantic edge types
   - Map arrow syntax to types
   - Update generators

2. **Annotation System**
   - Support node annotations
   - Support edge annotations
   - Support machine annotations

3. **Start Node Detection**
   - Implement priority-based detection
   - Support multiple entry points
   - Add execution modes

### Phase 3: Safety and Reliability (Weeks 5-6)

1. **Enhanced Safety**
   - Per-node timeout
   - Retry policies
   - Error handling strategies

2. **State Management**
   - Checkpoint/restore
   - Execution replay
   - Mutation tracking

3. **Testing and Documentation**
   - Comprehensive tests
   - Update documentation
   - Migration guide

## Open Questions

1. **Parallel execution**: Should we support concurrent node execution?
   - Pro: Enables parallel workflows
   - Con: Adds complexity (synchronization, state)
   - Decision: Defer to future, design for it

2. **Async transitions**: Should edges support async/await semantics?
   - Pro: Natural for API calls, delays
   - Con: Complicates execution model
   - Decision: Handle via task nodes, not edges

3. **Dynamic graphs**: Should execution support runtime graph modification beyond meta-tools?
   - Pro: More flexible
   - Con: Harder to reason about
   - Decision: Meta-tools sufficient, keep graph mostly static

4. **Execution modes**: Should we support different execution strategies (eager, lazy, etc.)?
   - Pro: Optimization opportunities
   - Con: More complex API
   - Decision: Start with eager, consider lazy for future

5. **Subgraphs**: Should we support modular subgraph composition?
   - Pro: Reusability, organization
   - Con: Namespace management, composition rules
   - Decision: State modules provide this, enhance if needed

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
