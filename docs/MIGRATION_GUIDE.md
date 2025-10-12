# Migration Guide

This guide helps you migrate your code to the latest version of DyGram.

## Deprecated LLM Client Wrappers (v0.3.5)

**Status**: `AnthropicClient` and `BedrockClient` have been removed in favor of unified `ClaudeClient`.

### Why the Change?

The wrapper classes were thin delegations to `ClaudeClient` that added no value:
- Removed ~122 lines of duplicate code
- Simplified API surface
- Direct access to transport selection

### Migration Steps

#### Before (Deprecated):

```typescript
// Old Anthropic pattern
import { AnthropicClient } from './language/anthropic-client.js';

const client = new AnthropicClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  modelId: 'claude-3-5-haiku-20241022'
});

// Old Bedrock pattern
import { BedrockClient } from './language/bedrock-client.js';

const client = new BedrockClient({
  region: 'us-west-2',
  modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0'
});

// Old factory pattern
import { createLLMClient } from './language/llm-client.js';

const client = await createLLMClient({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
});
```

#### After (Current):

```typescript
// New unified pattern - Anthropic API
import { ClaudeClient } from './language/claude-client.js';

const client = new ClaudeClient({
  transport: 'api',
  apiKey: process.env.ANTHROPIC_API_KEY,
  modelId: 'claude-3-5-haiku-20241022'
});

// New unified pattern - AWS Bedrock
const client = new ClaudeClient({
  transport: 'bedrock',
  region: 'us-west-2',
  modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0'
});
```

### Configuration Changes

If you're using `MachineExecutorConfig`:

#### Before:

```typescript
const config = {
  llm: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    modelId: 'claude-3-5-haiku-20241022'
  }
};

// Or legacy bedrock config
const config = {
  bedrock: {
    region: 'us-west-2',
    modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0'
  }
};
```

#### After:

```typescript
const config = {
  llm: {
    provider: 'anthropic',  // or 'bedrock'
    apiKey: process.env.ANTHROPIC_API_KEY,  // for 'anthropic'
    region: 'us-west-2',  // for 'bedrock'
    modelId: 'claude-3-5-haiku-20241022'
  }
};

// The BaseExecutor will automatically create ClaudeClient
// with the correct transport based on provider
```

### Test Migration

If you're mocking clients in tests:

#### Before:

```typescript
import { BedrockClient } from '../../src/language/bedrock-client.js';

vi.mock('../../src/language/bedrock-client', () => {
  return {
    BedrockClient: vi.fn().mockImplementation(() => ({
      invokeModel: vi.fn(),
      invokeWithTools: vi.fn(),
      // ...
    }))
  };
});
```

#### After:

```typescript
import { ClaudeClient } from '../../src/language/claude-client.js';

vi.mock('../../src/language/claude-client', () => {
  return {
    ClaudeClient: vi.fn().mockImplementation(() => ({
      invokeModel: vi.fn(),
      invokeWithTools: vi.fn(),
      // ...
    }))
  };
});
```

### Breaking Changes Summary

| Removed | Replacement |
|---------|-------------|
| `import { AnthropicClient }` | `import { ClaudeClient }` with `transport: 'api'` |
| `import { BedrockClient }` | `import { ClaudeClient }` with `transport: 'bedrock'` |
| `new AnthropicClient({ apiKey })` | `new ClaudeClient({ transport: 'api', apiKey })` |
| `new BedrockClient({ region })` | `new ClaudeClient({ transport: 'bedrock', region })` |
| `createLLMClient({ provider })` | Still works (deprecated), but use `ClaudeClient` directly |

### Need Help?

If you encounter issues during migration:
1. Check the [LLM Client Usage](./LlmClientUsage.mdx) documentation
2. Review the [examples](../examples/) for updated patterns
3. Open an issue on GitHub

## ToolRegistry (Coming Soon)

The `ToolRegistry` class is being introduced to centralize tool management. Full migration guide will be provided once the integration is complete.

**Current Status**: ToolRegistry class created, integration with executors pending.

### Preview

```typescript
import { ToolRegistry } from './language/tool-registry.js';

const registry = new ToolRegistry();

// Register static tools
registry.registerStatic(
  {
    name: 'my_tool',
    description: 'My custom tool',
    input_schema: { type: 'object', properties: {} }
  },
  async (name, input) => {
    // Tool implementation
    return { result: 'success' };
  }
);

// Register dynamic tool patterns
registry.registerDynamic('transition_to_', async (name, input) => {
  const target = name.replace('transition_to_', '');
  // Handle transition
  return { success: true, target };
});

// Execute tools
const result = await registry.executeTool('my_tool', { data: 'value' });
```

More details will be added as the integration progresses.
