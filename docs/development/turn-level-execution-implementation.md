# Turn-Level Execution Implementation

## Overview

This document describes the implementation of turn-level execution control, which enables fine-grained stepping through individual LLM invocations and tool uses within agent nodes.

## Problem Statement

Previously, execution could only be stepped at the **node level**. When an agent node executed, it would:
- Invoke the LLM multiple times
- Execute multiple tools
- Have reasoning between tool uses

All of this happened **invisibly** within a single `step()` call, with no ability to:
- Pause mid-agent-execution
- Inspect intermediate tool results
- Step through individual tool uses
- See reasoning between turns

## Solution Architecture

### 1. New Types (`turn-types.ts`)

#### ConversationState
Tracks the resumable state of an agent conversation:
```typescript
interface ConversationState {
    messages: Array<{ role: 'user' | 'assistant'; content: any }>;
    tools: ToolDefinition[];
    toolExecutions: ToolExecutionResult[];
    accumulatedText: string;
}
```

#### TurnState
Stored in `ExecutionState` to track active turn:
```typescript
interface TurnState {
    pathId: string;
    nodeName: string;
    conversationState: ConversationState;
    turnCount: number;
    isWaitingForTurn: boolean;
    systemPrompt: string;
    modelId?: string;
}
```

#### TurnResult
Result of executing a single turn:
```typescript
interface TurnResult {
    conversationState: ConversationState;
    toolExecutions: ToolExecutionResult[];
    text: string;
    isComplete: boolean;
    nextNode?: string;
    dynamicToolConstructed: boolean;
}
```

### 2. TurnExecutor (`turn-executor.ts`)

Handles turn-by-turn execution of agent conversations:

```typescript
class TurnExecutor {
    // Initialize conversation from LLM effect
    initializeConversation(effect: InvokeLLMEffect): ConversationState
    
    // Execute a single turn
    async executeTurn(
        conversationState: ConversationState,
        nodeName: string
    ): Promise<TurnResult>
    
    // Check turn limit
    hasReachedTurnLimit(turnCount: number): boolean
}
```

**Key Features:**
- Executes ONE LLM invocation per call
- Processes all tool uses from that invocation
- Tracks dynamic tool construction
- Detects conversation completion (no tools or transition)
- Maintains conversation history for resumption

### 3. MachineExecutor Extensions

Added turn-level stepping methods:

```typescript
class MachineExecutor {
    // Execute a single turn (public API)
    async stepTurn(): Promise<TurnStepResult>
    
    // Begin a new turn (private)
    private async beginTurn(): Promise<TurnStepResult>
    
    // Continue existing turn (private)
    private async continueTurn(): Promise<TurnStepResult>
    
    // Check if in turn (for UI)
    isInTurn(): boolean
    
    // Get turn state (for UI)
    getTurnState(): TurnState | undefined
}
```

### 4. ExecutionState Extension

Added optional `turnState` field to track active turns:

```typescript
interface ExecutionState {
    // ... existing fields
    turnState?: TurnState;  // Present when in mid-turn
}
```

### 5. Logger Extensions

Added new log categories for turn-level operations:
- `'turn'` - Turn-level execution events
- `'tool'` - Tool execution events  
- `'agent'` - Agent reasoning events

## Usage

### Basic Turn Stepping

```typescript
const executor = await MachineExecutor.create(machineJSON, config);

// Step through turns one at a time
while (true) {
    const result = await executor.stepTurn();
    
    console.log(`Turn result: ${result.status}`);
    console.log(`Tools used: ${result.toolExecutions.length}`);
    console.log(`Text: ${result.text}`);
    
    if (result.status === 'complete') {
        break;
    }
}
```

### Checking Turn State

```typescript
// Check if currently in a turn
if (executor.isInTurn()) {
    const turnState = executor.getTurnState();
    console.log(`Turn ${turnState.turnCount} for node ${turnState.nodeName}`);
    console.log(`Messages: ${turnState.conversationState.messages.length}`);
    console.log(`Tools executed: ${turnState.conversationState.toolExecutions.length}`);
}
```

### Mixed Stepping

```typescript
// Can mix node-level and turn-level stepping
await executor.step();  // Step entire node

// Or step through turns within a node
await executor.stepTurn();  // First turn
await executor.stepTurn();  // Second turn
// ... until complete
```

## Execution Flow

### Node-Level Step (existing)
```
step() → runtime.step() → effectExecutor.execute()
  → executeInvokeLLM() → [ENTIRE CONVERSATION]
  → applyAgentResult()
```

### Turn-Level Step (new)
```
stepTurn() → beginTurn() or continueTurn()
  → turnExecutor.executeTurn() → [SINGLE LLM INVOCATION]
  → process tool uses
  → update turnState
  → applyContextWrites()
  → if complete: applyAgentResult()
```

## Key Differences

| Aspect | Node-Level (`step()`) | Turn-Level (`stepTurn()`) |
|--------|----------------------|---------------------------|
| Granularity | Entire node execution | Single LLM invocation |
| Tool Loop | Hidden, automatic | Exposed, steppable |
| State | No intermediate state | `turnState` tracks progress |
| Completion | Node transition | Turn completion or node transition |
| Use Case | Normal execution | Debugging, inspection, education |

## Benefits

1. **Fine-grained Control**: Step through individual LLM invocations
2. **Better Debugging**: See exactly what the agent is thinking/doing at each turn
3. **Inspection**: Examine tool results before next turn
4. **Pause Anywhere**: Stop mid-agent-execution
5. **Backward Compatible**: Existing `step()` still works
6. **Educational**: Understand multi-turn agent behavior

## Pause Capability

### Pause at Turn Boundaries

The executor supports pausing execution at turn boundaries:

```typescript
// Request pause during execution
executor.requestPause();

// Execution will pause after current turn completes
// Returns control to UI with status 'paused'

// Resume options:
// 1. Continue execution
await executor.execute();  // Resumes until completion or next pause

// 2. Single-step one turn
await executor.stepTurn();  // Executes one turn, remains paused
```

### UI Integration

**Pause Button**: Interrupts running execution at next turn boundary
- Only enabled during 'running' status
- Sets status to 'paused' when turn completes
- Logs: "Pause requested - will stop at next turn boundary"

**Resume Options** (when paused):
1. **Execute Button**: Resumes continuous execution
2. **Step Turn Button**: Executes single turn, stays paused

### User Flow

```
1. Click "Execute" → status: running
2. Click "Pause" → pause requested
3. Current turn completes → status: paused
4. Status bar shows: "Paused | Turn: 3 | Node: analyze_data | Tools Used: 5"
5. Options:
   - Click "Execute" → resume continuous execution
   - Click "Step Turn" → execute one turn, stay paused
   - Click "Stop" → exit completely
```

## Implementation Status

- [x] Turn-level type definitions
- [x] TurnExecutor class
- [x] MachineExecutor turn methods
- [x] ExecutionState extension
- [x] Logger category extensions
- [x] Pause state management
- [x] Pause at turn boundaries
- [x] UI integration (ExecutionControls)
- [x] Pause button
- [x] Resume from pause (both options)
- [ ] Turn-level visualization
- [ ] Testing

## Next Steps

### UI Integration
Add "Step Turn" button to ExecutionControls:
```typescript
<Button onClick={handleStepTurn}>⏩ Step Turn</Button>
```

Display turn state:
```typescript
<StatusItem>
    <StatusLabel>Turn:</StatusLabel>
    <StatusValue>{turnState?.turnCount || 0}</StatusValue>
</StatusItem>
```

### Visualization
- Highlight current turn in execution log
- Show tool execution sequence within turns
- Display conversation messages in inspector
- Add turn timeline view

### Testing
- Unit tests for TurnExecutor
- Integration tests for stepTurn()
- Test turn state persistence
- Test mixed stepping scenarios

## Technical Notes

### Type Compatibility
- `TurnState` is imported into `runtime-types.ts` to avoid duplication
- Tool definitions use type casting for compatibility between claude-client and runtime-types

### Private Method Access
- `beginTurn()` and `continueTurn()` access `effectExecutor['handleToolUse']` using bracket notation
- This is necessary to reuse tool handling logic without exposing it publicly

### State Management
- Turn state is cleared when conversation completes
- Context writes are applied after each turn
- Agent results are only applied when turn completes with transition

## Related Files

- `src/language/execution/turn-types.ts` - Type definitions
- `src/language/execution/turn-executor.ts` - Turn execution logic
- `src/language/executor.ts` - MachineExecutor extensions
- `src/language/execution/runtime-types.ts` - ExecutionState extension
- `src/language/execution/logger.ts` - Log category extensions
- `src/components/ExecutionControls.tsx` - UI integration (pending)
