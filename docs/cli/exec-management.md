# Execution Management

Manage interactive execution state with `dy exec` subcommands.

## Overview

The `dy exec` command provides tools for managing execution state:

- **list** - List all executions
- **status** - Show execution status
- **show** - View runtime snapshot without advancing
- **rm** - Remove execution
- **clean** - Clean up completed executions

## Commands

### list

List all executions with their status.

**Usage:**
```bash
dy exec list [options]
dy exec ls [options]  # alias
```

**Options:**
- `-v, --verbose` - Show detailed information

**Example:**
```bash
dy exec list
```

**Output:**
```
Active executions:
  exec-20251203-143022  machine.dy  step 5   in_progress  2 min ago
  my-session            workflow.dy turn 3   paused       5 min ago
```

---

### status

Show detailed status for a specific execution.

**Usage:**
```bash
dy exec status <id>
```

**Arguments:**
- `<id>` - Execution ID

**Example:**
```bash
dy exec status exec-20251203-143022
```

**Output:**
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

---

### show

View runtime snapshot without advancing execution.

**Usage:**
```bash
dy exec show <id> [options]
```

**Arguments:**
- `<id>` - Execution ID

**Options:**
- `--verbose` - Full runtime snapshot
- `--format <format>` - Output format: `text`, `json`, `svg`, `dot`

**Examples:**

Compact summary:
```bash
dy exec show exec-20251203-143022
```

Output:
```
📊 at: WaitPoint | paths: 2/2 | 2 transitions | steps: 5
```

Full snapshot:
```bash
dy exec show exec-20251203-143022 --verbose
```

JSON export:
```bash
dy exec show exec-20251203-143022 --format json > state.json
```

Graphviz diagram:
```bash
dy exec show exec-20251203-143022 --format dot > state.dot
dot -Tpng state.dot -o state.png
```

---

### rm

Remove a specific execution.

**Usage:**
```bash
dy exec rm <id>
```

**Arguments:**
- `<id>` - Execution ID to remove

**Example:**
```bash
dy exec rm exec-20251203-143022
```

---

### clean

Clean up completed executions.

**Usage:**
```bash
dy exec clean [options]
```

**Options:**
- `--all` - Clean all executions (including active ones)

**Examples:**

Clean completed only:
```bash
dy exec clean
```

Clean all executions:
```bash
dy exec clean --all
```

## Execution State

### State Directory

Executions are stored in `.dygram/executions/`:

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

### State Files

**state.json** - Current execution state:
- Current nodes per path
- Visited nodes and history
- Context attributes
- Turn state

**metadata.json** - Execution metadata:
- Execution ID
- Machine file path
- Start time
- Last update time
- Mode (interactive, step, etc.)
- Status (in_progress, completed, failed)

**machine.json** - Machine snapshot at execution start

**history.jsonl** - Turn-by-turn execution history

## Common Workflows

### View Current State

```bash
# Get last execution ID
EXEC_ID=$(dy exec list | tail -1 | awk '{print $1}')

# View state
dy exec show $EXEC_ID --verbose
```

### Export State for Analysis

```bash
# Export JSON
dy exec show exec-20251203-143022 --format json > analysis/state.json

# Generate diagram
dy exec show exec-20251203-143022 --format dot | dot -Tpng > analysis/state.png
```

### Clean Up Old Executions

```bash
# Remove specific execution
dy exec rm old-execution-id

# Clean completed executions
dy exec clean

# Clean everything
dy exec clean --all
```

### Monitor Execution Progress

```bash
# Watch execution status
watch -n 1 'dy exec show $(dy exec list | tail -1 | awk "{print \$1}")'
```

## Multiple Executions

### Using Custom IDs

Run multiple executions in parallel:

```bash
# Start execution with custom ID
dy execute --step machine.dy --id debug-session

# Continue with same ID
dy execute --step machine.dy --id debug-session

# Start another execution
dy execute --step machine.dy --id test-session
```

### Managing Multiple Sessions

```bash
# List all sessions
dy exec list

# Check specific session
dy exec status debug-session

# View state of specific session
dy exec show debug-session --verbose
```

## Integration Examples

### CI/CD Pipeline

```bash
#!/bin/bash
# Run execution and save state

EXEC_ID="ci-$(date +%Y%m%d-%H%M%S)"

dy execute --interactive workflow.dy --id $EXEC_ID

# Export results
dy exec show $EXEC_ID --format json > results/$EXEC_ID.json

# Clean up
dy exec rm $EXEC_ID
```

### Automated Testing

```bash
#!/bin/bash
# Test with state snapshots

dy execute --step test.dy --id test-run

# Capture state at each step
for i in {1..10}; do
  dy exec show test-run --format json > snapshots/step-$i.json
  dy execute --step test.dy --id test-run
done

# Clean up
dy exec rm test-run
```

## Related Documentation

- **[Interactive Mode Guide](./interactive-mode.md)** - Complete execution documentation
- **[execute Command](./commands/execute.md)** - Execute command reference

## See Also

- [State Management](./interactive-mode.md#state-management)
- [Runtime Visualization](./interactive-mode.md#runtime-visualization)
