# execute Command

Execute DyGram machine programs with LLM integration.

## Usage

```bash
dy execute [file] [options]
dy e [file] [options]  # alias
```

## Arguments

- `[file]` - Source file to execute (`.dy`, `.dygram`, `.mach`)
  - If omitted, reads from stdin

## Options

### Execution Modes
- `-i, --interactive` - Pause only when LLM response needed (await stdin)
- `--step` - Execute one step at a time (all paths together)
- `--step-turn` - Execute one turn at a time (for debugging)
- `--step-path` - Execute one path at a time (round-robin through active paths)

### Visualization
- `--format <format>` - Output format: `text` (default), `json`, `svg`, `dot`
- `-v, --verbose` - Verbose output (full runtime snapshot)

### State Management
- `--id <id>` - Execution ID (for managing multiple executions)
- `--force` - Force new execution (ignore existing state)

### Playback
- `--playback <dir>` - Playback from recordings directory
- `--record <dir>` - Record execution to directory

### Other Options
- `-d, --destination <dir>` - Destination directory for execution results
- `-m, --model <model>` - Model ID (e.g., `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`)
- `--no-imports` - Disable import resolution (treat as single file)
- `-q, --quiet` - Quiet output (errors only)

## Quick Examples

### Basic Execution

```bash
export ANTHROPIC_API_KEY=your_api_key
dy execute workflow.dy
```

### Interactive Mode

Run until LLM response needed:
```bash
dy execute --interactive app.dy
```

### Step-by-Step Debugging

```bash
dy execute --step workflow.dy
```

### With Custom Model

```bash
dy execute app.dy --model claude-3-5-sonnet-20241022
```

### From Stdin

```bash
cat workflow.dy | dy execute --interactive
```

## Execution Modes

### Interactive Mode (`--interactive`)
Runs continuously, pausing **only** when LLM response is needed.

**Best for:**
- Agent workflows
- Automated execution
- Production use

### Step Mode (`--step`)
Executes one step at a time, advancing all active paths together.

**Best for:**
- Basic debugging
- Understanding execution flow

### Step-Turn Mode (`--step-turn`)
Executes one LLM conversation turn at a time.

**Best for:**
- Debugging LLM interactions
- Tool execution analysis

### Step-Path Mode (`--step-path`)
Executes one path at a time in round-robin fashion.

**Best for:**
- Barrier debugging
- Multi-path execution analysis
- Understanding parallel execution

## Model Configuration

Model priority (highest to lowest):
1. CLI `--model` parameter
2. Machine-level `model` or `modelId` attribute
3. `ANTHROPIC_MODEL_ID` environment variable
4. Default: `claude-3-5-haiku-20241022`

## Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `ANTHROPIC_MODEL_ID` - Default model ID (optional)

## State Persistence

Executions are automatically saved to `.dygram/executions/<id>/`:
- `state.json` - Current execution state
- `metadata.json` - Execution metadata
- `machine.json` - Machine snapshot
- `history.jsonl` - Turn-by-turn history

## Exit Codes

- `0` - Execution completed successfully
- `1` - Error (parse, validation, or execution failure)

## Detailed Documentation

For comprehensive documentation on execution modes, state management, and advanced features, see:

**[Interactive Mode Guide](../interactive-mode.md)**

Topics covered:
- Detailed execution mode explanations
- State management and persistence
- Runtime visualization
- Recording and playback
- Execution management (`dy exec` commands)
- Barrier debugging
- Multi-path execution
- Complete workflow examples

## Related Commands

- **[exec management](../exec-management.md)** - Manage execution state
- **[server](./server.md)** - Execute via web interface
- **[generate](./generate.md)** - Generate machine representations

## See Also

- [Interactive Mode Guide](../interactive-mode.md) - Complete execution documentation
- [Syntax Reference](../../syntax/README.md)
- [Examples](../examples.md)
