#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="dygram"
FIXTURE="$SCRIPT_DIR/../fixtures/execution/missing-context-error.dy"
TMP_DIR="/tmp/dygram-execution-tests"

mkdir -p "$TMP_DIR"

# Generate JSON - should succeed but may warn
$CLI generate "$FIXTURE" -f json -d "$TMP_DIR" 2>&1 | tee "$TMP_DIR/error.log"

# Check JSON was generated
test -f "$TMP_DIR/missing-context-error.json" || {
    echo "ERROR: JSON should be generated even with missing context"
    exit 1
}

# Verify original template is preserved (not evaluated)
grep -q "MissingContext.field" "$TMP_DIR/missing-context-error.json" || {
    echo "ERROR: Template should be preserved when context missing"
    exit 1
}

# Parse and validate should still pass
$CLI parseAndValidate "$FIXTURE"

echo "✓ Test 4.1 passed: Missing context handled gracefully"
