#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="dygram"
FIXTURE="$SCRIPT_DIR/../fixtures/execution/conditional-when-true.dy"
TMP_DIR="/tmp/dygram-execution-tests"

mkdir -p "$TMP_DIR"

# Generate JSON
$CLI generate "$FIXTURE" -f json -d "$TMP_DIR"

# Check JSON exists
test -f "$TMP_DIR/conditional-when-true.json" || exit 1

# Check JSON contains 'when' property on edges
grep -q '"when"' "$TMP_DIR/conditional-when-true.json" || {
    echo "ERROR: No 'when' property found in edges"
    exit 1
}

# Check specific condition is present (with single quotes inside)
grep -q "status == 'valid'" "$TMP_DIR/conditional-when-true.json" || {
    echo "ERROR: Expected condition \"status == 'valid'\" not found"
    exit 1
}

# Parse and validate (should pass)
$CLI parseAndValidate "$FIXTURE"

echo "✓ Test 1.1 passed: When condition (true path) validated"
