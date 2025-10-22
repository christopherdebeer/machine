# CLI Reference

Complete reference for the DyGram command-line interface.

## Table of Contents

## Installation

```bash
npm install -g dygram
```

Verify installation:

```bash
dygram --version
```

## Commands

### `dygram generate`

Generate output from a DyGram source file.

**Aliases**: `g`

**Usage**:
```bash
dygram generate <file> [options]
```

**Arguments**:
- `<file>` - Source file (.dygram, .mach) or JSON file for backward compilation

**Options**:
- `-d, --destination <dir>` - Output directory for generated files
- `-f, --format <formats>` - Comma-separated output formats (default: `json`)
  - Available formats: `json`, `mermaid`, `graphviz`, `dot`, `html`, `dsl`
- `--debug` - Output raw AST for debugging
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

**Examples**:

Generate JSON output (default):
```bash
dygram generate workflow.dygram
```

Generate multiple formats:
```bash
dygram generate workflow.dygram --format json,html,mermaid
```

Save to specific directory:
```bash
dygram generate workflow.dygram --destination ./output
```

Backward compilation (JSON to DSL):
```bash
dygram generate workflow.json --format dsl
```

---

### `dygram batch`

Process multiple files matching a glob pattern.

**Aliases**: `b`

**Usage**:
```bash
dygram batch <pattern> [options]
```

**Arguments**:
- `<pattern>` - Glob pattern for files (e.g., `"examples/**/*.dygram"`)

**Options**:
- `-d, --destination <dir>` - Output directory for generated files
- `-f, --format <formats>` - Comma-separated output formats (default: `json`)
- `--continue-on-error` - Continue processing if a file fails
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

**Examples**:

Process all DyGram files in examples:
```bash
dygram batch "examples/**/*.dygram"
```

Generate HTML for all files with error handling:
```bash
dygram batch "src/**/*.dygram" --format html --continue-on-error
```

---

### `dygram execute`

Execute a machine program using the Rails-Based Architecture.

**Aliases**: `exec`, `e`

**Usage**:
```bash
dygram execute <file> [options]
```

**Arguments**:
- `<file>` - DyGram source file to execute

**Options**:
- `-d, --destination <dir>` - Directory for execution results
- `-m, --model <model>` - LLM model ID (default: `claude-3-5-haiku-20241022`)
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

**Environment Variables**:
- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `ANTHROPIC_MODEL_ID` - Default model ID (optional)

**Model Priority**:
1. CLI `--model` parameter
2. Machine-level `model` or `modelId` attribute
3. `ANTHROPIC_MODEL_ID` environment variable
4. Default: `claude-3-5-haiku-20241022`

**Examples**:

Execute with default model:
```bash
export ANTHROPIC_API_KEY=your_api_key
dygram execute workflow.dygram
```

Execute with specific model:
```bash
dygram execute workflow.dygram --model claude-3-5-sonnet-20241022
```

---

### `dygram parseAndValidate`

Parse and validate a DyGram file without generating output.

**Aliases**: `pv`

**Usage**:
```bash
dygram parseAndValidate <file> [options]
```

**Arguments**:
- `<file>` - Source file to validate

**Options**:
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

**Examples**:

```bash
dygram parseAndValidate workflow.dygram
```

---

### `dygram debug`

Output serialized AST for debugging and inspection.

**Aliases**: `d`

**Usage**:
```bash
dygram debug <file> [options]
```

**Arguments**:
- `<file>` - Source file to debug

**Options**:
- `-d, --destination <dir>` - Output directory
- `-t, --text-regions` - Show positions of each syntax node
- `-s, --source-text` - Show source text of each syntax node
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

**Examples**:

Debug with text regions:
```bash
dygram debug workflow.dygram --text-regions
```

---

## Global Options

These options are available for all commands:

- `-v, --verbose` - Enable detailed logging
- `-q, --quiet` - Suppress all output except errors
- `--version` - Display version number
- `--help` - Display help information

## Output Formats

### JSON (`json`)

Structured JSON representation of the machine graph.

**Use Cases**:
- Programmatic processing
- API integration
- Debugging

**Output**: `<filename>.json`

### Mermaid (`mermaid`)

Mermaid diagram syntax for visualization.

**Use Cases**:
- Documentation
- Presentations
- GitHub/GitLab rendering

**Output**: `<filename>.mmd`

### Graphviz/DOT (`graphviz`, `dot`)

DOT language for Graphviz rendering.

**Use Cases**:
- Complex visualizations
- Large graphs
- Custom styling

**Output**: `<filename>.dot`

### HTML (`html`)

Interactive HTML visualization with embedded JavaScript.

**Use Cases**:
- Shareable visualizations
- Presentations
- Web integration

**Output**: `<filename>.html`

**Tip**: Open HTML files in a browser for interactive diagrams.

### DSL (`dsl`)

Generate DyGram source from JSON (backward compilation).

**Requirements**: Input must be a JSON file

**Use Cases**:
- Round-trip transformation
- Programmatic generation
- Format migration

**Output**: `<filename>.dygram`

## Examples

### Basic Workflow

```bash
# 1. Validate syntax
dygram parseAndValidate my-machine.dygram

# 2. Generate JSON
dygram generate my-machine.dygram

# 3. Generate visualization
dygram generate my-machine.dygram --format html
```

### Batch Processing

```bash
# Process all examples
dygram batch "examples/**/*.dygram" --format json,html --destination ./output
```

### Execution

```bash
# Set up environment
export ANTHROPIC_API_KEY=your_api_key

# Execute machine
dygram execute workflow.dygram --verbose
```

### Development Workflow

```bash
# Watch mode: validate on save (use with file watcher)
while inotifywait -e modify workflow.dygram; do
    dygram parseAndValidate workflow.dygram
done
```

## Error Handling

The CLI provides detailed error messages for:

- **Lexer Errors**: Invalid tokens or characters
- **Parser Errors**: Syntax errors
- **Validation Errors**: Semantic errors (undefined nodes, circular references, etc.)
- **Generation Errors**: Issues during output generation

Use `--verbose` for detailed error information and stack traces.

## File Extensions

DyGram recognizes the following file extensions:
- `.dygram` (recommended)
- `.mach` (legacy)

## Exit Codes

- `0` - Success
- `1` - Error (parse, validation, or generation failure)

## Next Steps

- **[Syntax Reference](../syntax/README.md)** - Learn the language syntax
- **[API Reference](../api/README.md)** - Programmatic usage
- **[Examples](../examples/README.md)** - Practical patterns

---

**Implementation**: See [src/cli/main.ts](../../src/cli/main.ts) for the full CLI implementation
