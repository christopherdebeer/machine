# Changelog

All notable changes to DyGram will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed 🗑️

- **BREAKING**: Removed `AnthropicClient` wrapper class (-61 LOC)
  - **Migration**: Use `ClaudeClient` with `transport: 'api'` instead
  - See [Migration Guide](docs/MIGRATION_GUIDE.md) for details

- **BREAKING**: Removed `BedrockClient` wrapper class (-61 LOC)
  - **Migration**: Use `ClaudeClient` with `transport: 'bedrock'` instead
  - See [Migration Guide](docs/MIGRATION_GUIDE.md) for details

### Changed 🔄

- Updated `base-executor.ts` to use `ClaudeClient` directly with transport parameter
- Updated `llm-client.ts` factory function to create `ClaudeClient` instances
- Updated test mocks to use `ClaudeClient` instead of deprecated wrappers

### Added ✨

- **NEW**: `ToolRegistry` class for centralized tool management
  - Static tool registration with handlers
  - Dynamic pattern matching (e.g., `transition_to_*`, `read_*`, `write_*`)
  - Unified execution interface
  - Tool querying and filtering
  - **Status**: Class created, executor integration pending

- **NEW**: [Migration Guide](docs/MIGRATION_GUIDE.md) documenting breaking changes

### Migration Guide

#### Before (Deprecated):
```typescript
// Old pattern
import { AnthropicClient } from './language/anthropic-client.js';
const client = new AnthropicClient({ apiKey: 'key' });

// Or
import { BedrockClient } from './language/bedrock-client.js';
const client = new BedrockClient({ region: 'us-west-2' });
```

#### After (Current):
```typescript
// New unified pattern
import { ClaudeClient } from './language/claude-client.js';

// For Anthropic API
const client = new ClaudeClient({
  transport: 'api',
  apiKey: 'key'
});

// For AWS Bedrock
const client = new ClaudeClient({
  transport: 'bedrock',
  region: 'us-west-2'
});
```

See [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md) for complete migration instructions.

### Related Issues

- #146 - Epic: Short Term - Remove Deprecated Code & Centralize Tools
- #142 - Refine: Deep review and analysis

---

## [0.3.5] - 2024-XX-XX

### Previous Releases

For older releases, see git history.

---

*Generated with [Claude Code](https://claude.ai/code)*
