# Meta Annotation and Context Edge Fixes

**Date**: 2025-11-28  
**Status**: Implemented

## Problem Summary

Two critical issues were identified in the execution system:

1. **@meta Annotation Not Working**: The `@meta` annotation on machines/nodes wasn't being converted to `meta: true` attribute, preventing meta-tools from being available
2. **Context Edges Not Recognized**: Edges like `-writes->` and `-reads->` were being treated as control flow transitions instead of data flow edges for context access

## Root Cause Analysis

### Issue 1: @meta Annotation
The serializer captured `@meta` as an annotation but didn't interpret its semantic meaning to set `meta: true` in the attributes collection.

### Issue 2: Context Edge Semantics
The grammar parses `-writes->` as:
- Arrow type: `->` (single arrow)
- Label: `writes` (treated as edge label text)

But the runtime expected `edge.type === 'writes'` which never matched because:
- `edge.type` was `undefined` or `"->"` 
- `edge.label` was `"writes"`

## Solution Implemented

### 1. Serializer Changes (`src/language/json/serializer.ts`)

#### A. @meta Annotation Handling
Added logic to detect `@meta` annotation and convert to attribute:

```typescript
// For machines
if (machineAnnotations?.some(a => a.name === 'meta')) {
    const hasMetaAttr = machineAttributes.some(a => a.name === 'meta');
    if (!hasMetaAttr) {
        machineAttributes = [...machineAttributes, { name: 'meta', value: true }];
    }
}

// For nodes
if (serializedAnnotations?.some(a => a.name === 'meta')) {
    const hasMetaAttr = serializedAttributes.some(a => a.name === 'meta');
    if (!hasMetaAttr) {
        serializedAttributes = [...serializedAttributes, { name: 'meta', value: true }];
    }
}
```

#### B. Semantic Edge Type Detection
Added `detectSemanticEdgeType()` method to recognize semantic keywords in edge labels:

```typescript
private detectSemanticEdgeType(edgeValue: Record<string, unknown> | undefined, labels?: EdgeType[]): string | undefined {
    // Check edge value/attributes for semantic keywords
    if (edgeValue) {
        const text = edgeValue.text as string | undefined;
        if (text) {
            const lower = text.toLowerCase().trim();
            if (lower === 'writes' || lower === 'stores') return 'writes';
            if (lower === 'reads') return 'reads';
        }
    }
    
    // Check edge labels for semantic keywords
    if (labels && labels.length > 0) {
        for (const label of labels) {
            for (const attr of label.value) {
                if (!attr.name && (attr as any).text) {
                    const text = ((attr as any).text as string).toLowerCase().trim();
                    if (text === 'writes' || text === 'stores') return 'writes';
                    if (text === 'reads') return 'reads';
                }
            }
        }
    }
    
    return undefined;
}
```

Applied in edge serialization:
```typescript
// Detect semantic edge type from label/attributes
const semanticType = this.detectSemanticEdgeType(edgeValue, segment.label);
if (semanticType) {
    record.type = semanticType;
}
```

### 2. Effect Builder Changes (`src/language/execution/effect-builder.ts`)

Updated `buildContextTools()` to check multiple fields for semantic types:

```typescript
// Check for read permission
const hasReadEdge = machineJSON.edges.some(e => {
    // Direct edge from context to task
    if (e.source === contextNode.name && e.target === nodeName) {
        return true;
    }
    
    // Edge from task to context with semantic type
    if (e.source === nodeName && e.target === contextNode.name) {
        // Check edge.type field (set by serializer for semantic edges)
        if (e.type === 'reads') return true;
        
        // Check edge label/text for 'reads' keyword
        const label = e.label || e.value?.text || e.attributes?.text;
        if (label && typeof label === 'string' && label.toLowerCase().trim() === 'reads') {
            return true;
        }
    }
    
    return false;
});

// Similar logic for write edges checking for 'writes' or 'stores'
```

### 3. Transition Evaluator Changes (`src/language/execution/transition-evaluator.ts`)

Added `isDataEdge()` function to filter out context/data edges from transitions:

```typescript
function isDataEdge(edge: AnnotatedEdge, machineJSON: MachineJSON): boolean {
    // Check if edge has semantic type indicating data flow
    if (edge.type === 'writes' || edge.type === 'reads' || edge.type === 'stores') {
        return true;
    }
    
    // Check if target is a context node
    const targetNode = machineJSON.nodes.find(n => n.name === edge.target);
    if (targetNode && targetNode.type?.toLowerCase() === 'context') {
        return true;
    }
    
    // Check edge label/text for data flow keywords
    const label = edge.label || (edge as any).value?.text || (edge as any).attributes?.text;
    if (label && typeof label === 'string') {
        const lower = label.toLowerCase().trim();
        if (lower === 'writes' || lower === 'reads' || lower === 'stores') {
            return true;
        }
    }
    
    return false;
}
```

Applied in `getNonAutomatedTransitions()`:
```typescript
return outboundEdges
    .filter(edge => {
        // Skip @auto edges
        if (edge.hasAutoAnnotation) return false;

        // Skip data/context edges (not control flow transitions)
        if (isDataEdge(edge, machineJSON)) return false;

        // Skip edges with simple deterministic conditions
        if (edge.condition && isSimpleCondition(edge.condition) && evaluateCondition(edge.condition, machineJSON, state, pathId)) {
            return false;
        }

        return true;
    })
```

## Test Case

Created `test-meta-context-fix.dy` to verify the fixes:

```dy
machine "Dynamic Tool Builder" {
  logLevel: "debug"
  maxSteps: 20
  meta: true  // Should enable meta-tools
}

context Requirements {
  needsCustomTool: false
  toolName: ""
  toolPurpose: ""
}

start "Assess capabilities" {
  prompt: "Use list_available_tools meta-tool..."
}

task buildTool "Construct fibonacci tool if needed" {
  prompt: "If Requirements.needsCustomTool is true..."
}

task useTool "Use the fibonacci tool" {
  prompt: "Use the fibonacci tool..."
}

end "Tool construction demo complete"

start,buildTool -writes-> Requirements  // Should create context write tools

start -> buildTool -> useTool -> end
```

## Expected Behavior After Fixes

1. **@meta annotation**: Machine has `meta: true` attribute, enabling meta-tools like `list_available_tools`, `construct_tool`, etc.

2. **Context edges**: 
   - `-writes->` edges to context nodes are recognized as data flow
   - Context write tools (`write_Requirements`) are generated for nodes with write edges
   - These edges are NOT treated as control flow transitions

3. **Separation of concerns**:
   - Control flow: `start -> buildTool -> useTool -> end`
   - Data flow: `start,buildTool -writes-> Requirements`

## Files Modified

1. `src/language/json/serializer.ts` - Added @meta handling and semantic edge type detection
2. `src/language/execution/effect-builder.ts` - Updated context tool generation to check multiple fields
3. `src/language/execution/transition-evaluator.ts` - Added data edge filtering from transitions

## Backward Compatibility

All changes are backward compatible:
- Existing machines without `@meta` continue to work
- Existing context edges with explicit `type` field continue to work
- New semantic detection is additive, checking multiple fields

## Future Improvements

1. Consider adding dedicated grammar terminals for semantic arrows:
   ```
   terminal WRITES_ARROW: '-writes->';
   terminal READS_ARROW: '-reads->';
   ```

2. Add validation warnings when context edges are used without proper semantic types

3. Consider making context access implicit (all tasks can access all contexts by default) with explicit restrictions via annotations
