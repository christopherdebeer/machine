#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/execution"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="dygram"
TMP_DIR="/tmp/dygram-execution-tests"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

passed=0
failed=0

# Create temp directory
mkdir -p "$TMP_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DyGram Execution Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

run_test() {
    local test_name=$1
    local test_file=$2
    local test_script=$3

    echo -e "${BLUE}Running:${NC} $test_name"

    if [ -n "$test_script" ] && [ -f "$test_script" ]; then
        # Run custom test script
        if bash "$test_script" > "$TMP_DIR/test.log" 2>&1; then
            echo -e "${GREEN}✓ PASSED${NC}: $test_name"
            ((passed++))
        else
            echo -e "${RED}✗ FAILED${NC}: $test_name"
            echo -e "${YELLOW}Log:${NC}"
            cat "$TMP_DIR/test.log"
            ((failed++))
        fi
    else
        # Default: generate and validate
        if $CLI generate "$test_file" -f json -d "$TMP_DIR" > "$TMP_DIR/test.log" 2>&1 && \
           $CLI parseAndValidate "$test_file" >> "$TMP_DIR/test.log" 2>&1; then
            echo -e "${GREEN}✓ PASSED${NC}: $test_name"
            ((passed++))
        else
            echo -e "${RED}✗ FAILED${NC}: $test_name"
            echo -e "${YELLOW}Log:${NC}"
            cat "$TMP_DIR/test.log"
            ((failed++))
        fi
    fi
    echo ""
}

# Category 1: Conditional Edge Evaluation
echo -e "${BLUE}=== Category 1: Conditional Edge Evaluation ===${NC}"
run_test "1.1 When Condition (True)" \
    "$FIXTURE_DIR/conditional-when-true.dy" \
    "$SCRIPT_DIR/run-conditional-when-true.sh"

run_test "1.2 Unless Condition (False)" \
    "$FIXTURE_DIR/conditional-unless-false.dy"

run_test "1.3 Multiple Conditions with Priority" \
    "$FIXTURE_DIR/conditional-priority.dy"

run_test "1.4 Complex Boolean Expressions" \
    "$FIXTURE_DIR/conditional-complex.dy"

# Category 2: Context Propagation
echo -e "${BLUE}=== Category 2: Context Propagation ===${NC}"
run_test "2.1 Context Node Attribute Access" \
    "$FIXTURE_DIR/context-access.dy" \
    "$SCRIPT_DIR/run-context-access.sh"

run_test "2.2 Nested Context Access" \
    "$FIXTURE_DIR/nested-context.dy"

run_test "2.3 Context in Conditions" \
    "$FIXTURE_DIR/context-in-conditions.dy"

# Category 3: State Transitions
echo -e "${BLUE}=== Category 3: State Transitions ===${NC}"
run_test "3.1 Auto-transition State Nodes" \
    "$FIXTURE_DIR/auto-transition.dy"

run_test "3.2 Conditional State Exit" \
    "$FIXTURE_DIR/conditional-state-exit.dy"

run_test "3.3 Parallel Paths (Diamond)" \
    "$FIXTURE_DIR/parallel-diamond.dy"

# Category 4: Error Handling
echo -e "${BLUE}=== Category 4: Error Handling ===${NC}"
run_test "4.1 Missing Context Reference" \
    "$FIXTURE_DIR/missing-context-error.dy" \
    "$SCRIPT_DIR/run-missing-context.sh"

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Results:${NC}"
echo -e "${GREEN}Passed: $passed${NC}"
echo -e "${RED}Failed: $failed${NC}"
echo -e "${BLUE}========================================${NC}"

# Cleanup
rm -rf "$TMP_DIR"

if [ $failed -gt 0 ]; then
    exit 1
fi
