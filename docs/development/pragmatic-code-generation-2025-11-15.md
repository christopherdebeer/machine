# Pragmatic Code Generation Design

**Date**: 2025-11-15
**Philosophy**: Simple, practical, no over-engineering
**Status**: Implementation-ready design

---

## Design Principles

1. **Simple trigger** - `@code` annotation generates code immediately
2. **Code alongside source** - No hidden `.dygram/` folders
3. **Use existing syntax** - External references (`#identifier`) already in grammar
4. **Regenerate on failure** - Schema mismatch or error → regenerate
5. **Version control friendly** - Code is visible, diffable, committable
6. **No manual evolution** - System decides when to regenerate

---

## How It Works

### Step 1: Developer Adds @code Annotation

```dygram
// example.dygram
machine "User Validator"

Task validate @code {
    schema: {
        input: {
            type: "object";
            required: ["email", "age"];
        };
        output: {
            type: "object";
            required: ["valid", "errors"];
        };
    };
    prompt: "Validate user registration data";
}
```

### Step 2: First Execution Generates Code

**On first execution**:
1. Executor sees `@code` annotation
2. No external reference exists yet → trigger LLM code generation
3. LLM generates TypeScript based on prompt + schema
4. Code saved as `example.validate.ts` (alongside `example.dygram`)
5. .dygram file updated with external reference

**After first execution**:
```dygram
Task validate @code {
    schema: {
        input: {
            type: "object";
            required: ["email", "age"];
        };
        output: {
            type: "object";
            required: ["valid", "errors"];
        };
    };
    prompt: "Validate user registration data";
    code: #validate;  // Auto-added external reference
}
```

**Generated file** (`example.validate.ts`):
```typescript
/**
 * Generated code for task: validate
 * Generated: 2025-11-15T10:30:00Z
 * Prompt: "Validate user registration data"
 */

export interface ValidationInput {
    email: string;
    age: number;
}

export interface ValidationOutput {
    valid: boolean;
    errors: string[];
}

export async function execute(
    input: ValidationInput
): Promise<ValidationOutput> {
    const errors: string[] = [];

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!input.email || !emailRegex.test(input.email)) {
        errors.push("Invalid email format");
    }

    // Age validation
    if (typeof input.age !== 'number' || input.age < 18) {
        errors.push("Must be 18 or older");
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
```

### Step 3: Execution Uses Generated Code

**Execution flow**:
```
Task execution requested
    ↓
Has @code annotation?
    Yes ↓
        ↓
External reference exists? (code: #validate)
    Yes ↓
        ↓
Load TypeScript module (example.validate.ts)
    ↓
Validate input against schema
    ↓
    ├─ Schema valid → Execute generated code
    │                 ↓
    │                 Success? → Return result ✅
    │                 Error?   → Regenerate code ⚠️
    │
    └─ Schema invalid → Regenerate code ⚠️
```

### Step 4: Regeneration on Failure

**Triggers for regeneration**:
1. Schema validation fails on input
2. Schema validation fails on output
3. Generated code throws exception
4. Developer deletes .ts file (forces regeneration)

**Regeneration process**:
```typescript
async regenerateCode(task: TaskNode, error: Error | null, schemaErrors: string[] | null) {
    const prompt = `You previously generated code for task "${task.name}".

Original prompt: ${task.prompt}

Input schema:
${JSON.stringify(task.schema.input, null, 2)}

Output schema:
${JSON.stringify(task.schema.output, null, 2)}

The code encountered an issue:
${error ? `Runtime error: ${error.message}\n${error.stack}` : ''}
${schemaErrors ? `Schema validation errors:\n${schemaErrors.join('\n')}` : ''}

Previous code:
\`\`\`typescript
${await this.loadCode(task.code)}
\`\`\`

Generate improved TypeScript code that fixes this issue.

Requirements:
- Export async function execute(input): Promise<output>
- Match input/output schemas exactly
- Handle edge cases defensively
- Use TypeScript types from schemas
- Include JSDoc comments

Return ONLY the TypeScript code.`;

    const newCode = await this.llmClient.generateCode(prompt);

    // Save with timestamp comment
    const codeWithMetadata = `/**
 * Regenerated: ${new Date().toISOString()}
 * Reason: ${error?.message || schemaErrors?.join(', ') || 'Manual regeneration'}
 */

${newCode}`;

    await this.saveCode(task.name, codeWithMetadata);
}
```

---

## File Organization

### Simple Pattern: Code Alongside Source

```
project/
├── example.dygram          # Source definition
├── example.validate.ts     # Generated code for "validate" task
├── example.process.ts      # Generated code for "process" task
└── example.transform.ts    # Generated code for "transform" task
```

**Naming convention**: `<dygram-filename>.<task-name>.ts`

### Benefits

✅ **Visible** - Code is right there, not hidden
✅ **Diffable** - Git shows changes to generated code
✅ **Editable** - Developer can manually refine if needed
✅ **Committable** - Code checked into version control
✅ **Reviewable** - Code reviews see what LLM generated
✅ **Debuggable** - Stack traces point to actual .ts files

### Alternative: Subdirectory (If Many Tasks)

```
project/
├── example.dygram
└── example/
    ├── validate.ts
    ├── process.ts
    └── transform.ts
```

**Naming convention**: `<dygram-filename>/<task-name>.ts`

---

## External Reference Syntax

### Grammar Support (Already Exists!)

**From machine.langium:32**:
```
terminal EXTID: /#([A-Za-z0-9_][A-Za-z0-9_]*)/;
```

**Already supported in attributes**:
```
PrimitiveValue:
    value=(EXTID|STRING|ID|NUMBER)
;
```

### Usage in DyGram

**External reference**:
```dygram
Task validate @code {
    code: #validate;  // References example.validate.ts
    // ...
}
```

**Resolution**:
- Reference `#validate` in file `example.dygram`
- Resolves to `example.validate.ts`
- If multiple .dygram files, use qualified: `#example.validate`

---

## Implementation Plan

### Phase 1: Basic Code Generation (Week 1)

**Tasks**:
- [ ] Detect `@code` annotation
- [ ] Generate code on first execution (if no external reference)
- [ ] Save code as `<filename>.<taskname>.ts`
- [ ] Auto-add `code: #taskname;` to .dygram AST
- [ ] Load and execute generated code
- [ ] Basic error handling → LLM fallback

**Deliverable**: Tasks with `@code` generate TypeScript on first run

### Phase 2: Schema Integration (Week 2)

**Tasks**:
- [ ] Schema validation before code execution
- [ ] Schema validation after code execution
- [ ] Schema → TypeScript type generation
- [ ] Schema mismatch → trigger regeneration
- [ ] Include schemas in code generation prompt

**Deliverable**: Generated code respects schemas, regenerates on violations

### Phase 3: Regeneration (Week 3)

**Tasks**:
- [ ] Detect runtime errors in generated code
- [ ] Include error details in regeneration prompt
- [ ] Include previous code in regeneration prompt
- [ ] Preserve code comments on regeneration
- [ ] CLI command: `dygram regenerate example.dygram validate`

**Deliverable**: Code self-corrects on errors

### Phase 4: Developer Experience (Week 4)

**Tasks**:
- [ ] CLI: `dygram code-status example.dygram` (show which tasks have code)
- [ ] CLI: `dygram generate-code example.dygram validate` (manual trigger)
- [ ] Playground: Show generated code in UI
- [ ] Playground: "Regenerate" button per task
- [ ] Warning if .ts file manually edited (offer to preserve or regenerate)

**Deliverable**: Great developer experience

---

## Code Generation Prompt Template

### Initial Generation

```typescript
const INITIAL_CODE_GEN_PROMPT = `Generate TypeScript code for a task.

Task name: ${taskName}
Description: ${prompt}

${schema ? `Input schema:
${JSON.stringify(schema.input, null, 2)}

Output schema:
${JSON.stringify(schema.output, null, 2)}
` : 'No schema provided.'}

Generate a TypeScript module with:

1. Type interfaces matching the schemas (if provided)
2. An exported async function: execute(input): Promise<output>
3. Proper error handling
4. Defensive input validation
5. Clear, maintainable code
6. JSDoc comments

Example structure:

\`\`\`typescript
export interface Input {
    // Generated from input schema
}

export interface Output {
    // Generated from output schema
}

/**
 * ${prompt}
 */
export async function execute(input: Input): Promise<Output> {
    // Implementation here
    return result;
}
\`\`\`

Return ONLY the TypeScript code, no markdown formatting.`;
```

### Regeneration Prompt

```typescript
const REGENERATION_PROMPT = `Improve TypeScript code that encountered an error.

Task: ${taskName}
Original prompt: ${prompt}

${schema ? `Schemas:
Input: ${JSON.stringify(schema.input, null, 2)}
Output: ${JSON.stringify(schema.output, null, 2)}
` : ''}

Current code:
\`\`\`typescript
${currentCode}
\`\`\`

Issue encountered:
${errorMessage}

${failedInput ? `Input that triggered the error:
${JSON.stringify(failedInput, null, 2)}
` : ''}

Generate improved code that:
1. Fixes the identified issue
2. Maintains existing functionality
3. Handles edge cases better
4. Still matches the schemas

Return ONLY the improved TypeScript code.`;
```

---

## Execution Engine Changes

### Modified Task Execution

**In base-executor.ts or rails-executor.ts**:

```typescript
async executeTask(task: TaskNode, input: any): Promise<any> {
    // Check for @code annotation
    const hasCodeAnnotation = task.annotations?.some(a => a.name === 'code');

    if (!hasCodeAnnotation) {
        // Normal LLM execution
        return await this.executeLLM(task, input);
    }

    // Has @code annotation - check for external reference
    const codeRef = task.attributes?.find(a => a.name === 'code');

    if (!codeRef || !codeRef.value.startsWith('#')) {
        // First execution - generate code
        await this.generateInitialCode(task);
        // Now execute LLM as fallback (code will be used next time)
        return await this.executeLLM(task, input);
    }

    // Has generated code - try to execute it
    try {
        const result = await this.executeGeneratedCode(task, input);
        return result;
    } catch (error) {
        // Code failed - regenerate and fall back to LLM
        console.warn(`Generated code failed for ${task.name}, regenerating...`);
        await this.regenerateCode(task, error);
        return await this.executeLLM(task, input);
    }
}

async executeGeneratedCode(task: TaskNode, input: any): Promise<any> {
    const codeRef = task.attributes.find(a => a.name === 'code')?.value;
    const modulePath = this.resolveCodePath(codeRef, task);

    // Validate input schema if present
    if (task.schema?.input) {
        const validation = this.validateSchema(input, task.schema.input);
        if (!validation.valid) {
            throw new Error(`Input schema validation failed: ${validation.errors.join(', ')}`);
        }
    }

    // Load and execute generated code
    const module = await import(modulePath);
    const output = await module.execute(input);

    // Validate output schema if present
    if (task.schema?.output) {
        const validation = this.validateSchema(output, task.schema.output);
        if (!validation.valid) {
            throw new Error(`Output schema validation failed: ${validation.errors.join(', ')}`);
        }
    }

    return output;
}

resolveCodePath(codeRef: string, task: TaskNode): string {
    // #validate → example.validate.ts
    const taskName = codeRef.substring(1); // Remove #
    const dygramFile = this.getCurrentDygramFile();
    const baseName = path.basename(dygramFile, '.dygram');

    // Try <filename>.<taskname>.ts
    const codePath = path.join(
        path.dirname(dygramFile),
        `${baseName}.${taskName}.ts`
    );

    if (fs.existsSync(codePath)) {
        return codePath;
    }

    // Try <filename>/<taskname>.ts
    const altPath = path.join(
        path.dirname(dygramFile),
        baseName,
        `${taskName}.ts`
    );

    if (fs.existsSync(altPath)) {
        return altPath;
    }

    throw new Error(`Generated code not found for ${codeRef}`);
}

async generateInitialCode(task: TaskNode): Promise<void> {
    const prompt = this.buildInitialCodePrompt(task);
    const code = await this.llmClient.generateCode(prompt);

    // Save code file
    const codePath = this.getCodePath(task);
    await fs.promises.writeFile(codePath, code, 'utf-8');

    // Update .dygram file with external reference
    await this.addCodeReference(task);

    console.log(`✨ Generated code: ${codePath}`);
}

async addCodeReference(task: TaskNode): Promise<void> {
    // Parse .dygram file
    const dygramContent = await fs.promises.readFile(this.currentFile, 'utf-8');

    // Find task in AST and add code: #taskname; attribute
    // This requires AST manipulation - we'll need to:
    // 1. Parse the file
    // 2. Find the task node
    // 3. Add attribute if not present
    // 4. Serialize back to text

    // For now, append to task block (simple approach)
    const taskPattern = new RegExp(
        `(Task ${task.name}[^{]*{[^}]*?)(\n})`,
        's'
    );

    const updated = dygramContent.replace(
        taskPattern,
        `$1\n    code: #${task.name};$2`
    );

    await fs.promises.writeFile(this.currentFile, updated, 'utf-8');
}
```

---

## Example Workflow

### Developer Creates Task

```dygram
// users.dygram
machine "User Management"

Task validateEmail @code {
    schema: {
        input: { type: "string"; format: "email" };
        output: { type: "boolean" };
    };
    prompt: "Validate email address format";
}
```

### First Execution

```bash
$ dygram execute users.dygram
✨ Generated code: users.validateEmail.ts
📝 Added code reference to users.dygram
✅ Execution complete (used LLM for first run)
```

**Generated file** (`users.validateEmail.ts`):
```typescript
/**
 * Generated: 2025-11-15T14:30:00Z
 * Task: validateEmail
 */

/**
 * Validate email address format
 */
export async function execute(input: string): Promise<boolean> {
    if (typeof input !== 'string') {
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(input);
}
```

**Updated .dygram** (auto-modified):
```dygram
Task validateEmail @code {
    schema: {
        input: { type: "string"; format: "email" };
        output: { type: "boolean" };
    };
    prompt: "Validate email address format";
    code: #validateEmail;  // Auto-added
}
```

### Second Execution (Uses Generated Code)

```bash
$ dygram execute users.dygram --input '{"email":"test@example.com"}'
✅ Execution complete (used generated code)
Time: 15ms (vs 1200ms with LLM)
```

### Error Triggers Regeneration

```bash
$ dygram execute users.dygram --input '{"email":null}'
⚠️  Generated code failed: TypeError: Cannot read property 'test' of null
🔄 Regenerating code...
✨ Updated code: users.validateEmail.ts
✅ Execution complete (used LLM fallback)
```

**Regenerated code** (now handles null):
```typescript
/**
 * Regenerated: 2025-11-15T14:35:00Z
 * Reason: TypeError: Cannot read property 'test' of null
 */

export async function execute(input: string): Promise<boolean> {
    // Added null/undefined check
    if (!input || typeof input !== 'string') {
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(input);
}
```

---

## Benefits of This Approach

### For Developers

✅ **Transparent** - Code is visible, not hidden
✅ **Simple** - Just add `@code` annotation
✅ **Fast** - Generated code runs in milliseconds
✅ **Safe** - Schema validation prevents bad inputs/outputs
✅ **Self-correcting** - Errors trigger regeneration
✅ **Version controlled** - Code committed alongside .dygram
✅ **Reviewable** - See what LLM generated in PRs

### For DyGram

✅ **No over-engineering** - Simple, practical approach
✅ **Uses existing syntax** - External references already work
✅ **Progressive enhancement** - Tasks without @code still work
✅ **Incremental adoption** - Add @code to tasks one at a time
✅ **No hidden state** - Everything visible in filesystem

### vs Over-Engineered Approach

| Aspect | Over-Engineered | Pragmatic (@code) |
|--------|----------------|-------------------|
| **Trigger** | Track 10 executions | First execution |
| **Storage** | Hidden .dygram/ folder | Alongside source |
| **Versioning** | Complex metadata JSON | Git handles it |
| **Evolution stages** | llm_only, hybrid, etc. | Just works |
| **Manual config** | evolution: { stage, threshold } | Just @code |
| **Developer mental model** | Complex state machine | "Generate → Use → Regenerate" |

---

## Edge Cases and Considerations

### 1. Manual Code Editing

**Scenario**: Developer manually edits generated code

**Detection**:
```typescript
// Add comment to generated code
/**
 * Generated: 2025-11-15T14:30:00Z
 * DO NOT EDIT - This file is auto-generated
 * To make changes, update the prompt in the .dygram file
 */
```

**Warning on regeneration**:
```bash
⚠️  Warning: users.validateEmail.ts appears to be manually edited
   Last regeneration: 2025-11-15T14:30:00Z
   File modified: 2025-11-16T10:00:00Z

Options:
  1. Regenerate (lose manual edits)
  2. Keep manual edits (disable auto-regeneration)
  3. Cancel

Your choice: _
```

### 2. Multiple .dygram Files

**Scenario**: Project has multiple .dygram files with same task names

**Solution**: Qualified references
```dygram
// users.dygram
Task validate @code {
    code: #users.validate;  // Qualified
}

// products.dygram
Task validate @code {
    code: #products.validate;  // Qualified
}
```

**Files**:
```
users.validate.ts
products.validate.ts
```

### 3. Code Dependencies

**Scenario**: Generated code needs shared utilities

**Solution**: Import from relative paths
```typescript
// users.validateEmail.ts
import { isValidDomain } from './utils/email-utils';

export async function execute(input: string): Promise<boolean> {
    if (!input) return false;

    const [local, domain] = input.split('@');
    return local && domain && isValidDomain(domain);
}
```

**LLM prompt includes**:
```
You can import utilities from './utils/' if needed for shared logic.
```

### 4. TypeScript Compilation

**Option 1**: Runtime TypeScript execution (ts-node)
```typescript
import { register } from 'ts-node';
register(); // Enable .ts import
const module = await import(codePath); // .ts file
```

**Option 2**: Compile to JavaScript
```bash
# In executor or CLI
$ tsc users.validateEmail.ts --outDir .
$ node users.validateEmail.js
```

**Recommendation**: Use ts-node for development, compile for production

---

## CLI Commands

### View Code Status

```bash
$ dygram code-status users.dygram

Task Code Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
validateEmail  ✅ Generated  users.validateEmail.ts
processUser    ⏳ Pending   (add @code to generate)
deleteUser     ⏳ Pending   (add @code to generate)
```

### Manual Code Generation

```bash
$ dygram generate-code users.dygram validateEmail
✨ Generated code: users.validateEmail.ts
```

### Force Regeneration

```bash
$ dygram regenerate users.dygram validateEmail
🔄 Regenerating code...
✨ Updated code: users.validateEmail.ts
```

### Show Generated Code

```bash
$ dygram show-code users.dygram validateEmail
# Displays users.validateEmail.ts contents
```

---

## Summary

### The Simple Model

1. **Add `@code`** → Task will generate code
2. **First execution** → LLM generates TypeScript, saves alongside .dygram
3. **Next executions** → Use generated code (fast!)
4. **On error/schema fail** → Regenerate code, retry
5. **Manual edits** → Warning before regeneration

### Key Decisions

✅ **Code location**: Alongside .dygram files
✅ **Naming**: `<filename>.<taskname>.ts`
✅ **Reference**: External refs (`#taskname`)
✅ **Trigger**: `@code` annotation
✅ **Timing**: First execution (not after N runs)
✅ **Regeneration**: On errors + schema mismatches
✅ **No stages**: Just works, no evolution tracking

### Implementation Priority

**Week 1**: Basic generation (@code → .ts file)
**Week 2**: Schema validation + regeneration
**Week 3**: CLI commands + developer experience
**Week 4**: Polish + documentation

---

**Status**: Ready for implementation
**Complexity**: Low (no over-engineering!)
**Value**: High (immediate code generation + fast execution)
