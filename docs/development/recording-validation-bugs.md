# Recording Validation Bugs and Issues

**Status**: Investigation Complete
**Priority**: High
**Impact**: Test reliability, CI confidence

## Critical Bugs Identified

### Bug 1: Silent Stale Recording Usage

**Severity**: High
**Impact**: False positives/negatives in CI

**Description**:
When a source `.dy` file is modified, recordings created from the old version are still used during playback, causing tests to pass/fail with incorrect expectations.

**Reproduction**:
```bash
# Step 1: Create recording
cat > examples/test.dy << 'EOF'
machine "Test"
start "Begin" { prompt: "Start task" }
state pathA "Path A"
end "Done"

start -"go_a"-> pathA
pathA -> end
EOF

DYGRAM_TEST_MODE=interactive npm test  # Creates recording with "go_a" tool

# Step 2: Modify source file
cat > examples/test.dy << 'EOF'
machine "Test"
start "Begin" { prompt: "Start task" }
state pathB "Path B"  # Changed from pathA
end "Done"

start -"go_b"-> pathB  # Changed from go_a
pathB -> end
EOF

# Step 3: Run in playback mode
DYGRAM_TEST_MODE=playback npm test

# Result: Test uses old recording with "go_a" tool
# But current machine expects "go_b" tool
# → Tool mismatch error
```

**Current Behavior**:
```
❌ Error: Tool 'transition_to_pathA' not found in current machine
   Available tools: transition_to_pathB
```

**Expected Behavior**:
```
❌ Error: Recording validation failed
   Source file has changed since recording was created
   Recording hash: d7e1f4a8...
   Current hash:   a3f8b9c2...

   Please regenerate recordings:
   DYGRAM_TEST_MODE=interactive npm test
```

**Root Cause**:
- Recordings store request/response but not source file hash
- PlaybackTestClient loads recordings without validation
- No check that current source matches recorded source

**Fix**: Implement recording validation system (see recording-input-validation.md)

---

### Bug 2: No Invalidation Detection

**Severity**: Medium
**Impact**: Developer experience, maintenance burden

**Description**:
Developers have no way to know which recordings are stale without running tests and debugging failures.

**Current Workflow**:
```bash
# Developer modifies example
vim examples/testing/tool-execution/simple-router.dy

# Commits changes
git add examples/testing/tool-execution/simple-router.dy
git commit -m "Update simple router example"

# CI runs...
# Tests fail with confusing errors
# Developer must:
# 1. Realize recordings are stale (not obvious)
# 2. Regenerate recordings locally
# 3. Commit recordings
# 4. Push again
```

**Expected Workflow**:
```bash
# Developer modifies example
vim examples/testing/tool-execution/simple-router.dy

# Pre-commit hook detects stale recordings
npm run validate-recordings

❌ Stale recordings detected:
   - test/fixtures/recordings/generative-tool-execution/simple-router/

   Source file changed: examples/testing/tool-execution/simple-router.dy

   Regenerate recordings:
   DYGRAM_TEST_MODE=interactive npm test test/validating/generative-execution.test.ts

# Developer regenerates immediately
# Commits both source and recordings together
```

**Root Cause**:
- No validation tooling
- No pre-commit hooks
- No way to compare recordings vs source

**Fix**: Add validation CLI and pre-commit integration

---

### Bug 3: Partial Feature Implementation

**Severity**: Low
**Impact**: Code quality, future maintenance

**Description**:
The recording system has partial implementations and TODOs for features that would help with validation.

**Evidence**:

1. **Socket and HTTP modes not implemented**:
```typescript
// src/language/interactive-test-client.ts
private async sendRequestSocket(request: LLMInvocationRequest): Promise<void> {
    throw new Error('Socket mode not yet implemented');
}

private async sendRequestHttp(request: LLMInvocationRequest): Promise<void> {
    throw new Error('HTTP mode not yet implemented');
}
```

2. **Context fields partially populated**:
```typescript
// InteractiveTestClient
context: {
    testName?: string;      // Sometimes populated
    testFile?: string;      // Never populated
    currentNode?: string;   // Populated by executor
    machineTitle?: string;  // Never populated
}
```

3. **No source file tracking**:
```typescript
// Recording format
interface Recording {
    request: LLMInvocationRequest;
    response: LLMInvocationResponse;
    recordedAt: string;
    // Missing: sourceFile, contentHash, validation metadata
}
```

**Impact**:
- Can't implement proper validation without source metadata
- Context incomplete for debugging
- Alternative communication modes unavailable

**Fix**: Complete implementation of recording metadata

---

## Current Workarounds

### Workaround 1: Manual Tracking

Developers manually track which examples changed and regenerate corresponding recordings.

**Problems**:
- Error-prone
- Time-consuming
- Easy to forget

### Workaround 2: Regenerate All Recordings

After any example change, regenerate all recordings:

```bash
# Overkill solution
rm -rf test/fixtures/recordings/
DYGRAM_TEST_MODE=interactive npm test
```

**Problems**:
- Very time-consuming (100+ recordings)
- Requires agent availability for all tests
- Unnecessary churn in git history

### Workaround 3: Disable Playback Validation

Always run in interactive mode:

```bash
# In CI
DYGRAM_TEST_MODE=interactive npm test
```

**Problems**:
- Requires LLM API access in CI
- Slower tests
- Higher cost
- Non-deterministic

---

## Impact Assessment

### Development Impact

**Time Wasted**:
- Average 15-30 minutes per recording mismatch debugging
- Occurs ~2-3 times per week during active development
- **Estimated**: 1-2 hours per week

**Workflow Friction**:
- Extra commit cycle for recording regeneration
- Context switching during debugging
- Uncertainty about test failures

### CI Impact

**False Failures**:
- Tests fail due to stale recordings (not code issues)
- Developers waste time investigating
- Reduces confidence in CI

**False Passes**:
- Tests pass with stale recordings
- Don't catch actual regressions
- More dangerous than false failures

### Code Quality Impact

**Technical Debt**:
- Incomplete recording system
- Missing validation infrastructure
- Workarounds instead of proper solution

**Maintainability**:
- Hard to onboard new developers
- Complex debugging process
- Brittle test system

---

## Recommended Priority

1. **Phase 1: Basic Hash Validation** (HIGH - Do First)
   - Solves Bug 1 (silent stale usage)
   - Low effort, high impact
   - Immediate improvement to reliability

2. **Phase 2: Validation Tooling** (MEDIUM - Do Next)
   - Solves Bug 2 (no invalidation detection)
   - Improves developer experience
   - Enables automated workflows

3. **Phase 3: Complete Implementation** (LOW - Future)
   - Solves Bug 3 (partial implementation)
   - Better for long-term maintenance
   - Not blocking current use cases

---

## Example: Real Impact

### Before (Current State)

```bash
# Developer modifies example
$ git diff examples/testing/tool-execution/simple-router.dy
-start -"option_a"-> pathA
+start -"fast"-> pathA

# Commits change
$ git add examples/testing/tool-execution/simple-router.dy
$ git commit -m "Improve router edge labels"

# Push to CI
$ git push

# CI runs tests in playback mode
# Test fails: "Tool transition_to_option_a not found"
# Developer confused - they changed edge labels, not tool names

# 20 minutes of debugging later...
# Developer realizes: "Oh, recordings are stale"

# Regenerate locally
$ DYGRAM_TEST_MODE=interactive npm test test/validating/...
# Wait 10 minutes for agent responses...

# Commit recordings
$ git add test/fixtures/recordings/
$ git commit -m "Update recordings for router changes"
$ git push

# Total time: 30+ minutes
# Total commits: 2
# Developer frustration: High
```

### After (With Validation)

```bash
# Developer modifies example
$ git diff examples/testing/tool-execution/simple-router.dy
-start -"option_a"-> pathA
+start -"fast"-> pathA

# Pre-commit hook runs
$ git add examples/testing/tool-execution/simple-router.dy
$ git commit -m "Improve router edge labels"

⚠️  Stale recordings detected:
    test/fixtures/recordings/generative-tool-execution/simple-router/

    Regenerate recordings:
    DYGRAM_TEST_MODE=interactive npm test test/validating/...

    Or skip recordings in this commit:
    git commit --no-verify

# Developer regenerates immediately
$ DYGRAM_TEST_MODE=interactive npm test test/validating/...
# Wait 2 minutes (only affected test)

# Commit both together
$ git add test/fixtures/recordings/
$ git commit --amend --no-edit

# Push once
$ git push

# CI runs tests
✅ All tests pass
✅ All recordings validated

# Total time: 5 minutes
# Total commits: 1
# Developer frustration: None
```

---

## Next Steps

1. Review proposal in `recording-input-validation.md`
2. Implement Phase 1 (hash validation)
3. Test with subset of recordings
4. Roll out to all recordings
5. Add validation CLI and pre-commit hooks

## References

- Proposal: `docs/development/recording-input-validation.md`
- Recording implementation: `src/language/interactive-test-client.ts`
- Playback implementation: `src/language/playback-test-client.ts`
- Test suite: `test/validating/generative-execution.test.ts`
