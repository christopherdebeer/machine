# Round-Trip Test Analysis - November 3, 2025

## Summary

Implemented machine-level and edge annotation support in DSL generator, improving test pass rate from 51.6% to 57.8% (+21 tests fixed).

## Improvements Implemented

### Priority 1: Machine-Level Annotations and Attributes ✅

**Impact**: Fixed issues affecting 44+ tests

**Changes Made** (`src/language/generator/generator.ts` lines 1867-1910):
- Machine-level annotations now output inline with machine declaration
- Machine-level attributes output in block syntax when present
- Support for all annotation types:
  - Simple annotations: `@Critical`
  - Valued annotations: `@Version("2.0")`
  - Attributed annotations: `@style(rankdir: LR)`

**Examples**:
```dygram
machine "API Service" @Version("1.0") {
    environment: "production";
    timeout: 30;
};
```

### Priority 2: Edge Annotations ✅

**Impact**: Fixed issues affecting 10+ tests

**Changes Made** (`src/language/generator/generator.ts` lines 2189-2292):
- Edge annotations now output between source and arrow
- Format: `source -@Annotation-> target`
- Support for annotations with values and attribute-style parameters

**Examples**:
```dygram
Start -@Critical-> Process;
a -@style(color: "red"; weight: 2;)-> b;
```

## Test Results

### Before Fixes
- **Total tests**: 339 (comprehensive generative)
- **Passed**: 175 (51.6%)
- **Failed**: 164 (48.4%)
- **DSL Round-trip Errors**: 433

### After Fixes
- **Total tests**: 339 (comprehensive generative)
- **Passed**: 196 (57.8%) ✅ +21 tests
- **Failed**: 143 (42.2%) ✅ -21 failures (-12.8%)
- **DSL Round-trip Errors**: 372 ✅ -61 errors (-14.1%)

### Category Improvements

| Category | Before | After | Change |
|----------|--------|-------|--------|
| **text-wrapping** | 14.3% (1/7) | **100% (7/7)** | +85.7% ⭐ |
| **styling-and-validation** | 36.4% (4/11) | **72.7% (8/11)** | +36.3% ⭐ |
| **advanced-features** | 22.2% (2/9) | **44.4% (4/9)** | +22.2% |
| **syntax** | 49.8% (106/213) | **53.5% (114/213)** | +3.7% |
| **attributes-and-types** | 28.6% (4/14) | **35.7% (5/14)** | +7.1% |

## Remaining Issues (143 tests still failing)

### Issue 1: Node Type Case Sensitivity ⭐ HIGH PRIORITY

**Affected**: ~17+ tests with parse errors
**Severity**: HIGH - Causes complete round-trip failure

#### Problem Description

JSON stores node types in lowercase (`"type": "task"`), but DSL syntax requires capitalized types (`Task analyze {}`). This causes round-trip failures where the regenerated DSL uses lowercase types which the parser doesn't recognize as node types, instead treating them as machine-level attributes.

#### Example

**Original DSL**:
```dygram
machine "Configured Tasks"

Task analyze {
    model: "claude-3-5-sonnet";
};

Input data {
    format: "json";
};
```

**JSON (lowercase types)**:
```json
{
  "nodes": [
    { "name": "analyze", "type": "task" },
    { "name": "data", "type": "input" }
  ]
}
```

**Regenerated DSL (fails to parse)**:
```dygram
machine "Configured Tasks"

task analyze {
    model: "claude-3-5-sonnet";
};

input data {
    format: "json";
};
```

**Parse Error**: `Expecting EOF but found '{'` - parser treats `task` as attribute name, not node type.

#### Root Cause

The JSON generation process normalizes node types to lowercase for consistency, but the DSL parser requires specific capitalization for node type keywords (Task, State, Process, etc.).

#### Proposed Solutions

**Option A: Preserve Original Case in JSON** (Recommended)
- Store node types with original capitalization in JSON
- Requires changes to JSON generation
- Ensures perfect round-trip fidelity

**Option B: Capitalize Types in DSL Generator**
- Add type capitalization logic in `generateDSL()`
- Maintain lowercase in JSON for consistency
- Need mapping of lowercase → capitalized forms

**Option C: Make Parser Case-Insensitive**
- Update grammar to accept both cases
- Most flexible but changes language semantics

#### Implementation Estimate
- **Effort**: Medium (2-4 hours)
- **Risk**: Low (well-contained change)
- **Impact**: Would fix ~17+ tests

---

### Issue 2: Attribute Placement Mismatches

**Affected**: 28+ tests
**Severity**: MEDIUM - Data is preserved but moved to wrong location

#### Problem Description

After round-trip, attributes are sometimes moved between machine level and node level. Most commonly seen when node attributes appear at machine level after regeneration.

#### Example

**Original JSON**:
```json
{
  "title": "System",
  "attributes": [],
  "nodes": [
    {
      "name": "analyze",
      "attributes": [
        { "name": "model", "value": "claude-3" },
        { "name": "temp", "value": 0.7 }
      ]
    }
  ]
}
```

**After Round-trip JSON**:
```json
{
  "title": "System",
  "attributes": [
    { "name": "model", "value": "claude-3" },
    { "name": "temp", "value": 0.7 }
  ],
  "nodes": [
    {
      "name": "analyze",
      "attributes": []
    }
  ]
}
```

#### Root Cause

Likely related to Issue 1 - when node types are not recognized due to case mismatch, the parser may interpret the entire node block as machine-level attributes.

#### Proposed Solution

Fix Issue 1 first, then reassess. May be a symptom rather than a separate issue.

---

### Issue 3: Circular JSON References

**Affected**: 3 tests
**Severity**: HIGH - Causes complete failure
**Tests**: `documented-system`, `e-commerce-system`, `types-17`

#### Problem Description

The `note` keyword creates bidirectional references between notes and their target nodes, causing `JSON.stringify()` to fail with circular structure errors.

#### Error Message

```
TypeError: Converting circular structure to JSON
    --> converting object property 'definition'
    --> property '$container' closes the circle
```

#### Root Cause

Langium AST creates bidirectional references:
- Note has `target` reference to a node
- Node's `$container` references back to parent/note

When serializing to JSON, these circular references cause JSON.stringify() to fail.

#### Proposed Solutions

**Option A: Use Visited Set** (Recommended)
```typescript
function generateJSON(machine: Machine): MachineJson {
    const visited = new WeakSet();
    // Track visited objects to prevent infinite recursion
}
```

**Option B: Custom JSON Replacer**
```typescript
JSON.stringify(obj, (key, value) => {
    if (key === '$container' || key === '$type') return undefined;
    return value;
});
```

**Option C: Deep Clone Without Circulars**
- Use library like `flatted` or `circular-json`
- Already available in some test code

#### Implementation Estimate
- **Effort**: Low (1-2 hours)
- **Risk**: Low
- **Impact**: Would fix 3 tests

---

### Issue 4: Edge Count Mismatches

**Affected**: ~14 tests
**Severity**: MEDIUM

#### Problem Description

Number of edges differs between original and round-trip JSON. Edges are either duplicated or lost.

#### Examples

Common patterns:
- `json.edges: array length mismatch (3 vs 4)` - Edge duplication
- `json.edges: array length mismatch (2 vs 3)` - Edge duplication
- `json.edges: array length mismatch (1 vs 0)` - Edge loss

#### Possible Causes

1. **Inferred edges**: Parser may infer edges from node relationships
2. **Scope issues**: Edges in nested node scopes being duplicated at root level
3. **Parse errors**: If DSL doesn't parse correctly, edges may be interpreted differently

#### Investigation Needed

Examine specific test cases to understand patterns:
- Are duplicated edges scoped edges also appearing at root?
- Are lost edges failing to regenerate?
- Does this correlate with node nesting?

---

## Recommendations

### Immediate Next Steps (Priority Order)

1. **Fix Issue 1: Node Type Case Sensitivity** ⭐
   - **Impact**: HIGH (17+ tests)
   - **Effort**: Medium
   - **Approach**: Preserve original case in JSON or capitalize in generator

2. **Fix Issue 3: Circular JSON References**
   - **Impact**: LOW (3 tests) but HIGH severity
   - **Effort**: Low
   - **Approach**: Implement visited set or custom replacer

3. **Investigate Issue 2: Attribute Placement**
   - Likely resolves automatically after fixing Issue 1
   - If not, needs deeper investigation

4. **Investigate Issue 4: Edge Count Mismatches**
   - Requires detailed analysis of specific cases
   - May be multiple separate issues

### Long-term Improvements

1. **Grammar Enhancement**: Consider making node type keywords case-insensitive
2. **Validation**: Add validation step to catch circular references early
3. **Testing**: Add unit tests for each DSL generator function
4. **Documentation**: Document expected JSON format and constraints

## Conclusion

The implemented fixes provide significant improvement (+6.2% test pass rate), particularly in text-wrapping and styling categories. The remaining issues are well-understood and have clear paths to resolution. Fixing the node type case sensitivity issue alone would likely improve the pass rate to ~65-70%.
