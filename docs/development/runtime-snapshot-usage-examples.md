# RuntimeSnapshot Usage Examples

**Status**: In Progress - Implementation Started
**Date**: 2025-12-03 (Created), 2025-12-03 (Implementation Started)

## Implementation Checklist

### Core API ✅ COMPLETE
- [x] RuntimeSnapshot interface (`src/language/runtime-visualizer.ts`)
- [x] RuntimeVisualizer.generateRuntimeSnapshot() method
- [x] VisualizingMachineExecutor.getRuntimeSnapshot() convenience method
- **Commit**: `2dd5bd3` - feat: add RuntimeSnapshot API to RuntimeVisualizer

### Formatting Utilities ✅ COMPLETE
- [x] Add formatRuntimeSnapshot() - human-readable text output
- [x] Add formatRuntimeSnapshotJSON() - JSON output
- [x] Add formatRuntimeSnapshotCompact() - compact one-liner
- **Commit**: (pending) - feat: add RuntimeSnapshot formatting utilities
- **File**: `src/language/runtime-visualizer.ts`

### Web Playground Integration ✅ VERIFIED
- [x] ExecutionStateVisualizer already uses `getVisualizationState()` (line 538)
- [x] Updates automatically via `setOnStateChangeCallback` (line 512-514)
- [x] Executor calls callback on every state change (executor.ts:180, 557, 650)
- [x] Displays: summary stats, active paths, all paths, node states, transitions
- **Status**: Currently optimal - using VisualizationState directly is more efficient
- **Note**: RuntimeSnapshot is better suited for CLI/external tools than React components

**Analysis**:
- ExecutionStateVisualizer updates reactively at every turn (step or full execution)
- Using `getVisualizationState()` directly avoids unnecessary data transformation
- RuntimeSnapshot formatting utilities designed for text/JSON output, not React rendering
- No changes needed to ExecutionStateVisualizer

**Potential Future Enhancement** (Low Priority):
- [ ] Add tool affordances display (read/write context operations)
- [ ] Add turn state indicator (conversation progress)
- [ ] These would use snapshot data but render with React components

### CLI Integration (Pending)
- [ ] Add --snapshot flag to CLI interactive mode
- [ ] Add --format option (full, compact, json)
- [ ] Integrate into executeInteractiveTurn()
- **Target**: `src/cli/interactive-execution.ts`

### Testing (Pending)
- [ ] Add RuntimeSnapshot tests
- [ ] Test multi-path execution snapshots
- [ ] Test context value extraction
- [ ] Test tool discovery
- **Target**: `test/integration/runtime-visualization.test.ts`

### Documentation (Pending)
- [ ] Update this file with actual implementation examples
- [ ] Add API documentation
- [ ] Add CLI usage documentation

---

## Table of Contents

1. [CLI Interactive Mode Enhancement](#cli-interactive-mode-enhancement)
2. [Web Playground Integration](#web-playground-integration)
3. [External Monitoring Tools](#external-monitoring-tools)
4. [Testing and Debugging](#testing-and-debugging)

---

## CLI Interactive Mode Enhancement

### Before (Current Implementation)

```bash
$ dy execute --interactive myMachine.dy

⚡ Starting interactive execution: exec-20251203-140522
   Mode: interactive

Executing turn 1...
✓ Completed

Current node: ProcessData
Total steps: 1
Visited nodes: 2
```

**Problems**:
- No visibility into available transitions
- No tool information
- No context state
- No multi-path information

### After (With RuntimeSnapshot)

```bash
$ dy execute --interactive myMachine.dy

⚡ Starting interactive execution: exec-20251203-140522
   Mode: interactive

Executing turn 1...
✓ Completed

═══════════════════════════════════════════════════════════
  RUNTIME EXECUTION SNAPSHOT
═══════════════════════════════════════════════════════════

📍 CURRENT POSITION
───────────────────────────────────────────────────────────
  Path path-1: ProcessData (Task)

🔀 AVAILABLE TRANSITIONS
───────────────────────────────────────────────────────────
  ✓ ProcessData → ValidateResults
  ✓ ProcessData → HandleError [if error_occurred]

🔧 AVAILABLE TOOLS
───────────────────────────────────────────────────────────
  • read_config (context)
    Read values from config context
  • write_config (context)
    Write values to config context
  • read_state (context)
    Read values from state context
  • write_state (context)
    Write values to state context

📦 CONTEXTS
───────────────────────────────────────────────────────────
  config (Context)
    api_key: "***" (string)
    debug: true (boolean)
    max_retries: 3 (number)
  state (Context)
    status: "processing" (string)
    progress: 0.5 (number)
    items_processed: 42 (number)

📊 EXECUTION METADATA
───────────────────────────────────────────────────────────
  Total Steps: 1
  Elapsed Time: 234ms
  Error Count: 0
  Status: Running
  Paused: No
```

### Implementation

```typescript
// src/cli/interactive-execution.ts

import { EnhancedRuntimeVisualizer, formatRuntimeSnapshot } from '../language/runtime-snapshot.js';

async function executeInteractiveTurn(executor: MachineExecutor) {
  // Execute one turn
  const canContinue = await executor.step();

  // Generate and display snapshot
  const visualizer = new EnhancedRuntimeVisualizer(executor);
  const snapshot = visualizer.generateRuntimeSnapshot();

  console.log(formatRuntimeSnapshot(snapshot));

  return canContinue;
}
```

### Compact Mode (for scripting)

```bash
$ dy execute --interactive myMachine.dy --format compact

⚡ Executing turn 1...
✓ at: ProcessData | steps: 1 | 2 transitions | 4 tools | 2 contexts
```

### JSON Mode (for tooling)

```bash
$ dy execute --interactive myMachine.dy --format json

{
  "currentNodes": [
    {
      "pathId": "path-1",
      "nodeName": "ProcessData",
      "nodeType": "Task"
    }
  ],
  "affordances": {
    "transitions": [
      {
        "pathId": "path-1",
        "fromNode": "ProcessData",
        "toNode": "ValidateResults",
        "isAutomatic": false,
        "canTake": true
      }
    ],
    "tools": [
      {
        "pathId": "path-1",
        "toolName": "read_config",
        "description": "Read values from config context",
        "source": "context"
      }
    ],
    "contexts": [
      {
        "name": "config",
        "attributes": {
          "debug": {
            "type": "boolean",
            "currentValue": true,
            "isWritable": true
          }
        }
      }
    ]
  }
}
```

---

## Web Playground Integration

### Execution Control Panel Component

```typescript
// src/playground/components/ExecutionControlPanel.tsx

import React from 'react';
import { RuntimeSnapshot } from '../../language/runtime-snapshot';

interface ExecutionControlPanelProps {
  snapshot: RuntimeSnapshot;
  onTakeTransition: (pathId: string, toNode: string) => void;
  onExecuteTool: (pathId: string, toolName: string, input: any) => void;
  onUpdateContext: (contextName: string, attribute: string, value: any) => void;
  onStep: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function ExecutionControlPanel(props: ExecutionControlPanelProps) {
  const { snapshot } = props;

  return (
    <div className="execution-control-panel">
      {/* Current Position */}
      <section className="current-position">
        <h3>📍 Current Position</h3>
        {snapshot.currentNodes.map(node => (
          <div key={node.pathId} className="node-position">
            <span className="path-id">{node.pathId}</span>
            <span className="node-name">{node.nodeName}</span>
            <span className="node-type">{node.nodeType}</span>
          </div>
        ))}
      </section>

      {/* Available Transitions */}
      <section className="available-transitions">
        <h3>🔀 Available Transitions</h3>
        {snapshot.affordances.transitions.map(trans => (
          <button
            key={`${trans.pathId}-${trans.toNode}`}
            className={`transition-button ${trans.canTake ? 'enabled' : 'disabled'}`}
            disabled={!trans.canTake}
            onClick={() => props.onTakeTransition(trans.pathId, trans.toNode)}
          >
            {trans.fromNode} → {trans.toNode}
            {trans.condition && <span className="condition">if: {trans.condition}</span>}
          </button>
        ))}
      </section>

      {/* Available Tools */}
      <section className="available-tools">
        <h3>🔧 Available Tools</h3>
        {snapshot.affordances.tools.map(tool => (
          <div key={`${tool.pathId}-${tool.toolName}`} className="tool-card">
            <div className="tool-header">
              <span className="tool-name">{tool.toolName}</span>
              <span className="tool-source">{tool.source}</span>
            </div>
            <div className="tool-description">{tool.description}</div>
            <button
              className="execute-tool-button"
              onClick={() => showToolInputDialog(tool, props.onExecuteTool)}
            >
              Execute
            </button>
          </div>
        ))}
      </section>

      {/* Contexts */}
      <section className="contexts">
        <h3>📦 Contexts</h3>
        {snapshot.affordances.contexts.map(ctx => (
          <div key={ctx.name} className="context-card">
            <h4>{ctx.name}</h4>
            {Object.entries(ctx.attributes).map(([attr, info]) => (
              <div key={attr} className="context-attribute">
                <label>{attr}:</label>
                <input
                  type="text"
                  value={JSON.stringify(info.currentValue)}
                  disabled={!info.isWritable}
                  onChange={(e) => {
                    try {
                      const value = JSON.parse(e.target.value);
                      props.onUpdateContext(ctx.name, attr, value);
                    } catch {}
                  }}
                />
                <span className="attribute-type">{info.type}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Multi-Path State */}
      {snapshot.paths.details.length > 1 && (
        <section className="multi-path-state">
          <h3>🌲 Multi-Path Execution</h3>
          <div className="path-summary">
            <span>Active: {snapshot.paths.active}</span>
            <span>Completed: {snapshot.paths.completed}</span>
            <span>Failed: {snapshot.paths.failed}</span>
          </div>
          <div className="path-details">
            {snapshot.paths.details.map(path => (
              <div key={path.id} className={`path-item ${path.status}`}>
                <span className="path-id">{path.id}</span>
                <span className="current-node">{path.currentNode}</span>
                <span className="status">{path.status}</span>
                {path.isInTurn && <span className="turn">Turn {path.turnCount}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Execution Controls */}
      <section className="execution-controls">
        <button onClick={props.onStep} disabled={snapshot.metadata.isComplete}>
          Step
        </button>
        <button onClick={props.onPause} disabled={snapshot.metadata.isPaused}>
          Pause
        </button>
        <button onClick={props.onResume} disabled={!snapshot.metadata.isPaused}>
          Resume
        </button>
      </section>

      {/* Metadata */}
      <section className="metadata">
        <div className="stat">Steps: {snapshot.metadata.totalSteps}</div>
        <div className="stat">Time: {snapshot.metadata.elapsedTime}ms</div>
        <div className="stat">Errors: {snapshot.metadata.errorCount}</div>
        <div className="stat">Status: {snapshot.metadata.isComplete ? 'Complete' : 'Running'}</div>
      </section>
    </div>
  );
}
```

### Playground Integration

```typescript
// src/playground/components/PlaygroundView.tsx

function PlaygroundView() {
  const [executor, setExecutor] = useState<MachineExecutor | null>(null);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);

  useEffect(() => {
    if (!executor) return;

    // Update snapshot after each execution step
    const visualizer = new EnhancedRuntimeVisualizer(executor);
    setSnapshot(visualizer.generateRuntimeSnapshot());
  }, [executor]);

  const handleStep = async () => {
    if (!executor) return;
    await executor.step();

    // Update snapshot
    const visualizer = new EnhancedRuntimeVisualizer(executor);
    setSnapshot(visualizer.generateRuntimeSnapshot());
  };

  const handleTakeTransition = async (pathId: string, toNode: string) => {
    if (!executor) return;
    // Implement transition logic
    // (may require new executor API)
  };

  return (
    <div className="playground-view">
      <div className="editor-section">
        <CodeEditor />
      </div>
      <div className="execution-section">
        {snapshot && (
          <ExecutionControlPanel
            snapshot={snapshot}
            onTakeTransition={handleTakeTransition}
            onExecuteTool={handleExecuteTool}
            onUpdateContext={handleUpdateContext}
            onStep={handleStep}
            onPause={handlePause}
            onResume={handleResume}
          />
        )}
      </div>
      <div className="visualization-section">
        <GraphvizDiagram />
      </div>
    </div>
  );
}
```

---

## External Monitoring Tools

### REST API Endpoint

```typescript
// src/api/execution-monitor.ts

import express from 'express';
import { EnhancedRuntimeVisualizer } from '../language/runtime-snapshot.js';

const router = express.Router();

// Get runtime snapshot for an execution
router.get('/executions/:id/snapshot', async (req, res) => {
  const executionId = req.params.id;

  // Load execution
  const executor = await loadExecution(executionId);
  if (!executor) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  // Generate snapshot
  const visualizer = new EnhancedRuntimeVisualizer(executor);
  const snapshot = visualizer.generateRuntimeSnapshot();

  res.json(snapshot);
});

// Get compact status
router.get('/executions/:id/status', async (req, res) => {
  const executor = await loadExecution(req.params.id);
  if (!executor) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  const visualizer = new EnhancedRuntimeVisualizer(executor);
  const snapshot = visualizer.generateRuntimeSnapshot();

  // Return compact status
  res.json({
    currentNode: snapshot.currentNodes[0]?.nodeName || 'none',
    status: snapshot.metadata.isComplete ? 'complete' : 'running',
    steps: snapshot.metadata.totalSteps,
    errors: snapshot.metadata.errorCount,
    activePaths: snapshot.paths.active,
    availableTransitions: snapshot.affordances.transitions.length,
    availableTools: snapshot.affordances.tools.length
  });
});

export default router;
```

### Monitoring Dashboard

```bash
# Poll execution status
$ watch -n 1 'curl -s http://localhost:3000/api/executions/exec-123/status | jq'

{
  "currentNode": "ProcessData",
  "status": "running",
  "steps": 42,
  "errors": 0,
  "activePaths": 2,
  "availableTransitions": 3,
  "availableTools": 8
}
```

### WebSocket Real-Time Updates

```typescript
// src/api/execution-websocket.ts

import { WebSocket, WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (message: string) => {
    const request = JSON.parse(message);

    if (request.type === 'subscribe') {
      // Subscribe to execution updates
      const executionId = request.executionId;

      // Send snapshot on each execution step
      const intervalId = setInterval(async () => {
        const executor = await loadExecution(executionId);
        if (!executor) {
          clearInterval(intervalId);
          return;
        }

        const visualizer = new EnhancedRuntimeVisualizer(executor);
        const snapshot = visualizer.generateRuntimeSnapshot();

        ws.send(JSON.stringify({
          type: 'snapshot',
          data: snapshot
        }));

        // Stop if execution complete
        if (snapshot.metadata.isComplete) {
          clearInterval(intervalId);
        }
      }, 1000);

      // Clean up on disconnect
      ws.on('close', () => {
        clearInterval(intervalId);
      });
    }
  });
});
```

---

## Testing and Debugging

### Test Snapshot Assertions

```typescript
// test/integration/runtime-snapshot.test.ts

import { describe, it, expect } from 'vitest';
import { MachineExecutor } from '../src/language/executor.js';
import { EnhancedRuntimeVisualizer } from '../src/language/runtime-snapshot.js';

describe('RuntimeSnapshot', () => {
  it('should show available transitions at each node', async () => {
    const machineData = {
      title: 'Test Machine',
      nodes: [
        { name: 'Start', type: 'State' },
        { name: 'Process', type: 'Task' },
        { name: 'End', type: 'State' }
      ],
      edges: [
        { source: 'Start', target: 'Process' },
        { source: 'Process', target: 'End' }
      ]
    };

    const executor = new MachineExecutor(machineData);
    const visualizer = new EnhancedRuntimeVisualizer(executor);
    const snapshot = visualizer.generateRuntimeSnapshot();

    // Assert initial state
    expect(snapshot.currentNodes[0].nodeName).toBe('Start');
    expect(snapshot.affordances.transitions).toHaveLength(1);
    expect(snapshot.affordances.transitions[0].toNode).toBe('Process');

    // Step forward
    await executor.step();

    const snapshot2 = new EnhancedRuntimeVisualizer(executor).generateRuntimeSnapshot();
    expect(snapshot2.currentNodes[0].nodeName).toBe('Process');
    expect(snapshot2.affordances.transitions[0].toNode).toBe('End');
  });

  it('should show context values', async () => {
    const machineData = {
      title: 'Context Test',
      nodes: [
        {
          name: 'config',
          type: 'Context',
          attributes: [
            { name: 'debug', value: true },
            { name: 'max_retries', value: 3 }
          ]
        },
        { name: 'Start', type: 'State' }
      ],
      edges: []
    };

    const executor = new MachineExecutor(machineData);
    const visualizer = new EnhancedRuntimeVisualizer(executor);
    const snapshot = visualizer.generateRuntimeSnapshot();

    const config = snapshot.affordances.contexts.find(c => c.name === 'config');
    expect(config).toBeDefined();
    expect(config?.attributes.debug.currentValue).toBe(true);
    expect(config?.attributes.max_retries.currentValue).toBe(3);
  });

  it('should handle multi-path execution', async () => {
    const machineData = {
      title: 'Multi-Path Machine',
      nodes: [
        { name: 'Start1', type: 'State', annotations: [{ name: 'start' }] },
        { name: 'Start2', type: 'State', annotations: [{ name: 'start' }] },
        { name: 'End', type: 'State' }
      ],
      edges: [
        { source: 'Start1', target: 'End' },
        { source: 'Start2', target: 'End' }
      ]
    };

    const executor = new MachineExecutor(machineData);
    const visualizer = new EnhancedRuntimeVisualizer(executor);
    const snapshot = visualizer.generateRuntimeSnapshot();

    expect(snapshot.paths.active).toBe(2);
    expect(snapshot.currentNodes).toHaveLength(2);
    expect(snapshot.affordances.transitions).toHaveLength(2);
  });
});
```

### Debug Helper

```typescript
// src/language/debug-snapshot.ts

export function debugSnapshot(executor: MachineExecutor): void {
  const visualizer = new EnhancedRuntimeVisualizer(executor);
  const snapshot = visualizer.generateRuntimeSnapshot();

  console.log('\n🔍 DEBUG SNAPSHOT');
  console.log('═'.repeat(60));

  // Current state
  console.log('Current:', snapshot.currentNodes.map(n => n.nodeName).join(', '));

  // Transitions
  console.log('Transitions:', snapshot.affordances.transitions.length);
  for (const t of snapshot.affordances.transitions) {
    console.log(`  → ${t.toNode}${t.condition ? ` (if ${t.condition})` : ''}`);
  }

  // Tools
  console.log('Tools:', snapshot.affordances.tools.length);
  for (const tool of snapshot.affordances.tools) {
    console.log(`  • ${tool.toolName}`);
  }

  // Contexts
  console.log('Contexts:');
  for (const ctx of snapshot.affordances.contexts) {
    console.log(`  ${ctx.name}:`, JSON.stringify(
      Object.fromEntries(
        Object.entries(ctx.attributes).map(([k, v]) => [k, v.currentValue])
      )
    ));
  }

  console.log('═'.repeat(60));
}

// Usage in tests or debugging:
import { debugSnapshot } from './debug-snapshot.js';

const executor = new MachineExecutor(machineData);
await executor.step();
debugSnapshot(executor);  // Prints formatted snapshot
await executor.step();
debugSnapshot(executor);  // Shows state after next step
```

---

## Summary

The enhanced RuntimeSnapshot API provides:

1. **CLI**: Rich execution visibility for interactive debugging
2. **Web**: Interactive control panels with full affordance display
3. **API**: External monitoring and control capabilities
4. **Testing**: Comprehensive state assertions and debugging

This enables a complete "window into the execution runtime" showing contexts, tools, transitions, and multi-path execution state at every step.
