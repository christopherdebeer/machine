# Snapshot Testing Guide

This document explains how to work with test snapshots in the DyGram project.

## Overview

Snapshots are stored in `test/integration/__snapshots__/` and capture the expected output (JSON, Graphviz DOT, and SVG) for each test example. When tests run, the actual output is compared against these snapshots.

## Updating Snapshots

### ⚠️ Important: Don't Use All-or-Nothing Updates

Previously, the only way to update snapshots was using `UPDATE_SNAPSHOTS=true npm test`, which updates **ALL** snapshots at once. This is dangerous because:

- You might accidentally accept broken changes
- It's hard to review what changed
- You can't selectively update only the intentional changes

### ✅ Recommended: Selective Snapshot Updates

Use the new selective snapshot update tool instead:

```bash
# Interactive review mode (RECOMMENDED)
npm run snapshots:review

# List all snapshots with their status
npm run snapshots:list

# Update snapshots matching a pattern
npm run snapshots:update -- --pattern "styling*"

# Update a specific snapshot
npm run snapshots:update -- --file examples_advanced_features_3

# Update all snapshots (equivalent to UPDATE_SNAPSHOTS=true)
npm run snapshots:update -- --all
```

## Workflow

### 1. Run Tests

First, run tests to generate the latest test outputs:

```bash
npm run test:reports
```

This creates detailed reports in `test-output/comprehensive-generative/` showing:
- Which tests pass
- Which tests fail
- Why they fail (snapshot mismatch, parse error, etc.)

### 2. Review Failures

Check `test-output/comprehensive-generative/REPORT.md` or the HTML report to see which tests failed and why.

### 3. List Snapshot Status

```bash
npm run snapshots:list
```

This shows:
- ✅ **passing** - Test passes with current snapshot
- ⚠️ **mismatch** - Test fails due to snapshot mismatch (safe to update if intentional)
- ❌ **failing** - Test fails for other reasons (review before updating)
- ❓ **unknown** - No recent test output available

### 4. Update Snapshots Selectively

**Option A: Interactive Review (Recommended)**

```bash
npm run snapshots:review
```

This will:
1. Run tests to get latest results
2. Show each snapshot mismatch one by one
3. Ask you to approve or reject each update
4. Update only the approved snapshots

**Option B: Pattern-Based Update**

If you know which snapshots need updating (e.g., after fixing a styling bug):

```bash
npm run snapshots:update -- --pattern "styling*"
```

This will show you all matching snapshots and ask for confirmation before updating.

**Option C: Update Specific Snapshot**

```bash
npm run snapshots:update -- --file examples_advanced_features_3
```

### 5. Verify Changes

After updating snapshots:

```bash
# Run tests again to verify they pass
npm test

# Check git diff to see what changed
git diff test/integration/__snapshots__/
```

Review the changes carefully before committing!

## Advanced Usage

### Direct Script Usage

You can also run the script directly:

```bash
# Show help
node scripts/update-snapshots.js --help

# Update multiple patterns
node scripts/update-snapshots.js --pattern "*advanced*"
node scripts/update-snapshots.js --pattern "examples_*"
```

### Programmatic Usage

The snapshot manager in `test/integration/comprehensive-generative.test.ts` supports selective updates via environment variables:

```bash
# Create a config file
echo '{"files": ["examples_styling_1", "examples_styling_2"]}' > .snapshot-update-config.json

# Run tests with selective update
SELECTIVE_SNAPSHOT_UPDATE=true \
UPDATE_SNAPSHOTS=true \
SNAPSHOT_UPDATE_CONFIG=.snapshot-update-config.json \
npm test
```

## Understanding Snapshot Mismatches

When a snapshot mismatch occurs, it could be because:

1. **Intentional change** - You fixed a bug or improved output
   - ✅ Safe to update snapshot
   - Review the test output to confirm the change is correct

2. **Unintentional regression** - You broke something
   - ❌ Don't update snapshot
   - Fix the code instead

3. **Outdated documentation** - The example in docs was wrong
   - ✅ Fix the documentation first, then update snapshot

Always review the actual test output in `test-output/comprehensive-generative/` before updating a snapshot!

## Troubleshooting

### Tests time out

The `test:reports` command has timeouts disabled (`|| true`). Individual tests should complete within a reasonable time. If tests hang:

1. Check for infinite loops in the code
2. Run tests with `--reporter=verbose` to see which test is stuck

### Snapshot not found

If you get "No baseline snapshot found":

1. The test is new - run with `UPDATE_SNAPSHOTS=true` to create it
2. The snapshot file was deleted - recreate it with the update tool

### Build:with-tests fails

The `build:with-tests` command should never fail, even if tests fail. If it does:

1. Check that the command in `package.json` is: `"(npm run test:reports || true) && npm run build"`
2. The parentheses are critical for proper operator precedence

## Best Practices

1. **Always review before updating** - Don't blindly accept changes
2. **Use interactive review mode** - This forces you to look at each change
3. **Update in small batches** - Use patterns to update related snapshots together
4. **Check git diff** - Review snapshot changes before committing
5. **Document why** - In commit messages, explain why snapshots changed
6. **Run tests after updating** - Verify that updates fixed the failures

## See Also

- [Test Output Reports](../../test-output/comprehensive-generative/REPORT.md)
- [Comprehensive Generative Test](../../test/integration/comprehensive-generative.test.ts)
- [Update Snapshots Script](../../scripts/update-snapshots.js)
