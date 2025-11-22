---
name: dygram-test-execution
description: Run DyGram execution tests with intelligent agent responses by acting as the test responder. Use this skill when you need to execute DyGram tests with real Claude Code reasoning - YOU will make the intelligent decisions about tool selection.
---

# DyGram Test Execution Skill

**YOU (Claude Code) are the intelligent test responder!**

This skill enables you to act as the intelligent agent that responds to DyGram test requests. Tests will send LLM invocation requests to a queue, and you'll process them one by one, making intelligent decisions about which tools to use based on context.

## ⚠️ CRITICAL: Manual Responses Only

**DO NOT create automated scripts or loop wrappers** - this defeats the entire purpose of this skill!

The point of this skill is to use **YOUR intelligence** to make thoughtful decisions about tool selection. Creating an automated responder script that pattern-matches transitions:
- ❌ Defeats the purpose of intelligent testing
- ❌ Provides no value over the existing heuristic agent
- ❌ Misses edge cases requiring real reasoning
- ❌ Doesn't test the actual agent behavior we're validating

**What you SHOULD do:**
- ✅ Process each request manually with full analysis
- ✅ Make genuine intelligent decisions based on context
- ✅ Use your semantic understanding, not pattern matching
- ✅ Provide thoughtful reasoning for each decision

## 🚀 Performance Optimization

For faster processing without sacrificing intelligence, invoke this skill using the Task tool with `model: "haiku"`:

```typescript
// Instead of running the skill directly, delegate to a faster sub-agent:
Task({
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Process DyGram test requests",
  prompt: "Use the Interactive-generative-test skill to process test requests. Make intelligent decisions about tool selection based on context."
})
```

This gives you:
- **Faster response times** (Haiku is optimized for speed)
- **Lower cost** per request
- **Same intelligent reasoning** capabilities
- **Perfect for high-volume test processing**

Alternative: Load the skill and process manually in the main conversation for full observability.

## How It Works

```
┌─────────────────┐
│ Tests running   │
│ in background   │
└────────┬────────┘
         │ Writes requests
         ▼
┌─────────────────┐
│ File Queue      │
│ .dygram-test-   │
│  queue/         │
└────────┬────────┘
         │
         │ YOU poll queue with helper scripts
         ▼
┌─────────────────┐
│ Claude Code     │◄── This is YOU!
│ (This Session)  │    No API key needed!
│                 │
│ 1. Get request  │    Fresh context each time
│ 2. Analyze      │    All info in request
│ 3. Decide       │    Use your intelligence
│ 4. Respond      │
└─────────────────┘
```

## Agent Responder Modes

### ✅ Primary Mode: Manual Intelligent Processing (Required)

**This is the ONLY proper way to use this skill.**

**What this means:**
- YOU manually process each request, one at a time
- YOU make intelligent decisions using semantic understanding
- YOU analyze context, tools, and objectives thoughtfully
- Helper scripts only manage the queue, NOT decision-making

**How it works:**
1. Start tests in background
2. Get request → Read and analyze thoroughly
3. Make intelligent decision based on full context
4. Submit response with clear reasoning
5. Repeat for next request

**Performance optimization:**
- For faster processing: Use Task tool with `model: "haiku"`
- This keeps intelligent decision-making while improving speed
- See "Performance Optimization" section above

### ⚠️ Fallback Only: Heuristic Agent (CI/Automated Only)

**Script:** `scripts/test-agent-responder.js`
**Method:** Automated keyword matching (NOT intelligent)
**Use ONLY when:** Claude Code unavailable (CI, overnight runs)

**This is NOT a substitute for proper intelligent testing!**
- Simple pattern matching without reasoning
- Cannot handle complex scenarios
- Significantly lower quality than manual processing
- See full section below for when this is appropriate

## Prerequisites

- Node.js and npm installed
- Tests located in `test/validating/`
- **No API key needed for Claude Code mode!**

## Step-by-Step Workflow (Claude Code Mode)

### Step 0: Install Dependencies and Build

**IMPORTANT:** Before running tests, ensure dependencies are installed and the project is built:

```bash
# Install dependencies
npm ci

# Build the project (includes langium generation)
npm run build
```

**What this does:**
- Installs all npm dependencies
- Runs prebuild (extracts examples, generates docs)
- Generates Langium parser and syntax files
- Compiles TypeScript
- Bundles web assets

**Skip this step if:**
- Dependencies are already installed
- Project is already built
- You just ran the build recently

### Step 1: Start Tests in Background

Run the execution tests in interactive mode:

```bash
DYGRAM_TEST_MODE=interactive npm test test/validating/ 2>&1 | tee /tmp/dygram-test-output.log &
```

Save the process ID:
```bash
TEST_PID=$!
echo "Tests running as PID: $TEST_PID"
```

### Step 2: Process Requests Loop

Now enter a loop where you'll respond to test requests. The get-next-request script uses **lock file synchronization** to automatically detect when tests complete or crash.

**Lock File Synchronization:**
- Tests create `.test-session.lock` with heartbeat timestamp
- get-next-request waits for lock file (tests starting)
- Monitors heartbeat to detect crashed tests (stale if >10s old)
- Exits gracefully when lock file removed (tests complete)

**Exit Codes:**
- `0` = Request returned successfully (continue loop)
- `1` = Error or stale tests (break loop)
- `2` = Tests completed gracefully (break loop)

#### 2a. Get Next Request

Use the helper script in a loop:

```bash
while true; do
  # Get next request (blocks until available or tests complete)
  REQUEST=$(node scripts/get-next-request.js --timeout 60000)
  EXIT_CODE=$?

  # Check exit code
  if [ $EXIT_CODE -eq 2 ]; then
    echo "✅ Tests completed"
    break
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Error or tests crashed"
    break
  fi

  # Process the request
  # ... (steps 2b-2d below)
done
```

**Or call once to see the first request:**

```bash
node scripts/get-next-request.js --timeout 60000
```

**This will output a JSON request like:**
```json
{
  "requestId": "req-12345-1",
  "context": {
    "testName": "should transition to correct state",
    "machineTitle": "Payment Flow",
    "currentNode": "PaymentStart"
  },
  "systemPrompt": "Transition to the success state after payment validation",
  "tools": [
    {
      "name": "transition_to_PaymentSuccess",
      "description": "Transition to PaymentSuccess state",
      "input_schema": {
        "type": "object",
        "properties": {
          "reason": { "type": "string" }
        }
      }
    },
    {
      "name": "transition_to_PaymentError",
      "description": "Transition to PaymentError state",
      "input_schema": {
        "type": "object",
        "properties": {
          "reason": { "type": "string" }
        }
      }
    }
  ]
}
```

#### 2b. Analyze Request

Look at the request carefully:
- **System Prompt:** What is the test asking you to do?
- **Context:** What machine, what test, what state?
- **Tools:** What are the available options?

**Example Analysis:**
- System prompt says "success state after payment validation"
- Tools available: `transition_to_PaymentSuccess`, `transition_to_PaymentError`
- Prompt mentions "success" → Should use `transition_to_PaymentSuccess`

#### 2c. Make Intelligent Decision

Based on your analysis, decide which tool to use. Consider:
- Keywords in the system prompt
- Tool descriptions and names
- Test context and machine state
- Semantic meaning of the request

#### 2d. Submit Response

Create a response JSON and submit it:

```bash
cat << 'EOF' > /tmp/response.json
{
  "requestId": "req-12345-1",
  "reasoning": "The system prompt mentions 'success state after payment validation', which clearly indicates we should transition to PaymentSuccess rather than PaymentError.",
  "response": {
    "content": [
      {
        "type": "text",
        "text": "Transitioning to success state as payment validation succeeded."
      },
      {
        "type": "tool_use",
        "id": "tool-1",
        "name": "transition_to_PaymentSuccess",
        "input": {
          "reason": "Payment validation successful"
        }
      }
    ],
    "stop_reason": "tool_use"
  }
}
EOF

node scripts/submit-response.js --file /tmp/response.json
```

**Or use piping:**
```bash
echo '{
  "requestId": "req-12345-1",
  "reasoning": "System prompt indicates success path",
  "response": {
    "content": [
      {"type": "text", "text": "Proceeding with success transition"},
      {
        "type": "tool_use",
        "id": "tool-1",
        "name": "transition_to_PaymentSuccess",
        "input": {"reason": "Success condition met"}
      }
    ],
    "stop_reason": "tool_use"
  }
}' | node scripts/submit-response.js --request-id req-12345-1
```

#### 2e. Repeat

Continue the loop - get next request, analyze, decide, respond - until tests complete.

### Step 3: Monitor Test Progress

Check if tests are still running:

```bash
ps -p $TEST_PID > /dev/null && echo "Tests still running" || echo "Tests completed"
```

View test output:
```bash
tail -f /tmp/dygram-test-output.log
```

### Step 4: Analyze Results

After tests complete:

```bash
# Check test summary
grep -E "Test Files|Tests" /tmp/dygram-test-output.log | tail -2

# Count new recordings
git status --short test/fixtures/recordings/ | grep "^??" | wc -l

# List recording categories
ls -1 test/fixtures/recordings/
```

### Step 5: Cleanup

Clean up the queue:

```bash
rm -rf .dygram-test-queue
```

## Decision-Making Guidelines

When analyzing requests, use this process:

### 1. Read the System Prompt Carefully
Extract the key intent: What is being asked?

### 2. Identify Keywords
- "error", "fail" → Error path tools
- "success", "complete" → Success path tools
- Specific state names → Match tool names

### 3. Match Tool Names
Look for tools whose names align with the prompt:
- Prompt: "transition to error" → `transition_to_ErrorState`
- Prompt: "add new node called Foo" → `add_node` with name="Foo"

### 4. Consider Context
- Test name might give hints
- Machine title indicates the domain
- Current node shows where you are

### 5. Use Semantic Understanding
You're Claude - use your intelligence! Don't just match keywords.
Understand what the test is trying to verify and choose accordingly.

## Response Structure

All responses must follow this structure:

```json
{
  "requestId": "req-xxx",
  "reasoning": "Brief explanation of why you chose this tool",
  "response": {
    "content": [
      {
        "type": "text",
        "text": "Your reasoning or explanation"
      },
      {
        "type": "tool_use",
        "id": "unique-tool-id",
        "name": "tool_name_from_request",
        "input": {
          // Tool input based on schema
        }
      }
    ],
    "stop_reason": "tool_use"
  }
}
```

**If no tool needed:**
```json
{
  "requestId": "req-xxx",
  "reasoning": "No tool use required",
  "response": {
    "content": [
      {"type": "text", "text": "Task completed"}
    ],
    "stop_reason": "end_turn"
  }
}
```

## Lock File Synchronization

The test suite and request loop synchronize via `.test-session.lock`:

**Lock File Structure:**
```json
{
  "pid": 12345,
  "started": "2025-11-21T23:45:00.000Z",
  "timestamp": "2025-11-21T23:50:00.000Z",
  "requestsProcessed": 5
}
```

**Lifecycle:**
1. Tests start → Create lock file with initial timestamp
2. Tests run → Update heartbeat every 2 seconds
3. Tests complete → Remove lock file
4. Tests crash → Lock file becomes stale (no heartbeat updates)

**Heartbeat Monitoring:**
- Updated every 2 seconds by test suite
- Considered stale if >10 seconds old
- get-next-request checks before each poll

**Benefits:**
- No infinite waiting if tests crash
- Automatic detection of test completion
- Graceful exit when tests finish
- Defensive against edge cases

## Helper Scripts Reference

### `get-next-request.js`

Blocks until a request is available, with lock file synchronization.

**Usage:**
```bash
node scripts/get-next-request.js [--queue-dir <path>] [--timeout <ms>] [--lock-timeout <ms>]
```

**Options:**
- `--queue-dir`: Queue directory (default: `.dygram-test-queue`)
- `--timeout`: Max wait time for request in ms (default: 60000)
- `--lock-timeout`: Max wait time for test session to start in ms (default: 30000)

**Output:**
- JSON request on stdout
- Status messages on stderr
- Exit codes:
  - `0` = Request returned successfully
  - `1` = Error, timeout, or stale tests
  - `2` = Tests completed gracefully (lock file removed)

**Lock File Synchronization:**
- Waits for `.test-session.lock` to exist
- Monitors heartbeat timestamp
- Exits when lock file removed or stale

### `submit-response.js`

Writes response to queue and cleans up request file.

**Usage:**
```bash
# From file
node scripts/submit-response.js --file response.json

# From stdin
echo '{"requestId": "...", ...}' | node scripts/submit-response.js --request-id <id>
```

**Options:**
- `--queue-dir`: Queue directory (default: `.dygram-test-queue`)
- `--request-id`: Request ID (required if not in JSON)
- `--file`: Read response from file instead of stdin

**Output:**
- Success message on stderr
- Exit code 0 on success, 1 on error

## ⚠️ Fallback Only: Heuristic Agent Mode

**Use this ONLY when Claude Code cannot participate at all** (e.g., CI environment, overnight runs).

The automated heuristic responder is a fallback for when intelligent testing isn't possible:

```bash
# Start heuristic agent (fallback only!)
node scripts/test-agent-responder.js &

# Run tests
DYGRAM_TEST_MODE=interactive npm test test/validating/

# Cleanup
pkill -f test-agent-responder
```

**Important limitations:**
- Uses simple keyword matching, not semantic understanding
- Cannot handle complex scenarios requiring reasoning
- No context awareness beyond pattern matching
- Significantly less capable than Claude Code's intelligence

**When to use:**
- ❌ NOT for development/testing where you're available
- ❌ NOT instead of doing proper intelligent testing
- ✅ ONLY for automated CI runs without human oversight
- ✅ ONLY when absolutely no other option exists

**Preferred alternatives:**
1. Process requests manually with this skill (best quality)
2. Use Task tool with model="haiku" (fast + intelligent)
3. Schedule testing when you can be actively involved

## Summary Report Format

After completing test execution, provide a summary:

```
🧪 DyGram Test Execution Summary
================================

Test Results:
  ✅ Passed: X tests
  ❌ Failed: Y tests
  ⏭️  Skipped: Z tests

Agent Responses:
  📨 Requests processed: N
  🧠 Intelligent decisions made: N
  ✅ Responses submitted: N

Recordings:
  📝 New recordings: N files
  📁 Categories updated: [list]
  💾 Total size: X KB

Status: SUCCESS/FAILURE

Next Steps:
  - Commit recordings if tests passed
  - Investigate failures in /tmp/dygram-test-output.log
  - Review decision quality if unexpected results
```

## Troubleshooting

### No requests appearing

**Check:**
- Tests actually running? `ps -p $TEST_PID`
- Queue directory exists? `ls -la .dygram-test-queue`
- Test mode set? Check `DYGRAM_TEST_MODE=interactive`

### Timeout waiting for request

**Causes:**
- Tests completed already
- Tests not in interactive mode
- Queue in wrong location

### Response not accepted

**Check:**
- `requestId` matches the request
- Response JSON is valid
- All required fields present

## ❌ DO NOT: Automated Processing

**This section describes what NOT to do.**

Creating automated loop scripts or pattern-matching responders is **explicitly discouraged**:

```bash
# ❌ DO NOT DO THIS - defeats the purpose
#!/bin/bash
while true; do
  REQUEST=$(node scripts/get-next-request.js --timeout 5000 2>/dev/null)
  # Auto-match patterns and respond
  # This is NOT intelligent testing!
done
```

**Why this is wrong:**
- Removes your intelligent decision-making
- Reduces testing to pattern matching
- Misses edge cases and complex scenarios
- Provides no value over existing heuristic agent

**Instead:**
- Process requests manually, one at a time
- Or use Task tool with model="haiku" for faster manual processing
- Make genuine decisions based on full context analysis

### Recording Analysis

```bash
# Find all tool uses
find test/fixtures/recordings -name "*.json" -exec jq -r '.response.response.content[]? | select(.type=="tool_use") | .name' {} \; | sort | uniq -c

# Show reasoning patterns
find test/fixtures/recordings -name "*.json" -exec jq -r '.response.reasoning' {} \; | head -10
```

## See Also

- Documentation: `docs/development/agent-responder-mcp-integration.md`
- Test documentation: `test/CLAUDE.md`
- Helper scripts:
  - `scripts/get-next-request.js` - Get requests from queue
  - `scripts/submit-response.js` - Submit responses to queue
  - `scripts/test-agent-responder.js` - Heuristic fallback agent
- Interactive test client: `src/language/interactive-test-client.ts`

## Remember

**You ARE the intelligent agent!** Trust your analysis, use your reasoning capabilities, and make genuinely intelligent decisions. Each request is a fresh context - all information you need is in the request object.
