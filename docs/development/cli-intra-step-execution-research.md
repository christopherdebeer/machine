# CLI Intra-Step Execution Research

## Executive Summary

This document researches the feasibility and design of exposing intra-step (turn-level) execution in the CLI `execute` command. The goal is to enable per-turn manual control via CLI, allowing users to step through LLM invocations one at a time and optionally provide manual responses.

**Status**: Research Complete
**Date**: 2025-12-01
**Next Steps**: Design CLI interface and integrate with existing clients

---

## Background

### What is Intra-Step Execution?

**Intra-step execution** (also called **turn-level execution**) refers to fine-grained control over agent node execution. Instead of running an entire agent conversation in one `step()` call, it allows stepping through:

- Individual LLM invocations (turns)
- Tool executions within each turn
- Intermediate reasoning and state

This was implemented in PR #423 (commit `ff470eb`) and is currently available in the browser playground UI but not exposed via CLI.

### Current State

**Browser Playground** (`CodeMirrorPlayground.tsx`):
- ✅ Full turn-level stepping via "Step Turn" button
- ✅ Pause/resume at turn boundaries
- ✅ Visual display of turn state (turn count, tools used)
- ✅ Support for playback and recording modes

**CLI** (`src/cli/main.ts`):
- ❌ Only supports full execution via `executor.execute()`
- ❌ No turn-level control
- ❌ No interactive mode
- ❌ No playback/recording support

---

## Core Implementation (Already Exists)

### 1. Turn Executor (`src/language/execution/turn-executor.ts`)

The `TurnExecutor` class handles turn-by-turn execution:

```typescript
class TurnExecutor {
    // Initialize conversation from LLM effect
    initializeConversation(effect: InvokeLLMEffect): ConversationState

    // Execute a single turn (one LLM invocation)
    async executeTurn(
        conversationState: ConversationState,
        nodeName: string
    ): Promise<TurnResult>

    // Check if reached max turns (default: 50)
    hasReachedTurnLimit(turnCount: number): boolean
}
```

**Key Features**:
- Executes ONE LLM invocation per `executeTurn()` call
- Processes all tool uses from that invocation sequentially
- Maintains full conversation state for resumption
- Detects completion (no tools = conversation done)

### 2. MachineExecutor Extensions (`src/language/executor.ts`)

Public API for turn-level control:

```typescript
class MachineExecutor {
    // Execute a single turn
    async stepTurn(): Promise<TurnStepResult>

    // Check if currently in a turn
    isInTurn(): boolean

    // Get current turn state (for display)
    getTurnState(): TurnState | undefined

    // Request pause at next turn boundary
    requestPause(): void

    // Clear pause request to resume
    clearPauseRequest(): void

    // Check if pause requested
    isPauseRequested(): boolean
}
```

**TurnStepResult** includes:
- `status`: 'in_turn' | 'complete' | 'error' | 'transition' | 'waiting'
- `toolExecutions`: Tools executed in this turn
- `text`: Text output from this turn
- `nextNode`: Next node if transition occurred
- `turnCount`: Current turn number
- `error`: Error if failed

### 3. Turn State Types (`src/language/execution/turn-types.ts`)

```typescript
interface TurnState {
    pathId: string;              // Execution path identifier
    nodeName: string;            // Current node name
    conversationState: ConversationState;  // Full conversation for resume
    turnCount: number;           // Number of turns executed
    isWaitingForTurn: boolean;   // Waiting for next turn
    systemPrompt: string;        // System prompt for agent
    modelId?: string;            // Model override
}

interface ConversationState {
    messages: Array<{ role: 'user' | 'assistant'; content: any }>;
    tools: ToolDefinition[];
    toolExecutions: ToolExecutionResult[];
    accumulatedText: string;
}
```

---

## Existing Client Architecture

### Client Types

All clients implement a common LLM interface:

```typescript
interface LLMClient {
    invokeModel(prompt: string, modelIdOverride?: string): Promise<string>;
    invokeWithTools(
        messages: ConversationMessage[],
        tools: ToolDefinition[],
        systemPrompt?: string,
        modelIdOverride?: string
    ): Promise<ModelResponse>;
}
```

#### 1. **PlaybackTestClient** (`src/language/playback-test-client.ts`)

**Purpose**: Playback pre-recorded LLM responses (file-based)

**Configuration**:
```typescript
interface PlaybackTestConfig {
    recordingsDir: string;           // Directory with recordings
    simulateDelay?: boolean;         // Simulate API latency
    delay?: number;                  // Delay in ms (default: 100)
    strict?: boolean;                // Error on missing recording
    matchingMode?: 'signature' | 'sequential' | 'hybrid';
}
```

**Usage**:
```typescript
const client = new PlaybackTestClient({
    recordingsDir: 'test/fixtures/recordings/task-execution',
    simulateDelay: true,
    delay: 100,
    strict: true,
    matchingMode: 'hybrid'
});

const executor = new MachineExecutor(machineData, { llm: client });
```

**Key Features**:
- Loads recordings from filesystem directory
- Signature-based matching (tool names, message count, context keys)
- Sequential fallback for legacy recordings
- Validates tool compatibility
- Deterministic playback for CI

#### 2. **InteractiveTestClient** (`src/language/interactive-test-client.ts`)

**Purpose**: Live LLM interaction via external agent responder

**Configuration**:
```typescript
interface InteractiveTestConfig {
    mode: 'file-queue' | 'socket' | 'http';
    queueDir?: string;               // For file-queue mode
    socketPath?: string;             // For socket mode
    httpEndpoint?: string;           // For HTTP mode
    timeout?: number;                // Request timeout (default: 60s)
    recordResponses?: boolean;       // Record for playback later
    recordingsDir?: string;          // Where to save recordings
    overwriteExisting?: boolean;     // Overwrite existing recordings
    sessionId?: string;              // Session identifier
    maxRecordingsPerTest?: number;   // Limit recordings per test
    cleanBeforeRecording?: boolean;  // Clean dir before recording
}
```

**Usage**:
```typescript
const client = new InteractiveTestClient({
    mode: 'file-queue',
    queueDir: '.dygram-test-queue',
    recordResponses: true,
    recordingsDir: 'test/fixtures/recordings/task-execution',
    timeout: 60000
});

const executor = new MachineExecutor(machineData, { llm: client });
```

**Key Features**:
- Communicates with external agent via IPC
- File-queue: Request/response files in shared directory
- Maintains heartbeat lock file for process sync
- Automatically records responses for CI playback
- Supports test context extraction (vitest integration)
- Session-based recording with deterministic naming

#### 3. **BrowserPlaybackClient** (`src/language/browser-playback-client.ts`)

**Purpose**: Browser-based playback from API

**Configuration**:
```typescript
interface BrowserPlaybackConfig {
    exampleName: string;             // Example identifier
    category: string;                // Category (e.g., 'execution-features')
    simulateDelay?: boolean;         // Simulate latency
    delay?: number;                  // Delay in ms (default: 150)
    matchingMode?: 'signature' | 'sequential' | 'hybrid';
}
```

**Key Features**:
- Loads recordings from HTTP API
- Signature-based matching
- Browser-compatible (no filesystem)

#### 4. **BrowserRecordingClient** (`src/language/browser-recording-client.ts`)

**Purpose**: Transparent recording of live API responses in browser

**Configuration**:
```typescript
interface BrowserRecordingConfig {
    apiKey: string;
    modelId?: string;
    exampleName: string;
    category: string;
    userNotes?: string;
    transport?: 'api' | 'bedrock';
}
```

**Key Features**:
- Acts as proxy to real ClaudeClient
- Captures all request/response pairs
- Extracts request signatures
- Provides download functionality

---

## CLI Execute Command Analysis

### Current Implementation (`src/cli/main.ts:366-547`)

```typescript
export const executeAction = async (
    fileName: string,
    opts: {
        destination?: string;
        model?: string;
        verbose?: boolean;
        quiet?: boolean;
        noImports?: boolean
    }
): Promise<void> => {
    // 1. Load and parse machine
    // 2. Configure LLM client (Anthropic with API key)
    // 3. Create executor
    const executor = await MachineExecutor.create(machineData, config);

    // 4. Execute entire machine in one go
    const executionResult = await executor.execute();

    // 5. Write results to file
    // 6. Display execution path and outputs
}
```

**Limitations**:
- ❌ No turn-level control
- ❌ No interactive mode
- ❌ No playback mode
- ❌ No recording mode
- ❌ No pause/resume
- ❌ No per-turn inspection

**Strengths**:
- ✅ Handles imports
- ✅ Supports model override
- ✅ Machine update callback
- ✅ Result persistence
- ✅ Execution history display

---

## Proposed Design: CLI Intra-Step Execution

### Goals

1. **Enable turn-level stepping in CLI**: Step through LLM invocations one at a time
2. **Support interactive mode**: Manual responses per turn (eventually)
3. **Reuse existing clients**: Leverage PlaybackTestClient and InteractiveTestClient
4. **Maintain backward compatibility**: Keep existing `execute` command behavior
5. **Progressive disclosure**: Simple by default, powerful when needed

### Design Option A: New `--interactive` Flag

Add interactive mode to existing `execute` command:

```bash
# Normal execution (unchanged)
dygram execute app.dygram

# Interactive mode with turn-level control
dygram execute app.dygram --interactive

# Interactive mode with playback
dygram execute app.dygram --interactive --playback recordings/

# Interactive mode with recording
dygram execute app.dygram --interactive --record recordings/
```

**Implementation**:

```typescript
interface ExecuteOptions {
    destination?: string;
    model?: string;
    verbose?: boolean;
    quiet?: boolean;
    noImports?: boolean;

    // New options
    interactive?: boolean;          // Enable turn-level interactive mode
    playback?: string;              // Playback from recordings dir
    record?: string;                // Record to recordings dir
    matchingMode?: 'signature' | 'sequential' | 'hybrid';
}

export const executeAction = async (
    fileName: string,
    opts: ExecuteOptions
): Promise<void> => {
    // ... existing loading code ...

    let llmClient: any;

    // Configure client based on mode
    if (opts.playback) {
        llmClient = new PlaybackTestClient({
            recordingsDir: opts.playback,
            simulateDelay: true,
            delay: 100,
            strict: true,
            matchingMode: opts.matchingMode || 'hybrid'
        });
    } else if (opts.record) {
        llmClient = new InteractiveTestClient({
            mode: 'file-queue',
            queueDir: '.dygram-interactive-queue',
            recordResponses: true,
            recordingsDir: opts.record,
            timeout: 60000
        });
    } else {
        // Use normal ClaudeClient with API key
        llmClient = { /* existing config */ };
    }

    const executor = await MachineExecutor.create(machineData, {
        llm: llmClient,
        // ... other config
    });

    if (opts.interactive) {
        await runInteractiveExecution(executor, opts);
    } else {
        // Existing full execution
        const result = await executor.execute();
        // ... existing result handling ...
    }
}
```

**Interactive Execution Loop**:

```typescript
async function runInteractiveExecution(
    executor: MachineExecutor,
    opts: ExecuteOptions
): Promise<void> {
    logger.info(chalk.blue('\n⚡ Interactive Mode: Turn-by-Turn Execution'));
    logger.info(chalk.gray('Commands: [n]ext turn, [c]ontinue, [s]tatus, [q]uit\n'));

    // Set up readline for user input
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let autoRun = false;

    while (executor.getStatus() !== 'complete' &&
           executor.getStatus() !== 'error') {

        // Show current state
        if (executor.isInTurn()) {
            const turnState = executor.getTurnState();
            logger.info(chalk.cyan(`\n📍 Turn ${turnState.turnCount} - Node: ${turnState.nodeName}`));
            logger.debug(`   Messages: ${turnState.conversationState.messages.length}`);
            logger.debug(`   Tools executed: ${turnState.conversationState.toolExecutions.length}`);
        } else {
            logger.info(chalk.cyan(`\n📍 Current node: ${executor.getCurrentNode()}`));
        }

        // Auto-run or prompt for command
        if (!autoRun) {
            const command = await promptUser(rl, 'Command> ');

            if (command === 'q' || command === 'quit') {
                logger.info(chalk.yellow('Execution interrupted'));
                break;
            } else if (command === 'c' || command === 'continue') {
                autoRun = true;
                logger.info(chalk.green('Auto-running remaining execution...'));
            } else if (command === 's' || command === 'status') {
                showDetailedStatus(executor);
                continue;
            } else if (command !== 'n' && command !== 'next') {
                logger.warn(`Unknown command: ${command}`);
                continue;
            }
        }

        // Execute next step
        if (executor.isInTurn()) {
            // Continue turn-level execution
            const result = await executor.stepTurn();
            displayTurnResult(result);

            if (result.status === 'error') {
                logger.error(`Error: ${result.error}`);
                break;
            }
        } else {
            // Step to next node
            const stepResult = await executor.step();
            displayStepResult(stepResult);

            if (stepResult.status === 'error') {
                logger.error(`Error: ${stepResult.error}`);
                break;
            }
        }
    }

    rl.close();

    // Show final results
    const finalResult = executor.getExecutionResult();
    displayExecutionSummary(finalResult);
}

function displayTurnResult(result: TurnStepResult): void {
    logger.success(`\n✓ Turn completed (${result.status})`);

    if (result.toolExecutions.length > 0) {
        logger.info(chalk.blue('  Tools executed:'));
        result.toolExecutions.forEach(tool => {
            logger.info(chalk.gray(`    • ${tool.toolName}: ${tool.result.slice(0, 60)}...`));
        });
    }

    if (result.text) {
        logger.info(chalk.blue('  Output:'));
        logger.info(chalk.gray(`    ${result.text.slice(0, 100)}...`));
    }
}

function showDetailedStatus(executor: MachineExecutor): void {
    const state = executor.getExecutionState();

    logger.heading('\n📊 Execution State:');
    logger.info(`  Current Node: ${state.currentNode}`);
    logger.info(`  Status: ${executor.getStatus()}`);
    logger.info(`  Steps Executed: ${executor.getExecutionResult().history.length}`);

    if (executor.isInTurn()) {
        const turnState = executor.getTurnState();
        logger.info(chalk.blue('\n  Turn State:'));
        logger.info(`    Turn Count: ${turnState.turnCount}`);
        logger.info(`    Node: ${turnState.nodeName}`);
        logger.info(`    Messages: ${turnState.conversationState.messages.length}`);
        logger.info(`    Tools Executed: ${turnState.conversationState.toolExecutions.length}`);
    }
}
```

### Design Option B: New `interactive` Subcommand

Create a dedicated command for interactive execution:

```bash
# Interactive execution
dygram interactive app.dygram

# With playback
dygram interactive app.dygram --playback recordings/

# With recording
dygram interactive app.dygram --record recordings/
```

**Pros**:
- Clear separation of concerns
- More room for interactive-specific options
- Less cluttered help text for `execute`

**Cons**:
- New command to learn
- Code duplication with `execute`

### Design Option C: REPL-Style Interactive Mode

Full REPL with rich commands:

```bash
dygram repl app.dygram
```

```
DyGram Interactive Shell (v1.0.0)
Machine: app.dygram

> help
Commands:
  next, n          - Execute next turn
  continue, c      - Run to completion
  step, s          - Step to next node
  status, st       - Show execution state
  context, ctx     - Show context variables
  history, h       - Show execution history
  tools, t         - Show available tools
  inspect <id>     - Inspect execution step
  quit, q          - Exit

> status
📍 Current Node: start (task)
   Status: in_turn
   Turn: 1
   Messages: 2
   Tools: 3

> next
⚡ Executing turn 1...
✓ Turn completed
  Tools used: read_file (config.json)
  Output: Read configuration successfully

> context
📋 Context Variables:
  config: { "apiKey": "...", "model": "claude-3-5-sonnet" }
  fileContent: "..."

> continue
🚀 Running to completion...
...
```

**Pros**:
- Most powerful and flexible
- Best developer experience
- Natural for debugging
- Can add more commands over time

**Cons**:
- Most complex implementation
- Requires readline/REPL infrastructure
- May be overkill for simple use cases

---

## Recommended Approach

### Phase 1: Basic Interactive Mode (Design Option A)

Start with `--interactive` flag on `execute` command:

**Rationale**:
- Minimal changes to existing CLI structure
- Backward compatible
- Easy to use and understand
- Sufficient for initial use case

**Implementation Priority**:
1. ✅ Research existing implementation (DONE)
2. Add `--interactive` flag to execute command
3. Implement basic turn-level loop with readline
4. Add `--playback` support for PlaybackTestClient
5. Add `--record` support for InteractiveTestClient
6. Add status display helpers
7. Documentation and examples

### Phase 2: Manual Response Injection (Future)

Enable manual LLM response injection:

```bash
dygram execute app.dygram --interactive --manual
```

In interactive mode:
```
> next
⚡ Turn 1 - Node: agent_task
   System: Please analyze the data
   Tools: [read_file, write_file]

📝 Enter manual response (or press Enter for auto):
> I will read the data file first.
> <use_tool>read_file</use_tool>
> <parameters>{"path": "data.json"}</parameters>
> [DONE]

✓ Manual response accepted
  Tool: read_file
  Result: {"data": [1, 2, 3]}

> next
...
```

**Implementation**:
- Create ManualTestClient that prompts for responses
- Parse simple text + tool use format
- Validate responses before sending to executor
- Support multi-line input

### Phase 3: Full REPL (Future)

If phase 1 and 2 prove valuable, upgrade to full REPL (Design Option C):

```bash
dygram repl app.dygram
```

---

## Integration with Existing Clients

### PlaybackTestClient Integration

**Use Case**: Deterministic testing and demonstration

```bash
# Record a session interactively
dygram execute app.dygram --interactive --record recordings/demo-session/

# Playback the session
dygram execute app.dygram --playback recordings/demo-session/
```

**Benefits**:
- Reproducible execution for debugging
- Demo recordings for documentation
- CI testing without API calls
- Fast iteration without API costs

### InteractiveTestClient Integration

**Use Case**: Live agent responses during development

```bash
# Terminal 1: Start agent responder (Claude Code or custom agent)
node scripts/test-agent-responder.js

# Terminal 2: Run interactive execution
dygram execute app.dygram --interactive --record recordings/live-session/
```

**Benefits**:
- Real agent reasoning during development
- Automatic recording for later playback
- Test machine behavior with real LLM
- Iterate on prompts and tools

---

## Technical Considerations

### 1. Readline Integration

Use Node.js `readline` module for user input:

```typescript
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'DyGram> '
});

function promptUser(rl: readline.Interface, prompt: string): Promise<string> {
    return new Promise(resolve => {
        rl.question(prompt, answer => resolve(answer.trim()));
    });
}
```

### 2. Signal Handling

Handle Ctrl+C gracefully:

```typescript
process.on('SIGINT', () => {
    logger.info(chalk.yellow('\n\n⚡ Execution interrupted'));
    logger.info('Saving partial results...');

    // Save current state
    const partialResult = executor.getExecutionResult();
    saveResults(partialResult);

    process.exit(0);
});
```

### 3. State Persistence

Save execution state between sessions:

```typescript
interface ExecutionCheckpoint {
    machineData: MachineJSON;
    executionState: any;  // From executor.getExecutionState()
    timestamp: string;
    turnCount: number;
}

async function saveCheckpoint(executor: MachineExecutor): Promise<void> {
    const checkpoint: ExecutionCheckpoint = {
        machineData: executor.getMachineData(),
        executionState: executor.getExecutionState(),
        timestamp: new Date().toISOString(),
        turnCount: executor.getTurnState()?.turnCount || 0
    };

    await fs.writeFile('execution-checkpoint.json', JSON.stringify(checkpoint, null, 2));
}

async function resumeFromCheckpoint(checkpointPath: string): Promise<MachineExecutor> {
    const checkpoint: ExecutionCheckpoint = JSON.parse(
        await fs.readFile(checkpointPath, 'utf-8')
    );

    const executor = await MachineExecutor.create(checkpoint.machineData);
    // Restore state (may need executor method for this)

    return executor;
}
```

### 4. Display Formatting

Use chalk for colored output:

```typescript
function displayTurnResult(result: TurnStepResult): void {
    logger.success(`\n✓ Turn ${result.turnCount} completed`);

    // Tools section
    if (result.toolExecutions.length > 0) {
        logger.info(chalk.blue('\n  🔧 Tools Executed:'));
        result.toolExecutions.forEach((tool, i) => {
            const status = tool.error ? chalk.red('✗') : chalk.green('✓');
            logger.info(`    ${status} ${chalk.bold(tool.toolName)}`);

            if (tool.parameters) {
                const params = JSON.stringify(tool.parameters, null, 2)
                    .split('\n')
                    .map(line => `      ${chalk.gray(line)}`)
                    .join('\n');
                logger.info(params);
            }

            if (tool.result) {
                const result = String(tool.result).slice(0, 100);
                logger.info(`      ${chalk.gray('→')} ${chalk.cyan(result)}...`);
            }
        });
    }

    // Text output section
    if (result.text) {
        logger.info(chalk.blue('\n  💬 Output:'));
        const lines = result.text.split('\n').slice(0, 5);
        lines.forEach(line => {
            logger.info(`    ${chalk.white(line)}`);
        });
        if (result.text.split('\n').length > 5) {
            logger.info(chalk.gray('    ... (truncated)'));
        }
    }

    // Next node section
    if (result.nextNode) {
        logger.info(chalk.blue('\n  ➡️  Next Node:'), chalk.bold(result.nextNode));
    }
}
```

### 5. Verbose Logging

Add `--verbose` mode for detailed execution info:

```typescript
if (opts.verbose) {
    // Log turn state before execution
    logger.debug(chalk.gray('\n--- Turn State ---'));
    logger.debug(chalk.gray(`Path ID: ${turnState.pathId}`));
    logger.debug(chalk.gray(`Node: ${turnState.nodeName}`));
    logger.debug(chalk.gray(`Turn Count: ${turnState.turnCount}`));
    logger.debug(chalk.gray(`Message History:`));
    turnState.conversationState.messages.forEach((msg, i) => {
        logger.debug(chalk.gray(`  ${i + 1}. ${msg.role}: ${JSON.stringify(msg.content).slice(0, 50)}...`));
    });
    logger.debug(chalk.gray(`Tools Available: ${turnState.conversationState.tools.map(t => t.name).join(', ')}`));
    logger.debug(chalk.gray('---\n'));
}
```

---

## Testing Strategy

### Unit Tests

Test individual components:

```typescript
describe('CLI Interactive Mode', () => {
    it('should execute turn-by-turn with PlaybackTestClient', async () => {
        const client = new PlaybackTestClient({
            recordingsDir: 'test/fixtures/recordings/cli-test',
            simulateDelay: false
        });

        const executor = await MachineExecutor.create(testMachine, { llm: client });

        // Step through turns
        const turn1 = await executor.stepTurn();
        expect(turn1.status).toBe('in_turn');
        expect(turn1.toolExecutions).toHaveLength(1);

        const turn2 = await executor.stepTurn();
        expect(turn2.status).toBe('complete');
    });
});
```

### Integration Tests

Test full CLI execution:

```bash
# Test playback mode
npm run test:cli -- test/fixtures/cli-integration/basic.dygram --interactive --playback test/fixtures/recordings/basic

# Test recording mode (with mock agent responder)
npm run test:cli -- test/fixtures/cli-integration/basic.dygram --interactive --record /tmp/cli-test-recording
```

### Manual Testing

```bash
# Test basic interactive mode
dygram execute examples/codegen-schema.dygram --interactive --verbose

# Test with playback
dygram execute examples/codegen-schema.dygram --interactive --playback examples/recordings/codegen-schema/

# Test with recording (requires agent responder)
node scripts/test-agent-responder.js &
dygram execute examples/codegen-schema.dygram --interactive --record /tmp/test-recording/
```

---

## Documentation Requirements

### 1. CLI Help Text

Update command help:

```bash
dygram execute --help
```

```
Usage: dygram execute|exec|e [options] <file>

executes a machine program

Options:
  -d, --destination <dir>     destination directory for execution results
  -m, --model <model>         model ID to use (e.g., claude-3-5-haiku-20241022)
  -v, --verbose               verbose output
  -q, --quiet                 quiet output (errors only)
  --interactive               enable turn-by-turn interactive execution
  --playback <dir>            playback from recordings directory
  --record <dir>              record execution to directory
  --matching-mode <mode>      playback matching mode: signature|sequential|hybrid (default: hybrid)
  -h, --help                  display help for command

Examples:
  dygram execute app.dygram                                    # full execution
  dygram execute app.dygram --interactive                      # interactive turn-by-turn
  dygram execute app.dygram --playback recordings/demo/        # playback recorded session
  dygram execute app.dygram --interactive --record recordings/ # record while executing
```

### 2. User Guide

Create `docs/cli/interactive-execution.md`:

```markdown
# Interactive Execution

Interactive mode enables turn-by-turn execution control via the CLI,
allowing you to step through LLM invocations one at a time, inspect
state, and control execution flow.

## Basic Usage

...

## Playback Mode

...

## Recording Mode

...
```

### 3. Examples

Add example recordings to repository:

```
examples/
  recordings/
    basic/
      recording-0001.json
      recording-0002.json
    codegen-schema/
      recording-0001.json
      recording-0002.json
```

---

## Implementation Checklist

### Phase 1: Basic Interactive Mode

- [ ] Add CLI options (`--interactive`, `--playback`, `--record`, `--matching-mode`)
- [ ] Create `runInteractiveExecution()` function
- [ ] Implement readline-based command loop
- [ ] Add PlaybackTestClient integration
- [ ] Add InteractiveTestClient integration
- [ ] Implement turn result display functions
- [ ] Add status display helpers
- [ ] Handle Ctrl+C gracefully
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Update CLI help text
- [ ] Create user documentation
- [ ] Add example recordings

### Phase 2: Enhanced Display (Optional)

- [ ] Add progress bar for turn execution
- [ ] Improve tool execution display
- [ ] Add syntax highlighting for outputs
- [ ] Add execution timeline visualization
- [ ] Add context variable inspector

### Phase 3: Manual Response Mode (Future)

- [ ] Create ManualTestClient
- [ ] Implement manual response prompt
- [ ] Add response parsing (text + tools)
- [ ] Add response validation
- [ ] Support multi-line input
- [ ] Update documentation

### Phase 4: Full REPL (Future)

- [ ] Design REPL command structure
- [ ] Implement command parser
- [ ] Add command history
- [ ] Add tab completion
- [ ] Add help system
- [ ] Create REPL documentation

---

## Open Questions

### 1. State Persistence

**Question**: Should we support resuming execution from checkpoints?

**Options**:
- A: No persistence, each run starts fresh (simplest)
- B: Auto-save checkpoints, resume with `--resume checkpoint.json`
- C: Full session management with named checkpoints

**Recommendation**: Start with A (no persistence), add B if users request it

### 2. Client Selection

**Question**: How should users specify which client to use?

**Current Design**:
- `--playback <dir>` → PlaybackTestClient
- `--record <dir>` → InteractiveTestClient (with recording)
- Neither → Normal ClaudeClient

**Alternative**: Explicit client flag?
- `--client playback --recordings-dir <dir>`
- `--client interactive --recordings-dir <dir>`
- `--client api` (default)

**Recommendation**: Keep current design, it's more intuitive

### 3. Agent Responder Distribution

**Question**: How do users run the agent responder for interactive mode?

**Options**:
- A: Separate script (`node scripts/test-agent-responder.js`)
- B: Built-in command (`dygram agent-responder`)
- C: Integrated into `--interactive` mode (auto-start/stop)

**Recommendation**: Start with A (separate script), consider B for better UX

### 4. Recording Format

**Question**: Should CLI use same recording format as tests?

**Answer**: Yes, reuse existing format from PlaybackTestClient/InteractiveTestClient

**Benefits**:
- No code duplication
- Recordings can be used in tests
- Test recordings can be used in CLI
- Consistent signature matching

---

## Success Criteria

### Minimum Viable Product (Phase 1)

1. ✅ User can run `dygram execute app.dygram --interactive`
2. ✅ CLI steps through turns one at a time
3. ✅ User can type `n` for next turn, `c` for continue, `q` for quit
4. ✅ Turn results displayed clearly (tools, output, status)
5. ✅ User can playback from recordings with `--playback`
6. ✅ User can record while executing with `--record`
7. ✅ Documentation explains all features

### Future Enhancements (Phase 2+)

- Manual response injection
- State persistence and resume
- Full REPL with rich commands
- Context variable inspector
- Execution timeline visualization

---

## Timeline Estimate

**Phase 1 (Basic Interactive Mode)**:
- Implementation: 2-3 days
- Testing: 1 day
- Documentation: 1 day
- **Total**: 4-5 days

**Phase 2 (Enhanced Display)**:
- Implementation: 1-2 days
- Testing: 0.5 days
- Documentation: 0.5 days
- **Total**: 2-3 days

**Phase 3 (Manual Response)**:
- Implementation: 2-3 days
- Testing: 1 day
- Documentation: 1 day
- **Total**: 4-5 days

**Phase 4 (Full REPL)**:
- Implementation: 3-4 days
- Testing: 1-2 days
- Documentation: 1-2 days
- **Total**: 5-8 days

---

## References

### Implementation Files

- `src/language/execution/turn-executor.ts` - Turn execution logic
- `src/language/executor.ts` - MachineExecutor with turn methods
- `src/language/execution/turn-types.ts` - Type definitions
- `src/language/playback-test-client.ts` - Playback client
- `src/language/interactive-test-client.ts` - Interactive client
- `src/cli/main.ts` - CLI commands
- `test/validating/task-execution.test.ts` - Example usage

### Documentation

- `docs/development/turn-level-execution-implementation.md` - Turn execution design
- `docs/testing/recording-playback.md` - Recording/playback system

### Related PRs

- PR #423 - Intra-step pause implementation
- Commit `ff470eb` - Turn-level execution merge
- Commit `4d4d14f` - Runtime values for context nodes

---

## Conclusion

Intra-step (turn-level) execution is **fully implemented** in the executor and browser UI, but **not exposed** in the CLI. The proposed approach is:

1. **Phase 1**: Add `--interactive` flag to `execute` command with basic turn-level stepping
2. **Phase 2**: Enhance display and add manual response injection
3. **Phase 3**: Full REPL if needed

All required infrastructure exists:
- ✅ `MachineExecutor.stepTurn()` API
- ✅ Turn state tracking
- ✅ PlaybackTestClient for deterministic execution
- ✅ InteractiveTestClient for live agent responses

Implementation is straightforward and builds on existing solid foundations.

**Next Steps**:
1. Get approval on Design Option A (--interactive flag)
2. Implement basic interactive loop
3. Add playback/record support
4. Test and document

**Questions**: See "Open Questions" section above
