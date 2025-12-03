# Build and Test Failure Analysis - December 2, 2025

## Executive Summary

Build completed successfully with 255 test failures out of 1402 total tests (81.8% pass rate). Failures fall into distinct categories with clear root causes:

**Test Results:**
- **Total Tests**: 1402
- **Passed**: 1146 (81.8%)
- **Failed**: 255 (18.2%)
- **Skipped**: 1

**Build Status:** ✅ SUCCESS (web build and all compilation passed)

## Failure Categories

### Category 1: Comprehensive Generative Tests (230 failures, 90% of all failures)

**File:** `test/integration/comprehensive-generative.test.ts`

This is the primary source of failures. These are snapshot-based integration tests that validate all 479 examples extracted from documentation against golden snapshots.

**Test Coverage:** 479 examples from documentation
**Pass Rate:** 51.98% (249 passed, 230 failed)

#### Root Causes:

1. **Missing Snapshots (Primary):** 253 snapshot mismatches
   - Many examples (especially meta-programming, code-generation, LLM integration, task-evolution, testing categories) have no baseline snapshots
   - Examples: All 17 meta-programming examples have "No baseline snapshot found"

2. **DSL Round-Trip Failures (Secondary):** 173 failures
   - DSL→JSON→DSL→JSON transformation is not lossless
   - Examples of issues:
     - Edge sources change after round-trip (e.g., "Running" becomes "Visualization")
     - Attributes lost during round-trip (attributes array goes from 4 to 0)
     - Stack overflow errors in some complex examples

3. **Parse Errors (Tertiary):** 53 parse errors
   - Some examples don't parse correctly
   - Example: Array attributes on edges not supported (`A -> B [tags: [...]]`)
   - Error: "Expecting token of type 'ARROW_SINGLE' but found `[`"

4. **Graphviz/SVG Output Changes:** Many tests fail because graphviz or SVG output differs from snapshot
   - Likely due to implementation changes in rendering logic
   - Not breaking functionality but snapshots need updating

#### Analysis by Category:

| Category | Pass Rate | Main Issues |
|----------|-----------|-------------|
| api | 0% (0/4) | Missing snapshots |
| code-generation | 0% (0/15) | Missing snapshots |
| execution-features | 0% (0/11) | Missing snapshots |
| llm-integration | 0% (0/6) | Missing snapshots |
| meta-programming | 0% (0/17) | Missing snapshots |
| task-evolution | 0% (0/18) | Missing snapshots |
| testing | 0% (0/35) | Missing snapshots |
| text-wrapping-configuration | 0% (0/1) | Missing snapshots |
| runtime-execution | 100% (15/15) | ✅ All passing |
| imports | 91.9% (34/37) | Mostly working, minor issues |
| edge-syntax-validation | 91.3% (21/23) | Mostly working |
| syntax | 67.1% (143/213) | Mixed, some DSL round-trip issues |

#### Verdict: Tests are VALID but need maintenance

**Assessment:**
- ✅ Test implementation is sound
- ✅ Tests correctly identify issues
- ❌ Snapshots are outdated or missing
- ⚠️ Some implementation features are incomplete (DSL round-trip, edge array attributes)

**Recommendation:**
1. Run `UPDATE_SNAPSHOTS=true npm test` to create/update snapshots for examples that parse correctly
2. Fix DSL generator to ensure lossless round-trips
3. Fix parser to support array attributes on edges
4. Re-run snapshot update after fixes


### Category 2: Tool Execution Tests (7 failures)

**File:** `test/validating/tool-execution.test.ts`

All 7 failures are due to missing test recordings in playback mode.

**Error Pattern:**
```
Error: No more recordings available (index: 0, total: 0)
Error: Recordings directory not found: /home/user/machine/test/fixtures/recordings/tool-execution-complex
```

**Affected Tests:**
- "should handle multiple transition options"
- "should complete full execution through branching paths"
- "should track state transitions"
- "should visit nodes sequentially"
- "should handle machine with multiple decision points"
- "should handle machine with no transitions gracefully"

#### Verdict: Tests are LEGACY or recordings need regeneration

**Assessment:**
- ⚠️ Tests expect recordings that don't exist
- ⚠️ Either tests were never set up with recordings, or recordings were deleted
- ✅ Test implementation looks correct
- ❓ Unclear if these tests should be in recording mode or live mode

**Recommendation:**
1. Determine if these tests should use recordings or live execution
2. If recordings: Generate recordings using record mode
3. If live: Update tests to not use PlaybackTestClient
4. Consider if these tests are still needed given comprehensive-generative coverage


### Category 3: Import Validator Tests (6 failures)

**File:** `test/import-system/import-validator.test.ts`

All 6 failures show the same pattern: expecting validation errors but getting `undefined`.

**Error Pattern:**
```
AssertionError: expected undefined not to be undefined
```

**Affected Tests:**
- "should error on empty import path"
- "should error on import with no symbols"
- "should detect collision between imported and local symbols"
- "should detect collision between multiple imports"
- "should warn on insecure HTTP imports"
- "should not warn on HTTPS imports"

#### Verdict: Implementation is BROKEN or incomplete

**Assessment:**
- ❌ ImportValidator is not returning expected errors
- ❌ Validation logic is either not running or not being captured
- ✅ Test expectations are reasonable
- ⚠️ This suggests import validation feature is partially implemented

**Recommendation:**
1. Review ImportValidator implementation to ensure it's being invoked
2. Check if validation errors are being properly collected and returned
3. Verify the diagnostic system is working for import validation
4. Tests appear to be correct - implementation needs fixing


### Category 4: Validation Errors Test (1 failure)

**File:** `test/validating/validation-errors.test.ts`

Single test failure: "should flag unreachable nodes"

**Error:**
```
AssertionError: expected 0 to be greater than 0
```

#### Verdict: Implementation is BROKEN or incomplete

**Assessment:**
- ❌ Graph validator is not detecting unreachable nodes
- ✅ Test expectation is valid - unreachable node detection is important
- ⚠️ Feature may be partially implemented or disabled

**Recommendation:**
1. Review GraphValidator's unreachable node detection logic
2. Verify if this feature was intentionally disabled or is broken
3. Fix implementation to detect unreachable nodes


### Category 5: Edge Conditional Parsing (1 failure)

**File:** `test/language/edge-conditional-parsing.test.ts`

Test: "should parse conditional edges with quoted string syntax and show visual indicators"

**Error:**
```
AssertionError: expected graphviz output to contain 'color="#4CAF50"'
```

#### Verdict: Implementation CHANGED, test is OUTDATED

**Assessment:**
- ⚠️ Graphviz rendering changed (different color scheme or conditional edge visualization)
- ✅ Parsing likely works fine
- ❌ Test hardcodes specific color value
- ⚠️ Visual indicator implementation may have changed

**Recommendation:**
1. Review if conditional edge visualization still exists
2. Update test to check for current visualization approach
3. Consider making test more flexible (check for any color indication rather than specific color)


### Category 6: Meta Tool Manager Tests (2 failures)

**File:** `test/integration/meta-tool-manager.test.ts`

Tests expecting number results but getting result objects.

**Error Pattern:**
```
AssertionError: expected { success: true, result: 8, ... } to be 8
```

**Affected Tests:**
- "should construct a code-generation tool"
- "should handle build_tool_from_node meta-tool"

#### Verdict: API CHANGED, tests need UPDATE

**Assessment:**
- ⚠️ Tool execution API changed from returning raw values to result objects
- ✅ Implementation appears to work (returning `{success: true, result: 8}`)
- ❌ Tests expect old API format
- ⚠️ Breaking change not reflected in tests

**Recommendation:**
1. Update tests to expect result objects with `.result` property
2. Or update implementation to return raw values if that's the intended API
3. Ensure consistency across codebase for tool execution return values


### Category 7: Edge Evaluator Documentation Tests (3 failures)

**File:** `test/language/edge-evaluator-documentation.test.ts`

All failures show: `expected 0 to be greater than 0`

**Affected Tests:**
- "should have valid syntax for edge condition examples"
- "should have conditional edge examples from documentation"
- "should have examples for core edge condition features"

#### Verdict: Documentation EXTRACTION failed or examples MISSING

**Assessment:**
- ❌ Edge condition examples not being extracted from documentation
- ⚠️ Either examples don't exist in docs or extraction pattern is wrong
- ✅ Tests are validating important documentation coverage
- ❓ Unclear if edge condition examples exist in documentation

**Recommendation:**
1. Check if edge condition examples exist in documentation
2. If yes: Fix extraction pattern in prebuild script
3. If no: Add edge condition examples to documentation
4. Tests are good quality checks for documentation completeness


### Category 8: Machine Level Meta Tests (3 failures)

**File:** `test/integration/machine-level-meta.test.ts`

All tests checking if meta tools are available with machine-level meta attribute.

**Error Pattern:**
```
AssertionError: expected false to be true
```

**Affected Tests:**
- "meta tools are available when meta: true at machine level"
- "meta tools are available when meta: \"true\" as string at machine level"
- "node-level meta still works"

#### Verdict: Feature is BROKEN or INCOMPLETE

**Assessment:**
- ❌ Machine-level meta attribute not enabling meta tools
- ❌ Node-level meta may also be broken (third test)
- ⚠️ Core meta-programming feature not working
- ✅ Tests are checking important functionality

**Recommendation:**
1. Review meta tool initialization logic
2. Check if machine-level meta attribute is being processed
3. Verify MetaToolManager is receiving correct configuration
4. This is a critical feature that needs fixing


### Category 9: Runtime Visualization Test (1 failure)

**File:** `test/integration/runtime-visualization.test.ts`

Test: "should handle empty machine data"

**Error:**
```
AssertionError: expected function not to throw but 'Error: Machine has no start nodes' was thrown
```

#### Verdict: Test expectation is WRONG or implementation is FRAGILE

**Assessment:**
- ⚠️ Test expects empty machine to be handled gracefully
- ⚠️ Implementation throws error for empty machine
- ❓ Unclear what correct behavior should be (throw or handle gracefully)
- ⚠️ Either test or implementation needs updating

**Recommendation:**
1. Decide on correct behavior for empty machines
2. If should handle gracefully: Fix implementation
3. If should throw: Update test to expect error
4. Add error handling for edge cases in visualization


### Category 10: Advanced Syntax Generation Test (1 failure)

**File:** `test/integration/advanced-syntax-generation.test.ts`

Details not captured in grep output, likely similar to other failures.

**Recommendation:**
1. Review test output for specific error
2. Likely snapshot or API mismatch


## Overall Assessment

### Critical Issues (Must Fix)

1. **Import Validation Not Working** (6 failures)
   - Import validator not returning errors
   - Core functionality broken

2. **Machine-Level Meta Not Working** (3 failures)
   - Meta-programming feature broken
   - Critical for meta functionality

3. **Unreachable Node Detection Not Working** (1 failure)
   - Graph validation feature broken
   - Important for code quality

### High Priority (Should Fix Soon)

4. **DSL Round-Trip Not Lossless** (173 failures in comprehensive tests)
   - Code generation produces different results after round-trip
   - Data integrity issue

5. **Missing Test Recordings** (7 failures)
   - Tool execution tests can't run
   - Need to regenerate or remove

6. **Parse Errors in Examples** (53 failures in comprehensive tests)
   - Some syntax not supported (e.g., edge array attributes)
   - Language feature gaps

### Medium Priority (Technical Debt)

7. **Missing Snapshots** (253 failures in comprehensive tests)
   - Many new examples don't have baselines
   - Run UPDATE_SNAPSHOTS=true to fix

8. **API Changes Not Reflected in Tests** (2 failures)
   - Tool execution API changed
   - Tests need updating

9. **Documentation Example Extraction** (3 failures)
   - Edge condition examples not extracted
   - Documentation tooling issue

### Low Priority (Minor Issues)

10. **Hardcoded Test Expectations** (1 failure)
    - Edge color test too specific
    - Make test more flexible

11. **Error Handling in Visualization** (1 failure)
    - Empty machine handling inconsistent
    - Edge case handling

## Recommendations

### Immediate Actions

1. **Fix Import Validation**
   ```bash
   # Investigate and fix ImportValidator
   # File: src/language/validation/import-validator.ts
   ```

2. **Fix Machine-Level Meta**
   ```bash
   # Review MetaToolManager initialization
   # File: src/language/meta-tool-manager.ts
   ```

3. **Fix Graph Validation**
   ```bash
   # Enable unreachable node detection
   # File: src/language/validation/graph-validator.ts
   ```

### Short-term Actions

4. **Update Snapshots for Valid Examples**
   ```bash
   UPDATE_SNAPSHOTS=true npm test
   ```

5. **Fix DSL Generator for Lossless Round-trips**
   ```bash
   # Review and fix DSL generator
   # File: src/language/generator/generator.ts (generateDSL function)
   ```

6. **Regenerate or Remove Tool Execution Recordings**
   ```bash
   # Decide on recording vs live testing strategy
   # Either generate recordings or update tests
   ```

### Medium-term Actions

7. **Add Parser Support for Edge Array Attributes**
   ```bash
   # Update grammar to support: A -> B [attr: [...]]
   # File: src/language/machine.langium
   ```

8. **Fix Documentation Example Extraction**
   ```bash
   # Update prebuild script for edge condition examples
   # File: scripts/prebuild.js
   ```

9. **Update Tests for API Changes**
   ```bash
   # Update meta-tool-manager tests for new API
   # File: test/integration/meta-tool-manager.test.ts
   ```

## Test Quality Assessment

### High-Quality Tests (Keep as-is)
- ✅ Comprehensive generative tests - excellent coverage
- ✅ Import validator tests - catching real issues
- ✅ Validation error tests - testing important features
- ✅ Meta tool manager tests - validating core functionality

### Tests Needing Updates
- ⚠️ Tool execution tests - need recording strategy
- ⚠️ Edge conditional parsing - too specific expectations
- ⚠️ Runtime visualization - unclear error handling expectations

### Legacy/Questionable Tests
- ❓ Tool execution playback tests - may be obsolete
- ❓ Some snapshot tests - may need review for relevance

## Conclusion

**Overall Health:** GOOD with specific areas needing attention

The codebase has:
- ✅ Strong test coverage (1402 tests)
- ✅ Good test infrastructure (snapshot testing, generative tests)
- ✅ Comprehensive documentation testing
- ❌ Some broken features (import validation, meta tools, graph validation)
- ⚠️ Test maintenance debt (missing snapshots, outdated recordings)

**Primary Issue:** Not broken code, but **test maintenance debt** and **specific feature bugs**

**Path Forward:**
1. Fix the 3 critical broken features (import validation, meta tools, unreachable detection)
2. Fix DSL round-trip lossiness
3. Update snapshots for passing examples
4. Address test maintenance (recordings, API changes)
5. Add missing parser features (edge attributes)

**Time Estimate:**
- Critical fixes: 2-3 days
- DSL round-trip: 2-3 days
- Snapshot updates: 1 hour
- Test maintenance: 1-2 days
- Parser enhancements: 2-3 days

**Total:** ~1-2 weeks to address all issues

## Appendix: Test Results by File

```
Test Files  10 failed | 51 passed (61)
Tests      255 failed | 1146 passed | 1 skipped (1402)

Failed Test Files:
- test/integration/comprehensive-generative.test.ts (230 failures)
- test/validating/tool-execution.test.ts (7 failures)
- test/import-system/import-validator.test.ts (6 failures)
- test/language/edge-evaluator-documentation.test.ts (3 failures)
- test/integration/machine-level-meta.test.ts (3 failures)
- test/integration/meta-tool-manager.test.ts (2 failures)
- test/validating/validation-errors.test.ts (1 failure)
- test/language/edge-conditional-parsing.test.ts (1 failure)
- test/integration/runtime-visualization.test.ts (1 failure)
- test/integration/advanced-syntax-generation.test.ts (1 failure)
```

## Generated Reports

This analysis is based on:
- Build log: `/tmp/build-tests.log`
- Comprehensive test report: `/home/user/machine/test-output/comprehensive-generative/index.html`
- Comprehensive test markdown: `/home/user/machine/test-output/comprehensive-generative/REPORT.md`

For detailed failure information, see the HTML report which includes:
- Interactive filtering by category and issue type
- Source code for each failing test
- JSON, Graphviz, and SVG outputs
- Snapshot diffs
- Playground links for manual testing
