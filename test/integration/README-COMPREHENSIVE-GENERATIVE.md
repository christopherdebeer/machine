# Comprehensive Generative Test Suite

## Overview

The comprehensive generative test suite (`comprehensive-generative.test.ts`) is an automated validation framework that programmatically tests **all extracted examples** from the DyGram documentation. This ensures complete coverage of the parsing and generation pipeline.

## Key Features

### 1. **Programmatic Iteration**
- Automatically loads ALL examples from `src/generated/examples-list.json`
- Currently tests 97 examples across 24 categories
- No manual test case maintenance required

### 2. **Complete Validation Pipeline**

Each example is validated through the complete transformation pipeline:

```
DyGram Source → Parse → JSON → Graphviz DOT → SVG
```

**Validation Stages:**
- ✅ **Parsing**: No lexer/parser errors
- ✅ **JSON Generation**: Completeness (all nodes/edges captured)
- ✅ **Graphviz DOT**: Losslessness (data preserved), syntax validation
- ✅ **SVG Rendering**: Confirms Graphviz DOT → SVG conversion works using `@hpcc-js/wasm`

### 3. **Comprehensive Reporting**

The test suite generates detailed reports in `test-output/comprehensive-generative/`:

- **REPORT.md**: Summary report with statistics
  - Overall success rate
  - Results by category
  - Issue summary (parse errors, completeness, etc.)
  - Detailed failure analysis

- **Category Directories**: Each category has its own directory
  - Individual markdown reports per example
  - Generated SVG files for visual inspection

Example output structure:
```
test-output/comprehensive-generative/
├── REPORT.md
├── basic/
│   ├── minimal.md
│   ├── minimal.svg
│   ├── hello.md
│   ├── hello.svg
│   └── ...
├── workflows/
│   └── ...
└── ...
```

## Running the Tests

### Run the comprehensive test suite:
```bash
npm test -- test/integration/comprehensive-generative.test.ts
```

### View the report:
```bash
cat test-output/comprehensive-generative/REPORT.md
```

### Inspect visual outputs:
Open any `.svg` file in the category directories to see the rendered diagram.

## Test Results Interpretation

### Success Metrics

The report includes:
- **Overall Success Rate**: Percentage of examples that pass all validations
- **Category Breakdown**: Success rate per category (basic, workflows, nesting, etc.)
- **Issue Summary**: Count of different error types

### Common Failure Causes

1. **Parse Errors**: Grammar issues in the example source
2. **Completeness Issues**: Nodes or edges missing from JSON output
3. **Losslessness Issues**: Data lost during transformation
4. **SVG Render Errors**: Graphviz DOT failed to render to SVG

## Advantages Over Static Tests

### Before (Original `generative.test.ts`)
- ❌ Manually hard-coded ~30 example file paths
- ❌ Required updates when examples change
- ❌ No SVG rendering validation
- ❌ Did not test ALL examples

### After (New `comprehensive-generative.test.ts`)
- ✅ Automatically discovers all 97 examples
- ✅ Self-updating when examples change
- ✅ Validates SVG rendering
- ✅ Tests EVERY extracted example
- ✅ Better organized output (by category)

## Integration with Build Process

This test suite integrates with the existing build process:

1. **`npm run prebuild`** extracts examples from docs → `examples/`
2. **`prebuild.js`** generates `src/generated/examples-list.json`
3. **Test suite** loads examples from JSON and validates them
4. **Continuous validation** ensures all documented examples are valid

## Extending the Tests

### Adding New Validation Checks

To add new validation checks, modify the `runGenerativeTest()` function in `comprehensive-generative.test.ts`:

```typescript
// Example: Add PDF generation validation
try {
    const pdfResult = await generatePDF(machine);
    if (!pdfResult.content) {
        result.pdfErrors.push('PDF generation failed');
        result.passed = false;
    }
} catch (e) {
    result.pdfErrors.push(`PDF error: ${e}`);
    result.passed = false;
}
```

### Modifying Output Format

To change the report format, modify the `ValidationReporter` class methods:
- `addResult()`: Individual test output
- `generateReport()`: Summary report format

## Comparison: Original vs Comprehensive

| Feature | Original (`generative.test.ts`) | Comprehensive |
|---------|--------------------------------|---------------|
| Examples Tested | ~30 (hard-coded) | 97 (automatic) |
| Parsing Validation | ✅ | ✅ |
| JSON Validation | ✅ | ✅ |
| Graphviz Validation | ✅ | ✅ |
| SVG Rendering | ❌ | ✅ |
| Auto-discovery | ❌ | ✅ |
| Category Organization | ❌ | ✅ |
| Visual Artifacts | Markdown only | Markdown + SVG |

## Continuous Improvement

As the DyGram language evolves:
1. Add examples to documentation
2. Run `npm run prebuild` to extract them
3. Run tests to validate automatically
4. No test code changes needed!

This ensures that all documented examples remain valid and renderable.
