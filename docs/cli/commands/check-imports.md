# check-imports Command

Validate imports and display dependency graph for multi-file machines.

## Usage

```bash
dy check-imports <file> [options]
dy ci <file> [options]  # alias
```

## Arguments

- `<file>` - Source file to check (`.dy`, `.dygram`, `.mach`)

## Options

- `-v, --verbose` - Verbose output with detailed dependency information
- `-q, --quiet` - Quiet output (errors only)

## What It Does

The `check-imports` command:

1. **Validates import statements** - Ensures all imported files exist
2. **Checks for circular dependencies** - Detects import cycles
3. **Shows dependency graph** - Displays the import hierarchy
4. **Validates import syntax** - Ensures proper import declarations

## Examples

### Basic Import Validation

Check a single file:
```bash
dy check-imports app.dy
```

### Verbose Output

Show detailed dependency information:
```bash
dy check-imports app.dy --verbose
```

### Quiet Mode

Only show errors:
```bash
dy check-imports app.dy --quiet
```

## Common Use Cases

### Pre-Build Validation

Validate imports before generating output:
```bash
dy check-imports app.dy && dy generate app.dy
```

### CI/CD Integration

Add to your build pipeline:
```bash
#!/bin/bash
for file in src/**/*.dy; do
  dy check-imports "$file" || exit 1
done
```

### Development Workflow

Check imports after adding new dependencies:
```bash
dy check-imports main.dy --verbose
```

## Import Validation

The command checks for:

- **Missing files** - Imported files that don't exist
- **Circular dependencies** - Import cycles that would cause infinite loops
- **Invalid paths** - Malformed import paths
- **Syntax errors** - Invalid import declarations

## Exit Codes

- `0` - All imports valid
- `1` - Import errors detected

## Related Commands

- **[bundle](./bundle.md)** - Bundle multi-file machines into single file
- **[generate](./generate.md)** - Generate with `--no-imports` to disable resolution
- **[parseAndValidate](./parse-validate.md)** - General validation

## See Also

- [Import System Documentation](../../syntax/imports/README.md)
- [Multi-File Machines Guide](../../guides/multi-file-machines.md)
