# Phase 2 Self-Hosting: Implementation Guide

## Overview

Phase 2 requires integrating the existing Dygram parser, generator, and runtime implementations with the bootstrap executor. This creates a self-hosting system where Dygram machines can be processed and executed using Dygram itself.

## Documentation Files

This analysis provides three documents:

1. **PHASE2_ANALYSIS.md** - Comprehensive deep-dive into all components
   - Parser implementation details
   - All 4+ generator types (JSON, Graphviz, HTML, Markdown)
   - Graph validator and error handling
   - RailsExecutor execution model
   - Data flow and type conversions

2. **PHASE2_FUNCTION_REFERENCE.md** - Quick lookup guide
   - Function signatures for all key APIs
   - Integration patterns for bootstrap tools
   - Type definitions and interfaces
   - Import statements by file
   - Critical conversion functions

3. **PHASE2_README.md** - This file
   - Quick start guide
   - Component overview
   - Integration checklist
   - Testing strategy

## Quick Start: 5-Step Integration

### Step 1: Parse Dygram Source (parse_dygram tool)

**Goal**: Convert DSL string to Langium AST

**Files**: `src/language/main.ts`, `src/language/machine-module.ts`

**Integration**:
```typescript
import { createMachineServices } from './machine-module.js';

async function parse_dygram_impl(code: string, filepath?: string) {
    const services = createMachineServices();
    // Call parser (exact API TBD from machine-module.ts)
    const machine = await services.parser.parse(code);
    return { ast: machine, errors: [] };
}
```

### Step 2: Validate Machine Structure (validate_machine tool)

**Goal**: Check for cycles, unreachable nodes, missing entry/exit points

**Files**: `src/language/graph-validator.ts`

**Integration**:
```typescript
import { GraphValidator } from './graph-validator.js';

function validate_machine_impl(machine: Machine) {
    const validator = new GraphValidator(machine);
    const result = validator.validate();
    const stats = validator.getStatistics();
    return { valid: result.valid, errors: result, statistics: stats };
}
```

**What it checks**:
- Entry/exit points exist
- No orphaned nodes (isolated from graph)
- No cycles (unless expected)
- No unreachable nodes
- Graph connectivity

### Step 3: Generate JSON (generate_json tool)

**Goal**: Convert Langium AST to flattened MachineJSON

**Files**: `src/language/generator/generator.ts`

**Integration**:
```typescript
import { generateJSON } from './generator/generator.js';

function generate_json_impl(machine: Machine) {
    const result = generateJSON(machine);
    const machineJson = JSON.parse(result.content);
    return { json: result.content, machineJson };
}
```

**Importance**: MachineJSON is the intermediate format used by:
- Diagram generators
- Runtime executor
- DSL round-trip (generate_dsl)

### Step 4: Generate Diagrams (generate_graphviz tool)

**Goal**: Create visual Graphviz DOT diagrams

**Files**: `src/language/diagram/graphviz-generator.ts`, `src/language/generator/generator.ts`

**Integration**:
```typescript
import { generateGraphviz } from './generator/generator.js';
// OR
import { generateGraphvizFromJSON } from './diagram/graphviz-generator.js';

function generate_graphviz_impl(machine: Machine) {
    const result = generateGraphviz(machine, '', undefined);
    return { dot: result.content };
}
```

**Diagram capabilities**:
- Static DOT diagrams (for Graphviz rendering)
- Runtime DOT (with execution state overlay)
- SVG rendering (via WASM)
- Validation warnings visualization
- Mobile-optimized variants

### Step 5: Execute Machine (execute_machine tool)

**Goal**: Run the machine through all states

**Files**: `src/language/rails-executor.ts`

**Challenge**: Requires MachineData format (flat structure), not Langium AST

**Integration**:
```typescript
import { RailsExecutor } from './rails-executor.js';
import { generateJSON } from './generator/generator.js';

async function execute_machine_impl(machine: Machine, config?: any) {
    // Step 1: Convert Machine AST to MachineJSON
    const jsonResult = generateJSON(machine);
    const machineJson = JSON.parse(jsonResult.content);
    
    // Step 2: Convert MachineJSON to MachineData
    const machineData = convertJsonToMachineData(machineJson);
    
    // Step 3: Create executor and run
    const executor = await RailsExecutor.create(machineData, config);
    const result = await executor.execute();
    
    return {
        success: true,
        result: {
            currentNode: result.currentNode,
            visitedNodes: Array.from(result.visitedNodes),
            history: result.history
        }
    };
}
```

---

## Component Summary Table

| Component | Input | Output | Where | Priority |
|-----------|-------|--------|-------|----------|
| **Parser** | DSL string | Machine AST | main.ts + machine-module.ts | P0 |
| **Validator** | Machine AST | Validation result | graph-validator.ts | P0 |
| **JSON Generator** | Machine AST | MachineJSON string | generator/generator.ts | P0 |
| **Graphviz Generator** | Machine AST | DOT string | diagram/graphviz-generator.ts | P0 |
| **Executor** | MachineData | Execution result | rails-executor.ts | P0 |
| **HTML Generator** | Machine AST | HTML string | generator/generator.ts | P1 |
| **Markdown Generator** | Machine AST | Markdown string | generator/generator.ts | P1 |
| **DSL Generator** | MachineJSON | DSL string | generator/generator.ts | P1 |
| **Type Checker** | Machine AST | Type errors | type-checker.ts | P2 |

---

## Critical Data Flow

```
DSL Source Code
    ↓ [parse_dygram]
Machine AST (Langium)
    ↓ [validate_machine]
Validation Result
    │
    ├─→ [generate_json]
    │   └→ MachineJSON (serialized)
    │       ├─→ [generate_graphviz]
    │       │   └→ DOT Diagram
    │       ├─→ [generate_html]
    │       │   └→ Interactive HTML
    │       ├─→ [generate_markdown]
    │       │   └→ Documentation
    │       └─→ [generate_dsl]
    │           └→ Optimized DSL
    │
    └─→ [execute_machine] (via MachineData conversion)
        └→ Execution Result
            - Visited nodes
            - Execution history
            - Final state
```

---

## Key Integration Points

### 1. Machine AST Type
- **Source**: Langium-generated in `src/generated/ast.ts`
- **Used by**: Parser, generators, validator, executor
- **Note**: Full type information, but more complex than MachineData

### 2. MachineJSON Type
- **Location**: `src/language/diagram/types.ts`
- **Purpose**: Simplified, serializable format
- **Used by**: Diagram generators, DSL round-trip
- **Conversion**: Via `generateJSON()` function

### 3. MachineData Type
- **Location**: `src/language/base-executor.ts`
- **Purpose**: Runtime execution format (flat)
- **Conversion**: From MachineJSON (TBD)
- **Note**: Must handle parent relationships manually

### 4. ValidationContext
- **Location**: `src/language/validation-errors.ts`
- **Purpose**: Collects errors during validation
- **Used by**: Diagram generation (visualization of warnings)
- **Integration**: Pass to DiagramOptions

---

## Conversion Functions Needed

### 1. AST → JSON
**Function**: `generateJSON()` - Already implemented
**Returns**: FileGenerationResult with JSON content
**Usage**: Parse result → MachineJSON

### 2. AST → MachineData
**Status**: Needs implementation
**Challenge**: Must flatten node hierarchy
**Where**: Use JSONGenerator as reference
**Example**:
```typescript
function astToMachineData(machine: Machine): MachineData {
    // Use JSONGenerator.serializeNodes() logic
    const jsonGen = new JSONGenerator(machine);
    const json = JSON.parse(jsonGen.generate().content);
    return jsonToMachineData(json);
}
```

### 3. JSON → MachineData
**Status**: Needs implementation
**Simplicity**: Direct mapping
**Example**:
```typescript
function jsonToMachineData(json: MachineJSON): MachineData {
    return {
        title: json.title || '',
        nodes: json.nodes.map(n => ({ name: n.name, type: n.type, ... })),
        edges: json.edges.map(e => ({ source: e.source, target: e.target, ... }))
    };
}
```

---

## Testing Checklist

### Basic Parsing
- [ ] Parse valid Dygram machine
- [ ] Parse machine with all node types (init, state, task, context)
- [ ] Parse nested/hierarchical machines
- [ ] Handle parse errors gracefully

### Validation
- [ ] Detect cycles
- [ ] Find unreachable nodes
- [ ] Find orphaned nodes
- [ ] Identify missing entry/exit points
- [ ] Pass validation on well-formed machines

### Generation
- [ ] JSON output is valid and parseable
- [ ] DOT output renders to diagrams
- [ ] HTML contains executable machine
- [ ] Markdown has all sections
- [ ] DSL round-trip produces valid code

### Execution
- [ ] Simple linear machine (A → B → C)
- [ ] Branching machine (multiple paths)
- [ ] With state modules (nested nodes)
- [ ] With context nodes
- [ ] Agent decisions (if LLM available)
- [ ] Automatic transitions
- [ ] Cycle detection

### Integration
- [ ] All tools available in BootstrapTools
- [ ] Tools return correct format
- [ ] Errors are caught and reported
- [ ] Context preserved between steps
- [ ] Machine definition accessible

---

## Known Limitations & TODOs

### Parser
- **TODO**: Get exact API from machine-module.ts
- **TODO**: Verify error handling mechanism

### Conversion
- **TODO**: Implement AST → MachineData conversion
- **TODO**: Handle parent relationship tracking
- **TODO**: Support nested/hierarchical machines

### Executor
- **TODO**: Verify MachineData format expectations
- **TODO**: LLM integration (Agent SDK bridge)
- **TODO**: Handle execution timeouts properly

### Validation
- **TODO**: Determine if cycles are always errors or sometimes valid
- **TODO**: Define strictness levels

---

## Phase 2 Success Criteria

1. Bootstrap tools can parse any valid Dygram
2. Validator finds all structural issues
3. JSON generator produces round-trip-safe format
4. Diagram generators produce visualizations
5. Executor runs simple machines end-to-end
6. Error messages are helpful and actionable
7. All major machine features supported
8. Performance acceptable for typical machines

---

## File Organization

```
src/language/
├── main.ts                          [Parser entry point]
├── machine-module.ts                [Parser services]
├── generator/
│   └── generator.ts                 [All generators: JSON, Graphviz, HTML, Markdown, DSL]
├── diagram/
│   ├── graphviz-generator.ts        [Graphviz API]
│   ├── graphviz-dot-diagram.ts      [DOT generation]
│   ├── index.ts                     [Public diagram API]
│   └── types.ts                     [MachineJSON, DiagramOptions]
├── graph-validator.ts               [Graph validation]
├── type-checker.ts                  [Type validation]
├── rails-executor.ts                [Runtime execution]
├── base-executor.ts                 [Base types & executor]
├── agent-context-builder.ts         [Agent prompt building]
├── bootstrap-tools.ts               [Bootstrap tool registry]
├── bootstrap-executor.ts            [Minimal bootstrap runtime]
├── validation-errors.ts             [Error types]
└── [other supporting files]
```

---

## Next Actions

1. **Verify Parser API**
   - Check `createMachineServices()` exact signature
   - Find `parseDocument()` or equivalent
   - Understand error reporting

2. **Test AST Structure**
   - Parse example machine
   - Inspect Machine, Node, Edge types
   - Verify hierarchy support

3. **Implement Converters**
   - AST → MachineJSON (leverage JSONGenerator)
   - MachineJSON → MachineData (direct mapping)
   - Test round-trip conversion

4. **Wire Bootstrap Tools**
   - Implement each tool in bootstrap-tools.ts
   - Test each individually
   - Test integration between tools

5. **Execute Test Machine**
   - Simple 3-node machine (init → task → end)
   - Test with agent decisions
   - Test with automatic transitions

---

## References

- **Detailed Analysis**: See PHASE2_ANALYSIS.md
- **Function Reference**: See PHASE2_FUNCTION_REFERENCE.md
- **Langium Docs**: https://langium.org/
- **Graphviz DOT Spec**: https://graphviz.org/doc/info/lang.html
- **Agent SDK**: Anthropic Claude Agent SDK documentation

