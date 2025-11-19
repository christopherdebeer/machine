# Code Generation Troubleshooting Guide

This guide covers common issues with the `@code` annotation system and their solutions.

## Table of Contents

- [Code Not Being Generated](#code-not-being-generated)
- [Schema Validation Errors](#schema-validation-errors)
- [Runtime Errors in Generated Code](#runtime-errors-in-generated-code)
- [LLM Fallback Always Triggered](#llm-fallback-always-triggered)
- [File Permission Errors](#file-permission-errors)
- [Module Loading Errors](#module-loading-errors)
- [TypeScript Compilation Errors](#typescript-compilation-errors)
- [Regeneration Loops](#regeneration-loops)

## Code Not Being Generated

### Symptom

Task with `@code` annotation doesn't generate code file.

### Possible Causes

1. **Missing `code` attribute**
   ```dygram
   @code
   Task MyTask {
       prompt: "Do something";
       // Missing: code: #MyTask;
   }
   ```

   **Solution**: Add `code` attribute with external reference:
   ```dygram
   @code
   Task MyTask {
       prompt: "Do something";
       code: #MyTask;  // Add this
   }
   ```

2. **Invalid external reference format**
   ```dygram
   code: "MyTask";     // ✗ Missing # prefix
   code: MyTask;       // ✗ Not a string
   ```

   **Solution**: Use correct format:
   ```dygram
   code: #MyTask;      // ✓ Correct
   ```

3. **ANTHROPIC_API_KEY not set**

   **Solution**: Set environment variable:
   ```bash
   export ANTHROPIC_API_KEY=your_api_key_here
   ```

4. **File path issues**

   **Solution**: Check `dygramFilePath` is correctly passed to executor:
   ```typescript
   const executor = await RailsExecutor.create(machineData, {
       llm: { /* ... */ },
       dygramFilePath: path.resolve('example.dygram')  // Make sure this is set
   });
   ```

### Verification

```bash
# Check if code was generated
dygram code-status example.dygram

# Manually trigger generation
dygram generate-code example.dygram MyTask
```

## Schema Validation Errors

### Symptom

Error: "Input validation failed" or "Output validation failed"

### Common Schema Issues

1. **Type mismatch**
   ```dygram
   schema: {
       input: { type: "string" }
   }
   ```

   But code receives:
   ```javascript
   { value: "text" }  // Object, not string
   ```

   **Solution**: Fix schema to match actual data:
   ```dygram
   schema: {
       input: {
           type: "object",
           properties: {
               value: { type: "string" }
           }
       }
   }
   ```

2. **Missing required fields**
   ```dygram
   schema: {
       output: {
           type: "object",
           properties: {
               result: { type: "string" }
           },
           required: ["result", "confidence"]  // Requires confidence
       }
   }
   ```

   But code returns:
   ```javascript
   { result: "value" }  // Missing confidence
   ```

   **Solution**: Either remove from required or update code to include it:
   ```dygram
   required: ["result"]  // Remove confidence from required
   ```

3. **Incorrect nested structure**
   ```dygram
   schema: {
       input: {
           type: "object",
           properties: {
               items: {
                   type: "array",
                   items: { type: "string" }  // Expects string array
               }
           }
       }
   }
   ```

   But code receives:
   ```javascript
   { items: [{ id: 1 }, { id: 2 }] }  // Object array
   ```

   **Solution**: Fix schema:
   ```dygram
   items: {
       type: "array",
       items: {
           type: "object",
           properties: {
               id: { type: "number" }
           }
       }
   }
   ```

### Debugging Schema Validation

1. **Check generated code**
   ```bash
   dygram show-code example.dygram MyTask
   ```

2. **Test with simple schema first**
   ```dygram
   schema: {
       input: { type: "object" },  // Accept any object
       output: { type: "object" }   // Accept any object
   }
   ```

3. **Enable verbose logging**
   ```bash
   dygram execute example.dygram --verbose
   ```

## Runtime Errors in Generated Code

### Symptom

Generated code throws errors during execution.

### Common Errors

1. **Undefined property access**
   ```typescript
   // Generated code
   export async function MyTask(input: any): Promise<any> {
       return input.data.value;  // Error if data or value undefined
   }
   ```

   **Solution**: Add null checks or regenerate with better prompt:
   ```dygram
   prompt: "Extract value from input.data, handle missing data gracefully by returning null";
   ```

2. **Type errors**
   ```typescript
   export async function Calculate(input: { value: string }): Promise<number> {
       return input.value * 2;  // Error: can't multiply string
   }
   ```

   **Solution**: Fix schema or regenerate:
   ```dygram
   schema: {
       input: {
           type: "object",
           properties: {
               value: { type: "number" }  // Should be number, not string
           }
       }
   }
   ```

3. **Missing dependencies**
   ```typescript
   import { someLib } from 'external-package';  // Error if not installed
   ```

   **Solution**: Install dependencies or regenerate with different approach:
   ```dygram
   prompt: "Implement using only standard Node.js libraries, no external dependencies";
   ```

### Resolution

1. **Check error message**
   ```bash
   dygram execute example.dygram --verbose
   ```

2. **Regenerate with error context**
   ```bash
   dygram regenerate example.dygram MyTask --reason "TypeError: Cannot read property 'value' of undefined"
   ```

3. **Manually fix and test**
   - Edit `example.MyTask.ts`
   - Test locally
   - Commit fix

## LLM Fallback Always Triggered

### Symptom

Generated code exists but LLM is always used instead.

### Possible Causes

1. **Code file not found**

   **Check**: Verify file exists:
   ```bash
   ls example.MyTask.ts
   ```

   **Solution**: Ensure file is in same directory as .dygram file:
   ```
   example.dygram
   example.MyTask.ts  # Must be here
   ```

2. **Execution throws error**

   **Check**: Test code manually:
   ```bash
   node -e "import('./example.MyTask.ts').then(m => console.log(m.MyTask({})))"
   ```

3. **Schema validation failing**

   **Check**: Run with verbose logging to see validation errors:
   ```bash
   dygram execute example.dygram --verbose
   ```

4. **Low confidence score**

   Some generated code might return low confidence, triggering fallback.

   **Solution**: Check confidence calculation in generated code.

## File Permission Errors

### Symptom

Error: "EACCES: permission denied" when saving generated code.

### Solution

1. **Check directory permissions**
   ```bash
   ls -la
   chmod 755 .  # Make directory writable
   ```

2. **Check file permissions**
   ```bash
   chmod 644 example.MyTask.ts
   ```

3. **Run with appropriate permissions**
   ```bash
   # Don't run as root unless necessary
   dygram execute example.dygram
   ```

## Module Loading Errors

### Symptom

Error: "Cannot find module" or "ERR_MODULE_NOT_FOUND"

### Possible Causes

1. **Incorrect file path**

   **Solution**: Verify code file location:
   ```bash
   dygram code-status example.dygram
   ```

2. **TypeScript not compiled**

   For projects using build step:
   ```bash
   npm run build  # Compile TypeScript
   ```

3. **ESM/CommonJS mismatch**

   **Solution**: Ensure generated code uses same module system:
   - If project uses ESM: generated code should use `export`
   - If project uses CommonJS: generated code should use `module.exports`

## TypeScript Compilation Errors

### Symptom

Generated `.ts` file has TypeScript errors.

### Common Issues

1. **Type inference errors**
   ```typescript
   export async function MyTask(input: any): Promise<any> {  // Weak typing
       return input.value;
   }
   ```

   **Solution**: Regenerate with better schema:
   ```dygram
   schema: {
       input: {
           type: "object",
           properties: {
               value: { type: "string" }
           }
       },
       output: { type: "string" }
   }
   ```

   Resulting code:
   ```typescript
   export async function MyTask(input: { value: string }): Promise<string> {
       return input.value;
   }
   ```

2. **Missing types**

   **Solution**: Add type definitions:
   ```bash
   npm install --save-dev @types/node
   ```

## Regeneration Loops

### Symptom

Code keeps regenerating on every execution.

### Possible Causes

1. **Schema too strict**

   Generated code can't satisfy schema requirements.

   **Solution**: Relax schema or improve prompt:
   ```dygram
   schema: {
       output: {
           type: "object"
           // Remove overly strict requirements
       }
   }
   ```

2. **Non-deterministic errors**

   Code works sometimes but fails other times.

   **Solution**: Make code more robust:
   ```dygram
   prompt: "Implement function with error handling, input validation, and fallback values";
   ```

3. **External dependencies failing**

   Code depends on external API/service that's unreliable.

   **Solution**: Add retry logic or remove dependency:
   ```dygram
   prompt: "Implement using local computation only, no external API calls";
   ```

## Getting Help

### Check Logs

```bash
# Verbose execution logs
dygram execute example.dygram --verbose

# Check generated code
dygram show-code example.dygram MyTask

# Check code status
dygram code-status example.dygram
```

### Inspect Generated Code

```bash
# View code
cat example.MyTask.ts

# Test code manually
node --experimental-modules -e "
  import('./example.MyTask.ts').then(module => {
    const result = await module.MyTask({ test: 'input' });
    console.log(result);
  })
"
```

### Manual Regeneration

```bash
# Regenerate with specific reason
dygram regenerate example.dygram MyTask --reason "Fix type error in output schema"

# Use different model
dygram regenerate example.dygram MyTask --model claude-3-5-sonnet-20241022
```

### Report Issues

If you encounter bugs or unexpected behavior:

1. Collect diagnostic info:
   - DyGram version: `dygram --version`
   - Node version: `node --version`
   - Error messages and logs
   - Generated code that's failing

2. Create minimal reproduction:
   - Simplest `.dygram` file that shows the issue
   - Expected vs actual behavior

3. Report at: https://github.com/anthropics/dygram/issues
