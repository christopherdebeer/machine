# Claude Code Sub-agents

This directory contains sub-agent configurations for specialized tasks.

## Available Sub-agents

### `dygram-test-responder`

**Purpose:** Process DyGram test requests intelligently to create test recordings.

**Model:** Haiku (fast and cost-effective)

**Auto-loaded Skills:** `Interactive-generative-test`

**When to use:**
```
Use the dygram-test-responder agent to process DyGram test requests
```

**Key features:**
- Processes test requests with intelligent decision-making
- Creates high-quality recordings for CI/playback testing
- Uses semantic understanding, not pattern matching
- Optimized for speed with Haiku model
- Operates in isolated context for dedicated focus

## How Sub-agents Work

Sub-agents are specialized AI assistants with:
- **Dedicated context windows** (separate from main conversation)
- **Specific tool access** (configured per agent)
- **Auto-loaded skills** (can load relevant capabilities)
- **Model selection** (can use different models than main session)

## Creating New Sub-agents

Use the interactive builder:
```
/agents
```

Then select "Create New Agent" and configure:
1. Name (lowercase, hyphens)
2. Description (when to invoke)
3. Tools (which tools it can access)
4. Model (sonnet, opus, haiku, or inherit)
5. Skills (auto-load specific capabilities)

## Documentation

See official docs: https://code.claude.com/docs/en/sub-agents
