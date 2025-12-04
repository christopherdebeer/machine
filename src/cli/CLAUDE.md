# CLI Development Guidelines

## Command Structure

All CLI commands follow consistent patterns:

```typescript
// Command handler signature
export async function handler(args: CommandArgs): Promise<void>

// Always provide clear error messages
// Always support --help flag
// Always validate inputs before processing
```

## Output Formats

Commands support multiple output formats via `--format` flag:

- `text` - Human-readable (default)
- `json` - Machine-readable
- `quiet` - Minimal output

See `docs/cli/output-formats.md` for full specification.

## Interactive Mode

Interactive execution requires:

1. State management between steps
2. User input validation
3. Clear progress indicators
4. Graceful error recovery

See `docs/cli/interactive-mode.md` for implementation details.

## Execution Management

For stateful execution (batch, interactive):

- Use `ExecutionManager` for state persistence
- Support checkpointing at step boundaries
- Enable resume from any checkpoint
- Maintain execution context across steps

See `docs/cli/exec-management.md` for architecture details.

## Command Implementation Checklist

- [ ] Implements standard handler signature
- [ ] Supports `--help` flag
- [ ] Validates all inputs
- [ ] Supports multiple output formats
- [ ] Provides clear error messages
- [ ] Includes usage examples in help text
- [ ] Documented in `docs/cli/commands/`

## Building and using the cli

When using the cli you should run `npm run build:cli` and potentially (one-off per session) `npm link .` to have cli `dy --help` for testing and iteration.
