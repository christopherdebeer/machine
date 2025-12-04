# DyGram Development Guidelines

## Core Principles

- Documentation in `docs/` (MD→MDX), examples extracted at build time
- Core docs (`syntax/`, `examples/`, `api/`, `cli/`) document existing features only
- Speculative/future content goes in `docs/development/`
- All examples must be in docs, extracted via `npm run prebuild`

## MDX Compatibility Rules

- No headings starting with numbers → use `### Title (1)` not `### 1. Title`
- No unescaped `<` in prose → use `less than` or backticks
- Escape HTML-like syntax → use backticks or `&lt;`

## Build & Test Workflow

```bash
# Full build (redirect verbose output)
CI=1 npm ci 2>&1 > /tmp/build.log && npm run build:with-tests 2>&1 >> /tmp/build.log
tail -100 /tmp/build.log | grep -i error

# Before committing docs
npm run prebuild && npm run build:web && npm test
```

## Domain-Specific Guidelines

- **CLI Development**: See `cli/CLAUDE.md`
- **Language/Parser**: See `src/language/CLAUDE.md`
- **Documentation**: See `docs/CLAUDE.md`
- **Testing**: See `test/CLAUDE.md`

## Quick Reference

**Repository Structure:**
```
docs/          # Documentation (MD → MDX)
examples/      # Generated from docs (DO NOT EDIT)
src/language/  # Langium grammar and logic
src/cli/       # CLI implementation
test/          # Comprehensive generative tests
scripts/       # Build scripts (prebuild.js extracts examples)
```

**Common Commands:**
```bash
npm run prebuild              # Extract examples, generate MDX
npm run langium:generate      # Generate parser from grammar
npm run build:web             # Build website
npm test                      # Run all tests
UPDATE_SNAPSHOTS=true npm test  # Update test snapshots
