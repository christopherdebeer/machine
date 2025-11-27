# Recording and Playback: Testing Without LLM Costs

DyGram provides a recording/playback system that enables you to test machines with LLM-based tasks without incurring API costs on every test run. Record intelligent responses once, replay them in CI and local development.

## Table of Contents

- [Overview](#overview)
- [Recording Mode](#recording-mode)
- [Playback Mode](#playback-mode)
- [File-Based Queue](#file-based-queue)
- [Recording Format](#recording-format)
- [Use Cases](#use-cases)
- [Configuration](#configuration)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

The recording/playback system solves a key challenge: **how to test LLM-integrated machines without expensive, slow, non-deterministic API calls**.

### The Problem

Testing machines with LLM-based tasks traditionally requires:
- Real API keys and credits
- Network connectivity
- Time (LLM latency)
- Non-deterministic responses
- Cost per test run

### The Solution

**Record once, replay many times:**

1. **Recording Phase** - Run tests interactively with an intelligent agent (like Claude Code)
2. **Capture Responses** - Save agent decisions and tool selections
3. **Playback Phase** - Replay recorded responses in CI without LLM calls

**Benefits:**
- ✅ **Fast** - No network latency, instant responses
- ✅ **Free** - No per-run API costs
- ✅ **Deterministic** - Same inputs → same outputs
- ✅ **Offline** - No network required
- ✅ **Debuggable** - Inspect exact responses

## Recording Mode

### Interactive Test Client

The `InteractiveTestClient` communicates with an agent during test runs to record intelligent responses.

#### Basic Recording Setup

```typescript examples/recording/basic-recording.ts
import { InteractiveTestClient } from '../src/language/interactive-test-client';

const client = new InteractiveTestClient({
  transport: 'api', // or 'bedrock'
  mode: 'file-queue',
  recordResponses: true,
  recordingsDir: './test/fixtures/recordings',
  sessionId: 'test-session-001'
});
```

#### Communication Modes

**1. File-Queue Mode (Default)**

Simplest mode - uses file system for communication.

```typescript examples/recording/file-queue-mode.ts
const client = new InteractiveTestClient({
  transport: 'api',
  mode: 'file-queue',
  queueDir: './.dygram-test-queue',  // Queue directory
  timeout: 30000,                     // 30s wait for agent
  recordResponses: true,
  recordingsDir: './test/fixtures/recordings'
});
```

**How it works:**
1. Test writes request to `{queueDir}/requests/{requestId}.json`
2. Agent (Claude Code) reads request
3. Agent writes response to `{queueDir}/responses/{requestId}.json`
4. Test reads response and continues
5. Response saved to recordings directory

**2. Socket Mode**

For lower latency communication.

```typescript examples/recording/socket-mode.ts
const client = new InteractiveTestClient({
  transport: 'api',
  mode: 'socket',
  socketPath: '/tmp/dygram-test.sock',
  recordResponses: true,
  recordingsDir: './test/fixtures/recordings'
});
```

**3. HTTP Mode**

For remote agent communication.

```typescript examples/recording/http-mode.ts
const client = new InteractiveTestClient({
  transport: 'api',
  mode: 'http',
  httpEndpoint: 'http://localhost:3000/llm-invocation',
  recordResponses: true,
  recordingsDir: './test/fixtures/recordings'
});
```

### Recording Workflow

```typescript examples/recording/recording-workflow.ts
// 1. Start recording session
const client = new InteractiveTestClient({
  transport: 'api',
  mode: 'file-queue',
  recordResponses: true,
  recordingsDir: './test/fixtures/recordings/my-test',
  sessionId: 'my-test-001',
  cleanBeforeRecording: true  // Clean old recordings
});

// 2. Run test - agent responds interactively
const result = await executeTask(client, {
  prompt: "Choose the best transition path",
  tools: [
    { name: 'transition_to_pathA', description: 'Go to path A' },
    { name: 'transition_to_pathB', description: 'Go to path B' }
  ]
});

// 3. Responses automatically saved to:
//    ./test/fixtures/recordings/my-test/req-{timestamp}-{counter}.json

// 4. Use recordings in CI via PlaybackTestClient
```

## Playback Mode

### Playback Test Client

The `PlaybackTestClient` replays previously recorded responses without calling LLM APIs.

#### Basic Playback Setup

```typescript examples/recording/basic-playback.ts
import { PlaybackTestClient } from '../src/language/playback-test-client';

const client = new PlaybackTestClient({
  transport: 'api',  // Doesn't matter for playback
  recordingsDir: './test/fixtures/recordings/my-test'
});

// Client will replay recorded responses in order
// No network calls, no LLM costs, instant responses
```

#### Playback Modes

**Strict Mode (Default)**

Fails if no recording found for a request.

```typescript examples/recording/strict-playback.ts
const client = new PlaybackTestClient({
  transport: 'api',
  recordingsDir: './test/fixtures/recordings',
  strict: true  // Throw error if recording missing
});
```

**Lenient Mode**

Falls back to mock response if recording missing.

```typescript examples/recording/lenient-playback.ts
const client = new PlaybackTestClient({
  transport: 'api',
  recordingsDir: './test/fixtures/recordings',
  strict: false,  // Use fallback for missing recordings
  fallbackResponse: {
    content: [
      { type: 'text', text: 'Fallback response' }
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0 }
  }
});
```

### CI Integration

```typescript examples/recording/ci-integration.ts
// In CI environment, use playback mode
const isCI = process.env.CI === 'true';

const client = isCI
  ? new PlaybackTestClient({
      transport: 'api',
      recordingsDir: './test/fixtures/recordings',
      strict: true  // Fail if recordings missing
    })
  : new InteractiveTestClient({
      transport: 'api',
      mode: 'file-queue',
      recordResponses: true,
      recordingsDir: './test/fixtures/recordings'
    });
```

## File-Based Queue

The file-based queue is the simplest communication channel.

### Queue Structure

```
.dygram-test-queue/
├── .test-session.lock          # Session lock file
├── requests/
│   ├── req-1732485234567-1.json   # Request 1
│   └── req-1732485234599-2.json   # Request 2
└── responses/
    ├── req-1732485234567-1.json   # Response 1
    └── req-1732485234599-2.json   # Response 2
```

### Request File Format

```json examples/recording/request-format.json
{
  "type": "llm_invocation_request",
  "requestId": "req-1732485234567-1",
  "timestamp": "2025-11-24T23:00:34.567Z",
  "context": {
    "testName": "should transition between states",
    "testFile": "test/validating/tool-execution.test.ts",
    "currentNode": "start",
    "machineTitle": "State Transition Test"
  },
  "messages": [
    {
      "role": "user",
      "content": "You are at node 'start'. Choose a transition."
    }
  ],
  "tools": [
    {
      "name": "transition_to_pathA",
      "description": "Transition to path A",
      "input_schema": {
        "type": "object",
        "properties": {}
      }
    },
    {
      "name": "transition_to_pathB",
      "description": "Transition to path B",
      "input_schema": {
        "type": "object",
        "properties": {}
      }
    }
  ],
  "systemPrompt": "You are a state machine executor."
}
```

### Response File Format

```json examples/recording/response-format.json
{
  "type": "llm_invocation_response",
  "requestId": "req-1732485234567-1",
  "timestamp": "2025-11-24T23:00:35.123Z",
  "response": {
    "content": [
      {
        "type": "text",
        "text": "I'll transition to path A as it's the logical next step."
      },
      {
        "type": "tool_use",
        "id": "toolu_01ABC123",
        "name": "transition_to_pathA",
        "input": {}
      }
    ],
    "stop_reason": "tool_use",
    "usage": {
      "input_tokens": 245,
      "output_tokens": 67
    }
  },
  "reasoning": "Path A is selected because..."
}
```

### Agent Responder

The agent (Claude Code) reads requests and writes responses:

```typescript examples/recording/agent-responder.ts
// This runs in Claude Code or agent environment
import * as fs from 'fs';
import * as path from 'path';

const queueDir = './.dygram-test-queue';

// Watch for new requests
while (true) {
  const requests = fs.readdirSync(path.join(queueDir, 'requests'));

  for (const requestFile of requests) {
    const requestPath = path.join(queueDir, 'requests', requestFile);
    const request = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));

    // Agent makes intelligent decision
    const response = await makeIntelligentDecision(request);

    // Write response
    const responsePath = path.join(queueDir, 'responses', requestFile);
    fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));

    // Clean up request
    fs.unlinkSync(requestPath);
  }

  await delay(100); // Poll every 100ms
}
```

## Recording Format

Recordings are stored as JSON files in the specified directory.

### Recording File Naming

```
recordings/
├── session-001/
│   ├── req-1732485234567-1.json
│   ├── req-1732485234599-2.json
│   └── req-1732485234701-3.json
└── session-002/
    ├── req-1732485245123-1.json
    └── req-1732485245234-2.json
```

**Naming pattern:** `req-{timestamp}-{counter}.json`

- `timestamp`: Unix timestamp in milliseconds
- `counter`: Request number in session

### Recording Metadata

Each recording includes:

```json examples/recording/metadata-format.json
{
  "metadata": {
    "recordedAt": "2025-11-24T23:00:35.123Z",
    "sessionId": "test-session-001",
    "testName": "should handle branching paths",
    "testFile": "test/validating/tool-execution.test.ts",
    "machineTitle": "Branching Test Machine",
    "nodeContext": "start",
    "durationMs": 556
  },
  "request": {
    // ... full request
  },
  "response": {
    // ... full response
  }
}
```

## Use Cases

### 1. Testing State Machines

Record intelligent transition decisions:

```typescript examples/recording/test-state-machine.ts
describe('State Machine Execution', () => {
  const client = new InteractiveTestClient({
    transport: 'api',
    mode: 'file-queue',
    recordResponses: true,
    recordingsDir: './test/fixtures/recordings/state-machine',
    sessionId: 'state-machine-001'
  });

  it('should make intelligent transitions', async () => {
    const machine = `
      machine "Branch Test"
      Task start "Choose path"
      Task pathA "Path A"
      Task pathB "Path B"
      start -> pathA
      start -> pathB
    `;

    // Agent chooses transition interactively
    const result = await execute(machine, {}, client);

    // Response recorded for future playback
    expect(result.visitedNodes).toContain('start');
  });
});
```

### 2. Regression Testing

Replay recorded responses to detect regressions:

```typescript examples/recording/regression-test.ts
describe('Regression Tests', () => {
  const client = new PlaybackTestClient({
    transport: 'api',
    recordingsDir: './test/fixtures/recordings/baseline',
    strict: true
  });

  it('should maintain behavior from recording', async () => {
    // Replays exact agent decisions from recording
    const result = await execute(testMachine, {}, client);

    // Compare with expected behavior
    expect(result).toMatchSnapshot();
  });
});
```

### 3. Development Workflow

Use recordings during development:

```typescript examples/recording/dev-workflow.ts
// Developer workflow:
// 1. Record with real agent during interactive session
// 2. Develop using recordings (fast iteration)
// 3. Re-record when behavior needs to change

const isDev = process.env.NODE_ENV === 'development';

const client = isDev && process.env.USE_RECORDINGS
  ? new PlaybackTestClient({
      transport: 'api',
      recordingsDir: './test/fixtures/recordings/dev'
    })
  : new InteractiveTestClient({
      transport: 'api',
      mode: 'file-queue',
      recordResponses: true,
      recordingsDir: './test/fixtures/recordings/dev'
    });
```

### 4. Documentation Examples

Record example executions for documentation:

```typescript examples/recording/doc-examples.ts
// Record example executions
const client = new InteractiveTestClient({
  transport: 'api',
  mode: 'file-queue',
  recordResponses: true,
  recordingsDir: './docs/examples/recordings',
  sessionId: 'doc-example-001'
});

// Run example
const result = await executeExample('branching-workflow', client);

// Recording can be:
// 1. Played back in docs
// 2. Used for tutorials
// 3. Validated in tests
```

## Configuration

### Recording Configuration

```typescript examples/recording/recording-config.ts
const recordingConfig: InteractiveTestConfig = {
  // Required
  transport: 'api',
  mode: 'file-queue',

  // Recording options
  recordResponses: true,
  recordingsDir: './test/fixtures/recordings',
  sessionId: 'my-session',
  overwriteExisting: true,         // Overwrite existing recordings
  maxRecordingsPerTest: 10,        // Keep last 10 recordings per test
  cleanBeforeRecording: false,     // Don't clean before starting

  // Communication options
  queueDir: './.dygram-test-queue',
  timeout: 30000,                   // 30s timeout

  // Optional API config (for recording mode)
  apiKey: process.env.ANTHROPIC_API_KEY,
  modelId: 'claude-3-5-sonnet-20241022'
};
```

### Playback Configuration

```typescript examples/recording/playback-config.ts
const playbackConfig = {
  transport: 'api',  // Ignored in playback mode
  recordingsDir: './test/fixtures/recordings',
  strict: true,      // Fail if recording missing
  sequential: true,  // Play recordings in order

  // Optional fallback
  fallbackResponse: {
    content: [{ type: 'text', text: 'Default response' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0 }
  }
};
```

## Examples

### Complete Recording Session

```typescript examples/recording/complete-session.ts
import { InteractiveTestClient } from '../src/language/interactive-test-client';
import { executeTask } from '../src/language/executor';

describe('Complete Recording Example', () => {
  const client = new InteractiveTestClient({
    transport: 'api',
    mode: 'file-queue',
    queueDir: './.dygram-test-queue',
    recordResponses: true,
    recordingsDir: './test/fixtures/recordings/complete-example',
    sessionId: 'example-001',
    cleanBeforeRecording: true,
    timeout: 30000
  });

  before(async () => {
    // Ensure queue directory exists
    await fs.promises.mkdir('./.dygram-test-queue/requests', { recursive: true });
    await fs.promises.mkdir('./.dygram-test-queue/responses', { recursive: true });
  });

  it('should record intelligent decisions', async () => {
    const machine = `
      machine "Decision Test"

      Task analyze "Analyze situation"
      Task pathA "Take path A"
      Task pathB "Take path B"

      analyze -> pathA
      analyze -> pathB
    `;

    // Agent responds interactively via queue
    const result = await executeTask(machine, {
      input: { scenario: 'test' }
    }, client);

    // Verify result
    expect(result.success).toBe(true);

    // Recording saved automatically
    // Check recording file exists
    const recordings = await fs.promises.readdir(
      './test/fixtures/recordings/complete-example'
    );
    expect(recordings.length).toBeGreaterThan(0);
  });
});
```

### Complete Playback Session

```typescript examples/recording/complete-playback.ts
import { PlaybackTestClient } from '../src/language/playback-test-client';

describe('Complete Playback Example', () => {
  const client = new PlaybackTestClient({
    transport: 'api',
    recordingsDir: './test/fixtures/recordings/complete-example',
    strict: true
  });

  it('should replay recorded decisions', async () => {
    const machine = `
      machine "Decision Test"

      Task analyze "Analyze situation"
      Task pathA "Take path A"
      Task pathB "Take path B"

      analyze -> pathA
      analyze -> pathB
    `;

    // Replays recorded response - no LLM call
    const result = await executeTask(machine, {
      input: { scenario: 'test' }
    }, client);

    // Same result as recording session
    expect(result.success).toBe(true);

    // Fast, free, deterministic
  });
});
```

## Best Practices

### 1. Organize Recordings by Test

Keep recordings grouped per test suite:

```
test/fixtures/recordings/
├── state-transitions/
│   └── session-001/
├── branching-logic/
│   └── session-001/
└── error-handling/
    └── session-001/
```

### 2. Version Control Recordings

Commit recordings to version control:

```bash
# Add to git
git add test/fixtures/recordings/
git commit -m "Add test recordings for state machine tests"
```

### 3. Re-record When Behavior Changes

Re-record when machine logic changes:

```bash
# Delete old recordings
rm -rf test/fixtures/recordings/my-test/

# Run tests in recording mode
RECORD=true npm test
```

### 4. Use Strict Mode in CI

Fail fast if recordings are missing:

```typescript examples/recording/strict-ci.ts
const client = process.env.CI
  ? new PlaybackTestClient({
      transport: 'api',
      recordingsDir: './test/fixtures/recordings',
      strict: true  // Fail if recording missing
    })
  : new InteractiveTestClient({
      transport: 'api',
      mode: 'file-queue',
      recordResponses: true,
      recordingsDir: './test/fixtures/recordings'
    });
```

### 5. Clean Queue Between Tests

Avoid state leakage:

```typescript examples/recording/clean-queue.ts
afterEach(async () => {
  // Clean queue directory
  await fs.promises.rm('./.dygram-test-queue', { recursive: true, force: true });
});
```

## Summary

Recording and playback system in DyGram:

1. **Record** - Capture agent responses during interactive test runs
2. **Store** - Save as JSON files for version control
3. **Replay** - Use recordings in CI without LLM costs
4. **Iterate** - Fast development cycle with recorded responses

**Benefits:**
- 🚀 **Fast** - No network latency
- 💰 **Free** - No API costs per run
- 🎯 **Deterministic** - Same results every time
- 🔌 **Offline** - Works without internet
- 🐛 **Debuggable** - Inspect exact responses

Use recording/playback to test LLM-integrated machines efficiently and cost-effectively.
