# DyGram Edge Semantics and Machine JSON Serialization

## Problem Statement

DyGram defines semantic arrow syntaxes (`->` for control flow, `-->` for data flow, `=>` for transformations) to signal execution intent beyond visual styling.【F:docs/examples/runtime-execution.md†L49-L80】 The language grammar supports a rich set of arrow tokens including association (`->`), data (`-->`), fat arrows (`=>`), composition (`*-->`), aggregation (`o-->`), inheritance (`<|--`), and bidirectional arrows (`<-->`).【F:src/language/machine.langium†L7-L67】

However, during JSON generation, the serializer preserves only the literal arrow token as `arrowType` while deriving an optional `type` exclusively from label keywords like `reads`/`writes`.【F:src/language/json/types.ts†L36-L55】【F:src/language/json/serializer.ts†L430-L510】【F:src/language/json/serializer.ts†L884-L913】 The runtime resolves semantic edge behavior from the `type` field and ignores `arrowType`, meaning the intended control/data/transform semantics encoded in the DSL arrow syntax are not fed into execution.【F:src/language/execution/transition-manager.ts†L50-L62】【F:src/language/execution/edge-type-resolver.ts†L1-L146】

Graph rendering is currently the only consumer of `arrowType`, where it adjusts DOT arrow heads and styling.【F:src/language/diagram/graphviz-dot-diagram.ts†L2439-L2593】

## Current State Analysis

### DSL Parsing Surface

Each `EdgeSegment` in the parsed AST captures the arrow token text as `endType` without interpreting it semantically. During JSON serialization, the generator copies this `endType` directly into the `arrowType` field of each `MachineEdgeJSON` record (e.g., `"-->"`, `"<|--"`).【F:src/language/machine.langium†L7-L67】【F:src/language/json/serializer.ts†L430-L509】

### Semantic Typing Disconnect

The runtime exposes an `EdgeTypeResolver` that expects a semantic `type` on edges and maps arrow-like strings (`->`, `-->`, `=>`, `<-->`) or label hints into coarse semantic groups: `control`, `data`, `transform`, and `dependency`. These semantic groups drive execution behavior such as whether an edge transfers control, blocks execution, or carries data, plus how edges are prioritized and validated.【F:src/language/execution/edge-type-resolver.ts†L11-L222】

However, the serializer only populates the semantic `type` field when it can infer it from label text like `"reads"`, `"writes"`, or `"catch"`; the arrow token itself is never turned into a semantic type. As a result, downstream consumers receive `arrowType` (syntax) plus a mostly-empty `type` (semantics), forcing every consumer to re-interpret syntax themselves or rely on label heuristics.【F:src/language/json/serializer.ts†L430-L509】

### Current Gap Summary

* The canonical JSON shape exposes both `arrowType` and `type`, but serialization only populates the former with raw syntax (`->`, `-->`, `=>`, etc.).【F:src/language/json/types.ts†L36-L55】【F:src/language/json/serializer.ts†L430-L510】
* Semantic detection today is based on label text rather than the arrow operator, so the majority of edges are emitted without an execution-ready `type` even when the DSL encoded one syntactically.【F:src/language/json/serializer.ts†L884-L913】
* Execution utilities such as `EdgeTypeResolver` assume `type` already contains the semantic category and therefore default to `control` for edges that only carry `arrowType`. This means data-flow or transform arrows behave like control edges at runtime.【F:src/language/execution/transition-manager.ts†L50-L62】【F:src/language/execution/edge-type-resolver.ts†L1-L146】

## Impact Assessment

### Execution Behavior

Execution paths in `TransitionManager` call `EdgeTypeResolver.resolveEdgeType` against the `type` property; because `type` usually holds verbatim arrow syntax or nothing at all, the resolver's control/data/transform split is either incorrect or unreachable. We currently depend on label heuristics instead of DSL semantics.【F:src/language/execution/transition-manager.ts†L23-L49】【F:src/language/execution/edge-type-resolver.ts†L21-L55】

### Validation Fragility

Validation like inheritance checks in `MachineValidator` has to re-read the concrete arrow text from the CST (`<|--`) instead of a normalized semantic type, increasing fragility and duplicating effort.【F:src/language/machine-validator.ts†L487-L527】

### Visualization Divergence

Visualizers (e.g., GraphViz) style edges based on `arrowType` only, so presentation diverges from runtime semantics whenever consumers independently re-map syntax to meaning. This creates inconsistency between what developers see and how the system executes.

## Solution Architecture

### 1. Serialize Semantic Type from Arrow Syntax

Map `segment.endType` (`->`, `-->`, `=>`, `<-->`) to the existing semantic strings during JSON serialization while still emitting `arrowType` for diagram styling. This would let `TransitionManager` and `EdgeTypeResolver` honor DSL intent without changing runtime code paths.【F:src/language/json/serializer.ts†L430-L510】【F:src/language/execution/transition-manager.ts†L50-L62】【F:src/language/execution/edge-type-resolver.ts†L1-L146】

**Serializer as the canonical mapper:** `serializeEdges` already produces both `arrowType` and `type`; augment it to derive a semantic type from `endType` (and keep `arrowType` for round-tripping/visuals). This would populate the `type` field that `EdgeTypeResolver` and execution logic expect, eliminating repeated syntax parsing.【F:src/language/json/serializer.ts†L430-L509】【F:src/language/execution/edge-type-resolver.ts†L11-L147】

### 2. Align Semantic Buckets

Map DSL arrow tokens to the runtime's semantic groups:
- `->` → `control`
- `-->`, `<-->`, `o-->`, `*-->` → `data`
- `=>` → `transform`
- `<|--` → `dependency` (inheritance)

This brings edge execution, validation, and diagram styling into agreement without relying on labels.

### 3. Preserve Richer Semantics

Arrow variants (composition, aggregation, inheritance) could flow into a structured `type` namespace (e.g., `data.compose`, `data.aggregate`, `dependency.inherit`) that still collapse to the core execution categories used by `EdgeTypeResolver.getExecutionSemantics` while keeping higher-fidelity meaning for tooling.

### 4. Use Semantics to Influence Execution Mechanics

Once `type` is set, the current `EdgeTypeResolver` already knows that data edges should not transfer control and transform edges both transfer control and data, via `getExecutionSemantics`. Hooking the serialized semantic types into evaluation would enable features like:
- Running data edges for context propagation without advancing state
- Prioritizing transform edges differently from plain control edges using the existing sort/validation helpers【F:src/language/execution/edge-type-resolver.ts†L103-L147】

### 5. Execution Simplification

Once `type` holds canonical semantics, `EdgeTypeResolver.resolveEdgeType` can prioritize `type` and stop re-parsing syntax/labels, reducing ambiguity and making annotation processors, barrier handling, and priority sorting more predictable.【F:src/language/execution/transition-manager.ts†L23-L81】【F:src/language/execution/edge-type-resolver.ts†L21-L183】

### 6. Backwards-Compatible Rendering

Diagram generation can continue to read `arrowType` for visuals while optionally layering styles based on semantic `type` (e.g., dashed edges for data flow even when backward-compiled JSON omits the original arrow glyph).【F:src/language/diagram/graphviz-dot-diagram.ts†L2439-L2593】 This preserves visual fidelity while allowing JSON-first workflows to carry semantic meaning.

## Implementation Roadmap

### Phase 1: Serializer Enhancement
* Implement semantic mapping in the serializer to derive `type` from arrow tokens
* Add tests that assert `type` contains semantic meaning for each arrow token while `arrowType` preserves the literal DSL token
* Ensure backward compatibility by maintaining both fields

### Phase 2: Runtime Integration
* Update runtime consumers (execution, validators, visualizers) to prefer the semantic `type` when present
* Use `arrowType` solely for rendering or backward compatibility
* Verify that `TransitionManager` and `EdgeTypeResolver` correctly interpret the new semantic types

### Phase 3: Documentation and Migration
* Document the canonical arrow→semantic mapping so DSL authors and integrators understand execution effects without inspecting labels or implementation details
* Provide migration guidance for existing JSON consumers
* Update examples to demonstrate semantic arrow usage

### Expected Outcomes

Capturing the semantic meaning of arrows at serialization time would align the DSL, JSON contract, and runtime behavior, reducing the need for ad-hoc label parsing and enabling richer execution rules grounded in the DSL's intended flow types.


# GraphViz Arrow Type Analysis and Enhancement Proposal

## Current Implementation Analysis

I've examined the GraphViz DOT diagram generator (`src/language/diagram/graphviz-dot-diagram.ts`). Here's what I found:

### Current Arrow Type Mappings (Line 2439-2593 region)

The `getArrowStyle()` function currently maps 7 arrow types to GraphViz DOT attributes:

```typescript
'->':    ''                                              // Association: normal arrow
'-->':   'style="dashed"'                               // Dependency: dashed arrow
'=>':    'penwidth=3, color="#D32F2F"'                  // Critical path: thick red arrow
'<-->':  'dir=both, arrowhead=normal, arrowtail=normal' // Bidirectional: both arrows
'<|--':  'arrowhead=empty, dir=back'                    // Inheritance: empty arrow to parent
'*-->':  'arrowhead=diamond, arrowtail=diamond'         // Composition: filled diamond
'o-->':  'arrowhead=odiamond, arrowtail=none'           // Aggregation: open diamond
```

### GraphViz DOT Arrow Capabilities

GraphViz supports a rich set of arrow attributes:

**Arrow Heads/Tails:**
- `normal` - standard arrow
- `empty` - hollow arrow (inheritance)
- `diamond` - filled diamond (composition)
- `odiamond` - open diamond (aggregation)
- `dot` - small circle
- `odot` - open circle
- `box` - square
- `obox` - open square
- `crow` - crow's foot (database notation)
- `tee` - T-shaped (perpendicular line)
- `vee` - V-shaped
- `curve` - curved arrow
- `icurve` - inverted curve
- `inv` - inverted arrow
- `none` - no arrow

**Style Attributes:**
- `style`: solid, dashed, dotted, bold
- `penwidth`: line thickness (1-10+)
- `color`: any color value
- `dir`: forward, back, both, none
- `arrowsize`: scale factor for arrow heads

## Alignment with Semantic Types

Based on the edge semantics document, we need to map DSL arrow syntax to these semantic categories:

1. **Control Flow** (`->`)
2. **Data Flow** (`-->`, `<-->`, `o-->`, `*-->`)
3. **Transform** (`=>`)
4. **Dependency** (`<|--`)

## Proposed Enhanced Arrow Type System

### Tier 1: Core Semantic Types (Already Defined)
These map directly to execution semantics:

| DSL Syntax | Semantic Type | GraphViz Styling | Visual Distinction |
|------------|---------------|------------------|-------------------|
| `->` | control | `arrowhead=normal` | Solid black arrow |
| `-->` | data | `style=dashed` | Dashed line |
| `=>` | transform | `penwidth=3, color="#D32F2F"` | Thick red arrow |
| `<\|--` | dependency.inherit | `arrowhead=empty, dir=back` | Hollow arrow pointing back |

### Tier 2: Data Flow Variants (Collapse to `data` semantic)
These provide visual distinction while mapping to the same execution semantic:

| DSL Syntax | Semantic Type | GraphViz Styling | Visual Distinction |
|------------|---------------|------------------|-------------------|
| `<-->` | data.bidirectional | `dir=both, arrowhead=normal, arrowtail=normal` | Arrows on both ends |
| `*-->` | data.compose | `arrowhead=diamond` | Filled diamond (strong ownership) |
| `o-->` | data.aggregate | `arrowhead=odiamond` | Open diamond (weak ownership) |

### Tier 3: Extended Arrow Types (New Proposals)

**Control Flow Variants:**
| DSL Syntax | Semantic Type | GraphViz Styling | Use Case |
|------------|---------------|------------------|----------|
| `->>` | control.priority | `penwidth=2, color="#1976D2"` | High-priority transitions |
| `-.->` | control.conditional | `style=dotted` | Conditional/optional paths |
| `-x->` | control.error | `arrowhead=tee, color="#D32F2F"` | Error/exception paths |

**Data Flow Variants:**
| DSL Syntax | Semantic Type | GraphViz Styling | Use Case |
|------------|---------------|------------------|----------|
| `-->>` | data.stream | `style=dashed, penwidth=2` | Streaming/continuous data |
| `--o` | data.optional | `arrowhead=odot, style=dashed` | Optional data dependency |
| `--*` | data.required | `arrowhead=dot, style=dashed` | Required data dependency |

**Transform Variants:**
| DSL Syntax | Semantic Type | GraphViz Styling | Use Case |
|------------|---------------|------------------|----------|
| `=>>` | transform.async | `penwidth=3, color="#7B1FA2", style=dashed` | Async transformation |
| `\|>` | transform.filter | `arrowhead=vee, penwidth=2, color="#D32F2F"` | Filtering transformation |

**Dependency Variants:**
| DSL Syntax | Semantic Type | GraphViz Styling | Use Case |
|------------|---------------|------------------|----------|
| `<\|..` | dependency.interface | `arrowhead=empty, style=dotted, dir=back` | Interface implementation |
| `<\|-` | dependency.extends | `arrowhead=empty, dir=back` | Class extension |
| `<<--` | dependency.uses | `arrowhead=vee, style=dashed, dir=back` | Usage dependency |

### Tier 4: Specialized Notations

**Database/Entity Relationships:**
| DSL Syntax | Semantic Type | GraphViz Styling | Use Case |
|------------|---------------|------------------|----------|
| `-<>-` | data.many_to_many | `arrowhead=crow, arrowtail=crow, dir=both` | Many-to-many relationship |
| `->-` | data.one_to_many | `arrowhead=crow` | One-to-many relationship |
| `-o-` | data.one_to_one | `arrowhead=none, arrowtail=none, style=bold` | One-to-one relationship |

**Temporal/Sequence:**
| DSL Syntax | Semantic Type | GraphViz Styling | Use Case |
|------------|---------------|------------------|----------|
| `~>` | control.async | `style=dashed, arrowhead=curve` | Asynchronous call |
| `-->` | control.sync | `arrowhead=normal` | Synchronous call |
| `-->>` | control.return | `arrowhead=vee, dir=back` | Return/callback |

## Implementation Strategy

### Phase 1: Semantic Mapping Enhancement
1. Extend `getArrowStyle()` to return both visual styling AND semantic type
2. Create mapping table: `arrowType → { semantic: string, graphviz: string }`
3. Update serializer to populate `type` field based on arrow syntax

### Phase 2: Visual Distinction System
1. Define color palette for semantic categories:
   - Control: Blue tones (#1976D2)
   - Data: Green tones (#388E3C)
   - Transform: Purple/Red tones (#7B1FA2, #D32F2F)
   - Dependency: Gray tones (#757575)

2. Define style patterns:
   - Solid: primary/required
   - Dashed: secondary/optional
   - Dotted: conditional/interface
   - Bold: emphasized/critical

3. Define arrow head semantics:
   - `normal`: standard flow
   - `empty`: inheritance/interface
   - `diamond/odiamond`: composition/aggregation
   - `crow`: cardinality (database)
   - `tee`: blocking/error
   - `vee`: filtering/selection
   - `dot/odot`: required/optional

### Phase 3: Backward Compatibility
1. Maintain existing 7 arrow types with current behavior
2. New arrow types opt-in via grammar extension
3. Serializer defaults to `control` for unmapped arrows
4. Runtime continues to use semantic `type` field

## Recommended Next Steps

1. **Prioritize Core Extensions**: Start with control flow variants (`->>`, `-.->`, `-x->`) as they have clear execution implications

2. **Grammar Extension**: Update `machine.langium` to recognize new arrow tokens while maintaining backward compatibility

3. **Serializer Enhancement**: Implement arrow→semantic mapping in `serializeEdges()` function

4. **Documentation**: Create visual reference guide showing all arrow types with their semantic meanings and visual appearance

5. **Testing**: Add test cases for each arrow type covering:
   - Parsing correctness
   - Semantic type derivation
   - GraphViz rendering
   - Execution behavior

Would you like me to proceed with implementing any of these phases? I can start with:
- Extending the grammar to support new arrow types
- Creating the semantic mapping table
- Updating the serializer to derive semantic types from arrows
- Generating a visual reference document

# Integration Analysis: Arrow Semantics with Edge Attributes, Labels, and Conditional Styling

## Current Edge Syntax Architecture

Based on my analysis of the grammar and implementation, here's how the system currently works:

### 1. Edge Syntax Structure (from `machine.langium`)

```
source --label--> target { attributes }
       ↑  ↑    ↑
       │  │    └─ Arrow type (endType)
       │  └────── Label (EdgeType: annotations + attributes)
       └───────── Shaft/label start
```

**Key Components:**
- **Arrow shaft**: `-` or `=` (single/double dash, fat arrow)
- **Label section**: Between shaft start and arrow head (e.g., `--label-->`)
- **Arrow head**: `>`, `<>`, `|--`, etc.
- **Attributes block**: `{ key: value }` after target

### 2. Label Positioning in GraphViz

The current implementation places labels **on the edge line** using:
- `label=<...>` - Main edge label (centered on line)
- `taillabel="..."` - Source multiplicity (near source)
- `headlabel="..."` - Target multiplicity (near target)

### 3. Conditional Edge Styling (from `edge-evaluator.ts`)

The system already supports **conditional visual styling**:
- Edges with conditions are evaluated statically or at runtime
- Active edges: `style=solid, color="#4CAF50", penwidth=2` (green, thick)
- Inactive edges: `style=dashed, color="#9E9E9E", penwidth=1` (gray, thin)
- Error edges: `style=dashed, color="#D32F2F", penwidth=1` (red, thin)

## Proposed Integration Strategy

### Semantic Inference Hierarchy (Priority Order)

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

### Integration with Existing Features

#### A. Arrow Syntax + Labels (Complementary)

**Current:**
```
A --reads--> B    // Label between shaft and head
```

**Enhanced:**
```
A --reads--> B    // Arrow type: data (inferred from "reads")
A -->reads--> B   // Arrow type: data (explicit -->), label: "reads"
A =>transform=> B // Arrow type: transform (explicit =>), label: "transform"
```

**Rule:** Arrow syntax provides semantic type, label provides human-readable description.

#### B. Arrow Syntax + Attributes (Layered)

**Current:**
```
A --> B { 
  condition: "errorCount > 0"
}
```

**Enhanced:**
```
A --> B {           // Arrow: data flow
  condition: "..."  // Conditional activation
  priority: 5       // Execution priority
  style: "dashed"   // Visual override
}

A => B {            // Arrow: transform
  async: true       // Transform modifier
  timeout: 5000     // Transform attribute
}
```

**Rule:** Arrow syntax sets base semantic type, attributes provide modifiers and metadata.

#### C. Arrow Syntax + Annotations (Semantic Refinement)

**Current:**
```
A --> B @style("color: red")
```

**Enhanced:**
```
A --> B @async              // Data flow, async modifier
A => B @filter("x > 10")    // Transform, with filter condition
A -> B @critical            // Control flow, critical path
```

**Rule:** Arrow syntax sets category, annotations refine behavior within that category.

#### D. Conditional Styling Integration

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

### Inference Rules for Arrow Semantics

#### Rule 1: Explicit Arrow Syntax (No Inference Needed)
```
A -> B     // control (explicit)
A --> B    // data (explicit)
A => B     // transform (explicit)
A <|-- B   // dependency.inherit (explicit)
```

#### Rule 2: Label-Based Inference (Current Behavior)
```
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

#### Rule 3: Annotation-Based Inference
```
A --> B @transform    // Override: transform (annotation wins over arrow)
A -> B @data          // Override: data (annotation wins over arrow)
```

#### Rule 4: Attribute-Based Inference
```
A --> B { type: "transform" }  // Override: transform
A -> B { semantic: "data" }    // Override: data
```

#### Rule 5: Context-Based Inference (Weakest)
```
context Input --> task Process    // Infer: data (context → task)
task Process -> task Validate     // Infer: control (task → task)
task Transform => context Output  // Explicit: transform (=> syntax)
```

**Node Type Patterns:**
- `context → *` → data
- `* → context` → data
- `task → task` → control
- `state → state` → control

### Handling Inferred Edges

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
```
// Attribute reference inference
A { x: "{{B.value}}" }  // Infers: A --data--> B

// Type dependency inference  
A { type: B }           // Infers: A --dependency--> B

// Parent-child inference
parent { child A }      // Infers: parent --control--> A
```

### Visual Distinction Strategy

#### Base Arrow Styles (Semantic)
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

#### Conditional Overlay (Runtime/Static)
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

#### Combined Result
```
Base semantic style + Conditional overlay = Final visual
```

**Examples:**
- Data edge (active): Green dashed, thick
- Data edge (inactive): Gray dashed, thin
- Transform edge (active): Purple solid, very thick
- Control edge (error): Red solid, thin

### Implementation Plan

#### Phase 1: Semantic Inference Engine
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
}
```

#### Phase 2: Visual Style Composer
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
}
```

#### Phase 3: Serializer Integration
```typescript
// In serializeEdges()
const semanticType = inferencer.inferSemanticType(edge);
edgeJson.type = semanticType;           // Semantic type for execution
edgeJson.arrowType = edge.endType;      // Preserve syntax for round-trip
edgeJson.inferredFrom = 'arrow-syntax'; // Track inference source
```

### Backward Compatibility

**Guaranteed:**
1. Existing arrow syntax continues to work
2. Label-based inference still functions
3. Conditional styling preserved
4. Attribute blocks unchanged

**Enhanced:**
1. Arrow syntax now populates `type` field
2. Multiple inference sources can be combined
3. Visual distinction reflects semantic meaning
4. Explicit syntax overrides inference

### Example Scenarios

#### Scenario 1: Explicit Syntax with Conditional
```
A => B { condition: "ready" }

Result:
- Semantic: transform (from =>)
- Visual: Purple, thick (base)
- If ready=true: Purple, very thick (active overlay)
- If ready=false: Gray, dashed (inactive overlay)
```

#### Scenario 2: Inferred from Label with Annotation
```
A --reads--> B @async

Result:
- Semantic: data (from "reads" keyword)
- Modifier: async (from annotation)
- Visual: Green, dashed (data flow)
- Execution: Non-blocking data transfer
```

#### Scenario 3: Mixed Explicit and Inferred
```
A -> B { type: "data" }

Result:
- Arrow syntax: -> (control)
- Attribute override: data
- Final semantic: data (attribute wins)
- Visual: Green, dashed (data flow)
- Warning: "Arrow syntax (->) conflicts with type attribute (data)"
```

## Recommendation

**Adopt a layered approach:**
1. Arrow syntax provides **default semantics** (easy, visual)
2. Attributes/annotations provide **overrides** (explicit, precise)
3. Inference provides **fallback** (convenient, smart)
4. Visual styling **composes** all layers (informative, consistent)

This preserves existing behavior while enabling richer expression and clearer visual communication of edge semantics.