# Snapshot Testing

This directory contains baseline snapshots for the comprehensive generative tests. Snapshots capture the expected outputs (JSON, Graphviz DOT, and SVG) for all test examples to detect unintended changes in output generation.

## How It Works

The comprehensive generative test suite (`comprehensive-generative.test.ts`) validates that:
1. Examples parse correctly
2. JSON generation is complete
3. Graphviz DOT generation is lossless
4. SVG rendering works
5. **NEW:** All outputs match their baseline snapshots

When a snapshot test fails, it means the current output differs from the expected baseline. This could indicate:
- An intentional improvement or change to the generator
- An unintended regression or bug
- A change in the underlying libraries (Langium, Graphviz, etc.)

## Running Tests

### Normal Mode (Snapshot Comparison)
```bash
npm test
```

This runs tests in comparison mode. Tests will **fail** if outputs differ from snapshots. This is the default CI/CD mode.

### Update Mode (Create/Update Snapshots)
```bash
UPDATE_SNAPSHOTS=true npm test
```

This runs tests in update mode. When outputs differ from snapshots:
- New snapshots are **created** for tests without existing snapshots
- Existing snapshots are **updated** when differences are detected
- Tests will **pass** after updating snapshots

**Important:** Only run in update mode when you have intentionally changed the generator or when you've verified that the new outputs are correct.

## When to Update Snapshots

Update snapshots in these situations:

1. **Intentional Generator Changes**: You've improved the JSON/Graphviz generator and the new outputs are correct
2. **New Examples**: You've added new examples to the documentation
3. **Fixed Bugs**: You've fixed a bug and the corrected output is now what should be expected
4. **Library Updates**: You've updated dependencies (Langium, Graphviz) and verified the new outputs are correct

## Snapshot Update Workflow

1. Make your changes to the generator or examples
2. Run tests to see what changed:
   ```bash
   npm test
   ```
3. Review the detailed test output in `test-output/comprehensive-generative/` to verify changes are correct
4. If changes are intentional, update snapshots:
   ```bash
   UPDATE_SNAPSHOTS=true npm test
   ```
5. Commit both your code changes **and** the updated snapshots:
   ```bash
   git add test/integration/__snapshots__/
   git commit -m "Update generator and snapshots for [reason]"
   ```

## Reviewing Snapshot Changes

When reviewing PRs that update snapshots:

1. **Check the diff**: Review what changed in the snapshot files
2. **Read the PR description**: Understand why the snapshots needed updating
3. **Review test outputs**: Look at `test-output/comprehensive-generative/` for detailed before/after comparisons
4. **Verify intentionality**: Ensure changes are deliberate improvements, not accidental regressions

## Snapshot File Format

Snapshots are stored as JSON files with this structure:
```json
{
  "json": { /* Full JSON output from generateJSON() */ },
  "graphviz": "/* Full Graphviz DOT output as string */",
  "svgHash": "sha256 hash of SVG output for efficient comparison"
}
```

Note: SVG outputs are stored as hashes rather than full content for efficiency, since SVGs can be large and may contain rendering-specific details.

## Troubleshooting

### "No baseline snapshot found" Error
This means you're running tests for new examples without snapshots. Run `UPDATE_SNAPSHOTS=true npm test` to create initial snapshots.

### Tests Pass Locally but Fail in CI
Ensure you've committed the snapshot files:
```bash
git add test/integration/__snapshots__/
git commit -m "Add missing snapshots"
```

### Large Snapshot Diffs
If many snapshots change at once:
1. Verify the change is intentional (e.g., a systematic generator improvement)
2. Review a sample of changed outputs manually
3. Document the reason in your commit message
4. Consider adding tests for the specific behavior you're changing

## Best Practices

1. **Always review snapshot changes**: Don't blindly update snapshots without understanding why they changed
2. **Keep snapshots in git**: Snapshots are part of your test suite and should be versioned
3. **Document intentional changes**: When updating snapshots, explain why in your commit message
4. **Test before committing**: Run tests in normal mode after updating snapshots to ensure they pass
5. **Small, focused changes**: Try to update snapshots in focused commits that address specific changes

## Integration with CI/CD

In continuous integration:
- Tests run in **comparison mode** (default)
- Any snapshot mismatches cause the build to fail
- This ensures no unintended output changes slip through
- Developers must explicitly update snapshots and commit them

To override in CI (not recommended for production):
```yaml
# GitHub Actions example
- name: Run tests
  run: npm test
  env:
    UPDATE_SNAPSHOTS: false  # Always compare, never update
```
