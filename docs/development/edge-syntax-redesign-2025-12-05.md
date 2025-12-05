# Edge Syntax Redesign - December 5, 2025

## Overview

This document specifies the redesigned edge syntax for Dygram, focusing on readability, natural ergonomics, and consistency.

## Design Principles

1. **Source/target labels optional** - Rendered as GraphViz tail/head labels with multiplicity
2. **Block metadata shared only** - No mixing inline and block metadata
3. **Flexible custom arrow types** - Support any arrow pattern
4. **Semicolons only when necessary** - Required only for parsing disambiguation

## Complete Syntax Specification

### Basic Edge Syntax

```dy
// Simple edge
A -> B

// With target label
A -> B "processes"

// With source label
A "sends to" -> B

// With both labels
A "sends" -> B "receives"
```

### Multiplicity (Unquoted)

```dy
// Basic multiplicity
1 A -> B *                  // One-to-many
0..1 A -> B 1..*            // Optional to one-or-more
* A -> B *                  // Many-to-many

// Shorthand (source defaults to 1)
A -> B *                    // Same as: 1 A -> B *

// With labels
1 Parent "owns" -> Child * "belongs to"
```

**Multiplicity Format:**
- Single number: `1`, `5`, `10`
- Wildcard: `*` (zero or more)
- Range: `0..1`, `1..*`, `0..*`, `1..5`

### Multi-Target Shorthand

```dy
// Simple fan-out
A -> B, C, D

// With individual multiplicities
A -> B *, C 1, D 0..1

// With individual labels
A -> B "primary", C "secondary", D "fallback"

// With individual annotations
A -> B @sync, C @async, D @lazy

// Combined
0..1 A -> B * "primary", 
         C 1 "secondary", 
         D 1..* @async
```

### Shared Metadata Block

```dy
// Applies to all targets
A -> B, C, D {
  timeout: 30
  retries: 3
  @critical
}

// With individual configs + shared metadata
A -> B * "primary", 
     C 1 "secondary" {
  timeout: 30
  @critical
}
```

**Rules:**
- Block metadata is shared across all targets
- Individual target configs (multiplicity, label, annotation) are per-target
- Cannot mix inline attributes with block metadata

### Arrow Types

#### Standard Arrows
```dy
// Control flow
A -> B              // Forward
A <- B              // Reverse
A <-> B             // Bidirectional

// Data flow
A --> B             // Forward
A <-- B             // Reverse
A <--> B            // Bidirectional

// Transform
A => B              // Forward
A <= B              // Reverse
A <=> B             // Bidirectional

// Composition
A *--> B            // Forward
A <--* B            // Reverse
A <--*--> B         // Bidirectional

// Aggregation
A o--> B            // Forward
A <--o B            // Reverse
A <--o--> B         // Bidirectional

// Inheritance
A <|-- B            // Reverse (traditional)
A --|> B            // Forward
A <|--|> B          // Bidirectional
```

#### Custom Arrows
```dy
// Any pattern of arrow characters
F ~>> G
X ~~> Y
A |> B
C o-> D

// With explicit semantics
F ~>> G {
  type: "custom-flow"
  meaning: "special relationship"
}
```

### Direction and Semantics

#### Inferred from Arrow Type
```dy
A -> B              // type: "control", direction: "forward"
A <-- B             // type: "data", direction: "reverse"
A <=> B             // type: "transform", direction: "bidirectional"
```

#### Explicit Override
```dy
A -> B {
  type: "data"      // Override inferred type
}

A ~>> B {
  type: "dependency"
  direction: "forward"
}
```

### Edge Chaining

```dy
// Chain multiple edges in sequence
A -> B -> C -> D

// With labels
A "step1" -> B "step2" -> C "step3" -> D

// With multiplicity
1 A -> B * -> C 1 -> D *

// With metadata on final target
A -> B -> C {
  @critical
  timeout: 30
}

// Mixed arrow types in chain
Source --> Transform => Process -> Output
```

**Chaining Rules:**
- Each `->` creates a separate edge
- Metadata block applies only to the final edge in chain
- Multiplicity applies to each segment independently

### Semicolon Rules

```dy
// Not needed (clear end)
A -> B
A -> B { x: 1 }
A -> B "label"
A -> B -> C -> D

// Needed (multiple statements on same line)
A -> B; C -> D

// Needed (ambiguous end)
A -> B
C                   // Is this a new node or continuation?
// Solution: A -> B; to be explicit
```

---

## Complete Examples

### Example 1: Service Architecture
```dy
machine "Microservices"

task API
task AuthService
task DataService
task CacheService

// Multi-target with individual configs and shared metadata
1 API "delegates to" -> 
  AuthService * "authenticates" @sync,
  DataService 1 "queries" @async,
  CacheService 0..1 "caches" @lazy {
  timeout: 5000
  retries: 3
  @critical
}
```

### Example 2: Data Pipeline
```dy
machine "ETL Pipeline"

context Source
task Transform
task Validate
context Target

// Extract phase
* Source "extracts" => Transform, Validate {
  batchSize: 1000
  @parallel
}

// Load phase
1 Transform "loads" => Target *
```

### Example 3: Bidirectional Relationships
```dy
machine "Domain Model"

task Parent
task Child
task User

// One-to-many bidirectional
1 Parent "owns" <-> Child * "belongs to" {
  cascade: true
}

// Many-to-many bidirectional
* User "follows" <-> User "followed by" {
  type: "social"
}
```

### Example 4: Custom Arrows
```dy
machine "Custom Relationships"

task Component
task Service

// Custom arrow with explicit semantics
Component ~>> Service "soft dependency" {
  type: "optional-dependency"
  lazy: true
}

// Another custom pattern
Component ~~> Service {
  type: "weak-reference"
}
```

---

## GraphViz Rendering

### Tail/Head Labels with Multiplicity

```dy
// Source
1 Parent "owns" -> Child * "belongs to"

// Renders as
"Parent" -> "Child" [
  taillabel="owns\n[1]",
  headlabel="belongs to\n[*]",
  // ... other attributes
]
```

### Multi-Target Expansion

```dy
// Source
A -> B "primary", C "secondary" {
  timeout: 30
}

// Expands to
"A" -> "B" [
  headlabel="primary",
  timeout="30"
]
"A" -> "C" [
  headlabel="secondary",
  timeout="30"
]
```

---

## Migration Strategy

### Backward Compatibility

**Keep working:**
- Current arrow types: `->`, `-->`, `=>`, etc.
- Block syntax: `A -> B { x: 1 }`
- Multi-target: `A -> B, C, D`

**Breaking changes:**
- Multiplicity: `"1"` → `1` (remove quotes)
- Source labels: New feature (no migration needed)
- Inline labels: `A -label-> B` → `A -> B "label"` (deprecated)

### Migration Guide

```dy
// Old syntax (still works)
"1" A -> B "*"
A --test: true--> B

// New syntax (recommended)
1 A -> B *
A --> B { test: true }

// Old inline labels (deprecated)
A -label-> B

// New labels (recommended)
A -> B "label"
```

---

## Implementation Checklist

### Phase 1: Grammar
- [ ] Add `MULTIPLICITY` terminal (unquoted)
- [ ] Add `CUSTOM_ARROW` terminal (flexible pattern)
- [ ] Add source/target label support
- [ ] Restructure `EdgeSegment` for new syntax
- [ ] Update semicolon rules

### Phase 2: Serializer
- [ ] Parse multiplicity as structured data (not strings)
- [ ] Expand multi-target edges
- [ ] Merge individual + shared metadata
- [ ] Handle custom arrow types
- [ ] Store source/target labels

### Phase 3: Renderer
- [ ] Render source labels as GraphViz `taillabel`
- [ ] Render target labels as GraphViz `headlabel`
- [ ] Include multiplicity in tail/head labels
- [ ] Support custom arrow types with fallback styling

### Phase 4: Testing
- [ ] Test all multiplicity formats
- [ ] Test multi-target expansion
- [ ] Test source/target labels
- [ ] Test custom arrows
- [ ] Test backward compatibility

### Phase 5: Documentation
- [ ] Update syntax documentation
- [ ] Create migration guide
- [ ] Update all examples
- [ ] Add new examples showcasing features

---

## Next Steps

1. Review and approve this design
2. Implement grammar changes
3. Update serializer and renderer
4. Test thoroughly
5. Update documentation

Ready to proceed with implementation?