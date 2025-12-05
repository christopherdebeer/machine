# Offline Testing for Tool and Task Execution

**Status:** Proposal
**Date:** 2025-11-20
**Context:** Investigation into enabling testing without live Claude API connection

## Executive Summary

Two critical test suites (`tool-execution.test.ts` and `task-execution.test.ts`) are currently skipped due to API mocking limitations. This document proposes multiple approaches to enable comprehensive offline testing of tool execution and task orchestration without requiring live Claude API calls.

## Current State Analysis

### Test Files Status

**Skipped Tests:**
- `/test/validating/tool-execution.test.ts` (387 lines) - Tests transition tools and meta tools
- `/test/validating/task-execution.test.ts` (146 lines) - Tests task node execution

**Active Integration Tests:**
- `/test/integration/meta-tool-manager.test.ts` - Dynamic tool construction
- `/test/integration/agent-sdk-bridge.test.ts` - Agent SDK integration
- `/test/integration/comprehensive-generative.test.ts` - Master integration suite

### Current Mocking Approaches

#### 1. Module-Level Mocking (`vi.mock`)
```typescript
vi.mock('../../src/language/claude-client', () => ({
    ClaudeClient: vi.fn().mockImplementation(() => ({
        invokeWithTools: vi.fn().mockResolvedValue({
            content: [
                { type: 'text', text: 'Response' },
                { type: 'tool_use', id: 'tool_1', name: 'transition', input: {...} }
            ],
            stop_reason: 'tool_use'
        })
    }))
}));
```

**Pros:** Fine-grained control, can test specific scenarios
**Cons:** Requires manually crafting each response, brittle, no intelligence

#### 2. MockClaudeClient Class
Located at: `/src/language/mock-claude-client.ts`

**Current Implementation:**
- Simulates 100-150ms delays
- **Naive strategy:** Always picks first available tool
- Generates mock inputs based on JSON schema types
- No semantic understanding of tool purposes

**Example:**
```typescript
const mockClient = new MockClaudeClient({ modelId: 'mock-claude-3-5-haiku' });
executor = new MachineExecutor(machineJSON, { llm: mockClient });
```

**Pros:** Type-safe, realistic delays, easy to use
**Cons:** No intelligence - always picks first tool regardless of semantics

#### 3. Automatic Fallback
In `/src/language/llm-client.ts`:
```typescript
export function createClaudeClientWithMockFallback(config: LLMClientConfig) {
    if (!config.apiKey) {
        return new MockClaudeClient({ modelId: config.modelId });
    }
    return new ClaudeClient(config);
}
```

**Pros:** Seamless testing without API keys
**Cons:** Inherits MockClaudeClient limitations

### Architecture Overview

**Execution Flow:**
```
MachineExecutor (executor.ts)
    ↓
ExecutionRuntime (functional core - pure)
    ↓ produces Effects
EffectExecutor (effect-executor.ts)
    ↓ executes side effects
ClaudeClient / MockClaudeClient
```

**Key Insight:** Clean separation between functional core and imperative shell makes testing tractable.

## The Core Problem

### Why Tests Are Skipped

From `tool-execution.test.ts:13-14`:
```typescript
// TODO: Update for new MachineExecutor API
// The new MachineExecutor from executor.ts has a different API structure
```

However, the deeper issue is **semantic mocking**:

1. **Tool Selection Intelligence:** Tests need the LLM to make intelligent choices between tools based on context
2. **Multi-turn Conversations:** Many tests require multiple tool uses with proper reasoning
3. **Context Understanding:** The mock needs to understand when to transition, when to use meta-tools, etc.

### Example Test Case That Fails

From `tool-execution.test.ts:86-117`:
```typescript
it('should generate transition tools from outbound edges', async () => {
    // Mock LLM to choose pathA
    mockClaudeClient.invokeWithTools.mockResolvedValueOnce({
        content: [
            { type: 'text', text: 'I will choose path A' },
            { type: 'tool_use', id: 'tool_1', name: 'transition',
              input: { target: 'pathA', reason: 'matches criteria' }
            }
        ],
        stop_reason: 'tool_use'
    });

    await executor.step();
    expect(context.currentNode).toBe('pathA');
});
```

**Problem:** Manually mocking each response is tedious and brittle. Need **semantic understanding**.

## Proposed Solutions

### Option 1: Interactive Test Mode (RECOMMENDED)

**Concept:** Claude Code running the tests acts as the LLM backend.

#### Architecture

```
┌─────────────────────┐
│   Test Runner       │
│   (npm test)        │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ MachineExecutor     │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ InteractiveClient   │ ← New: Test transport
│ (extends Claude-    │
│  Client)            │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ Claude Code Agent   │ ← Running test command
│ (stdio/IPC comm)    │
└─────────────────────┘
```

#### Implementation Sketch

**1. New Transport Type:**

```typescript
// src/language/claude-client.ts
export type ClaudeClientTransport = 'api' | 'bedrock' | 'test-interactive';

export interface ClaudeClientConfig {
    transport: ClaudeClientTransport;
    // ... existing fields
    testMode?: {
        type: 'interactive' | 'playback' | 'smart-mock';
        communicationChannel?: 'stdio' | 'ipc' | 'socket';
    };
}
```

**2. Interactive Test Client:**

```typescript
// src/language/test-interactive-client.ts
export class InteractiveTestClient extends ClaudeClient {
    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        // Format the request for the agent
        const testRequest = {
            type: 'llm_invocation_request',
            systemPrompt: this.formatMessages(messages),
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                schema: t.input_schema
            })),
            context: {
                testName: expect.getState().currentTestName,
                testFile: expect.getState().testPath
            }
        };

        // Send to Claude Code via stdio
        process.stdout.write(JSON.stringify(testRequest) + '\n');

        // Wait for response from Claude Code
        const response = await this.waitForResponse();

        return response;
    }
}
```

**3. Test Environment Variable:**

```bash
# Enable interactive testing
DYGRAM_TEST_MODE=interactive npm test

# Claude Code would detect this and offer to participate
```

**4. Claude Code Integration:**

When running tests with `DYGRAM_TEST_MODE=interactive`, Claude Code would:
1. Detect special JSON messages on stdout
2. Parse tool definitions and context
3. Make intelligent tool selection decisions
4. Stream responses back to test process
5. Handle multi-turn conversations

#### Usage Example

```typescript
describe('Tool Execution', () => {
    beforeEach(() => {
        const client = new InteractiveTestClient({
            transport: 'test-interactive',
            testMode: { type: 'interactive' }
        });
        executor = new MachineExecutor(machineData, { llm: client });
    });

    it('should choose correct transition', async () => {
        // No manual mocking needed!
        // Claude Code running test will intelligently pick the right tool
        await executor.step();

        const context = executor.getContext();
        // Assertion based on expected intelligent behavior
        expect(context.currentNode).toBe('pathA');
    });
});
```

#### Advantages

- **Real Intelligence:** Uses actual Claude reasoning
- **No API Costs:** No external API calls
- **Maintainable:** No brittle mock responses to maintain
- **Comprehensive:** Can handle complex multi-turn scenarios
- **Developer Experience:** Claude Code users can run full test suite

#### Challenges

- Requires Claude Code agent capability enhancement
- Test execution becomes stateful (depends on agent responses)
- May need snapshot mechanism for determinism (record mode)
- Non-Claude-Code users would need playback mode

---

### Option 2: Record/Playback Pattern (VCR Style)

**Concept:** Record real API responses during a "recording session", replay during tests.

#### Implementation

**1. Recording Client:**

```typescript
// src/language/recording-client.ts
export class RecordingClient extends ClaudeClient {
    private recordings: Map<string, ModelResponse> = new Map();

    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        const key = this.generateKey(messages, tools);

        if (process.env.RECORD_MODE === 'true') {
            // Make real API call
            const response = await super.invokeWithTools(messages, tools);

            // Record it
            this.recordings.set(key, response);
            await this.saveRecording(key, response);

            return response;
        } else {
            // Playback mode
            const recording = await this.loadRecording(key);
            if (!recording) {
                throw new Error(`No recording found for key: ${key}`);
            }
            return recording;
        }
    }
}
```

**2. Usage:**

```bash
# Record responses (requires API key)
RECORD_MODE=true ANTHROPIC_API_KEY=sk-... npm test

# Playback (no API key needed)
npm test
```

**3. Storage:**

```
test/fixtures/recordings/
├── tool-execution/
│   ├── choose-pathA-abc123.json
│   ├── choose-pathB-def456.json
│   └── meta-tool-add-node-ghi789.json
```

#### Advantages

- Deterministic test results
- Fast execution (no API calls)
- Real Claude responses captured
- Works for all developers (no API key after recording)

#### Disadvantages

- Recordings become stale as code changes
- Need to re-record when tests change
- Storage overhead for many recordings
- Brittle to prompt changes

---

### Option 3: Enhanced Smart Mock

**Concept:** Improve MockClaudeClient with heuristics for intelligent tool selection.

#### Implementation

```typescript
// src/language/mock-claude-client.ts
export class MockClaudeClient {
    async invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[]
    ): Promise<ModelResponse> {
        await this.simulateDelay(150);

        // Parse the user message for intent
        const lastMessage = messages[messages.length - 1];
        const prompt = this.extractPromptText(lastMessage);

        // Smart tool selection
        const selectedTool = this.selectToolByHeuristics(prompt, tools);

        if (selectedTool) {
            return {
                content: [
                    { type: 'text', text: `Using ${selectedTool.name}` },
                    {
                        type: 'tool_use',
                        id: `mock_${Date.now()}`,
                        name: selectedTool.name,
                        input: this.generateSmartInput(selectedTool, prompt)
                    }
                ],
                stop_reason: 'tool_use'
            };
        }

        return { content: [{ type: 'text', text: 'Task complete' }], stop_reason: 'end_turn' };
    }

    private selectToolByHeuristics(prompt: string, tools: ToolDefinition[]): ToolDefinition | null {
        // Heuristic 1: Transition tools
        const transitionTools = tools.filter(t => t.name.startsWith('transition_to_'));
        if (transitionTools.length > 0) {
            // Look for keywords in prompt
            for (const tool of transitionTools) {
                const target = tool.name.replace('transition_to_', '');
                if (prompt.toLowerCase().includes(target.toLowerCase())) {
                    return tool;
                }
            }
            // Default to first transition
            return transitionTools[0];
        }

        // Heuristic 2: Meta tools
        if (prompt.includes('add') && tools.find(t => t.name === 'add_node')) {
            return tools.find(t => t.name === 'add_node')!;
        }

        // Heuristic 3: Keyword matching
        for (const tool of tools) {
            const keywords = tool.description.toLowerCase().split(' ');
            for (const word of keywords) {
                if (prompt.toLowerCase().includes(word)) {
                    return tool;
                }
            }
        }

        // Fallback
        return tools[0] || null;
    }
}
```

#### Advantages

- No external dependencies
- Fast (no I/O)
- Works for all developers immediately
- Easy to enhance incrementally

#### Disadvantages

- Heuristics will never match real Claude intelligence
- Maintenance burden as edge cases emerge
- May not handle complex reasoning scenarios
- Could give false confidence in tests

---

### Option 4: Hybrid Approach (MOST PRACTICAL)

**Concept:** Combine multiple approaches based on context.

#### Strategy

1. **Default:** Enhanced smart mock (Option 3) for quick local testing
2. **CI Pipeline:** Record/playback (Option 2) for deterministic CI runs
3. **Deep Testing:** Interactive mode (Option 1) when working on execution logic
4. **Manual Override:** `vi.mock()` for specific test cases needing precise control

#### Configuration

```typescript
// vitest.config.ts
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/setup/test-client-setup.ts']
    }
});

// test/setup/test-client-setup.ts
import { beforeAll } from 'vitest';
import { setGlobalTestClient } from './test-client-factory';

beforeAll(() => {
    const mode = process.env.DYGRAM_TEST_MODE || 'smart-mock';

    switch (mode) {
        case 'interactive':
            setGlobalTestClient('interactive');
            break;
        case 'playback':
            setGlobalTestClient('playback');
            break;
        case 'smart-mock':
        default:
            setGlobalTestClient('smart-mock');
            break;
    }
});
```

#### Usage

```bash
# Quick local testing
npm test

# Record new baselines (requires API key)
DYGRAM_TEST_MODE=playback RECORD_MODE=true npm test

# CI pipeline
DYGRAM_TEST_MODE=playback npm test

# Interactive deep testing with Claude Code
DYGRAM_TEST_MODE=interactive npm test

# Specific test override
npm test -- tool-execution.test.ts
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

1. **Enhance MockClaudeClient**
   - Add heuristic-based tool selection
   - Improve input generation
   - Add configuration options

2. **Un-skip Basic Tests**
   - Update API references in skipped tests
   - Start with simple test cases
   - Validate architecture with smart mock

### Phase 2: Recording (Week 2)

1. **Implement Recording Client**
   - Create `RecordingClient` class
   - Add storage/retrieval logic
   - Implement key generation

2. **Record Baseline Responses**
   - Run tests in record mode with real API
   - Commit recordings to repository
   - Document recording process

### Phase 3: Interactive Mode (Week 3-4)

1. **Design Communication Protocol**
   - Define JSON message format
   - Choose communication channel (stdio recommended)
   - Document agent integration requirements

2. **Implement Interactive Client**
   - Create `InteractiveTestClient`
   - Add request/response handling
   - Handle timeouts and errors

3. **Claude Code Integration**
   - Add test mode detection
   - Implement agent response handler
   - Test end-to-end flow

### Phase 4: Polish (Week 5)

1. **Documentation**
   - Testing guide for contributors
   - Claude Code testing workflow
   - Troubleshooting common issues

2. **CI Integration**
   - Update GitHub Actions workflows
   - Add playback mode validation
   - Ensure deterministic results

## Decision Matrix

| Approach | Intelligence | Speed | Maintenance | Determinism | Adoption |
|----------|-------------|-------|-------------|-------------|----------|
| vi.mock() | ⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| MockClaudeClient (current) | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Smart Mock | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Record/Playback | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Interactive | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐ | ⭐ |
| Hybrid | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |

## Recommendation

**Implement the Hybrid Approach** with prioritized phases:

1. **Immediate (This Week):** Enhance MockClaudeClient with smart heuristics
2. **Short-term (Next Sprint):** Add recording/playback for CI determinism
3. **Long-term (Next Quarter):** Explore interactive mode with Claude Code integration

This balances practical immediate gains with ambitious long-term vision.

## Appendix: Example Test Cases

### Test Case 1: Tool Selection

```typescript
it('should intelligently choose transition based on context', async () => {
    const machineData = {
        title: 'Router',
        nodes: [
            { name: 'start', type: 'task',
              attributes: [{ name: 'prompt', type: 'string',
                            value: 'Route to error handling' }] },
            { name: 'success', type: 'state' },
            { name: 'error', type: 'state' }
        ],
        edges: [
            { source: 'start', target: 'success' },
            { source: 'start', target: 'error' }
        ]
    };

    const executor = new MachineExecutor(machineData, {
        llm: new SmartMockClient() // Should pick 'error' based on prompt
    });

    await executor.step();
    expect(executor.getContext().currentNode).toBe('error');
});
```

### Test Case 2: Meta-Programming

```typescript
it('should construct and use dynamic tool', async () => {
    const machineData = {
        title: 'Self-Improving',
        nodes: [
            { name: 'start', type: 'task',
              attributes: [
                { name: 'meta', type: 'boolean', value: 'true' },
                { name: 'prompt', type: 'string',
                  value: 'Add a validation node' }
              ]}
        ],
        edges: []
    };

    const executor = new MachineExecutor(machineData, {
        llm: new SmartMockClient() // Should use add_node tool
    });

    await executor.step();

    const updatedMachine = executor.getMachineDefinition();
    expect(updatedMachine.nodes.some(n =>
        n.name.includes('validation')
    )).toBe(true);
});
```

## Questions for Discussion

1. **Priority:** Which approach should we implement first?
2. **Interactive Mode:** Is Claude Code integration feasible/desirable?
3. **Determinism:** How important is test determinism vs. intelligence?
4. **Recording:** Should we commit recordings to git or use Git LFS?
5. **Hybrid:** Should different test files use different modes by default?

## References

- Skipped tests: `/test/validating/tool-execution.test.ts`, `/test/validating/task-execution.test.ts`
- Current mock: `/src/language/mock-claude-client.ts`
- Executor: `/src/language/executor.ts`
- Effect executor: `/src/language/execution/effect-executor.ts`
