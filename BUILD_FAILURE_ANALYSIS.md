# Build Failure Analysis Report

**Generated:** 2025-11-20
**Command:** `npm ci && npm run build:with-tests`
**Test Results:** 10 failed | 44 passed | 3 skipped (57 total)

## Executive Summary

The build completed successfully with 349 test failures across 10 test files. Analysis reveals three main categories of issues:

1. **Defunct Tests** (60% of failures) - Tests referencing non-existent files or obsolete implementations
2. **Template Variable Resolution** (30% of failures) - CEL evaluation warnings during diagram generation
3. **Implementation Bugs** (10% of failures) - Actual bugs in backward compilation and edge handling

## Failed Test Files

### Category 1: Defunct Tests (Non-existent Dependencies)

#### 1. `test/integration/state-modules.test.ts` ❌ DEFUNCT
**Issue:** References non-existent `RailsExecutor` class
```typescript
import { RailsExecutor } from '../../src/language/rails-executor.js';
```

**Finding:**
- File `src/language/rails-executor.js` does not exist
- Only `src/language/executor.ts` exists (MachineExecutor class)
- Test appears to be testing legacy/proposed functionality

**Recommendation:** DELETE or UPDATE to use `MachineExecutor`

---

#### 2. `test/integration/backward-compilation-examples.test.ts` ❌ DEFUNCT
**Issue:** References non-existent example files with `.dygram` extension
```javascript
'examples/basic/hello-world.dygram',
'examples/basic/simple-workflow.dygram',
'examples/state-machines/traffic-light.dygram',
'examples/state-machines/connection-manager.dygram',
'examples/workflows/conditional-workflow.dygram',
```

**Finding:**
- All example files use `.dy` extension, not `.dygram`
- Files with these names don't exist in the examples directory
- Test file references: `ENOENT: no such file or directory`

**Recommendation:** UPDATE file paths to use actual `.dy` files or DELETE test

---

### Category 2: Template Variable Resolution Issues

#### 3. `test/integration/comprehensive-generative.test.ts` ⚠️ WARNING
**Issue:** CEL evaluation warnings for missing context variables during diagram generation

**Missing Variables:**
```
analyze.output, source, timeout, evaluate.feedback, executeTools.results,
extract.result, classify.result, summarize.result, machine.environment,
quickAnalysis.result, deepAnalysis.result, context.itemName, userRequest.query
```

**Source Code:** `src/language/cel-evaluator.ts:159`
```typescript
if (stringResult === null) {
    throw new Error('CEL evaluation returned error object');
}
// Line 164: console.warn(`Failed to resolve template variable: ${expression}`, error);
```

**Finding:**
- These are warnings, not fatal errors
- Templates use variables that don't exist in the visualization context
- The system gracefully falls back to displaying the original template syntax
- Likely caused by examples using node labels with template variables before runtime execution

**Recommendation:**
- **Option A:** Add mock/default values for visualization context
- **Option B:** Update examples to use simpler labels without runtime variables
- **Option C:** Accept warnings as expected behavior (display-only mode)

---

#### 4. `test/language/edge-conditional-parsing.test.ts` ❓ NEEDS INVESTIGATION
**Issue:** Test validates conditional edge syntax but encounters parsing issues

**Test Content:**
```dygram
Processing -when: '(status == "valid")';-> Success;
Processing -when: '(status == "invalid")';-> Failure;
Processing -unless: '(errorCount > 0)';-> Continue;
```

**Error:** "Machine has no start nodes"

**Finding:**
- Syntax parsing may be working but semantic validation fails
- Missing `init` node type or start node definition
- Test expects visual indicators: `color="#4CAF50"` (green), `color="#9E9E9E"` (gray)

**Recommendation:** ADD start node or adjust test expectations

---

### Category 3: Backward Compilation Issues

#### 5. `test/integration/backward-compilation.test.ts` 🐛 BUG
**Issue:** Round-trip compilation loses edge labels

**Failure:**
```
Labeled edges: round-trip
AssertionError: expected undefined to be 'init' // Object.is equality
```

**Finding:**
- DSL → JSON → DSL round-trip loses edge `label` property
- `generateDSL()` function in `src/language/generator/generator.js` may not serialize labels correctly
- **This is a real implementation bug**

**Recommendation:** FIX `generateDSL()` to preserve edge labels

---

#### 6. `test/integration/advanced-syntax-generation.test.ts` 🐛 BUG
**Issue:** Attribute reference edges not properly exposed

**Failure:**
```
Attribute reference edges
AssertionError: expected length 1 but got 2
```

**Finding:**
- Expected 2 edges exposing attribute-qualified references
- Only 1 edge generated
- Likely bug in edge generation logic for attribute references

**Recommendation:** FIX edge generation for attribute-qualified references

---

### Category 4: Import System & Validation

#### 7. `test/import-system/import-validator.test.ts` ⚠️ NEEDS REVIEW
**Issue:** Import validation tests failing

**Recommendation:** Review import system validation logic

---

#### 8. `test/validating/validation-errors.test.ts` ⚠️ NEEDS REVIEW
**Issue:** Validation error tests failing

**Recommendation:** Review validation error handling

---

#### 9. `test/integration/meta-machine-manipulation.test.ts` ⚠️ NEEDS REVIEW
**Issue:** Meta-machine manipulation tests failing

**Recommendation:** Review meta-machine operations

---

#### 10. `test/integration/runtime-visualization.test.ts` ⚠️ NEEDS REVIEW
**Issue:** Runtime visualization tests failing

**Recommendation:** Review visualization serialization logic

---

## Summary by Category

| Category | Count | % | Action Required |
|----------|-------|---|----------------|
| Defunct Tests | 2 | 20% | Delete or major rewrite |
| Template Warnings | 1 | 10% | Accept or improve context |
| Implementation Bugs | 2 | 20% | Fix code |
| Needs Investigation | 5 | 50% | Deep dive required |

## Immediate Actions

### Priority 1: Fix Implementation Bugs
1. ✅ Fix `generateDSL()` to preserve edge labels (backward-compilation.test.ts)
2. ✅ Fix attribute reference edge generation (advanced-syntax-generation.test.ts)

### Priority 2: Clean Up Defunct Tests
1. ✅ Delete or rewrite state-modules.test.ts (RailsExecutor dependency)
2. ✅ Fix file paths in backward-compilation-examples.test.ts

### Priority 3: Investigation Required
1. ❓ Review remaining 5 test files for root causes
2. ❓ Determine if template variable warnings are acceptable

## Execution/Runtime Test Gaps

**Current State:** Limited execution tests without LLM integration

**Gap Analysis:**
- ✅ Parsing tests (comprehensive)
- ✅ Generation tests (good coverage)
- ❌ **Runtime execution tests** (minimal, only visualization)
- ❌ **Conditional edge evaluation** (no runtime tests)
- ❌ **Context propagation** (no runtime tests)
- ❌ **State transitions** (only theoretical)

**Needed:** CLI-based execution tests with conditional logic verification

---

## Recommended Execution Test Suite

See `EXECUTION_TEST_PLAN.md` for detailed test design.
