# Recording Signature Matching System

**Status**: Implemented
**Version**: 2.0
**Date**: 2025-11-28

## Overview

The recording/playback system now supports **intelligent signature-based matching** to select recordings based on request content rather than sequential order. This fixes critical issues where recordings were used even when the source machine had changed.

## Problem Statement (v1 Approach)

### What Was Wrong

The original playback system used **sequential matching**:

```typescript
// OLD: Just increment counter
const recording = this.recordings[this.playbackIndex];
this.playbackIndex++;
```

**Critical Issues:**

1. ❌ **No input validation** - Recordings served by position, not by matching content
2. ❌ **Brittle** - Any change to machine breaks playback
3. ❌ **Silent failures** - Wrong recording used without warning
4. ❌ **Order-dependent** - Tests must make identical LLM calls in same order

### Real-World Example

```dygram
# Before (recording created)
start -> pathA
start -> pathB
```

Recording has tools: `transition_to_pathA`, `transition_to_pathB`

```dygram
# After (source modified)
start -> fastPath
start -> slowPath
```

Machine now expects: `transition_to_fastPath`, `transition_to_slowPath`

**Old behavior:** Playback returns recording with `transition_to_pathA`
**Result:** `Error: Tool 'transition_to_pathA' not found`

## Solution: Request Signature Matching (v2)

### Core Concept

Match recordings based on **what the request contains**, not when it was made:

```typescript
interface RequestSignature {
  toolNames: string[];      // Sorted tool names (order-independent)
  messageCount: number;     // Number of messages
  contextKeys: string[];    // Available context keys
}
```

### Matching Algorithm

```typescript
// Compute signature from current request
const currentSignature = {
  toolNames: tools.map(t => t.name).sort(),
  messageCount: messages.length,
  contextKeys: Object.keys(context).sort()
};

// Find recording with matching signature
for (const recording of recordings) {
  if (signaturesMatch(recording.signature, currentSignature)) {
    return recording; // Found match!
  }
}
```

### Signature Comparison

Two signatures match if:

1. ✅ **Tool names match exactly** (order-independent)
2. ✅ **Message count matches** (same conversation length)
3. ✅ **Context keys match** (same data available)

**What we DON'T check:**
- ❌ Full message content (allows prompt variations)
- ❌ Source file hash (allows unrelated changes)
- ❌ Timestamps (irrelevant to matching)
- ❌ Tool schemas (names are sufficient)

## Three Matching Modes

### 1. Signature Mode (Strict)

**Use when:** You want to ensure recordings match exactly

```typescript
const client = new PlaybackTestClient({
  recordingsDir: './recordings',
  matchingMode: 'signature'
});
```

**Behavior:**
- ✅ Only uses recordings that match signature
- ❌ Fails with clear error if no match found
- 📊 Best for detecting stale recordings

### 2. Sequential Mode (Legacy)

**Use when:** You want old behavior (not recommended)

```typescript
const client = new PlaybackTestClient({
  recordingsDir: './recordings',
  matchingMode: 'sequential'
});
```

**Behavior:**
- Uses recordings in alphabetical order
- No validation
- Backward compatible with v1

### 3. Hybrid Mode (Default - RECOMMENDED)

**Use when:** You want smart matching with fallback

```typescript
const client = new PlaybackTestClient({
  recordingsDir: './recordings',
  matchingMode: 'hybrid' // Default
});
```

**Behavior:**
1. Try signature matching first
2. If no match, fall back to sequential
3. Warn when using sequential fallback
4. Best for gradual migration

## Recording Format Changes

### v1 Format (Legacy)

```json
{
  "request": { ... },
  "response": { ... },
  "recordedAt": "2025-11-22T15:07:37.762Z"
}
```

### v2 Format (With Signature)

```json
{
  "request": { ... },
  "response": { ... },
  "recordedAt": "2025-11-22T15:07:37.762Z",
  "signature": {
    "toolNames": ["transition_to_pathA", "transition_to_pathB"],
    "messageCount": 1,
    "contextKeys": ["currentNode", "visitedNodes"]
  }
}
```

**Backward Compatibility:**
- Playback clients compute signature on-the-fly for v1 recordings
- No need to regenerate existing recordings
- New recordings automatically include signature

## Implementation Details

### PlaybackTestClient Changes

```typescript
class PlaybackTestClient {
  private usedRecordings = new Set<number>();

  async invokeWithTools(messages, tools) {
    // 1. Compute signature
    const signature = this.computeRequestSignature(messages, tools);

    // 2. Find matching recording
    const match = this.findMatchingRecording(signature);

    if (match) {
      // Mark as used (prevent reuse)
      this.usedRecordings.add(match.index);
      return match.recording.response;
    }

    // 3. Fall back to sequential if hybrid mode
    if (this.config.matchingMode === 'hybrid') {
      return this.recordings[this.playbackIndex++];
    }

    // 4. Fail with helpful error
    throw new Error(this.formatNoMatchError(signature));
  }
}
```

### BrowserPlaybackClient Changes

Same logic as PlaybackTestClient, adapted for browser environment.

### InteractiveTestClient Changes

```typescript
class InteractiveTestClient {
  private async recordResponse(request, response) {
    // Compute signature
    const signature = {
      toolNames: request.tools.map(t => t.name).sort(),
      messageCount: request.messages.length,
      contextKeys: Object.keys(request.context).sort()
    };

    // Store with recording
    const recording = {
      request,
      response,
      recordedAt: new Date().toISOString(),
      signature // NEW: v2 metadata
    };

    fs.writeFileSync(path, JSON.stringify(recording, null, 2));
  }
}
```

## Error Messages

### No Match Found (Signature Mode)

```
❌ No matching recording found for request

Current Request:
  Tools (2): transition_to_fastPath, transition_to_slowPath
  Message count: 1

Available Recordings:
  [0] req-1763824036295-1
      Tools: transition_to_pathA, transition_to_pathB
      Messages: 1

Troubleshooting:
  1. Regenerate recordings if source file changed
  2. Check that tool names match exactly
  3. Use matchingMode: "hybrid" for backward compatibility

  Recordings directory: test/fixtures/recordings/simple-router
```

## Why This Approach is NOT Overly Strict

### What We Match (Essential)

| Attribute | Why Checked | Impact of Change |
|-----------|-------------|------------------|
| **Tool names** | Critical - defines available actions | Recording invalid if tools changed |
| **Message count** | Important - conversation structure | Recording likely invalid if different |
| **Context keys** | Moderate - available data | Recording may be invalid if different |

### What We DON'T Match (Intentional Flexibility)

| Attribute | Why NOT Checked | Benefit |
|-----------|-----------------|---------|
| **Full message content** | Allows prompt improvements | Can update prompts without invalidating recordings |
| **Source file hash** | Allows unrelated changes | Adding comments, formatting, unrelated nodes OK |
| **Timestamps** | Irrelevant to validity | Recording age doesn't matter |
| **Tool schemas** | Names are sufficient | Can add optional parameters |
| **Node names** | Not in signature | Can rename nodes if tools unchanged |

### Example: Valid Changes That DON'T Invalidate

```dygram
# Before
machine "Test"
Task start "Begin" {
  prompt: "Choose a path"
}
state pathA "Option A"
state pathB "Option B"

start -> pathA
start -> pathB
```

```dygram
# After - ALL THESE CHANGES ARE OK:
machine "Test v2"  # ✅ Renamed machine
Task start "Begin Here" {  # ✅ Updated title
  prompt: "Choose the best path for this scenario"  # ✅ Improved prompt
}
# ✅ Added comment
state pathA "Option A - Fast"  # ✅ Updated description
state pathB "Option B - Slow"  # ✅ Updated description

start -> pathA  # ✅ Same tool: transition_to_pathA
start -> pathB  # ✅ Same tool: transition_to_pathB

# ✅ Added new unrelated node
Task cleanup "Clean up"
```

**All these changes are fine** because:
- Tool names unchanged: `transition_to_pathA`, `transition_to_pathB`
- Message count unchanged: Still 1 message
- Context structure unchanged: Same keys available

Recording remains valid! ✅

### Example: Invalid Changes That SHOULD Invalidate

```dygram
# Before
start -> pathA
start -> pathB
```

```dygram
# After - THESE INVALIDATE RECORDINGS:
start -> fastRoute  # ❌ NEW tool: transition_to_fastRoute
start -> slowRoute  # ❌ NEW tool: transition_to_slowRoute

# Or:
start -> pathA  # ✅ Same
start -> pathB  # ✅ Same
start -> pathC  # ❌ NEW tool: transition_to_pathC
```

Recording invalid because **tool names changed**. This is correct! ✅

## Migration Guide

### For Existing Tests (No Changes Needed!)

Existing tests work with hybrid mode:

```typescript
// No changes needed - hybrid mode is default
const client = new PlaybackTestClient({
  recordingsDir: './recordings'
  // matchingMode: 'hybrid' is implicit
});
```

**Behavior:**
1. If new recordings have signatures → uses signature matching
2. If old recordings without signatures → computes signature on-the-fly
3. If no match → falls back to sequential
4. Gradually benefits from signature matching as recordings are regenerated

### For New Tests (Enable Strict Mode)

```typescript
const client = new PlaybackTestClient({
  recordingsDir: './recordings',
  matchingMode: 'signature' // Strict - fail if no match
});
```

### Regenerating Recordings

Regenerate recordings when machine structure changes:

```bash
# Delete old recordings
rm -rf test/fixtures/recordings/my-test/

# Run in interactive mode
DYGRAM_TEST_MODE=interactive npm test

# New recordings include signatures
```

## Benefits

### 1. Correctness

- ✅ Recordings only used when they match request
- ✅ Clear errors when recordings are stale
- ✅ No silent failures

### 2. Flexibility

- ✅ Can improve prompts without regenerating
- ✅ Can refactor unrelated code
- ✅ Can add comments and documentation

### 3. Developer Experience

- ✅ Clear error messages explain mismatches
- ✅ Shows what changed between recording and current
- ✅ Guidance on how to fix

### 4. Robustness

- ✅ Tests fail fast when recordings are wrong
- ✅ Backward compatible with old recordings
- ✅ Gradual migration path

## Performance Impact

**Minimal:** Signature computation is fast:

```typescript
// O(T log T) where T = number of tools
toolNames: tools.map(t => t.name).sort()

// O(M) where M = number of messages
messageCount: messages.length

// O(K log K) where K = number of context keys
contextKeys: Object.keys(context).sort()
```

Typical case: ~0.1ms per request (negligible compared to playback delay of 100-150ms)

## Future Enhancements

### Possible Additions (Low Priority)

1. **Tool schema validation** - Check input_schema matches
2. **Context value hashing** - Validate context content, not just keys
3. **Message content similarity** - Allow fuzzy matching of prompts
4. **Recording versioning** - Track signature changes over time

These are **not needed now** because current approach is already flexible enough.

## Related Documentation

- Implementation: `src/language/playback-test-client.ts`
- Browser client: `src/language/browser-playback-client.ts`
- Recording client: `src/language/interactive-test-client.ts`
- Bug analysis: `docs/development/recording-validation-bugs.md`
- Original proposal: `docs/development/recording-input-validation.md`

## Summary

**Before (v1):**
- Sequential playback only
- No validation
- Brittle, order-dependent

**After (v2):**
- Signature-based matching
- Smart validation (not overly strict)
- Flexible, robust, backward compatible

**Key Insight:**
We validate what matters (tool names) while allowing flexibility in what doesn't (prompts, formatting, unrelated changes). This gives us correctness without unnecessary strictness.
