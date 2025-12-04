# generate Command

Generate output from DyGram source files in various formats.

## Usage

```bash
dy generate <file> [options]
dy g <file> [options]  # alias
```

## Arguments

- `<file>` - Source file to generate from
  - DSL files: `.dy`, `.dygram`, `.mach`
  - JSON files: For backward compilation to DSL

## Options

- `-d, --destination <dir>` - Output directory for generated files
- `-f, --format <formats>` - Comma-separated output formats (default: `json`)
  - Available: `json`, `graphviz`, `dot`, `html`, `dsl`
- `--debug` - Output raw AST for debugging
- `--no-imports` - Disable import resolution (treat as single file)
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

## Output Formats

### JSON (`json`)
Structured JSON representation of the machine graph.

**Output**: `<filename>.json`

**Use cases:**
- Programmatic processing
- API integration
- Debugging

### Graphviz/DOT (`graphviz`, `dot`)
DOT language for Graphviz rendering.

**Output**: `<filename>.dot`

**Use cases:**
- Complex visualizations
- Large graphs
- Custom styling

**Example:**
```bash
dy generate workflow.dy --format dot
dot -Tpng workflow.dot -o workflow.png
```

### HTML (`html`)
Interactive HTML visualization with embedded JavaScript.

**Output**: `<filename>.html`

**Use cases:**
- Shareable visualizations
- Presentations
- Web integration

**Tip**: Open HTML files in a browser for interactive diagrams.

### DSL (`dsl`)
Generate DyGram source from JSON (backward compilation).

**Requirements**: Input must be a JSON file

**Output**: `<filename>.dy`

**Use cases:**
- Round-trip transformation
- Programmatic generation
- Format migration

## Examples

### Basic Generation

Generate JSON (default):
```bash
dy generate workflow.dy
```

Generate multiple formats:
```bash
dy generate workflow.dy --format json,html,dot
```

### Backward Compilation

Convert JSON back to DSL:
```bash
dy generate workflow.json --format dsl
```

### Custom Output Directory

```bash
dy generate workflow.dy --destination ./output --format json,html
```

### Single-File Mode

Disable import resolution:
```bash
dy generate app.dy --no-imports
```

### Debug Mode

Output raw AST:
```bash
dy generate workflow.dy --debug
```

## File Extensions

Supported input extensions:
- `.dy` (recommended)
- `.dygram` (legacy)
- `.mach` (alternative)
- `.json` (for backward compilation)

## Exit Codes

- `0` - Success
- `1` - Error (parse, validation, or generation failure)

## Related Commands

- **[batch](./batch.md)** - Process multiple files at once
- **[debug](./debug.md)** - Detailed AST inspection
- **[parseAndValidate](./parse-validate.md)** - Validate without generating

## See Also

- [Output Formats Guide](../output-formats.md)
- [Syntax Reference](../../syntax/README.md)
