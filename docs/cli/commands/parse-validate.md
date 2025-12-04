# parseAndValidate Command

Parse and validate DyGram files without generating output.

## Usage

```bash
dy parseAndValidate <file> [options]
dy pv <file> [options]  # alias
```

## Arguments

- `<file>` - Source file to parse and validate (`.dy`, `.dygram`, `.mach`)

## Options

- `-v, --verbose` - Verbose output with detailed validation information
- `-q, --quiet` - Quiet output (errors only)

## What It Does

The `parseAndValidate` command:

1. **Parses the source file** - Checks syntax correctness
2. **Validates semantics** - Checks for logical errors
3. **Reports issues** - Provides detailed error messages
4. **Produces no output** - Only validates, doesn't generate files

## Validation Checks

### Syntax Validation
- Correct token usage
- Proper grammar structure
- Valid identifiers and keywords

### Semantic Validation
- Undefined node references
- Circular dependencies
- Duplicate definitions
- Type mismatches
- Invalid attribute values
- Import resolution (if applicable)

## Examples

### Basic Validation

```bash
dy parseAndValidate workflow.dy
```

Success output:
```
✓ workflow.dy parsed and validated successfully
```

### Verbose Mode

Show detailed validation information:
```bash
dy parseAndValidate workflow.dy --verbose
```

### Quiet Mode

Only show errors:
```bash
dy parseAndValidate workflow.dy --quiet
```

## Use Cases

### Pre-Commit Validation

Validate before committing:
```bash
#!/bin/bash
for file in src/**/*.dy; do
  dy parseAndValidate "$file" || exit 1
done
```

### CI/CD Pipeline

```yaml
# .github/workflows/validate.yml
- name: Validate DyGram files
  run: |
    for file in $(find . -name "*.dy"); do
      dy parseAndValidate "$file"
    done
```

### Development Workflow

Quick validation during development:
```bash
# Validate before generating
dy parseAndValidate app.dy && dy generate app.dy
```

### Watch Mode

Validate on file changes:
```bash
# Using fswatch (macOS)
fswatch -o workflow.dy | xargs -n1 -I{} dy parseAndValidate workflow.dy

# Using inotifywait (Linux)
while inotifywait -e modify workflow.dy; do
  dy parseAndValidate workflow.dy
done
```

## Error Messages

### Syntax Errors

```
Error: Unexpected token 'State' at line 5, column 3
Expected: node name or '{'
```

### Semantic Errors

```
Error: Undefined node 'ProcessData' referenced in edge from 'Start'
  at line 12, column 15
```

### Import Errors

```
Error: Cannot resolve import './components/auth.dy'
File not found: ./components/auth.dy
```

## Exit Codes

- `0` - File is valid
- `1` - Validation errors found

## Integration Examples

### Make Target

```makefile
.PHONY: validate
validate:
	@find . -name "*.dy" -exec dy parseAndValidate {} \;
```

### NPM Script

```json
{
  "scripts": {
    "validate": "find . -name '*.dy' -exec dy parseAndValidate {} \\;"
  }
}
```

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Get staged .dy files
FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.dy$')

if [ -n "$FILES" ]; then
  echo "Validating DyGram files..."
  for file in $FILES; do
    dy parseAndValidate "$file" || exit 1
  done
fi
```

## Related Commands

- **[generate](./generate.md)** - Validate and generate output
- **[debug](./debug.md)** - Inspect AST structure
- **[check-imports](./check-imports.md)** - Validate import statements

## See Also

- [Syntax Reference](../../syntax/README.md)
- [Validation Rules](../../reference/validation.md)
