#!/bin/bash
set -e

# Log file location (gitignored)
LOG_FILE=".claude.startup.log"
LOG_PREFIX="[SessionStart]"

# Start logging
exec > >(tee -a "$LOG_FILE") 2>&1
echo ""
echo "========================================"
echo "$LOG_PREFIX $(date)"
echo "========================================"

# Install bd (beads issue tracker)
echo "$LOG_PREFIX Installing bd (beads issue tracker)..."
npm install -g @beads/bd --quiet 2>&1 || {
    echo "$LOG_PREFIX Warning: Failed to install bd globally, continuing anyway..."
}

# Check if bd is available
if ! command -v bd &> /dev/null; then
    echo "$LOG_PREFIX Warning: bd command not found, skipping issue tracker setup"
    exit 0
fi

# Initialize bd if needed
if [ ! -d .beads ]; then
    echo "$LOG_PREFIX Initializing bd..."
    bd init --no-db --quiet 2>&1 || {
        echo "$LOG_PREFIX Warning: Failed to initialize bd"
        exit 0
    }
fi

# Show ready work
echo "$LOG_PREFIX Ready work:"
bd ready --no-db --limit 5 2>&1 || {
    echo "$LOG_PREFIX Note: No ready work or bd query failed"
}

echo "$LOG_PREFIX Setup complete!"
echo "========================================"

exit 0
