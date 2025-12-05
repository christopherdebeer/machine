# Arrow Semantics Integration Architecture

## Overview

This document describes how DyGram's arrow syntax integrates with edge attributes, labels, conditional styling, and inference mechanisms to provide a rich, expressive edge semantic system that maintains backward compatibility while enabling progressive enhancement.

## Current Edge Syntax Architecture

### Edge Syntax Components

```
source --label--> target { attributes }
       ↑  ↑    ↑
       │  │    └─ Arrow type (endType)
       │  └────── Label (EdgeType: annotations + attributes)
       └───────── Shaft/label start
```

**Components:**
- **Arrow shaft**: `-` (single dash), `--` (double dash), `=` (fat arrow)
- **Label section**: Between shaft start and arrow head (e.g., `--reads-->`)
- **Arrow head**: `>`, `<>`, `|--`, `*`, `o`, etc.
- **Attributes block**: `{ key: value }` after target node(s)

### Label Positioning in GraphViz

Labels are positioned **on the edge line** using GraphViz attributes:
- `label=<...>` - Main edge label (centered on line)
- `taillabel="..."` - Source multiplicity (near source node)
- `headlabel="..."` - Target multiplicity (near target node)

### Current Arrow Type Mappings

From `src/language/diagram/graphviz-dot-diagram.ts`:

| Arrow Syntax | Semantic Type | GraphViz Styling | Visual Appearance |
|--------------|---------------|------------------|-------------------|
| `->` | control | `arrowhead=normal` | Solid black arrow |
| `-->` | data | `style=dashed` | Dashed line |
| `=>` | transform | `penwidth=3, color="#D32F2F"` | Thick red arrow |
| `<-->` | data.bidirectional | `dir=both` | Arrows on both ends |
| `<\|--` | dependency.inherit | `arrowhead=empty, dir=back` | Hollow arrow pointing back |
| `*-->` | data.compose | `arrowhead=diamond` | Filled diamond |
| `o-->` | data.aggregate | `arrowhead=odiamond` | Open diamond |

## Semantic Inference Hierarchy

The system uses a **priority-based inference hierarchy** to determine edge semantic types:

```
1. Explicit arrow syntax (highest priority)
   └─> `=>` always means transform
   
2. Edge annotations
   └─> `@transform`, `@data`, `@control`
   
3. Label keywords (current behavior)
   └─> "reads", "writes", "catch"
   
4. Edge attributes
   └─> `type: "transform"`, `semantic: "data"`
   
5. Inferred from context (lowest priority)
   └─> Source/target node types
```

### Priority 1: Explicit Arrow Syntax

**No inference needed** - arrow syntax directly maps to semantic type:

```dygram
A -> B     // control (explicit)
A --> B    // data (explicit)
A => B     // transform (explicit)
A <|-- B   // dependency.inherit (explicit)
```

### Priority 2: Annotation-Based Inference

Annotations can **override** arrow syntax:

```dygram
A --> B @transform    // Override: transform (annotation wins)
A -> B @data          // Override: data (annotation wins)
A => B @async         // Modifier: async transform (annotation refines)
```

### Priority 3: Label-Based Inference

Keywords in labels infer semantic types (current behavior):

```dygram
A --reads--> B    // Infer: data (from "reads" keyword)
A --writes--> B   // Infer: data (from "writes" keyword)
A --catch--> B    // Infer: control.error (from "catch" keyword)
```

**Keyword Mapping:**
- `reads`, `writes`, `fetches`, `loads`, `saves` → `data`
- `transforms`, `maps`, `filters`, `reduces` → `transform`
- `calls`, `invokes`, `triggers`, `executes` → `control`
- `catch`, `error`, `fallback` → `control.error`
- `extends`, `implements`, `inherits` → `dependency`

### Priority 4: Attribute-Based Inference

Attributes can override arrow syntax:

```dygram
A --> B { type: "transform" }  // Override: transform
A -> B { semantic: "data" }    // Override: data
```

### Priority 5: Context-Based Inference

Weakest inference based on source/target node types:

```dygram
context Input --> task Process    // Infer: data (context → task)
task Process -> task Validate     // Infer: control (task → task)
task Transform => context Output  // Explicit: transform (=> syntax)
```

**Node Type Patterns:**
- `context → *` → data
- `* → context` → data
- `task → task` → control
- `state → state` → control

## Integration with Existing Features

### Arrow Syntax + Labels (Complementary)

Arrow syntax provides **semantic type**, label provides **human-readable description**:

```dygram
// Current behavior
A --reads--> B    // Label between shaft and head

// Enhanced behavior
A -->reads--> B   // Arrow type: data (explicit -->), label: "reads"
A =>transform=> B // Arrow type: transform (explicit =>), label: "transform"
```

### Arrow Syntax + Attributes (Layered)

Arrow syntax sets **base semantic type**, attributes provide **modifiers and metadata**:

```dygram
// Data flow with conditional activation
A --> B {
  condition: "errorCount > 0"
  priority: 5
  style: "dashed"
}

// Transform with modifiers
A => B {
  async: true
  timeout: 5000
}
```

### Arrow Syntax + Annotations (Semantic Refinement)

Arrow syntax sets **category**, annotations **refine behavior** within that category:

```dygram
A --> B @async              // Data flow, async modifier
A => B @filter("x > 10")    // Transform, with filter condition
A -> B @critical            // Control flow, critical path
```

### Conditional Styling Integration

**Current behavior preserved:**
- Edges with `condition` attribute get conditional styling
- Active/inactive visual indication based on evaluation

**Enhanced behavior:**
- Arrow semantics **layer on top** of conditional styling
- Example: Data flow edge (`-->`) that's conditionally inactive shows as dashed gray data arrow
- Example: Transform edge (`=>`) that's active shows as thick green transform arrow

**Visual Priority:**
```
Runtime state > Condition evaluation > Arrow semantics > Base style
```

## Visual Distinction Strategy

### Base Semantic Styles

```typescript
const semanticStyles = {
  control: {
    color: '#1976D2',      // Blue
    style: 'solid',
    penwidth: 1
  },
  data: {
    color: '#388E3C',      // Green
    style: 'dashed',
    penwidth: 1
  },
  transform: {
    color: '#7B1FA2',      // Purple
    style: 'solid',
    penwidth: 2
  },
  dependency: {
    color: '#757575',      // Gray
    style: 'dotted',
    penwidth: 1
  }
};
```

### Conditional Overlay Styles

```typescript
const conditionalOverlay = {
  active: {
    penwidth: '+1',        // Increase thickness
    color: 'saturate(+20%)'  // Brighten color
  },
  inactive: {
    color: '#9E9E9E',      // Gray out
    style: 'dashed'
  },
  error: {
    color: '#D32F2F',      // Red
    style: 'dashed'
  }
};
```

### Combined Visual Result

```
Base semantic style + Conditional overlay = Final visual
```

**Examples:**
- Data edge (active): Green dashed, thick
- Data edge (inactive): Gray dashed, thin
- Transform edge (active): Purple solid, very thick
- Control edge (error): Red solid, thin

## Handling Inferred Edges

**Current:** Inferred dependencies shown with dashed blue lines

**Enhanced:** Inferred edges get semantic types based on inference reason

```typescript
interface InferredDependency {
  source: string;
  target: string;
  reason: string;
  inferredType?: 'data' | 'control' | 'dependency';  // NEW
}
```

**Inference Examples:**

```dygram
// Attribute reference inference
A { x: "{{B.value}}" }  // Infers: A --data--> B

// Type dependency inference  
A { type: B }           // Infers: A --dependency--> B

// Parent-child inference
parent { child A }      // Infers: parent --control--> A
```

## Implementation Architecture

### Semantic Inference Engine

```typescript
class EdgeSemanticInferencer {
  inferSemanticType(edge: Edge): SemanticType {
    // Priority 1: Explicit arrow syntax
    if (edge.arrowType) {
      return this.mapArrowToSemantic(edge.arrowType);
    }
    
    // Priority 2: Annotations
    const semanticAnnotation = edge.annotations?.find(
      a => ['control', 'data', 'transform', 'dependency'].includes(a.name)
    );
    if (semanticAnnotation) {
      return semanticAnnotation.name as SemanticType;
    }
    
    // Priority 3: Label keywords
    const labelSemantic = this.inferFromLabel(edge.label);
    if (labelSemantic) {
      return labelSemantic;
    }
    
    // Priority 4: Attributes
    if (edge.attributes?.type || edge.attributes?.semantic) {
      return edge.attributes.type || edge.attributes.semantic;
    }
    
    // Priority 5: Context inference
    return this.inferFromContext(edge.source, edge.target);
  }
  
  private mapArrowToSemantic(arrowType: string): SemanticType {
    const mapping: Record<string, SemanticType> = {
      '->': 'control',
      '-->': 'data',
      '=>': 'transform',
      '<-->': 'data',
      '<|--': 'dependency',
      '*-->': 'data',
      'o-->': 'data'
    };
    return mapping[arrowType] || 'control';
  }
}
```

### Visual Style Composer

```typescript
class EdgeStyleComposer {
  composeStyle(
    semantic: SemanticType,
    condition?: EdgeEvaluationResult,
    runtime?: RuntimeEdgeState
  ): GraphvizStyle {
    // Start with semantic base
    let style = this.getSemanticStyle(semantic);
    
    // Layer conditional styling
    if (condition) {
      style = this.applyConditionalOverlay(style, condition);
    }
    
    // Layer runtime styling (highest priority)
    if (runtime) {
      style = this.applyRuntimeOverlay(style, runtime);
    }
    
    return style;
  }
  
  private getSemanticStyle(semantic: SemanticType): GraphvizStyle {
    // Return base style for semantic type
  }
  
  private applyConditionalOverlay(
    base: GraphvizStyle,
    condition: EdgeEvaluationResult
  ): GraphvizStyle {
    if (!condition.hasCondition) return base;
    
    if (condition.error) {
      return { ...base, color: '#D32F2F', style: 'dashed' };
    }
    
    if (condition.isActive) {
      return { ...base, penwidth: base.penwidth + 1 };
    } else {
      return { ...base, color: '#9E9E9E', style: 'dashed' };
    }
  }
  
  private applyRuntimeOverlay(
    base: GraphvizStyle,
    runtime: RuntimeEdgeState
  ): GraphvizStyle {
    // Runtime state takes highest priority
    if (runtime.isActive) {
      return { ...base, color: '#4CAF50', penwidth: 3 };
    }
    return base;
  }
}
```

### Serializer Integration

```typescript
// In serializeEdges()
const inferencer = new EdgeSemanticInferencer();
const semanticType = inferencer.inferSemanticType(edge);

edgeJson.type = semanticType;           // Semantic type for execution
edgeJson.arrowType = edge.endType;      // Preserve syntax for round-trip
edgeJson.inferredFrom = 'arrow-syntax'; // Track inference source
```

## Example Scenarios

### Scenario 1: Explicit Syntax with Conditional

```dygram
A => B { condition: "ready" }
```

**Result:**
- Semantic: `transform` (from `=>`)
- Visual base: Purple, thick
- If `ready=true`: Purple, very thick (active overlay)
- If `ready=false`: Gray, dashed (inactive overlay)

### Scenario 2: Inferred from Label with Annotation

```dygram
A --reads--> B @async
```

**Result:**
- Semantic: `data` (from "reads" keyword)
- Modifier: `async` (from annotation)
- Visual: Green, dashed (data flow)
- Execution: Non-blocking data transfer

### Scenario 3: Mixed Explicit and Inferred

```dygram
A -> B { type: "data" }
```

**Result:**
- Arrow syntax: `->` (control)
- Attribute override: `data`
- Final semantic: `data` (attribute wins)
- Visual: Green, dashed (data flow)
- Warning: "Arrow syntax (->) conflicts with type attribute (data)"

### Scenario 4: Runtime State Override

```dygram
A --> B { condition: "x > 10" }
```

**Static diagram:**
- Semantic: `data`
- Condition: evaluated with default context
- Visual: Green dashed (active) or gray dashed (inactive)

**Runtime diagram:**
- Semantic: `data`
- Runtime state: currently traversing
- Visual: Thick green (runtime active state overrides condition)

## Backward Compatibility

### Guaranteed Compatibility

1. **Existing arrow syntax continues to work**
   - All 7 current arrow types maintain their behavior
   - Visual styling unchanged for existing diagrams

2. **Label-based inference still functions**
   - Keywords like "reads", "writes" continue to infer types
   - No breaking changes to existing edge labels

3. **Conditional styling preserved**
   - Edges with conditions continue to show active/inactive states
   - EdgeEvaluator behavior unchanged

4. **Attribute blocks unchanged**
   - Edge attribute syntax remains the same
   - Existing attributes continue to work

### Enhanced Capabilities

1. **Arrow syntax now populates `type` field**
   - Serializer derives semantic type from arrow syntax
   - Runtime can use semantic types for execution logic

2. **Multiple inference sources can be combined**
   - Arrow + label + annotation work together
   - Priority hierarchy resolves conflicts

3. **Visual distinction reflects semantic meaning**
   - Color coding by semantic category
   - Style patterns indicate flow type

4. **Explicit syntax overrides inference**
   - Developers can be explicit when needed
   - Inference provides convenient defaults

## Migration Path

### Phase 1: Semantic Inference (Non-Breaking)
- Implement `EdgeSemanticInferencer`
- Update serializer to populate `type` from arrow syntax
- Add tests for inference hierarchy
- **No visual changes yet**

### Phase 2: Visual Enhancement (Opt-In)
- Implement `EdgeStyleComposer`
- Add semantic color coding (opt-in via machine attribute)
- Update GraphViz generator to use composed styles
- **Existing diagrams unchanged unless opted in**

### Phase 3: Extended Arrow Types (Additive)
- Add new arrow syntax to grammar
- Extend semantic mappings
- Document new arrow types
- **Existing syntax continues to work**

## Best Practices

### When to Use Explicit Arrow Syntax

✅ **Use explicit arrows when:**
- Semantic meaning is central to understanding
- Visual distinction aids comprehension
- Execution behavior depends on edge type
- Documenting architectural patterns

### When to Use Inference

✅ **Use inference when:**
- Semantic meaning is obvious from context
- Labels already convey the relationship
- Reducing visual clutter is important
- Rapid prototyping or sketching

### When to Use Attributes

✅ **Use attributes when:**
- Adding metadata or configuration
- Specifying conditional behavior
- Overriding inferred semantics
- Providing execution parameters

### When to Use Annotations

✅ **Use annotations when:**
- Refining semantic behavior
- Adding modifiers (async, critical, etc.)
- Applying styling overrides
- Documenting special cases

## Future Extensions

### Proposed Extended Arrow Types

**Control Flow Variants:**
- `->>` : control.priority (high-priority transitions)
- `-.->` : control.conditional (conditional/optional paths)
- `-x->` : control.error (error/exception paths)

**Data Flow Variants:**
- `-->>` : data.stream (streaming/continuous data)
- `--o` : data.optional (optional data dependency)
- `--*` : data.required (required data dependency)

**Transform Variants:**
- `=>>` : transform.async (async transformation)
- `=|>` : transform.filter (filtering transformation)

**Database/Entity Relationships:**
- `-<>-` : data.many_to_many
- `->-` : data.one_to_many
- `-o-` : data.one_to_one

See `docs/development/edge-sematics.md` for complete semantic mapping proposal.

## References

- **Grammar Definition**: `src/language/machine.langium`
- **GraphViz Generator**: `src/language/diagram/graphviz-dot-diagram.ts`
- **Edge Evaluator**: `src/language/diagram/edge-evaluator.ts`
- **Serializer**: `src/language/json/serializer.ts`
- **Edge Type Resolver**: `src/language/execution/edge-type-resolver.ts`
- **Semantic Proposal**: `docs/development/edge-sematics.md`
