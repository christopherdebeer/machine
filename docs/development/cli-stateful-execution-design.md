# CLI Stateful Execution Design

## Problem Statement

After testing REPL interaction with agents, we discovered that **continuous REPL sessions are problematic for agents** because:
- Agents struggle with long-running interactive processes
- Hard to handle stdin/stdout in continuous loops
- Difficult to manage state across conversation turns
- Process management complexity (signals, cleanup, etc.)

## Solution: Stateless Calls with Persistent State

Instead of a continuous REPL, use **isolated CLI calls** that read/write **persistent execution state**:

```bash
# Each call is separate process
dygram execute --interactive ./myMachine.dy   # → execute turn, save state, exit
dygram execute --interactive ./myMachine.dy   # → load state, execute turn, save state, exit
dygram execute --interactive ./myMachine.dy   # → load state, execute turn, save state, exit
```

**Benefits for Agents**:
- ✅ Simple stateless CLI calls (agents excel at this)
- ✅ No continuous process management
- ✅ Each call has clear input/output
- ✅ Easy to script and automate
- ✅ State persistence handles resumption
- ✅ Can inject input via stdin

---

## Architecture

### State File Structure

Execution state stored in `.dygram/executions/<execution-id>/`:

```
.dygram/
  executions/
    last -> exec-20251201-143022/  # symlink to most recent
    exec-20251201-143022/
      state.json                   # Execution state
      machine.json                 # Machine definition snapshot
      metadata.json                # Execution metadata
      history.jsonl                # Turn-by-turn history
    exec-20251201-150311/
      state.json
      ...
```

### State File Format

#### `state.json` - Execution State
```typescript
interface ExecutionStateFile {
    version: string;                      // State format version
    machineHash: string;                  // Hash of machine definition
    executionState: {                     // From executor.getExecutionState()
        currentNode: string;
        pathId: string;
        visitedNodes: string[];
        attributes: Record<string, any>;
        contextValues: Record<string, any>;
        turnState?: TurnState;            // If in mid-turn
    };
    status: 'in_progress' | 'complete' | 'error' | 'paused';
    lastUpdated: string;                  // ISO timestamp
}
```

#### `metadata.json` - Execution Metadata
```typescript
interface ExecutionMetadata {
    id: string;                           // Execution ID
    machineFile: string;                  // Original machine file path
    startedAt: string;                    // ISO timestamp
    lastExecutedAt: string;               // ISO timestamp
    turnCount: number;                    // Total turns executed
    stepCount: number;                    // Total steps executed
    mode: 'interactive' | 'playback' | 'auto';
    clientConfig?: {                      // Client configuration
        type: 'playback' | 'interactive' | 'api';
        recordingsDir?: string;
        playbackDir?: string;
    };
}
```

#### `history.jsonl` - Turn History (JSONL format)
```jsonl
{"turn":1,"timestamp":"2025-12-01T14:30:22Z","node":"start","tools":[],"output":"Starting..."}
{"turn":2,"timestamp":"2025-12-01T14:30:25Z","node":"agent","tools":["read_file"],"output":"Read config"}
{"turn":3,"timestamp":"2025-12-01T14:30:28Z","node":"agent","tools":["write_file"],"output":"Wrote output"}
```

---

## CLI Interface

### Basic Usage

```bash
# Start new execution (auto-generates ID)
$ dygram execute --interactive ./myMachine.dy
⚡ Starting interactive execution: exec-20251201-143022
📍 Turn 1 - Node: start (task)
✓ Turn completed
  Output: Initialized system
💾 State saved to: .dygram/executions/exec-20251201-143022/

# Continue execution (auto-resumes last)
$ dygram execute --interactive ./myMachine.dy
⚡ Resuming execution: exec-20251201-143022
📍 Turn 2 - Node: agent (task)
✓ Turn completed
  Tools: read_file (config.json)
  Output: Configuration loaded
💾 State saved

# Continue until complete
$ dygram execute --interactive ./myMachine.dy
⚡ Resuming execution: exec-20251201-143022
📍 Turn 3 - Node: agent (task)
✓ Turn completed
  Tools: analyze, write_file
  Output: Analysis complete
💾 State saved

$ dygram execute --interactive ./myMachine.dy
⚡ Resuming execution: exec-20251201-143022
✅ Execution complete!
📊 Final Results:
  Total turns: 3
  Total steps: 5
  Status: complete
```

### Managing Multiple Executions

```bash
# Explicit execution ID
$ dygram execute --interactive ./myMachine.dy --id my-session
⚡ Starting interactive execution: my-session

# Resume specific execution
$ dygram execute --interactive ./myMachine.dy --id my-session
⚡ Resuming execution: my-session

# List active executions
$ dygram exec list
Active executions:
  exec-20251201-143022  myMachine.dy  turn 3/5   in_progress  2 min ago
  my-session            myMachine.dy  turn 1/5   paused       5 min ago
  demo-recording        demo.dy       complete   1 hour ago

# Show execution status
$ dygram exec status my-session
Execution: my-session
  Machine: ./myMachine.dy
  Status: paused
  Turn: 1/5
  Current Node: agent
  Started: 2025-12-01 14:25:00
  Last Updated: 2025-12-01 14:30:00

# Clean up old executions
$ dygram exec clean
Cleaned 3 completed executions

# Remove specific execution
$ dygram exec rm my-session
Removed execution: my-session
```

### Input via stdin

```bash
# Provide response via stdin (for manual mode - future)
$ echo '{"action": "continue"}' | dygram e -i ./myMachine.dy

# Pipe from file
$ cat response.json | dygram e -i ./myMachine.dy

# Multi-line input
$ dygram e -i ./myMachine.dy <<EOF
{
  "response": "I will analyze the data",
  "tools": [
    {"name": "read_file", "params": {"path": "data.json"}}
  ]
}
EOF
```

### Playback Mode

```bash
# Start execution with playback
$ dygram e -i ./myMachine.dy --playback recordings/demo/
⚡ Starting interactive execution: exec-20251201-143022
   Mode: playback (recordings/demo/)
📍 Turn 1 - Node: start
✓ Turn completed (playback)

# Playback state persists
$ dygram e -i ./myMachine.dy  # continues in playback mode
⚡ Resuming execution: exec-20251201-143022 (playback mode)
```

### Recording Mode

```bash
# Start execution with recording
$ dygram e -i ./myMachine.dy --record recordings/new-session/
⚡ Starting interactive execution: exec-20251201-143022
   Mode: interactive (recording to recordings/new-session/)

# Recording state persists
$ dygram e -i ./myMachine.dy  # continues recording
⚡ Resuming execution: exec-20251201-143022 (recording mode)
```

---

## Implementation

### Core Functions

#### `loadOrCreateExecution()`

```typescript
interface LoadExecutionOptions {
    machineFile: string;
    executionId?: string;        // Explicit ID, or undefined for "last"
    playback?: string;           // Playback directory
    record?: string;             // Recording directory
    force?: boolean;             // Force new execution even if state exists
}

async function loadOrCreateExecution(
    opts: LoadExecutionOptions
): Promise<{ executor: MachineExecutor; metadata: ExecutionMetadata; isNew: boolean }> {
    const stateDir = '.dygram/executions';

    // Resolve execution ID
    let executionId = opts.executionId;
    let isNew = false;

    if (!executionId && !opts.force) {
        // Try to use "last" execution
        const lastLink = path.join(stateDir, 'last');
        if (fs.existsSync(lastLink)) {
            executionId = path.basename(fs.readlinkSync(lastLink));
            logger.info(chalk.blue(`⚡ Resuming execution: ${executionId}`));
        }
    }

    if (!executionId || opts.force) {
        // Create new execution
        executionId = opts.executionId || generateExecutionId();
        isNew = true;
        logger.info(chalk.blue(`⚡ Starting interactive execution: ${executionId}`));
    }

    const execDir = path.join(stateDir, executionId);
    const stateFile = path.join(execDir, 'state.json');
    const metadataFile = path.join(execDir, 'metadata.json');

    // Load or create machine
    const machineData = await loadMachine(opts.machineFile);
    const machineHash = hashMachine(machineData);

    let executor: MachineExecutor;
    let metadata: ExecutionMetadata;

    if (isNew || !fs.existsSync(stateFile)) {
        // Create new execution
        await fs.mkdir(execDir, { recursive: true });

        // Configure client
        const clientConfig = configureClient(opts);

        // Create executor
        executor = await MachineExecutor.create(machineData, clientConfig);

        // Create metadata
        metadata = {
            id: executionId,
            machineFile: opts.machineFile,
            startedAt: new Date().toISOString(),
            lastExecutedAt: new Date().toISOString(),
            turnCount: 0,
            stepCount: 0,
            mode: opts.playback ? 'playback' : 'interactive',
            clientConfig: {
                type: opts.playback ? 'playback' : opts.record ? 'interactive' : 'api',
                playbackDir: opts.playback,
                recordingsDir: opts.record
            }
        };

        await saveMetadata(metadataFile, metadata);
        await saveMachineSnapshot(execDir, machineData);

        // Update "last" symlink
        await updateLastSymlink(stateDir, executionId);

    } else {
        // Resume existing execution
        const state: ExecutionStateFile = JSON.parse(
            await fs.readFile(stateFile, 'utf-8')
        );

        metadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));

        // Verify machine hasn't changed
        if (state.machineHash !== machineHash) {
            throw new Error(
                `Machine definition has changed since execution started.\n` +
                `Use --force to start a new execution.`
            );
        }

        // Show mode info
        if (metadata.mode === 'playback') {
            logger.info(chalk.gray(`   Mode: playback (${metadata.clientConfig?.playbackDir})`));
        } else if (metadata.clientConfig?.recordingsDir) {
            logger.info(chalk.gray(`   Mode: interactive (recording to ${metadata.clientConfig.recordingsDir})`));
        }

        // Recreate client with same config
        const clientConfig = configureClient({
            ...opts,
            playback: metadata.clientConfig?.playbackDir,
            record: metadata.clientConfig?.recordingsDir
        });

        // Recreate executor
        executor = await MachineExecutor.create(machineData, clientConfig);

        // Restore execution state
        await restoreExecutionState(executor, state.executionState);
    }

    return { executor, metadata, isNew };
}
```

#### `saveExecutionState()`

```typescript
async function saveExecutionState(
    execDir: string,
    executor: MachineExecutor,
    metadata: ExecutionMetadata
): Promise<void> {
    const stateFile = path.join(execDir, 'state.json');
    const metadataFile = path.join(execDir, 'metadata.json');
    const historyFile = path.join(execDir, 'history.jsonl');

    // Get current state from executor
    const executionState = executor.getExecutionState();
    const machineData = executor.getMachineData();

    // Create state file
    const state: ExecutionStateFile = {
        version: '1.0',
        machineHash: hashMachine(machineData),
        executionState: {
            currentNode: executionState.currentNode,
            pathId: executionState.pathId,
            visitedNodes: Array.from(executionState.visitedNodes || []),
            attributes: Object.fromEntries(executionState.attributes || []),
            contextValues: executionState.contextValues || {},
            turnState: executionState.turnState
        },
        status: executor.getStatus(),
        lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));

    // Update metadata
    metadata.lastExecutedAt = new Date().toISOString();
    if (executor.isInTurn()) {
        metadata.turnCount = executor.getTurnState()?.turnCount || metadata.turnCount;
    }

    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));

    logger.success(chalk.gray('💾 State saved'));
}
```

#### `executeInteractiveTurn()`

```typescript
async function executeInteractiveTurn(
    machineFile: string,
    opts: {
        id?: string;
        playback?: string;
        record?: string;
        force?: boolean;
        verbose?: boolean;
        input?: any;  // From stdin
    }
): Promise<void> {
    // Load or create execution
    const { executor, metadata, isNew } = await loadOrCreateExecution({
        machineFile,
        executionId: opts.id,
        playback: opts.playback,
        record: opts.record,
        force: opts.force
    });

    const execDir = path.join('.dygram/executions', metadata.id);

    // Check if already complete
    if (executor.getStatus() === 'complete') {
        logger.success(chalk.green('✅ Execution already complete!'));
        displayFinalResults(executor, metadata);
        return;
    }

    // Handle stdin input (for manual mode - future)
    if (opts.input) {
        // TODO: Apply input to executor
        logger.debug('Received input:', opts.input);
    }

    // Execute next turn
    try {
        let result: any;

        if (executor.isInTurn()) {
            // Continue turn
            const turnState = executor.getTurnState();
            logger.info(chalk.cyan(`📍 Turn ${turnState.turnCount} - Node: ${turnState.nodeName}`));
            result = await executor.stepTurn();
        } else {
            // Start new turn (step to next node if needed)
            const currentNode = executor.getCurrentNode();
            logger.info(chalk.cyan(`📍 Current Node: ${currentNode}`));
            result = await executor.stepTurn();
        }

        // Display turn result
        displayTurnResult(result);

        // Append to history
        await appendHistory(execDir, result);

        // Save state
        await saveExecutionState(execDir, executor, metadata);

        // Check if complete
        if (executor.getStatus() === 'complete') {
            logger.success(chalk.green('\n✅ Execution complete!'));
            displayFinalResults(executor, metadata);
        }

    } catch (error) {
        logger.error(chalk.red(`\n❌ Error: ${error.message}`));

        // Save error state
        await saveExecutionState(execDir, executor, metadata);

        throw error;
    }
}
```

### Helper Functions

```typescript
function generateExecutionId(): string {
    const timestamp = new Date().toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, '')
        .replace('T', '-');
    return `exec-${timestamp}`;
}

function hashMachine(machineData: MachineJSON): string {
    const crypto = require('crypto');
    const json = JSON.stringify(machineData, Object.keys(machineData).sort());
    return crypto.createHash('sha256').update(json).digest('hex');
}

async function updateLastSymlink(stateDir: string, executionId: string): Promise<void> {
    const lastLink = path.join(stateDir, 'last');
    if (fs.existsSync(lastLink)) {
        fs.unlinkSync(lastLink);
    }
    fs.symlinkSync(executionId, lastLink);
}

function configureClient(opts: LoadExecutionOptions): any {
    if (opts.playback) {
        return {
            llm: new PlaybackTestClient({
                recordingsDir: opts.playback,
                simulateDelay: true,
                delay: 100,
                strict: true,
                matchingMode: 'hybrid'
            })
        };
    }

    if (opts.record) {
        return {
            llm: new InteractiveTestClient({
                mode: 'file-queue',
                queueDir: '.dygram-interactive-queue',
                recordResponses: true,
                recordingsDir: opts.record,
                timeout: 60000
            })
        };
    }

    // Default: use API client
    return {
        llm: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY,
            modelId: process.env.ANTHROPIC_MODEL_ID || 'claude-3-5-haiku-20241022'
        }
    };
}

async function appendHistory(execDir: string, result: TurnStepResult): Promise<void> {
    const historyFile = path.join(execDir, 'history.jsonl');
    const entry = {
        turn: result.turnCount,
        timestamp: new Date().toISOString(),
        node: result.nodeName || 'unknown',
        tools: result.toolExecutions.map(t => t.toolName),
        output: result.text?.slice(0, 100)
    };

    await fs.appendFile(historyFile, JSON.stringify(entry) + '\n');
}

function displayTurnResult(result: TurnStepResult): void {
    logger.success(chalk.green('✓ Turn completed'));

    if (result.toolExecutions.length > 0) {
        logger.info(chalk.blue('  Tools:'), result.toolExecutions.map(t => t.toolName).join(', '));
    }

    if (result.text) {
        const preview = result.text.slice(0, 100);
        logger.info(chalk.blue('  Output:'), preview + (result.text.length > 100 ? '...' : ''));
    }
}

function displayFinalResults(executor: MachineExecutor, metadata: ExecutionMetadata): void {
    const result = executor.getExecutionResult();

    logger.heading(chalk.bold('\n📊 Final Results:'));
    logger.info(`  Total turns: ${metadata.turnCount}`);
    logger.info(`  Total steps: ${result.history.length}`);
    logger.info(`  Status: ${result.status}`);
    logger.info(`  Duration: ${calculateDuration(metadata.startedAt, metadata.lastExecutedAt)}`);
}
```

---

## CLI Commands

### New Subcommands

Add `exec` subcommand with multiple actions:

```typescript
program
    .command('exec')
    .description('manage interactive executions')
    .addCommand(
        new Command('list')
            .aliases(['ls'])
            .description('list active executions')
            .action(listExecutions)
    )
    .addCommand(
        new Command('status')
            .argument('<id>', 'execution ID')
            .description('show execution status')
            .action(showExecutionStatus)
    )
    .addCommand(
        new Command('clean')
            .option('--all', 'clean all executions including incomplete')
            .description('clean up completed executions')
            .action(cleanExecutions)
    )
    .addCommand(
        new Command('rm')
            .argument('<id>', 'execution ID')
            .description('remove execution')
            .action(removeExecution)
    );
```

### Update Execute Command

```typescript
program
    .command('execute')
    .aliases(['exec', 'e'])
    .argument('<file>', `source file (${fileExtensions})`)
    .option('-i, --interactive', 'interactive turn-by-turn execution')
    .option('--id <id>', 'execution ID (for managing multiple executions)')
    .option('--force', 'force new execution (ignore existing state)')
    .option('--playback <dir>', 'playback from recordings directory')
    .option('--record <dir>', 'record execution to directory')
    .option('-d, --destination <dir>', 'destination directory for execution results')
    .option('-m, --model <model>', 'model ID to use')
    .option('-v, --verbose', 'verbose output')
    .option('-q, --quiet', 'quiet output (errors only)')
    .description('executes a machine program')
    .action(async (fileName, opts) => {
        if (opts.interactive) {
            // Read stdin if provided
            let input;
            if (!process.stdin.isTTY) {
                const stdin = await readStdin();
                if (stdin) {
                    input = JSON.parse(stdin);
                }
            }

            await executeInteractiveTurn(fileName, {
                id: opts.id,
                playback: opts.playback,
                record: opts.record,
                force: opts.force,
                verbose: opts.verbose,
                input
            });
        } else {
            // Original full execution
            await executeAction(fileName, opts);
        }
    });
```

---

## Usage Examples

### Agent Usage Pattern

Agents can easily script turn-by-turn execution:

```bash
# Agent script
#!/bin/bash

# Start execution
dygram execute --interactive ./myMachine.dy

# Continue execution (multiple times)
for i in {1..5}; do
    dygram execute --interactive ./myMachine.dy

    # Check exit code
    if [ $? -ne 0 ]; then
        echo "Execution failed or complete"
        break
    fi
done

# Check final status
dygram exec status
```

### Human-in-Loop

Human can intervene in agent execution:

```bash
# Agent starts execution
dygram execute --interactive ./myMachine.dy --record recordings/session1/

# Agent continues...
dygram execute --interactive ./myMachine.dy

# Human checks status
dygram exec status

# Human provides input (future - manual mode)
echo '{"response": "use different approach"}' | dygram e -i ./myMachine.dy

# Agent continues
dygram execute --interactive ./myMachine.dy
```

### Testing with Playback

```bash
# Record golden execution
dygram e -i ./myMachine.dy --record recordings/golden/ --id golden-test

# Continue until complete
while dygram e -i ./myMachine.dy --id golden-test; do :; done

# Later: playback for testing
dygram e -i ./myMachine.dy --playback recordings/golden/ --id test-run
while dygram e -i ./myMachine.dy --id test-run; do :; done

# Compare results
dygram exec status golden-test
dygram exec status test-run
```

---

## State Directory Structure

```
.dygram/
  executions/
    last -> exec-20251201-143022/           # Symlink to most recent

    exec-20251201-143022/
      state.json                            # Current execution state
      metadata.json                         # Execution metadata
      machine.json                          # Machine definition snapshot
      history.jsonl                         # Turn-by-turn history

    my-session/
      state.json
      metadata.json
      machine.json
      history.jsonl

    golden-test/
      state.json
      metadata.json
      machine.json
      history.jsonl

  interactive-queue/                        # For InteractiveTestClient
    requests/
    responses/
    heartbeat.lock
```

---

## Error Handling

### Machine Changed

```bash
$ dygram e -i ./myMachine.dy
❌ Error: Machine definition has changed since execution started.
   Original hash: a3f5d8...
   Current hash:  b2e4c9...

   Options:
   - Use --force to start a new execution
   - Restore original machine definition
   - Use --id to start a parallel execution
```

### Missing Dependencies

```bash
$ dygram e -i ./myMachine.dy --playback recordings/demo/
❌ Error: Playback directory not found: recordings/demo/

   Available recordings:
   - recordings/golden/
   - recordings/test-session/
```

### State Corruption

```bash
$ dygram e -i ./myMachine.dy
⚠️  Warning: State file corrupted, starting fresh execution
⚡ Starting interactive execution: exec-20251201-150000
```

---

## Implementation Checklist

### Phase 1: Basic Stateful Execution

- [ ] Create `.dygram/executions/` directory structure
- [ ] Implement `generateExecutionId()`
- [ ] Implement `loadOrCreateExecution()`
- [ ] Implement `saveExecutionState()`
- [ ] Implement `restoreExecutionState()` (may need executor method)
- [ ] Implement `executeInteractiveTurn()`
- [ ] Add `--interactive` flag to execute command
- [ ] Add `--id` flag for execution ID
- [ ] Add `--force` flag for new execution
- [ ] Handle "last" execution auto-resume
- [ ] Update last symlink management
- [ ] Machine hash validation
- [ ] State version handling

### Phase 2: Execution Management

- [ ] Implement `exec list` command
- [ ] Implement `exec status` command
- [ ] Implement `exec clean` command
- [ ] Implement `exec rm` command
- [ ] History JSONL appending
- [ ] Display helpers (turn result, final results)

### Phase 3: Client Integration

- [ ] Integrate PlaybackTestClient with `--playback`
- [ ] Integrate InteractiveTestClient with `--record`
- [ ] Client config persistence in metadata
- [ ] Client recreation on resume

### Phase 4: stdin Input (Future)

- [ ] Read stdin when not TTY
- [ ] Parse JSON input
- [ ] Apply input to executor (manual mode)
- [ ] Input validation

### Phase 5: Testing & Documentation

- [ ] Unit tests for state persistence
- [ ] Integration tests for resume
- [ ] Test playback mode state
- [ ] Test recording mode state
- [ ] Update CLI help text
- [ ] Create user documentation
- [ ] Add examples

---

## Timeline Estimate

**Phase 1** (Basic Stateful Execution): 3-4 days
**Phase 2** (Execution Management): 1-2 days
**Phase 3** (Client Integration): 1-2 days
**Phase 4** (stdin Input): 1-2 days
**Phase 5** (Testing & Docs): 2-3 days

**Total**: 8-13 days

---

## Open Questions

### 1. Execution State Restoration

**Question**: Does `MachineExecutor` support restoring from serialized state?

**Current**: `executor.getExecutionState()` returns state, but no `executor.restoreExecutionState(state)` method.

**Options**:
- A: Add `restoreExecutionState()` method to MachineExecutor
- B: Recreate executor and manually restore state fields
- C: Store entire executor serialization (complex)

**Recommendation**: Option A - add clean restoration API

### 2. stdin Format

**Question**: What format should stdin use for manual input?

**Options**:
- A: JSON with `{response, tools}` structure
- B: Plain text (parsed as response)
- C: Custom DSL for responses

**Recommendation**: Start with A (JSON), add B later for simplicity

### 3. Concurrent Executions

**Question**: Should we limit concurrent executions per machine?

**Answer**: No limit, but warn if multiple executions active for same machine

### 4. State Cleanup

**Question**: When should we auto-clean old executions?

**Options**:
- A: Never auto-clean (manual only)
- B: Clean completed executions older than N days
- C: Keep last N executions only

**Recommendation**: Option A (manual only), add B as optional feature

---

## Success Criteria

### Minimum Viable Product

1. ✅ `dygram e -i ./machine.dy` starts or resumes execution
2. ✅ State persists across calls
3. ✅ Auto-resumes last execution
4. ✅ `--id` flag manages multiple executions
5. ✅ `--playback` and `--record` work with state persistence
6. ✅ `exec list/status/clean/rm` commands work
7. ✅ Machine hash validation prevents corruption
8. ✅ Clean error messages for all failure modes

### Agent-Friendly Criteria

1. ✅ Each call is isolated process
2. ✅ Clear exit codes (0 = success, 1 = error, 2 = complete)
3. ✅ Predictable output format (parseable)
4. ✅ No continuous input required
5. ✅ State automatically managed
6. ✅ Easy to script in bash/python

---

## Conclusion

This stateful isolated-call design is **much better for agents** than a continuous REPL:

**Agent Benefits**:
- Simple stateless CLI calls
- No process management
- Easy to script and automate
- Clear input/output per call
- State persistence handles complexity

**Implementation**:
- Straightforward state serialization
- Reuses existing executor API
- Leverages existing client infrastructure
- Clean separation of concerns

**Next Steps**:
1. Confirm approach with stakeholders
2. Design `restoreExecutionState()` API for MachineExecutor
3. Implement Phase 1 (basic stateful execution)
4. Test with agent workflows
