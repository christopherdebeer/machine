# RuntimeStateVisualizer: Execution Controls & Affordances Review

## Executive Summary

The current `RuntimeStateVisualizer` provides basic runtime visualization but lacks comprehensive execution control affordances needed for a complete "window into the execution runtime." This review identifies gaps and proposes enhancements to provide a condensed snapshot view showing contexts, tools, transitions, and multi-path execution state.

**Status**: In Progress - Implementation Started
**Date**: 2025-12-03 (Created), 2025-12-03 (Implementation Started)
**Related Files**:
- `src/language/runtime-visualizer.ts` (current implementation)
- `src/language/executor.ts` (execution engine)
- `src/language/execution/runtime-types.ts` (type definitions)
- `src/components/ExecutionStateVisualizer.tsx` (playground component)

---

## Implementation Tracking

### Phase 0: Analysis Complete ✅
- **Commit**: `89752d0` - docs: comprehensive review of RuntimeStateVisualizer execution controls
- **Files**:
  - `docs/development/runtime-state-visualizer-review.md` (this file)
  - `docs/development/runtime-snapshot-prototype.ts` (prototype implementation)
  - `docs/development/runtime-snapshot-usage-examples.md` (usage examples)
- **Key Finding**: ExecutionStateVisualizer already uses `getVisualizationState()` effectively!
  - See `src/components/ExecutionStateVisualizer.tsx:539`
  - Already displays: active paths, node states, context values, available transitions
  - Multi-path execution fully visualized

### Phase 1: RuntimeVisualizer Enhancement ✅ COMPLETE
- **Commit**: `2dd5bd3` - feat: add RuntimeSnapshot API to RuntimeVisualizer
- [x] Add `generateRuntimeSnapshot()` method to RuntimeVisualizer
- [x] Integrate tool discovery (context tools: read/write operations)
- [x] Add turn state extraction
- [x] Keep existing Graphviz methods (no breaking changes)
- **Files Modified**: `src/language/runtime-visualizer.ts`
- **New Exports**:
  - `RuntimeSnapshot` interface - comprehensive execution state snapshot
  - `ToolAffordance` interface - tool availability information
  - `ContextAffordance` interface - context state and write capabilities
  - `RuntimeVisualizer.generateRuntimeSnapshot()` - main API method
  - `VisualizingMachineExecutor.getRuntimeSnapshot()` - convenience method

### Phase 2: Verification ✅ COMPLETE
- [x] Verify no regressions - All existing methods unchanged
- [x] ExecutionStateVisualizer already uses getVisualizationState() effectively
- [x] No modifications to existing Graphviz generation
- [x] New methods added alongside existing ones (backward compatible)
- **Key Finding**: ExecutionStateVisualizer.tsx (line 539) already demonstrates the pattern we're implementing

### Phase 3: Documentation Update ✅ COMPLETE
- [x] Update this file with implementation status
- [x] Document new API methods and types
- [x] Note: Usage examples already in `runtime-snapshot-usage-examples.md`

### Phase 4: Formatting Utilities ✅ COMPLETE
- **Commit**: `374b164` - feat: add RuntimeSnapshot formatting utilities
- [x] Add formatRuntimeSnapshot() - Rich text output with sections
- [x] Add formatRuntimeSnapshotJSON() - Clean JSON for tooling
- [x] Add formatRuntimeSnapshotCompact() - One-line summary for scripting
- **File**: `src/language/runtime-visualizer.ts`
- **Exports**:
  - `formatRuntimeSnapshot(snapshot)` - Human-readable formatted output
  - `formatRuntimeSnapshotJSON(snapshot)` - JSON stringified output
  - `formatRuntimeSnapshotCompact(snapshot)` - Compact one-liner

### Phase 5: Web Playground Integration ✅ COMPLETE
- **Commit**: `8ba1e08` - feat: enhance ExecutionStateVisualizer with RuntimeSnapshot integration
- [x] Import RuntimeSnapshot type
- [x] Add snapshot state management alongside VisualizationState
- [x] Update updateExecutionState() to fetch RuntimeSnapshot safely
- [x] Add responsive styled components with $mobile prop:
  - ToolsList: grid adapts from 1fr (mobile) to auto-fill minmax(200px) (desktop)
  - TurnStateCard: gradient background with execution stats
  - TurnStateGrid: adapts from 2 columns (mobile) to 4 columns (desktop)
- [x] Add Turn State Indicator section:
  - Turn count and current node
  - Message count and available tools count
  - Waiting/Active status
- [x] Add Tool Affordances section:
  - Tool name and description
  - Source badge (context/session/machine)
- [x] Maintain backward compatibility:
  - New sections only render when data available
  - Graceful fallback if getRuntimeSnapshot() not available
  - No impact on existing Graphviz diagram or core visualization
- **File**: `src/components/ExecutionStateVisualizer.tsx`
- **Features**:
  - Responsive design ensures no diminished features on mobile
  - Grid layouts adapt automatically to viewport size
  - Turn state card shows conversation progress with gradient styling
  - Tool cards display available context read/write operations
  - All enhancements complement existing VisualizationState display

---

---

## Current Implementation Analysis

### What Exists

#### 1. RuntimeVisualizer Class (src/language/runtime-visualizer.ts:47)

**Current Capabilities:**
- Snapshots executor context at construction time
- Generates Graphviz DOT diagrams with runtime overlays
- Provides mobile-optimized visualizations
- Basic runtime summary (currentNode, totalSteps, visitedNodes)

**Current Data Access:**
```typescript
{
  currentNode: string;
  totalSteps: number;
  visitedNodes: number;
  pendingNodes: number;
  lastAction?: string;
}
```

#### 2. MachineExecutor.getVisualizationState() (src/language/executor.ts:234)

**Comprehensive Multi-Path State:**
```typescript
interface VisualizationState {
  // Current positions across all paths
  currentNodes: Array<{pathId, nodeName}>;

  // Path tracking
  allPaths: Array<{id, currentNode, status, stepCount, history, startTime}>;
  activePaths: Array<{id, currentNode, status, stepCount, history}>;

  // Aggregated node states
  nodeStates: Record<string, {
    visitCount: number;
    lastVisited?: string;
    isActive: boolean;
    activeInPaths: string[];
    contextValues?: Record<string, any>;  // ✅ Runtime context values
  }>;

  // Available transitions per path
  availableTransitions: Array<{
    pathId: string;
    fromNode: string;
    toNode: string;
    isAutomatic: boolean;
    condition?: string;
  }>;

  // Metadata
  stepCount, elapsedTime, errorCount;
  totalPaths, activePathCount, completedPathCount, failedPathCount;
}
```

**Key Insight**: The `getVisualizationState()` method ALREADY provides most of what's needed! It includes:
- ✅ Context values (`nodeStates[contextName].contextValues`)
- ✅ Available transitions per path
- ✅ Multi-path concurrent execution tracking
- ✅ Aggregated node states

#### 3. Turn-Level Execution State (src/language/execution/turn-types.ts:56)

**Fine-Grained Execution Control:**
```typescript
interface TurnState {
  pathId: string;
  nodeName: string;
  conversationState: {
    messages: Array<{role, content}>;
    tools: ToolDefinition[];  // ✅ Available tools
    toolExecutions: ToolExecutionResult[];
    accumulatedText: string;
  };
  turnCount: number;
  isWaitingForTurn: boolean;
  systemPrompt: string;
  modelId?: string;
}
```

**Key Insight**: Turn state provides:
- ✅ Available tools for current conversation
- ✅ Tool execution history
- ✅ Conversation messages (LLM interaction context)

#### 4. Meta-Tool Manager (src/language/executor.ts:313)

**Dynamic Tool Construction:**
```typescript
getMetaToolManager(): MetaToolManager
```

Provides access to dynamically constructed tools and meta-tool system.

---

## Gap Analysis

### Critical Gaps

#### 1. RuntimeVisualizer Doesn't Use getVisualizationState()

**Problem**: `RuntimeVisualizer` converts executor context to a simplified format, losing rich multi-path state.

**Current Flow**:
```
Executor -> getContext() -> Legacy format -> RuntimeVisualizer
```

**Missed Opportunity**:
```
Executor -> getVisualizationState() -> Rich multi-path state (unused!)
```

**Impact**:
- No access to available transitions
- Limited context value visibility
- No multi-path execution tracking
- No tool visibility

#### 2. No Condensed Snapshot View

**Problem**: `generateRuntimeSummary()` only provides basic metrics, not execution affordances.

**Missing Information**:
- What tools are available at current node?
- What transitions can be taken?
- What context values are accessible?
- Which paths are active and where?
- What's the current turn state?

#### 3. No Turn State Integration

**Problem**: RuntimeVisualizer doesn't expose turn-level execution state.

**Missing Information**:
- Available tools in current conversation
- Tool execution history
- Conversation messages
- Turn count and progress

#### 4. No Tool Discovery

**Problem**: No way to see what tools are available at the current execution point.

**Needed**:
- Tools from machine definition (Input/Result tools)
- Dynamic tools from meta-tool manager
- Context read/write tools
- Transition tools

---

## Proposed Enhancements

### 1. Enhanced Runtime Snapshot

Add comprehensive snapshot method to RuntimeVisualizer:

```typescript
interface RuntimeSnapshot {
  // Current execution position(s)
  currentNodes: Array<{
    pathId: string;
    nodeName: string;
    nodeType: string;  // 'Task', 'Input', 'Result', 'Context'
  }>;

  // Available execution affordances
  affordances: {
    // Transitions available from current node(s)
    transitions: Array<{
      pathId: string;
      fromNode: string;
      toNode: string;
      isAutomatic: boolean;
      condition?: string;
      canTake: boolean;  // Evaluated condition
    }>;

    // Tools available at current node(s)
    tools: Array<{
      pathId: string;
      toolName: string;
      description: string;
      source: 'machine' | 'dynamic' | 'context' | 'meta';
      inputSchema: any;
    }>;

    // Contexts accessible from current node(s)
    contexts: Array<{
      name: string;
      attributes: Record<string, {
        type: string;
        currentValue: any;
        isWritable: boolean;
      }>;
    }>;
  };

  // Multi-path execution state
  paths: {
    active: number;
    completed: number;
    failed: number;
    waiting: number;
    details: Array<{
      id: string;
      status: PathStatus;
      currentNode: string;
      stepCount: number;
      isInTurn: boolean;
      turnCount?: number;
    }>;
  };

  // Turn-level state (if in turn execution)
  turnState?: {
    pathId: string;
    nodeName: string;
    turnCount: number;
    availableTools: ToolDefinition[];
    conversationLength: number;
    lastToolExecutions: ToolExecutionResult[];
  };

  // Execution metadata
  metadata: {
    totalSteps: number;
    elapsedTime: number;
    errorCount: number;
    isComplete: boolean;
    isPaused: boolean;
  };
}
```

### 2. Implementation Plan

#### Phase 1: Integrate getVisualizationState()

**File**: `src/language/runtime-visualizer.ts`

```typescript
class RuntimeVisualizer {
  private visualizationState: VisualizationState;

  constructor(executor: MachineExecutor) {
    // Use rich visualization state instead of legacy context
    this.visualizationState = executor.getVisualizationState();
    this.machineData = executor.getMachineDefinition();
  }

  public getVisualizationState(): VisualizationState {
    return this.visualizationState;
  }
}
```

#### Phase 2: Add Tool Discovery

**Integration Points**:
1. Extract tools from machine definition nodes
2. Query meta-tool manager for dynamic tools
3. List available context read/write operations
4. Show transition tools

```typescript
private getAvailableTools(pathId: string): ToolDefinition[] {
  const path = this.visualizationState.activePaths.find(p => p.id === pathId);
  if (!path) return [];

  const node = this.machineData.nodes.find(n => n.name === path.currentNode);
  const tools: ToolDefinition[] = [];

  // Tools from machine definition
  if (node?.type === 'Task') {
    // Extract tools from task attributes
    tools.push(...this.extractTaskTools(node));
  }

  // Dynamic tools from meta-tool manager
  // (requires passing executor reference)

  // Context tools
  tools.push(...this.extractContextTools());

  return tools;
}
```

#### Phase 3: Implement RuntimeSnapshot

```typescript
public generateRuntimeSnapshot(): RuntimeSnapshot {
  const snapshot: RuntimeSnapshot = {
    currentNodes: this.visualizationState.currentNodes.map(cn => ({
      pathId: cn.pathId,
      nodeName: cn.nodeName,
      nodeType: this.getNodeType(cn.nodeName)
    })),

    affordances: {
      transitions: this.visualizationState.availableTransitions.map(t => ({
        ...t,
        canTake: this.evaluateTransitionCondition(t)
      })),

      tools: this.visualizationState.activePaths.flatMap(path =>
        this.getAvailableTools(path.id)
      ),

      contexts: this.extractContextAffordances()
    },

    paths: {
      active: this.visualizationState.activePathCount,
      completed: this.visualizationState.completedPathCount,
      failed: this.visualizationState.failedPathCount,
      waiting: this.visualizationState.totalPaths -
               this.visualizationState.activePathCount -
               this.visualizationState.completedPathCount -
               this.visualizationState.failedPathCount,
      details: this.visualizationState.allPaths.map(p => ({
        id: p.id,
        status: p.status,
        currentNode: p.currentNode,
        stepCount: p.stepCount,
        isInTurn: false,  // Need executor.isInTurn()
        turnCount: undefined
      }))
    },

    turnState: this.extractTurnState(),

    metadata: {
      totalSteps: this.visualizationState.stepCount,
      elapsedTime: this.visualizationState.elapsedTime,
      errorCount: this.visualizationState.errorCount,
      isComplete: this.visualizationState.activePathCount === 0,
      isPaused: false  // Need executor state
    }
  };

  return snapshot;
}
```

#### Phase 4: Add Turn State Support

**Requirement**: Pass executor reference (not just snapshot) to access turn state.

```typescript
class RuntimeVisualizer {
  private executor: MachineExecutor;  // Keep reference

  constructor(executor: MachineExecutor) {
    this.executor = executor;
    this.visualizationState = executor.getVisualizationState();
    this.machineData = executor.getMachineDefinition();
  }

  private extractTurnState(): RuntimeSnapshot['turnState'] | undefined {
    const state = (this.executor as any).currentState;
    if (!state.turnState) return undefined;

    return {
      pathId: state.turnState.pathId,
      nodeName: state.turnState.nodeName,
      turnCount: state.turnState.turnCount,
      availableTools: state.turnState.conversationState.tools,
      conversationLength: state.turnState.conversationState.messages.length,
      lastToolExecutions: state.turnState.conversationState.toolExecutions
    };
  }
}
```

### 3. Usage Examples

#### CLI Interactive Mode Enhancement

```typescript
// In interactive-execution.ts
const visualizer = new RuntimeVisualizer(executor);
const snapshot = visualizer.generateRuntimeSnapshot();

// Show execution position
console.log(`\n📍 Current Position:`);
for (const node of snapshot.currentNodes) {
  console.log(`  ${node.pathId}: ${node.nodeName} (${node.nodeType})`);
}

// Show available transitions
console.log(`\n🔀 Available Transitions:`);
for (const trans of snapshot.affordances.transitions) {
  const canTake = trans.canTake ? '✓' : '✗';
  console.log(`  ${canTake} ${trans.fromNode} -> ${trans.toNode}`);
  if (trans.condition) {
    console.log(`     if: ${trans.condition}`);
  }
}

// Show available tools
console.log(`\n🔧 Available Tools:`);
for (const tool of snapshot.affordances.tools) {
  console.log(`  • ${tool.toolName}: ${tool.description}`);
}

// Show contexts
console.log(`\n📦 Contexts:`);
for (const ctx of snapshot.affordances.contexts) {
  console.log(`  ${ctx.name}:`);
  for (const [attr, info] of Object.entries(ctx.attributes)) {
    console.log(`    ${attr}: ${info.currentValue} (${info.type})`);
  }
}

// Show multi-path state
if (snapshot.paths.active > 1) {
  console.log(`\n🌲 Multi-Path Execution:`);
  console.log(`  Active: ${snapshot.paths.active}`);
  console.log(`  Completed: ${snapshot.paths.completed}`);
  console.log(`  Failed: ${snapshot.paths.failed}`);
}
```

#### Web Playground Integration

```typescript
// In playground component
const snapshot = visualizer.generateRuntimeSnapshot();

// Render execution control panel
<ExecutionControlPanel
  currentNodes={snapshot.currentNodes}
  transitions={snapshot.affordances.transitions}
  tools={snapshot.affordances.tools}
  contexts={snapshot.affordances.contexts}
  paths={snapshot.paths}
  onTakeTransition={(pathId, toNode) => {...}}
  onExecuteTool={(pathId, toolName, input) => {...}}
  onUpdateContext={(contextName, attribute, value) => {...}}
/>
```

---

## Multi-Path Execution Support

### Current Implementation: Already Supported!

The `VisualizationState` interface (src/language/execution/runtime-types.ts:199) is specifically designed for multi-path execution:

**Key Features**:
- `currentNodes`: Array of current positions (one per active path)
- `activePaths`: All active execution paths
- `nodeStates.activeInPaths`: Which paths are at each node
- `availableTransitions`: Per-path transition options

**Example Multi-Path State**:
```typescript
{
  currentNodes: [
    { pathId: 'path-1', nodeName: 'ProcessA' },
    { pathId: 'path-2', nodeName: 'ProcessB' }
  ],
  nodeStates: {
    'ProcessA': {
      visitCount: 1,
      isActive: true,
      activeInPaths: ['path-1'],
      contextValues: { status: 'processing' }
    },
    'ProcessB': {
      visitCount: 1,
      isActive: true,
      activeInPaths: ['path-2'],
      contextValues: { status: 'waiting' }
    }
  },
  availableTransitions: [
    { pathId: 'path-1', fromNode: 'ProcessA', toNode: 'Complete', ... },
    { pathId: 'path-2', fromNode: 'ProcessB', toNode: 'Error', ... }
  ]
}
```

### Visualization Challenge: How to Display Multiple Paths

**Option 1: Stacked View**
```
Path 1: [Start] -> [ProcessA] -> ...
Path 2: [Start] -> [ProcessB] -> ...
```

**Option 2: Merged Graph with Path Indicators**
```
        [Start]
        /     \
[ProcessA]  [ProcessB]
    (P1)       (P2)
```

**Option 3: Path Selector**
```
[Select Path: Path 1 ▼]
Currently at: ProcessA
Available transitions: -> Complete
```

**Recommendation**: Use merged graph with visual indicators for active paths. Show path-specific affordances in a side panel.

---

## Implementation Priority

### High Priority (MVP)

1. ✅ **Integrate getVisualizationState()** into RuntimeVisualizer
   - Replace legacy context format
   - Expose available transitions
   - Surface context values

2. ✅ **Add generateRuntimeSnapshot()** method
   - Condensed view of execution state
   - Available affordances (transitions, tools, contexts)
   - Multi-path support

3. ✅ **CLI interactive mode integration**
   - Show snapshot after each turn
   - Display available transitions and tools
   - Show context values

### Medium Priority

4. **Tool discovery and listing**
   - Extract tools from machine definition
   - Query meta-tool manager
   - Show tool input schemas

5. **Turn state integration**
   - Expose turn-level state
   - Show conversation progress
   - Display tool execution history

### Low Priority

6. **Condition evaluation**
   - Evaluate transition conditions
   - Show which transitions are actually available
   - Filter based on context state

7. **Web playground UI**
   - Visual execution control panel
   - Interactive transition buttons
   - Tool execution interface

---

## API Design Recommendations

### 1. Add to MachineExecutor

```typescript
class MachineExecutor {
  // High-level snapshot (delegates to RuntimeVisualizer)
  getRuntimeSnapshot(): RuntimeSnapshot {
    const visualizer = new RuntimeVisualizer(this);
    return visualizer.generateRuntimeSnapshot();
  }

  // Convenience methods
  getAvailableTransitions(pathId?: string): Transition[] {...}
  getAvailableTools(pathId?: string): ToolDefinition[] {...}
  getContextValues(): Record<string, Record<string, any>> {...}
  canTakeTransition(pathId: string, toNode: string): boolean {...}
}
```

### 2. Enhance RuntimeVisualizer

```typescript
class RuntimeVisualizer {
  // New methods
  generateRuntimeSnapshot(): RuntimeSnapshot {...}
  getAvailableTransitions(pathId?: string): Transition[] {...}
  getAvailableTools(pathId?: string): ToolDefinition[] {...}
  getContextAffordances(): ContextAffordance[] {...}

  // Existing methods (keep for backward compatibility)
  generateRuntimeVisualization(options?: RuntimeVisualizationOptions): string {...}
  generateRuntimeSummary(): {...} {...}
}
```

### 3. Add to VisualizingMachineExecutor

```typescript
class VisualizingMachineExecutor extends MachineExecutor {
  // Override to use enhanced visualizer
  getRuntimeSnapshot(): RuntimeSnapshot {
    this.visualizer = new RuntimeVisualizer(this);
    return this.visualizer.generateRuntimeSnapshot();
  }
}
```

---

## Testing Strategy

### Unit Tests

1. **RuntimeVisualizer.generateRuntimeSnapshot()**
   - Single path execution
   - Multi-path execution
   - With and without turn state
   - Empty/initial state

2. **Tool Discovery**
   - Extract tools from Task nodes
   - Context read/write tools
   - Dynamic tools

3. **Transition Evaluation**
   - Automatic transitions
   - Conditional transitions
   - No available transitions

### Integration Tests

1. **Multi-Path Workflow**
   - Create machine with multiple start nodes
   - Execute and verify snapshot shows all paths
   - Verify per-path affordances

2. **Turn-Level Execution**
   - Step through turn-by-turn
   - Verify turn state in snapshot
   - Check tool availability

3. **Context State**
   - Update context values
   - Verify reflected in snapshot
   - Check context affordances

### End-to-End Tests

1. **CLI Interactive Mode**
   - Start execution
   - Display snapshot
   - Verify all affordances shown
   - Test with multi-path machine

---

## Migration Path

### Phase 1: Internal Refactor (No Breaking Changes)

- Integrate `getVisualizationState()` into RuntimeVisualizer
- Add `generateRuntimeSnapshot()` method
- Keep existing methods for backward compatibility

### Phase 2: CLI Enhancement

- Update interactive mode to use snapshot
- Add snapshot display formatting
- Expose new affordances

### Phase 3: API Extension

- Add convenience methods to MachineExecutor
- Document new APIs
- Provide usage examples

### Phase 4: Deprecation (Future)

- Mark old summary format as deprecated
- Encourage migration to snapshot API
- Eventually remove legacy format

---

## Open Questions

1. **Tool Discovery**: How to access meta-tool manager tools without breaking encapsulation?
   - Option A: Pass executor reference to RuntimeVisualizer
   - Option B: Add `getAvailableTools()` method to MachineExecutor
   - **Recommendation**: Option B (cleaner API)

2. **Condition Evaluation**: Should snapshot evaluate transition conditions or just list them?
   - Option A: Just list conditions (simple, fast)
   - Option B: Evaluate and mark as takeable (more useful)
   - **Recommendation**: Option B with `canTake` flag

3. **Turn State Access**: Should visualizer access private executor state?
   - Option A: Pass full executor reference
   - Option B: Add public `getTurnState()` method
   - **Recommendation**: Option B (better encapsulation)

4. **Multi-Path UI**: How to visualize multiple active paths in Graphviz diagram?
   - Option A: Separate diagrams per path
   - Option B: Single diagram with path indicators
   - **Recommendation**: Option B with color coding

---

## Conclusion

The infrastructure for comprehensive execution control affordances already exists in DyGram! The main gaps are:

1. **RuntimeVisualizer doesn't leverage getVisualizationState()** - Quick fix
2. **No condensed snapshot view** - New method needed
3. **Tool discovery not exposed** - Need API additions

The proposed `generateRuntimeSnapshot()` method will provide a complete "window into the execution runtime" showing:
- ✅ Current execution position(s) across all paths
- ✅ Available transitions per path
- ✅ Available tools and their schemas
- ✅ Context values and write affordances
- ✅ Multi-path execution state
- ✅ Turn-level execution progress

This will enable powerful CLI debugging, web playground controls, and external monitoring tools.
