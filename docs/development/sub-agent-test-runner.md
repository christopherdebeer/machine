# Sub-agent Test Runner

This document describes how to use Claude Code's Task tool with a specialized sub-agent for running DyGram execution tests with the agent responder.

## Overview

The sub-agent approach leverages Claude Code's existing agent system to automate test execution workflows. Instead of creating a separate MCP server or using manual steps, you can launch a specialized agent that handles the entire test execution process autonomously.

## When to Use

Use the sub-agent approach when:

- You need automated test execution from within Claude Code
- You want to run tests as part of a larger workflow
- You're building complex multi-step processes that include testing
- You need programmatic control over test execution

## How It Works

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
│  - Monitor results  │
│  - Report back      │
└──────────┬──────────┘
           │
           │ Controls
           │
┌──────────▼──────────┐
│  Test Infrastructure│
│  - Agent Responder  │
│  - Test Runner      │
│  - Recordings       │
└─────────────────────┘
```

## Sub-agent Definition

The sub-agent is defined with specific capabilities and a detailed system prompt that guides its behavior.

### Agent Type

**Name:** `dygram-test-runner`

**Description:** Specialized agent for running DyGram execution tests with agent responder

**Tools Available:**
- `Bash` - For running commands
- `Read` - For reading test output and logs
- `TodoWrite` - For tracking test execution progress
- `Grep` - For searching test output

### System Prompt

```markdown
You are a specialized agent for running DyGram execution tests with the agent responder.

## Your Mission

Execute DyGram execution tests in interactive mode, monitor the agent responder, and provide comprehensive results to the parent agent.

## Workflow

### Step 1: Start Agent Responder

Start the agent responder in background:
```bash
node scripts/test-agent-responder.js &
```

Save the process ID for cleanup later. Wait 2 seconds for initialization.

### Step 2: Run Tests

Execute tests in interactive mode:
```bash
DYGRAM_TEST_MODE=interactive npm test test/validating/ 2>&1 | tee /tmp/test-output.log
```

This will:
- Run all execution tests
- Send requests to agent responder
- Record responses for CI playback
- Save output to /tmp/test-output.log

### Step 3: Monitor Progress

While tests run, periodically check agent responder activity:
- Count "📨 Received request" messages
- Count "✅ Sent response" messages
- Check for any errors

### Step 4: Analyze Results

After tests complete:

1. Parse test results:
```bash
grep -E "Test Files|Tests" /tmp/test-output.log
```

2. Count new recordings:
```bash
git status --short test/fixtures/recordings/ | grep "^??" | wc -l
```

3. List recording categories:
```bash
ls -1 test/fixtures/recordings/
```

### Step 5: Cleanup

Stop the agent responder:
```bash
pkill -f test-agent-responder
```

## Important Rules

1. **Always cleanup** - Stop agent responder even if tests fail
2. **Capture everything** - Save all output for analysis
3. **Report clearly** - Provide structured summary to parent agent
4. **Track progress** - Use TodoWrite to show what you're doing
5. **Handle failures** - Report errors gracefully with context

## Output Format

Provide a summary report in this format:

```
🧪 DyGram Test Execution Results
=================================

✅ Test Summary:
  - Passed: X tests
  - Failed: Y tests
  - Skipped: Z tests

🤖 Agent Responder Activity:
  - Requests processed: N
  - Responses sent: N
  - Errors: N

📝 Recordings:
  - New recordings: N files
  - Categories: list
  - Total size: X KB

📊 Status: SUCCESS/FAILURE

💡 Next Steps:
  - [Recommended actions based on results]
```

## Error Handling

If anything fails:
1. Capture error messages
2. Save relevant logs
3. Stop agent responder
4. Report failure with diagnostic info

## Success Criteria

A successful run means:
- Agent responder started and received requests
- Tests executed (pass or fail is reported)
- Recordings created and saved
- Clean shutdown of all processes
- Clear report delivered to parent
```

## Usage Examples

### Example 1: Basic Test Execution

From the main Claude agent:

```javascript
const result = await Task({
  subagent_type: "general-purpose",
  description: "Run DyGram execution tests",
  prompt: `You are a specialized agent for running DyGram execution tests.

Your task:
1. Start the agent responder: node scripts/test-agent-responder.js &
2. Run tests: DYGRAM_TEST_MODE=interactive npm test test/validating/
3. Monitor both processes
4. Report results with test counts and new recordings
5. Stop the responder when done

Provide a clear summary of test results, agent activity, and recordings.`
});
```

### Example 2: Test Specific Category

```javascript
const result = await Task({
  subagent_type: "general-purpose",
  description: "Run task execution tests only",
  prompt: `Run DyGram task execution tests with agent responder.

Steps:
1. Start agent responder in background
2. Run: DYGRAM_TEST_MODE=interactive npm test test/validating/task-execution.test.ts
3. Monitor and report results
4. Clean up processes

Focus on task execution tests only, not tool tests.`
});
```

### Example 3: Test with Recording Analysis

```javascript
const result = await Task({
  subagent_type: "general-purpose",
  description: "Run tests and analyze recordings",
  prompt: `Run DyGram execution tests and provide detailed recording analysis.

Tasks:
1. Start agent responder
2. Run all execution tests
3. After completion, analyze recordings:
   - Count by category
   - Show tool selection patterns
   - Analyze agent reasoning
4. Report comprehensive results
5. Stop responder

Use scripts/analyze-recordings.sh for detailed analysis.`
});
```

### Example 4: Automated Test Script

```javascript
const result = await Task({
  subagent_type: "general-purpose",
  description: "Run tests using helper script",
  prompt: `Use the helper script to run DyGram execution tests.

Simple workflow:
1. Execute: ./scripts/run-execution-tests.sh
2. Report the output
3. If tests pass, suggest committing recordings

The script handles all the details (starting responder, running tests, cleanup).`
});
```

## Integration with Helper Scripts

The sub-agent can use the helper scripts for simplified workflows:

### Using run-execution-tests.sh

```bash
# Let the script handle everything
./scripts/run-execution-tests.sh

# Run specific tests
./scripts/run-execution-tests.sh test/validating/task-execution.test.ts

# Use playback mode
./scripts/run-execution-tests.sh test/validating/ playback
```

### Using analyze-recordings.sh

```bash
# Analyze all recordings
./scripts/analyze-recordings.sh

# Analyze specific category
./scripts/analyze-recordings.sh task-execution

# Verbose output
./scripts/analyze-recordings.sh --verbose
```

## Best Practices

### 1. Use TodoWrite for Progress Tracking

The sub-agent should use TodoWrite to show what it's doing:

```javascript
TodoWrite({
  todos: [
    { content: "Start agent responder", status: "in_progress", activeForm: "Starting responder" },
    { content: "Run execution tests", status: "pending", activeForm: "Running tests" },
    { content: "Analyze recordings", status: "pending", activeForm: "Analyzing recordings" },
    { content: "Stop responder and cleanup", status: "pending", activeForm: "Cleaning up" }
  ]
});
```

### 2. Handle Long-Running Operations

Tests can take 30-60 seconds. The sub-agent should:
- Show progress indicators
- Report when tests are still running
- Not timeout prematurely

### 3. Provide Actionable Results

Results should include:
- Clear pass/fail status
- Specific counts (tests, recordings, etc.)
- Recommended next steps
- Links to logs for debugging

### 4. Clean Error Reporting

If something fails:
- Explain what went wrong
- Show relevant error messages
- Suggest how to fix it
- Still attempt cleanup

## Comparison with Other Approaches

| Feature | Sub-agent | Skill | Scripts | MCP Server |
|---------|-----------|-------|---------|------------|
| Automation | ✅ Full | ⭐ Guided | ⭐ Manual | ✅ Full |
| Ease of Use | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Setup Time | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Flexibility | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Reusability | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**Use sub-agent when:**
- You need automation within larger workflows
- You want programmatic control
- You're building custom CI/CD pipelines
- You need flexible error handling

**Use skill when:**
- You want guided manual execution
- You're learning the process
- You need step-by-step instructions

**Use scripts when:**
- You want direct command-line usage
- You're running tests frequently
- You prefer shell-based workflows

**Use MCP server when:**
- You need standardized interface
- You want to share across projects
- You're building production tools

## Troubleshooting

### Sub-agent hangs or times out

**Cause:** Tests taking longer than expected

**Solution:**
- Increase task timeout
- Run smaller test subsets
- Use playback mode for faster runs

### Agent responder not receiving requests

**Cause:** Process not started or wrong queue directory

**Solution:**
- Verify responder process is running: `ps aux | grep test-agent-responder`
- Check queue directory exists: `ls .dygram-test-queue`
- Review responder logs for errors

### Recordings not created

**Cause:** Test mode set to playback or recording disabled

**Solution:**
- Ensure DYGRAM_TEST_MODE=interactive
- Check InteractiveTestClient configuration
- Verify recordings directory permissions

## See Also

- Main implementation proposals: `docs/development/agent-responder-mcp-integration.md`
- Skill documentation: `.claude/skills/dygram-test.md`
- Helper scripts: `scripts/run-execution-tests.sh`
- Test documentation: `test/CLAUDE.md`
