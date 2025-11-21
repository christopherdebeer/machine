---
name: dygram-test-execution
description: Run DyGram execution tests with intelligent agent responses by acting as the test responder. Use this skill when you need to execute DyGram tests with real Claude Code reasoning - YOU will make the intelligent decisions about tool selection.
---

# DyGram Test Execution Skill

**YOU (Claude Code) are the intelligent test responder!**

This skill enables you to act as the intelligent agent that responds to DyGram test requests. Tests will send LLM invocation requests to a queue, and you'll process them one by one, making intelligent decisions about which tools to use based on context.

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

### Mode 1: Claude Code Direct (Recommended) 🚀

**This mode:** YOU act as the responder using helper scripts
**No separate process needed** - you ARE the intelligent agent
**No API key required** - you're already running!

**How it works:**
- Start tests in background
- Loop: get request → analyze → decide → submit response
- Helper scripts manage queue interaction
- Each request is isolated with fresh context

### Mode 2: Heuristic Agent (Fallback)

**Script:** `scripts/test-agent-responder.js`
**Method:** Automated keyword matching heuristics
**Use when:** You can't actively monitor/respond to requests

This is a standalone process that uses simple pattern matching. Less intelligent than you, but runs automatically.

## Prerequisites

- Node.js and npm installed
- Dependencies installed (`npm ci`)
- Tests located in `test/validating/`
- **No API key needed for Claude Code mode!**

## Step-by-Step Workflow (Claude Code Mode)

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

Now enter a loop where you'll respond to test requests. For each request:

#### 2a. Get Next Request

Use the helper script to block until a request is available:

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

## Helper Scripts Reference

### `get-next-request.js`

Blocks until a request is available, outputs JSON to stdout.

**Usage:**
```bash
node scripts/get-next-request.js [--queue-dir <path>] [--timeout <ms>]
```

**Options:**
- `--queue-dir`: Queue directory (default: `.dygram-test-queue`)
- `--timeout`: Max wait time in ms (default: 30000)

**Output:**
- JSON request on stdout
- Exit code 0 on success, 1 on timeout

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

## Alternative: Heuristic Agent Mode

If you can't actively respond to requests, use the automated heuristic responder:

```bash
# Start heuristic agent
node scripts/test-agent-responder.js &

# Run tests
DYGRAM_TEST_MODE=interactive npm test test/validating/

# Cleanup
pkill -f test-agent-responder
```

The heuristic agent uses keyword matching but is less intelligent than you.

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

## Advanced Usage

### Process Multiple Requests Automatically

Create a simple loop script:

```bash
#!/bin/bash
while true; do
  REQUEST=$(node scripts/get-next-request.js --timeout 5000 2>/dev/null)

  if [ $? -ne 0 ]; then
    echo "No more requests (timeout)"
    break
  fi

  # Extract info and make decision
  # (You'd fill this in with your logic)

  # Submit response
  # ...
done
```

### Custom Decision Logic

You can create wrapper scripts that:
- Parse the request JSON
- Apply custom heuristics
- Generate responses
- Submit via helper script

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
