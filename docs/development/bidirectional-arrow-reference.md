# Bidirectional Arrow Reference

## Overview

DyGram supports comprehensive bidirectional arrow syntax, allowing DSL authors to define edges in any direction (forward, reverse, or bidirectional) for all arrow types. This provides flexibility in expressing relationships naturally while maintaining consistent semantic meaning.

## Complete Arrow Syntax Matrix

| Semantic Type | Forward | Reverse | Bidirectional | Subtype |
|---------------|---------|---------|---------------|---------|
| **Control** | `->` | `<-` | `<->` | - |
| **Data** | `-->` | `<--` | `<-->` | - |
| **Transform** | `=>` | `<=` | `<=>` | - |
| **Composition** | `*-->` | `<--*` | `<--*-->` | compose |
| **Aggregation** | `o-->` | `<--o` | `<--o-->` | aggregate |
| **Inheritance** | `-->\|` | `<\|--` | `<\|--\|>` | inherit |

## Semantic Equivalence

### Forward and Reverse Arrows

Forward and reverse arrows represent the **same semantic relationship** but with **opposite visual direction**:

```dygram
// These are semantically equivalent (both represent A controls B)
A -> B    // Forward: A to B
B <- A    // Reverse: B from A (equivalent to A -> B)
```

**During serialization**, reverse arrows are **normalized** by swapping source and target:
- DSL: `B <- A` 
- JSON: `{ source: "A", target: "B", direction: "reverse", arrowType: "<-" }`

This normalization simplifies runtime processing while preserving the original direction for round-trip conversion.

### Bidirectional Arrows

Bidirectional arrows represent **mutual relationships** where the connection flows in both directions:

```dygram
// Bidirectional relationship
Spouse <-> Spouse    // Control flow in both directions
Client <--> Server   // Data flow in both directions
A <=> B              // Transform in both directions
```

**During serialization**, bidirectional arrows create a **single edge** with `direction: "bidirectional"`:
- DSL: `A <-> B`
- JSON: `{ source: "A", target: "B", direction: "bidirectional", arrowType: "<->" }`

## Usage Examples

### Control Flow

```dygram
// Forward control flow
Start -> Process -> End

// Reverse control flow (natural reading order)
End <- Process <- Start

// Bidirectional control flow
StateA <-> StateB    // States can transition both ways
```

### Data Flow

```dygram
// Forward data flow
Input --> Transform --> Output

// Reverse data flow
Output <-- Transform <-- Input

// Bidirectional data flow
Cache <--> Service    // Data flows both directions
```

### Transform

```dygram
// Forward transform
Raw => Processed

// Reverse transform (inverse operation)
Processed <= Raw

// Bidirectional transform
Celsius <=> Fahrenheit    // Convertible both ways
```

### Composition

```dygram
// Forward composition
Container *--> Component

// Reverse composition
Component <--* Container

// Bidirectional composition
Parent <--*--> Child    // Strong ownership both ways
```

### Aggregation

```dygram
// Forward aggregation
Whole o--> Part

// Reverse aggregation
Part <--o Whole

// Bidirectional aggregation
Team <--o--> Member    // Weak association both ways
```

### Inheritance

```dygram
// Traditional inheritance (child to parent)
Child <|-- Parent

// Forward inheritance (parent to child)
Parent --|> Child

// Bidirectional inheritance (interface implementation)
Interface <|--|> Implementation
```

## GraphViz Rendering

Each arrow type maps to specific GraphViz DOT attributes:

### Control Arrows
- `->`: Default arrow (solid, black)
- `<-`: `dir=back` (arrow points backward)
- `<->`: `dir=both` (arrows on both ends)

### Data Arrows
- `-->`: `style="dashed"` (dashed line)
- `<--`: `style="dashed", dir=back` (dashed, points back)
- `<-->`: `dir=both, style="dashed"` (dashed, both ends)

### Transform Arrows
- `=>`: `penwidth=3, color="#D32F2F"` (thick red)
- `<=`: `penwidth=3, color="#D32F2F", dir=back` (thick red, points back)
- `<=>`: `dir=both, penwidth=3, color="#D32F2F"` (thick red, both ends)

### Composition Arrows
- `*-->`: `arrowhead=diamond` (filled diamond)
- `<--*`: `arrowtail=diamond, dir=back` (filled diamond at tail)
- `<--*-->`: `dir=both, arrowhead=diamond, arrowtail=diamond` (diamonds both ends)

### Aggregation Arrows
- `o-->`: `arrowhead=odiamond` (open diamond)
- `<--o`: `arrowtail=odiamond, dir=back` (open diamond at tail)
- `<--o-->`: `dir=both, arrowhead=odiamond, arrowtail=odiamond` (open diamonds both ends)

### Inheritance Arrows
- `<|--`: `arrowhead=empty, dir=back` (empty arrow to parent)
- `--|>`: `arrowhead=empty` (empty arrow to child)
- `<|--|>`: `dir=both, arrowhead=empty, arrowtail=empty` (empty arrows both ends)

## Integration with Edge Features

### Arrows + Labels

Arrow syntax provides semantic type, labels provide human-readable description:

```dygram
A -->reads--> B      // Data flow with "reads" label
A <=transform<= B    // Reverse transform with "transform" label
```

### Arrows + Attributes

Arrow syntax sets base semantic, attributes provide modifiers:

```dygram
A --> B {
  condition: "ready"
  priority: 5
}

A <=> B {
  async: true
  timeout: 5000
}
```

### Arrows + Annotations

Arrow syntax sets category, annotations refine behavior:

```dygram
A --> B @async              // Data flow, async modifier
A <=> B @filter("x > 10")   // Bidirectional transform with filter
A <-> B @critical           // Bidirectional control, critical path
```

### Arrows + Conditional Styling

Arrow semantics layer with conditional evaluation:

```dygram
A --> B { condition: "x > 10" }
```

**Visual result:**
- If condition true: Green dashed (active data flow)
- If condition false: Gray dashed (inactive data flow)
- Runtime active: Thick green (runtime override)

## Semantic Inference

The system uses a **5-level priority hierarchy** to determine edge semantics:

1. **Explicit arrow syntax** (highest priority)
   - `=>` always means transform
   - `<--` always means reverse data flow

2. **Edge annotations**
   - `@transform`, `@data`, `@control`

3. **Label keywords**
   - "reads", "writes", "catch", etc.

4. **Edge attributes**
   - `type: "transform"`, `semantic: "data"`

5. **Context inference** (lowest priority)
   - Based on source/target node types

## Best Practices

### When to Use Forward Arrows

✅ **Use forward arrows (`->`, `-->`, `=>`) when:**
- Following natural left-to-right reading order
- Showing process flow or data pipeline
- Documenting control flow sequences

```dygram
Start -> Process -> Transform -> End
Input --> Process --> Output
```

### When to Use Reverse Arrows

✅ **Use reverse arrows (`<-`, `<--`, `<=`) when:**
- Natural reading order is right-to-left
- Emphasizing the target as the primary entity
- Showing dependency direction (what depends on what)

```dygram
// Emphasize that Process depends on Input
Process <-- Input

// Show that Child inherits from Parent
Child <|-- Parent
```

### When to Use Bidirectional Arrows

✅ **Use bidirectional arrows (`<->`, `<-->`, `<=>`) when:**
- Relationship is truly mutual
- Data or control flows in both directions
- Showing peer-to-peer relationships

```dygram
// Mutual relationships
Spouse <-> Spouse
Client <--> Server
Celsius <=> Fahrenheit
```

## Implementation Details

### Grammar Support

All arrow types are defined as terminals in `src/language/machine.langium`:

```langium
// Bidirectional arrows (most specific)
terminal BIDIRECTIONAL_INHERIT: '<|--|>';
terminal BIDIRECTIONAL_COMPOSE: '<--*-->';
terminal BIDIRECTIONAL_AGGREGATE: '<--o-->';
terminal BIDIRECTIONAL_FAT: '<=>';
terminal BIDIRECTIONAL_CONTROL: '<->';
terminal BIDIRECTIONAL_ARROW: '<-->';

// Reverse arrows
terminal REVERSE_COMPOSE_ARROW: '<--*';
terminal REVERSE_AGGREGATE_ARROW: '<--o';
terminal FORWARD_INHERIT_ARROW: '--|>';
terminal REVERSE_ARROW_DOUBLE: '<--';
terminal REVERSE_FAT_ARROW: '<=';
terminal REVERSE_ARROW_SINGLE: '<-';

// Forward arrows (original)
terminal INHERIT_ARROW: '<|--';
terminal COMPOSE_ARROW: '*-->';
terminal AGGREGATE_ARROW: 'o-->';
terminal ARROW_DOUBLE: '-->';
terminal FAT_ARROW: '=>';
terminal ARROW_SINGLE: '->';
```

### Semantic Inference

The `EdgeSemanticInferencer` class handles all arrow types:

```typescript
// Maps arrow syntax to semantic type
arrowToSemanticMap = {
  '->': 'control',
  '<-': 'control',
  '<->': 'control',
  // ... all 21 arrow types
};

// Maps arrow syntax to direction
arrowDirectionMap = {
  '->': 'forward',
  '<-': 'reverse',
  '<->': 'bidirectional',
  // ... all 21 arrow types
};
```

### Serialization Normalization

Reverse arrows are normalized during JSON serialization:

```typescript
if (inferenceResult.direction === 'reverse') {
  // Swap source and target
  record.source = targetRef.nodeName;
  record.target = sourceRef.nodeName;
  
  // Preserve original direction
  record.originalDirection = 'reverse';
}
```

This ensures:
- Runtime processing is simplified (always forward direction)
- Original syntax is preserved for round-trip conversion
- Visual rendering respects author's intent

## Backward Compatibility

✅ **All existing arrow syntax continues to work**
- Original 7 arrow types unchanged
- Existing diagrams render identically
- No breaking changes to JSON format

✅ **Progressive enhancement**
- New arrow types are additive
- Opt-in usage (use new arrows only when needed)
- Inference provides smart defaults

## Visual Reference

### Control Flow Arrows
```
A -> B     ────────>     Forward control
A <- B     <────────     Reverse control  
A <-> B    <──────>      Bidirectional control
```

### Data Flow Arrows
```
A --> B    ─ ─ ─ ─>     Forward data
A <-- B    <─ ─ ─ ─     Reverse data
A <--> B   <─ ─ ─ ─>    Bidirectional data
```

### Transform Arrows
```
A => B     ═══════>     Forward transform (thick red)
A <= B     <═══════     Reverse transform (thick red)
A <=> B    <══════>     Bidirectional transform (thick red)
```

### Composition Arrows
```
A *--> B   ────◆──>     Forward composition (filled diamond)
A <--* B   <──◆────     Reverse composition
A <--*--> B <──◆──>     Bidirectional composition
```

### Aggregation Arrows
```
A o--> B   ────◇──>     Forward aggregation (open diamond)
A <--o B   <──◇────     Reverse aggregation
A <--o--> B <──◇──>     Bidirectional aggregation
```

### Inheritance Arrows
```
A <|-- B   <──△────     Reverse inheritance (child to parent)
A --|> B   ────△──>     Forward inheritance (parent to child)
A <|--|> B <──△──>      Bidirectional inheritance
```

## Related Documentation

- **Semantic Proposal**: `docs/development/edge-sematics.md`
- **Integration Architecture**: `docs/development/arrow-semantics-integration.md`
- **Grammar Definition**: `src/language/machine.langium`
- **Semantic Inferencer**: `src/language/diagram/edge-semantic-inferencer.ts`
- **GraphViz Renderer**: `src/language/diagram/graphviz-dot-diagram.ts`
- **Serializer**: `src/language/json/serializer.ts`
