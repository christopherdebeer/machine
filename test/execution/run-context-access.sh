#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="dygram"
FIXTURE="$SCRIPT_DIR/../fixtures/execution/context-access.dy"
TMP_DIR="/tmp/dygram-execution-tests"

mkdir -p "$TMP_DIR"

# Generate JSON
$CLI generate "$FIXTURE" -f json -d "$TMP_DIR"

# Check JSON exists
test -f "$TMP_DIR/context-access.json" || exit 1

# Verify template syntax is preserved (templates should remain as {{ }})
grep -q "Config.apiUrl" "$TMP_DIR/context-access.json" || {
    echo "ERROR: Template variable 'Config.apiUrl' not preserved"
    exit 1
}

grep -q "Config.timeout" "$TMP_DIR/context-access.json" || {
    echo "ERROR: Template variable 'Config.timeout' not preserved"
    exit 1
}

# Parse and validate (should pass)
$CLI parseAndValidate "$FIXTURE"

echo "✓ Test 2.1 passed: Context attribute access validated"
