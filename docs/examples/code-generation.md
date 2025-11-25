# Code Generation: From Prompts to TypeScript

DyGram can automatically generate TypeScript code for tasks using the `@code` annotation. Generated code lives alongside your `.dygram` files and is referenced externally, enabling fast execution while maintaining declarative workflow definitions.

## Table of Contents

- [Overview](#overview)
- [The @code Annotation](#the-code-annotation)
- [Generation Process](#generation-process)
- [Code Structure](#code-structure)
- [Schema Validation](#schema-validation)
- [Regeneration](#regeneration)
- [External References](#external-references)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

Code generation in DyGram:

1. **Triggered** by `@code` annotation on tasks
2. **Generates** TypeScript functions from task prompts
3. **Validates** against input/output schemas
4. **Regenerates** on errors or schema mismatches
5. **References** external .ts files from .dygram files

**Benefits:**
- Performance: Near-instant execution vs LLM latency
- Cost: No per-execution LLM charges
- Determinism: Consistent behavior for production
- Type Safety: Full TypeScript type checking

## The @code Annotation

The `@code` annotation triggers immediate code generation.

### Basic Usage

```dygram examples/code-generation/basic-code-annotation.dy
machine "Simple Code Generation"

Task calculateTax "Calculate sales tax" @code {
  prompt: "Calculate sales tax. Input: { amount: number, rate: number }. Output: { tax: number, total: number }. Formula: tax = amount * rate, total = amount + tax."
  model: "claude-3-5-sonnet-20241022"
}

start -> calculateTax -> end
```

When this machine is first parsed, DyGram:
1. Detects `@code` annotation
2. Sends prompt to LLM
3. Generates TypeScript code
4. Saves to `./generated/calculateTax.ts`
5. Updates task with `code_path` reference

### With Schema

```dygram examples/code-generation/code-with-schema.dy
machine "Schema-Validated Generation"

Task processOrder "Process customer order" @code {
  prompt: "Validate order data, calculate totals, apply discounts. Input: {order_id: string, items: Array<{id, price, quantity}>, discount_code?: string}. Output: {order_id, subtotal, discount, tax, total, valid: boolean}"
  model: "claude-3-5-sonnet-20241022"
}

start -> processOrder -> end
```

Generated code will be validated against these schemas.

## Generation Process

### Step 1: Annotation Detection

Parser detects `@code` annotation during machine loading.

### Step 2: Prompt Construction

DyGram builds a generation prompt including:
- Task name and description
- Input/output schemas (if provided)
- Task prompt content
- TypeScript requirements

### Step 3: LLM Generation

Sends prompt to configured model (e.g., `claude-3-5-sonnet-20241022`).

### Step 4: Code Validation

Generated code is:
- Syntax checked (TypeScript compilation)
- Schema validated (if schemas provided)
- Structure verified (required exports present)

### Step 5: File Creation

Code saved to `./generated/{taskName}.ts` with:
- `execute()` function (required)
- `getConfidence()` function (optional, for hybrid execution)
- Type definitions
- Error handling

### Step 6: Reference Update

Task updated with:
```typescript
code_path: "./generated/taskName.ts"
```

## Code Structure

Generated code follows a standard structure:

```typescript examples/code-generation/generated-structure.ts
/**
 * Generated code for task: exampleTask
 * Generated: 2025-11-24T23:00:00Z
 */

export interface TaskInput {
  // Input schema types
  data: string;
  options?: Record<string, any>;
}

export interface TaskOutput {
  // Output schema types
  result: string;
  metadata: {
    processed: boolean;
    timestamp: number;
  };
}

export interface TaskExecutionResult {
  output: TaskOutput;
  confidence: number;
  metadata: {
    execution_time_ms: number;
    used_llm: boolean;
  };
}

/**
 * Get confidence score for whether this code can handle the input
 * @returns 0.0 to 1.0, where 1.0 = high confidence
 */
export function getConfidence(input: TaskInput): number {
  // Analyze input and return confidence
  // Used in hybrid and code_first evolution stages
  if (!input.data || input.data.length === 0) {
    return 0.3; // Low confidence for empty input
  }
  return 0.9; // High confidence for normal input
}

/**
 * Execute the task
 */
export async function execute(
  input: TaskInput,
  context: any
): Promise<TaskExecutionResult> {
  const startTime = Date.now();

  try {
    // Task implementation
    const result: TaskOutput = {
      result: `Processed: ${input.data}`,
      metadata: {
        processed: true,
        timestamp: Date.now()
      }
    };

    return {
      output: result,
      confidence: 1.0,
      metadata: {
        execution_time_ms: Date.now() - startTime,
        used_llm: false
      }
    };
  } catch (error) {
    // Error handling
    throw new Error(`Task execution failed: ${error}`);
  }
}

// Default export
export default { execute, getConfidence };
```

### Required Exports

All generated code must export:

1. **`execute()` function** - Main task logic
2. **`getConfidence()` function** (optional) - For hybrid execution
3. **Type definitions** - Input/Output interfaces
4. **Default export** - Object with execute and getConfidence

## Schema Validation

### Defining Schemas

Schemas ensure type safety and guide code generation:

```dygram examples/code-generation/schema-definition.dy
machine "Schema-Driven Generation"

Task validateUser "User validation" @code {
  prompt: "Validate user data against business rules. Input: {username: string, email: string, age: number, role: 'admin'|'user'|'guest'}. Output: {valid: boolean, errors: string[], sanitized: {username, email, age, role}}"
}

start -> validateUser -> end
```

### Schema Format

Schemas use TypeScript-like syntax:

```typescript
input_schema: {
  // Primitives
  name: "string"
  age: "number"
  active: "boolean"

  // Optional (add ?)
  nickname: "string?"

  // Arrays
  tags: "Array<string>"
  items: "Array<{id: number, name: string}>"

  // Objects
  address: "{street: string, city: string, zip: string}"

  // Complex types
  metadata: "Record<string, any>"
  data: "any"
}
```

### Runtime Validation

Generated code includes runtime validation:

```typescript examples/code-generation/runtime-validation.ts
export function execute(input: TaskInput, context: any): Promise<TaskExecutionResult> {
  // Validate input schema
  if (typeof input.username !== 'string') {
    throw new Error('Invalid input: username must be string');
  }
  if (typeof input.age !== 'number') {
    throw new Error('Invalid input: age must be number');
  }

  // Execute task logic
  // ...

  // Validate output schema
  const output: TaskOutput = {
    valid: true,
    errors: [],
    sanitized: { /* ... */ }
  };

  if (typeof output.valid !== 'boolean') {
    throw new Error('Invalid output: valid must be boolean');
  }

  return {
    output,
    confidence: 1.0,
    metadata: { execution_time_ms: 0, used_llm: false }
  };
}
```

## Regeneration

Code is automatically regenerated when:

1. **Execution errors** occur
2. **Schema mismatches** are detected
3. **Manual trigger** is issued

### Error-Triggered Regeneration

```dygram examples/code-generation/error-regeneration.dy
machine "Self-Healing Code"

Context CodeHealth {
  error_count: 0
  last_error: ""
}

Task robustProcessor "Self-repairing processor" @code {
  prompt: "Process data robustly"
  code_path: "./generated/robustProcessor.ts"
}

// If robustProcessor fails:
// 1. Error details captured in CodeHealth.last_error
// 2. CodeHealth.error_count incremented
// 3. If error_count > 3, trigger regeneration with error context
// 4. New code incorporates error handling

start -> robustProcessor -> end
```

### Schema-Triggered Regeneration

When task schemas change, code is automatically regenerated:

```dygram examples/code-generation/schema-regeneration.dy
machine "Schema Evolution"

// Initial implementation with basic schema
Task dataProcessor "Adaptive processor" @code {
  prompt: "Process incoming data. Input: {data: string}. Output: {result: any}"
}

start -> dataProcessor -> end
```

After updating the schema in the source:

```typescript
// Updated schema (triggers regeneration)
input_schema: {
  data: "string"
  format: "string"  // New field - code regenerated to handle it
  options: "Record<string, any>?"  // Optional field added
}
```

### Manual Regeneration

```dygram examples/code-generation/manual-regeneration.dy
machine "Manual Code Refresh"

Task processor "Updatable processor" @code {
  prompt: "Process data with latest algorithms"
  code_path: "./generated/processor.ts"
}

Task triggerRegeneration "Force code update" {
  prompt: "Regenerate code for 'processor' task with updated prompt and improved error handling."
  model: "claude-3-5-sonnet-20241022"
}

processor -> triggerRegeneration
```

## External References

Generated code lives in external files referenced by `code_path`.

### File Organization

```
project/
├── workflows/
│   └── data-pipeline.dygram      # Your machine definition
├── generated/
│   ├── validateInput.ts          # Generated code
│   ├── processData.ts            # Generated code
│   └── formatOutput.ts           # Generated code
└── tests/
    └── generated/
        ├── validateInput.test.ts
        └── processData.test.ts
```

### Reference Format

```dygram examples/code-generation/external-reference.dy
machine "External Code References"

Task validate "Input validator" {
  prompt: "Validate input data"
  code_path: "./generated/validate.ts"  // External reference
  evolution_stage: "code_only"
}

Task process "Data processor" {
  prompt: "Process validated data"
  code_path: "./generated/process.ts"  // External reference
  evolution_stage: "code_first"
}

validate -> process
```

### Importing Generated Code

Generated code can be imported in tests or other TypeScript files:

```typescript examples/code-generation/import-generated.ts
import { execute as validateInput } from './generated/validateInput';
import { execute as processData } from './generated/processData';

// Use in tests
describe('Generated Code', () => {
  it('should validate input correctly', async () => {
    const result = await validateInput(
      { data: 'test' },
      {}
    );
    expect(result.output.valid).toBe(true);
  });
});

// Use in custom workflows
async function customPipeline(data: any) {
  const validated = await validateInput(data, {});
  if (validated.output.valid) {
    return await processData(validated.output, {});
  }
  throw new Error('Validation failed');
}
```

## Examples

### Complete Generation Workflow

```dygram examples/code-generation/complete-workflow.dy
machine "Full Code Generation Demo"

// Step 1: Initial generation with @code
Task parser "CSV parser" @code {
  prompt: "Parse CSV data into JSON. Handle quoted fields, escaped characters, and empty values. Input: {csv: string, delimiter?: string, headers?: string[]}. Output: {data: Record<string,string>[], row_count: number, headers: string[]}"
  model: "claude-3-5-sonnet-20241022"
}

// Step 2: Generated code referenced
Task validator "Data validator" {
  prompt: "Validate parsed data"
  code_path: "./generated/parser.ts"
  evolution_stage: "code_only"
}

// Step 3: Use in workflow
start -> parser -> validator -> end
```

### Progressive Enhancement

```dygram examples/code-generation/progressive-enhancement.dy
machine "Progressive Code Enhancement"

// Version 1: Basic implementation
Task processor_v1 "Simple processor" @code {
  prompt: "Basic data processing: trim whitespace, lowercase, remove special characters"
}

// Version 2: Enhanced with error handling
Task processor_v2 "Robust processor" @code {
  prompt: "Enhanced processing: trim, lowercase, remove special chars. Add: null handling, type coercion, detailed error messages"
}

// Version 3: Optimized for performance
Task processor_v3 "Optimized processor" @code {
  prompt: "Performance-optimized processing: use efficient string operations, batch processing for arrays, caching for repeated values"
}

start -> processor_v3 -> end
```

### Multi-Step Generation

```dygram examples/code-generation/multi-step-generation.dy
machine "Complex Code Generation"

Task step1 "Parse input" @code {
  prompt: "Parse and validate JSON input. Input: {raw: string}. Output: {parsed: any, valid: boolean}"
}

Task step2 "Transform data" @code {
  prompt: "Transform parsed data to target format. Input: {parsed: any}. Output: {transformed: any}"
}

Task step3 "Validate output" @code {
  prompt: "Validate transformed data against schema. Input: {transformed: any}. Output: {valid: boolean, errors: Array<string>}"
}

// All three tasks get generated code
// Each can be tested independently

step1 -> step2 -> step3
```

## Best Practices

### 1. Clear, Detailed Prompts

Provide comprehensive implementation details in prompts.

```dygram examples/code-generation/clear-prompt.dy
machine "Clear Prompt Example"

Task goodPrompt "Well-defined task" @code {
  prompt: "Calculate compound interest. Formula: A = P(1 + r/n)^(nt) where P=principal, r=annual rate, n=compounds per year, t=years. Input validation: all numbers must be positive, rate should be less than 1 (as decimal). Round result to 2 decimal places. Return both final amount and interest earned."
  model: "claude-3-5-sonnet-20241022"
}

Task badPrompt "Vague task" @code {
  prompt: "Calculate interest"  // Too vague - will produce poor code
  model: "claude-3-5-sonnet-20241022"
}

start -> goodPrompt -> end
```

### 2. Always Define Schemas

Schemas guide generation and enable validation.

```dygram examples/code-generation/define-schemas.dy
machine "Schema Best Practice"

Task withSchema "Type-safe task" @code {
  prompt: "Process user registration. Input: {username: string, email: string, password: string, age: number}. Output: {user_id: string, created: boolean, errors: string[]}"
}

start -> withSchema -> end
```

### 3. Test Generated Code

Always test generated code before production use.

```dygram examples/code-generation/test-generated.dy
machine "Tested Generation"

Task implementation "Core logic" @code {
  prompt: "Implement business logic"
}

Task testSuite "Validate implementation" {
  prompt: "Run comprehensive tests on generated code: unit tests, integration tests, edge cases. Report results."
  model: "claude-3-5-sonnet-20241022"
}

Task approveOrRegenerate "Quality gate" {
  prompt: "If tests pass, approve for production. If tests fail, regenerate code with test failure information."
}

implementation -> testSuite -> approveOrRegenerate
```

### 4. Version Generated Code

Track generated code versions for rollback.

```dygram examples/code-generation/version-code.dy
machine "Versioned Code Generation"

Context CodeVersions {
  current: "v1.0"
  history: []
}

Task generateWithVersion "Versioned generation" @code {
  prompt: "Before generating, record current version in CodeVersions.history. Increment CodeVersions.current. Save code to ./generated/{taskName}_v{version}.ts"
  model: "claude-3-5-sonnet-20241022"
}

start -> generateWithVersion -> end
```

### 5. Handle Edge Cases in Prompts

Include edge case handling in generation prompts.

```dygram examples/code-generation/edge-cases.dy
machine "Edge Case Handling"

Task robustParser "Comprehensive parser" @code {
  prompt: "Parse JSON with robust error handling. Edge cases: malformed JSON (return error), empty string (return null), very large objects (stream parsing), circular references (detect and break), special characters (proper escaping). Include detailed error messages for each case."
  model: "claude-3-5-sonnet-20241022"
}

start -> robustParser -> end
```

## Summary

Code generation in DyGram:

1. **Triggered by @code annotation** - Automatic generation from prompts
2. **Schema-validated** - Input/output schemas ensure type safety
3. **Self-healing** - Regenerates on errors or schema changes
4. **External references** - Code lives in separate .ts files
5. **Production-ready** - Full TypeScript, tested, versioned

**Generation Flow:**
1. Annotate task with @code
2. Provide detailed prompt and schemas
3. DyGram generates TypeScript code
4. Code saved to ./generated/
5. Task references code via code_path
6. Execute with near-instant performance

Use code generation to optimize high-frequency tasks while maintaining declarative workflow definitions.
