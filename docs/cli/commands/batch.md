# batch Command

Process multiple DyGram files matching a glob pattern.

## Usage

```bash
dy batch <pattern> [options]
dy b <pattern> [options]  # alias
```

## Arguments

- `<pattern>` - Glob pattern for files to process
  - Example: `"examples/**/*.dy"`
  - Example: `"src/**/*.{dy,dygram}"`

## Options

- `-d, --destination <dir>` - Output directory for generated files
- `-f, --format <formats>` - Comma-separated output formats (default: `json`)
  - Available: `json`, `graphviz`, `dot`, `html`
  - Note: `dsl` format not supported in batch mode
- `--continue-on-error` - Continue processing remaining files if an error occurs
- `-v, --verbose` - Verbose output
- `-q, --quiet` - Quiet output (errors only)

## Output Formats

### JSON (`json`)
Structured JSON representation of each machine.

**Output**: `<filename>.json` for each input file

### Graphviz/DOT (`graphviz`, `dot`)
DOT language for Graphviz rendering.

**Output**: `<filename>.dot` for each input file

### HTML (`html`)
Interactive HTML visualization.

**Output**: `<filename>.html` for each input file

## Examples

### Basic Batch Processing

Process all DyGram files in examples directory:
```bash
dy batch "examples/**/*.dy"
```

Process with specific formats:
```bash
dy batch "examples/**/*.dy" --format json,html
```

### Custom Output Directory

```bash
dy batch "src/**/*.dy" --destination ./output
```

### Error Handling

Continue processing even if some files fail:
```bash
dy batch "**/*.dy" --continue-on-error
```

### Multiple File Extensions

```bash
dy batch "src/**/*.{dy,dygram,mach}" --format json
```

### Quiet Mode

Only show errors:
```bash
dy batch "**/*.dy" --quiet --continue-on-error
```

## Glob Pattern Tips

- Use quotes around patterns to prevent shell expansion
- `**` matches any number of directories
- `*` matches any characters within a directory
- `{a,b}` matches either `a` or `b`

**Examples:**
- `"**/*.dy"` - All `.dy` files recursively
- `"src/**/*.dy"` - All `.dy` files under `src/`
- `"examples/*.dy"` - Only `.dy` files directly in `examples/`
- `"**/*.{dy,dygram}"` - All `.dy` and `.dygram` files

## Exit Codes

- `0` - Success (all files processed)
- `1` - Error (one or more files failed)
  - Use `--continue-on-error` to process remaining files

## Performance Tips

1. **Use specific patterns** - Narrow patterns process faster
2. **Limit formats** - Generate only needed formats
3. **Use `--quiet`** - Reduces output overhead for large batches

## Related Commands

- **[generate](./generate.md)** - Process single files
- **[parseAndValidate](./parse-validate.md)** - Validate without generating

## See Also

- [Output Formats Guide](../output-formats.md)
- [Examples](../examples.md)
