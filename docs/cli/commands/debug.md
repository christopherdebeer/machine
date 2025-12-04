# debug Command

Output serialized AST for debugging and inspection.

## Usage

```bash
dy debug <file> [options]
dy d <file> [options]  # alias
```

## Arguments

- `<file>` - Source file to debug (`.dy`, `.dygram`, `.mach`)

## Options

- `-t, --text-regions` - Show positions of each syntax node
- `-s, --source-text` - Show the source text of each syntax node
- `-d, --destination <dir>` - Destination directory for output
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

## What It Does

The `debug` command outputs the Abstract Syntax Tree (AST) in a serialized format, useful for:

1. **Understanding parsing** - See how source code is parsed
2. **Debugging language features** - Inspect syntax node structure
3. **Tool development** - Build tools that work with the AST
4. **Troubleshooting** - Diagnose parsing issues

## Examples

### Basic AST Output

```bash
dy debug workflow.dy
```

### Show Text Regions

Display position information for each node:
```bash
dy debug workflow.dy --text-regions
```

### Show Source Text

Include source text for each node:
```bash
dy debug workflow.dy --source-text
```

### Combined Options

```bash
dy debug workflow.dy --text-regions --source-text
```

### Save to File

```bash
dy debug workflow.dy --destination ./debug-output
```

## Output Format

The AST is output as JSON with the following structure:

```json
{
  "$type": "Machine",
  "name": "WorkflowMachine",
  "nodes": [
    {
      "$type": "State",
      "name": "Start",
      ...
    }
  ],
  ...
}
```

### With Text Regions

When `--text-regions` is enabled:

```json
{
  "$type": "State",
  "name": "Start",
  "$textRegion": {
    "offset": 45,
    "length": 12,
    "line": 3,
    "column": 5
  }
}
```

### With Source Text

When `--source-text` is enabled:

```json
{
  "$type": "State",
  "name": "Start",
  "$sourceText": "State Start"
}
```

## Use Cases

### Language Development

Understand how new syntax features are parsed:
```bash
dy debug test-feature.dy --text-regions --source-text
```

### Tool Building

Extract AST for custom tooling:
```bash
dy debug app.dy > ast.json
# Process ast.json with custom tools
```

### Debugging Parse Errors

Identify where parsing fails:
```bash
dy debug broken.dy --verbose
```

### Documentation

Generate AST examples for documentation:
```bash
dy debug examples/simple.dy --text-regions > docs/ast-example.json
```

## Related Commands

- **[parseAndValidate](./parse-validate.md)** - Validate without AST output
- **[generate](./generate.md)** - Use `--debug` flag for AST during generation

## See Also

- [Language Grammar](../../syntax/README.md)
- [AST Structure Reference](../../reference/ast.md)
