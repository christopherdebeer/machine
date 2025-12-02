# Interactive Mode

Execute machines turn-by-turn with persistent state across CLI calls.

## Overview

Interactive mode allows you to execute machines one turn at a time, with automatic state persistence between CLI calls. This is perfect for:

- **Agent workflows** - Simple stateless CLI calls, easy to script
- **Manual debugging** - Step through execution turn-by-turn
- **Recorded sessions** - Record and replay executions
- **Testing** - Validate machine behavior with playback mode

## Quick Start

### Basic Usage

Start a new interactive execution:

```bash
dygram execute --interactive myMachine.dygram
```

Continue execution (automatically resumes last execution):

```bash
dygram execute --interactive myMachine.dygram
```

Repeat until complete:

```bash
# Keep running until execution finishes
while dygram execute --interactive myMachine.dy; do :; done
```

## How It Works

Each CLI call is **isolated and stateless**:
1. Reads persisted state from disk
2. Executes one turn
3. Saves updated state back to disk
4. Exits

State is stored in `.dygram/executions/` with:
- Execution state (current node, visited nodes, attributes, context)
- Machine snapshot (ensures machine hasn't changed)
- Metadata (started, last executed, turn count, mode)
- History log (turn-by-turn record)

### State Directory Structure

```
.dygram/
  executions/
    last -> exec-20251201-143022/     # Symlink to most recent
    exec-20251201-143022/
      state.json                      # Current execution state
      metadata.json                   # Execution metadata
      machine.json                    # Machine definition snapshot
      history.jsonl                   # Turn-by-turn history
```

## Managing Multiple Executions

### Explicit Execution ID

Start with specific ID:

```bash
dygram execute --interactive myMachine.dy --id my-session
```

Resume specific execution:

```bash
dygram execute --interactive myMachine.dy --id my-session
```

### Force New Execution

Start fresh even if state exists:

```bash
dygram execute --interactive myMachine.dy --force
```

### List Executions

View all active executions:

```bash
dygram exec list
```

Output:
```
Active executions:
  exec-20251201-143022  myMachine.dy  turn 3/5   in_progress  2 min ago
  my-session            myMachine.dy  turn 1/5   paused       5 min ago
  demo-recording        demo.dy       complete   1 hour ago
```

### Check Status

View execution details:

```bash
dygram exec status my-session
```

Output:
```
Execution: my-session
  Machine: ./myMachine.dy
  Status: paused
  Turn: 1/5
  Current Node: agent
  Started: 2025-12-01 14:25:00
  Last Updated: 2025-12-01 14:30:00
```

### Cleanup

Remove specific execution:

```bash
dygram exec rm my-session
```

Clean completed executions:

```bash
dygram exec clean
```

## Recording & Playback

### Recording Mode

Record execution for later playback:

```bash
# Start recording
dygram execute --interactive myMachine.dy --record recordings/golden/

# Continue recording (mode persists)
dygram execute --interactive myMachine.dygram

# Recording continues until execution complete
```

### Playback Mode

Replay a recorded execution:

```bash
# Start playback
dygram execute --interactive myMachine.dy --playback recordings/golden/

# Continue playback (mode persists)
dygram execute --interactive myMachine.dygram
```

Playback is **deterministic** - uses pre-recorded LLM responses, no API calls.

## Input from stdin

### Machine Source from stdin

Provide machine definition via stdin when no file argument given:

```bash
# Pipe machine source
cat myMachine.dy | dygram execute --interactive

# Inline machine
echo 'machine "Test" { state Start; state End; Start --> End }' | dygram execute --interactive

# Chain commands
dygram generate template.dy | dygram execute --interactive
```

### Response Input via stdin

Provide LLM response via stdin (for manual control):

```bash
# Single-line JSON
echo '{"action": "continue"}' | dygram execute --interactive myMachine.dygram

# Multi-line input
dygram execute --interactive myMachine.dy <<EOF
{
  "response": "Analyze the data",
  "tools": [{"name": "read_file", "params": {"path": "data.json"}}]
}
EOF
```

## Agent Usage Pattern

Perfect for agent automation:

```bash
#!/bin/bash

# Start execution
dygram execute --interactive ./workflow.dygram

# Continue execution in loop
for i in {1..10}; do
    dygram execute --interactive ./workflow.dygram

    # Check exit code
    if [ $? -ne 0 ]; then
        echo "Execution failed or complete"
        break
    fi
done

# Check final status
dygram exec status
```

## Human-in-Loop

Combine agent execution with human intervention:

```bash
# Agent starts
dygram execute --interactive ./process.dy --record recordings/session1/

# Agent continues...
dygram execute --interactive ./process.dygram

# Human checks progress
dygram exec status

# Human provides input (future feature)
echo '{"response": "use different approach"}' | dygram execute --interactive ./process.dygram

# Agent continues
dygram execute --interactive ./process.dygram
```

## Error Handling

### Machine Changed

If the machine definition changes after execution started:

```bash
$ dygram execute --interactive myMachine.dygram
❌ Error: Machine definition has changed since execution started.
   Original hash: a3f5d8...
   Current hash:  b2e4c9...

   Options:
   - Use --force to start a new execution
   - Restore original machine definition
   - Use --id to start a parallel execution
```

### Missing Recordings

If playback directory doesn't exist:

```bash
$ dygram execute --interactive myMachine.dy --playback recordings/missing/
❌ Error: Playback directory not found: recordings/missing/

   Available recordings:
   - recordings/golden/
   - recordings/test-session/
```

## Exit Codes

- `0` - Turn executed successfully (execution may continue)
- `1` - Error occurred
- (Future) `2` - Execution complete

## Command Reference

### Execute Command

```bash
dygram execute [file] [options]
```

**Aliases:** `exec`, `e`

**Arguments:**
- `[file]` - Source file or stdin if omitted

**Options:**
- `-i, --interactive` - Interactive turn-by-turn execution
- `--id <id>` - Execution ID (default: auto-resume last)
- `--force` - Force new execution
- `--playback <dir>` - Playback from recordings
- `--record <dir>` - Record execution
- `-d, --destination <dir>` - Results directory
- `-m, --model <model>` - LLM model ID
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output

### Exec Management Commands

**List executions:**
```bash
dygram exec list
dygram exec ls        # alias
```

**Show status:**
```bash
dygram exec status <id>
```

**Remove execution:**
```bash
dygram exec rm <id>
```

**Clean up:**
```bash
dygram exec clean              # Clean completed executions
dygram exec clean --all        # Clean all executions
```

## Examples

### Basic Workflow

```bash
# Start execution
dygram e -i workflow.dygram

# Continue manually
dygram e -i workflow.dygram
dygram e -i workflow.dygram

# Check progress
dygram exec status
```

### Record Golden Test

```bash
# Record golden execution
dygram e -i workflow.dy --record recordings/golden/ --id golden-test

# Continue until complete
while dygram e -i workflow.dy --id golden-test; do :; done

# Later: replay for testing
dygram e -i workflow.dy --playback recordings/golden/ --id test-run
while dygram e -i workflow.dy --id test-run; do :; done
```

### Batch Process with Agent

```bash
#!/bin/bash
for machine in workflows/*.dy; do
    echo "Processing $machine..."

    # Start with unique ID
    id=$(basename "$machine" .dy)
    dygram e -i "$machine" --id "$id"

    # Continue until complete
    while dygram e -i "$machine" --id "$id" 2>&1 | grep -q "Turn completed"; do
        echo "  Turn completed"
    done

    echo "✓ $machine complete"
done
```

## Tips & Best Practices

### For Agents

- **Use loops** - Wrap in `while` or `for` to continue execution
- **Check exit codes** - Detect completion or errors
- **Use explicit IDs** - Manage multiple parallel executions
- **Record sessions** - Create playback for testing
- **Script workflows** - Easy to automate with bash/python

### For Testing

- **Record golden runs** - Use `--record` to capture expected behavior
- **Playback in CI** - Use `--playback` for deterministic tests
- **Version recordings** - Commit to git for reproducibility
- **Update when needed** - Re-record when behavior intentionally changes

### For Debugging

- **Use verbose mode** - Add `-v` to see detailed execution
- **Check history** - Review `.dygram/executions/*/history.jsonl`
- **Step through** - Execute turn-by-turn manually
- **Compare states** - Diff `state.json` files across turns

## Next Steps

- **[CLI Reference](./README.md)** - Full CLI documentation
- **[Syntax Reference](../syntax/README.md)** - Learn machine syntax
- **[Examples](../examples/README.md)** - See practical patterns

## Implementation Details

For technical implementation details and design rationale, see:
- `docs/development/cli-stateful-execution-design.md` - Complete design
- `docs/development/cli-interactive-execution-implementation.md` - Implementation notes
- `src/cli/interactive-execution.ts` - Source code
- `src/cli/execution-state.ts` - State management
