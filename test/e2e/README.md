# End-to-End Mermaid Rendering Tests

This directory contains E2E tests that validate Mermaid diagram rendering in real browser environments using Playwright.

## Purpose

The generative tests in `test/integration/generative.test.ts` validate that DyGram code can be:
1. Parsed correctly
2. Transformed to JSON format
3. Transformed to Mermaid format
4. Syntactically validated

However, Mermaid diagrams that pass syntax validation might still fail to render in a browser due to:
- Browser-specific rendering issues
- Complex diagram structures
- Special characters or edge cases
- DOM/DOMPurify issues that only manifest in browser environments

These E2E tests fill that gap by actually rendering the generated Mermaid diagrams in a Chromium browser via Playwright.

## Running the Tests

### Install Playwright Browsers

First time setup:

```bash
npx playwright install chromium
```

### Run E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with interactive UI (helpful for debugging)
npm run test:e2e:ui

# Run in headed mode (see the browser)
npm run test:e2e:headed

# Run all tests (unit, integration, and E2E)
npm run test:all
```

### Run Specific Tests

```bash
# Run tests matching a pattern
npx playwright test --grep "Basic:"

# Run a specific test file
npx playwright test mermaid-rendering.test.ts
```

## Test Reports

After running the tests, reports are generated in:

- **HTML Report**: `playwright-report/index.html` - Interactive Playwright test report
- **E2E Render Report**: `test-output/e2e-render/RENDER-REPORT.md` - Summary of rendering results

View the HTML report:

```bash
npx playwright show-report
```

## How It Works

1. **Load DyGram Files**: Tests load example `.dygram` files from the `examples/` directory
2. **Generate Mermaid**: DyGram source is parsed and transformed to Mermaid format
3. **Render in Browser**: A Chromium browser instance loads the Mermaid diagram
4. **Validate SVG**: The test confirms that an SVG element is successfully generated
5. **Capture Errors**: Any rendering failures are captured with detailed error messages

## What the Tests Catch

These E2E tests can detect:

- **Syntax errors** that only manifest during rendering (not parsing)
- **Invalid Mermaid constructs** that pass basic validation
- **Browser compatibility issues**
- **Special character handling problems**
- **Complex diagram rendering failures**
- **Memory or performance issues** with large diagrams

## Test Structure

Each test follows this pattern:

```typescript
test('Example Test', async ({ page }) => {
    const source = loadExample('category', 'filename.dygram');
    const result = await testMermaidRendering(page, 'Test Name', source);
    expect(result.success, `Rendering failed: ${result.errorMessage}`).toBe(true);
    expect(result.svgGenerated, 'SVG was not generated').toBe(true);
});
```

## Configuration

Playwright configuration is in `playwright.config.ts` at the project root.

Key settings:
- **Test directory**: `./test/e2e`
- **Browser**: Chromium (Desktop Chrome)
- **Retries**: 2 retries on CI, 0 locally
- **Trace**: Captured on first retry (view with `npx playwright show-trace`)

## Debugging Failed Tests

When a test fails:

1. **Check the error message** in the test output
2. **View the render report** at `test-output/e2e-render/RENDER-REPORT.md`
3. **View the trace** (if captured): `npx playwright show-trace <path-to-trace.zip>`
4. **Run in headed mode** to see the browser: `npm run test:e2e:headed`
5. **Use UI mode** for interactive debugging: `npm run test:e2e:ui`

## Adding New Tests

To add tests for new example files:

1. Add the `.dygram` file to the appropriate `examples/` subdirectory
2. Add a test case in `mermaid-rendering.test.ts`:

```typescript
test('Category: Test Name', async ({ page }) => {
    const source = loadExample('category', 'filename.dygram');
    const result = await testMermaidRendering(page, 'Test Name', source);
    expect(result.success, `Rendering failed: ${result.errorMessage}`).toBe(true);
    expect(result.svgGenerated, 'SVG was not generated').toBe(true);
});
```

## Integration with CI/CD

These tests are designed to run in CI environments:
- Chromium runs in headless mode by default
- Tests include automatic retries for flaky rendering issues
- Detailed reports are generated for debugging
- Exit code reflects test success/failure

Add to your CI pipeline:

```yaml
- name: Install Playwright Browsers
  run: npx playwright install chromium

- name: Run E2E Tests
  run: npm run test:e2e
```
