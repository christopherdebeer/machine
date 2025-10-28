# Bootstrap Executor - Experimental Feature

## Overview

The Bootstrap Executor is an **experimental** alternative to the production RailsExecutor. It provides a minimal (~400 line) implementation of the Dygram execution model, designed to support the self-hosting architecture.

## Status: Experimental

⚠️ **This feature is experimental and has limited functionality compared to the production executor.**

### What Works
- ✓ Basic execution loop with step limits
- ✓ Node invocation tracking
- ✓ Simple node type execution (Task, Input, Context, Result, State)
- ✓ Tool registration and invocation
- ✓ 5 core tools integrated (parse, validate, generate_json, generate_graphviz, execute)
- ✓ Basic edge following
- ✓ Execution history tracking

### What's Missing
- ✗ Agent SDK integration (no LLM calls)
- ✗ Meta-tools (construct_tool, get_machine_definition, update_definition)
- ✗ Advanced condition evaluation
- ✗ Machine self-modification callbacks
- ✗ Mutation tracking
- ✗ Complex edge conditions (CEL expressions)
- ✗ Rails pattern features (automatic vs agent-controlled transitions)

## Usage

### Enable Bootstrap Executor

Use the `--use-bootstrap` flag with the execute command:

```bash
# Production executor (default)
dygram execute examples/basic/simple-flow.dygram

# Experimental bootstrap executor
dygram execute examples/basic/simple-flow.dygram --use-bootstrap
```

### Programmatic Usage

```typescript
import { createExecutor } from './language/executor-factory.js';
import { MachineData } from './language/base-executor.js';

const machineData: MachineData = { /* ... */ };

// Create bootstrap executor
const executor = await createExecutor(machineData, {
    useBootstrap: true,
    limits: {
        maxSteps: 1000,
        maxNodeInvocations: 100
    }
});

// Execute
const result = await executor.execute();
console.log('Final node:', result.currentNode);
console.log('Visited:', Array.from(result.visitedNodes));
```

## Architecture

### Executor Factory

The `executor-factory.ts` provides a unified interface for creating executors:

```typescript
export async function createExecutor(
    machineData: MachineData,
    config: MachineExecutorConfig = {}
): Promise<UnifiedExecutor>
```

Based on `config.useBootstrap`, it returns either:
- **RailsExecutor** (production): Full features, Agent SDK, meta-tools
- **BootstrapExecutor** (experimental): Minimal core, basic execution

### Bootstrap Executor Core

Location: `src/language/bootstrap-executor.ts`

**Key Methods:**
- `loadMachine(source: string)` - Parse and validate machine (placeholder)
- `executeNode(...)` - Execute single node
- `followEdge(...)` - Transition between nodes
- `invokeTool(...)` - Call registered tool
- `registerTool(...)` - Register tool implementation
- `execute()` - Full execution loop

### Bootstrap Tools

Location: `src/language/bootstrap-tools.ts`

**Core Tools (Functional):**
1. `parse_dygram` - Parse Dygram source → AST
2. `validate_machine` - Validate structure, detect cycles
3. `generate_json` - Generate JSON representation
4. `generate_graphviz` - Generate DOT diagram
5. `execute_machine` - Execute using RailsExecutor

**Meta-Tools (Placeholders):**
1. `construct_tool` - Dynamically create tools (requires MetaToolManager)
2. `get_machine_definition` - Get current machine def (requires context)
3. `update_definition` - Modify machine (requires context)

## Configuration

### MachineExecutorConfig

```typescript
interface MachineExecutorConfig {
    // Experimental flag
    useBootstrap?: boolean;

    // Execution limits
    limits?: {
        maxSteps?: number;              // Default: 1000
        maxNodeInvocations?: number;    // Default: 100
        timeout?: number;               // Not used in bootstrap
        cycleDetectionWindow?: number;  // Not used in bootstrap
    };

    // LLM config (not used in bootstrap)
    llm?: LLMClientConfig;
    agentSDK?: AgentSDKBridgeConfig;
}
```

## Comparison

| Feature | RailsExecutor | BootstrapExecutor |
|---------|---------------|-------------------|
| **Size** | ~3000+ lines | ~460 lines |
| **Agent SDK** | ✓ Full integration | ✗ Not supported |
| **Meta-tools** | ✓ Supported | ✗ Placeholders only |
| **Tool Registry** | ✓ Dynamic registry | ✓ Basic registry |
| **Conditions** | ✓ CEL evaluation | ✗ Not implemented |
| **Self-modification** | ✓ Supported | ✗ Not supported |
| **Rails Pattern** | ✓ Automatic + agent | ✗ Sequential only |
| **Performance** | Optimized | Basic |
| **Use Case** | Production | Self-hosting research |

## Development Roadmap

### Phase 1: Core (Complete ✓)
- [x] Basic execution loop
- [x] Tool registration
- [x] Core tools integration
- [x] CLI flag support
- [x] Executor factory

### Phase 2: loadMachine (To Do)
- [ ] Implement parse_dygram call
- [ ] Implement validate_machine call
- [ ] Convert AST → MachineData
- [ ] Error handling

### Phase 3: Meta-Tools (To Do)
- [ ] Integrate MetaToolManager
- [ ] Implement construct_tool
- [ ] Implement get_machine_definition
- [ ] Implement update_definition

### Phase 4: Advanced Execution (To Do)
- [ ] Condition evaluation (CEL)
- [ ] Agent tool invocations
- [ ] Automatic vs manual transitions
- [ ] Cycle detection improvements

### Phase 5: Self-Hosting (To Do)
- [ ] Layer 2 machines execution
- [ ] Layer 3 meta-system
- [ ] End-to-end self-hosting workflow

## Testing

### Unit Tests

Bootstrap executor has dedicated tests:
- `test/unit/bootstrap-executor.test.ts` - 18 tests (all passing)

```bash
npm test -- bootstrap-executor
```

### Integration Tests

Self-hosting integration tests:
- `test/integration/self-hosting.test.ts`

```bash
npm test -- self-hosting
```

## Troubleshooting

### "Tool not found" Error

```
Error: Tool not found: parse_dygram
```

**Solution:** Ensure tools are registered before execution:

```typescript
import { BootstrapTools } from './language/bootstrap-tools.js';

const executor = new BootstrapExecutor(machineData);

// Register core tools
for (const tool of BootstrapTools.getCoreTools()) {
    executor.registerTool(tool.name, tool.implementation);
}
```

### "loadMachine requires tools" Error

```
Error: loadMachine requires parse_dygram and validate_machine tools to be registered
```

**Solution:** `loadMachine()` is not yet implemented. Use parsed MachineData directly:

```typescript
import { generateJSON } from './language/generator/generator.js';
import { extractAstNode } from './cli/cli-util.js';

// Parse manually
const machine = await extractAstNode<Machine>(fileName, services);
const jsonContent = generateJSON(machine, fileName);
const machineData = JSON.parse(jsonContent.content);

// Create executor with machineData
const executor = new BootstrapExecutor(machineData);
```

### "Meta-tool requires MetaToolManager" Error

```
Error: construct_tool requires MetaToolManager instance
```

**Solution:** Meta-tools are not yet implemented in bootstrap executor. Use RailsExecutor for meta-tool functionality:

```bash
# Remove --use-bootstrap flag
dygram execute your-machine.dygram
```

## Contributing

To complete the bootstrap executor:

1. **Implement loadMachine()** - Priority: High
   - File: `src/language/bootstrap-executor.ts:123`
   - Call parse_dygram and validate_machine tools
   - Return MachineData

2. **Implement meta-tools** - Priority: Medium
   - File: `src/language/bootstrap-tools.ts:182-222`
   - Integrate with MetaToolManager
   - Support dynamic tool construction

3. **Add condition evaluation** - Priority: Low
   - Integrate CelEvaluator
   - Support edge conditions
   - Implement automatic transitions

## See Also

- [Self-Hosting Design](./self-hosting-design.md) - Overall architecture
- [Self-Hosting Implementation](./self-hosting-implementation.md) - Implementation guide
- [Bootstrap Implementation](./bootstrap-implementation.md) - Phase 1 details
- [Rails Executor](../src/language/rails-executor.ts) - Production executor

## License

Same as Dygram project.
