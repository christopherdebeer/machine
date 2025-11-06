# Parse Error Analysis Report

**Date**: 2025-11-02
**Analyzed by**: Claude Code
**Issue**: #339

## Executive Summary

This report analyzes 186 parse errors found across 34 test cases in the DyGram comprehensive generative test suite. The analysis categorizes errors by root cause and determines whether they stem from incomplete grammar implementation (parser bugs) or incorrect documentation examples.

## Overall Statistics

- **Total Parse Errors**: 186
- **Tests with Parse Errors**: 34 out of 369 total tests
- **Categories Affected**:
  - syntax: 16 tests
  - development: 12 tests
  - styling: 3 tests
  - styling-and-validation: 2 tests
  - attributes-and-types: 1 test

## Error Categories & Root Causes

### 1. Annotations Not Fully Implemented (GRAMMAR LIMITATION)

**Affected Tests**: 12 tests in `syntax/annotations/` category

**Symptom**:
```
Expecting token of type 'EOF' but found `@`.
```

**Root Cause**: The grammar defines annotations (line 105-107 in machine.langium) but they can only be used in specific contexts:
- After node declarations (Node rule, line 145)
- In edge labels (EdgeAnnotation rule, line 164)
- After machine declaration (line 62)

However, the documentation shows **standalone annotations** (not attached to any element), which are not supported by the grammar.

**Example from `annotations-1.dy`**:
```dygram
@Annotation
@AnotherAnnotation
```

This is invalid because the grammar expects annotations to be followed by a machine or node declaration, not standalone at EOF.

**Verdict**: **GRAMMAR LIMITATION** - The grammar should either:
1. Support standalone annotations (add a rule for them), OR
2. Documentation should be updated to show annotations only in valid contexts

**Recommendation**: Update documentation to only show annotations in their currently supported contexts (attached to machines, nodes, or edges).

**Affected Files**:
- `examples/syntax/annotations/annotations-1.dy`
- `examples/syntax/annotations/annotations-2.dy`
- `examples/syntax/annotations/annotations-7.dy`
- `examples/syntax/annotations/annotations-8.dy`
- `examples/syntax/annotations/annotations-9.dy`
- `examples/syntax/annotations/annotations-10.dy`
- `examples/syntax/annotations/annotations-11.dy`
- `examples/syntax/annotations/annotations-12.dy`
- `examples/syntax/annotations/annotations-13.dy`
- `examples/syntax/annotations/annotations-14.dy`
- `examples/syntax/annotations/annotations-15.dy`
- `examples/syntax/annotations/payment-gateway.dy`
- `examples/syntax/edges/edges-5.dy`

### 2. Attribute Syntax Outside Valid Contexts (DOCUMENTATION ERROR)

**Affected Tests**: 2 tests (`attributes-2`, `types-3`)

**Symptom**:
```
Expecting token of type 'EOF' but found `:`.
Expecting token of type 'ARROW_SINGLE' but found `;`.
```

**Root Cause**: The grammar expects attributes to appear in specific contexts (line 132-138 in machine.langium):
- Inside machine bodies
- Inside node bodies
- As root-level attributes after machine declaration

The documentation shows **standalone attribute declarations** like:
```dygram
count<number>: 42;
price: 19.99;
```

These are valid only inside a machine or node body, not as top-level statements.

**Example from `attributes-2.dy`**:
```dygram
count<number>: 42;
price: 19.99;
scientific: 1.5e10;
temperature: -273.15;
```

**Verdict**: **DOCUMENTATION ERROR** - These examples should be wrapped in a machine context:
```dygram
machine "Example" {
    count<number>: 42;
    price: 19.99;
    scientific: 1.5e10;
    temperature: -273.15;
}
```

**Recommendation**: Fix documentation to show attributes in proper context.

**Affected Files**:
- `examples/syntax/attributes/attributes-2.dy` (extracted from `docs/syntax/attributes.md`)
- `examples/syntax/types/types-3.dy` (extracted from `docs/syntax/types.md`)

### 3. Import System Not Yet Implemented (FEATURE NOT IMPLEMENTED)

**Affected Tests**: 12 tests in `development/` category

**Symptom**:
```
Expecting token of type '{' but found `as`.
Expecting token of type 'EOF' but found `from`.
```

**Root Cause**: The grammar partially defines imports (line 68-74) but with a very specific syntax:
```dygram
import { symbol1, symbol2 } from "path";
```

However, documentation examples show more advanced import syntax:
- Named imports with aliases: `import { Foo as Bar } from "path"`
- Import and use statements: `machine { use Template; }`
- Export statements (not in grammar at all)

**Example from `mymachine.dy`**:
```dygram
import { ErrorHandling, Logging } from "shared/templates.dygram";

machine "MyMachine" {
    use ErrorHandling;
    use Logging;

    start -> process -> end;
}
```

The `use` keyword inside machine bodies is not defined in the grammar.

**Verdict**: **FEATURE NOT IMPLEMENTED** - These are in the `/development/` folder which according to CLAUDE.md is for "Future proposals, design docs, internal docs". The import system is partially implemented but not complete.

**Recommendation**: These tests should pass once the import system is fully implemented. The examples are correct for the planned feature. **No documentation changes needed** - these are correctly placed in the `development/` folder as future features.

**Affected Files**:
- `examples/development/IMPORT_SYSTEM_REMAINING_WORK/app.dy`
- `examples/development/IMPORT_SYSTEM_LOW_LEVEL_DESIGN/authentication.dy`
- `examples/development/IMPORT_SYSTEM_LOW_LEVEL_DESIGN/common-utilities.dy`
- `examples/development/IMPORT_SYSTEM_LOW_LEVEL_DESIGN/e-commerce-app.dy`
- `examples/development/import-system-design/import-system-design-3.dy`
- `examples/development/IMPORT_SYSTEM_REMAINING_WORK/import_system_remaining_work-2.dy`
- `examples/development/IMPORT_SYSTEM_REMAINING_WORK/import_system_remaining_work-3.dy`
- `examples/development/IMPORT_SYSTEM_REMAINING_WORK/import_system_remaining_work-4.dy`
- `examples/development/IMPORT_SYSTEM_IMPLEMENTATION_SUMMARY/library.dy`
- `examples/development/IMPORT_SYSTEM_LOW_LEVEL_DESIGN/myapp.dy`
- `examples/development/import-system-design/mymachine.dy`
- `examples/development/IMPORT_SYSTEM_LOW_LEVEL_DESIGN/payment-processing.dy`

### 4. Advanced Styling Attributes (GRAMMAR BUG)

**Affected Tests**: 3 tests in `styling/` category

**Symptom**:
```
Expecting token of type ')' but found `:`.
```

**Root Cause**: Annotation attributes use a different syntax than expected. The grammar expects:
```dygram
@style(color: red; penwidth: 3;)
```

But documentation shows:
```dygram
@style(rank: min;)
@style(rank: same:group1;)
```

The issue is with the colon in `same:group1` - the grammar's `AnnotationParam` rule (line 115-118) expects:
```
name=ID ':' value=EdgeAttributeValue
```

But `same:group1` has TWO colons, and `EdgeAttributeValue` (line 151) only matches simple tokens, not compound values like `same:group1`.

**Example from `aligned-layout.dygram`**:
```dygram
Task start @style(rank: min;) "Start";
Task a @style(rank: same:group1;) "Task A";
```

The `same:group1` value contains a colon, which breaks the parser.

**Verdict**: **GRAMMAR BUG** - The grammar needs to support compound values in annotation parameters, or the documentation should use a different syntax.

**Recommendation**: Either:
1. Update grammar to allow more complex values in EdgeAttributeValue (e.g., quoted strings or compound identifiers), OR
2. Change documentation to use quoted strings: `@style(rank: "same:group1";)`

**Quick Fix**: Change documentation to use quoted strings for compound values.

**Affected Files**:
- `examples/styling/aligned-layout.dygram` (extracted from `docs/styling.mdx`)
- `examples/styling/layout-control.dygram` (extracted from `docs/styling.mdx`)
- `examples/styling/styling-1.dy` (extracted from `docs/styling.mdx`)

### 5. Complex Attribute Values (CONTEXT ISSUE)

**Affected Tests**: `validation-attributes`, `attribute-anchors`

**Symptom**:
```
Expecting token of type 'EOF' but found `{`.
Expecting token of type 'EOF' but found `[`.
```

**Root Cause**: The grammar supports nested objects and arrays in AttributeValue (lines 83-101), but there may be parsing issues with how they're used in the examples.

**Example from `validation-attributes.dy`**:
```dygram
machine "Validation Attributes"

Input userInput {
    schema: #inputSchema;
    validation: "strict";
    sanitize<boolean>: true;
    required<Array<string>>: ["email", "name"];
    constraints: {
        email: #emailRegex;
        name: { minLength: 2, maxLength: 100 };
    };
};
```

**Verdict**: **NEEDS INVESTIGATION** - The grammar should support this, need to verify if it's a parsing bug or documentation issue.

**Affected Files**:
- `examples/attributes-and-types/validation-attributes.dy`
- `examples/styling-and-validation/attribute-anchors.dy`

### 6. Invalid Identifier Examples (DOCUMENTATION ERROR)

**Affected Test**: `identifiers-1`

**Symptom**:
```
Expecting token of type 'EOF' but found `123`.
```

**Root Cause**: Documentation includes an example showing invalid identifiers:
```dygram
123invalid;    // ❌ Cannot start with a number
@symbol;       // ❌ Cannot start with @
```

These are intentionally invalid examples to demonstrate what NOT to do, but they're being extracted and tested as valid examples.

**Verdict**: **DOCUMENTATION ERROR** - These are negative examples (showing invalid syntax) that should not be extracted as test cases.

**Recommendation**: The documentation should either:
1. Use a different code fence language (not `dygram`) for invalid examples
2. Add special markers to prevent extraction
3. Update the prebuild script to skip code blocks with ❌ markers

**Affected Files**:
- `examples/syntax/identifiers/identifiers-1.dy` (extracted from `docs/syntax/identifiers.md`)

### 7. Multiple Machines Per File (GRAMMAR LIMITATION)

**Affected Tests**: `layout-control`, `vertical`

**Symptom**:
```
Expecting token of type 'EOF' but found `machine`.
```

**Root Cause**: The grammar's entry rule is `entry Machine` (line 60), which expects exactly ONE machine per file. Documentation shows multiple machine declarations in a single file.

**Verdict**: **GRAMMAR LIMITATION** - The grammar currently supports only one machine per file.

**Recommendation**: Documentation should either:
1. Split examples into separate files, OR
2. Clearly mark as future feature if multi-machine files are planned

**Affected Files**:
- `examples/styling/layout-control.dygram`
- `examples/styling-and-validation/vertical.dy`

## Summary of Findings

| Error Pattern | Count | Root Cause | Fix Location | Priority |
|--------------|-------|------------|--------------|----------|
| Standalone annotations | 12 | Grammar limitation | Documentation | High |
| Attributes outside context | 2 | Documentation error | Documentation | High |
| Import system features | 12 | Not yet implemented | Grammar (future) | Low |
| Complex styling values | 3 | Grammar bug | Documentation (quick fix) | High |
| Complex nested values | 2 | Context issue | Investigation needed | Medium |
| Invalid identifier examples | 1 | Documentation error | Documentation | High |
| Multiple machines per file | 2 | Grammar limitation | Documentation | Medium |

## Recommendations

### High Priority (Documentation Fixes)

1. **Update annotations documentation** (`docs/syntax/annotations.md`)
   - Only show annotations in valid contexts (attached to machines, nodes, or edges)
   - Remove standalone annotation examples
   - Show examples like: `machine "Test" @annotation { ... }`

2. **Wrap attribute examples** (`docs/syntax/attributes.md`, `docs/syntax/types.md`)
   - Add machine context around standalone attribute examples
   - Example: Wrap in `machine "Example" { ... }`

3. **Quote complex styling values** (`docs/styling.mdx`)
   - Change `@style(rank: same:group1;)` to `@style(rank: "same:group1";)`
   - Quote any values containing special characters

4. **Mark negative examples** (`docs/syntax/identifiers.md`)
   - Use different code fence for invalid syntax examples
   - Or add extraction prevention markers

### Medium Priority (Grammar Enhancements)

1. **Support complex annotation parameter values**
   - Update `EdgeAttributeValue` rule to accept quoted strings with special characters
   - Or support compound identifiers

2. **Investigate complex attribute value parsing**
   - Verify nested objects/arrays work correctly in all contexts
   - Fix any parsing bugs found

3. **Consider multiple machines per file**
   - If desired feature, update grammar entry rule
   - Otherwise document as limitation

### Low Priority (Future Features)

1. **Complete import system implementation**
   - Tests in `/development/` folder are correct for planned features
   - No changes needed until features are implemented

## Intermediate Artifacts Created

Two structured artifacts have been created for systematic investigation:

1. **`test-output/comprehensive-generative/parse-errors.json`**
   - Complete structured data for all parse errors
   - Test name, category, path, and error messages
   - Grouped by category

2. **`test-output/comprehensive-generative/index.html`**
   - Interactive HTML report with filtering
   - Full source code, error messages, and playground links
   - Can be opened in browser for detailed investigation

## Next Steps

1. **Review this analysis** with project maintainer
2. **Prioritize fixes** based on feature roadmap
3. **Update documentation** for high-priority items
4. **Update CLAUDE.md** with guidelines to prevent future issues:
   - "Code examples in core docs must be valid and parseable"
   - "Use non-`dygram` code fences for invalid syntax examples"
   - "Examples must include proper context (machine/node bodies)"
5. **Re-run tests** after fixes to validate improvements
6. **Track progress** on grammar enhancements

---

**Report generated**: 2025-11-02
**Test suite**: `test/integration/comprehensive-generative.test.ts`
**Total examples analyzed**: 369
**Examples with parse errors**: 34 (9.2%)
**Examples passing**: 335 (90.8%)
