# CLI Reference

Complete reference for the DyGram command-line interface.

## Installation

```bash
npm install -g dygram
```

Verify installation:
```bash
dy --version
```

## Quick Start

```bash
# Validate a file
dy parseAndValidate workflow.dy

# Generate JSON output
dy generate workflow.dy

# Execute a machine
export ANTHROPIC_API_KEY=your_api_key
dy execute workflow.dy --interactive
```

## Command Index

### Core Commands

| Command | Alias | Description |
|---------|-------|-------------|
| [generate](./commands/generate.md) | `g` | Generate output in various formats (JSON, HTML, DOT, DSL) |
| [batch](./commands/batch.md) | `b` | Process multiple files matching a glob pattern |
| [execute](./commands/execute.md) | `e` | Execute machines with LLM integration |
| [parseAndValidate](./commands/parse-validate.md) | `pv` | Validate syntax and semantics without generating output |
| [debug](./commands/debug.md) | `d` | Output serialized AST for debugging |

### Multi-File Support

| Command | Alias | Description |
|---------|-------|-------------|
| [check-imports](./commands/check-imports.md) | `ci` | Validate imports and show dependency graph |
| [bundle](./commands/bundle.md) | - | Bundle multi-file machines into single file |

### Development Tools

| Command | Alias | Description |
|---------|-------|-------------|
| [server](./commands/server.md) | `serve` | Start local development server with playground |
| [exec](./exec-management.md) | - | Manage execution state (list, show, status, rm, clean) |

## Execution & Debugging

For detailed information on execution modes, state management, and debugging:

**[Interactive Mode Guide](./interactive-mode.md)**

Topics covered:
- Interactive, step, step-turn, and step-path execution modes
- State persistence and management
- Runtime visualization
- Recording and playback
- Barrier debugging
- Multi-path execution

## Global Options

Available for all commands:

- `-v, --verbose` - Enable detailed logging
- `-q, --quiet` - Suppress all output except errors
- `--version` - Display version number
- `--help` - Display help information

## File Extensions

DyGram recognizes the following file extensions:

- `.dy` (recommended)
- `.dygram` (alternative)
- `.mach` (legacy)

## Output Formats

### Available Formats

| Format | Extension | Description | Commands |
|--------|-----------|-------------|----------|
| JSON | `.json` | Structured machine representation | generate, batch |
| HTML | `.html` | Interactive visualization | generate, batch |
| Graphviz/DOT | `.dot` | Graph visualization | generate, batch, exec show |
| DSL | `.dy` | DyGram source (backward compilation) | generate only |
| SVG | `.svg` | Vector graphics | exec show |

For detailed format documentation, see [Output Formats Guide](./output-formats.md).

## Common Workflows

### Development Workflow

```bash
# 1. Validate syntax
dy parseAndValidate workflow.dy

# 2. Generate outputs
dy generate workflow.dy --format json,html

# 3. Start dev server
dy server

# 4. Execute and test
dy execute workflow.dy --interactive
```

### Multi-File Projects

```bash
# 1. Validate imports
dy check-imports main.dy

# 2. Bundle for distribution
dy bundle main.dy --output dist/app.dy

# 3. Generate from bundle
dy generate dist/app.dy --format json,html
```

### Batch Processing

```bash
# Process all files
dy batch "src/**/*.dy" --format json,html --destination ./output

# With error handling
dy batch "**/*.dy" --continue-on-error --quiet
```

### Debugging

```bash
# Step through execution
dy execute workflow.dy --step --verbose

# Debug barriers and multi-path
dy execute workflow.dy --step-path --verbose

# View execution state
dy exec show $(dy exec list | tail -1 | awk '{print $1}')
```

## Environment Variables

### Execution

- `ANTHROPIC_API_KEY` - Your Anthropic API key (required for execution)
- `ANTHROPIC_MODEL_ID` - Default model ID (optional)

## Exit Codes

- `0` - Success
- `1` - Error (parse, validation, generation, or execution failure)

## Error Handling

The CLI provides detailed error messages for:

- **Lexer Errors** - Invalid tokens or characters
- **Parser Errors** - Syntax errors
- **Validation Errors** - Semantic errors (undefined nodes, circular references, etc.)
- **Generation Errors** - Issues during output generation
- **Execution Errors** - Runtime errors during machine execution

Use `--verbose` for detailed error information and stack traces.

## Integration

### CI/CD

```yaml
# .github/workflows/validate.yml
- name: Validate DyGram files
  run: |
    npm install -g dygram
    dy batch "**/*.dy" --format json
```

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit
FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.dy$')
if [ -n "$FILES" ]; then
  for file in $FILES; do
    dy parseAndValidate "$file" || exit 1
  done
fi
```

### NPM Scripts

```json
{
  "scripts": {
    "validate": "dy batch 'src/**/*.dy'",
    "build": "dy batch 'src/**/*.dy' --format json,html --destination dist",
    "dev": "dy server"
  }
}
```

## Additional Resources

- **[Interactive Mode Guide](./interactive-mode.md)** - Execution and debugging
- **[Execution Management](./exec-management.md)** - Managing execution state
- **[Output Formats](./output-formats.md)** - Format specifications
- **[Examples](./examples.md)** - Common patterns and workflows
- **[Syntax Reference](../syntax/README.md)** - Language syntax
- **[API Reference](../api/README.md)** - Programmatic usage

## Getting Help

```bash
# General help
dy --help

# Command-specific help
dy generate --help
dy execute --help
dy exec --help
```

## Implementation

See [src/cli/](../../src/cli/) for the full CLI implementation.
