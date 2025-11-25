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

# Check if we're in a web session
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "$LOG_PREFIX Running in Claude Code web session"
  WEB_SESSION=true
else
  echo "$LOG_PREFIX Running in CLI mode (no CLAUDE_ENV_FILE)"
  WEB_SESSION=false
fi

# Export environment variables for Playwright MCP
echo "$LOG_PREFIX Setting up environment variables..."
export PLAYWRIGHT_EXTRA_HTTP_HEADERS="${PLAYWRIGHT_EXTRA_HTTP_HEADERS:-{}}"
export ENABLE_MCP_CLI=true

# Persist to web session if available
if [ "$WEB_SESSION" = true ]; then
  echo "export PLAYWRIGHT_EXTRA_HTTP_HEADERS=\"${PLAYWRIGHT_EXTRA_HTTP_HEADERS}\"" >> "$CLAUDE_ENV_FILE"
  echo "export ENABLE_MCP_CLI=true" >> "$CLAUDE_ENV_FILE"
  echo "$LOG_PREFIX Environment variables written to CLAUDE_ENV_FILE"
fi

# Display current git status
if [ -d ".git" ]; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  echo "$LOG_PREFIX Git branch: $BRANCH"
fi

# Run npm ci (install dependencies from package-lock.json)
echo "$LOG_PREFIX Running npm ci..."
if npm ci > /tmp/npm-ci.log 2>&1; then
  echo "$LOG_PREFIX ✓ npm ci completed successfully"
else
  echo "$LOG_PREFIX ✗ npm ci failed (see /tmp/npm-ci.log for details)"
  tail -20 /tmp/npm-ci.log
  exit 1
fi

# Run prebuild (extracts examples, generates MDX, etc.)
echo "$LOG_PREFIX Running npm run prebuild..."
if npm run prebuild > /tmp/prebuild.log 2>&1; then
  echo "$LOG_PREFIX ✓ prebuild completed successfully"
else
  echo "$LOG_PREFIX ✗ prebuild failed (see /tmp/prebuild.log for details)"
  tail -20 /tmp/prebuild.log
  exit 1
fi

echo "$LOG_PREFIX Setup complete!"
echo "========================================"

exit 0
