# Troubleshooting

## Troubleshooting Guide

Common issues and their solutions when working with DyGram and the Machine DSL.

---

## Installation Issues

### NPM Installation Fails

**Problem**: `npm install` fails with errors

**Solutions**:
- Ensure you have Node.js 16+ installed: `node --version`
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`, then retry
- Check for permission issues (use `sudo` on Linux/Mac if needed)

### VS Code Extension Not Working

**Problem**: Machine files aren't recognized in VS Code

**Solutions**:
- Verify the extension is installed and enabled
- Reload VS Code: Press `Ctrl+Shift+P` (or `Cmd+Shift+P`), type "Reload Window"
- Check file extension is `.dygram` or `.mach`
- Manually set language mode: Click language indicator in status bar → Select "Machine"

---

## Syntax & Validation Errors

### "Expected ';' but found..." Error

**Problem**: Parser expecting semicolon

**Solution**: Machine statements require semicolons:

```machine
// ❌ Wrong
state start

// ✓ Correct
state start;
```

### "Undefined reference" Error

**Problem**: Referenced node or context doesn't exist

**Solution**: Ensure all referenced nodes are defined:

```machine
// ❌ Wrong - 'processData' not defined
start --> processData;

// ✓ Correct
Task processData {
  prompt: "Process data";
};

start --> processData;
```

### Edge Syntax Errors

**Problem**: Invalid edge syntax

**Solutions**:

```machine
// ✓ Valid edge types
start --> target;          // Standard edge
start -stores-> context;   // Stores edge
start -optional-> target;  // Optional edge
start -loop-> target;      // Loop edge

// ❌ Invalid
start -> target;           // Too short
start ---> target;         // Too long
```

### Attribute Type Errors

**Problem**: Wrong type for attribute value

**Solution**: Match attribute types:

```machine
// ❌ Wrong - string for number field
context data {
  count<number>: "10";
}

// ✓ Correct
context data {
  count<number>: 10;
  name<string>: "value";
  active<boolean>: true;
}
```

---

## Execution Issues

### Machine Fails to Execute

**Problem**: Runtime execution errors

**Solutions**:
1. Validate first: `npx dygram validate file.dygram`
2. Check for circular dependencies
3. Ensure all required nodes are reachable from start
4. Verify context schemas are correct

### "No start state found" Error

**Problem**: Machine missing entry point

**Solution**: Every machine needs a state named `start`:

```machine
machine "Example"

state start;  // Required entry point
state end;

start --> end;
```

### Meta-Programming Errors

**Problem**: Meta tasks not executing properly

**Solutions**:
- Ensure node has `meta: true` attribute
- Check AI provider configuration
- Verify prompt is well-formed
- Review execution logs for AI errors

---

## Playground Issues

### Playground Not Loading

**Problem**: Browser playground fails to load

**Solutions**:
- Clear browser cache and reload
- Try incognito/private browsing mode
- Check browser console for JavaScript errors (F12)
- Try alternate playground:
  - If Monaco fails → Try [Mobile Playground](playground-mobile.html)
  - If CodeMirror fails → Try [Monaco Playground](playground.html)

### Code Not Executing in Playground

**Problem**: Code appears valid but doesn't execute

**Solutions**:
- Check browser console for errors
- Ensure code is syntactically valid
- Try executing simpler example first
- Reload the playground

### Syntax Highlighting Not Working

**Problem**: Code appears as plain text

**Solutions**:
- Wait for editor to fully load
- Try reloading the page
- Check browser console for errors
- Try alternate playground

---

## CLI Issues

### "Command not found: dygram"

**Problem**: CLI not in PATH

**Solutions**:
- Use npx: `npx dygram file.dygram`
- Install globally: `npm install -g .`
- Use npm script: `npm run cli -- file.dygram`

### File Not Found Errors

**Problem**: CLI can't find .dygram file

**Solutions**:
- Use absolute paths: `/full/path/to/file.dygram`
- Check current directory: `pwd`
- Verify file exists: `ls file.dygram`
- Check file extension is correct

### Export Command Fails

**Problem**: `npx dygram export` produces errors

**Solutions**:
- Validate file first: `npx dygram validate file.dygram`
- Specify format explicitly: `--format mermaid` or `--format json`
- Check output directory permissions
- Ensure file is valid Machine code

---

## IDE / Language Server Issues

### IntelliSense Not Working

**Problem**: No auto-completion or suggestions

**Solutions**:
- Ensure VS Code extension is installed
- Reload VS Code window
- Check TypeScript version compatibility
- Verify workspace trust settings

### Diagnostics Not Appearing

**Problem**: Errors not shown in Problems panel

**Solutions**:
- Save the file (Ctrl+S / Cmd+S)
- Check Output panel for language server errors
- Restart language server: `Ctrl+Shift+P` → "Restart Extension Host"

### Go-to-Definition Not Working

**Problem**: Can't navigate to definitions

**Solution**: This feature requires:
- Nodes to be defined in the same file (currently no cross-file resolution)
- Valid syntax
- Language server to be running

---

## Performance Issues

### Slow Execution

**Problem**: Machine takes long time to execute

**Solutions**:
- Check for circular dependencies or infinite loops
- Reduce complexity of meta-programming tasks
- Use validation before execution
- Profile execution with verbose logging

### Large File Handling

**Problem**: Editor sluggish with large .dygram files

**Solutions**:
- Split into multiple files with imports
- Disable features like auto-format for large files
- Increase VS Code memory limit
- Use CLI for validation instead of real-time

---

## Integration Issues

### Import Errors

**Problem**: Can't import other Machine files

**Solutions**:
- Use correct import syntax:
  ```machine
  ```
- Verify file paths are relative or absolute
- Ensure imported file is valid Machine code

### CI/CD Failures

**Problem**: Validation fails in CI/CD pipeline

**Solutions**:
- Ensure Node.js and dependencies are installed in CI
- Use `npx dygram validate` in pipeline
- Check file paths in CI environment
- Verify environment variables are set

---

## Error Messages Reference

### Common Validation Errors

| Error Message | Meaning | Solution |
|---------------|---------|----------|
| `Expected 'machine' keyword` | File must start with machine declaration | Add `machine "Name"` at top |
| `Duplicate node definition` | Node name used twice | Use unique names for all nodes |
| `Invalid edge target` | Edge points to undefined node | Define target node first |
| `Type mismatch in context` | Attribute value doesn't match type | Use correct type for value |
| `Missing semicolon` | Statement not terminated | Add `;` at end of statement |

### Common Runtime Errors

| Error Message | Meaning | Solution |
|---------------|---------|----------|
| `No start state` | Entry point missing | Define `state start;` |
| `Unreachable node` | Node not connected to graph | Add edges connecting to node |
| `Context not found` | Referenced context undefined | Define context before use |
| `Circular dependency detected` | Infinite loop in graph | Review edge connections |

---

## Still Having Issues?

If your problem isn't covered here:

1. **Check Documentation**: Browse the [complete docs](documentation.html)
2. **Search Examples**: Look at [Examples](examples-index.html) for similar patterns
3. **GitHub Issues**: Search [existing issues](https://github.com/christopherdebeer/machine/issues)
4. **Ask for Help**: Post in [GitHub Discussions](https://github.com/christopherdebeer/machine/discussions)

When reporting issues, include:
- Machine code that reproduces the problem
- Full error message
- OS and Node.js version
- Steps to reproduce
