#!/bin/bash
# Analyze DyGram test recordings
#
# Usage:
#   ./scripts/analyze-recordings.sh [category] [--verbose]
#
# Examples:
#   ./scripts/analyze-recordings.sh                    # Analyze all recordings
#   ./scripts/analyze-recordings.sh task-execution     # Analyze specific category
#   ./scripts/analyze-recordings.sh --verbose          # Show detailed analysis

set -e

RECORDINGS_DIR="test/fixtures/recordings"
CATEGORY="${1}"
VERBOSE=false

# Parse arguments
for arg in "$@"; do
    if [ "$arg" = "--verbose" ] || [ "$arg" = "-v" ]; then
        VERBOSE=true
    fi
done

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 DyGram Test Recording Analysis${NC}"
echo "=================================================="
echo ""

# Check if recordings directory exists
if [ ! -d "$RECORDINGS_DIR" ]; then
    echo -e "${YELLOW}No recordings directory found${NC}"
    exit 1
fi

# Determine target directory
if [ -n "$CATEGORY" ] && [ "$CATEGORY" != "--verbose" ] && [ "$CATEGORY" != "-v" ]; then
    TARGET_DIR="$RECORDINGS_DIR/$CATEGORY"
    if [ ! -d "$TARGET_DIR" ]; then
        echo -e "${YELLOW}Category '$CATEGORY' not found${NC}"
        echo "Available categories:"
        ls -1 "$RECORDINGS_DIR" | sed 's/^/  - /'
        exit 1
    fi
    echo "Analyzing category: $CATEGORY"
else
    TARGET_DIR="$RECORDINGS_DIR"
    echo "Analyzing all recordings"
fi

echo ""

# Count recordings by category
echo -e "${CYAN}Recording Counts by Category:${NC}"
for category in "$RECORDINGS_DIR"/*; do
    if [ -d "$category" ]; then
        category_name=$(basename "$category")
        count=$(find "$category" -name "*.json" -type f | wc -l)
        printf "  %-35s %3d recordings\n" "$category_name:" "$count"
    fi
done

echo ""

# Total count
TOTAL_RECORDINGS=$(find "$TARGET_DIR" -name "*.json" -type f | wc -l)
echo -e "${GREEN}Total recordings in scope: $TOTAL_RECORDINGS${NC}"

# If no recordings, exit
if [ "$TOTAL_RECORDINGS" -eq 0 ]; then
    echo "No recordings to analyze"
    exit 0
fi

echo ""

# Analyze tool selections
echo -e "${CYAN}Tool Selection Analysis:${NC}"
echo "Top 10 most used tools:"

find "$TARGET_DIR" -name "*.json" -type f -exec jq -r '.response.response.content[]? | select(.type=="tool_use") | .name' {} \; 2>/dev/null | \
    sort | uniq -c | sort -rn | head -10 | \
    awk '{printf "  %3d uses: %s\n", $1, $2}'

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}  Unable to analyze tool selections${NC}"
fi

echo ""

# Analyze reasoning patterns
echo -e "${CYAN}Reasoning Patterns:${NC}"
echo "Top 5 reasoning patterns:"

find "$TARGET_DIR" -name "*.json" -type f -exec jq -r '.response.reasoning' {} \; 2>/dev/null | \
    cut -d',' -f1 | \
    sort | uniq -c | sort -rn | head -5 | \
    awk '{printf "  %3d times: %s\n", $1, substr($0, index($0,$2))}'

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}  Unable to analyze reasoning patterns${NC}"
fi

echo ""

# File size analysis
echo -e "${CYAN}Recording Size Analysis:${NC}"
TOTAL_SIZE=$(find "$TARGET_DIR" -name "*.json" -type f -exec du -k {} \; | awk '{sum+=$1} END {print sum}')
AVG_SIZE=$(echo "scale=2; $TOTAL_SIZE / $TOTAL_RECORDINGS" | bc)

echo "  Total size: ${TOTAL_SIZE} KB"
echo "  Average size: ${AVG_SIZE} KB per recording"

echo ""

# Recent recordings
echo -e "${CYAN}Recent Activity:${NC}"
echo "Last 10 recordings (by modification time):"

find "$TARGET_DIR" -name "*.json" -type f -printf "%T@ %p\n" | \
    sort -rn | head -10 | \
    while read timestamp file; do
        relative_path=$(echo "$file" | sed "s|$RECORDINGS_DIR/||")
        date=$(date -d "@${timestamp%.*}" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "unknown")
        echo "  $date - $relative_path"
    done

echo ""

# Git status
echo -e "${CYAN}Git Status:${NC}"
NEW_FILES=$(git status --short "$RECORDINGS_DIR" 2>/dev/null | grep "^??" | wc -l || echo "0")
MODIFIED_FILES=$(git status --short "$RECORDINGS_DIR" 2>/dev/null | grep "^ M" | wc -l || echo "0")
STAGED_FILES=$(git status --short "$RECORDINGS_DIR" 2>/dev/null | grep "^A\|^M" | wc -l || echo "0")

echo "  New (untracked): $NEW_FILES files"
echo "  Modified: $MODIFIED_FILES files"
echo "  Staged: $STAGED_FILES files"

if [ "$NEW_FILES" -gt 0 ] || [ "$MODIFIED_FILES" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}  ⚠️  You have uncommitted recordings${NC}"
    echo "  Commit them with: git add $RECORDINGS_DIR && git commit -m 'Update test recordings'"
fi

# Verbose mode - show sample recordings
if [ "$VERBOSE" = true ]; then
    echo ""
    echo "=================================================="
    echo -e "${CYAN}Sample Recordings (Verbose Mode):${NC}"
    echo ""

    find "$TARGET_DIR" -name "*.json" -type f | head -3 | while read -r file; do
        relative_path=$(echo "$file" | sed "s|$RECORDINGS_DIR/||")
        echo -e "${GREEN}File: $relative_path${NC}"
        echo "---"

        # Extract key information
        REQUEST_ID=$(jq -r '.request.requestId' "$file" 2>/dev/null || echo "N/A")
        TOOLS_COUNT=$(jq -r '.request.tools | length' "$file" 2>/dev/null || echo "N/A")
        REASONING=$(jq -r '.response.reasoning' "$file" 2>/dev/null || echo "N/A")
        TOOL_USED=$(jq -r '.response.response.content[]? | select(.type=="tool_use") | .name' "$file" 2>/dev/null || echo "none")

        echo "  Request ID: $REQUEST_ID"
        echo "  Tools available: $TOOLS_COUNT"
        echo "  Tool selected: $TOOL_USED"
        echo "  Reasoning: $REASONING"
        echo ""
    done
fi

echo ""
echo "=================================================="
echo -e "${GREEN}Analysis complete!${NC}"

# Recommendations
echo ""
echo "Recommendations:"
if [ "$TOTAL_RECORDINGS" -gt 100 ]; then
    echo "  - Consider archiving old recordings"
fi
if [ "$NEW_FILES" -gt 0 ]; then
    echo "  - Commit new recordings before running more tests"
fi
if [ "$MODIFIED_FILES" -gt 0 ]; then
    echo "  - Review modified recordings for changes"
fi
echo "  - Use --verbose flag for detailed recording inspection"
echo "  - Run specific category analysis with: $0 <category>"
