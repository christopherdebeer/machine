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

# Install dependencies (including bd beads issue tracker)
echo "$LOG_PREFIX Installing dependencies..."
npm ci --quiet 2>&1 || {
    echo "$LOG_PREFIX Warning: Failed to install dependencies, continuing anyway..."
}

# Add local node_modules/.bin to PATH for this session
if [ -n "$CLAUDE_ENV_FILE" ]; then
    echo 'export PATH="$PATH:./node_modules/.bin"' >> "$CLAUDE_ENV_FILE"
    echo "$LOG_PREFIX Added ./node_modules/.bin to PATH"
fi

# Check if bd is available (should work after PATH update and npm ci)
if ! command -v bd &> /dev/null; then
    # echo "$LOG_PREFIX Warning: bd command not found after installation, skipping issue tracker setup"
    # exit 0
    curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
fi

# Initialize bd if database file is missing
# (directory may exist but database file could be missing)
if [ ! -f .beads/beads.db ]; then
    echo "$LOG_PREFIX Initializing bd database..."
    bd init --quiet 2>&1 || {
        echo "$LOG_PREFIX Warning: Failed to initialize bd"
        exit 0
    }
fi

# Show ready work
echo "$LOG_PREFIX Ready work:"
bd ready --limit 5 2>&1 || {
    echo "$LOG_PREFIX Note: No ready work or bd query failed"
}

echo "$LOG_PREFIX Setup complete!"
echo "========================================"

exit 0
