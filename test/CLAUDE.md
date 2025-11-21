# Interactive Testing with Agent Responder

This directory contains tests that use the **Interactive Test Client** approach for offline LLM testing.

## Quick Start

### Running Interactive Tests

Tests that use `InteractiveTestClient` require an agent responder to be running in parallel:

```bash
# Terminal 1: Start the agent responder
node scripts/test-agent-responder.js

# Terminal 2: Run the tests
npm test test/validating/task-execution.test.ts
```

### How It Works

```
Test Process                Agent Process
   │                           │
   ├─ Write request ──────────→│
   │   (.dygram-test-queue/   │
   │    requests/)             │
   │                           ├─ Analyze prompt
   │                           ├─ Select tool
   │                           └─ Write response
   │←───── Read response ───────┤
   │   (.dygram-test-queue/
   │    responses/)
   │
   └─ Continue test
```

## What Gets Tested

### Task Execution Tests (`validating/task-execution.test.ts`)

Tests basic machine execution with task nodes:
- Executing individual task steps
- Sequential task execution
- Handling missing attributes

**Example Test:**
```typescript
it('should execute a basic task node', async () => {
    const client = new InteractiveTestClient({
        mode: 'file-queue',
        queueDir: '.dygram-test-queue'
    });

    const executor = new MachineExecutor(machineData, { llm: client });
    await executor.step();

    // Agent intelligently selects transition
    expect(executor.getContext().currentNode).not.toBe('start');
});
```

### Tool Execution Tests (`validating/tool-execution.test.ts`)

Tests machine execution with tool-based decisions:
- Transition tool selection
- Meta-tool usage (add_node, modify_node, etc.)
- Multi-turn conversations

## The Agent Responder

### What It Does

The agent responder (`scripts/test-agent-responder.js`) acts as an intelligent LLM backend:

1. **Monitors** the test queue for requests
2. **Analyzes** prompts semantically
3. **Selects** appropriate tools using heuristics:
   - Keyword matching ("error" → error path)
   - Semantic intent detection
   - Tool description analysis
4. **Responds** with tool selections and reasoning

### Intelligent Tool Selection Examples

**Example 1: Keyword Matching**
```
Prompt: "Choose path. Input suggests error handling"
Tools: transition_to_success, transition_to_error

→ Agent selects: transition_to_error
→ Reasoning: "Prompt mentions 'error handling'"
```

**Example 2: Semantic Intent**
```
Prompt: "Add a new validation node to the machine"
Tools: add_node, remove_node, get_machine_definition

→ Agent selects: add_node
→ Reasoning: "Prompt requests adding something"
```

**Example 3: Description Matching**
```
Prompt: "Retrieve the current machine structure"
Tools: get_machine_definition, update_definition

→ Agent selects: get_machine_definition
→ Reasoning: "Tool description matches prompt keywords"
```

## Recording for CI

Tests automatically record responses for CI playback:

```typescript
const client = new InteractiveTestClient({
    mode: 'file-queue',
    recordResponses: true,  // Enable recording
    recordingsDir: 'test/fixtures/recordings/task-execution'
});
```

**Recordings include:**
- Original request (tools, prompt, context)
- Agent response (tool selection, input)
- Agent reasoning
- Timestamp

**File structure:**
```
test/fixtures/recordings/
├── task-execution/
│   ├── req-1763681013827.json
│   ├── req-1763681014192.json
│   └── ...
└── tool-execution/
    └── ...
```

## Troubleshooting

### Agent Not Responding

**Symptom:** Test times out after 10 seconds

**Solutions:**
1. Check agent responder is running:
   ```bash
   ps aux | grep test-agent-responder
   ```

2. Check agent logs:
   ```bash
   # If running in foreground, you'll see output
   # If running in background:
   tail -f /tmp/agent-responder.log
   ```

3. Restart agent responder:
   ```bash
   # Kill any running instances
   pkill -f test-agent-responder

   # Start fresh
   node scripts/test-agent-responder.js
   ```

### Queue Directory Issues

**Symptom:** `ENOENT: no such file or directory`

**Solution:** Agent creates queue directories automatically. If you see this error:
```bash
mkdir -p .dygram-test-queue/requests
mkdir -p .dygram-test-queue/responses
```

### Stale Requests

**Symptom:** Agent processes old requests

**Solution:** Clean the queue:
```bash
rm -rf .dygram-test-queue
```

Tests clean up automatically in `afterEach()`, but manual cleanup may be needed if tests crash.

## Advanced Usage

### Custom Queue Directory

```bash
# Agent with custom queue
node scripts/test-agent-responder.js --queue-dir /tmp/my-queue

# Test with matching queue
```

```typescript
const client = new InteractiveTestClient({
    mode: 'file-queue',
    queueDir: '/tmp/my-queue'
});
```

### Longer Timeouts

For complex tests with many tool invocations:

```typescript
const client = new InteractiveTestClient({
    mode: 'file-queue',
    timeout: 30000  // 30 seconds
});
```

### Debugging Agent Decisions

Agent logs show its reasoning:

```
📨 Received request: req-1763681013827
   Test: should execute a basic task node
   Machine: Test Machine
   Tools available: 2
   Tool names: transition_to_analysis, transition_to_end

🧠 Agent Decision:
   Prompt suggests success path, selecting first transition

✅ Sent response
```

### Inspecting Recordings

Recordings are human-readable JSON:

```bash
cat test/fixtures/recordings/task-execution/req-*.json | jq .
```

```json
{
  "request": {
    "type": "llm_invocation_request",
    "requestId": "req-1763681013827",
    "tools": [...],
    "systemPrompt": "..."
  },
  "response": {
    "type": "llm_invocation_response",
    "reasoning": "Prompt mentions 'error handling'",
    "response": {
      "content": [
        {"type": "text", "text": "..."},
        {"type": "tool_use", "name": "transition_to_error", ...}
      ]
    }
  },
  "recordedAt": "2025-11-20T23:16:53.950Z"
}
```

## Future: Playback Mode (CI)

Coming soon - playback mode for deterministic CI runs:

```bash
# CI uses recorded responses (no agent needed)
DYGRAM_TEST_MODE=playback npm test
```

This will:
- Load recordings instead of requiring live agent
- Ensure deterministic test results
- Run fast (no IPC delays)
- Work in any CI environment

## Benefits vs Traditional Mocking

| Traditional Mock | Interactive Agent |
|------------------|-------------------|
| Manual setup each test | Automatic semantic selection |
| Brittle (breaks on changes) | Resilient (adapts to refactoring) |
| No debugging info | Reasoning captured |
| Fixed responses | Context-aware decisions |
| Hard to maintain | Self-documenting |

## Example: Running a Test

```bash
# Terminal 1
$ node scripts/test-agent-responder.js
🤖 Test Agent Responder Starting...
📁 Queue directory: .dygram-test-queue
⏳ Waiting for test requests...

📨 Received request: req-1763681518004
   Test: should execute a basic task node
   Tools: transition_to_analysis, transition_to_end

🧠 Agent Decision:
   No specific match, selecting first available transition

✅ Sent response

# Terminal 2
$ npm test test/validating/task-execution.test.ts

✓ Task Node Execution (Interactive)
  ✓ should execute a basic task node (234ms)
  ✓ should execute an analysis task node (187ms)
  ✓ should execute all nodes in sequence (412ms)
  ✓ should handle missing attributes gracefully (156ms)

Test Files  1 passed (1)
     Tests  4 passed (4)
```

## See Also

- **Proposal:** `docs/development/offline-testing-proposal.md`
- **Feasibility:** `docs/development/interactive-testing-feasibility.md`
- **Agent Script:** `scripts/test-agent-responder.js`
- **Client Implementation:** `src/language/interactive-test-client.ts`
