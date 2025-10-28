# Bootstrap Implementation - Phase 1

## Overview

This document describes the Phase 1 implementation of the Dygram self-hosting architecture, focusing on the **Layer 1: Minimal Bootstrap Core**.

## Goals

Phase 1 establishes the foundation for self-hosting by creating:

1. **Minimal Bootstrap Executor** (~300 lines): Core primitive operations for machine execution
2. **Bootstrap Tools Interface**: Mapping between bootstrap and existing TypeScript implementations
3. **Example Machine**: Demonstration of bootstrap execution
4. **Test Suite**: Comprehensive tests validating bootstrap functionality

## Architecture

### Layer 1: Bootstrap Core

The bootstrap core provides the minimal set of operations needed to execute Dygram machines:

```typescript
interface BootstrapCore {
    loadMachine(source: string): MachineData;
    executeNode(nodeName: string, machineData: MachineData, context: BootstrapContext): Promise<NodeResult>;
    followEdge(fromNode: string, toNode: string, machineData: MachineData, context: BootstrapContext): Promise<void>;
    invokeTool(toolName: string, input: any, context: BootstrapContext): Promise<any>;
    registerTool(name: string, implementation: BootstrapToolFunction): void;
}
```

### Key Design Decisions

1. **Minimal Functionality**: Only essential operations - no complex features
2. **Tool-Based Extension**: All non-primitive operations exposed as tools
3. **Simple Context**: Lightweight execution context tracking only essentials
4. **No Dependencies**: Bootstrap executor has minimal dependencies on other Dygram components

## Implementation

### Files Created

#### 1. `src/language/bootstrap-executor.ts`

The minimal executor implementing `BootstrapCore` interface:

- **BootstrapExecutor class**: Core executor with primitive operations
- **executeNode()**: Execute single nodes based on type (Task, Input, Context, Result, State)
- **followEdge()**: Transition between nodes
- **invokeTool()**: Call registered tools
- **registerTool()**: Register tool implementations
- **Context management**: Track execution state, visited nodes, invocation counts

**Key Features:**
- Node type handling (Task, Input, Context, Result, State)
- Tool invocation from Task nodes via `uses` attribute
- Attribute initialization and capture
- Transition history tracking
- Simple value parsing (string, number, boolean)

#### 2. `src/language/bootstrap-tools.ts`

Core tool definitions that bridge bootstrap to existing implementations:

**Core Tools:**
- `parse_dygram`: Parse Dygram source → AST (wraps `src/language/main.ts`)
- `validate_machine`: Validate machine structure (wraps `src/language/graph-validator.ts`)
- `generate_json`: Generate JSON output (wraps `src/language/generator/generator.ts`)
- `generate_graphviz`: Generate DOT visualization (wraps `src/language/diagram/graphviz-generator.ts`)
- `execute_machine`: Execute machine with rails pattern (wraps `src/language/rails-executor.ts`)

**Meta-Tools:**
- `construct_tool`: Dynamically construct new tools (wraps `src/language/meta-tool-manager.ts`)
- `get_machine_definition`: Get machine definition (wraps meta-tool-manager)
- `update_definition`: Update machine definition (wraps meta-tool-manager)

**Tool Contracts:**
Each tool has documented input/output schemas and implementation mappings.

#### 3. `examples/bootstrap/hello-bootstrap.dygram`

Simple demonstration machine showing:
- Tool invocation via `uses` attribute
- Linear workflow execution
- Integration with bootstrap tools
- Documentation via note nodes

#### 4. `test/unit/bootstrap-executor.test.ts`

Comprehensive test suite covering:
- Tool registration and invocation
- Node execution (all types)
- Edge following and transitions
- Context management
- Error handling
- Invocation tracking

## Usage

### Creating a Bootstrap Executor

```typescript
import { createBootstrapExecutor } from './src/language/bootstrap-executor.js';
import { BootstrapTools } from './src/language/bootstrap-tools.js';

// Create executor with core tools
const executor = createBootstrapExecutor(BootstrapTools.getCoreTools());

// Register custom tool
executor.registerTool('my_tool', async (input, context) => {
    return { result: 'custom' };
});
```

### Executing a Machine

```typescript
// Load machine data
const machineData: MachineData = {
    title: 'Example',
    nodes: [
        { name: 'start', type: 'Task' },
        { name: 'end', type: 'Result' }
    ],
    edges: [
        { source: 'start', target: 'end' }
    ]
};

// Execute nodes
const context = executor.getContext();
let result = await executor.executeNode('start', machineData, context);

// Follow transition
await executor.followEdge('start', 'end', machineData, context);
result = await executor.executeNode('end', machineData, context);

console.log('Result:', result.output);
```

### Tool Invocation from Machines

In a Dygram machine, tasks can invoke tools:

```dygram
Task validateSystem {
    description: "Validate this machine";
    uses: "validate_machine";
}
```

The bootstrap executor will automatically invoke the registered `validate_machine` tool when executing this node.

## Integration Points

### Connecting Bootstrap Tools to Existing Code

Currently, bootstrap tools are **placeholder implementations** that throw errors indicating where integration is needed:

```typescript
static parse_dygram: BootstrapTool = {
    name: 'parse_dygram',
    description: 'Parse Dygram source code to AST',
    implementation: async (input, context) => {
        // TODO: Integrate with src/language/main.ts:parseDocument
        throw new Error('parse_dygram requires integration...');
    }
};
```

**Next Steps for Full Integration:**

1. **Import existing implementations** into `bootstrap-tools.ts`
2. **Adapt signatures** to match bootstrap tool interface
3. **Handle context** appropriately (bootstrap context vs. full execution context)
4. **Test integration** with real parsing, validation, generation

Example integration for `validate_machine`:

```typescript
import { GraphValidator } from './graph-validator.js';

static validate_machine: BootstrapTool = {
    name: 'validate_machine',
    description: 'Validate machine structure',
    implementation: async (input: { machine: MachineData }, context: BootstrapContext) => {
        const validator = new GraphValidator();
        const errors = validator.validate(input.machine);
        return {
            valid: errors.length === 0,
            errors: errors.map(e => e.message)
        };
    }
};
```

## Testing

Run the bootstrap executor tests:

```bash
npm run test test/unit/bootstrap-executor.test.ts
```

Expected results:
- All tool registration tests pass ✓
- All node execution tests pass ✓
- All edge following tests pass ✓
- All context management tests pass ✓

## Limitations

### Current Phase 1 Limitations:

1. **No Full Parser Integration**: `loadMachine()` requires tool integration
2. **Simplified Value Parsing**: Only handles basic types (string, number, boolean)
3. **No CEL Expression Evaluation**: Complex expressions not supported
4. **No Agent Integration**: Pure programmatic execution only
5. **No Condition Evaluation**: Edge conditions not evaluated
6. **Placeholder Tool Implementations**: Tools need connection to existing code

### Intentional Simplifications:

These are **by design** for minimal bootstrap:
- No complex type checking (relies on tools)
- No optimization or caching
- No parallel execution
- No sophisticated error recovery
- No execution visualization

## Next Steps (Phase 2)

Phase 2 will implement **Layer 2: Dygram-in-Dygram** machines:

1. **Complete Tool Integration**: Connect all bootstrap tools to existing implementations
2. **Parser Machine**: Define parser as a Dygram machine using `parse_dygram` tool
3. **Generator Machine**: Define generator as a Dygram machine
4. **Runtime Machine**: Define runtime executor as a self-describing machine
5. **Full Self-Hosting Example**: Machine that parses, validates, generates, and executes another machine

## Benefits

Phase 1 delivers:

✓ **Foundation for Self-Hosting**: Minimal core that can bootstrap higher layers
✓ **Clear Separation**: Bootstrap primitives vs. tool-based functionality
✓ **Test Coverage**: Comprehensive tests ensure correctness
✓ **Documentation**: Clear contracts and integration points
✓ **Extensibility**: Easy to add new tools without modifying core

## Conclusion

Phase 1 successfully establishes Layer 1 of the self-hosting architecture. The bootstrap executor provides the minimal foundation needed to execute Dygram machines using primitive operations and registered tools.

With this foundation in place, Phase 2 can implement the parser, generator, and runtime as Dygram machines themselves, enabling true self-hosting where Dygram machines define and execute Dygram.

---

**Implementation Date**: 2025-10-28
**Status**: Phase 1 Complete - Ready for Tool Integration and Phase 2
**Generated with Claude Code**
