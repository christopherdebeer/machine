# Documentation Guidelines

## Documentation Structure

```
docs/
├── syntax/          # Language syntax reference
├── examples/        # Usage examples
├── api/            # API documentation
├── cli/            # CLI documentation
├── getting-started/ # Tutorials
└── development/     # Design docs, proposals, future work
```

## Core Documentation Rules

1. **Document existing features only** in core docs (`syntax/`, `examples/`, `api/`, `cli/`, `getting-started/`)
2. **Speculative content goes in `development/`** - Mark clearly as proposals or future work
3. **All examples must be in documentation** - Build system extracts them to `examples/`

## MDX Compatibility

Documentation is transformed to MDX for the website. Avoid:

### Headings Starting with Numbers ❌

```markdown
### 1. Installation  ❌ Bad
### Installation (Step 1)  ✅ Good
```

**Reason**: MDX creates JSX IDs that can't start with numbers

### Unescaped Less-Than Signs ❌

```markdown
<100ms performance  ❌ Bad
less than 100ms performance  ✅ Good
sub-100ms performance  ✅ Good
```

**Reason**: MDX interprets `<` as JSX tag start

### Unescaped HTML-Like Syntax ❌

```markdown
<Component> in prose  ❌ Bad
`<Component>` in prose  ✅ Good
&lt;Component&gt; in prose  ✅ Good
```

**Reason**: MDX parses as JSX

## Example Extraction Format

Examples are extracted from documentation at build time:

````markdown
## Example: Basic Machine

```dy
machine "My Machine"

state Start "Initial State"
state End "Final State"

Start --> End
```
````

The build system will:
1. Extract to `examples/basic/basic-machine.dy`
2. Generate test snapshots in `test/integration/__snapshots__/`
3. Run comprehensive tests in `test/integration/comprehensive-generative.test.ts`

## Build Process

```bash
# Extract examples and generate MDX
npm run prebuild

# Build website
npm run build:web

# Test all examples
npm test
```

## Documentation Workflow

1. Edit `.md` file in `docs/`
2. Follow MDX compatibility rules
3. Use proper example extraction syntax
4. Run `npm run prebuild` to generate MDX
5. Run `npm run build:web` to test build
6. Run `npm test` to validate examples
7. Commit both docs and generated snapshots

## Common MDX Errors

**"Unexpected character `N` before name"**
- Heading starts with number
- Fix: Change `### 1. Title` to `### Title (1)`

**"Unexpected character `<`"**
- Text contains `<N`
- Fix: Change `<100ms` to `less than 100ms`

**"Unexpected token"**
- Unescaped HTML-like syntax
- Fix: Use backticks or escape with `&lt;`

## Documentation Checklist

Before committing:

- [ ] No headings starting with numbers
- [ ] No unescaped `<` in prose
- [ ] Examples use proper extraction syntax
- [ ] Speculative content in `development/` subfolder
- [ ] Core docs document existing features only
- [ ] Run `npm run prebuild && npm run build:web`
- [ ] Run `npm test` for validation
- [ ] Commit extracted examples and snapshots
