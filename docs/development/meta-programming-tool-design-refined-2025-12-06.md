# Meta-Programming Tool Design: Refined Integration with Existing Features

**Date**: 2025-12-06
**Status**: Design Refinement
**Related**: [Original Design](./meta-programming-tool-design-2025-12-06.md)

## Executive Summary

After reviewing existing DyGram features highlighted by the maintainer, this document refines the original meta-programming tool proposal to **build on** rather than **reinvent** existing architecture:

**Existing features to leverage:**
1. **Semantic nesting & namespaces** - Qualified names, context inheritance
2. **State modules** - Natural scoping boundaries with auto entry/exit
3. **@meta annotation** - Implicit region/scope definition
4. **Context read/write edges** - Explicit permission tracking
5. **Code generation** - LLM→code evolution path
6. **Execution logs** - Rich execution history for agent context

## Key Realizations

### 1. State Modules ARE Regions

**Original proposal:** Introduce "regions" as new concept
```typescript
machine "Payment System" {
  regions: {
    core: { nodes: [...], locked: true },
    extensions: { nodes: [...], locked: false }
  }
}
```

**Refined approach:** **State modules already provide natural boundaries**
```dy
machine "Payment System"

// Core payment logic (locked module)
state CorePayment @meta(locked: true) {
    task validateCard { prompt: "Validate card"; }
    task processPayment { prompt: "Process payment"; }
    validateCard -> processPayment;
}

// Extensions (editable module)
state PaymentExtensions @meta(editable: true) {
    task handleRefund { prompt: "Process refund"; }
    task fraudCheck { prompt: "Check for fraud"; }
}

// Agent can query: get_module_permissions({ moduleName: 'CorePayment' })
// Returns: { canModify: false, reason: '@meta(locked: true)' }
```

**Benefits:**
- ✅ Uses existing state module semantics (entry/exit routing, nesting)
- ✅ No new syntax required (just leverage @meta annotation)
- ✅ Qualified names already work (`CorePayment.validateCard`)
- ✅ Context inheritance already scopes data access

---

### 2. @meta Annotation Defines Scoping

**Current state:** `@meta` converts to `meta: true` attribute (being fixed)

**Proposed enhancement:** Use `@meta` to define meta-programming scope

```dy
// Locked: Agent cannot modify
state CoreLogic @meta(locked: true) {
    task criticalStep;
}

// Editable: Agent can modify within this module
state Extensions @meta(editable: true) {
    task experimentalFeature;
}

// Meta-programming node: This task can modify the machine
task Optimizer @meta(scope: "global") {
    prompt: "Analyze and optimize the machine structure";
}

// Local scope: Can only modify siblings/children
task LocalImprover @meta(scope: "local") {
    prompt: "Improve error handling in this module";
}
```

**Scope semantics:**
- `@meta(locked: true)` - Cannot be modified (read-only)
- `@meta(editable: true)` - Can be modified (default for unmarked nodes)
- `@meta(scope: "global")` - Can view/modify entire machine
- `@meta(scope: "local")` - Can only view/modify within parent module
- `@meta(scope: "module:Extensions")` - Can only modify specified module

**Query permissions:**
```typescript
get_modification_permissions({
  nodeName: 'CoreLogic.criticalStep',
  requesterNode: 'LocalImprover'  // who's asking?
})
// Returns: {
//   canModify: false,
//   reason: 'Parent module CoreLogic has @meta(locked: true)',
//   allowedScopes: ['Extensions']  // where can requester modify?
// }
```

---

### 3. Use Qualified Names for Scoped Operations

**Original proposal:** Separate `get_node_definition`, `get_region_definition`

**Refined approach:** **Single scoped query using qualified names**

```typescript
// Get single node with context
get_scoped_definition({
  path: 'DataPipeline.ValidationPhase.validate',
  includeNeighbors: 1,
  includeContext: true  // Include contexts this node reads/writes
})
// Returns: Node + incoming/outgoing edges + context nodes it accesses

// Get entire module (state module with children)
get_scoped_definition({
  path: 'DataPipeline.ValidationPhase',  // Path to state module
  includeNeighbors: 0  // Don't include external neighbors
})
// Returns: All nodes within ValidationPhase module + internal edges

// Get module + boundary
get_scoped_definition({
  path: 'DataPipeline.ValidationPhase',
  includeBoundary: true  // Include edges crossing module boundary
})
// Returns: Module + edges connecting to external nodes
```

**Benefits:**
- ✅ Leverages existing qualified name system
- ✅ State modules provide natural scope boundaries
- ✅ Single tool handles node/module/context queries

---

### 4. Context Inheritance Solves Unconnected Node Problem

**Original problem:** "If nodes are unconnected, hard to know which contexts to include"

**Solution:** **Use state module hierarchy + context inheritance**

```dy
// Global context
context GlobalConfig {
    apiUrl: "https://api.example.com";
}

state DataPipeline {
    context PipelineState {
        recordsProcessed: 0;
    }

    state ValidationPhase {
        task validate {
            prompt: "Validate data";
            // Automatically inherits read access to:
            // - GlobalConfig (parent's parent context)
            // - PipelineState (parent context)
        }
    }
}

// Explicit edge from parent
DataPipeline -reads-> GlobalConfig;
```

**Scoped query leverages inheritance:**
```typescript
get_scoped_definition({
  path: 'DataPipeline.ValidationPhase.validate'
})
// Returns:
// {
//   node: { name: 'validate', ... },
//   accessibleContexts: {
//     inherited: ['GlobalConfig', 'PipelineState'],  // From ancestors
//     explicit: []  // From direct edges
//   }
// }
```

**Benefits:**
- ✅ Context inheritance automatically determines scope
- ✅ No need to guess which contexts are relevant
- ✅ Follows natural parent→child access patterns

---

### 5. Execution Logs Provide Agent Context

**Existing feature:** `ExecutionLogger` with rich categories

**Expose to agents via meta-tool:**

```typescript
get_execution_logs({
  filters: {
    category: 'error' | 'transition' | 'context' | 'tool' | 'agent',
    level: 'error' | 'warn' | 'info',
    nodePath: 'DataPipeline.ValidationPhase.*',  // Pattern matching
    timeRange: {
      last: 10  // Last 10 entries
      // OR
      since: '2025-12-06T10:00:00Z'
    }
  },
  format: 'summary' | 'detailed'
})

// Returns:
// {
//   entries: [
//     {
//       timestamp: 1733486400000,
//       level: 'error',
//       category: 'transition',
//       message: 'Transition failed: condition evaluated to false',
//       data: {
//         fromNode: 'validate',
//         toNode: 'process',
//         condition: 'data.isValid === true',
//         contextState: { 'data.isValid': false }
//       }
//     }
//   ],
//   summary: {
//     totalErrors: 3,
//     failedTransitions: 2,
//     failedTools: 1
//   }
// }
```

**Use case: Agent debugging**
```
Agent prompt:
"The pipeline is failing at validation. Get recent error logs to understand why."

Agent calls:
get_execution_logs({
  filters: { category: 'error', nodePath: 'DataPipeline.ValidationPhase.*', last: 5 }
})

Agent discovers:
"Validation is failing because 'data.isValid' is false. The condition expects true.
I should modify the validation logic or update the condition."
```

**Benefits:**
- ✅ Agents can inspect execution history
- ✅ Understand why transitions failed
- ✅ See which tools were called and their results
- ✅ Make informed modification decisions

---

### 6. Support LLM→Code Evolution

**Existing feature:** `construct_tool` with `code_generation` strategy

**Add evolution capability:**

```typescript
// Original: Agent-backed tool
construct_tool({
  name: 'calculate_total',
  description: 'Calculate order total',
  input_schema: { items: 'array' },
  implementation_strategy: 'agent_backed',
  implementation_details: 'Sum item prices and apply tax'
})

// After observing execution patterns, evolve to code
evolve_tool_implementation({
  toolName: 'calculate_total',
  newStrategy: 'code_generation',
  implementation: `
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const tax = total * 0.08;
    return { subtotal: total, tax, total: total + tax };
  `,
  reason: 'Deterministic calculation - no LLM needed'
})

// Tool now executes code directly instead of calling LLM
```

**Evolution workflow:**
```
1. Initial: Task with prompt (LLM execution)
   └─> task calculatePrice { prompt: "Calculate price..." }

2. Create tool: Agent-backed (still LLM, but reusable)
   └─> construct_tool({ strategy: 'agent_backed', ... })

3. Observe patterns: Agent notices deterministic behavior
   └─> get_execution_logs({ filters: { tool: 'calculate_total' } })
   └─> Sees same inputs → same outputs

4. Evolve to code: Replace LLM with code execution
   └─> evolve_tool_implementation({ newStrategy: 'code_generation' })

5. Final: Deterministic code execution (fast, cheap)
   └─> Tool executes JavaScript directly
```

**Benefits:**
- ✅ Progressive optimization: LLM → code
- ✅ Cost reduction (LLM calls → code execution)
- ✅ Performance improvement (faster execution)
- ✅ Reliability (deterministic for known patterns)

---

## Refined Tool Suite

### Tier 1: Scoped Queries (Leverage Qualified Names + Modules)

#### get_scoped_definition
```typescript
get_scoped_definition({
  path: string,  // Qualified name: 'Module.SubModule.Node' or just 'Node'
  includeNeighbors: 0 | 1 | 2,  // Depth of neighbors
  includeContext: boolean,  // Include inherited + explicit contexts
  includeBoundary: boolean  // Include edges crossing module boundary
})
```

**Examples:**
```typescript
// Single node with context
get_scoped_definition({
  path: 'DataPipeline.ValidationPhase.validate',
  includeContext: true
})

// Entire state module
get_scoped_definition({
  path: 'DataPipeline.ValidationPhase'
})

// Module with external connections
get_scoped_definition({
  path: 'PaymentExtensions',
  includeBoundary: true
})
```

#### get_modification_permissions
```typescript
get_modification_permissions({
  nodePath: string,  // What to modify
  requesterNode?: string  // Who's asking (for scope checking)
})
```

**Returns:**
```typescript
{
  canModify: boolean,
  canDelete: boolean,
  canAddChildren: boolean,
  reason: string,
  allowedScopes: string[],  // Which modules can be modified
  constraints: {
    locked: boolean,
    requiredInPath: boolean,
    lockedAttributes: string[]
  }
}
```

---

### Tier 2: Granular Modifications (Same as Original)

Keep all granular operations from original proposal:
- `add_node`, `modify_node`, `remove_node`
- `add_edge`, `modify_edge`, `remove_edge`

**Enhancement: Add module context**
```typescript
add_node({
  type: 'task',
  name: 'newValidator',
  parentModule: 'DataPipeline.ValidationPhase',  // Add to specific module
  position: 'after:DataPipeline.ValidationPhase.validate'
})

// Automatically adds to module, inherits module's context access
```

---

### Tier 3: Intent-Driven Operations (Same as Original)

Keep all pattern tools:
- `add_error_handling`
- `add_parallelization`
- `add_retry_logic`
- `add_circuit_breaker`

**Enhancement: Respect module boundaries**
```typescript
add_error_handling({
  targetNode: 'CorePayment.processPayment',
  errorTypes: ['timeout'],
  strategy: 'retry_then_fallback',

  // Where to add error handling nodes?
  errorHandlerModule: 'PaymentExtensions'  // Add new nodes here, not in CorePayment
})

// Creates error edges from CorePayment.processPayment to new nodes in PaymentExtensions
// Respects locked module boundaries
```

---

### Tier 4: Execution Context (NEW - Leverage Logs)

#### get_execution_logs
```typescript
get_execution_logs({
  filters: {
    category?: 'execution' | 'transition' | 'context' | 'path' | 'error' | 'tool' | 'agent',
    level?: 'error' | 'warn' | 'info' | 'debug',
    nodePath?: string,  // Pattern: 'Module.*' or 'Module.Node'
    timeRange?: {
      last?: number,  // Last N entries
      since?: string  // ISO timestamp
    }
  },
  format?: 'summary' | 'detailed'
})
```

**Returns:**
```typescript
{
  entries: LogEntry[],
  summary: {
    totalErrors: number,
    failedTransitions: number,
    failedTools: number,
    contextModifications: number
  }
}
```

#### get_execution_history
```typescript
get_execution_history({
  pathId?: string,  // Filter by path
  includeTransitions: boolean,
  includeToolCalls: boolean,
  includeContextChanges: boolean,
  limit: number
})
```

**Returns:**
```typescript
{
  transitions: [
    { from: 'validate', to: 'process', timestamp: ..., success: true }
  ],
  toolCalls: [
    { tool: 'calculate_total', inputs: {...}, outputs: {...}, duration: 123 }
  ],
  contextChanges: [
    { context: 'PipelineState', field: 'recordsProcessed', oldValue: 0, newValue: 100 }
  ]
}
```

---

### Tier 5: Tool Evolution (NEW - Build on Code Generation)

#### evolve_tool_implementation
```typescript
evolve_tool_implementation({
  toolName: string,
  newStrategy: 'agent_backed' | 'code_generation' | 'composition',
  implementation: string,  // New implementation code/prompt/composition
  reason: string,

  // Optional: Validation
  testCases?: Array<{
    input: any,
    expectedOutput: any
  }>
})
```

**Workflow:**
```typescript
// 1. Analyze tool usage patterns
const logs = await get_execution_logs({
  filters: { category: 'tool', nodePath: 'calculate_total' }
})

// 2. If deterministic, evolve to code
if (isDeterministic(logs)) {
  await evolve_tool_implementation({
    toolName: 'calculate_total',
    newStrategy: 'code_generation',
    implementation: generateCodeFromPatterns(logs),
    reason: 'Deterministic behavior observed across 50 invocations',
    testCases: extractTestCases(logs)
  })
}
```

#### analyze_tool_usage
```typescript
analyze_tool_usage({
  toolName: string,
  analysisType: 'determinism' | 'performance' | 'error_rate'
})
```

**Returns:**
```typescript
{
  isDeterministic: boolean,  // Same inputs → same outputs?
  averageDuration: number,
  errorRate: number,
  invocationCount: number,
  patterns: [
    { input: {...}, output: {...}, frequency: 10 }
  ],
  recommendation: {
    shouldEvolve: boolean,
    suggestedStrategy: 'code_generation' | 'composition',
    estimatedSpeedup: '10x',
    estimatedCostReduction: '95%'
  }
}
```

---

### Tier 6: Versioning & Constraints (Same as Original)

Keep all versioning tools:
- `get_modification_history`
- `preview_changes`
- `begin_transaction`, `commit_transaction`, `rollback_transaction`
- `rollback_to_version`

Keep all constraint tools:
- `validate_modification`
- `get_constraints`
- `check_structural_integrity`

**Enhancement: Module-scoped constraints**
```typescript
// Define constraints per module
state CorePayment @meta(locked: true; maxNodes: 10) {
    ...
}

validate_modification({
  operation: 'add_node',
  parameters: { parentModule: 'CorePayment', ... }
})
// Returns: { valid: false, violations: [
//   'Module CorePayment is locked',
//   'Module CorePayment already has 10 nodes (max reached)'
// ]}
```

---

## Integration Examples

### Example 1: Scoped Error Handling Addition

**Task:** "Add timeout handling to payment validation, but don't modify core payment logic"

**Agent workflow:**
```typescript
// 1. Get scope and permissions
const scope = await get_scoped_definition({
  path: 'CorePayment.validateCard',
  includeNeighbors: 1
})

const perms = await get_modification_permissions({
  nodePath: 'CorePayment.validateCard',
  requesterNode: 'current_meta_task'
})
// Returns: { canModify: false, reason: 'CorePayment is locked',
//            allowedScopes: ['PaymentExtensions'] }

// 2. Add error handling respecting boundaries
await add_error_handling({
  targetNode: 'CorePayment.validateCard',
  errorTypes: ['timeout'],
  strategy: 'retry_then_fallback',

  // Add new nodes to allowed module
  errorHandlerModule: 'PaymentExtensions'
})

// Result:
// ✓ Error edge: CorePayment.validateCard -> PaymentExtensions.validateCardTimeoutHandler
// ✓ CorePayment module unchanged (respects locked boundary)
// ✓ New nodes added to editable PaymentExtensions module
```

---

### Example 2: Tool Evolution Based on Execution Logs

**Task:** "Optimize frequently-used tools by converting to code generation"

**Agent workflow:**
```typescript
// 1. Get tool usage logs
const logs = await get_execution_logs({
  filters: {
    category: 'tool',
    last: 100
  }
})

// 2. Analyze patterns
const analysis = await analyze_tool_usage({
  toolName: 'calculate_shipping_cost',
  analysisType: 'determinism'
})

// Returns: {
//   isDeterministic: true,
//   invocationCount: 87,
//   recommendation: {
//     shouldEvolve: true,
//     suggestedStrategy: 'code_generation',
//     estimatedSpeedup: '15x'
//   }
// }

// 3. Extract code from patterns
const patterns = analysis.patterns
const generatedCode = `
  const baseRate = 5.99;
  const weightRate = 0.5;
  const cost = baseRate + (weight * weightRate);
  return { cost, currency: 'USD' };
`

// 4. Evolve tool
await evolve_tool_implementation({
  toolName: 'calculate_shipping_cost',
  newStrategy: 'code_generation',
  implementation: generatedCode,
  reason: 'Deterministic pattern observed (87 invocations)',
  testCases: extractTestCases(patterns)
})

// Result:
// ✓ Tool now executes code directly (15x faster)
// ✓ No LLM calls needed (95% cost reduction)
// ✓ Test cases validate correctness
```

---

### Example 3: Debugging with Execution Logs

**Task:** "Pipeline keeps failing at validation - find out why"

**Agent workflow:**
```typescript
// 1. Get recent errors
const errorLogs = await get_execution_logs({
  filters: {
    category: 'error',
    nodePath: 'DataPipeline.ValidationPhase.*',
    level: 'error',
    last: 10
  }
})

// Returns: [
//   {
//     message: 'Transition failed: condition evaluated to false',
//     data: {
//       fromNode: 'ValidationPhase.validate',
//       toNode: 'ProcessingPhase.transform',
//       condition: 'validationResult.isValid === true',
//       contextState: { 'validationResult.isValid': false }
//     }
//   }
// ]

// 2. Get execution history for context
const history = await get_execution_history({
  pathId: 'path_0',
  includeContextChanges: true,
  limit: 20
})

// 3. Analyze and fix
// Agent sees: validationResult.isValid is false because validation task
// is not setting it correctly

// 4. Modify validation task
await modify_node({
  nodePath: 'DataPipeline.ValidationPhase.validate',
  changes: {
    prompt: 'Validate data and set validationResult.isValid to true if valid, false otherwise'
  },
  reason: 'Fix validation to properly set isValid flag based on execution logs analysis'
})
```

---

## Comparison: Original vs. Refined

| Aspect | Original Proposal | Refined Proposal |
|--------|------------------|------------------|
| **Regions** | New syntax: `regions: { core: {...} }` | Use existing: `state CorePayment @meta(locked)` |
| **Scoping** | New tool: `get_region_definition` | Leverage: Qualified names + state modules |
| **Permissions** | New system: separate permission layer | Use: `@meta` annotation with scope semantics |
| **Context inclusion** | Heuristics + manual specification | Leverage: Context inheritance from state modules |
| **Agent context** | Not addressed | New: `get_execution_logs`, `get_execution_history` |
| **Code evolution** | Not addressed | New: `evolve_tool_implementation`, `analyze_tool_usage` |
| **Granular ops** | ✓ Same | ✓ Enhanced with module awareness |
| **Intent-driven** | ✓ Same | ✓ Enhanced with boundary respect |
| **Versioning** | ✓ Same | ✓ Enhanced with module-scoped constraints |

---

## Implementation Roadmap (Revised)

### Phase 1: Leverage Existing Features (1 week)
**No new implementation needed - use what exists:**
1. Document how to use state modules for scoping
2. Document qualified name patterns for scoped queries
3. Document context inheritance for scope determination
4. Create examples showing module-based meta-programming

**Deliverables:**
- ✅ Documentation: Using state modules as regions
- ✅ Examples: Module-scoped modifications
- ✅ Best practices: @meta annotation usage

---

### Phase 2: Expose Execution Logs (1 week)
**Minimal implementation - expose existing logs:**
1. Add `get_execution_logs` meta-tool
   - Wraps `executor.getLogger().getFilteredEntries()`
   - Add pattern matching for `nodePath` filter
   - Add summary aggregation

2. Add `get_execution_history` meta-tool
   - Wraps `agent-sdk-bridge.getExecutionHistory()`
   - Add filtering and formatting

**Deliverables:**
- ✅ Agents can query execution logs
- ✅ Agents can analyze errors and patterns
- ✅ Better debugging context for modifications

---

### Phase 3: Enhanced Scoped Queries (2 weeks)
**Build on qualified names:**
1. Implement `get_scoped_definition`
   - Resolve qualified names to nodes/modules
   - Include context inheritance resolution
   - Include module boundary edges

2. Implement `get_modification_permissions`
   - Check `@meta` annotations on ancestors
   - Resolve scope constraints
   - Return allowed modification scopes

**Deliverables:**
- ✅ Focused queries using qualified names
- ✅ Permission checking via @meta annotations
- ✅ Context inclusion via inheritance

---

### Phase 4: Module-Aware Modifications (2 weeks)
**Enhance existing granular operations:**
1. Update `add_node`, `modify_node`, `remove_node`
   - Add `parentModule` parameter
   - Check module permissions before operations
   - Auto-inherit module contexts

2. Update `add_edge`, `modify_edge`, `remove_edge`
   - Check cross-module edge permissions
   - Validate boundary crossings

3. Update intent-driven operations
   - Add `errorHandlerModule` parameter
   - Respect module boundaries when adding nodes
   - Validate against locked modules

**Deliverables:**
- ✅ Module-scoped operations
- ✅ Permission-aware modifications
- ✅ Boundary-respecting pattern generation

---

### Phase 5: Tool Evolution (2 weeks)
**New capability:**
1. Implement `analyze_tool_usage`
   - Extract patterns from execution logs
   - Detect deterministic behavior
   - Generate evolution recommendations

2. Implement `evolve_tool_implementation`
   - Update tool node in machine definition
   - Validate with test cases
   - Record evolution in history

**Deliverables:**
- ✅ LLM→code evolution pathway
- ✅ Automated optimization recommendations
- ✅ Cost/performance improvements

---

### Phase 6: Versioning & Constraints (2 weeks)
**Same as original, with module enhancements:**
1. Add module-scoped constraints
2. Add transaction support
3. Add rollback capability

**Deliverables:**
- ✅ Module-level constraints
- ✅ Safe experimentation
- ✅ Version control

**Total: ~10 weeks** (vs. 12-15 in original)

---

## Benefits of Refined Approach

### For Architecture
- ✅ **Builds on existing features** - No redundant concepts
- ✅ **Leverage state modules** - Already have scoping semantics
- ✅ **Reuse qualified names** - Already have namespace system
- ✅ **Extend @meta annotation** - Already exists, needs enhancement
- ✅ **Expose existing logs** - Already collected, just expose to agents

### For Implementation
- ✅ **Faster to implement** - Less new code required
- ✅ **Lower complexity** - Fewer new concepts to maintain
- ✅ **Better integration** - Works with existing patterns
- ✅ **Incremental delivery** - Can ship Phase 1 immediately (docs only!)

### For Users (Machine Authors)
- ✅ **Familiar concepts** - State modules, qualified names already known
- ✅ **Natural scoping** - Modules already group related nodes
- ✅ **Consistent syntax** - No new DSL features to learn
- ✅ **Progressive adoption** - Can use @meta annotations gradually

### For Agents
- ✅ **Clear boundaries** - State modules define scope
- ✅ **Rich context** - Execution logs provide debugging info
- ✅ **Evolution path** - Can optimize tools over time
- ✅ **Focused queries** - Qualified names + modules = targeted context

---

## Open Questions

1. **@meta annotation parameters:**
   - Use `@meta(locked: true)` or `@meta("locked")`?
   - Support `@meta(scope: "local")` vs `@meta(scope: "global")`?
   - Allow `@meta(maxNodes: 10)` for constraints?

2. **Module vs. namespace:**
   - Are state modules the only scoping boundary?
   - Can task/process nodes with children also define scopes?
   - Should we introduce explicit `module` type or keep using `state`?

3. **Context inheritance precision:**
   - Currently children inherit read-only access
   - Should meta-operations have write access to inherited contexts?
   - How to handle explicit edge overrides in scoped queries?

4. **Cross-module dependencies:**
   - How to handle edges from locked→editable modules?
   - Can agents add edges between modules without modifying module internals?
   - Should error edges have special permission rules?

5. **Tool evolution validation:**
   - How many test cases required to validate evolution?
   - Auto-rollback if evolved tool fails?
   - Keep agent-backed version as fallback?

---

## Next Steps

1. **Review refined design with maintainers**
   - Validate state module usage for scoping
   - Confirm @meta annotation enhancement direction
   - Align on tool evolution approach

2. **Phase 1: Documentation (immediate)**
   - Document state module scoping patterns
   - Create examples of module-based meta-programming
   - Best practices for @meta annotation

3. **Phase 2: Expose logs (1 week)**
   - Implement `get_execution_logs`
   - Implement `get_execution_history`
   - Test with agent debugging scenarios

4. **Phase 3+: Incremental delivery**
   - Scoped queries → Module-aware modifications → Tool evolution
   - Each phase delivers value independently
   - Backward compatible throughout

---

## Conclusion

The refined design **builds on DyGram's existing strengths** rather than introducing redundant concepts:

- **State modules** provide natural scoping boundaries
- **Qualified names** enable targeted queries
- **Context inheritance** determines scope automatically
- **@meta annotations** define modification permissions
- **Execution logs** provide rich debugging context
- **Code generation** supports LLM→code evolution

This approach:
- ✅ Faster to implement (10 weeks vs. 12-15)
- ✅ Better integrated with existing architecture
- ✅ More familiar to users (existing concepts)
- ✅ Can deliver value sooner (Phase 1 = docs only!)

**Key insight:** The original problem (all-or-nothing machine updates) can be solved by **exposing and enhancing existing features** rather than building parallel systems.
