# Meta-Programming Tool Design: Measured & Granular Approach

**Date**: 2025-12-06
**Status**: Design Proposal
**Context**: Research and redesign of DyGram's meta-programming tools

## Executive Summary

Current meta-programming tools (`get_machine_definition`, `update_definition`) are **all-or-nothing**: agents must retrieve and replace the entire machine definition to make any change. This creates problems for both machine authors (who want incremental refinement with guardrails) and agents (who face overwhelming context and unclear scope).

This document proposes a **tiered, measured approach** with:
- **Scoped views** - focused context instead of entire machine
- **Granular operations** - specific modifications (add node, modify edge)
- **Region-based permissions** - author-controlled boundaries
- **Intent-driven patterns** - high-level operations (add error handling)
- **Versioning & constraints** - history tracking and validation

## Problem Statement

### Current Architecture

DyGram provides these meta-programming tools:

| Tool | Purpose | Granularity |
|------|---------|-------------|
| `get_machine_definition` | View machine | Entire machine (JSON + DSL) |
| `update_definition` | Modify machine | Replace entire machine |
| `construct_tool` | Create tool | Single tool node ✓ |
| `build_tool_from_node` | Implement tool | Single tool ✓ |
| `list_available_tools` | List tools | All tools |
| `propose_tool_improvement` | Suggest changes | Proposal only |

**Analysis**: Tool creation is granular (`construct_tool`), but machine modification is monolithic (`update_definition`).

### Perspective 1: Machine Author

**Author's goals:**
- ✅ Incremental refinement as machine evolves
- ✅ Controlled agent autonomy within guardrails
- ✅ Version history to track changes
- ✅ Selective permissions (lock core, allow extensions)
- ✅ Validation to prevent breaking changes

**Current pain points:**

```
❌ All-or-nothing updates
   - To add one node, agent must get entire machine (100+ nodes)
   - Modify JSON structure (error-prone, breaks easily)
   - Replace entire machine (loses context, risky)

❌ No scoping
   - Can't restrict agent to "only modify error handling region"
   - No way to lock critical paths

❌ No history
   - Changes overwrite previous version
   - No audit trail or rollback

❌ No constraints
   - Agent can accidentally break required paths
   - No validation until after update applied

❌ Too much cognitive load
   - Author must mentally track what agent can/should modify
   - No declarative way to express boundaries
```

**Example scenario:**
> "I want the agent to improve error handling in the payment workflow, but NOT touch the core payment processing logic or data validation steps."

**Current approach**: Hope the agent understands and respects this (unreliable)
**Needed**: Region-based permissions + scoped operations

### Perspective 2: Agent (LLM Executor)

**Agent's needs:**
- ✅ Clear scope - what am I allowed to modify?
- ✅ Focused context - only see relevant parts
- ✅ Safety - don't accidentally break the machine
- ✅ Actionable tools - specific operations (add X, modify Y)
- ✅ Feedback - validate before committing

**Current pain points:**

```
❌ Too much power
   - Can modify anything, unclear what should change
   - "Update the machine" vs "Add retry to API call" - very different intents

❌ Too much context
   - Gets entire machine JSON (100+ nodes overwhelming)
   - Must understand full structure to make small change
   - High token cost for viewing irrelevant parts

❌ Unclear intent
   - Generic "update_definition" doesn't express purpose
   - No semantic tools like "add_error_handling"

❌ No validation
   - Only learns about errors after update applied
   - Can't preview changes or check constraints

❌ Cognitive overload
   - Navigate complex JSON structure manually
   - Track relationships and dependencies mentally
   - High risk of introducing structural errors
```

**Example scenario:**
> "Add timeout and retry logic to the 'process_payment' task"

**Current approach**:
1. Get entire 100-node machine
2. Find 'process_payment' in JSON
3. Manually add edges, attributes, error nodes
4. Replace entire machine, hope it works

**Needed**: Scoped view (`get_node_definition`) + intent operation (`add_error_handling`)

## Design Principles

The proposed redesign follows these principles:

### 1. Granularity
**Operations at multiple scales:**
- **Node-level**: Add/modify/delete single node
- **Edge-level**: Add/modify/delete single edge
- **Region-level**: Update bounded subgraph
- **Machine-level**: Wholesale operations (rare)

**Rationale**: Match tool to task scope. Adding one node shouldn't require entire machine.

### 2. Scoping
**Explicit boundaries:**
- **View scoping**: Get only relevant nodes (node + neighbors, region, schema)
- **Modification scoping**: Restrict operations to permitted regions
- **Permission system**: Author declares what's editable vs. locked

**Rationale**: Reduce context, improve focus, increase safety.

### 3. Validation
**Pre-flight checks:**
- Validate before applying (preview mode)
- Check structural integrity (no orphaned nodes)
- Enforce constraints (locked nodes, required paths)
- Return actionable errors

**Rationale**: Catch errors early, provide clear feedback.

### 4. Versioning
**History tracking:**
- Record all modifications with timestamps, reasons
- Support rollback to previous versions
- Enable transaction-based multi-step changes
- Audit trail for debugging

**Rationale**: Support experimentation, enable debugging, build trust.

### 5. Intent-Driven
**Express what, not how:**
- High-level operations: `add_error_handling`, `add_parallelization`
- Agent applies domain knowledge to implement patterns
- Consistent, correct implementation of common patterns

**Rationale**: Reduce complexity, encode best practices, improve reliability.

## Proposed Tool Suite

### Tier 1: Scoped View Tools (Read-Only, Focused Context)

Replace monolithic `get_machine_definition` with focused queries:

#### get_node_definition
```typescript
get_node_definition({
  nodeName: 'process_payment',
  includeEdges: 'incoming_and_outgoing' | 'incoming' | 'outgoing' | 'none',
  includeNeighbors: 0 | 1 | 2,  // depth (0 = just node, 1 = direct neighbors)
  includeContext: boolean  // include context nodes this reads/writes
})

// Returns:
{
  node: {
    name: 'process_payment',
    type: 'task',
    description: '...',
    attributes: { ... },
    annotations: [ ... ]
  },
  incomingEdges: [ ... ],
  outgoingEdges: [ ... ],
  neighbors: {
    upstream: [ 'validate_card' ],
    downstream: [ 'send_confirmation', 'handle_error' ]
  },
  contexts: {
    reads: [ 'PaymentData' ],
    writes: [ 'TransactionLog' ]
  },
  permissions: {
    canModify: true,
    canDelete: false,
    reason: 'Node in editable region: payment_extensions'
  }
}
```

**Use case**: Agent needs to understand single node without loading entire machine.

#### get_region_definition
```typescript
get_region_definition({
  regionName: 'payment_workflow',  // predefined region
  // OR
  nodes: ['process_payment', 'validate_card', 'send_confirmation'],  // custom selection
  includeContext: boolean,  // include context nodes accessed by region
  includeBoundaryEdges: boolean  // edges crossing region boundary
})

// Returns: Subgraph containing only specified nodes + their connections
{
  region: {
    name: 'payment_workflow',
    nodes: [ ... ],  // only nodes in region
    edges: [ ... ],  // edges within region
    boundaryEdges: {
      incoming: [ ... ],  // edges from outside region
      outgoing: [ ... ]   // edges to outside region
    }
  },
  contexts: [ ... ],  // shared contexts
  permissions: { ... }
}
```

**Use case**: Agent works on bounded subgraph (e.g., error handling region).

#### get_machine_schema
```typescript
get_machine_schema({
  format: 'summary' | 'full',
  includeRegions: boolean,
  includeConstraints: boolean
})

// Returns high-level overview:
{
  title: 'Payment System',
  nodeCount: 47,
  edgeCount: 68,
  nodeTypes: {
    task: 23,
    state: 15,
    context: 6,
    tool: 3
  },
  regions: {
    core: { nodes: 12, locked: true },
    extensions: { nodes: 18, locked: false },
    experimental: { nodes: 17, locked: false }
  },
  constraints: [ ... ],
  startNodes: [ 'init_payment' ],
  endNodes: [ 'payment_complete', 'payment_failed' ]
}
```

**Use case**: Agent gets overview before deciding what to modify.

#### get_neighbors
```typescript
get_neighbors({
  nodeName: 'process_payment',
  direction: 'upstream' | 'downstream' | 'both',
  depth: 1 | 2 | 3,
  filter: {
    nodeType: 'task' | 'state' | ...,
    hasAnnotation: '@retry',
    ...
  }
})

// Returns: Adjacent nodes with connections
```

**Use case**: Explore local graph structure around a node.

#### query_nodes
```typescript
query_nodes({
  filter: {
    type: 'task',
    hasAnnotation: '@retry',
    inRegion: 'extensions',
    namePattern: 'process_*'
  },
  limit: 20
})

// Returns: List of nodes matching criteria
```

**Use case**: Find nodes meeting specific criteria (e.g., all tasks with @retry).

**Benefits:**
- ✅ **Author**: Controls what agent sees via scoping
- ✅ **Agent**: Focused context, easier to understand, lower token cost
- ✅ **Performance**: Smaller payloads, faster processing

---

### Tier 2: Granular Modification Tools (Targeted Changes)

Replace wholesale `update_definition` with specific operations:

#### Node Operations

##### add_node
```typescript
add_node({
  type: 'state' | 'task' | 'context' | 'tool' | ...,
  name: 'handle_refund',
  description: 'Process refund request',
  attributes: {
    timeout: 5000,
    retries: 3
  },
  annotations: ['@checkpoint'],
  region: 'payment_extensions',  // optional: target region
  position: {
    after: 'process_payment',  // positioning hint
    // OR
    before: 'send_confirmation'
  }
})

// Returns:
{
  success: true,
  node: { ... },  // created node
  generatedDSL: '...',  // DSL representation
  affectedRegion: 'payment_extensions'
}
```

**Validation:**
- ✓ Check region permissions
- ✓ Ensure name uniqueness
- ✓ Validate node type compatibility
- ✓ Check constraints (max nodes per region)

##### modify_node
```typescript
modify_node({
  nodeName: 'process_payment',
  changes: {
    description: 'Enhanced payment processing with fraud detection',
    attributes: {
      timeout: 5000,  // add or update
      priority: 'high'  // add new attribute
    },
    annotations: {
      add: ['@retry("3")'],
      remove: ['@deprecated']
    }
  },
  merge: true,  // merge with existing, don't replace
  reason: 'Add timeout for slow payment gateways'
})

// Returns:
{
  success: true,
  node: { ... },  // updated node
  changes: {
    added: { timeout: 5000, priority: 'high' },
    modified: { description: '...' },
    removed: []
  }
}
```

**Validation:**
- ✓ Check modification permissions
- ✓ Ensure node exists
- ✓ Validate attribute types
- ✓ Check constraints

##### remove_node
```typescript
remove_node({
  nodeName: 'deprecated_step',
  cascade: false,  // if true, remove connected edges
  safetyCheck: true,  // prevent removing nodes with active paths
  reason: 'Feature deprecated in v2.0'
})

// Returns:
{
  success: true,
  removed: {
    node: { ... },
    edges: [ ... ]  // if cascade: true
  },
  warnings: [
    'Removed 3 edges connected to this node'
  ]
}
```

**Validation:**
- ✓ Check deletion permissions
- ✓ Ensure not in locked region
- ✓ Check if node has active execution paths
- ✓ Validate cascade implications

#### Edge Operations

##### add_edge
```typescript
add_edge({
  source: 'process_payment',
  target: 'handle_refund',
  label: 'refund_requested',
  arrowType: '->',  // control flow
  condition: 'payment.status === "refund_requested"',
  annotations: ['@priority("1")'],
  attributes: {
    timeout: 2000
  }
})

// Returns:
{
  success: true,
  edge: { ... },
  affectedNodes: ['process_payment', 'handle_refund']
}
```

**Validation:**
- ✓ Check source and target exist
- ✓ Validate edge doesn't create invalid cycles
- ✓ Check arrow type semantics
- ✓ Validate condition syntax

##### modify_edge
```typescript
modify_edge({
  source: 'process_payment',
  target: 'send_confirmation',
  // OR
  edgeId: 'edge_123',  // if edges have IDs

  changes: {
    condition: 'payment.status === "success" && amount > 0',
    annotations: {
      add: ['@retry("3")'],
      remove: []
    },
    priority: 1
  }
})
```

##### remove_edge
```typescript
remove_edge({
  source: 'old_step',
  target: 'next_step',
  reason: 'Flow deprecated in favor of new error handling'
})
```

#### Batch Operations

##### update_region
```typescript
update_region({
  regionName: 'payment_extensions',
  changes: {
    nodes: [
      { operation: 'add', node: { ... } },
      { operation: 'modify', nodeName: '...', changes: { ... } },
      { operation: 'remove', nodeName: '...' }
    ],
    edges: [
      { operation: 'add', edge: { ... } },
      { operation: 'remove', source: '...', target: '...' }
    ]
  },
  constraints: {
    maxNodes: 20,  // don't let region grow unbounded
    preserveExternalEdges: true  // don't break connections to other regions
  },
  transactional: true  // all-or-nothing (rollback on any failure)
})

// Returns:
{
  success: true,
  applied: {
    nodesAdded: 2,
    nodesModified: 1,
    nodesRemoved: 0,
    edgesAdded: 3,
    edgesRemoved: 1
  },
  region: { ... }  // updated region definition
}
```

**Benefits:**
- ✅ **Author**: Fine-grained control, explicit change tracking
- ✅ **Agent**: Clear intent, single-purpose tools
- ✅ **Safety**: Each operation validated independently

---

### Tier 3: Region-Based Scoping (Bounded Modifications)

Introduce "regions" for controlled evolution:

#### Region Definition (in DSL)

```dy
machine "Payment System" {
  regions: {
    core: {
      nodes: ['init_payment', 'process_payment', 'validate_card'],
      locked: true,
      description: 'Critical payment processing - do not modify'
    },
    extensions: {
      nodes: ['handle_refund', 'send_receipt', 'fraud_check'],
      locked: false,
      maxNodes: 20,
      description: 'Payment extensions - safe to modify'
    },
    experimental: {
      nodes: ['ai_fraud_detection', 'realtime_analytics'],
      locked: false,
      description: 'Experimental features - fully mutable'
    }
  }
}

// OR use annotations on nodes
state process_payment @region("core") @locked
state handle_refund @region("extensions") @editable
state ai_fraud_detection @region("experimental") @mutable
```

#### Region Tools

##### get_modification_permissions
```typescript
get_modification_permissions({
  nodeName: 'process_payment'  // or regionName
})

// Returns:
{
  node: 'process_payment',
  region: 'core',
  permissions: {
    canModify: false,
    canDelete: false,
    canAddEdgesTo: true,  // can add edges FROM this node
    canAddEdgesFrom: true,  // can add edges TO this node
    reason: 'Node in locked region: core'
  },
  constraints: {
    requiredInPath: true,  // node must remain in execution path
    lockedAttributes: ['timeout', 'retries']
  }
}
```

##### list_regions
```typescript
list_regions({
  includeNodeCounts: true
})

// Returns:
{
  regions: [
    {
      name: 'core',
      nodeCount: 12,
      edgeCount: 15,
      locked: true,
      constraints: { ... }
    },
    {
      name: 'extensions',
      nodeCount: 18,
      edgeCount: 24,
      locked: false,
      constraints: { maxNodes: 20 }
    }
  ]
}
```

**Benefits:**
- ✅ **Author**: Define boundaries (core vs. experimental)
- ✅ **Agent**: Knows exactly what can be modified
- ✅ **Evolution**: Machine grows in controlled areas

---

### Tier 4: Intent-Driven Operations (High-Level Goals)

Instead of manipulating structure, express intent:

#### add_error_handling
```typescript
add_error_handling({
  targetNode: 'process_payment',
  errorTypes: ['timeout', 'invalid_card', 'network_error'],
  strategy: 'retry_then_fallback' | 'circuit_breaker' | 'compensation',

  // For retry_then_fallback strategy:
  maxRetries: 3,
  retryDelay: 1000,
  fallbackNode: 'manual_review',  // or auto-create

  // For circuit_breaker strategy:
  failureThreshold: 5,
  resetTimeout: 60000,

  // For compensation strategy:
  compensationNode: 'rollback_payment'
})

// Agent generates:
// 1. Error edges from targetNode to error handlers
// 2. @retry annotation if strategy includes retry
// 3. Fallback node if not exists
// 4. Proper edge conditions for each error type
// 5. Circuit breaker state if using circuit_breaker strategy

// Returns:
{
  success: true,
  generated: {
    nodes: [
      { name: 'process_payment_error_handler', type: 'state' }
    ],
    edges: [
      { source: 'process_payment', target: 'process_payment_error_handler', label: 'timeout' },
      { source: 'process_payment_error_handler', target: 'manual_review', label: 'max_retries_exceeded' }
    ],
    annotations: [
      { node: 'process_payment', annotation: '@retry("3")' }
    ]
  }
}
```

#### add_parallelization
```typescript
add_parallelization({
  nodes: ['fetch_user_data', 'fetch_product_catalog', 'fetch_inventory'],
  synchronizeAt: 'merge_and_continue',  // convergence point
  barrierName: 'data_fetch_complete',
  spawnFrom: 'init_fetch',  // where parallel paths start
  timeout: 10000  // max wait at barrier
})

// Agent generates:
// 1. @spawn edges from spawnFrom to each node
// 2. @barrier edges from each node to synchronization point
// 3. Barrier state/annotation
// 4. Timeout handling

// Returns:
{
  success: true,
  generated: {
    nodes: [
      { name: 'data_fetch_barrier', type: 'state' }
    ],
    edges: [
      { source: 'init_fetch', target: 'fetch_user_data', annotations: ['@spawn'] },
      { source: 'init_fetch', target: 'fetch_product_catalog', annotations: ['@spawn'] },
      { source: 'init_fetch', target: 'fetch_inventory', annotations: ['@spawn'] },
      { source: 'fetch_user_data', target: 'data_fetch_barrier', annotations: ['@barrier("data_fetch_complete")'] },
      { source: 'fetch_product_catalog', target: 'data_fetch_barrier', annotations: ['@barrier("data_fetch_complete")'] },
      { source: 'fetch_inventory', target: 'data_fetch_barrier', annotations: ['@barrier("data_fetch_complete")'] },
      { source: 'data_fetch_barrier', target: 'merge_and_continue' }
    ]
  }
}
```

#### add_retry_logic
```typescript
add_retry_logic({
  targetNode: 'call_external_api',
  maxRetries: 3,
  retryDelay: 1000,
  backoffStrategy: 'exponential' | 'linear' | 'fixed',
  retryConditions: [
    'status === "timeout"',
    'status === "rate_limited"'
  ]
})
```

#### add_circuit_breaker
```typescript
add_circuit_breaker({
  targetNode: 'payment_gateway',
  failureThreshold: 5,
  resetTimeout: 60000,
  fallbackBehavior: 'queue_for_retry' | 'alternative_gateway' | 'manual_review'
})
```

#### refactor_to_subgraph
```typescript
refactor_to_subgraph({
  nodes: ['validate_input', 'sanitize_data', 'check_constraints'],
  newSubgraphName: 'input_validation',
  entryNode: 'validate_input',
  exitNodes: ['validation_success', 'validation_failed'],
  preserveExternalEdges: true  // maintain connections to/from subgraph
})

// Agent generates:
// 1. Nested structure with qualified names (input_validation.validate_input)
// 2. Entry/exit routing
// 3. Updates external edges to point to subgraph entry/exit
```

**Benefits:**
- ✅ **Author**: Express what, not how
- ✅ **Agent**: Apply domain knowledge to implement patterns
- ✅ **Consistency**: Standard patterns applied correctly

---

### Tier 5: Versioning & History (Audit Trail)

Track all modifications with rollback capability:

#### get_modification_history
```typescript
get_modification_history({
  limit: 20,
  filter: {
    region: 'extensions',
    nodePattern: 'process_*',
    operationType: 'add_node' | 'modify_node' | 'remove_node',
    dateRange: {
      start: '2025-12-01',
      end: '2025-12-06'
    }
  },
  includeChangeDiff: boolean
})

// Returns:
{
  history: [
    {
      id: 'change_123',
      timestamp: '2025-12-06T10:30:00Z',
      operation: 'add_error_handling',
      targetNode: 'process_payment',
      reason: 'Add timeout handling for payment gateway',
      author: 'agent',
      changes: {
        nodesAdded: ['payment_timeout_handler'],
        edgesAdded: [
          { source: 'process_payment', target: 'payment_timeout_handler' }
        ],
        annotationsAdded: ['@retry("3")']
      },
      diff: '...'  // DSL diff
    },
    // ... more history entries
  ],
  totalCount: 47
}
```

#### preview_changes
```typescript
preview_changes({
  operation: 'add_error_handling',
  parameters: {
    targetNode: 'process_payment',
    errorTypes: ['timeout'],
    strategy: 'retry_then_fallback',
    maxRetries: 3
  }
})

// Returns (without committing):
{
  wouldSucceed: true,
  preview: {
    nodesAdded: [
      { name: 'payment_error_handler', type: 'state', ... }
    ],
    edgesAdded: [
      { source: 'process_payment', target: 'payment_error_handler', ... }
    ],
    annotationsAdded: [
      { node: 'process_payment', annotation: '@retry("3")' }
    ]
  },
  validation: {
    passed: true,
    warnings: [],
    errors: []
  },
  estimatedImpact: {
    affectedNodes: 2,
    affectedEdges: 3,
    affectedRegions: ['extensions']
  },
  dslDiff: '...'  // show DSL before/after
}
```

#### Transactions
```typescript
// Multi-step modification with rollback
const txId = await begin_transaction({
  description: 'Add comprehensive error handling to payment flow'
})

try {
  await add_error_handling({ ... })
  await add_circuit_breaker({ ... })
  await modify_node({ ... })

  await commit_transaction({ transactionId: txId })
} catch (error) {
  await rollback_transaction({ transactionId: txId })
}
```

#### Rollback
```typescript
// Rollback to specific version
rollback_to_version({
  versionId: 'version_abc123',
  scope: 'region:extensions'  // or 'machine' for full rollback
})

// Rollback last N changes
rollback_changes({
  count: 3,
  scope: 'node:process_payment'
})
```

**Benefits:**
- ✅ **Author**: See history, undo mistakes, audit changes
- ✅ **Agent**: Try changes safely with preview, understand impact
- ✅ **Debugging**: Understand what changed when and why

---

### Tier 6: Constraint System (Guardrails)

Define rules that all modifications must satisfy:

#### Constraint Definition (in DSL)

```dy
machine "Payment System" {
  constraints: {
    // Structural constraints
    maxNodesPerRegion: {
      core: 15,
      extensions: 30,
      experimental: 50
    },
    maxDepth: 10,  // graph depth limit
    maxBreadth: 5,  // max outgoing edges per node

    // Semantic constraints
    requireErrorHandling: [
      'process_payment',
      'validate_card',
      'call_gateway'
    ],
    requireRetry: ['call_*', 'fetch_*'],  // pattern matching

    // Connection constraints
    lockedNodes: [
      'process_payment',
      'validate_card'
    ],
    requiredPaths: [
      { from: 'start', to: 'process_payment', reason: 'Main flow must pass through payment' },
      { from: 'process_payment', to: 'complete', reason: 'Payment must reach completion' }
    ],

    // Forbidden patterns
    forbiddenEdges: [
      { from: 'experimental.*', to: 'core.*', reason: 'Experimental cannot affect core' }
    ],

    // Required annotations
    requireAnnotations: {
      'task': ['@timeout'],  // all tasks must have timeout
      'api_*': ['@retry', '@circuit_breaker']  // API calls need resilience
    }
  }
}
```

#### Constraint Tools

##### validate_modification
```typescript
validate_modification({
  operation: 'remove_node',
  parameters: {
    nodeName: 'process_payment'
  }
})

// Returns:
{
  valid: false,
  violations: [
    {
      constraint: 'lockedNodes',
      severity: 'error',
      message: 'Cannot remove node "process_payment" - it is in lockedNodes constraint',
      suggestion: 'Remove the node from lockedNodes constraint first, or modify instead of removing'
    },
    {
      constraint: 'requiredPaths',
      severity: 'error',
      message: 'Removing "process_payment" would break required path: start → process_payment → complete',
      affectedPaths: [
        { from: 'start', to: 'process_payment' },
        { from: 'process_payment', to: 'complete' }
      ]
    }
  ],
  warnings: [
    {
      message: 'Node has 12 incoming edges that will become orphaned',
      affectedEdges: [ ... ]
    }
  ]
}
```

##### get_constraints
```typescript
get_constraints({
  scope: 'machine' | 'region:extensions' | 'node:process_payment'
})

// Returns active constraints for scope
```

##### add_constraint
```typescript
add_constraint({
  type: 'required_path' | 'locked_node' | 'max_nodes' | ...,
  parameters: {
    from: 'validate_input',
    to: 'process_payment',
    reason: 'Input must be validated before payment'
  }
})
```

##### check_structural_integrity
```typescript
check_structural_integrity({
  scope: 'machine' | 'region:extensions'
})

// Returns:
{
  valid: true,
  issues: [
    {
      type: 'orphaned_node',
      severity: 'warning',
      node: 'deprecated_handler',
      message: 'Node has no incoming or outgoing edges'
    },
    {
      type: 'unreachable_node',
      severity: 'error',
      node: 'isolated_task',
      message: 'Node is not reachable from any start node'
    },
    {
      type: 'cycle_detected',
      severity: 'warning',
      nodes: ['A', 'B', 'C', 'A'],
      message: 'Potential infinite loop detected'
    }
  ]
}
```

**Benefits:**
- ✅ **Author**: Encode rules machine must follow, prevent mistakes
- ✅ **Agent**: Know limits before attempting changes, get clear feedback
- ✅ **Safety**: Invalid changes rejected early with helpful messages

---

### Legacy Compatibility

**Keep existing tools for specific use cases:**

#### get_machine_definition (full export)
- Use case: Export entire machine for external processing
- Use case: Migrate to another system
- Use case: Generate documentation

#### update_definition (wholesale import)
- Use case: Import machine from external source
- Use case: Restore from backup
- Use case: Apply large pre-validated changes

**BUT**: Encourage granular tools for incremental development and agent-driven evolution.

---

## Comparison: Current vs. Proposed

### Scenario: Add Timeout Handling to Payment Task

#### Current Approach (All-or-Nothing)

```typescript
// 1. Get entire machine (100+ nodes, all edges, all context)
const result = await get_machine_definition({ format: 'json' })
const machine = result.json  // Massive JSON object

// 2. Navigate JSON structure manually
const paymentNode = machine.nodes.find(n => n.name === 'process_payment')

// 3. Modify JSON (error-prone)
paymentNode.attributes.push({ name: 'timeout', value: 5000 })
paymentNode.annotations.push('@retry("3")')

// 4. Add error edge (must manually construct edge)
machine.edges.push({
  source: 'process_payment',
  target: 'payment_timeout_handler',  // hope this node exists!
  label: 'timeout',
  arrowType: '->',
  condition: 'error.type === "timeout"'
})

// 5. Add error handler node if doesn't exist
if (!machine.nodes.find(n => n.name === 'payment_timeout_handler')) {
  machine.nodes.push({
    name: 'payment_timeout_handler',
    type: 'state',
    description: 'Handle payment timeout',
    attributes: []
  })
}

// 6. Replace entire machine (risky!)
await update_definition({
  machine: machine,  // hope no errors!
  reason: 'Add timeout handling'
})

// ❌ Problems:
// - Received 100+ nodes, only needed 1
// - High cognitive load navigating JSON
// - Error-prone manual structure manipulation
// - No validation until after replacement
// - High token cost
```

#### Proposed Approach (Granular, Intent-Driven)

```typescript
// 1. Get focused context
const node = await get_node_definition({
  nodeName: 'process_payment',
  includeEdges: 'outgoing',
  includeNeighbors: 1
})
// Returns: Just this node + direct connections

// 2. Check permissions
const perms = await get_modification_permissions({
  nodeName: 'process_payment'
})

if (!perms.canModify) {
  console.log(`Cannot modify: ${perms.reason}`)
  return
}

// 3. Use intent-driven operation
await add_error_handling({
  targetNode: 'process_payment',
  errorTypes: ['timeout'],
  strategy: 'retry_then_fallback',
  maxRetries: 3,
  fallbackNode: 'manual_review'
})

// ✅ System automatically:
// - Validates the operation
// - Adds @retry annotation
// - Creates error edge with proper condition
// - Creates timeout handler node if needed
// - Generates correct DSL
// - Records in history

// ✅ Benefits:
// - Focused context (1 node vs. 100)
// - Clear intent (add_error_handling vs. JSON manipulation)
// - Automatic validation
// - Safe execution
// - Low cognitive load
```

**Token cost comparison:**
- Current: ~10,000 tokens (entire machine JSON)
- Proposed: ~500 tokens (single node + context)
- **Reduction: 95%**

---

## Implementation Roadmap

### Phase 1: Core Scoped Views (Immediate Value)
**Timeline**: 1-2 weeks
**Complexity**: Low-Medium

**Tasks:**
1. Implement `get_node_definition`
   - Extract single node from machine JSON
   - Include edge filtering (incoming/outgoing)
   - Add neighbor depth traversal
   - Return permissions metadata

2. Implement `get_region_definition`
   - Support predefined regions
   - Support custom node selection
   - Include boundary edge detection
   - Filter context nodes

3. Implement `get_machine_schema`
   - Aggregate node/edge counts by type
   - List regions if defined
   - Extract constraints
   - Identify entry/exit points

4. Update `meta-tool-manager.ts`
   - Add new tool definitions
   - Implement handlers
   - Add unit tests

**Deliverables:**
- ✅ Agents can request focused context
- ✅ Reduced token costs for machine inspection
- ✅ Foundation for granular modifications

---

### Phase 2: Granular Modifications (Incremental Safety)
**Timeline**: 2-3 weeks
**Complexity**: Medium-High

**Tasks:**
1. Implement node CRUD operations
   - `add_node`: Create single node with validation
   - `modify_node`: Partial updates with merge support
   - `remove_node`: Safe deletion with cascade option

2. Implement edge CRUD operations
   - `add_edge`: Create edge with semantic validation
   - `modify_edge`: Update edge properties
   - `remove_edge`: Safe edge deletion

3. Add validation logic
   - Uniqueness checks (node names)
   - Structural integrity (no orphans)
   - Semantic validation (edge types)
   - Constraint checking

4. Update mutation tracking
   - Record granular changes (not just "machine updated")
   - Track change reasons
   - Generate DSL diffs

5. Integration with generator
   - Update `generateDSL` to handle incremental changes
   - Ensure round-trip fidelity

**Deliverables:**
- ✅ Agents can make targeted modifications
- ✅ Each change validated independently
- ✅ Clear audit trail of what changed

---

### Phase 3: Region System (Controlled Evolution)
**Timeline**: 2-3 weeks
**Complexity**: Medium

**Tasks:**
1. Extend grammar for regions
   - Add `regions` machine attribute
   - Add `@region` node annotation
   - Add `@locked`, `@editable` annotations

2. Implement permission system
   - `get_modification_permissions`: Check what's editable
   - Region-based access control
   - Locked node enforcement

3. Implement region tools
   - `list_regions`: Enumerate regions
   - `update_region`: Batch operations within region
   - Region boundary validation

4. Add region constraints
   - Max nodes per region
   - Preserve external edges
   - Forbidden cross-region edges

**Deliverables:**
- ✅ Authors can define editable vs. locked regions
- ✅ Agents know what they can modify
- ✅ Controlled machine evolution

---

### Phase 4: Patterns & History (Advanced Features)
**Timeline**: 3-4 weeks
**Complexity**: High

**Tasks:**
1. Implement intent-driven pattern tools
   - `add_error_handling`: Generate error handling structure
   - `add_parallelization`: Generate spawn/barrier pattern
   - `add_retry_logic`: Generate retry annotations + edges
   - `add_circuit_breaker`: Generate circuit breaker pattern

2. Pattern validation
   - Ensure generated structure is correct
   - Check semantic consistency
   - Validate against constraints

3. Implement versioning system
   - `get_modification_history`: Query change log
   - `preview_changes`: Dry-run operations
   - Change diff generation

4. Implement transaction system
   - `begin_transaction`: Start multi-step change
   - `commit_transaction`: Apply all changes
   - `rollback_transaction`: Discard changes
   - Atomic batch operations

5. Implement rollback
   - `rollback_to_version`: Time-travel
   - `rollback_changes`: Undo last N changes
   - Version comparison

**Deliverables:**
- ✅ High-level intent-driven operations
- ✅ Full history tracking and audit trail
- ✅ Safe experimentation with rollback

---

### Phase 5: Constraints (Guardrails)
**Timeline**: 2-3 weeks
**Complexity**: Medium-High

**Tasks:**
1. Define constraint DSL
   - Structural constraints (max nodes, depth)
   - Semantic constraints (required annotations)
   - Connection constraints (locked nodes, required paths)
   - Forbidden patterns

2. Implement constraint engine
   - Parse constraint definitions
   - Validate operations against constraints
   - Generate helpful error messages

3. Implement constraint tools
   - `validate_modification`: Pre-flight check
   - `get_constraints`: List active constraints
   - `add_constraint`: Dynamic constraint addition
   - `check_structural_integrity`: Graph validation

4. Integration with all modification tools
   - Every operation checks constraints
   - Clear violation messages
   - Suggestions for fixes

**Deliverables:**
- ✅ Authors can encode machine invariants
- ✅ Agents get clear feedback on what's allowed
- ✅ Prevent invalid modifications early

---

## Migration Strategy

### Backward Compatibility

**Guarantee:**
- All existing meta-tool functionality preserved
- `get_machine_definition` and `update_definition` continue to work
- Existing agent code not broken

**Transition:**
1. **Phase 1-2**: New tools available alongside existing tools
2. **Phase 3**: Encourage use of granular tools in documentation
3. **Phase 4**: Deprecate monolithic tools (but keep functional)
4. **Phase 5**: Legacy tools marked as "for export/import only"

### Agent Migration Path

**Old pattern:**
```typescript
const machine = await get_machine_definition({ format: 'json' })
// ... manipulate JSON ...
await update_definition({ machine, reason: '...' })
```

**New pattern (encouraged):**
```typescript
// Scoped view
const node = await get_node_definition({ nodeName: '...', ... })

// Granular modification
await modify_node({ nodeName: '...', changes: { ... } })

// OR intent-driven
await add_error_handling({ targetNode: '...', ... })
```

**Migration guide:**
- Document common patterns with examples
- Provide side-by-side comparisons
- Show token cost savings
- Highlight safety benefits

---

## Success Metrics

### For Authors
- ✅ Can define regions and permissions declaratively
- ✅ Can track all machine modifications in history
- ✅ Can rollback unwanted changes
- ✅ Can enforce constraints on modifications
- ✅ Reduced fear of agent making breaking changes

### For Agents
- ✅ 90%+ reduction in context size for local modifications
- ✅ Clear scope: know what can be modified
- ✅ Validation before committing (no surprise errors)
- ✅ Intent-driven tools for common patterns
- ✅ Lower cognitive load for structural changes

### For System
- ✅ Reduced token costs (targeted queries)
- ✅ Better audit trail (granular change tracking)
- ✅ Safer modifications (pre-flight validation)
- ✅ More reliable evolution (constraints + patterns)
- ✅ Backward compatible (no breaking changes)

---

## Open Questions

1. **Region auto-detection**: Should system infer regions from structure (e.g., nested nodes)?
2. **Constraint syntax**: DSL-based vs. attribute-based vs. code-based?
3. **Pattern catalog**: Which high-level patterns to prioritize?
4. **Version storage**: Store full snapshots vs. incremental diffs?
5. **Transaction scope**: Per-region vs. per-machine vs. custom?
6. **Permission inheritance**: Do child nodes inherit parent region permissions?

---

## References

### Related Documentation
- [Meta Tools and Machine Updates](./meta-tools-machine-updates.md) - Current implementation
- [Meta-Programming Runtime Behavior](./meta-programming-runtime-behavior.md) - Runtime behavior analysis
- [Edge Semantics](./edge-sematics.md) - Edge type system

### Implementation Files
- `src/language/meta-tool-manager.ts` - Meta-tool definitions
- `src/language/executor.ts` - Machine executor integration
- `src/language/json/serializer.ts` - JSON serialization
- `src/language/generator/generator.js` - DSL generation

### Examples
- `docs/examples/runtime-execution.md` - Execution features
- `test/integration/meta-machine-manipulation.test.ts` - Existing tests

---

## Conclusion

The proposed **tiered, measured approach** to meta-programming tools addresses the current "all-or-nothing" limitation by providing:

1. **Scoped views** - focused context for agents
2. **Granular operations** - targeted modifications
3. **Region permissions** - author-controlled boundaries
4. **Intent-driven patterns** - high-level operations
5. **Versioning & constraints** - history and validation

This design balances **author control** (regions, constraints, permissions) with **agent capability** (scoped context, granular tools, clear intent), enabling **incremental, safe machine evolution** while maintaining backward compatibility.

**Next steps:**
1. Review and validate design with stakeholders
2. Prioritize implementation phases based on value
3. Create detailed specs for Phase 1 (scoped views)
4. Begin implementation with focused, testable increments
