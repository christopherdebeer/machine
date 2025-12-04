# Interactive Recording Workflow - 2025-12-04

## Summary

Fixed critical bug in CLI interactive execution where stdin was incorrectly interpreted as machine source instead of LLM response data when resuming executions with `--id`. This enables the proper workflow for creating test recordings via CLI.

## The Problem

When trying to create test recordings using the interactive CLI workflow:

```bash
# Step 1: Start execution with recording
dy e examples/execution-features/context-basic.dy -i --record test/fixtures/recordings/...

# Step 2: Resume with LLM response via stdin
cat response.json | dy e --id exec-xxx --interactive
```

**Bug**: Step 2 would restart execution from scratch instead of resuming, because:
1. stdin was treated as machine source (not response data) when no filename was provided
2. The execution would create a NEW execution instead of resuming the existing one
3. This created an endless loop of "waiting for LLM response" without ever consuming the stdin

## Root Cause

In `src/cli/main.ts` lines 440-463, the logic for determining stdin purpose was:

```typescript
if (!process.stdin.isTTY) {
    const stdin = await readStdin();
    if (stdin && stdin.trim()) {
        if (!fileName) {
            // BUG: This treated stdin as machine source even when resuming!
            machineSource = stdin;
        } else {
            // Only treated as response data when fileName was provided
            inputData = JSON.parse(stdin);
        }
    }
}
```

**The issue**: When resuming with `--id`, the machine source is already saved in the execution state, so:
- No `fileName` is needed (it's loaded from state)
- stdin should ALWAYS be response data
- But the code incorrectly treated stdin as machine source

## The Fix

Modified `src/cli/main.ts` lines 445-457 and 461-463:

```typescript
if (!process.stdin.isTTY) {
    const stdin = await readStdin();
    if (stdin && stdin.trim()) {
        // FIX: Check if resuming OR file provided
        if (opts.id || fileName) {
            // Resuming or file provided: stdin is input/response data
            try {
                inputData = JSON.parse(stdin);
            } catch (e) {
                logger.error('Invalid JSON input from stdin');
                process.exit(1);
            }
        } else {
            // No file and no --id: stdin is machine source
            machineSource = stdin;
        }
    }
}

// Allow undefined machineSource when resuming
if (!machineSource && !opts.id) {
    logger.error('No machine source provided (file or stdin)');
    process.exit(1);
}
```

Also updated `src/cli/execution-state.ts` line 71 to make `machineSource` optional:

```typescript
export interface LoadExecutionOptions {
    machineSource?: string;  // Optional when resuming with executionId
    // ... other fields
}
```

And added validation in `src/cli/interactive-execution.ts` lines 164-167:

```typescript
if (!opts.machineSource) {
    throw new Error('Machine source required when creating new execution');
}
```

## Verification

Successfully created 3 recording files for `context-basic` test:

```bash
$ ls -la test/fixtures/recordings/generative-execution-features/context-basic/
total 40
-rw-r--r--  1 cdbeer  staff  5283  4 Dec 18:09 turn-1.json
-rw-r--r--  1 cdbeer  staff  4590  4 Dec 18:10 turn-2.json
-rw-r--r--  1 cdbeer  staff  3746  4 Dec 18:10 turn-3.json
```

Workflow that now works:

```bash
# Start execution
dy e examples/execution-features/context-basic.dy -i --record test/fixtures/recordings/.../context-basic
# → Execution pauses, outputs LLM request, saves state as exec-xxx

# Provide response (no machine file needed!)
cat response.json | dy e --id exec-xxx --interactive
# ✅ Resumes execution, consumes response, records turn, progresses to next node

# Continue with next response
cat response2.json | dy e --id exec-xxx --interactive
# ✅ Continues from saved state
```

## Recording Format

Recordings are saved in the correct structure:

```json
{
  "request": {
    "messages": [...],
    "tools": [...],
    "systemPrompt": "..."
  },
  "response": {
    "content": [...],
    "stop_reason": "end_turn"
  },
  "recordedAt": "2025-12-04T18:09:33.614Z",
  "signature": {
    "toolNames": ["tool1", "tool2"],
    "messageCount": 1,
    "contextKeys": []
  }
}
```

## Known Issues (Separate Bugs)

### 1. Recording Format Mismatch in Playback

**Status**: Recordings are created correctly, but playback fails with:
```
✗ context-basic: Cannot read properties of undefined (reading 'content')
```

**Cause**: `PlaybackTestClient` expects full Anthropic API response format with `id`, `model`, `role` fields, but our recordings have simplified format. The response object structure might be missing wrapper fields.

**Location**: Check `src/language/playback-test-client.ts` response parsing

**Next Steps**: 
- Compare recording format with what `PlaybackTestClient.matchRecording()` expects
- May need to adjust `StdinResponseClient.saveRecording()` format at line 133-166 in `src/language/stdin-response-client.ts`

### 2. Infinite Loop on Completion

**Status**: After reaching end node, execution loops forever printing "✅ Execution complete" repeatedly

**Symptoms**:
```bash
✅ Execution complete
💾 State saved
📊 steps: 2 | COMPLETE

📍 Current Node: end
✅ Execution complete
💾 State saved
📊 steps: 2 | COMPLETE
[... repeats forever ...]
```

**Cause**: Execution loop at `src/cli/interactive-execution.ts` lines 509-643 doesn't properly exit when status is 'complete'. The check at line 601-606 should break the loop but doesn't.

**Location**: 
- `src/cli/interactive-execution.ts` - `executeInteractiveTurn()` function
- Line 509: `while (iterationCount < maxIterations)`  
- Line 601-606: completion check that should return but doesn't

**Next Steps**:
- Debug why the completion check isn't exiting the loop
- Possibly execution status not being properly set to 'complete'
- May need to add additional break condition

## Files Modified

- ✅ `src/cli/main.ts` - Fixed stdin interpretation logic
- ✅ `src/cli/execution-state.ts` - Made machineSource optional
- ✅ `src/cli/interactive-execution.ts` - Added validation for new executions

## Testing Workflow

To create recordings for a test:

```bash
# 1. Start execution with recording enabled
dy e examples/execution-features/<test-name>.dy -i \
  --record test/fixtures/recordings/generative-execution-features/<test-name>

# 2. When paused, copy the requestId and create response JSON:
cat > /tmp/response.json << 'EOF'
{
  "type": "llm_response",
  "requestId": "<paste-request-id>",
  "reasoning": "Brief reasoning",
  "response": {
    "id": "msg-1",
    "model": "cli-interactive",
    "role": "assistant",
    "content": [
      {"type": "text", "text": "Response text"},
      {"type": "tool_use", "id": "tool-1", "name": "tool_name", "input": {...}},
      {"type": "tool_use", "id": "tool-2", "name": "transition_to_nextNode", "input": {"reason": "..."}}
    ],
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 500, "output_tokens": 150}
  }
}
EOF

# 3. Resume execution with response (note: no machine file needed!)
cat /tmp/response.json | dy e --id <exec-id> --interactive

# 4. Repeat steps 2-3 for each turn until complete
# Note: execution will loop forever at end - just Ctrl+C when you see "COMPLETE"

# 5. Verify recordings were created
ls -la test/fixtures/recordings/generative-execution-features/<test-name>/

# 6. Test in playback mode (currently broken due to format issue)
DYGRAM_TEST_MODE=playback npm test -- test/validating/generative-execution.test.ts -t "execution-features"
```

## Session 2 Fixes (2025-12-04 - Continued)

### ✅ FIXED: Recording playback format mismatch (HIGH PRIORITY)

**Problem**: Recordings created by `StdinResponseClient` didn't match `PlaybackTestClient` expectations, causing:
```
✗ context-basic: Cannot read properties of undefined (reading 'content')
```

**Root Cause**: `StdinResponseClient.saveRecording()` created simplified format without nested `response.response` structure.

**Solution** (commit 0811773):
- Updated `StdinResponseClient.saveRecording()` to match `PlaybackTestClient` `Recording` interface
- Added required fields: `type`, `requestId`, `timestamp`, `context`
- Changed response structure from `{ content, stop_reason }` to `{ response: { content, stop_reason } }`
- Updated 3 existing context-basic recordings to new format

**Files Modified**:
- `src/language/stdin-response-client.ts` lines 148-173
- `test/fixtures/recordings/generative-execution-features/context-basic/turn-*.json` (all 3)

**Result**: ✅ context-basic test now passes in playback mode with signature matching

---

### ✅ FIXED: Infinite loop on completion (MEDIUM PRIORITY)

**Problem**: After reaching end node, execution printed "✅ Execution complete" infinitely:
```
✅ Execution complete
💾 State saved
📊 steps: 2 | COMPLETE
📍 Current Node: end
✅ Execution complete
[... repeats forever ...]
```

**Root Cause**: `getExecutionStatus()` in `interactive-execution.ts` line 277 returned `'in_progress'` when `paths.length === 0`, but having no active paths means execution is **complete**, not in progress.

**Solution** (commit 7007b13):
- Changed `getExecutionStatus()` to return `'complete'` when no active paths
- Added comment explaining the logic
- This matches `execution-runtime.ts` line 116 behavior

**Files Modified**:
- `src/cli/interactive-execution.ts` lines 276-278

**Result**: ✅ Execution now exits cleanly after first completion, no infinite loop

---

## Next Session TODO

1. **Create remaining test recordings** (UNBLOCKED - ready to proceed)
   - Create recordings for 12 remaining execution-features tests:
     - async-conditional (has validation error - skip for now)
     - barrier-sync
     - codegen-schema
     - codegen-simple
     - codegen-tests
     - combined-advanced
     - context-complex
     - diamond-barrier
     - meta-improve-tool (check if meta-construct-tool has recordings to reference)
     - meta-introspection
     - template-conditional
     - template-simple
   - context-basic already complete (3 recordings) ✅

2. **Fix async-conditional validation error** (LOW PRIORITY)
   - Syntax error with edge labels
   - Line 38-39 in generated file
   - Already noted in previous work

## Success Metrics

✅ **Phase 1 (COMPLETE)**: stdin correctly treated as response data when resuming
- Can resume execution with `--id` without providing machine file
- stdin JSON is consumed as LLM response
- Recordings are created in correct directory structure

✅ **Phase 2 (COMPLETE)**: Recordings work in playback mode
- Recordings have correct format for `PlaybackTestClient` ✅
- Tests pass in playback mode with existing recordings ✅
- Execution exits cleanly when complete ✅

⏳ **Phase 3 (IN PROGRESS)**: All execution-features tests have recordings
- 14 total tests
- 1 complete (context-basic) ✅
- 1 validation error (async-conditional) ⚠️
- 12 need recordings created ⏳

## References

- Original request in conversation: "run test in playback mode and use `dy e -i --record` to ensure recordings exist"
- User constraint: "Do not write a script process each file turn by turn manually providing responses for playback"
- Test file: `test/validating/generative-execution.test.ts`
- Recording directory: `test/fixtures/recordings/generative-execution-features/`
- Examples source: `docs/examples/execution-features.md` (extracted to `examples/execution-features/`)
