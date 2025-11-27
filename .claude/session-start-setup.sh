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
npm install -g @beads/bd --quiet

# Initialize bd if needed
if [ ! -d .beads ]; then
    echo "$LOG_PREFIX Initializing bd..."
    bd init --quiet
fi

# Show ready work
echo "$LOG_PREFIX Ready work:"
bd ready --limit 5

echo "$LOG_PREFIX Setup complete!"
echo "========================================"

exit 0
