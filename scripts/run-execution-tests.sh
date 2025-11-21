#!/bin/bash
# Run DyGram execution tests with agent responder
#
# Usage:
#   ./scripts/run-execution-tests.sh [test-pattern] [record-mode]
#
# Examples:
#   ./scripts/run-execution-tests.sh                          # Run all tests
#   ./scripts/run-execution-tests.sh test/validating/        # Run all validating tests
#   ./scripts/run-execution-tests.sh task-execution          # Run task execution tests
#   ./scripts/run-execution-tests.sh test/validating/ playback  # Use existing recordings

set -e

# Configuration
TEST_PATTERN="${1:-test/validating/}"
RECORD_MODE="${2:-interactive}"
OUTPUT_LOG="/tmp/dygram-test-output.log"
RESPONDER_PID_FILE="/tmp/dygram-responder.pid"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting DyGram Execution Tests${NC}"
echo "   Test pattern: $TEST_PATTERN"
echo "   Record mode: $RECORD_MODE"
echo "   Output log: $OUTPUT_LOG"
echo ""

# Function to cleanup on exit
cleanup() {
    local exit_code=$?
    echo ""
    echo -e "${BLUE}🧹 Cleaning up...${NC}"

    if [ -f "$RESPONDER_PID_FILE" ]; then
        RESPONDER_PID=$(cat "$RESPONDER_PID_FILE")
        if kill -0 "$RESPONDER_PID" 2>/dev/null; then
            echo "   Stopping agent responder (PID: $RESPONDER_PID)..."
            kill "$RESPONDER_PID" 2>/dev/null || true
            wait "$RESPONDER_PID" 2>/dev/null || true
        fi
        rm -f "$RESPONDER_PID_FILE"
    fi

    exit $exit_code
}

trap cleanup EXIT INT TERM

# Start agent responder (only in interactive mode)
if [ "$RECORD_MODE" = "interactive" ]; then
    echo -e "${BLUE}📡 Starting agent responder...${NC}"
    node scripts/test-agent-responder.js > /tmp/dygram-responder.log 2>&1 &
    RESPONDER_PID=$!
    echo $RESPONDER_PID > "$RESPONDER_PID_FILE"
    echo "   PID: $RESPONDER_PID"

    # Wait for responder to initialize
    sleep 2

    # Check if responder is still running
    if ! kill -0 "$RESPONDER_PID" 2>/dev/null; then
        echo -e "${RED}❌ Agent responder failed to start${NC}"
        cat /tmp/dygram-responder.log
        exit 1
    fi

    echo -e "${GREEN}   ✓ Agent responder ready${NC}"
    echo ""
else
    echo -e "${YELLOW}⏯️  Using playback mode (no agent responder needed)${NC}"
    echo ""
fi

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
echo ""

set +e  # Don't exit on test failure
DYGRAM_TEST_MODE=$RECORD_MODE npm test "$TEST_PATTERN" 2>&1 | tee "$OUTPUT_LOG"
TEST_EXIT_CODE=${PIPESTATUS[0]}
set -e

echo ""
echo -e "${BLUE}📊 Test Results:${NC}"
echo "=================================================="

# Parse test results
if grep -q "Test Files" "$OUTPUT_LOG"; then
    grep -E "Test Files|Tests" "$OUTPUT_LOG" | tail -2 | while read -r line; do
        if echo "$line" | grep -q "failed"; then
            echo -e "${RED}$line${NC}"
        else
            echo -e "${GREEN}$line${NC}"
        fi
    done
else
    echo -e "${YELLOW}Could not parse test results from output${NC}"
fi

echo ""

# Show agent responder activity (if interactive mode)
if [ "$RECORD_MODE" = "interactive" ] && [ -f /tmp/dygram-responder.log ]; then
    REQUESTS_PROCESSED=$(grep -c "📨 Received request" /tmp/dygram-responder.log || echo "0")
    RESPONSES_SENT=$(grep -c "✅ Sent response" /tmp/dygram-responder.log || echo "0")

    echo -e "${BLUE}🤖 Agent Responder Activity:${NC}"
    echo "   Requests processed: $REQUESTS_PROCESSED"
    echo "   Responses sent: $RESPONSES_SENT"
    echo ""
fi

# Show new recordings
echo -e "${BLUE}📝 Recordings:${NC}"
NEW_RECORDINGS=$(git status --short test/fixtures/recordings/ 2>/dev/null | grep "^??" | wc -l || echo "0")
MODIFIED_RECORDINGS=$(git status --short test/fixtures/recordings/ 2>/dev/null | grep "^ M" | wc -l || echo "0")

echo "   New recordings: $NEW_RECORDINGS files"
echo "   Modified recordings: $MODIFIED_RECORDINGS files"

if [ "$NEW_RECORDINGS" -gt 0 ]; then
    echo ""
    echo "   Recording categories:"
    git status --short test/fixtures/recordings/ | grep "^??" | awk '{print $2}' | xargs -r dirname | sort -u | sed 's/^/     - /'
fi

echo ""
echo "=================================================="

# Final status
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review new recordings: git status test/fixtures/recordings/"
    echo "  2. Commit recordings: git add test/fixtures/recordings/ && git commit -m 'Update test recordings'"
    echo "  3. Push changes: git push"
else
    echo -e "${RED}❌ Some tests failed (exit code: $TEST_EXIT_CODE)${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Review test output: cat $OUTPUT_LOG"
    echo "  2. Check agent responder log: cat /tmp/dygram-responder.log"
    echo "  3. Check for timeout issues"
    echo "  4. Verify test expectations"
fi

echo ""
echo "Full output saved to: $OUTPUT_LOG"
if [ "$RECORD_MODE" = "interactive" ]; then
    echo "Responder log saved to: /tmp/dygram-responder.log"
fi

exit $TEST_EXIT_CODE
