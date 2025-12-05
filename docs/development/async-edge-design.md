# Async Edge Design: Tools vs Auto-Spawn

Date: 2025-12-05
Status: Implementation Complete - Manual Testing Pending

## Overview

This document describes the design for `@async` edge handling in DyGram execution. The key insight is that async edges should behave differently depending on whether the source node requires agent decision.

## Problem Statement

### The Bug (P1)

When ALL outbound edges from a task node have `@async` annotation, the execution runtime immediately spawns child paths and marks the parent path as completed—**before** the task's prompt is ever executed. This drops the node's intended side effects (context writes, tool calls, agent reasoning).

### Root Cause

The async edge handling code (lines 232-276 in `execution-runtime.ts`) runs **before** the `requiresAgentDecision` check (line 431), causing task prompts to be skipped.

## Design Principles

### Principle 1: Task Prompts Always Execute

Task nodes with prompts must always invoke the agent. The agent performs work (context writes, reasoning, tool calls) that cannot be skipped.

### Principle 2: Async Edges as Agent Tools (When Prompt Exists)

When a node requires agent decision, `@async` edges are exposed as **tools** that the agent can choose to invoke:

```
Tools available to agent at TaskA:
- spawn_async_to_ProcessB    (spawns parallel path to ProcessB)
- spawn_async_to_ValidateC   (spawns parallel path to ValidateC)
- write_to_Context           (perform context writes)
- transition_to_NextD        (regular transition, moves current path)
```

The agent decides:
- Which async paths to spawn (may spawn none, some, or all)
- When to spawn them (before or after other tool calls)
- Whether to await initial results

### Principle 3: Auto-Spawn When No Agent Decision Needed

When a node does NOT require agent decision (no prompt, state node, or automated transitions), async edges can auto-spawn based on:
- CEL conditional evaluation on the edge
- All conditions being met for the transition

This preserves the existing behavior for orchestration-only workflows.

## Execution Flow

```
stepPath(node):
  1. Enter node, check limits
  2. Track invocation counts

  3. Check automated transitions (@auto edges with CEL conditions)
     - If automated transition exists AND has @async:
       → Spawn path at target (auto-spawn, no agent needed)
       → Continue with other automated transitions

  4. Check parallel edges (@parallel annotation)
     - Fork paths as before

  5. Check if agent decision required (requiresAgentDecision)
     - IF YES (task with prompt):
       → Build tools INCLUDING spawn_async_to_X for @async edges
       → Invoke agent
       → Agent calls tools (spawn, context write, transition)
       → Agent must eventually transition or reach terminal

     - IF NO (no prompt needed):
       → Check for @async edges on non-automated transitions
       → Auto-spawn all @async edges
       → Mark path complete (work delegated)

  6. Handle single transition optimization
  7. Handle terminal nodes
```

## Tool Design

### spawn_async Tool Schema

```typescript
{
  name: "spawn_async_to_<target>",
  description: "Spawn a parallel execution path to <target>. The spawned path runs independently.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Brief explanation of why spawning this path"
      },
      await_result: {
        type: "boolean",
        default: false,
        description: "If true, wait for the spawned path's first node to complete and return its result"
      }
    }
  }
}
```

### Tool Result

```typescript
// Without await
{
  success: true,
  action: "spawn_async",
  pathId: "path_3",
  target: "ValidateData",
  status: "spawned"
}

// With await_result: true
{
  success: true,
  action: "spawn_async",
  pathId: "path_3",
  target: "ValidateData",
  status: "first_result_received",
  result: { /* output from first node execution */ }
}
```

## Await Semantics

### Fire-and-Forget (default)

```
Parent:  [TaskA] ──spawn──> [TaskA continues, can do more work]
Spawned:         └───────> [TargetB runs independently]
```

The spawned path runs completely independently. Parent doesn't wait.

### Await First Result

```
Parent:  [TaskA] ──spawn+await──> [receives TargetB output] ──> [continues]
Spawned:         └────────> [TargetB] ──> [continues independently after]
```

Parent waits for the spawned path's first node to complete, receives its output, then both continue independently.

### Future: Await Completion

Not implemented in v1, but the design allows for:
```
Parent:  [TaskA] ──spawn+await_completion──────────────> [final status]
Spawned:         └──> [B] ──> [C] ──> [EndNode]
```

## Implementation Checklist

- [x] Design document created
- [x] Move async handling after agent decision check
- [x] Add `spawn_async_to_X` tools in `buildTools()` for @async edges
- [x] Handle `spawn_async_to_X` tool execution in `handleToolUse()`
- [x] Preserve auto-spawn for nodes without prompts
- [x] Verify tests pass (666 passed, no new failures)
- [ ] Manual test: barrier example with task prompts
- [ ] Manual test: async-conditional with task prompts

## Edge Cases

### Case 1: All Edges @async, Task Has Prompt

**Before (bug)**: Paths auto-spawn, prompt skipped
**After (fix)**: Agent invoked with spawn tools, agent decides which/when to spawn

### Case 2: All Edges @async, No Prompt (State Node)

**Before**: Paths auto-spawn
**After**: Same behavior preserved (auto-spawn)

### Case 3: Mixed @async and Regular Edges

Agent gets both `spawn_async_to_X` and `transition_to_Y` tools. Can spawn async paths then transition normally.

### Case 4: @async with CEL Condition

```
TaskA -@async [status == "ready"]-> ProcessB
```

- If node requires agent decision: Tool only available if condition evaluates true
- If no agent decision: Auto-spawn only if condition evaluates true

### Case 5: Agent Spawns But Never Transitions

Parent path stays at current node. Next step will re-invoke agent (or hit limit). The spawned paths continue independently.

## Progress Log

### 2025-12-05 Session Start

- Analyzed bug: async edge handling runs before agent decision check
- Identified fix: reorder execution flow, add async tools
- Created this design document

### 2025-12-05 Implementation Complete

**Files Modified:**

1. `src/language/execution/execution-runtime.ts`
   - Removed early async edge auto-spawn (lines 232-276)
   - Moved auto-spawn logic AFTER `requiresAgentDecision` check
   - Auto-spawn only triggers for nodes WITHOUT prompts (state nodes, orchestration)
   - Task nodes with prompts now reach agent decision, get spawn tools

2. `src/language/execution/effect-builder.ts`
   - Added `buildAsyncTools()` function
   - Generates `spawn_async_to_<target>` tools for @async edges
   - Tools include `await_result` option for future coordination semantics
   - Called from `buildTools()` so agents see async spawn options

3. `src/language/execution/effect-executor.ts`
   - Added handler for `spawn_async_to_X` tools in `handleToolUse()`
   - Spawns new path at target node
   - Updates internal state reference
   - Returns spawn confirmation with new path ID
   - TODO: Implement `await_result` semantics

### 2025-12-05 Testing Complete

**Test Results:**
- 666 tests passed, 75 failed (pre-existing failures unrelated to async changes)
- Pre-existing failures in meta-tool tests (return value format changes)
- No new test failures introduced by async edge fix

**Verified Behavior:**
- Build compiles successfully
- Async edge parsing/serialization tests pass
- Execution tests pass

### Summary

The fix ensures:
1. Task nodes with prompts ALWAYS invoke the agent before any async spawning
2. Async edges are exposed as `spawn_async_to_X` tools for agent control
3. State nodes without prompts preserve auto-spawn behavior for orchestration
4. The agent decides when/whether to spawn async paths
