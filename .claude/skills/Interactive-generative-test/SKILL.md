---
name: dygram-test-execution
description: Run DyGram execution tests with intelligent agent responses, generating and managing test recordings for CI/CD. Use this skill when you need to execute DyGram tests with real Claude Code agent reasoning.
---

# DyGram Test Execution Skill

This skill helps run DyGram execution tests with the agent responder, generating and managing test recordings for CI/CD.

## Overview

The DyGram test suite includes execution tests that require an agent (like Claude) to respond to LLM invocation requests during test runs. This skill automates the workflow of:

1. Starting the agent responder in background
2. Running execution tests in interactive mode
3. Monitoring agent responses and test results
4. Analyzing and managing test recordings
5. Cleaning up processes

## Agent Responder Modes

There are two agent responder implementations:

### Intelligent Agent (Recommended)
**Script:** `scripts/agent-request-listener.js`
**Method:** Uses Claude API directly for actual AI reasoning
**Pros:** Makes genuinely intelligent decisions, better test coverage
**Cons:** Requires ANTHROPIC_API_KEY environment variable

This responder calls the Claude API to analyze each test request and make informed decisions about which tools to use. It understands context, semantics, and can handle complex scenarios that simple heuristics cannot.

### Heuristic Agent (Fallback)
**Script:** `scripts/test-agent-responder.js`
**Method:** Uses keyword matching and pattern heuristics
**Pros:** No API key required, faster
**Cons:** Limited to simple pattern matching, may not handle complex cases

This responder uses keyword matching (e.g., "error" → error transition) to make tool selections. Useful for simple tests or when API access is unavailable.

## Prerequisites

- Node.js and npm installed
- Dependencies installed (`npm ci`)
- Tests located in `test/validating/`
- **For Intelligent Agent:** `ANTHROPIC_API_KEY` environment variable set
- **For Heuristic Agent:** No additional requirements

## Step-by-Step Workflow

### Step 1: Start the Agent Responder

Start the agent responder in the background. Choose one of the two options:

#### Option A: Intelligent Agent (Recommended)

Uses actual Claude AI reasoning via API:

```bash
# Ensure API key is set
export ANTHROPIC_API_KEY="your-api-key-here"

# Start intelligent listener
node scripts/agent-request-listener.js &
```

**Expected output:**
```
🤖 Agent Request Listener Starting...
📁 Queue directory: .dygram-test-queue
🧠 Using Claude Code sub-agents for intelligent decisions
⏳ Waiting for test requests...
```

#### Option B: Heuristic Agent (Fallback)

Uses keyword matching heuristics:

```bash
node scripts/test-agent-responder.js &
```

**Expected output:**
```
🤖 Test Agent Responder Starting...
📁 Queue directory: .dygram-test-queue
⏳ Waiting for test requests...
```

**What to check:**
- Look for startup message
- Verify "⏳ Waiting for test requests..." appears
- Save the process info for later cleanup

### Step 2: Run Execution Tests

Run the tests in interactive mode, which will send requests to the agent responder:

```bash
DYGRAM_TEST_MODE=interactive npm test test/validating/ 2>&1 | tee /tmp/dygram-test-output.log
```

**What happens:**
- Tests create LLM invocation requests
- Agent responder receives and processes them
- Responses are recorded for CI playback
- Test results are displayed

**Duration:** Tests typically take 30-60 seconds to complete.

### Step 3: Monitor Agent Activity

While tests run, check that the agent responder is processing requests properly. Look for:

✅ **Good signs:**
- "📨 Received request:" messages appearing
- "🧠 Agent Decision:" showing reasoning
- "✅ Sent response" confirmations
- Tool names matching test expectations

❌ **Warning signs:**
- No requests received (responder not connected)
- Errors in decision-making
- Timeout messages
- Responder process crashed

### Step 4: Analyze Test Results

After tests complete, analyze the results:

```bash
# Check test summary
grep -E "Test Files|Tests" /tmp/dygram-test-output.log | tail -2

# Count new recordings
git status --short test/fixtures/recordings/ | grep "^??" | wc -l

# List recording categories
ls -1 test/fixtures/recordings/

# Check recent recordings
find test/fixtures/recordings/ -name "*.json" -mmin -5 -exec ls -lh {} \;
```

**What to report:**
- Total tests: X passed, Y failed
- New recordings created: N files
- Recording categories updated
- Any test failures or warnings

### Step 5: Review Recordings (Optional)

Inspect a sample recording to verify quality:

```bash
# Find a recent recording
RECORDING=$(find test/fixtures/recordings/ -name "*.json" -mmin -5 | head -1)

# View its content
cat "$RECORDING" | jq '.'
```

**Check for:**
- Proper request structure
- Agent reasoning is clear
- Tool selection makes sense
- Input parameters are valid

### Step 6: Cleanup

Stop the agent responder process:

```bash
# Find the process (works for both responder types)
ps aux | grep -E "(agent-request-listener|test-agent-responder)"

# Kill it gracefully (use whichever you started)
pkill -f agent-request-listener  # For intelligent agent
# OR
pkill -f test-agent-responder    # For heuristic agent
```

**Verify cleanup:**
- No hanging node processes
- Queue directory can be removed: `rm -rf .dygram-test-queue`

## Summary Report Format

Provide a summary in this format:

```
🧪 DyGram Test Execution Summary
================================

Test Results:
  ✅ Passed: X tests
  ❌ Failed: Y tests
  ⏭️  Skipped: Z tests

Agent Responder Activity:
  📨 Requests processed: N
  🧠 Decisions made: N
  ✅ Responses sent: N

Recordings:
  📝 New recordings: N files
  📁 Categories updated: list categories
  💾 Total size: X KB

Status: SUCCESS/FAILURE

Next Steps:
  - Commit recordings if tests passed
  - Investigate failures in /tmp/dygram-test-output.log
  - Review agent decisions if unexpected
```

## Common Issues

### Issue: Agent responder not receiving requests

**Symptoms:** Tests hang or timeout, no "📨 Received request" messages

**Solutions:**
1. Check that DYGRAM_TEST_MODE=interactive is set
2. Verify .dygram-test-queue directory exists
3. Restart agent responder
4. Check file permissions

### Issue: Tests fail with timeout errors

**Symptoms:** "Test timed out in 5000ms" errors

**Solutions:**
1. Agent responder might not be running
2. Queue might be in wrong location
3. Increase test timeout if needed
4. Check for responder errors

### Issue: Recordings not created

**Symptoms:** git status shows no new recordings

**Solutions:**
1. Tests might be using playback mode
2. InteractiveTestClient might not be configured to record
3. Check recordings directory permissions
4. Review test configuration

## Advanced Usage

### Running specific test files

```bash
# Just task execution tests
DYGRAM_TEST_MODE=interactive npm test test/validating/task-execution.test.ts

# Just tool execution tests
DYGRAM_TEST_MODE=interactive npm test test/validating/tool-execution.test.ts
```

### Using playback mode (no agent needed)

```bash
# Use existing recordings instead of agent
DYGRAM_TEST_MODE=playback npm test test/validating/
```

### Analyzing agent decision patterns

```bash
# Extract all reasoning from recordings
find test/fixtures/recordings/ -name "*.json" -exec jq -r '.response.reasoning' {} \; | sort | uniq -c | sort -rn

# Count tool selections
find test/fixtures/recordings/ -name "*.json" -exec jq -r '.response.response.content[]? | select(.type=="tool_use") | .name' {} \; | sort | uniq -c | sort -rn
```

## Integration with Scripts

This skill can be combined with helper scripts for automation. See:
- `scripts/run-execution-tests.sh` - Automated test execution
- `scripts/analyze-recordings.sh` - Recording analysis
- `scripts/clean-recordings.sh` - Recording cleanup

Run a script instead of manual steps:

```bash
./scripts/run-execution-tests.sh
```

## Notes

### Agent Responder Architecture

**Intelligent Agent (`agent-request-listener.js`):**
- Uses Claude API for actual AI reasoning
- Analyzes test context, tool descriptions, and semantic meaning
- Makes genuinely intelligent decisions like Claude Code would
- Requires API key but provides superior test coverage
- Best for comprehensive testing and complex state machines

**Heuristic Agent (`test-agent-responder.js`):**
- Uses keyword matching and pattern heuristics
- Fast and requires no API access
- Limited to simple pattern matching (e.g., "error" → error transition)
- May not handle complex scenarios requiring real reasoning
- Good for simple tests or CI environments without API access

### General Notes

- Recordings are deterministic and can be used in CI
- Each test run may create different recordings based on timing
- Recordings include timestamps and request IDs for debugging
- The skill is designed for interactive development use
- For best results, use the intelligent agent during development

## See Also

- Documentation: `docs/development/agent-responder-mcp-integration.md`
- Test documentation: `test/CLAUDE.md`
- Intelligent agent source: `scripts/agent-request-listener.js` (uses Claude API)
- Heuristic agent source: `scripts/test-agent-responder.js` (uses keyword matching)
- Interactive test client: `src/language/interactive-test-client.ts`
