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

# no content yet

echo "$LOG_PREFIX Setup complete!"
echo "========================================"

exit 0
