#!/bin/bash
# Clean up DyGram test recordings
#
# Usage:
#   ./scripts/clean-recordings.sh [--untracked] [--dry-run]
#
# Options:
#   --untracked   Remove only untracked (new) recordings
#   --all         Remove all recordings (dangerous!)
#   --dry-run     Show what would be removed without removing
#
# Examples:
#   ./scripts/clean-recordings.sh --dry-run           # Preview cleanup
#   ./scripts/clean-recordings.sh --untracked         # Remove new recordings
#   ./scripts/clean-recordings.sh --all --dry-run     # Preview full cleanup

set -e

RECORDINGS_DIR="test/fixtures/recordings"
UNTRACKED_ONLY=false
REMOVE_ALL=false
DRY_RUN=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
for arg in "$@"; do
    case $arg in
        --untracked)
            UNTRACKED_ONLY=true
            ;;
        --all)
            REMOVE_ALL=true
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [--untracked] [--all] [--dry-run]"
            exit 1
            ;;
    esac
done

# Safety check
if [ "$REMOVE_ALL" = true ] && [ "$DRY_RUN" = false ]; then
    echo -e "${RED}⚠️  WARNING: This will remove ALL recordings!${NC}"
    echo "This action cannot be undone."
    read -p "Are you sure? Type 'yes' to continue: " -r
    if [ "$REPLY" != "yes" ]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo -e "${BLUE}🧹 DyGram Recording Cleanup${NC}"
echo "=================================================="
echo ""

# Check if recordings directory exists
if [ ! -d "$RECORDINGS_DIR" ]; then
    echo -e "${YELLOW}No recordings directory found${NC}"
    exit 1
fi

# Mode display
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN MODE - No files will be deleted${NC}"
fi

if [ "$REMOVE_ALL" = true ]; then
    echo "Mode: Remove all recordings"
elif [ "$UNTRACKED_ONLY" = true ]; then
    echo "Mode: Remove only untracked recordings"
else
    echo "Mode: Default (remove untracked only)"
    UNTRACKED_ONLY=true
fi

echo ""

# Get file lists
if [ "$REMOVE_ALL" = true ]; then
    FILES_TO_REMOVE=$(find "$RECORDINGS_DIR" -name "*.json" -type f)
else
    # Get untracked files from git
    UNTRACKED=$(git status --porcelain "$RECORDINGS_DIR" 2>/dev/null | grep "^??" | awk '{print $2}')
    if [ -n "$UNTRACKED" ]; then
        FILES_TO_REMOVE="$UNTRACKED"
    else
        FILES_TO_REMOVE=""
    fi
fi

# Count files
if [ -z "$FILES_TO_REMOVE" ]; then
    echo -e "${GREEN}No files to remove${NC}"
    exit 0
fi

FILE_COUNT=$(echo "$FILES_TO_REMOVE" | wc -l)
echo "Files to remove: $FILE_COUNT"
echo ""

# Show files
echo "Files:"
echo "$FILES_TO_REMOVE" | head -20 | sed 's/^/  - /'
if [ "$FILE_COUNT" -gt 20 ]; then
    echo "  ... and $((FILE_COUNT - 20)) more"
fi
echo ""

# Calculate size
TOTAL_SIZE=0
for file in $FILES_TO_REMOVE; do
    if [ -f "$file" ]; then
        size=$(du -k "$file" | cut -f1)
        TOTAL_SIZE=$((TOTAL_SIZE + size))
    fi
done

echo "Total size to free: ${TOTAL_SIZE} KB"
echo ""

# Perform removal
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN: No files were removed${NC}"
    echo "Run without --dry-run to actually remove files"
else
    echo "Removing files..."

    for file in $FILES_TO_REMOVE; do
        if [ -f "$file" ]; then
            rm "$file"
            echo -e "${GREEN}✓${NC} Removed: $file"
        fi
    done

    # Remove empty directories
    find "$RECORDINGS_DIR" -type d -empty -delete 2>/dev/null || true

    echo ""
    echo -e "${GREEN}Cleanup complete!${NC}"
    echo "Removed $FILE_COUNT files, freed ${TOTAL_SIZE} KB"
fi

echo ""

# Show remaining recordings
REMAINING_COUNT=$(find "$RECORDINGS_DIR" -name "*.json" -type f 2>/dev/null | wc -l)
echo "Remaining recordings: $REMAINING_COUNT files"

# Suggestions
if [ "$DRY_RUN" = false ] && [ "$FILE_COUNT" -gt 0 ]; then
    echo ""
    echo "Next steps:"
    echo "  - Run tests to generate new recordings"
    echo "  - Check git status: git status $RECORDINGS_DIR"
fi
