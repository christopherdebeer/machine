# Context Read/Write Implementation Status and Issues

## Investigation Summary

Date: 2025-11-28
Context: Analyzing context read/write implementation and automated transition issues

## Current Implementation Status

### Context Read/Write Tools

**Location**: `src/language/execution/effect-builder.ts:134-226`

Context tools ARE being generated correctly:

1. **Read tools** (`read_<contextName>`) are created for edges:
   - `context -> task` (any edge from context to task)
   - `task -reads-> context` (semantic read edge)

2. **Write tools** (`write_<contextName>`) are created for edges:
   - `task -writes-> context` (semantic write edge)
   - `task -stores-> context` (semantic store edge)

### Critical Issues Found

#### Issue 1: Context Read/Write TODOs Not Implemented

**Location**: `src/language/execution/effect-executor.ts:354-372`

```typescript
// Context read
if (toolName.startsWith('read_')) {
    // TODO: Implement context reading from machine state
    return {
        success: true,
        context: toolName.replace('read_', ''),
        data: {}  // ❌ Returns empty object!
    };
}

// Context write
if (toolName.startsWith('write_')) {
    // TODO: Implement context writing (needs state mutation)
    return {
        success: true,
        context: toolName.replace('write_', ''),
        written: Object.keys(input.data || {})  // ❌ Doesn't actually write!
    };
}
```

**Impact**:
- Agents CANNOT actually read context values
- Agents CANNOT actually write context values
- Tools return success but don't perform any actual state mutations
- This makes context edges completely non-functional

#### Issue 2: Automated Transitions Bypass Agent Work

**Location**: `src/language/execution/execution-runtime.ts:226-245` and `src/language/execution/transition-evaluator.ts:164-172`

**The Problem**: Automated transition evaluation happens BEFORE checking if agent decision is required.

**Execution Order** (WRONG):
```
1. Check for automated transitions (evaluateAutomatedTransitions)
   └─> If simple deterministic condition matches, AUTO-TRANSITION immediately
2. Check if agent decision required (requiresAgentDecision)
   └─> NEVER REACHED because step 1 already transitioned!
```

**Example That Fails**:
```dygram
task start {
  prompt: "Update config.result with 'done'"
}

context config {
  result: ""
}

start -writes-> config;
start -when: "config.result"-> complete;
```

**What Should Happen**:
1. Agent executes prompt
2. Agent calls `write_config` tool to set `config.result = "done"`
3. After agent completes, check conditions
4. Transition to `complete` because `config.result` is now truthy

**What Actually Happens**:
1. `evaluateAutomatedTransitions` checks `-when: "config.result"->` edge
2. Condition `config.result` evaluates to `false` (empty string)
3. No automated transition
4. Falls through to agent decision
5. Agent executes BUT write_config doesn't actually mutate state
6. On next step, condition still false, machine gets stuck

**Even Worse Case**: If `config.result` somehow had a default value or was set elsewhere:
1. `evaluateAutomatedTransitions` finds simple condition `config.result` is truthy
2. AUTO-TRANSITIONS immediately to `complete`
3. Skips agent entirely - prompt never executed, no work done!

**Root Cause**: `evaluateAutomatedTransitions` (lines 164-172) auto-takes ANY edge with a simple deterministic condition that evaluates to true, REGARDLESS of whether the node has work to do (prompt, context writes, meta operations).

#### Issue 3: Catch Edges Not Recognized as Semantic Type

**Location**: `src/language/json/serializer.ts:899-924`

```typescript
private detectSemanticEdgeType(edgeValue: Record<string, unknown> | undefined, labels?: EdgeType[]): string | undefined {
    // Check inline edge value text
    if (edgeValue && edgeValue.text) {
        const text = edgeValue.text as string;
        if (text) {
            const lower = text.toLowerCase().trim();
            if (lower === 'writes' || lower === 'stores') return 'writes';
            if (lower === 'reads') return 'reads';
            // ❌ NO RECOGNITION OF 'catch' or 'error'!
        }
    }
    // ...
}
```

**Impact**:
- `-catch->` edges are treated as regular transition edges with label "catch"
- No special error handling semantics
- No `edge.type = 'catch'` marking for runtime to detect
- Error edges are indistinguishable from regular conditional transitions

**Default Error Handling**: There's no default errorCount threshold or automatic error catching. Errors just increment `state.metadata.errorCount` but don't trigger catch edges automatically.

## Proposed Fixes

### Fix 1: Implement Context Read/Write State Mutations

**Required Changes**:

1. **Add state context accessor to EffectExecutor**
   - EffectExecutor needs access to current execution state
   - Need methods to read/write context values from state

2. **Implement actual context reading**:
```typescript
if (toolName.startsWith('read_')) {
    const contextName = toolName.replace('read_', '');

    // Get context values from execution state
    const contextValues = this.getContextValues(contextName);

    // Filter to requested fields if specified
    const fields = input.fields;
    const data = fields
        ? Object.fromEntries(fields.map(f => [f, contextValues[f]]))
        : contextValues;

    return {
        success: true,
        context: contextName,
        data
    };
}
```

3. **Implement actual context writing**:
```typescript
if (toolName.startsWith('write_')) {
    const contextName = toolName.replace('write_', '');
    const dataToWrite = input.data || {};

    // Mutate execution state context
    this.writeContextValues(contextName, dataToWrite);

    return {
        success: true,
        context: contextName,
        written: Object.keys(dataToWrite),
        values: dataToWrite
    };
}
```

4. **Wire state access through effect executor chain**:
```typescript
// In executor.ts step() method
const agentResults = await this.effectExecutor.execute(
    effects,
    this.currentState  // ← Pass current state
);

// Then update state with mutations
this.currentState = this.applyContextMutations(this.currentState, agentResults);
```

### Fix 2: Prevent Auto-Transitions from Tasks with Prompts

**Option A: Skip simple condition auto-transitions for task nodes with prompts**

Modify `evaluateAutomatedTransitions` in `transition-evaluator.ts:164-172`:

```typescript
// Check edges with simple deterministic conditions
// BUT: Don't auto-transition from task nodes with prompts - they need agent work
const isTaskWithPrompt = NodeTypeChecker.isTask(node) && node.attributes?.find(a => a.name === 'prompt');

for (const edge of outboundEdges) {
    if (edge.condition && isSimpleCondition(edge.condition)) {
        // Skip auto-transition if task has prompt - agent must execute it first
        if (isTaskWithPrompt) {
            continue;
        }

        if (evaluateCondition(edge.condition, machineJSON, state, pathId)) {
            return createTransition(nodeName, edge.target, 'Simple deterministic condition', machineJSON);
        }
    }
}
```

**Option B: Check agent decision BEFORE automated transitions**

Reorder checks in `execution-runtime.ts:226-330`:

```typescript
// Check if agent decision required FIRST
// This ensures task nodes with prompts execute their work before auto-transitioning
if (requiresAgentDecision(machineJSON, nodeName)) {
    // Build tools to determine if node has actual work to do
    const tools = buildTools(machineJSON, nextState, path.id, nodeName);

    // ... existing agent invocation logic ...

    return {
        nextState,
        effects,
        status: 'waiting'
    };
}

// THEN check for automated transitions
// (only reached if agent work not required)
const automatedTransition = evaluateAutomatedTransitions(machineJSON, nextState, path.id);
if (automatedTransition) {
    // ... existing auto-transition logic ...
}
```

**Recommendation**: Use Option A - it's more targeted and maintains the optimization for state nodes while fixing the bug for task nodes.

### Fix 3: Add Catch Edge Semantic Detection

**Location**: `src/language/json/serializer.ts:899-924`

```typescript
private detectSemanticEdgeType(edgeValue: Record<string, unknown> | undefined, labels?: EdgeType[]): string | undefined {
    // Check inline edge value text
    if (edgeValue && edgeValue.text) {
        const text = edgeValue.text as string;
        if (text) {
            const lower = text.toLowerCase().trim();
            if (lower === 'writes' || lower === 'stores') return 'writes';
            if (lower === 'reads') return 'reads';
            if (lower === 'catch' || lower === 'error') return 'catch';  // ← ADD THIS
        }
    }

    // ... rest of method
}
```

**Then add catch edge handling logic**:

1. Mark catch edges as `edge.type = 'catch'`
2. Filter catch edges out of regular transitions in `isDataEdge`:
```typescript
function isDataEdge(edge: AnnotatedEdge, machineJSON: MachineJSON): boolean {
    // Catch/error edges are not data edges, but they're also not regular transitions
    // They should be available as transitions but with special handling
    if (edge.type === 'catch' || edge.type === 'error') {
        return false;  // Include in transitions
    }

    // ... existing logic ...
}
```

3. Implement automatic error catching:
```typescript
// In execution-runtime.ts, after tool execution errors
if (toolExecutionFailed) {
    // Increment error count
    nextState = incrementErrorCount(nextState);

    // Check for catch edges
    const catchEdge = outboundEdges.find(e => e.type === 'catch');
    if (catchEdge) {
        // Auto-transition to catch handler
        effects.push(buildLogEffect(
            'info',
            'transition',
            `Error caught, transitioning to: ${catchEdge.target}`,
            { reason: 'catch edge' }
        ));

        nextState = recordTransition(nextState, path.id, {
            from: nodeName,
            to: catchEdge.target,
            transition: 'error caught'
        });

        return { nextState, effects, status: 'continue' };
    }
}
```

## Implementation Priority

1. **CRITICAL**: Fix 1 (Context Read/Write) - Core functionality completely broken
2. **HIGH**: Fix 2 (Auto-Transition Bug) - Breaks prompt execution and agent work
3. **MEDIUM**: Fix 3 (Catch Edge Detection) - Nice to have, improves error handling

## Testing Plan

### Test 1: Context Write and Read

```dygram
machine "Context Test" {
  logLevel: "debug"
}

task write {
  prompt: "Set config.value to 'hello world'"
}

task read {
  prompt: "Read config.value and confirm it's 'hello world'"
}

context config {
  value: ""
}

write -writes-> config
read -reads-> config
write -> read
```

**Expected**:
- Agent uses `write_config` tool to set value
- Context state is actually mutated
- Agent uses `read_config` tool and sees the written value

### Test 2: Prompt Execution Before Auto-Transition

```dygram
machine "Prompt Priority Test" {
  logLevel: "debug"
}

task work {
  prompt: "Set result.done to true"
}

context result {
  done: false
}

work -writes-> result
work -when: "result.done"-> complete
```

**Expected**:
- Agent executes prompt FIRST
- Agent writes to context
- THEN automated transition evaluates condition
- Transitions to complete only AFTER work is done

### Test 3: Catch Edge Error Handling

```dygram
machine "Error Test" {
  logLevel: "debug"
}

task risky {
  prompt: "Try to use a non-existent tool"
}

state failed "Error handler"

risky -catch-> failed
```

**Expected**:
- Agent tries to use non-existent tool
- Tool execution fails
- Error count increments
- Catch edge is automatically taken
- Machine transitions to `failed` state

## Related Files

- `src/language/execution/effect-executor.ts` - Context read/write implementation
- `src/language/execution/transition-evaluator.ts` - Automated transition logic
- `src/language/execution/execution-runtime.ts` - Step execution order
- `src/language/json/serializer.ts` - Semantic edge type detection
- `src/language/execution/effect-builder.ts` - Tool generation (already correct)

## References

- `docs/development/execution-visualization-runtime-issues.md` - Runtime visualization issues
- User example from request - Dynamic Tool Builder with automated transition bug
