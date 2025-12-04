# bundle Command

Bundle multi-file machines into a single file for distribution or deployment.

## Usage

```bash
dy bundle <file> [options]
```

## Arguments

- `<file>` - Entry file to bundle (`.dy`, `.dygram`, `.mach`)

## Options

- `-o, --output <file>` - Output file path (default: `<filename>.bundled.dy`)
- `-v, --verbose` - Verbose output showing bundling process
- `-q, --quiet` - Quiet output (errors only)

## What It Does

The `bundle` command:

1. **Resolves all imports** - Follows import statements recursively
2. **Inlines imported content** - Combines all files into one
3. **Preserves semantics** - Maintains original behavior
4. **Removes import statements** - Creates standalone file

## Examples

### Basic Bundling

Bundle with default output name:
```bash
dy bundle app.dy
# Creates: app.bundled.dy
```

### Custom Output Path

Specify output location:
```bash
dy bundle app.dy --output dist/app.bundled.dy
```

### Verbose Mode

See bundling details:
```bash
dy bundle app.dy --verbose
```

## Use Cases

### Distribution

Create single-file version for sharing:
```bash
dy bundle main.dy --output releases/v1.0.0.dy
```

### Deployment

Bundle before deployment to simplify file management:
```bash
dy bundle app.dy --output deploy/app.dy
```

### Testing

Create standalone version for testing:
```bash
dy bundle app.dy --output test/app.bundled.dy
dy execute test/app.bundled.dy
```

### CI/CD Pipeline

```bash
#!/bin/bash
# Bundle and validate
dy bundle src/main.dy --output dist/app.dy
dy parseAndValidate dist/app.dy
dy generate dist/app.dy --format json
```

## Bundling Process

1. **Parse entry file** - Read and validate main file
2. **Resolve imports** - Find all imported files
3. **Check for cycles** - Detect circular dependencies
4. **Inline content** - Combine all files
5. **Write output** - Create bundled file

## Benefits

- **Single file deployment** - No need to manage multiple files
- **Simplified distribution** - Easy to share and version
- **Reduced complexity** - No import resolution at runtime
- **Portable** - Works anywhere without dependencies

## Limitations

- **Larger file size** - All content in one file
- **Less modular** - Harder to edit individual components
- **No dynamic imports** - All imports resolved at bundle time

## Related Commands

- **[check-imports](./check-imports.md)** - Validate imports before bundling
- **[generate](./generate.md)** - Generate from bundled file with `--no-imports`
- **[execute](./execute.md)** - Execute bundled machines

## Workflow Example

Complete workflow from multi-file to deployment:

```bash
# 1. Validate imports
dy check-imports src/main.dy

# 2. Bundle
dy bundle src/main.dy --output dist/app.dy

# 3. Validate bundle
dy parseAndValidate dist/app.dy

# 4. Generate outputs
dy generate dist/app.dy --format json,html --destination dist/

# 5. Execute
dy execute dist/app.dy
```

## Exit Codes

- `0` - Bundle created successfully
- `1` - Error (missing imports, circular dependencies, etc.)

## See Also

- [Import System Documentation](../../syntax/imports/README.md)
- [Multi-File Machines Guide](../../guides/multi-file-machines.md)
