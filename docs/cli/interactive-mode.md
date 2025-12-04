# Interactive Execution & Debugging

Execute and debug machines with persistent state, step-by-step control, and runtime visualization.

## Overview

The CLI provides multiple execution modes for different use cases:

- **Interactive Mode** (`--interactive`) - Runs until LLM response needed, pauses for human input
- **Step Debugging** (`--step`, `--step-turn`, `--step-path`) - Fine-grained control for debugging
- **State Inspection** (`dy exec show`) - View runtime state without advancing
- **Runtime Visualization** (`--format`, `--verbose`) - Rich output formats for analysis

Perfect for:
- **Agent workflows** - Automated execution with LLM integration
- **Debugging** - Step through execution with detailed state inspection
- **Multi-path analysis** - Debug parallel execution and barriers
- **Testing** - Record and replay with deterministic playback

## Quick Start

### Interactive Execution

Run continuously until LLM response needed:

```bash
# Start execution - runs until LLM invocation
dy execute --interactive machine.dy

# Provide response via stdin, continue
echo '{"action": "continue"}' | dy execute --interactive machine.dy
```

### Step-by-Step Debugging

```bash
# Step through all paths together
dy execute --step machine.dy

# Step through one turn at a time
dy execute --step-turn machine.dy

# Step through one path at a time (for multi-path debugging)
dy execute --step-path machine.dy
```

### View State Without Advancing

```bash
# Get last execution ID
dy exec list

# View current state
dy exec show exec-20251203-143022
dy exec show exec-20251203-143022 --verbose
dy exec show exec-20251203-143022 --format json
```

## Execution Modes

### Interactive Mode (`--interactive`)

Runs continuously, pausing **only** when LLM response is needed.

**Use cases:**
- Agent workflows with LLM interactions
- Human-in-the-loop execution
- Long-running processes

**Example:**
```bash
# Runs until LLM invocation, then pauses
dy execute --interactive workflow.dy

# LLM request displayed, waiting for stdin response
# Provide response:
echo '{"analysis": "data shows trend"}' | dy execute --interactive workflow.dy
```

### Step Mode (`--step`)

Executes one step at a time, **advancing all active paths together**.

**Use cases:**
- Basic debugging
- Understanding execution flow
- Verifying state changes

**Example:**
```bash
# Execute first step (all paths advance)
dy execute --step machine.dy

# Execute next step
dy execute --step machine.dy
```

### Step-Turn Mode (`--step-turn`)

Executes one turn at a time (LLM conversation turns).

**Use cases:**
- Debugging LLM interactions
- Tool execution analysis
- Conversation flow inspection

**Example:**
```bash
# Execute one turn
dy execute --step-turn machine.dy

# Continue turn-by-turn
dy execute --step-turn machine.dy
```

### Step-Path Mode (`--step-path`)

Executes **one path at a time** in round-robin fashion.

**Use cases:**
- **Barrier debugging** - See exactly when paths synchronize
- Multi-path execution analysis
- Race condition detection
- Understanding parallel execution

**Example:**
```bash
# Step path_0
dy execute --step-path machine.dy
# Output: 📍 Step 1 - Path: path_0 - Node: FetchData

# Step path_1
dy execute --step-path machine.dy
# Output: 📍 Step 2 - Path: path_1 - Node: FetchConfig

# Continue round-robin...
dy execute --step-path machine.dy
```

**Barrier Example:**
```bash
# Both paths start at init nodes
dy execute --step-path barrier.dy
# path_0: FetchData → WaitPoint

dy execute --step-path barrier.dy
# path_1: FetchConfig → WaitPoint

# Both now at barrier - next step releases barrier
dy execute --step-path barrier.dy
# path_0: WaitPoint → MergeAndContinue
```

## Runtime Visualization

### Output Formats

Control output format with `--format`:

```bash
# Compact summary (default)
dy execute --step machine.dy
# Output: 📊 at: WaitPoint | paths: 2/2 | 2 transitions | steps: 1

# Full snapshot
dy execute --step machine.dy --verbose

# JSON for tooling
dy execute --step machine.dy --format json

# Graphviz diagram
dy execute --step machine.dy --format dot > snapshot.dot
```

### Compact Summary (Default)

Shows essential state in one line:

```
📊 at: WaitPoint, FetchConfig | paths: 2/2 | 2 transitions | steps: 3
```

Includes:
- Current node(s) for all active paths
- Active/total path count
- Available transitions
- Total steps executed

### Full Snapshot (`--verbose`)

Detailed state with all execution information:

```
═══════════════════════════════════════════════════════════
  RUNTIME EXECUTION SNAPSHOT
═══════════════════════════════════════════════════════════

📍 CURRENT POSITION
───────────────────────────────────────────────────────────
  Path path_0: WaitPoint (State)
  Path path_1: FetchConfig (Unknown)

🔀 AVAILABLE TRANSITIONS
───────────────────────────────────────────────────────────
  ✓ WaitPoint → MergeAndContinue
  ✓ FetchConfig → WaitPoint

🌲 MULTI-PATH EXECUTION
───────────────────────────────────────────────────────────
  Active: 2
  Completed: 0
  Failed: 0
  Waiting: 0

  Path Details:
    path_0: WaitPoint (active)
    path_1: FetchConfig (active)

📊 EXECUTION METADATA
───────────────────────────────────────────────────────────
  Total Steps: 2
  Elapsed Time: 15ms
  Error Count: 0
  Status: Running
  Paused: No
```

### JSON Format

Structured output for programmatic processing:

```bash
dy execute --step machine.dy --format json
```

```json
{
  "currentNodes": [
    {
      "pathId": "path_0",
      "nodeName": "WaitPoint",
      "nodeType": "State"
    }
  ],
  "affordances": {
    "transitions": [...],
    "tools": [...],
    "contexts": [...]
  },
  "paths": {
    "active": 2,
    "completed": 0,
    "details": [...]
  },
  "metadata": {
    "totalSteps": 2,
    "elapsedTime": 15,
    "isComplete": false
  }
}
```

### Graphviz Format

Visual diagram with runtime state overlays:

```bash
dy execute --step machine.dy --format dot > snapshot.dot
dot -Tpng snapshot.dot -o snapshot.png
```

## State Management

### How It Works

Each execution is isolated and stateless:
1. Reads persisted state from `.dygram/executions/<id>/`
2. Executes according to mode (`--interactive`, `--step`, etc.)
3. Saves updated state back to disk
4. Exits

State includes:
- Execution position (current nodes per path)
- Visited nodes and history
- Context attributes
- Turn state (for LLM interactions)
- Metadata (turn count, step count, status)

### State Directory Structure

```
.dygram/
  executions/
    last -> exec-20251203-143022/     # Symlink to most recent
    exec-20251203-143022/
      state.json                      # Current execution state
      metadata.json                   # Execution metadata
      machine.json                    # Machine snapshot
      history.jsonl                   # Turn-by-turn history
```

## State Inspection

### View Current State

Use `dy exec show` to inspect state without advancing:

```bash
# Compact summary
dy exec show exec-20251203-143022
# Output: 📊 at: WaitPoint | paths: 2/2 | 2 transitions | steps: 5

# Full snapshot
dy exec show exec-20251203-143022 --verbose

# JSON export
dy exec show exec-20251203-143022 --format json > state.json

# Graphviz diagram
dy exec show exec-20251203-143022 --format dot > state.dot
```

### List Executions

```bash
dy exec list
```

Output:
```
Active executions:
  exec-20251203-143022  machine.dy  step 5   in_progress  2 min ago
  my-session            workflow.dy turn 3   paused       5 min ago
```

### Check Execution Status

```bash
dy exec status exec-20251203-143022
```

Output:
```
Execution: exec-20251203-143022
  Machine: ./machine.dy
  Status: in_progress
  Mode: interactive
  Turns: 3
  Steps: 5
  Started: 2025-12-03 14:30:22
  Last updated: 2025-12-03 14:35:45
```

## Managing Executions

### Explicit Execution ID

Use custom IDs for multiple parallel executions:

```bash
# Start with specific ID
dy execute --step machine.dy --id debug-session

# Continue with same ID
dy execute --step machine.dy --id debug-session
```

### Force New Execution

Start fresh, ignoring existing state:

```bash
dy execute --step machine.dy --force
```

### Cleanup

```bash
# Remove specific execution
dy exec rm exec-20251203-143022

# Clean completed executions
dy exec clean

# Clean all executions
dy exec clean --all
```

## Recording & Playback

### Recording Mode

Record execution for later playback:

```bash
# Start recording
dy execute --interactive machine.dy --record recordings/golden/

# Continue (mode persists)
dy execute --interactive machine.dy
```

### Playback Mode

Replay recorded execution (deterministic, no API calls):

```bash
# Start playback
dy execute --interactive machine.dy --playback recordings/golden/

# Continue playback
dy execute --interactive machine.dy
```

## Combining Modes

Modes can be combined for powerful debugging:

```bash
# Interactive + step: runs step-by-step, pauses on LLM
dy execute --interactive --step machine.dy

# Interactive + step-path: per-path stepping with LLM pausing
dy execute --interactive --step-path machine.dy

# Step-path + verbose + JSON
dy execute --step-path machine.dy --verbose --format json
```

## Command Reference

### Execute Command

```bash
dy execute [file] [options]
```

**Aliases:** `e`

**Arguments:**
- `[file]` - Source file or stdin if omitted

**Execution Modes:**
- `-i, --interactive` - Pause only when LLM response needed
- `--step` - Execute one step at a time (all paths)
- `--step-turn` - Execute one turn at a time
- `--step-path` - Execute one path at a time (round-robin)

**Visualization:**
- `--format <format>` - Output format: `text` (default), `json`, `svg`, `dot`
- `-v, --verbose` - Full runtime snapshot instead of compact summary

**State Management:**
- `--id <id>` - Execution ID (default: auto-resume last)
- `--force` - Force new execution

**Playback:**
- `--playback <dir>` - Playback from recordings
- `--record <dir>` - Record execution

**Other:**
- `-m, --model <model>` - LLM model ID
- `-q, --quiet` - Quiet output

### Exec Management Commands

**List executions:**
```bash
dy exec list
dy exec ls            # alias
```

**Show status:**
```bash
dy exec status <id>
```

**Show runtime snapshot:**
```bash
dy exec show <id> [options]
  --verbose                # Full snapshot
  --format <format>        # text, json, svg, dot
```

**Remove execution:**
```bash
dy exec rm <id>
```

**Clean up:**
```bash
dy exec clean         # Clean completed only
dy exec clean --all   # Clean all executions
```

## Examples

### Basic Step-Through Debugging

```bash
# Start stepping
dy e --step machine.dy

# Continue stepping
dy e --step machine.dy
dy e --step machine.dy

# Check state
dy exec show $(dy exec list | tail -1 | awk '{print $1}')
```

### Barrier Debugging

```bash
# Debug barrier synchronization with per-path stepping
dy e --step-path barrier.dy --verbose

# Path 0: FetchData → WaitPoint
# (waits at barrier)

dy e --step-path barrier.dy --verbose
# Path 1: FetchConfig → WaitPoint
# (both now at barrier)

dy e --step-path barrier.dy --verbose
# Barrier releases, path 0 continues

dy e --step-path barrier.dy --verbose
# Path 1 continues
```

### Export State for Analysis

```bash
# Execute several steps
for i in {1..5}; do
  dy e --step machine.dy
done

# Export final state
EXEC_ID=$(dy exec list | tail -1 | awk '{print $1}')
dy exec show $EXEC_ID --format json > state-step-5.json

# Generate diagram
dy exec show $EXEC_ID --format dot | dot -Tpng > state-step-5.png
```

### Automated Testing with Playback

```bash
# Record golden execution
dy e -i workflow.dy --record recordings/golden/ --id golden
while dy e -i workflow.dy --id golden; do :; done

# Test with playback (deterministic)
dy e -i workflow.dy --playback recordings/golden/ --id test
while dy e -i workflow.dy --id test --format json > test-output.json; do :; done

# Compare results
diff <(jq -S . recordings/golden/output.json) <(jq -S . test-output.json)
```

## Tips & Best Practices

### For Debugging

- **Use `--step-path` for barriers** - See exact synchronization behavior
- **Combine `--verbose` with `--step`** - Full visibility into each step
- **Export snapshots** - Use `--format json` to capture state
- **Check `dy exec show`** - Inspect without changing state

### For Multi-Path Execution

- **Use `--step-path` first** - Understand path behavior individually
- **Then use `--step`** - See all paths together
- **Watch for barriers** - Paths waiting at synchronization points
- **Export diagrams** - Visualize with `--format dot`

### For Testing

- **Record golden runs** - Use `--record` for expected behavior
- **Playback in CI** - Deterministic tests with `--playback`
- **Export JSON** - Compare states programmatically
- **Version recordings** - Commit to git

### For Agent Workflows

- **Use `--interactive` only** - No `--step` flags for automation
- **Handle LLM pauses** - Provide responses via stdin
- **Use explicit IDs** - Manage parallel executions
- **Record sessions** - Debug later with playback

## Next Steps

- **[CLI Reference](./README.md)** - Full CLI documentation
- **[Syntax Reference](../syntax/README.md)** - Learn machine syntax
- **[Examples](../examples/README.md)** - Practical patterns

## Implementation

Technical details:
- `src/cli/interactive-execution.ts` - Execution modes and state management
- `src/cli/execution-state.ts` - State persistence
- `src/language/executor.ts` - Executor with `step()`, `stepTurn()`, `stepPath()`
- `src/language/runtime-visualizer.ts` - Runtime visualization and snapshots
