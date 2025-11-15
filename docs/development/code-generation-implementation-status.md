# Code Generation Implementation Status

**Date**: 2025-11-15
**Status**: Phase 1 Complete (Foundation)

---

## Summary

Implemented pragmatic code generation system using `@code` annotation and external references. This replaces the vestigial over-engineered evolution system.

---

## ✅ Phase 1 Complete: Foundation

### What Was Implemented

#### 1. **Code Generator** (`src/language/code-generation.ts`)

**New implementation** replaces old vestigial code:
- ✅ `CodeGenerator` class with LLM-based code generation
- ✅ Initial code generation from prompt + schema
- ✅ Code regeneration with error context
- ✅ Saves code alongside .dygram files as `<filename>.<taskname>.ts`
- ✅ External reference support (`#taskname`)
- ✅ Metadata headers in generated code
- ✅ Helper functions: `resolveCodePath`, `hasGeneratedCode`, `loadGeneratedCode`

**Key Features**:
```typescript
// Generate code
const generator = new CodeGenerator(llmClient);
const result = await generator.generateCode({
    taskName: 'validate',
    prompt: 'Validate email address',
    schema: { input: {...}, output: {...} },
    dygramFilePath: '/path/to/example.dygram'
});
// Saves to: /path/to/example.validate.ts
// Returns: { code, filePath, externalRef: '#validate' }

// Regenerate on error
await generator.regenerateCode({
    ...input,
    previousCode: oldCode,
    error: new Error('validation failed'),
    failedInput: { email: null }
});
```

#### 2. **Code Executor** (`src/language/code-executor.ts`)

**New module** handles execution of generated code:
- ✅ `CodeExecutor` class for managing code execution
- ✅ `@code` annotation detection
- ✅ External reference extraction
- ✅ Schema extraction and validation (JSON Schema via Ajv)
- ✅ TypeScript module loading (with ts-node support)
- ✅ Automatic code generation on first execution
- ✅ Error handling with regeneration
- ✅ LLM fallback on failures

**Key Features**:
```typescript
const executor = new CodeExecutor(llmClient);

// Check if task has @code
if (executor.hasCodeAnnotation(task)) {
    // Execute with automatic generation/regeneration
    const result = await executor.executeCodeTask(
        task,
        input,
        dygramFilePath,
        () => llmFallback() // Fallback function
    );

    if (result.usedGeneratedCode) {
        console.log('Used generated code! ⚡');
    } else {
        console.log('Used LLM fallback');
    }
}
```

#### 3. **Deprecation of Old System**

**Cleaned up vestigial code**:
- ✅ `task-evolution.ts` marked as deprecated
- ✅ Old `EvolutionaryExecutor` throws helpful error message
- ✅ Points users to new pragmatic approach

**Migration message**:
```
EvolutionaryExecutor is deprecated.
Use RailsExecutor with @code annotation instead.
See docs/development/pragmatic-code-generation-2025-11-15.md
```

---

## ⏳ Phase 2 Needed: Integration

### What Still Needs To Be Done

#### 1. **Integrate into RailsExecutor** (Priority: High)

**File**: `src/language/rails-executor.ts`

**Add to constructor**:
```typescript
import { CodeExecutor } from './code-executor.js';

export class RailsExecutor extends BaseExecutor {
    protected codeExecutor: CodeExecutor;

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        super(machineData, config);
        // ... existing initialization ...

        // Initialize code executor
        this.codeExecutor = new CodeExecutor(this.llmClient);
    }
}
```

**Add to task execution method**:
```typescript
protected async executeTaskNode(node: any, input: any): Promise<any> {
    // Check for @code annotation
    if (this.codeExecutor.hasCodeAnnotation(node)) {
        const result = await this.codeExecutor.executeCodeTask(
            node,
            input,
            this.currentDygramFile, // Need to track this
            async () => {
                // Fallback to normal LLM execution
                return await this.executeNormalTask(node, input);
            }
        );

        return result.output;
    }

    // Normal execution (no @code)
    return await this.executeNormalTask(node, input);
}
```

**Challenges**:
- Need to track current .dygram file path in executor
- Need to identify the task execution method in RailsExecutor
- May need to refactor to make task execution hookable

#### 2. **Auto-Add External Reference** (Priority: Medium)

**Problem**: After code generation, need to update .dygram file with `code: #taskname;`

**Current**: User must manually add the reference
**Desired**: Automatically add to .dygram file

**Implementation Options**:

**Option A**: AST manipulation (clean but complex)
```typescript
// Parse .dygram file
const ast = await parseDygramFile(dygramFilePath);

// Find task node
const taskNode = findNodeInAST(ast, taskName);

// Add attribute
taskNode.attributes.push({
    name: 'code',
    value: `#${taskName}`
});

// Serialize back
await writeDygramFile(dygramFilePath, ast);
```

**Option B**: Text manipulation (simple but fragile)
```typescript
// Read file
let content = await fs.readFile(dygramFilePath, 'utf-8');

// Find task block
const taskPattern = new RegExp(
    `(Task ${taskName}[^{]*\\{[^}]*?)(\\n})`,
    's'
);

// Insert attribute before closing brace
content = content.replace(
    taskPattern,
    `$1\n    code: #${taskName};$2`
);

// Write back
await fs.writeFile(dygramFilePath, content, 'utf-8');
```

**Recommendation**: Start with Option B for quick implementation, refactor to Option A later.

#### 3. **Track .dygram File Path** (Priority: High)

**Problem**: Executors need to know which .dygram file they're executing

**Solution**: Add to executor initialization
```typescript
export class RailsExecutor extends BaseExecutor {
    protected currentDygramFile: string;

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        super(machineData, config);
        this.currentDygramFile = config.dygramFilePath || '';
    }
}
```

**Update CLI** (`src/cli/index.ts` or similar):
```typescript
// When executing a .dygram file
const executor = new RailsExecutor(machineData, {
    dygramFilePath: resolvedFilePath,
    // ... other config
});
```

#### 4. **ts-node Setup** (Priority: Medium)

**Problem**: Generated .ts files need to be executable

**Solutions**:

**Option A**: ts-node registration (development)
```typescript
// At executor startup
import { register } from 'ts-node';
register({
    compilerOptions: {
        module: 'ESNext',
        target: 'ES2020'
    }
});
```

**Option B**: Compile to .js (production)
```bash
# Add to npm scripts
"compile-generated": "tsc example.*.ts --outDir ."
```

**Option C**: Hybrid
- Development: Use ts-node
- Production: Pre-compile generated code

**Recommendation**: Start with ts-node for development, add compilation later.

---

## 📋 Phase 3 Needed: CLI Commands

### Commands to Implement

#### 1. `dygram code-status <file.dygram>`

**Show which tasks have generated code**:
```bash
$ dygram code-status example.dygram

Task Code Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
validate      ✅ Generated    example.validate.ts
process       ⏳ Pending      (add @code to generate)
transform     ⏳ Pending      (add @code to generate)
```

#### 2. `dygram generate-code <file.dygram> <taskname>`

**Manually trigger code generation**:
```bash
$ dygram generate-code example.dygram validate
✨ Generated code: example.validate.ts
📝 Added code reference: code: #validate;
```

#### 3. `dygram regenerate <file.dygram> <taskname>`

**Force code regeneration**:
```bash
$ dygram regenerate example.dygram validate
🔄 Regenerating code...
✨ Updated code: example.validate.ts
```

#### 4. `dygram show-code <file.dygram> <taskname>`

**Display generated code**:
```bash
$ dygram show-code example.dygram validate
# Displays example.validate.ts contents
```

---

## 🧪 Phase 4 Needed: Tests

### Tests to Create

#### 1. Unit Tests for CodeGenerator
```typescript
describe('CodeGenerator', () => {
    it('should generate TypeScript code from prompt and schema');
    it('should save code to correct file path');
    it('should add metadata header');
    it('should regenerate code with error context');
});
```

#### 2. Unit Tests for CodeExecutor
```typescript
describe('CodeExecutor', () => {
    it('should detect @code annotation');
    it('should extract external reference');
    it('should validate input schema');
    it('should validate output schema');
    it('should execute generated code');
    it('should fall back to LLM on error');
    it('should regenerate code on schema mismatch');
});
```

#### 3. Integration Tests
```typescript
describe('Code Generation Integration', () => {
    it('should generate and execute code for task');
    it('should regenerate on runtime error');
    it('should regenerate on schema validation failure');
    it('should use LLM fallback when code fails');
});
```

#### 4. Update Existing Tests

**File**: `test/validating/evolution.test.ts`

**Current status**: Tests the old EvolutionaryExecutor
**Action needed**: Update to test new CodeExecutor or mark as deprecated

---

## 📝 Implementation Checklist

### Phase 1: Foundation ✅ COMPLETE
- [x] Implement CodeGenerator class
- [x] Implement CodeExecutor class
- [x] Deprecate old task-evolution.ts
- [x] Create implementation documentation

### Phase 2: Integration ⏳ TODO
- [ ] Add CodeExecutor to RailsExecutor
- [ ] Track .dygram file path in executor
- [ ] Implement auto-add external reference
- [ ] Set up ts-node for .ts execution

### Phase 3: CLI ⏳ TODO
- [ ] Implement `dygram code-status`
- [ ] Implement `dygram generate-code`
- [ ] Implement `dygram regenerate`
- [ ] Implement `dygram show-code`

### Phase 4: Tests ⏳ TODO
- [ ] CodeGenerator unit tests
- [ ] CodeExecutor unit tests
- [ ] Integration tests
- [ ] Update deprecated tests

### Phase 5: Documentation ⏳ TODO
- [ ] Add examples to docs/examples/
- [ ] Update README with @code usage
- [ ] Create migration guide from old system
- [ ] Add troubleshooting guide

---

## 🎯 Quick Start for Continuation

### To Complete Phase 2 (Integration):

1. **Find task execution in RailsExecutor**:
```bash
grep -n "executeTask" src/language/rails-executor.ts
```

2. **Add code executor initialization**:
```typescript
// In RailsExecutor constructor
this.codeExecutor = new CodeExecutor(this.llmClient);
```

3. **Wrap task execution**:
```typescript
// In task execution method
if (this.codeExecutor.hasCodeAnnotation(task)) {
    return await this.codeExecutor.executeCodeTask(...);
}
```

4. **Track file path**:
```typescript
// Add to config interface and constructor
this.currentDygramFile = config.dygramFilePath || '';
```

### To Test Phase 1:

```typescript
import { CodeGenerator } from './src/language/code-generation.js';
import { CodeExecutor } from './src/language/code-executor.js';

// Create mock LLM client
const mockLLM = {
    generateCode: async (prompt) => {
        return `export async function execute(input: any) {
            return { result: 'mocked' };
        }`;
    }
};

// Test generator
const generator = new CodeGenerator(mockLLM);
const result = await generator.generateCode({
    taskName: 'test',
    prompt: 'Test task',
    schema: {
        input: { type: 'string' },
        output: { type: 'object' }
    },
    dygramFilePath: './test.dygram'
});

console.log('Generated:', result.filePath);
// Should create: ./test.test.ts
```

---

## 🚀 Summary

**Phase 1 Complete**:
- ✅ Clean, pragmatic code generation infrastructure
- ✅ Schema validation support
- ✅ Automatic regeneration on errors
- ✅ External reference system
- ✅ Old system deprecated

**Next Steps**:
1. Integrate into RailsExecutor (2-3 hours)
2. Add CLI commands (2-3 hours)
3. Write tests (3-4 hours)
4. Create examples (1-2 hours)

**Total estimated time to complete**: 8-12 hours

---

**Status**: Foundation is solid and ready for integration!
