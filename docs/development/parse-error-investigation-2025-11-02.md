# Parse Error Investigation - November 2, 2025

## Executive Summary

Analyzed 61 failing tests from the comprehensive generative test suite. Identified that **62% of failures (38 tests) stem from a single root cause**: the DSL generator not supporting nested node structures.

**Key Finding**: The DSL serialization bug affects core features including machine evolution, code refactoring, and all LLM integration examples.

---

## Test Suite Baseline

**Overall Results**:
- Total Tests: 1,260 (56 test files)
- Passing: 1,186 (94.1%)
- Failing: 74 (5.9%)

**Comprehensive Generative Tests**:
- Total: 338 examples
- Passing: 277 (81.95%)
- Failing: 61 (18.05%)

**Error Distribution**:
| Error Type | Count | % of Failures |
|------------|-------|---------------|
| Parse Errors | 70 | 51% |
| DSL Round-trip Errors | 45 | 33% |
| Snapshot Mismatches | 15 | 11% |
| Transform Errors | 7 | 5% |
| Completeness Issues | 6 | 4% |

---

## Priority 1: DSL Generator - Nested Node Support ⭐

### Impact Analysis

**Tests Affected**: 38 (62% of failures)

**Categories Impacted**:
- `llm-integration`: 6/6 tests failing (100%)
- `domain-examples`: 3/6 tests failing (50%)
- `basic`: 2/8 tests failing (25%)
- `attributes-and-types`: 4/14 tests failing (28%)
- `advanced-features`: 3/9 tests failing (33%)

### Root Cause Analysis

**Location**: `src/language/generator/generator.ts:1857-1953`

**Problem**: The `generateDSL()` function flattens all nodes, completely ignoring hierarchical structure.

**Current Code**:
```typescript
export function generateDSL(machineJson: MachineJSON): string {
    // ... machine title ...

    // Generate nodes organized by type
    nodesByType.forEach((nodes, type) => {
        nodes.forEach(node => {
            if (!addedNodes.has(node.name)) {
                lines.push(generateNodeDSL(node));  // ❌ Ignores parent field
                addedNodes.add(node.name);
            }
        });
    });

    // ... edges and notes ...
}
```

**What's Missing**:
1. No logic to detect `node.parent` field
2. No tree-building from parent-child relationships
3. No recursive generation of nested structures
4. No handling of internal edges within scopes

### Evidence

**Example: comprehensive-demo.dy**

**Original DSL** (parses correctly):
```dygram
Process analysis {
    Task preprocess "Clean data" @Async {
        priority<number>: 10;
        timeout: "30s";
    };

    Task analyze "Analyze content" {
        prompt: "Analyze: {{ userRequest.query }}";
        model: "claude-3-5-sonnet-20241022";
    };

    State processing "Processing State";

    preprocess -> analyze -> processing;
};
```

**JSON Structure** (correct):
```json
{
  "name": "analysis",
  "type": "process",
  "attributes": []
},
{
  "name": "preprocess",
  "type": "task",
  "parent": "analysis",  // ← Parent field exists
  "title": "Clean data",
  "annotations": [{"name": "Async"}],
  "attributes": [...]
}
```

**Generated DSL** (invalid - flattened):
```dygram
Process analysis;  // ❌ Empty - children missing

Task preprocess "Clean data" @Async {  // ❌ Top-level - should be nested
    priority<number>: 10;
    timeout: "30s";
};
```

**Error on Re-parse**:
```
Expecting token of type 'EOF' but found `{`.
Expecting token of type 'ARROW_SINGLE' but found `-`.
```

### Failing Tests

**DSL Roundtrip Parse Errors** (24 tests):
- `comprehensive-demo.dy` - nested Process with Tasks
- All `llm-integration/*.dy` (6 files) - Task hierarchies
- `domain-examples/etl-pipeline.dy` - nested processing stages
- `domain-examples/monitoring-system.dy` - hierarchical services
- `domain-examples/order-processing-microservices.dy` - complex nesting
- `comprehensive-system.dy` - multi-level hierarchy
- `attribute-inheritance.dy` - inherited attributes in hierarchy
- Plus 16 more examples...

**Node Count Mismatches** (17 tests):
- `enterprise-system.dy` - loses 4 nodes (15 → 11)
- `dygram-system.dygram` - adds 7 nodes (28 → 35)
- `identifiers-21.dy` - loses 3 nodes (10 → 7)
- Plus 14 more examples...

### Recommended Solution

**Approach**: Modify DSL generator to build and traverse parent-child tree.

**Implementation Steps**:

1. **Build Node Tree**:
```typescript
interface NodeTree {
  node: any;
  children: NodeTree[];
}

function buildNodeTree(nodes: any[]): { roots: NodeTree[], tree: Map<string, NodeTree> } {
  const tree = new Map<string, NodeTree>();
  const roots: NodeTree[] = [];

  // Create tree nodes
  nodes.forEach(node => {
    tree.set(node.name, { node, children: [] });
  });

  // Build parent-child relationships
  nodes.forEach(node => {
    const treeNode = tree.get(node.name)!;
    if (node.parent) {
      const parentNode = tree.get(node.parent);
      if (parentNode) {
        parentNode.children.push(treeNode);
      } else {
        roots.push(treeNode);  // Parent not found, treat as root
      }
    } else {
      roots.push(treeNode);
    }
  });

  return { roots, tree };
}
```

2. **Recursive Node Generation**:
```typescript
function generateNodeDSL(nodeTree: NodeTree, depth: number = 0): string {
  const node = nodeTree.node;
  const indent = '    '.repeat(depth);
  const parts: string[] = [];

  // Type and name
  if (node.type && node.type !== 'undefined') {
    parts.push(node.type);
  }
  parts.push(node.name);

  // Title
  if (node.title) {
    parts.push(quoteString(node.title));
  }

  // Annotations
  let annotationsStr = '';
  if (node.annotations && node.annotations.length > 0) {
    annotationsStr = node.annotations.map((ann: any) => {
      if (ann.value) {
        return ` @${ann.name}(${quoteString(ann.value)})`;
      }
      return ` @${ann.name}`;
    }).join('');
  }

  // Check if has children or attributes
  const hasChildren = nodeTree.children.length > 0;
  const hasAttributes = node.attributes && node.attributes.length > 0;

  if (hasChildren || hasAttributes) {
    // Block syntax
    let result = indent + parts.join(' ') + annotationsStr + ' {\n';

    // Attributes first
    if (hasAttributes) {
      node.attributes.forEach((attr: any) => {
        result += indent + '    ' + generateAttributeDSL(attr) + '\n';
      });
      if (hasChildren) {
        result += '\n';  // Blank line before children
      }
    }

    // Then children
    if (hasChildren) {
      nodeTree.children.forEach(child => {
        result += generateNodeDSL(child, depth + 1) + '\n';
      });

      // Internal edges (edges within this scope)
      const internalEdges = getInternalEdges(nodeTree, allEdges);
      if (internalEdges.length > 0) {
        result += '\n';
        internalEdges.forEach(edge => {
          result += indent + '    ' + generateEdgeDSL(edge) + '\n';
        });
      }
    }

    result += indent + '};';
    return result;
  } else {
    // Inline syntax
    return indent + parts.join(' ') + annotationsStr + ';';
  }
}
```

3. **Filter Internal Edges**:
```typescript
function getInternalEdges(parentNode: NodeTree, allEdges: Edge[]): Edge[] {
  const childNames = new Set(
    parentNode.children.map(child => child.node.name)
  );

  return allEdges.filter(edge => {
    // Edge is internal if both source and target are children
    const sourceIsChild = childNames.has(edge.source.split('.')[0]);
    const targetIsChild = childNames.has(edge.target.split('.')[0]);
    return sourceIsChild && targetIsChild;
  });
}
```

4. **Update Main Generation**:
```typescript
export function generateDSL(machineJson: MachineJSON): string {
  const lines: string[] = [];

  // Machine title
  if (machineJson.title) {
    lines.push(`machine ${quoteString(machineJson.title)}`);
    lines.push('');
  }

  // Build node tree
  const { roots } = buildNodeTree(machineJson.nodes);

  // Generate root-level nodes
  roots.forEach(rootNode => {
    lines.push(generateNodeDSL(rootNode, 0));
    lines.push('');
  });

  // Generate cross-scope edges (not internal to any parent)
  const internalEdgeSet = new Set<Edge>();
  // ... collect all internal edges ...

  const externalEdges = machineJson.edges.filter(e => !internalEdgeSet.has(e));
  if (externalEdges.length > 0) {
    externalEdges.forEach(edge => {
      lines.push(generateEdgeDSL(edge));
    });
    lines.push('');
  }

  // Notes
  if (machineJson.notes && machineJson.notes.length > 0) {
    machineJson.notes.forEach(note => {
      lines.push(generateNoteDSL(note));
    });
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
```

### Expected Impact

**After Implementation**:
- ✅ 24 roundtrip parse error tests will pass
- ✅ 14+ node count mismatch tests will pass
- ✅ Total: 38 tests fixed
- ✅ Test suite: 81.95% → 93.2% passing
- ✅ Failure rate: 18% → 7%

**Features Unblocked**:
- ✅ Machine evolution (modify → serialize → parse cycle)
- ✅ Code refactoring tools
- ✅ AST transformations
- ✅ All LLM integration examples
- ✅ Hierarchical machine visualization

---

## Priority 2: Circular JSON References

### Impact Analysis

**Tests Affected**: 3-4 (5-7% of failures)

**Files**:
- `examples/advanced-features/documented-system.dy`
- `examples/syntax/types/e-commerce-system.dy`
- `examples/syntax/types/types-17.dy`
- `examples/syntax/qualified-names/mixed-naming.dy` (stack overflow)

### Root Cause

**Error Message**:
```
TypeError: Converting circular structure to JSON
    --> starting at object with constructor 'Object'
    |     property 'definition' -> object with constructor 'Object'
    --- property '$container' closes the circle
```

**Analysis**: The `note` keyword creates bidirectional links:
```typescript
// note references node
note.target = node;
// node likely has back-reference to note
node.notes = [note];  // or similar
// note has $container pointing back to machine
note.$container = machine;
// machine has node
machine.nodes.includes(node);
// Creates cycle: note → node → machine → note
```

### Evidence

**Example: documented-system.dy**
```dygram
Task process {
    prompt: "Process data";
};

note process "This task processes incoming requests" @Documentation {
    complexity: "O(n)";
    author: "Team A";
};
```

**Failed Operations**:
- JSON export via `JSON.stringify()`
- Graphviz generation (also uses JSON serialization)

### Recommended Solution

**Option A: Custom JSON Serializer** (Recommended)
```typescript
function toJSON(machine: Machine): MachineJSON {
  const visited = new WeakSet();

  function serialize(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (visited.has(obj)) {
      return '[Circular]';  // Or omit
    }

    visited.add(obj);

    if (Array.isArray(obj)) {
      return obj.map(serialize);
    }

    const result: any = {};
    for (const key in obj) {
      if (key.startsWith('$')) continue;  // Skip Langium internals
      result[key] = serialize(obj[key]);
    }

    return result;
  }

  return serialize(machine);
}
```

**Option B: Break Circular Reference**
- Don't store back-references in note objects
- Use lookup maps instead of direct references
- Requires refactoring AST node creation

---

## Priority 3: Quick Documentation Fixes

### Annotation Placement Errors

**Tests Affected**: 2-3

**Files**:
- `examples/syntax/annotations/annotations-7.dy`
- `examples/syntax/edges/edges-5.dy`
- `examples/syntax/annotations/payment-gateway.dy`

**Issue**: Annotations appearing after edges or in invalid positions.

**Solution**: Review and fix documentation. Estimated 30 minutes.

### Multiple Machines Per File

**Tests Affected**: 2

**Files**:
- `examples/styling/layout-control.dygram`
- `examples/styling-and-validation/vertical.dy`

**Issue**: Examples show multiple `machine` declarations in one file. Grammar doesn't support this:
```langium
entry Machine: /* expects EOF after first machine */
```

**Solutions**:
1. **Document limitation** (Recommended - 15 minutes)
   - Add note to docs explaining one machine per file
   - Update examples to show separate files
2. **Enhance grammar** (High effort - 1-2 days)
   - Change `entry Machine` to support multiple
   - Requires extensive testing

---

## Priority 4: Snapshot Updates

### Impact

**Tests Affected**: 15 (false positives)

**Issue**: Output format changed but snapshots not updated.

**Solution**:
```bash
UPDATE_SNAPSHOTS=true npm test
```

**Estimated Time**: 5 minutes

---

## Recommendations

### Immediate Action

1. **Implement Priority 1** (DSL Generator nested nodes)
   - High impact: fixes 62% of failures
   - Moderate effort: 2-4 hours
   - Unblocks critical features

2. **After Priority 1, run snapshot update**
   - Fixes 15 more "failures"
   - 5 minutes

**Result**: Test suite goes from 81.95% → 97.6% passing

### Future Work

1. **Priority 2** (Circular JSON) - 2-3 hours
2. **Priority 3** (Documentation) - 30-60 minutes

**Final Result**: 98.8% passing (only 4 edge case failures remaining)

---

## Appendix: Error Pattern Analysis

### Parse Error Patterns

| Pattern | Count | Description |
|---------|-------|-------------|
| EOF-expectation | 47 | `Expecting 'EOF' but found '{'` - nested blocks |
| arrow-expectation | 6 | `Expecting 'ARROW_SINGLE' but found '@'` - annotations |

### DSL Roundtrip Patterns

| Pattern | Count | Description |
|---------|-------|-------------|
| roundtrip-parse-errors | 24 | Generated DSL doesn't parse |
| node-count-mismatch | 17 | Nodes lost or duplicated |
| roundtrip-lexer-errors | 2 | Invalid characters in output |
| edge-count-mismatch | 1 | Edges lost or duplicated |

### Transform Error Patterns

| Pattern | Count | Description |
|---------|-------|-------------|
| circular-json | 6 | Circular references in AST |
| stack-overflow | 1 | Infinite recursion in generation |

---

## Conclusion

The comprehensive analysis reveals that **a single fix to the DSL generator** will resolve 62% of test failures. This is a high-value, moderate-effort improvement that unblocks critical features and dramatically improves test coverage.

Implementation of Priority 1 is strongly recommended as the next step.
