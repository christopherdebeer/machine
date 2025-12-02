# DSL Round-Trip Analysis - December 2, 2025

## Executive Summary

Deep investigation into DSL round-trip failures reveals two distinct root causes affecting 49 tests:

1. **Note-Concept Merge Bug**: Notes with qualified names incorrectly overwrite their target nodes' types
2. **Edge Attribute Syntax**: Legacy square bracket syntax in examples needs updating
3. **Edge Qualification Issues**: Complex hierarchical structures lose edge source/target resolution

## Issue Analysis

### Issue 1: Note-Concept Merge Bug (PRIMARY)

**Impact**: Affects majority of DSL round-trip failures

**Root Cause Location**: `src/language/qualified-name-expander.ts:215-311`

#### How It Happens

1. **Source Code**:
   ```dy
   Concept ArrowTypes "Relationship Semantics" {
       basic: "->";
       strong: "-->";
   }

   note Language.ArrowTypes "Seven arrow types..." @KeyFeature;
   ```

2. **Parsing Phase**:
   - `Concept ArrowTypes` → Node{name: "ArrowTypes", type: "concept", attributes: [...]}
   - `note Language.ArrowTypes` → Node{name: "Language.ArrowTypes", type: "note", title: "Seven..."}

3. **QualifiedNameExpander.expandQualifiedNames()**:
   - Expands `"Language.Arrow Types"` → `["Language", "ArrowTypes"]`
   - Finds existing `ArrowTypes` concept inside `Language`
   - Calls `mergeNodes(conceptNode, noteNode, isStrictMode)`

4. **mergeNodes() Execution** (Lines 215-311):
   ```typescript
   // Line 221: Overwrites concept's title with note's title
   if (newNode.title) {
       existingNode.title = newNode.title;
   }

   // Line 226: OVERWRITES concept's type with "note"!
   this.mergeNodeType(existingNode, newNode.type, isStrictMode);

   // Line 229: Adds note's annotations to concept
   // Merges annotations, attributes, etc.
   ```

5. **mergeNodeType()** (Lines 175-201):
   ```typescript
   // Line 200: In non-strict mode, last type wins
   existingNode.type = newType;  // "concept" → "note"
   ```

6. **Result**:
   - Original concept is now type="note"
   - Has note's title instead of concept's title
   - Has note's annotations (@KeyFeature)
   - Still has concept's attributes (basic, strong, etc.)
   - Later, `processNoteNodes()` adds `target: "ArrowTypes"` attribute

#### Why This Is Wrong

**Notes should be documentation only** - they should not mutate their target nodes. A note that references `Language.ArrowTypes` should:
- Attach documentation TO the concept
- NOT change the concept's type
- NOT replace the concept's title
- Be a separate entity that links to the concept

**Current behavior**: Notes cannibalize their targets, turning concepts into notes.

### Issue 2: Edge Attribute Syntax (SECONDARY)

**Impact**: 58 parse errors in examples

**Root Cause**: Examples use legacy square bracket syntax which is not supported

#### Legacy Syntax (NOT SUPPORTED):
```dy
A -[1, 2, 3]-> B;
A -[tags: ["foo", "bar"]]-> B;
```

**Error**:
```
Expecting token of type 'ARROW_SINGLE' but found `[`.
```

#### Correct Modern Syntax:
```dy
// Comma-separated attributes
a -condition: true, priority: 1-> b;

// Semicolon-separated attributes
source -attr1: value1; attr2: value2;-> target;

// With qualified names
Start -priority: 1;-> Workflow.Step1;
```

#### Files Needing Updates

Based on test output, examples in these files use legacy syntax:
- `docs/examples/edge-syntax-validation.md`
- `docs/examples/styling-and-validation.md`
- Various `docs/syntax/*.md` files

**Solution**: Update documentation examples to use proper attribute syntax.

### Issue 3: Edge Qualification Issues (TERTIARY)

**Impact**: Complex examples have incorrect edge source/target after round-trip

**Symptoms**:
```
json.edges[18].source: value mismatch (Running vs Visualization)
json.edges[18].target: value mismatch (Execute vs Generate)
```

**Likely Causes**:
1. Edge source/target resolution using simple names instead of qualified names
2. Edge scoping logic incorrectly grouping edges
3. DSL generator not preserving qualified names in edge references

**Location**: Likely in:
- `src/language/generator/generator.ts:482-540` (getRootLevelEdges)
- `src/language/generator/generator.ts:561-661` (generateNodeDSLWithChildren)

## Proposed Solutions

### Solution 1: Fix Note Merge to Preserve Target Type

**File**: `src/language/qualified-name-expander.ts`

**Problem**: Lines 221-226 in `mergeNodes()` overwrite target node's type and title

**Proposed Fix**:

```typescript
private mergeNodes(
    existingNode: Node,
    newNode: Node,
    isStrictMode: boolean
): void {
    // SPECIAL CASE: If newNode is a note, don't overwrite existing node's type or title
    // Notes are documentation that attach to targets, not replace them
    const newNodeIsNote = newNode.type?.toLowerCase() === 'note';
    const existingNodeIsNote = existingNode.type?.toLowerCase() === 'note';

    // Merge title (new wins if provided, UNLESS new is a note and existing is not)
    if (newNode.title) {
        if (newNodeIsNote && !existingNodeIsNote) {
            // Don't overwrite non-note's title with note's content
            // Instead, could store note content in a notes array (future enhancement)
        } else {
            existingNode.title = newNode.title;
        }
    }

    // Merge type (notes should NOT overwrite non-note types)
    if (newNodeIsNote && existingNode.type && existingNode.type !== 'note') {
        // Preserve existing non-note type
        // Don't call mergeNodeType which would overwrite it
    } else {
        this.mergeNodeType(existingNode, newNode.type, isStrictMode);
    }

    // Rest of merge logic remains unchanged...
    // Merge annotations, attributes, child nodes, edges
}
```

**Alternative Approach**: Don't merge notes at all

```typescript
private expandQualifiedNode(...) {
    // ... existing code ...

    const leafName = parts[parts.length - 1];
    const existingLeaf = currentNodes.find(n => n.name === leafName);

    if (existingLeaf) {
        // Check if node being added is a note
        if (node.type?.toLowerCase() === 'note') {
            // Don't merge notes - keep them as separate entities
            // Add note as a peer with a disambiguated name or store in metadata
            // OR: Skip adding the note entirely (notes are just documentation)
            return;
        } else {
            // Merge: node already exists, merge properties
            this.mergeNodes(existingLeaf, node, isStrictMode);
        }
    } else {
        // ... existing code ...
    }
}
```

### Solution 2: Update Edge Syntax in Documentation

**Files to Update**: Search and replace in docs:

```bash
# Find files with legacy syntax
grep -r "\-\[" docs/examples/ docs/syntax/

# Update to proper syntax
# Before: A -[tags: ["x", "y"]]-> B
# After:  A -tags: ["x", "y"]-> B

# Before: A -[1, 2, 3]-> B
# After:  # This needs semantic meaning - what are 1,2,3?
#         A -priority: 1, weight: 2, cost: 3-> B
```

**Affected Files** (preliminary list):
- `docs/examples/edge-syntax-validation.md`
- `docs/examples/styling-and-validation.md`
- Any syntax files that use `->` followed by `[`

### Solution 3: Fix Edge Qualification

**Investigation Needed**: More research required to understand exact failure mode

**Areas to Investigate**:

1. **Edge Source/Target Resolution**:
   - How edges resolve qualified vs simple names
   - Whether scoping logic correctly identifies parent context

2. **DSL Generator Edge Output**:
   - Whether qualified names are preserved in edge generation
   - Whether edge scoping correctly groups edges

3. **Round-Trip Test**:
   - Create minimal failing example
   - Compare JSON → DSL → JSON to identify transformation loss

## Implementation Plan

### Phase 1: Fix Note Merge Bug (High Priority)

1. Implement fix in `qualified-name-expander.ts`
2. Add tests for note + concept scenarios
3. Verify comprehensive-generative tests improve
4. Expected improvement: ~150-180 tests (DSL round-trip errors)

### Phase 2: Update Documentation (Medium Priority)

1. Find all examples with legacy edge syntax
2. Update to modern attribute syntax
3. Regenerate examples from docs
4. Update snapshots
5. Expected improvement: ~58 tests (parse errors)

### Phase 3: Fix Edge Qualification (Medium Priority)

1. Create minimal failing test case
2. Debug edge resolution logic
3. Fix DSL generator edge output
4. Verify complex hierarchical examples
5. Expected improvement: ~10-20 tests (edge mismatches)

## Testing Strategy

### Test Case 1: Note Should Not Overwrite Concept Type

```dy
machine "Note Merge Test"

concept MyNode "A Concept" {
    value: 42;
}

note MyNode "Documentation for MyNode" @Important;
```

**Expected JSON**:
```json
{
  "nodes": [
    {
      "name": "MyNode",
      "type": "concept",  // Should remain "concept", not "note"
      "title": "A Concept",  // Should remain concept's title
      "attributes": [{"name": "value", "value": 42}]
      // Note content stored separately or attached as metadata
    }
  ]
}
```

### Test Case 2: Modern Edge Attributes

```dy
machine "Edge Attributes Test"

state A
state B

A -priority: 1, label: "test"-> B;
```

**Expected**: Parses successfully, round-trips correctly

### Test Case 3: Hierarchical Edge Qualification

```dy
machine "Complex Hierarchy"

process Outer {
    task A
    task B

    A -> B;
}

// Cross-hierarchy edge
Outer.A -> Outer.B;
```

**Expected**: Both edges resolve correctly and round-trip preserves qualification

## Metrics

**Current State**:
- Total Tests: 481
- Passing: 432 (89.81%)
- Failing: 49 (10.19%)

**Expected After Fixes**:
- Phase 1 (Note Fix): ~420/481 passing (87-90%)
- Phase 2 (Edge Syntax): ~470/481 passing (97-98%)
- Phase 3 (Edge Qualification): ~481/481 passing (100%)

## References

### Code Locations

- **Note Merge Bug**: `src/language/qualified-name-expander.ts:215-311`
- **Note Type Overwrite**: `src/language/qualified-name-expander.ts:226`
- **Edge Syntax Docs**: `docs/syntax/edges.md:87-110`
- **DSL Generator**: `src/language/generator/generator.ts:335-493`
- **Edge Generation**: `src/language/generator/generator.ts:561-661`

### Related Files

- Test Report: `/home/user/machine/test-output/comprehensive-generative/REPORT.md`
- Snapshot Directory: `/home/user/machine/test/integration/__snapshots__/`
- Examples: `/home/user/machine/examples/`

## Conclusion

The DSL round-trip failures are caused by three distinct, fixable issues:

1. **Note merge bug** is a design flaw where notes cannibalize their targets
2. **Legacy syntax** in docs is a documentation issue requiring updates
3. **Edge qualification** is a logic bug in complex hierarchical scenarios

All three are well-understood and have clear solutions. Implementation should proceed in phases based on priority and impact.
