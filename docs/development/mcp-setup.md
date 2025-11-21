# MCP Setup for Local Development

## Overview

This repository includes a `.mcp.json` configuration file that enables Model Context Protocol (MCP) servers for local development. This provides the same browser automation tools locally that are available in the GitHub Actions CI environment.

## Configured MCP Servers

### Playwright MCP

The Playwright MCP server provides browser automation capabilities for testing and development:

- **Server**: `@playwright/mcp@latest`
- **Purpose**: Browser automation, testing, and web interaction tools
- **Usage**: Enables Claude Code to interact with web browsers for testing the DyGram playground and other web components

## Setup Instructions

### Prerequisites

- Node.js and npm installed
- Claude Code or Claude Desktop with MCP support

### Local Development Setup

1. **Clone the repository** (if not already done)
2. **Install dependencies**: The Playwright MCP server will be automatically available via `npx`
3. **Optional environment variables**:
   ```bash
   export PLAYWRIGHT_EXTRA_HTTP_HEADERS='{"custom-header": "value"}'
   ```

### Using MCP Tools

When working with Claude Code in this repository:

1. **Automatic detection**: Claude Code will automatically detect the `.mcp.json` configuration
2. **Approval prompt**: You may be prompted to approve the project-scoped MCP servers on first use
3. **Available tools**: Browser automation tools will be available for:
   - Testing the web playground
   - Automating browser interactions
   - Taking screenshots and analyzing web content
   - Running end-to-end tests

### Example Usage

With the Playwright MCP enabled, you can ask Claude Code to:

```
"Open the playground in a browser and test the state machine visualization"
"Take a screenshot of the current playground state"
"Test the syntax highlighting in the web editor"
```

## Configuration Details

The `.mcp.json` file contains:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": {
        "PLAYWRIGHT_EXTRA_HTTP_HEADERS": "${PLAYWRIGHT_EXTRA_HTTP_HEADERS:-{}}"
      }
    }
  }
}
```

### Environment Variables

- `PLAYWRIGHT_EXTRA_HTTP_HEADERS`: Optional JSON string for custom HTTP headers (defaults to empty object)

## Troubleshooting

### Common Issues

1. **"MCP server failed to start"**
   - Ensure Node.js and npm are installed
   - Check that `npx` is available in your PATH

2. **"Permission denied for project MCP servers"**
   - Approve the servers when prompted by Claude Code
   - Use `claude mcp reset-project-choices` to reset approval choices if needed

3. **Browser automation not working**
   - Ensure you have the necessary browser dependencies installed
   - The Playwright MCP will handle browser installation automatically

### Getting Help

- Check the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)
- Review the GitHub Actions workflow in `.github/workflows/claude.yml` for the CI configuration
- Consult the main project documentation in `docs/`

## Relationship to CI Environment

This local MCP configuration mirrors the setup used in GitHub Actions:

- **Consistency**: Same tools available locally and in CI
- **Testing**: Enables local testing of browser automation workflows
- **Development**: Supports interactive development with browser tools

The GitHub Actions workflow includes additional MCP servers (like GitHub integration) that are not included in the local configuration for security and simplicity.
