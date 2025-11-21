# Agent Responder MCP Integration Proposals

## Executive Summary

This document evaluates different approaches for exposing DyGram's test agent responder functionality through Model Context Protocol (MCP), making it easier for Claude to run interactive execution tests. The goal is to provide a seamless developer experience where Claude can autonomously test state machines with intelligent agent responses.

## Current State

### Test Agent Responder

The test agent responder (`scripts/test-agent-responder.js`) is a Node.js script that:

- Watches a file-based queue for LLM invocation requests
- Makes intelligent tool selection decisions based on prompt analysis
- Records responses for CI playback
- Enables interactive testing of DyGram state machines

### Current Workflow

```bash
# Terminal 1: Start agent responder
node scripts/test-agent-responder.js

# Terminal 2: Run tests
DYGRAM_TEST_MODE=interactive npm test test/validating/
```

**Pain Points:**
1. Requires manual coordination of two processes
2. Not discoverable for Claude without explicit instructions
3. Cannot be triggered programmatically by AI assistants
4. Lacks standardized interface for automation

## Integration Options

### Option 1: Dedicated MCP Server

**Implementation:** Create a standalone DyGram MCP server that exposes test execution as MCP tools.

#### Architecture

```
┌─────────────────────┐
│   Claude Code       │
│                     │
│  Uses MCP Tools     │
└──────────┬──────────┘
           │
           │ MCP Protocol
           │
┌──────────▼──────────┐
│  DyGram MCP Server  │
│                     │
│  - run_test         │
│  - start_responder  │
│  - get_recordings   │
│  - stop_responder   │
└──────────┬──────────┘
           │
           │ Internal
           │
┌──────────▼──────────┐
│  Test Infrastructure│
│                     │
│  - Agent Responder  │
│  - Test Runner      │
│  - Recording System │
└─────────────────────┘
```

#### MCP Tools Exposed

**1. `run_execution_tests`**
```json
{
  "name": "run_execution_tests",
  "description": "Run DyGram execution tests with interactive agent responder",
  "inputSchema": {
    "type": "object",
    "properties": {
      "testPattern": {
        "type": "string",
        "description": "Test file pattern (e.g., 'test/validating/' or 'task-execution')",
        "default": "test/validating/"
      },
      "recordMode": {
        "type": "string",
        "enum": ["interactive", "playback"],
        "description": "Whether to record new responses or use existing recordings",
        "default": "interactive"
      },
      "timeout": {
        "type": "number",
        "description": "Test timeout in milliseconds",
        "default": 60000
      }
    }
  }
}
```

**2. `get_test_recordings`**
```json
{
  "name": "get_test_recordings",
  "description": "Get details about test recordings",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Recording category (task-execution, tool-execution, etc.)"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of recordings to return",
        "default": 10
      }
    }
  }
}
```

**3. `analyze_test_results`**
```json
{
  "name": "analyze_test_results",
  "description": "Analyze test results and provide insights",
  "inputSchema": {
    "type": "object",
    "properties": {
      "testRun": {
        "type": "string",
        "description": "Test run identifier or 'latest'"
      }
    }
  }
}
```

#### Implementation

```javascript
// scripts/mcp-server.js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import { z } from 'zod';

const server = new McpServer({
  name: 'dygram-test-server',
  version: '1.0.0'
});

// Register run_execution_tests tool
server.tool(
  'run_execution_tests',
  'Run DyGram execution tests with interactive agent responder',
  {
    testPattern: z.string().optional().default('test/validating/'),
    recordMode: z.enum(['interactive', 'playback']).optional().default('interactive'),
    timeout: z.number().optional().default(60000)
  },
  async ({ testPattern, recordMode, timeout }) => {
    // Start agent responder
    const responder = spawn('node', ['scripts/test-agent-responder.js']);

    // Run tests
    const testProcess = spawn('npm', ['test', testPattern], {
      env: { ...process.env, DYGRAM_TEST_MODE: recordMode }
    });

    // Collect results
    const results = await collectTestResults(testProcess);

    // Stop responder
    responder.kill();

    return {
      content: [{
        type: 'text',
        text: formatTestResults(results)
      }]
    };
  }
);

// Additional tools...
```

#### Configuration

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": {
        "PLAYWRIGHT_EXTRA_HTTP_HEADERS": "${PLAYWRIGHT_EXTRA_HTTP_HEADERS:-{}}"
      }
    },
    "dygram-test": {
      "command": "node",
      "args": ["scripts/mcp-server.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

#### Pros
- ✅ Standard MCP interface
- ✅ Works with any MCP client (Claude Code, Claude Desktop, etc.)
- ✅ Discoverable through MCP tool listing
- ✅ Clean separation of concerns
- ✅ Can be reused across projects

#### Cons
- ❌ Requires implementing full MCP server
- ❌ Adds new dependency (@modelcontextprotocol/sdk)
- ❌ More complex to maintain
- ❌ Overhead of running separate server process

#### Effort Estimate
- **Implementation:** 4-6 hours
- **Testing:** 2-3 hours
- **Documentation:** 1-2 hours
- **Total:** 7-11 hours

---

### Option 2: Sub-agent via Task Tool

**Implementation:** Use Claude Code's existing Task tool to launch a specialized agent for test execution.

#### Architecture

```
┌─────────────────────┐
│   Claude (Main)     │
│                     │
│  Launches Task tool │
└──────────┬──────────┘
           │
           │ Task tool invocation
           │
┌──────────▼──────────┐
│  Test Execution     │
│  Sub-agent          │
│                     │
│  - Start responder  │
│  - Run tests        │
│  - Report results   │
└──────────┬──────────┘
           │
           │ Controls
           │
┌──────────▼──────────┐
│  Test Infrastructure│
└─────────────────────┘
```

#### Usage

```typescript
// Define agent type in Claude Code's agent system
{
  name: "dygram-test-runner",
  description: "Specialized agent for running DyGram execution tests with agent responder",
  tools: ["Bash", "Read", "TodoWrite"],
  systemPrompt: `You are a specialized agent for running DyGram execution tests.

Your tasks:
1. Start the agent responder in background: node scripts/test-agent-responder.js
2. Run tests: DYGRAM_TEST_MODE=interactive npm test test/validating/
3. Monitor output for failures
4. Report results back to main agent
5. Stop the responder

Always check test results and recordings before completing.`
}
```

#### Integration Example

Main agent would use:

```javascript
// When user asks to run tests
await Task({
  subagent_type: "dygram-test-runner",
  description: "Run execution tests",
  prompt: "Run all execution tests in test/validating/ and report results. Include recording statistics."
});
```

#### Pros
- ✅ No new infrastructure needed
- ✅ Leverages existing agent system
- ✅ Can be customized per project
- ✅ Minimal code changes

#### Cons
- ❌ Less discoverable (requires knowing to use Task tool)
- ❌ Not reusable outside Claude Code ecosystem
- ❌ Agent must manually orchestrate processes
- ❌ More verbose workflow

#### Effort Estimate
- **Implementation:** 1-2 hours (just documentation/configuration)
- **Testing:** 1 hour
- **Documentation:** 1 hour
- **Total:** 3-4 hours

---

### Option 3: Claude Code Skill

**Implementation:** Create a skill that provides guided test execution workflows.

#### Architecture

```
┌─────────────────────┐
│   Claude Code       │
│                     │
│  Invokes Skill      │
└──────────┬──────────┘
           │
           │ Skill execution
           │
┌──────────▼──────────┐
│  dygram-test Skill  │
│                     │
│  Expanded Prompt    │
│  + Instructions     │
└──────────┬──────────┘
           │
           │ Guides Claude
           │
┌──────────▼──────────┐
│  Claude executes    │
│  with Bash, Read,   │
│  TodoWrite tools    │
└─────────────────────┘
```

#### Implementation

Create `.claude/skills/dygram-test.md`:

```markdown
# DyGram Test Execution Skill

This skill helps run DyGram execution tests with the agent responder.

## What this skill does

1. Starts the agent responder in background
2. Runs execution tests in interactive mode
3. Monitors test output and agent responder activity
4. Collects and analyzes test recordings
5. Reports comprehensive results

## Step-by-step instructions

### Step 1: Start Agent Responder

```bash
node scripts/test-agent-responder.js &
```

Save the process ID for cleanup.

### Step 2: Run Tests

```bash
DYGRAM_TEST_MODE=interactive npm test test/validating/ 2>&1 | tee /tmp/test-output.log
```

### Step 3: Monitor Responder

Check the agent responder output to verify it's processing requests:
- Look for "📨 Received request" messages
- Verify "✅ Sent response" confirmations
- Note any errors

### Step 4: Analyze Results

After tests complete:
1. Check test pass/fail status
2. Count new recordings: `git status --short test/fixtures/recordings/`
3. Review test output for failures
4. Summarize agent responder activity

### Step 5: Cleanup

Stop the agent responder process.

## Expected output

Provide a summary including:
- Total tests run (passed/failed)
- Number of agent responses generated
- New recordings created
- Any errors or warnings
- Recommendations for next steps
```

#### Usage

User invokes:
```
/dygram-test
```

or

```typescript
await Skill({ command: "dygram-test" });
```

#### Pros
- ✅ User-friendly, discoverable
- ✅ Guided workflow
- ✅ Can include examples and best practices
- ✅ Easy to update and maintain
- ✅ No code dependencies

#### Cons
- ❌ Limited to Claude Code
- ❌ Less programmatic control
- ❌ Skill is just expanded prompt (no actual automation)
- ❌ Requires user to invoke explicitly

#### Effort Estimate
- **Implementation:** 0.5-1 hour
- **Testing:** 0.5 hour
- **Documentation:** 0.5 hour
- **Total:** 1.5-2 hours

---

### Option 4: Enhanced MCP Configuration + Helper Scripts

**Implementation:** Extend `.mcp.json` with test-specific configuration and provide helper scripts that can be invoked directly.

#### Architecture

```
┌─────────────────────┐
│   Claude Code       │
│                     │
│  Reads .mcp.json    │
│  config             │
└──────────┬──────────┘
           │
           │ Uses configured scripts
           │
┌──────────▼──────────┐
│  Helper Scripts     │
│                     │
│  - run-test.sh      │
│  - analyze-tests.sh │
└──────────┬──────────┘
           │
           │ Controls
           │
┌──────────▼──────────┐
│  Test Infrastructure│
└─────────────────────┘
```

#### Implementation

**Extend `.mcp.json`:**

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
  },
  "dygramConfig": {
    "testing": {
      "scripts": {
        "runTests": "scripts/run-execution-tests.sh",
        "analyzeRecordings": "scripts/analyze-recordings.sh",
        "cleanRecordings": "scripts/clean-recordings.sh"
      },
      "testMode": "interactive",
      "queueDir": ".dygram-test-queue",
      "recordingsDir": "test/fixtures/recordings"
    }
  }
}
```

**Create `scripts/run-execution-tests.sh`:**

```bash
#!/bin/bash
# Run execution tests with agent responder

set -e

TEST_PATTERN="${1:-test/validating/}"
RECORD_MODE="${2:-interactive}"

echo "🚀 Starting DyGram execution tests"
echo "   Test pattern: $TEST_PATTERN"
echo "   Record mode: $RECORD_MODE"
echo ""

# Start agent responder
echo "📡 Starting agent responder..."
node scripts/test-agent-responder.js &
RESPONDER_PID=$!

# Wait for responder to initialize
sleep 2

# Run tests
echo "🧪 Running tests..."
DYGRAM_TEST_MODE=$RECORD_MODE npm test "$TEST_PATTERN" 2>&1 | tee /tmp/dygram-test-output.log

# Capture test exit code
TEST_EXIT_CODE=${PIPESTATUS[0]}

# Stop responder
echo "🛑 Stopping agent responder..."
kill $RESPONDER_PID 2>/dev/null || true

# Analyze results
echo ""
echo "📊 Test Results:"
grep -E "Test Files|Tests" /tmp/dygram-test-output.log | tail -2

echo ""
echo "📝 New Recordings:"
git status --short test/fixtures/recordings/ | wc -l

exit $TEST_EXIT_CODE
```

**Create `scripts/analyze-recordings.sh`:**

```bash
#!/bin/bash
# Analyze test recordings

RECORDINGS_DIR="test/fixtures/recordings"

echo "📊 Recording Analysis"
echo "===================="
echo ""

for category in "$RECORDINGS_DIR"/*; do
  if [ -d "$category" ]; then
    category_name=$(basename "$category")
    count=$(find "$category" -name "*.json" | wc -l)
    echo "$category_name: $count recordings"
  fi
done

echo ""
echo "Recent recordings:"
find "$RECORDINGS_DIR" -name "*.json" -mtime -1 -exec ls -lh {} \; | tail -10
```

#### Usage

Claude would invoke:

```bash
# Run all execution tests
./scripts/run-execution-tests.sh

# Run specific test pattern
./scripts/run-execution-tests.sh test/validating/task-execution.test.ts

# Analyze recordings
./scripts/analyze-recordings.sh
```

#### Pros
- ✅ Simple, straightforward
- ✅ No external dependencies
- ✅ Easy to maintain and modify
- ✅ Works with standard shell tools
- ✅ Can be version controlled

#### Cons
- ❌ Not standardized (custom scripts)
- ❌ Limited discoverability
- ❌ Requires documentation
- ❌ Shell scripts less portable

#### Effort Estimate
- **Implementation:** 2-3 hours
- **Testing:** 1 hour
- **Documentation:** 1 hour
- **Total:** 4-5 hours

---

## Comparison Matrix

| Criterion | MCP Server | Sub-agent | Skill | Scripts |
|-----------|-----------|-----------|-------|---------|
| **Ease of Use** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Discoverability** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Implementation Effort** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Maintenance** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Reusability** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Standardization** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Programmatic Control** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |

## Recommendations

### Short Term: Option 3 (Skill) + Option 4 (Scripts)

**Rationale:**
1. **Quick implementation** - Can be done in 2-3 hours total
2. **Immediate value** - Provides usable workflow right away
3. **Iterative improvement** - Can refine based on usage
4. **No dependencies** - Uses existing infrastructure

**Implementation Plan:**
1. Create skill file: `.claude/skills/dygram-test.md`
2. Create helper scripts: `scripts/run-execution-tests.sh`, `scripts/analyze-recordings.sh`
3. Update `.mcp.json` with testing configuration
4. Add documentation to `docs/development/`

### Medium Term: Option 1 (MCP Server)

**Rationale:**
1. **Standardized interface** - Follows MCP best practices
2. **Better integration** - Works with all MCP clients
3. **Professional quality** - Production-ready solution
4. **Reusable** - Can be published as npm package

**Implementation Plan:**
1. Install `@modelcontextprotocol/sdk`
2. Implement MCP server in `scripts/mcp-server.js`
3. Register tools for test execution, recording analysis
4. Add to `.mcp.json` configuration
5. Create comprehensive documentation
6. Optionally publish as `@dygram/mcp-server`

### Long Term: All Options

**Rationale:**
Each option serves different use cases:
- **MCP Server** - For programmatic integration
- **Sub-agent** - For complex multi-step workflows
- **Skill** - For guided user workflows
- **Scripts** - For direct command-line usage

## Next Steps

1. ✅ **Validate proposals** - Review with team
2. ⏳ **Implement short-term solution** - Skill + Scripts (2-3 hours)
3. ⏳ **Test and document** - Verify workflow (1 hour)
4. ⏳ **Gather feedback** - Use in real scenarios
5. ⏳ **Plan MCP server** - If valuable, implement full server (7-11 hours)

## Appendix: MCP Server Example Code

### Full Server Implementation

```javascript
// scripts/mcp-server.js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class DygramTestServer {
  constructor() {
    this.server = new McpServer({
      name: 'dygram-test-server',
      version: '1.0.0'
    });

    this.responderProcess = null;
    this.setupTools();
  }

  setupTools() {
    // Tool: run_execution_tests
    this.server.tool(
      'run_execution_tests',
      'Run DyGram execution tests with interactive agent responder',
      {
        testPattern: z.string().optional().default('test/validating/'),
        recordMode: z.enum(['interactive', 'playback']).optional().default('interactive'),
        timeout: z.number().optional().default(60000)
      },
      async ({ testPattern, recordMode, timeout }) => {
        try {
          // Start responder if not already running
          if (!this.responderProcess) {
            await this.startResponder();
          }

          // Run tests
          const testOutput = await this.runTests(testPattern, recordMode, timeout);

          // Analyze results
          const analysis = await this.analyzeResults(testOutput);

          return {
            content: [{
              type: 'text',
              text: this.formatResults(analysis)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error running tests: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Tool: get_test_recordings
    this.server.tool(
      'get_test_recordings',
      'Get information about test recordings',
      {
        category: z.string().optional(),
        limit: z.number().optional().default(10)
      },
      async ({ category, limit }) => {
        const recordings = await this.getRecordings(category, limit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(recordings, null, 2)
          }]
        };
      }
    );

    // Tool: analyze_agent_performance
    this.server.tool(
      'analyze_agent_performance',
      'Analyze agent responder performance and decision patterns',
      {},
      async () => {
        const analysis = await this.analyzeAgentPerformance();
        return {
          content: [{
            type: 'text',
            text: this.formatAnalysis(analysis)
          }]
        };
      }
    );
  }

  async startResponder() {
    return new Promise((resolve, reject) => {
      this.responderProcess = spawn('node', ['scripts/test-agent-responder.js']);

      // Wait for initialization
      setTimeout(() => resolve(), 2000);

      this.responderProcess.on('error', reject);
    });
  }

  async runTests(testPattern, recordMode, timeout) {
    const { stdout, stderr } = await execAsync(
      `DYGRAM_TEST_MODE=${recordMode} npm test ${testPattern}`,
      { timeout, maxBuffer: 10 * 1024 * 1024 }
    );

    return { stdout, stderr };
  }

  async analyzeResults(testOutput) {
    // Parse test output
    const passedMatch = testOutput.stdout.match(/(\d+) passed/);
    const failedMatch = testOutput.stdout.match(/(\d+) failed/);

    // Get new recordings
    const { stdout: gitStatus } = await execAsync(
      'git status --short test/fixtures/recordings/'
    );
    const newRecordings = gitStatus.split('\n').filter(l => l.startsWith('??')).length;

    return {
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      failed: failedMatch ? parseInt(failedMatch[1]) : 0,
      newRecordings,
      output: testOutput.stdout
    };
  }

  async getRecordings(category, limit) {
    const recordingsDir = 'test/fixtures/recordings';
    const targetDir = category ? path.join(recordingsDir, category) : recordingsDir;

    const files = await fs.readdir(targetDir, { recursive: true });
    const recordings = files
      .filter(f => f.endsWith('.json'))
      .slice(0, limit)
      .map(f => path.join(targetDir, f));

    return await Promise.all(
      recordings.map(async (file) => {
        const content = await fs.readFile(file, 'utf-8');
        return { file, data: JSON.parse(content) };
      })
    );
  }

  async analyzeAgentPerformance() {
    const recordings = await this.getRecordings(null, 1000);

    const toolCounts = {};
    const reasoningPatterns = {};

    for (const { data } of recordings) {
      // Count tool selections
      const toolName = data.response?.response?.content
        ?.find(c => c.type === 'tool_use')?.name;
      if (toolName) {
        toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
      }

      // Analyze reasoning patterns
      const reasoning = data.response?.reasoning;
      if (reasoning) {
        const pattern = reasoning.split(',')[0]; // First reasoning phrase
        reasoningPatterns[pattern] = (reasoningPatterns[pattern] || 0) + 1;
      }
    }

    return { toolCounts, reasoningPatterns, totalRecordings: recordings.length };
  }

  formatResults(analysis) {
    return `
Test Results:
=============
✅ Passed: ${analysis.passed}
❌ Failed: ${analysis.failed}
📝 New Recordings: ${analysis.newRecordings}

${analysis.failed > 0 ? '⚠️ Some tests failed. Check output for details.' : '🎉 All tests passed!'}
    `.trim();
  }

  formatAnalysis(analysis) {
    const topTools = Object.entries(analysis.toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => `  - ${tool}: ${count}`)
      .join('\n');

    return `
Agent Performance Analysis:
===========================
Total Recordings: ${analysis.totalRecordings}

Top Tools Used:
${topTools}

Reasoning Patterns:
${Object.entries(analysis.reasoningPatterns)
  .slice(0, 3)
  .map(([pattern, count]) => `  - "${pattern}": ${count}`)
  .join('\n')}
    `.trim();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  async shutdown() {
    if (this.responderProcess) {
      this.responderProcess.kill();
    }
  }
}

// Start server
const server = new DygramTestServer();
await server.start();

// Handle shutdown
process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});
```

### Package.json Updates

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  },
  "scripts": {
    "mcp:test": "node scripts/mcp-server.js"
  }
}
```

## Conclusion

This document provides four viable approaches for integrating the agent responder with Claude via MCP. The recommended path is to start with the Skill + Scripts approach for immediate value, then evolve to a full MCP server implementation for long-term standardization and reusability.

Each option has been evaluated for feasibility, effort, and suitability, with concrete implementation examples provided.
