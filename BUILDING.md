# Building DyGram

This document explains the complete build and test workflow for DyGram, including how test outputs are bundled into the static site.

## Quick Commands

```bash
# Full build with tests (recommended for production)
npm run build:with-tests

# Development workflow
npm run dev

# Run tests only
npm test

# Build only (without tests)
npm run build
```

## Build Process Overview

The DyGram build process has several interconnected steps that resolve circular dependencies:

### 1. Prebuild Phase (`npm run prebuild`)

The prebuild script (`scripts/prebuild.js`) performs several critical tasks:

1. **Extract Examples** (Resolves #230)
   - Scans all markdown files in `docs/`
   - Extracts code blocks marked with ` ```dygram ` or ` ```machine `
   - Writes example files to `examples/` directory
   - Creates 97+ example files across 24 categories

2. **Generate Examples List**
   - Scans extracted examples
   - Creates `src/generated/examples-list.json`
   - Provides metadata for the playground

3. **Generate Documentation Hierarchy**
   - Builds navigation structure
   - Creates `src/data/doc-hierarchy.json` and `.ts`

4. **Transform Markdown to MDX**
   - Converts documentation to interactive MDX
   - Adds CodeEditor components

5. **Generate Page Entries**
   - Creates HTML and TSX entry points
   - Sets up routing for static site

6. **Validate Links**
   - Checks internal documentation links

### 2. Langium Generation

```bash
npm run langium:generate
```

Generates TypeScript language server code from the Langium grammar definition.

### 3. Test Phase

#### Unit and Integration Tests (`npm test`)

```bash
npm test
```

Runs all vitest tests and generates outputs to `test-output/`:

- **Vitest reports**: `test-output/vitest/junit.xml`
- **Generative tests**: `test-output/generative/*.md` and `index.html`
  - Validates DyGram → AST → JSON → Graphviz pipeline
  - Creates 27+ test artifacts with visual reports
  - Generates interactive HTML report

#### E2E Tests (`npm run test:e2e`)

```bash
npm run test:e2e
```

Runs Playwright browser tests:

- **Playwright reports**: `test-output/playwright-report/`

#### Test Report Index

```bash
node scripts/generate-test-index.js
```

Creates `test-output/index.html` - a landing page for all test reports with:
- Links to generative test reports
- Links to E2E rendering tests
- Summary statistics
- Styled navigation

### 4. Build Phase (`npm run build`)

```bash
npm run build
```

Executes the full build pipeline:

1. **Prebuild** (see above)
2. **Build Extension** - TypeScript compilation + esbuild
3. **Build Web** - Vite builds the static site

#### Vite Build (`npm run build:web`)

The Vite configuration (`vite.config.ts`) handles:

1. **Entry Point Discovery**
   - Scans for all HTML files
   - Creates build entries for each page

2. **Static Asset Copying**
   - Copies examples directories
   - **Copies test-output/ to dist/ (if it exists)** ✓
   - Copies CSS and other static files

3. **Bundle Generation**
   - Creates optimized JavaScript bundles
   - Generates CSS with minification
   - Outputs to `dist/`

4. **Sitemap Generation**
   - Runs `scripts/generate-sitemap.js`
   - Creates `dist/sitemap.xml`

## Circular Dependency Resolution

The workflow resolves the circular dependency mentioned in #230 and #231:

```
prebuild → examples/ → tests → test-output/ → build → dist/
   ↑                                                      ↓
   └──────────────── documentation ←─────────────────────┘
```

### The Solution

1. **First Run**: `npm run build:with-tests`
   - Prebuild extracts examples from docs → `examples/`
   - Tests run using examples → `test-output/`
   - Build includes test-output → `dist/test-output/`

2. **Subsequent Runs**:
   - Examples already exist in `examples/`
   - Tests generate fresh `test-output/`
   - Build updates `dist/test-output/`

### Important Notes

- **Test outputs are optional**: The build succeeds even without test outputs
- **Conditional copying**: `vite.config.ts` checks if `test-output/` exists before copying
- **Test failures don't block build**: Tests can fail, but build continues
- **Examples persist**: Once extracted, examples remain until manually deleted

## Command Execution Order

### For Production/Deployment

```bash
# Recommended: Full build with all tests
npm run build:with-tests

# This runs:
# 1. npm run test:reports (tests + report generation)
# 2. npm run build (prebuild + extension + web)
```

### For Development

```bash
# Start development server with watch mode
npm run dev

# This runs:
# 1. npm run prebuild (extracts examples)
# 2. concurrently:
#    - Watch mode for extension (TypeScript + esbuild)
#    - Vite dev server (web interface)
```

### For Testing Only

```bash
# Run all tests with reports
npm run test:reports

# Or run tests separately:
npm test              # Unit and integration tests
npm run test:e2e      # End-to-end browser tests
npm run test:runtime  # Runtime visualization tests
```

### Manual Step-by-Step

If you need to run steps manually:

```bash
# 1. Extract examples and generate assets
npm run prebuild

# 2. Generate Langium parser
npm run langium:generate

# 3. Run tests (optional)
npm test
npm run test:e2e

# 4. Generate test report index (optional)
node scripts/generate-test-index.js

# 5. Build extension
npm run build:extension

# 6. Build web
npm run build:web
```

## Output Structure

After a complete build with tests:

```
dist/
├── index.html              # Main landing page
├── playground.html         # Monaco editor playground
├── playground-mobile.html  # Mobile-optimized playground
├── test-output/           # ✓ Test reports bundled in static site
│   ├── index.html         # Test reports landing page
│   ├── generative/        # Generative test artifacts
│   │   ├── index.html     # Interactive test report
│   │   ├── REPORT.md      # Markdown summary
│   │   └── *.md           # Individual test outputs
│   ├── playwright-report/ # E2E test results
│   └── vitest/           # Unit test results
├── examples/             # Example .dygram files
├── assets/              # Bundled JS and CSS
├── static/              # Static assets (CSS, images)
└── sitemap.xml          # Generated sitemap
```

## CI/CD Considerations

### GitHub Actions / Vercel

```yaml
- name: Install dependencies
  run: npm install

- name: Build with tests
  run: npm run build:with-tests

- name: Deploy
  # dist/ now contains everything including test outputs
```

### Docker

```dockerfile
RUN npm install
RUN npm run build:with-tests
# dist/ is ready for deployment
```

## Environment Variables

- `VITE_BASE_URL`: Base URL for the site (default: `/machine/`)
- `VERCEL_BASE_URL`: Automatically set by Vercel
- `ANTHROPIC_API_KEY`: Required for CLI execution (not for build)

## Troubleshooting

### Examples not found

```bash
# Solution: Run prebuild to extract examples
npm run prebuild
```

### Test outputs not in dist/

```bash
# Solution: Run tests before build
npm run test:reports
npm run build
```

### Build fails after test failures

```bash
# Tests don't block the build in build:with-tests
# But you can run build separately:
npm run build
```

### Langium parser errors

```bash
# Regenerate Langium parser
npm run langium:generate
```

## Related Issues

- **#230**: Examples extraction from documentation
- **#231**: Test output bundling (this document)

## See Also

- [Testing Approach](docs/archived/guides/testing-approach.md)
- [Development Workflow](README.md#development)
- [CLI Reference](docs/cli/README.md)
