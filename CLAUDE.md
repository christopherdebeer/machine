# Claude Development Guidelines for DyGram

## Documentation Standards

### Core Documentation Structure

Documentation lives in `docs/` and is compiled into MDX for the website:

```
docs/
├── syntax/          # Language syntax reference (existing implementation)
├── examples/        # Usage examples (existing implementation)
├── api/            # API documentation (existing implementation)
├── cli/            # CLI documentation (existing implementation)
├── getting-started/ # Tutorials (existing implementation)
└── development/     # Future proposals, design docs, internal docs
```

### Documentation Rules

1. **Core docs focus on existing implementation only**
   - `docs/syntax/`, `docs/examples/`, `docs/api/`, `docs/cli/`, `docs/getting-started/`
   - Document what currently exists and works
   - No speculative features or future proposals

2. **Future/speculative content goes in development/**
   - `docs/development/` is for design docs, proposals, remaining work
   - Mark clearly as proposals or future work
   - Include implementation status and timelines

3. **Examples are extracted from documentation**
   - All examples MUST be written in documentation files
   - Build system extracts examples to `examples/` directories
   - Use proper extraction syntax (triple backticks with language tags)
   - Examples are automatically tested via generative test suite

### Example Extraction Format

````markdown
## Example: Basic Machine

```dygram
machine "My Machine"

state Start "Initial State"
state End "Final State"

Start --> End
```
````

The build system will:
1. Extract this to `examples/basic/basic-machine.dygram`
2. Generate test snapshots in `test/integration/__snapshots__/`
3. Run comprehensive tests in `test/integration/comprehensive-generative.test.ts`

### MDX Compatibility

Documentation is transformed to MDX for the website. Avoid:

1. **Headings starting with numbers** ❌
   - Bad: `### 1. Installation`
   - Good: `### Installation (Step 1)`
   - Reason: MDX creates JSX IDs that can't start with numbers

2. **Less-than signs in text** ❌
   - Bad: `<100ms performance`
   - Good: `less than 100ms performance` or `sub-100ms performance`
   - Reason: MDX interprets `<` as JSX tag start

3. **Unescaped HTML-like syntax** ❌
   - Bad: `<Component>` in prose
   - Good: `` `<Component>` `` or `&lt;Component&gt;`
   - Reason: MDX parses as JSX

## Build Process

### Running Builds

Always redirect verbose output to prevent context pollution:

```bash
# Full CI build
CI=1 npm ci 2>&1 > /tmp/build.log && npm run build:with-tests 2>&1 >> /tmp/build.log

# Check for errors
tail -100 /tmp/build.log | grep -i error

# Check specific parts
grep "MDX" /tmp/build.log
```

### Build Stages

1. **Prebuild** (`npm run prebuild`)
   - Extracts examples from docs
   - Generates examples catalog
   - Creates doc hierarchy
   - Transforms Markdown to MDX
   - Validates internal links

2. **Langium Generation** (`npm run langium:generate`)
   - Generates language parser from grammar
   - Creates TextMate and Monaco syntax files

3. **Web Build** (`npm run build:web`)
   - Compiles TypeScript
   - Bundles with Vite
   - Generates sitemap

4. **Test** (`npm test`)
   - Runs Vitest test suite
   - Includes comprehensive generative tests
   - Tests all extracted examples

### Always Run Tests

Before committing documentation changes:

```bash
npm run prebuild && npm run build:web && npm test 2>&1 | tee /tmp/test.log
```

Check test results:
```bash
grep "Test Files" /tmp/test.log
grep "FAIL" /tmp/test.log
```

## Common Tasks

### Adding Documentation

1. Edit relevant `.md` file in `docs/`
2. Follow MDX compatibility rules (no numbered headings, escape `<`)
3. Use proper example extraction syntax
4. Run prebuild to generate MDX: `npm run prebuild`
5. Test build: `npm run build:web`
6. Run tests to validate examples: `npm test`

### Adding Examples

Examples must be in documentation:

1. Add example to relevant doc in `docs/examples/*.md` or `docs/syntax/*.md`
2. Use proper code fence with language tag
3. Run `npm run prebuild` to extract
4. Check generated files in `examples/`
5. Run tests with `UPDATE_SNAPSHOTS=true npm test` if new example
6. Commit both documentation and generated snapshots

### Fixing MDX Compilation Errors

Common errors:

**"Unexpected character `N` before name"**
- Heading starts with number: change `### 1. Title` to `### Title (1)`

**"Unexpected character `<`"**
- Text contains `<N`: change `<100ms` to `less than 100ms`

**"Unexpected token"**
- Unescaped HTML-like syntax: use backticks or escape

### Documentation Checklist

Before committing docs:

- [ ] No headings starting with numbers
- [ ] No unescaped `<` in prose
- [ ] Examples use proper extraction syntax
- [ ] Speculative content in `development/` subfolder
- [ ] Core docs document existing features only
- [ ] Run `npm run prebuild && npm run build:web`
- [ ] Run `npm test` for comprehensive validation
- [ ] Commit extracted examples and snapshots

## Repository Structure

```
machine/
├── docs/                    # Documentation (MD → MDX)
│   ├── syntax/             # Language reference
│   ├── examples/           # Usage examples
│   ├── development/        # Design docs, proposals
│   └── [others]/           # API, CLI, guides
├── examples/               # Generated from docs (DO NOT EDIT)
├── src/
│   ├── language/           # Langium grammar and logic
│   ├── cli/               # CLI implementation
│   ├── components/        # React components
│   └── playground/        # Browser playground
├── test/
│   └── integration/       # Comprehensive generative tests
├── scripts/
│   └── prebuild.js        # Builds docs and extracts examples
└── CLAUDE.md              # This file
```

## When Making Changes

1. **Always run full build before committing**
2. **Redirect verbose output** to temp files (`2>&1 > /tmp/output.log`)
3. **Check build logs** for errors (`grep -i error /tmp/output.log`)
4. **Update snapshots** if adding examples (`UPDATE_SNAPSHOTS=true npm test`)
5. **Document in the right place** (core docs vs development/)
6. **Follow MDX rules** (no numbered headings, escape special chars)

## Testing Strategy

The repository uses comprehensive generative testing:

- **All examples are tested**: Every example in docs is validated
- **Snapshots track changes**: Golden snapshots in `test/integration/__snapshots__/`
- **Update when intentional**: `UPDATE_SNAPSHOTS=true npm test` to accept changes
- **Failures indicate issues**: Snapshot mismatches mean behavior changed

When tests fail:
1. Check if change is intentional
2. If yes: `UPDATE_SNAPSHOTS=true npm test`
3. If no: Fix the code that caused the change
4. Commit both code and snapshots together
