# Meta-Tool Redesign: Incremental Machine Evolution

## Overview

This document proposes a redesign of DyGram's meta-programming tools to move from an "all-or-nothing" approach to an incremental, scoped, and reviewable system. The goal is to serve both machine authors (who want controlled evolution) and agents (who need focused capabilities).

## Problem Statement

### Current State

The existing meta-tools follow a monolithic pattern:

```typescript
// Current: Get EVERYTHING
get_machine_definition() → { json: MachineJSON, dsl: string }

// Current: Replace EVERYTHING
update_definition({ machine: MachineJSON, reason: string })
```

### Pain Points

| Stakeholder | Problem | Impact |
|-------------|---------|--------|
| **Machine Author** | Must provide complete machine to make any change | High risk of breaking working parts; no granular control |
| **Agent** | Receives entire machine context at once | Cognitive overload; unlimited power without focus |
| **Both** | No preview/review mechanism | Changes are immediate and difficult to audit |
| **Both** | No rollback capability | Mistakes are permanent |

### Design Goals

1. **Incremental Operations** - Small, focused changes instead of wholesale replacement
2. **Scoped Access** - Limit what agents can see/modify based on context
3. **Reviewable Changes** - Preview before commit; author maintains control
4. **Progressive Disclosure** - Simple queries first, full structure on demand
5. **Reversible** - Undo/rollback support for safety

---

## Architecture Overview

### Three-Tier Tool System

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: Query Tools (Read-Only)                                 │
│ ─────────────────────────────────────────────────────────────── │
│ query_node, query_neighborhood, query_pattern, query_reachable  │
│ get_machine_summary                                             │
│                                                                 │
│ → Always safe, no modification risk                             │
│ → Focused context instead of full machine dump                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ TIER 2: Proposal Tools (Change Requests)                        │
│ ─────────────────────────────────────────────────────────────── │
│ propose_add_node, propose_modify_node, propose_add_edge         │
│ propose_remove, review_proposals, commit_proposal               │
│                                                                 │
│ → Changes are staged, not immediate                             │
│ → Author can review/approve/reject                              │
│ → Batching support for cohesive changes                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ TIER 3: Scoped Mutation Tools (Direct, Limited)                 │
│ ─────────────────────────────────────────────────────────────── │
│ patch, extend_path, insert_branch, construct_tool               │
│                                                                 │
│ → Direct changes within @mutable zones only                     │
│ → @frozen zones are protected                                   │
│ → Pattern-based operations for common workflows                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        MachineExecutor                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    MetaToolManager                         │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐   │  │
│  │  │ QueryEngine  │ │ProposalMgr   │ │ MutationEngine   │   │  │
│  │  │              │ │              │ │                  │   │  │
│  │  │ • query_*    │ │ • propose_*  │ │ • patch          │   │  │
│  │  │ • summary    │ │ • review     │ │ • extend_path    │   │  │
│  │  │              │ │ • commit     │ │ • insert_branch  │   │  │
│  │  └──────────────┘ └──────────────┘ └──────────────────┘   │  │
│  │                          ↓                                 │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              ScopeEnforcer                          │  │  │
│  │  │  • Parses @mutable/@frozen annotations              │  │  │
│  │  │  • Validates operations against scope               │  │  │
│  │  │  • Enforces capability levels                       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                          ↓                                 │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              HistoryManager                         │  │  │
│  │  │  • Tracks all mutations                             │  │  │
│  │  │  • Supports rollback                                │  │  │
│  │  │  • Provides diff/audit trail                        │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Detailed Tool Specifications

### Tier 1: Query Tools

#### `query_node`

Query a specific node with optional detail level.

```typescript
interface QueryNodeInput {
  name: string;                    // Node name or pattern (e.g., "Process.*")
  include?: Array<'attributes' | 'edges' | 'annotations' | 'nested'>;
}

interface QueryNodeOutput {
  node: {
    name: string;
    type: string;
    description?: string;
    attributes?: Attribute[];
    annotations?: Annotation[];
  };
  inbound_edges: EdgeSummary[];    // Edges pointing TO this node
  outbound_edges: EdgeSummary[];   // Edges pointing FROM this node
  parent?: string;                 // If nested, the parent node
}

interface EdgeSummary {
  source: string;
  target: string;
  type?: string;
  label?: string;
}
```

**Use Cases:**
- "What does this task do?"
- "What transitions are available from here?"
- "What context does this node access?"

#### `query_neighborhood`

Query the local graph around a node.

```typescript
interface QueryNeighborhoodInput {
  center: string;                  // Node name
  depth?: number;                  // Hops to traverse (default: 1)
  direction?: 'in' | 'out' | 'both';
  include_types?: string[];        // Filter by node type
  exclude_types?: string[];        // Exclude by node type
}

interface QueryNeighborhoodOutput {
  center: NodeSummary;
  neighbors: NodeSummary[];
  edges: EdgeSummary[];
  depth_reached: number;
}

interface NodeSummary {
  name: string;
  type: string;
  description?: string;
  distance: number;                // Hops from center
}
```

**Use Cases:**
- "What's connected to the current node?"
- "Show me the error handling around this task"
- "What contexts are accessible from here?"

#### `query_pattern`

Find nodes matching criteria.

```typescript
interface QueryPatternInput {
  type?: string;                   // Node type filter
  name_pattern?: string;           // Regex for name matching
  has_annotation?: string;         // Must have this annotation
  has_attribute?: string;          // Must have this attribute
  connected_to?: string;           // Must be connected to this node
  within?: string;                 // Must be nested within this Process
}

interface QueryPatternOutput {
  matches: NodeSummary[];
  count: number;
  query: QueryPatternInput;        // Echo back for clarity
}
```

**Use Cases:**
- "Find all error handlers"
- "Find tasks with @Critical annotation"
- "Find nodes connected to the validation context"

#### `query_reachable`

Understand what's reachable from a position.

```typescript
interface QueryReachableInput {
  from?: string;                   // Default: current node
  max_depth?: number;              // Limit traversal
  through_types?: string[];        // Only traverse these edge types
}

interface QueryReachableOutput {
  reachable: string[];             // Node names that CAN be reached
  unreachable: string[];           // Nodes that CANNOT be reached
  paths: Array<{                   // Sample paths to reachable nodes
    target: string;
    path: string[];
  }>;
}
```

**Use Cases:**
- "What nodes can I eventually reach?"
- "Is the error handler reachable from here?"
- "What's isolated from the main flow?"

#### `get_machine_summary`

High-level overview without full details.

```typescript
interface GetMachineSummaryInput {
  include?: Array<'stats' | 'structure' | 'annotations'>;
}

interface GetMachineSummaryOutput {
  title: string;
  description?: string;
  stats: {
    total_nodes: number;
    nodes_by_type: Record<string, number>;
    total_edges: number;
    edges_by_type: Record<string, number>;
  };
  top_level_nodes: string[];       // Root-level node names
  annotations: Annotation[];       // Machine-level annotations
  mutable_zones?: string[];        // If @mutable defined
  frozen_zones?: string[];         // If @frozen defined
}
```

**Use Cases:**
- "What is this machine about?"
- "How complex is this machine?"
- "What zones can I modify?"

---

### Tier 2: Proposal Tools

#### Proposal Data Model

```typescript
interface Proposal {
  id: string;                      // Unique identifier
  type: ProposalType;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'rolled_back';
  created_at: string;              // ISO timestamp
  created_by: string;              // Node name where proposed
  rationale: string;               // Why this change

  // The change
  operation: ProposalOperation;

  // Analysis
  preview: {
    dsl_snippet: string;           // DSL representation
    affected_nodes: string[];
    affected_edges: string[];
  };

  impact?: {
    breaks_paths?: string[];       // Paths that would break
    orphans_nodes?: string[];      // Nodes that would be orphaned
    requires?: string[];           // Dependencies
  };

  // Lifecycle
  reviewed_at?: string;
  reviewed_by?: string;
  applied_at?: string;
  rollback_available: boolean;
}

type ProposalType =
  | 'add_node'
  | 'modify_node'
  | 'remove_node'
  | 'add_edge'
  | 'modify_edge'
  | 'remove_edge'
  | 'batch';                       // Multiple operations

type ProposalOperation =
  | AddNodeOperation
  | ModifyNodeOperation
  | RemoveNodeOperation
  | AddEdgeOperation
  | ModifyEdgeOperation
  | RemoveEdgeOperation
  | BatchOperation;
```

#### `propose_add_node`

```typescript
interface ProposeAddNodeInput {
  node: {
    name: string;
    type: string;
    description?: string;
    attributes?: Attribute[];
    annotations?: Annotation[];
  };
  parent?: string;                 // Nest within this Process
  connect_from?: string | string[];  // Create edge(s) from
  connect_to?: string | string[];    // Create edge(s) to
  rationale: string;
}

interface ProposeAddNodeOutput {
  proposal_id: string;
  status: 'pending' | 'auto_approved';
  preview: {
    dsl_snippet: string;
    node_count_delta: number;
    edge_count_delta: number;
  };
  auto_approved?: boolean;         // If approval mode is 'auto'
  message: string;
}
```

#### `propose_modify_node`

```typescript
interface ProposeModifyNodeInput {
  target: string;                  // Node to modify
  changes: {
    description?: string;
    set_attributes?: Attribute[];  // Add or update
    remove_attributes?: string[];  // Remove by name
    set_annotations?: Annotation[];
    remove_annotations?: string[];
  };
  rationale: string;
}

interface ProposeModifyNodeOutput {
  proposal_id: string;
  status: 'pending' | 'auto_approved' | 'rejected';
  rejected_reason?: string;        // If in @frozen zone
  preview: {
    before: string;                // DSL before
    after: string;                 // DSL after
    diff: string;                  // Unified diff
  };
}
```

#### `propose_add_edge`

```typescript
interface ProposeAddEdgeInput {
  source: string;
  target: string;
  type?: string;                   // Semantic type
  label?: string;
  annotations?: Annotation[];
  rationale: string;
}

interface ProposeAddEdgeOutput {
  proposal_id: string;
  status: 'pending' | 'auto_approved' | 'rejected';
  preview: {
    dsl_snippet: string;
    creates_cycle?: boolean;       // Warning if true
    parallel_edge_exists?: boolean; // Warning if true
  };
}
```

#### `propose_remove`

```typescript
interface ProposeRemoveInput {
  type: 'node' | 'edge';
  target: string | { source: string; target: string };
  cascade?: boolean;               // Also remove dependent edges
  rationale: string;
}

interface ProposeRemoveOutput {
  proposal_id: string;
  status: 'pending' | 'auto_approved' | 'rejected';
  impact: {
    nodes_removed: string[];
    edges_removed: Array<{ source: string; target: string }>;
    orphaned_nodes: string[];      // Would become unreachable
    broken_paths: string[];        // Active paths affected
  };
  requires_confirmation: boolean;  // If impact is significant
}
```

#### `propose_batch`

Group multiple proposals for atomic application.

```typescript
interface ProposeBatchInput {
  operations: Array<
    | { type: 'add_node'; ...ProposeAddNodeInput }
    | { type: 'modify_node'; ...ProposeModifyNodeInput }
    | { type: 'add_edge'; ...ProposeAddEdgeInput }
    | { type: 'remove'; ...ProposeRemoveInput }
  >;
  rationale: string;
}

interface ProposeBatchOutput {
  proposal_id: string;
  operation_count: number;
  status: 'pending' | 'auto_approved' | 'partially_rejected';
  preview: {
    dsl_diff: string;              // Full diff
    summary: string;               // Human-readable summary
  };
  rejected_operations?: Array<{
    index: number;
    reason: string;
  }>;
}
```

#### `review_proposals`

```typescript
interface ReviewProposalsInput {
  status?: 'pending' | 'all';
  created_by?: string;             // Filter by originating node
  limit?: number;
}

interface ReviewProposalsOutput {
  proposals: ProposalSummary[];
  pending_count: number;
  applied_count: number;
}

interface ProposalSummary {
  id: string;
  type: ProposalType;
  status: string;
  rationale: string;
  created_at: string;
  preview_snippet: string;         // Short DSL preview
}
```

#### `commit_proposal`

Apply a pending proposal (only if auto-approve or author confirms).

```typescript
interface CommitProposalInput {
  proposal_id: string;
  force?: boolean;                 // Override warnings
}

interface CommitProposalOutput {
  success: boolean;
  applied: boolean;
  message: string;
  rollback_id?: string;            // For undo
  updated_dsl?: string;            // New machine DSL
}
```

#### `rollback_proposal`

Undo an applied proposal.

```typescript
interface RollbackProposalInput {
  proposal_id: string;
}

interface RollbackProposalOutput {
  success: boolean;
  message: string;
  restored_dsl?: string;
}
```

---

### Tier 3: Scoped Mutation Tools

#### `patch`

Apply targeted changes using JSON Patch-like operations.

```typescript
interface PatchInput {
  operations: PatchOperation[];
}

type PatchOperation =
  | { op: 'add_node'; node: NodeDef; parent?: string }
  | { op: 'add_edge'; edge: EdgeDef }
  | { op: 'set'; path: string; value: any }      // e.g., "nodes.validate.attributes.prompt"
  | { op: 'remove'; path: string }
  | { op: 'move'; from: string; to: string }
  | { op: 'copy'; from: string; to: string };

interface PatchOutput {
  success: boolean;
  applied_count: number;
  rejected: Array<{
    operation: PatchOperation;
    reason: string;                // Usually scope violation
  }>;
  updated_dsl?: string;
}
```

**Scope Enforcement:**
- Operations are validated against `@mutable`/`@frozen` zones
- Rejected if targeting frozen zone
- Only available if capability includes "mutate"

#### `extend_path`

Add steps to an existing workflow.

```typescript
interface ExtendPathInput {
  after_node: string;              // Insert after this node
  new_nodes: Array<{
    name: string;
    type: string;
    description?: string;
    attributes?: Attribute[];
  }>;
  rewire?: boolean;                // Reconnect existing edges (default: true)
}

interface ExtendPathOutput {
  success: boolean;
  nodes_added: string[];
  edges_added: Array<{ source: string; target: string }>;
  edges_rewired: Array<{
    original: { source: string; target: string };
    new: { source: string; target: string };
  }>;
  updated_dsl?: string;
}
```

**Example:**
```
Before: A -> B -> C
extend_path(after_node: "B", new_nodes: [X, Y], rewire: true)
After:  A -> B -> X -> Y -> C
```

#### `insert_branch`

Add a decision point with multiple branches.

```typescript
interface InsertBranchInput {
  at_node: string;                 // Where to insert branching
  branches: Array<{
    condition?: string;            // Edge label/condition
    target: string | NodeDef;      // Existing node or new node
    annotations?: Annotation[];
  }>;
  preserve_existing?: boolean;     // Keep existing outbound edges
}

interface InsertBranchOutput {
  success: boolean;
  branches_created: number;
  nodes_added: string[];
  edges_added: Array<{ source: string; target: string }>;
  updated_dsl?: string;
}
```

**Example:**
```
Before: validate -> process
insert_branch(at_node: "validate", branches: [
  { condition: "valid", target: "process" },
  { condition: "invalid", target: { name: "handle_error", type: "Task" } }
])
After:  validate -> process    (when valid)
        validate -> handle_error (when invalid)
```

---

## Capability & Scope Model

### Annotation Syntax

```dygram
machine "Evolvable System" @meta(
  // What capabilities are enabled
  capabilities: ["query", "propose", "mutate", "construct_tools"],

  // How proposals are handled
  approval: "prompt",              // "auto" | "prompt" | "batch" | "review"

  // What zones can be modified
  mutable: ["Extensions.*", "tools"],

  // What zones are protected
  frozen: ["CoreWorkflow.*", "Security.*"]
)
```

### Capability Levels

```typescript
type Capability =
  | 'query'           // Tier 1: Query tools only
  | 'propose'         // Tier 2: Proposal tools
  | 'mutate'          // Tier 3: Direct mutation (within scope)
  | 'construct_tools' // Can create dynamic tools
  | '*';              // Unrestricted (current behavior)

interface MetaConfig {
  capabilities: Capability[];
  approval: ApprovalMode;
  mutable: string[];              // Glob patterns
  frozen: string[];               // Glob patterns
}

type ApprovalMode =
  | 'auto'            // Apply proposals immediately
  | 'prompt'          // Ask user before applying
  | 'batch'           // Collect proposals, apply at checkpoint
  | 'review';         // Require explicit review step
```

### Scope Resolution

```typescript
class ScopeEnforcer {
  constructor(private config: MetaConfig) {}

  canQuery(path: string): boolean {
    // Query is always allowed
    return true;
  }

  canPropose(path: string): boolean {
    // Can propose changes to anything not frozen
    return !this.isFrozen(path);
  }

  canMutate(path: string): boolean {
    // Must be explicitly mutable AND not frozen
    return this.isMutable(path) && !this.isFrozen(path);
  }

  private isFrozen(path: string): boolean {
    return this.config.frozen.some(pattern =>
      this.matchGlob(path, pattern)
    );
  }

  private isMutable(path: string): boolean {
    return this.config.mutable.some(pattern =>
      this.matchGlob(path, pattern)
    );
  }

  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    // "Process.*" matches "Process.Step1", "Process.Step2.Nested", etc.
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
    );
    return regex.test(path);
  }
}
```

---

## Code-Level Implementation

### File Structure

```
src/language/
├── meta/
│   ├── index.ts                   # Re-exports
│   ├── query-engine.ts            # Tier 1: Query tools
│   ├── proposal-manager.ts        # Tier 2: Proposal system
│   ├── mutation-engine.ts         # Tier 3: Scoped mutations
│   ├── scope-enforcer.ts          # Capability & scope validation
│   ├── history-manager.ts         # Rollback & audit trail
│   └── types.ts                   # Shared types
├── meta-tool-manager.ts           # Updated to use new components
└── execution/
    └── effect-executor.ts         # Updated tool routing
```

### QueryEngine Implementation

```typescript
// src/language/meta/query-engine.ts

import type { MachineJSON, NodeJSON, EdgeJSON } from '../json/types.js';

export class QueryEngine {
  constructor(private machineData: MachineJSON) {}

  /**
   * Query a specific node with configurable detail level
   */
  queryNode(input: QueryNodeInput): QueryNodeOutput {
    const { name, include = ['attributes', 'edges'] } = input;

    // Support pattern matching
    const nodes = this.findNodesByPattern(name);
    if (nodes.length === 0) {
      throw new Error(`No nodes matching '${name}'`);
    }

    const node = nodes[0]; // Primary match
    const result: QueryNodeOutput = {
      node: {
        name: node.name,
        type: node.type || 'unknown',
        description: node.description
      },
      inbound_edges: [],
      outbound_edges: []
    };

    if (include.includes('attributes')) {
      result.node.attributes = node.attributes;
    }

    if (include.includes('annotations')) {
      result.node.annotations = node.annotations;
    }

    if (include.includes('edges')) {
      result.inbound_edges = this.machineData.edges
        .filter(e => e.target === node.name)
        .map(this.summarizeEdge);

      result.outbound_edges = this.machineData.edges
        .filter(e => e.source === node.name)
        .map(this.summarizeEdge);
    }

    // Find parent if nested
    result.parent = this.findParent(node.name);

    return result;
  }

  /**
   * Query neighborhood around a node
   */
  queryNeighborhood(input: QueryNeighborhoodInput): QueryNeighborhoodOutput {
    const { center, depth = 1, direction = 'both' } = input;

    const centerNode = this.machineData.nodes.find(n => n.name === center);
    if (!centerNode) {
      throw new Error(`Node '${center}' not found`);
    }

    const visited = new Set<string>([center]);
    const neighbors: NodeSummary[] = [];
    const edges: EdgeSummary[] = [];

    // BFS traversal
    let frontier = [{ name: center, distance: 0 }];

    while (frontier.length > 0 && frontier[0].distance < depth) {
      const next: typeof frontier = [];

      for (const { name, distance } of frontier) {
        const adjacentEdges = this.getAdjacentEdges(name, direction);

        for (const edge of adjacentEdges) {
          const neighborName = edge.source === name ? edge.target : edge.source;

          if (!visited.has(neighborName)) {
            visited.add(neighborName);
            const neighborNode = this.machineData.nodes.find(n => n.name === neighborName);

            if (neighborNode) {
              neighbors.push({
                name: neighborName,
                type: neighborNode.type || 'unknown',
                description: neighborNode.description,
                distance: distance + 1
              });
              next.push({ name: neighborName, distance: distance + 1 });
            }
          }

          // Collect edge if not already included
          if (!edges.some(e =>
            e.source === edge.source && e.target === edge.target
          )) {
            edges.push(this.summarizeEdge(edge));
          }
        }
      }

      frontier = next;
    }

    return {
      center: {
        name: center,
        type: centerNode.type || 'unknown',
        description: centerNode.description,
        distance: 0
      },
      neighbors,
      edges,
      depth_reached: Math.max(...neighbors.map(n => n.distance), 0)
    };
  }

  /**
   * Find nodes matching criteria
   */
  queryPattern(input: QueryPatternInput): QueryPatternOutput {
    let matches = [...this.machineData.nodes];

    if (input.type) {
      matches = matches.filter(n =>
        n.type?.toLowerCase() === input.type!.toLowerCase()
      );
    }

    if (input.name_pattern) {
      const regex = new RegExp(input.name_pattern, 'i');
      matches = matches.filter(n => regex.test(n.name));
    }

    if (input.has_annotation) {
      matches = matches.filter(n =>
        n.annotations?.some(a => a.name === input.has_annotation)
      );
    }

    if (input.has_attribute) {
      matches = matches.filter(n =>
        n.attributes?.some(a => a.name === input.has_attribute)
      );
    }

    if (input.connected_to) {
      const connectedNodes = new Set(
        this.machineData.edges
          .filter(e => e.source === input.connected_to || e.target === input.connected_to)
          .flatMap(e => [e.source, e.target])
      );
      matches = matches.filter(n => connectedNodes.has(n.name));
    }

    if (input.within) {
      matches = matches.filter(n =>
        n.name.startsWith(input.within + '.') || n.name === input.within
      );
    }

    return {
      matches: matches.map(n => ({
        name: n.name,
        type: n.type || 'unknown',
        description: n.description,
        distance: 0
      })),
      count: matches.length,
      query: input
    };
  }

  /**
   * Query reachability from a node
   */
  queryReachable(input: QueryReachableInput): QueryReachableOutput {
    const { from, max_depth = Infinity } = input;
    const startNode = from || this.machineData.nodes[0]?.name;

    if (!startNode) {
      throw new Error('No start node specified and machine has no nodes');
    }

    const reachable = new Set<string>();
    const paths = new Map<string, string[]>();

    // BFS for reachability
    const queue: Array<{ node: string; path: string[]; depth: number }> = [
      { node: startNode, path: [startNode], depth: 0 }
    ];

    while (queue.length > 0) {
      const { node, path, depth } = queue.shift()!;

      if (depth > max_depth) continue;

      const outEdges = this.machineData.edges.filter(e => e.source === node);

      for (const edge of outEdges) {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target);
          const newPath = [...path, edge.target];
          paths.set(edge.target, newPath);
          queue.push({ node: edge.target, path: newPath, depth: depth + 1 });
        }
      }
    }

    const allNodes = new Set(this.machineData.nodes.map(n => n.name));
    const unreachable = [...allNodes].filter(n =>
      n !== startNode && !reachable.has(n)
    );

    return {
      reachable: [...reachable],
      unreachable,
      paths: [...paths.entries()].slice(0, 10).map(([target, path]) => ({
        target,
        path
      }))
    };
  }

  /**
   * Get high-level machine summary
   */
  getMachineSummary(input: GetMachineSummaryInput = {}): GetMachineSummaryOutput {
    const { include = ['stats', 'structure', 'annotations'] } = input;

    const result: GetMachineSummaryOutput = {
      title: this.machineData.title,
      stats: {
        total_nodes: 0,
        nodes_by_type: {},
        total_edges: 0,
        edges_by_type: {}
      },
      top_level_nodes: [],
      annotations: []
    };

    if (include.includes('stats')) {
      result.stats.total_nodes = this.machineData.nodes.length;
      result.stats.total_edges = this.machineData.edges.length;

      for (const node of this.machineData.nodes) {
        const type = node.type || 'unknown';
        result.stats.nodes_by_type[type] = (result.stats.nodes_by_type[type] || 0) + 1;
      }

      for (const edge of this.machineData.edges) {
        const type = edge.type || 'default';
        result.stats.edges_by_type[type] = (result.stats.edges_by_type[type] || 0) + 1;
      }
    }

    if (include.includes('structure')) {
      // Top-level nodes are those without a dot in their name (not nested)
      result.top_level_nodes = this.machineData.nodes
        .filter(n => !n.name.includes('.'))
        .map(n => n.name);
    }

    if (include.includes('annotations')) {
      result.annotations = this.machineData.annotations || [];

      // Extract mutable/frozen zones from @meta annotation
      const metaAnnotation = result.annotations.find(a => a.name === 'meta');
      if (metaAnnotation?.attributes) {
        result.mutable_zones = metaAnnotation.attributes.mutable;
        result.frozen_zones = metaAnnotation.attributes.frozen;
      }
    }

    return result;
  }

  // Helper methods
  private findNodesByPattern(pattern: string): NodeJSON[] {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      return this.machineData.nodes.filter(n => regex.test(n.name));
    }
    const node = this.machineData.nodes.find(n => n.name === pattern);
    return node ? [node] : [];
  }

  private getAdjacentEdges(nodeName: string, direction: 'in' | 'out' | 'both'): EdgeJSON[] {
    return this.machineData.edges.filter(e => {
      if (direction === 'out') return e.source === nodeName;
      if (direction === 'in') return e.target === nodeName;
      return e.source === nodeName || e.target === nodeName;
    });
  }

  private summarizeEdge(edge: EdgeJSON): EdgeSummary {
    return {
      source: edge.source as string,
      target: edge.target as string,
      type: edge.type,
      label: edge.label
    };
  }

  private findParent(nodeName: string): string | undefined {
    const lastDot = nodeName.lastIndexOf('.');
    if (lastDot === -1) return undefined;
    return nodeName.substring(0, lastDot);
  }
}
```

### ProposalManager Implementation

```typescript
// src/language/meta/proposal-manager.ts

import { v4 as uuidv4 } from 'uuid';
import type { MachineJSON } from '../json/types.js';
import type { ScopeEnforcer } from './scope-enforcer.js';

export class ProposalManager {
  private proposals = new Map<string, Proposal>();
  private history: AppliedProposal[] = [];

  constructor(
    private machineData: MachineJSON,
    private scopeEnforcer: ScopeEnforcer,
    private approvalMode: ApprovalMode,
    private onUpdate: (dsl: string, json: MachineJSON) => void
  ) {}

  /**
   * Create a proposal to add a node
   */
  proposeAddNode(input: ProposeAddNodeInput): ProposeAddNodeOutput {
    const { node, parent, connect_from, connect_to, rationale } = input;

    // Check scope
    const targetPath = parent ? `${parent}.${node.name}` : node.name;
    if (!this.scopeEnforcer.canPropose(targetPath)) {
      return {
        proposal_id: '',
        status: 'rejected',
        preview: { dsl_snippet: '', node_count_delta: 0, edge_count_delta: 0 },
        message: `Cannot propose changes to frozen zone: ${targetPath}`
      };
    }

    // Generate preview
    const preview = this.generateAddNodePreview(node, parent, connect_from, connect_to);

    // Create proposal
    const proposal: Proposal = {
      id: uuidv4(),
      type: 'add_node',
      status: 'pending',
      created_at: new Date().toISOString(),
      created_by: 'agent', // TODO: get from context
      rationale,
      operation: { type: 'add_node', node, parent, connect_from, connect_to },
      preview,
      rollback_available: true
    };

    // Auto-approve if configured
    if (this.approvalMode === 'auto') {
      return this.applyProposal(proposal);
    }

    this.proposals.set(proposal.id, proposal);

    return {
      proposal_id: proposal.id,
      status: 'pending',
      preview: {
        dsl_snippet: preview.dsl_snippet,
        node_count_delta: 1,
        edge_count_delta: (connect_from ? 1 : 0) + (connect_to ? 1 : 0)
      },
      message: `Proposal created. ${this.getApprovalMessage()}`
    };
  }

  /**
   * Create a proposal to modify a node
   */
  proposeModifyNode(input: ProposeModifyNodeInput): ProposeModifyNodeOutput {
    const { target, changes, rationale } = input;

    // Check scope
    if (!this.scopeEnforcer.canPropose(target)) {
      return {
        proposal_id: '',
        status: 'rejected',
        rejected_reason: `Cannot propose changes to frozen zone: ${target}`,
        preview: { before: '', after: '', diff: '' }
      };
    }

    const node = this.machineData.nodes.find(n => n.name === target);
    if (!node) {
      return {
        proposal_id: '',
        status: 'rejected',
        rejected_reason: `Node '${target}' not found`,
        preview: { before: '', after: '', diff: '' }
      };
    }

    const preview = this.generateModifyNodePreview(node, changes);

    const proposal: Proposal = {
      id: uuidv4(),
      type: 'modify_node',
      status: 'pending',
      created_at: new Date().toISOString(),
      created_by: 'agent',
      rationale,
      operation: { type: 'modify_node', target, changes },
      preview,
      rollback_available: true
    };

    if (this.approvalMode === 'auto') {
      return this.applyModifyProposal(proposal);
    }

    this.proposals.set(proposal.id, proposal);

    return {
      proposal_id: proposal.id,
      status: 'pending',
      preview: {
        before: preview.before,
        after: preview.after,
        diff: preview.diff
      }
    };
  }

  /**
   * Review pending proposals
   */
  reviewProposals(input: ReviewProposalsInput = {}): ReviewProposalsOutput {
    const { status = 'pending', limit = 20 } = input;

    let proposals = [...this.proposals.values()];

    if (status === 'pending') {
      proposals = proposals.filter(p => p.status === 'pending');
    }

    return {
      proposals: proposals.slice(0, limit).map(p => ({
        id: p.id,
        type: p.type,
        status: p.status,
        rationale: p.rationale,
        created_at: p.created_at,
        preview_snippet: p.preview.dsl_snippet.substring(0, 100)
      })),
      pending_count: [...this.proposals.values()].filter(p => p.status === 'pending').length,
      applied_count: this.history.length
    };
  }

  /**
   * Commit a pending proposal
   */
  commitProposal(input: CommitProposalInput): CommitProposalOutput {
    const { proposal_id, force = false } = input;

    const proposal = this.proposals.get(proposal_id);
    if (!proposal) {
      return {
        success: false,
        applied: false,
        message: `Proposal '${proposal_id}' not found`
      };
    }

    if (proposal.status !== 'pending') {
      return {
        success: false,
        applied: false,
        message: `Proposal is ${proposal.status}, not pending`
      };
    }

    // Check if direct mutation is allowed
    const targetPath = this.getProposalTargetPath(proposal);
    if (!this.scopeEnforcer.canMutate(targetPath) && !force) {
      return {
        success: false,
        applied: false,
        message: `Cannot directly mutate '${targetPath}'. Use force=true to override.`
      };
    }

    return this.applyProposal(proposal);
  }

  /**
   * Rollback an applied proposal
   */
  rollbackProposal(input: RollbackProposalInput): RollbackProposalOutput {
    const { proposal_id } = input;

    const appliedIndex = this.history.findIndex(h => h.proposal.id === proposal_id);
    if (appliedIndex === -1) {
      return {
        success: false,
        message: `No applied proposal found with id '${proposal_id}'`
      };
    }

    const applied = this.history[appliedIndex];

    // Restore previous state
    // This is a simplified implementation - real rollback would need
    // to handle cascading changes
    Object.assign(this.machineData, applied.previousState);

    // Remove from history
    this.history.splice(appliedIndex, 1);

    // Update proposal status
    applied.proposal.status = 'rolled_back';

    // Notify
    const { generateDSL } = require('../generator/generator.js');
    const dsl = generateDSL(this.machineData);
    this.onUpdate(dsl, this.machineData);

    return {
      success: true,
      message: `Proposal '${proposal_id}' rolled back successfully`,
      restored_dsl: dsl
    };
  }

  // Private helpers
  private applyProposal(proposal: Proposal): ProposeAddNodeOutput {
    const previousState = JSON.parse(JSON.stringify(this.machineData));

    try {
      this.executeOperation(proposal.operation);

      proposal.status = 'applied';
      proposal.applied_at = new Date().toISOString();

      this.history.push({
        proposal,
        previousState,
        applied_at: proposal.applied_at
      });

      const { generateDSL } = require('../generator/generator.js');
      const dsl = generateDSL(this.machineData);
      this.onUpdate(dsl, this.machineData);

      return {
        proposal_id: proposal.id,
        status: 'auto_approved',
        preview: proposal.preview as any,
        auto_approved: true,
        message: 'Proposal applied successfully'
      };
    } catch (error: any) {
      // Restore on failure
      Object.assign(this.machineData, previousState);

      return {
        proposal_id: proposal.id,
        status: 'rejected',
        preview: proposal.preview as any,
        message: `Failed to apply: ${error.message}`
      };
    }
  }

  private executeOperation(operation: ProposalOperation): void {
    switch (operation.type) {
      case 'add_node':
        this.executeAddNode(operation);
        break;
      case 'modify_node':
        this.executeModifyNode(operation);
        break;
      case 'add_edge':
        this.executeAddEdge(operation);
        break;
      case 'remove_node':
      case 'remove_edge':
        this.executeRemove(operation);
        break;
    }
  }

  private executeAddNode(op: AddNodeOperation): void {
    const fullName = op.parent ? `${op.parent}.${op.node.name}` : op.node.name;

    this.machineData.nodes.push({
      name: fullName,
      type: op.node.type,
      description: op.node.description,
      attributes: op.node.attributes,
      annotations: op.node.annotations
    });

    if (op.connect_from) {
      const sources = Array.isArray(op.connect_from) ? op.connect_from : [op.connect_from];
      for (const source of sources) {
        this.machineData.edges.push({ source, target: fullName });
      }
    }

    if (op.connect_to) {
      const targets = Array.isArray(op.connect_to) ? op.connect_to : [op.connect_to];
      for (const target of targets) {
        this.machineData.edges.push({ source: fullName, target });
      }
    }
  }

  private executeModifyNode(op: ModifyNodeOperation): void {
    const node = this.machineData.nodes.find(n => n.name === op.target);
    if (!node) throw new Error(`Node '${op.target}' not found`);

    if (op.changes.description !== undefined) {
      node.description = op.changes.description;
    }

    if (op.changes.set_attributes) {
      node.attributes = node.attributes || [];
      for (const attr of op.changes.set_attributes) {
        const existing = node.attributes.find(a => a.name === attr.name);
        if (existing) {
          Object.assign(existing, attr);
        } else {
          node.attributes.push(attr);
        }
      }
    }

    if (op.changes.remove_attributes) {
      node.attributes = (node.attributes || []).filter(
        a => !op.changes.remove_attributes!.includes(a.name)
      );
    }
  }

  private executeAddEdge(op: AddEdgeOperation): void {
    this.machineData.edges.push({
      source: op.source,
      target: op.target,
      type: op.type,
      label: op.label,
      annotations: op.annotations
    });
  }

  private executeRemove(op: RemoveNodeOperation | RemoveEdgeOperation): void {
    if (op.type === 'remove_node') {
      const target = op.target as string;
      this.machineData.nodes = this.machineData.nodes.filter(n => n.name !== target);
      if (op.cascade) {
        this.machineData.edges = this.machineData.edges.filter(
          e => e.source !== target && e.target !== target
        );
      }
    } else {
      const { source, target } = op.target as { source: string; target: string };
      this.machineData.edges = this.machineData.edges.filter(
        e => !(e.source === source && e.target === target)
      );
    }
  }

  private generateAddNodePreview(
    node: any,
    parent?: string,
    connectFrom?: string | string[],
    connectTo?: string | string[]
  ): ProposalPreview {
    const lines: string[] = [];
    const fullName = parent ? `${parent}.${node.name}` : node.name;

    // Node definition
    lines.push(`${node.type} ${node.name} {`);
    if (node.description) {
      lines.push(`  description: "${node.description}"`);
    }
    if (node.attributes) {
      for (const attr of node.attributes) {
        lines.push(`  ${attr.name}: ${JSON.stringify(attr.value)}`);
      }
    }
    lines.push('}');

    // Edges
    if (connectFrom) {
      const sources = Array.isArray(connectFrom) ? connectFrom : [connectFrom];
      for (const source of sources) {
        lines.push(`${source} -> ${fullName}`);
      }
    }
    if (connectTo) {
      const targets = Array.isArray(connectTo) ? connectTo : [connectTo];
      for (const target of targets) {
        lines.push(`${fullName} -> ${target}`);
      }
    }

    return {
      dsl_snippet: lines.join('\n'),
      affected_nodes: [fullName],
      affected_edges: []
    };
  }

  private generateModifyNodePreview(node: any, changes: any): ProposalPreview {
    // Generate before/after DSL snippets
    const before = this.nodeToSnippet(node);

    const modifiedNode = JSON.parse(JSON.stringify(node));
    if (changes.description !== undefined) {
      modifiedNode.description = changes.description;
    }
    if (changes.set_attributes) {
      modifiedNode.attributes = modifiedNode.attributes || [];
      for (const attr of changes.set_attributes) {
        const existing = modifiedNode.attributes.find((a: any) => a.name === attr.name);
        if (existing) {
          Object.assign(existing, attr);
        } else {
          modifiedNode.attributes.push(attr);
        }
      }
    }

    const after = this.nodeToSnippet(modifiedNode);

    return {
      dsl_snippet: after,
      before,
      after,
      diff: this.generateDiff(before, after),
      affected_nodes: [node.name],
      affected_edges: []
    };
  }

  private nodeToSnippet(node: any): string {
    const lines: string[] = [];
    lines.push(`${node.type || 'node'} ${node.name} {`);
    if (node.description) {
      lines.push(`  description: "${node.description}"`);
    }
    if (node.attributes) {
      for (const attr of node.attributes) {
        lines.push(`  ${attr.name}: ${JSON.stringify(attr.value)}`);
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  private generateDiff(before: string, after: string): string {
    // Simple line-by-line diff
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const diff: string[] = [];

    const maxLines = Math.max(beforeLines.length, afterLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (beforeLines[i] !== afterLines[i]) {
        if (beforeLines[i]) diff.push(`- ${beforeLines[i]}`);
        if (afterLines[i]) diff.push(`+ ${afterLines[i]}`);
      } else if (beforeLines[i]) {
        diff.push(`  ${beforeLines[i]}`);
      }
    }

    return diff.join('\n');
  }

  private getProposalTargetPath(proposal: Proposal): string {
    switch (proposal.operation.type) {
      case 'add_node':
        const addOp = proposal.operation as AddNodeOperation;
        return addOp.parent ? `${addOp.parent}.${addOp.node.name}` : addOp.node.name;
      case 'modify_node':
        return (proposal.operation as ModifyNodeOperation).target;
      case 'add_edge':
        const edgeOp = proposal.operation as AddEdgeOperation;
        return `${edgeOp.source}->${edgeOp.target}`;
      default:
        return '';
    }
  }

  private getApprovalMessage(): string {
    switch (this.approvalMode) {
      case 'prompt':
        return 'Awaiting user approval.';
      case 'batch':
        return 'Will be applied at next checkpoint.';
      case 'review':
        return 'Requires explicit review before application.';
      default:
        return '';
    }
  }
}

interface AppliedProposal {
  proposal: Proposal;
  previousState: MachineJSON;
  applied_at: string;
}
```

### Updated MetaToolManager Integration

```typescript
// src/language/meta-tool-manager.ts (updated)

import { QueryEngine } from './meta/query-engine.js';
import { ProposalManager } from './meta/proposal-manager.js';
import { ScopeEnforcer } from './meta/scope-enforcer.js';
import { MutationEngine } from './meta/mutation-engine.js';
import { HistoryManager } from './meta/history-manager.js';

export class MetaToolManager {
  private queryEngine: QueryEngine;
  private proposalManager: ProposalManager;
  private scopeEnforcer: ScopeEnforcer;
  private mutationEngine: MutationEngine;
  private historyManager: HistoryManager;

  // Existing fields...
  private dynamicTools = new Map<string, DynamicTool>();
  private proposals: ToolImprovementProposal[] = [];

  constructor(
    private _machineData: MachineJSON,
    private onMutation: (mutation: any) => void,
    toolRegistry?: ToolRegistry
  ) {
    // Parse meta config from annotations
    const metaConfig = this.parseMetaConfig(_machineData.annotations);

    // Initialize new components
    this.scopeEnforcer = new ScopeEnforcer(metaConfig);
    this.queryEngine = new QueryEngine(_machineData);
    this.historyManager = new HistoryManager();

    this.proposalManager = new ProposalManager(
      _machineData,
      this.scopeEnforcer,
      metaConfig.approval,
      (dsl, json) => this.handleUpdate(dsl, json)
    );

    this.mutationEngine = new MutationEngine(
      _machineData,
      this.scopeEnforcer,
      (dsl, json) => this.handleUpdate(dsl, json)
    );

    this.toolRegistry = toolRegistry;
  }

  /**
   * Get all meta tools based on capability level
   */
  getMetaTools(): ToolDefinition[] {
    const capabilities = this.scopeEnforcer.getCapabilities();
    const tools: ToolDefinition[] = [];

    // Tier 1: Query tools (always available if any meta capability)
    if (capabilities.length > 0) {
      tools.push(...this.getQueryToolDefinitions());
    }

    // Tier 2: Proposal tools
    if (capabilities.includes('propose') || capabilities.includes('*')) {
      tools.push(...this.getProposalToolDefinitions());
    }

    // Tier 3: Mutation tools
    if (capabilities.includes('mutate') || capabilities.includes('*')) {
      tools.push(...this.getMutationToolDefinitions());
    }

    // Tool construction
    if (capabilities.includes('construct_tools') || capabilities.includes('*')) {
      tools.push(...this.getToolConstructionDefinitions());
    }

    // Legacy tools (only if '*' capability for backward compatibility)
    if (capabilities.includes('*')) {
      tools.push(...this.getLegacyToolDefinitions());
    }

    return tools;
  }

  private getQueryToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'query_node',
        description: 'Query a specific node with optional detail level. Returns node info and connected edges.',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Node name or pattern (e.g., "Process.*")'
            },
            include: {
              type: 'array',
              items: { type: 'string', enum: ['attributes', 'edges', 'annotations', 'nested'] },
              description: 'What details to include'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'query_neighborhood',
        description: 'Query the local graph around a node. Shows immediate connections.',
        input_schema: {
          type: 'object',
          properties: {
            center: { type: 'string', description: 'Center node name' },
            depth: { type: 'number', description: 'Hops to traverse (default: 1)' },
            direction: { type: 'string', enum: ['in', 'out', 'both'], description: 'Edge direction' }
          },
          required: ['center']
        }
      },
      {
        name: 'query_pattern',
        description: 'Find nodes matching criteria like type, name pattern, or annotations.',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Filter by node type' },
            name_pattern: { type: 'string', description: 'Regex pattern for name' },
            has_annotation: { type: 'string', description: 'Must have this annotation' },
            has_attribute: { type: 'string', description: 'Must have this attribute' },
            connected_to: { type: 'string', description: 'Must connect to this node' },
            within: { type: 'string', description: 'Must be nested within this Process' }
          }
        }
      },
      {
        name: 'query_reachable',
        description: 'Find what nodes are reachable from a position via outbound edges.',
        input_schema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start node (default: current)' },
            max_depth: { type: 'number', description: 'Maximum traversal depth' }
          }
        }
      },
      {
        name: 'get_machine_summary',
        description: 'Get high-level machine overview with stats and structure.',
        input_schema: {
          type: 'object',
          properties: {
            include: {
              type: 'array',
              items: { type: 'string', enum: ['stats', 'structure', 'annotations'] }
            }
          }
        }
      }
    ];
  }

  private getProposalToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'propose_add_node',
        description: 'Propose adding a new node. Creates a reviewable proposal.',
        input_schema: {
          type: 'object',
          properties: {
            node: {
              type: 'object',
              description: 'Node definition with name, type, description, attributes',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' },
                attributes: { type: 'array' }
              },
              required: ['name', 'type']
            },
            parent: { type: 'string', description: 'Nest within this Process' },
            connect_from: {
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
              description: 'Create edge(s) from these nodes'
            },
            connect_to: {
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
              description: 'Create edge(s) to these nodes'
            },
            rationale: { type: 'string', description: 'Why this change is needed' }
          },
          required: ['node', 'rationale']
        }
      },
      {
        name: 'propose_modify_node',
        description: 'Propose modifying an existing node.',
        input_schema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Node to modify' },
            changes: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                set_attributes: { type: 'array' },
                remove_attributes: { type: 'array', items: { type: 'string' } }
              }
            },
            rationale: { type: 'string' }
          },
          required: ['target', 'changes', 'rationale']
        }
      },
      {
        name: 'propose_add_edge',
        description: 'Propose adding a new edge between nodes.',
        input_schema: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            type: { type: 'string', description: 'Semantic edge type' },
            label: { type: 'string' },
            rationale: { type: 'string' }
          },
          required: ['source', 'target', 'rationale']
        }
      },
      {
        name: 'propose_remove',
        description: 'Propose removing a node or edge. Shows impact analysis.',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['node', 'edge'] },
            target: {
              description: 'Node name or {source, target} for edge',
              oneOf: [
                { type: 'string' },
                { type: 'object', properties: { source: { type: 'string' }, target: { type: 'string' } } }
              ]
            },
            cascade: { type: 'boolean', description: 'Also remove dependent edges' },
            rationale: { type: 'string' }
          },
          required: ['type', 'target', 'rationale']
        }
      },
      {
        name: 'review_proposals',
        description: 'List pending proposals with their status.',
        input_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'all'] },
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'commit_proposal',
        description: 'Apply a pending proposal.',
        input_schema: {
          type: 'object',
          properties: {
            proposal_id: { type: 'string' },
            force: { type: 'boolean', description: 'Override scope restrictions' }
          },
          required: ['proposal_id']
        }
      },
      {
        name: 'rollback_proposal',
        description: 'Undo an applied proposal.',
        input_schema: {
          type: 'object',
          properties: {
            proposal_id: { type: 'string' }
          },
          required: ['proposal_id']
        }
      }
    ];
  }

  private getMutationToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'patch',
        description: 'Apply targeted changes using patch operations. Only works within @mutable zones.',
        input_schema: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  op: { type: 'string', enum: ['add_node', 'add_edge', 'set', 'remove', 'move'] },
                  // Other properties depend on op type
                }
              }
            }
          },
          required: ['operations']
        }
      },
      {
        name: 'extend_path',
        description: 'Add steps to an existing workflow path.',
        input_schema: {
          type: 'object',
          properties: {
            after_node: { type: 'string', description: 'Insert after this node' },
            new_nodes: { type: 'array', description: 'Nodes to insert' },
            rewire: { type: 'boolean', description: 'Reconnect edges (default: true)' }
          },
          required: ['after_node', 'new_nodes']
        }
      },
      {
        name: 'insert_branch',
        description: 'Add a decision point with multiple branches.',
        input_schema: {
          type: 'object',
          properties: {
            at_node: { type: 'string' },
            branches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  condition: { type: 'string' },
                  target: { description: 'Existing node name or new node definition' }
                }
              }
            },
            preserve_existing: { type: 'boolean' }
          },
          required: ['at_node', 'branches']
        }
      }
    ];
  }

  /**
   * Execute a meta tool
   */
  async executeMetaTool(toolName: string, input: any): Promise<any> {
    // Query tools
    if (toolName === 'query_node') return this.queryEngine.queryNode(input);
    if (toolName === 'query_neighborhood') return this.queryEngine.queryNeighborhood(input);
    if (toolName === 'query_pattern') return this.queryEngine.queryPattern(input);
    if (toolName === 'query_reachable') return this.queryEngine.queryReachable(input);
    if (toolName === 'get_machine_summary') return this.queryEngine.getMachineSummary(input);

    // Proposal tools
    if (toolName === 'propose_add_node') return this.proposalManager.proposeAddNode(input);
    if (toolName === 'propose_modify_node') return this.proposalManager.proposeModifyNode(input);
    if (toolName === 'propose_add_edge') return this.proposalManager.proposeAddEdge(input);
    if (toolName === 'propose_remove') return this.proposalManager.proposeRemove(input);
    if (toolName === 'review_proposals') return this.proposalManager.reviewProposals(input);
    if (toolName === 'commit_proposal') return this.proposalManager.commitProposal(input);
    if (toolName === 'rollback_proposal') return this.proposalManager.rollbackProposal(input);

    // Mutation tools
    if (toolName === 'patch') return this.mutationEngine.patch(input);
    if (toolName === 'extend_path') return this.mutationEngine.extendPath(input);
    if (toolName === 'insert_branch') return this.mutationEngine.insertBranch(input);

    // Legacy tools (backward compatibility)
    if (toolName === 'get_machine_definition') return this.getMachineDefinition(input);
    if (toolName === 'update_definition') return this.updateDefinition(input);
    if (toolName === 'construct_tool') return this.constructTool(input);
    if (toolName === 'list_available_tools') return this.listAvailableTools(input);

    throw new Error(`Unknown meta tool: ${toolName}`);
  }

  private parseMetaConfig(annotations?: Annotation[]): MetaConfig {
    const metaAnnotation = annotations?.find(a => a.name === 'meta');

    if (!metaAnnotation) {
      // Default: full access for backward compatibility
      return {
        capabilities: ['*'],
        approval: 'auto',
        mutable: ['*'],
        frozen: []
      };
    }

    const attrs = metaAnnotation.attributes || {};

    return {
      capabilities: attrs.capabilities || ['query', 'propose'],
      approval: attrs.approval || 'prompt',
      mutable: attrs.mutable || [],
      frozen: attrs.frozen || []
    };
  }

  private handleUpdate(dsl: string, json: MachineJSON): void {
    this._machineData = json;

    // Reinitialize query engine with new data
    this.queryEngine = new QueryEngine(json);

    // Notify external listeners
    if (this.onMachineUpdate) {
      this.onMachineUpdate(dsl, json);
    }
  }

  // ... existing methods for backward compatibility
}
```

---

## UX/DX Affordances

### CLI Enhancements

#### Interactive Proposal Review

```bash
# During execution, when approval mode is 'prompt'
$ dygram execute machine.dy

[execution] Entering node: evolve
[agent] Agent proposes adding node:
  ┌────────────────────────────────────────┐
  │ Proposal: add_node                     │
  │ ID: prop_abc123                        │
  ├────────────────────────────────────────┤
  │ task handle_error {                    │
  │   prompt: "Handle validation errors"   │
  │ }                                      │
  │ validate -> handle_error               │
  ├────────────────────────────────────────┤
  │ Rationale: Add error handling for      │
  │ failed validation                      │
  └────────────────────────────────────────┘

  [A]pprove  [R]eject  [P]review diff  [S]kip for now > _
```

#### Batch Review Mode

```bash
# After execution with approval mode 'batch'
$ dygram exec proposals <execution-id>

Pending proposals for execution exec_xyz789:
┌────┬─────────────┬──────────────────────────────────┬─────────┐
│ #  │ Type        │ Summary                          │ Status  │
├────┼─────────────┼──────────────────────────────────┼─────────┤
│ 1  │ add_node    │ Add handle_error after validate  │ pending │
│ 2  │ modify_node │ Update process prompt            │ pending │
│ 3  │ add_edge    │ Link error_handler to retry      │ pending │
└────┴─────────────┴──────────────────────────────────┴─────────┘

Commands:
  dygram exec approve <execution-id> --all
  dygram exec approve <execution-id> --ids 1,3
  dygram exec reject <execution-id> --ids 2
  dygram exec preview <execution-id> --id 1
```

#### Scope Visualization

```bash
$ dygram show-scopes machine.dy

Machine: "Evolvable System"
Capabilities: query, propose, mutate

Mutable zones (agent CAN modify):
  ├── Extensions.*
  ├── tools
  └── Experiments.*

Frozen zones (agent CANNOT modify):
  ├── CoreWorkflow.*
  ├── Security.*
  └── Production.*

Nodes by scope:
  CoreWorkflow.validate    [frozen]
  CoreWorkflow.process     [frozen]
  Extensions.helper        [mutable]
  tools.calculator         [mutable]
```

### Playground UI Enhancements

#### Proposal Panel

```typescript
// New component: ProposalPanel.tsx
interface ProposalPanelProps {
  proposals: Proposal[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPreview: (id: string) => void;
}

const ProposalPanel: React.FC<ProposalPanelProps> = ({ proposals, ... }) => {
  return (
    <Panel title="Pending Proposals" icon={<GitPullRequestIcon />}>
      {proposals.map(p => (
        <ProposalCard key={p.id}>
          <ProposalHeader>
            <Badge type={p.type}>{p.type}</Badge>
            <Timestamp>{p.created_at}</Timestamp>
          </ProposalHeader>

          <ProposalPreview>
            <CodeBlock language="dygram">
              {p.preview.dsl_snippet}
            </CodeBlock>
          </ProposalPreview>

          <ProposalRationale>
            {p.rationale}
          </ProposalRationale>

          <ProposalActions>
            <Button onClick={() => onApprove(p.id)} variant="success">
              Approve
            </Button>
            <Button onClick={() => onReject(p.id)} variant="danger">
              Reject
            </Button>
            <Button onClick={() => onPreview(p.id)} variant="secondary">
              Full Diff
            </Button>
          </ProposalActions>
        </ProposalCard>
      ))}
    </Panel>
  );
};
```

#### Scope Overlay on Diagram

```typescript
// In diagram visualization, show scope zones
interface DiagramOverlayProps {
  machineData: MachineJSON;
  scopeConfig: MetaConfig;
}

const DiagramOverlay: React.FC<DiagramOverlayProps> = ({ machineData, scopeConfig }) => {
  // Render colored zones:
  // - Green: @mutable zones
  // - Red: @frozen zones
  // - Gray: unspecified (depends on default)

  return (
    <svg className="scope-overlay">
      {scopeConfig.mutable.map(zone => (
        <ZoneHighlight
          key={zone}
          pattern={zone}
          color="rgba(0, 255, 0, 0.1)"
          label="Mutable"
        />
      ))}
      {scopeConfig.frozen.map(zone => (
        <ZoneHighlight
          key={zone}
          pattern={zone}
          color="rgba(255, 0, 0, 0.1)"
          label="Frozen"
        />
      ))}
    </svg>
  );
};
```

#### Agent Activity Log

```typescript
// Enhanced execution log showing query/proposal activity
interface ActivityLogEntry {
  timestamp: string;
  type: 'query' | 'propose' | 'mutate' | 'transition';
  tool: string;
  input: any;
  output: any;
  status: 'success' | 'rejected' | 'pending';
}

const ActivityLog: React.FC<{ entries: ActivityLogEntry[] }> = ({ entries }) => {
  return (
    <LogContainer>
      {entries.map((entry, i) => (
        <LogEntry key={i} type={entry.type}>
          <LogIcon type={entry.type} />
          <LogContent>
            <LogTool>{entry.tool}</LogTool>
            <LogSummary>{summarize(entry)}</LogSummary>
            {entry.status === 'pending' && (
              <PendingBadge>Awaiting approval</PendingBadge>
            )}
          </LogContent>
          <ExpandButton onClick={() => toggleDetails(i)} />
        </LogEntry>
      ))}
    </LogContainer>
  );
};
```

### Editor Integration

#### DSL Annotations for Scope

```dygram
// Syntax highlighting and editor support for scope annotations

machine "My System" @meta(
  capabilities: ["query", "propose"],  // IntelliSense for valid values
  approval: "prompt",
  mutable: ["Extensions.*"],           // Pattern validation
  frozen: ["Core.*"]
)

// Visual indicators in editor gutter:
// 🔒 for frozen nodes
// 🔓 for mutable nodes

Process Core @frozen {        // 🔒 shown in gutter
  task validate { ... }
}

Process Extensions @mutable { // 🔓 shown in gutter
  task helper { ... }
}
```

#### Inline Proposal Preview

When the agent proposes changes, the editor can show inline previews:

```typescript
// Editor decoration for proposed changes
interface ProposedChangeDecoration {
  range: Range;                    // Where in the document
  type: 'addition' | 'modification' | 'deletion';
  preview: string;                 // New content
  proposalId: string;
}

// Show as green highlight with hover preview
// User can accept/reject directly from editor
```

---

## Migration Path

### Phase 1: Additive (Non-Breaking)

Add new tools alongside existing ones:

```typescript
// In effect-builder.ts
function buildMetaTools(): ToolDefinition[] {
  return [
    // NEW: Query tools
    ...buildQueryTools(),

    // NEW: Proposal tools (if capability enabled)
    ...buildProposalTools(),

    // EXISTING: Legacy tools (always included for now)
    ...buildLegacyMetaTools()
  ];
}
```

### Phase 2: Capability-Gated

Make legacy tools require explicit capability:

```dygram
// To use old behavior, explicitly opt in:
machine "Legacy System" @meta(capabilities: ["*"])

// New machines default to safer capability set:
machine "New System" @meta(capabilities: ["query", "propose"])
```

### Phase 3: Deprecation

Mark legacy tools as deprecated in documentation:

```typescript
{
  name: 'get_machine_definition',
  description: '[DEPRECATED] Use query_* tools instead. Returns full machine definition.',
  // ...
}
```

### Phase 4: Removal (Major Version)

Remove legacy tools in next major version, provide migration guide.

---

## Testing Strategy

### Unit Tests

```typescript
// test/language/meta/query-engine.test.ts
describe('QueryEngine', () => {
  describe('queryNode', () => {
    it('returns node with edges when requested', () => { ... });
    it('supports pattern matching with wildcards', () => { ... });
    it('throws for non-existent nodes', () => { ... });
  });

  describe('queryNeighborhood', () => {
    it('respects depth parameter', () => { ... });
    it('handles direction filtering', () => { ... });
  });

  describe('queryPattern', () => {
    it('filters by type', () => { ... });
    it('filters by annotation', () => { ... });
    it('combines multiple filters', () => { ... });
  });
});

// test/language/meta/proposal-manager.test.ts
describe('ProposalManager', () => {
  describe('proposeAddNode', () => {
    it('creates pending proposal when approval is prompt', () => { ... });
    it('auto-applies when approval is auto', () => { ... });
    it('rejects proposals to frozen zones', () => { ... });
    it('generates correct DSL preview', () => { ... });
  });

  describe('commitProposal', () => {
    it('applies proposal and updates machine', () => { ... });
    it('adds to history for rollback', () => { ... });
  });

  describe('rollbackProposal', () => {
    it('restores previous state', () => { ... });
    it('fails for non-applied proposals', () => { ... });
  });
});

// test/language/meta/scope-enforcer.test.ts
describe('ScopeEnforcer', () => {
  it('allows queries to any zone', () => { ... });
  it('allows proposals to mutable zones', () => { ... });
  it('rejects proposals to frozen zones', () => { ... });
  it('requires explicit mutable for direct mutation', () => { ... });
  it('handles glob patterns correctly', () => { ... });
});
```

### Integration Tests

```typescript
// test/integration/meta-tools-incremental.test.ts
describe('Incremental Meta-Programming', () => {
  it('agent can query without modifying', async () => {
    const machine = loadMachine('test-machine.dy');
    const result = await execute(machine, {
      // Agent should use query tools
    });

    // Machine unchanged
    expect(result.finalMachine).toEqual(machine);
  });

  it('proposals are collected in batch mode', async () => {
    const machine = loadMachine('batch-mode-machine.dy');
    const result = await execute(machine);

    // Proposals created but not applied
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.proposals.every(p => p.status === 'pending')).toBe(true);
  });

  it('respects frozen zones', async () => {
    const machine = loadMachine('scoped-machine.dy');
    const result = await execute(machine, {
      // Agent tries to modify frozen zone
    });

    // Proposal rejected
    expect(result.proposals[0].status).toBe('rejected');
  });
});
```

### Snapshot Tests

```typescript
// test/integration/__snapshots__/meta_tools_query.json
{
  "query_node": {
    "input": { "name": "validate", "include": ["attributes", "edges"] },
    "output": {
      "node": { "name": "validate", "type": "Task", ... },
      "inbound_edges": [...],
      "outbound_edges": [...]
    }
  }
}
```

---

## Success Metrics

### For Machine Authors

| Metric | Current | Target |
|--------|---------|--------|
| Average change size | Full machine | < 5 nodes/edges |
| Rollback capability | None | 100% of changes |
| Review before apply | None | Configurable |
| Scope control | None | Fine-grained |

### For Agents

| Metric | Current | Target |
|--------|---------|--------|
| Context size for queries | Full machine | Focused subset |
| Operations requiring full machine | 100% | < 10% |
| Proposal rejection rate (scope) | N/A | > 90% for frozen zones |

### For System

| Metric | Current | Target |
|--------|---------|--------|
| Backward compatibility | N/A | 100% for capability: ["*"] |
| Tool count | 7 | ~20 (across tiers) |
| Test coverage | ~70% | > 90% |

---

## Related Documentation

- [Meta-Programming Runtime Behavior](./meta-programming-runtime-behavior.md)
- [Meta Tools and Machine Updates](./meta-tools-machine-updates.md)
- [Execution UI and Meta Tools Analysis](../research/execution-ui-and-meta-tools-analysis.md)

---

## Summary

This redesign transforms DyGram's meta-programming from an all-or-nothing approach to a graduated, incremental system:

1. **Query Tools** let agents understand the machine without risk
2. **Proposal Tools** create reviewable change requests
3. **Scoped Mutation Tools** allow direct changes within defined boundaries
4. **Capability Levels** give authors control over agent power
5. **Approval Modes** determine how proposals are handled
6. **History & Rollback** make changes reversible

The result is a system that serves both machine authors (who want controlled evolution) and agents (who need focused capabilities) without sacrificing power or flexibility.
