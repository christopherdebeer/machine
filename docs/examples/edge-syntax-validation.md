# Edge Syntax Validation Examples

This document tests all valid combinations of edge syntax elements:
- Simple edges (no label)
- Text labels (string or ID)
- Attributes (named key:value pairs)
- Annotations (@name or @name(value))
- Cumulative combinations

## Simple Edge (No Label)

```dygram
machine "Simple Edge Test"

state A "Start"
state B "End"

A -> B
```

## Text Label Only

### String Label

```dygram
machine "String Label Test"

state A "Start"
state B "End"

A -"transition text"-> B
```

### ID Label

```dygram
machine "ID Label Test"

state A "Start"
state B "End"

A -transitionLabel-> B
```

## Attribute Only

### Named Attribute with Value

```dygram
machine "Named Attribute Test"

state A "Start"
state B "End"

A -timeout: 5000-> B
```

### Named Attribute without Value

```dygram
machine "Flag Attribute Test"

state A "Start"
state B "End"

A -async-> B
```

### Array Attribute

```dygram
machine "Array Attribute Test"

state A "Start"
state B "End"

A -[1, 2, 3]-> B
```

## Annotation Only

### Simple Annotation

```dygram
machine "Simple Annotation Test"

state A "Start"
state B "End"

A -@priority("3")-> B
```

### Annotation with String Value

```dygram
machine "Annotation String Test"

state A "Start"
state B "End"

A -@label("important")-> B
```

### Annotation with Attributes

```dygram
machine "Annotation Attributes Test"

state A "Start"
state B "End"

A -@style(color: red; weight: bold)-> B
```

## Multiple Annotations

```dygram
machine "Multiple Annotations Test"

state A "Start"
state B "End"

A -@priority("1"), @async, @retry("3")-> B
```

## Annotation + Text Label

```dygram
machine "Annotation with Text Test"

state A "Start"
state B "End"

A -@priority("1"), "high priority transition"-> B
```

## Annotation + Attribute

```dygram
machine "Annotation with Attribute Test"

state A "Start"
state B "End"

A -@async, timeout: 5000-> B
```

## Multiple Attributes

```dygram
machine "Multiple Attributes Test"

state A "Start"
state B "End"

A -timeout: 5000, retries: 3-> B
```

## Text + Attribute

```dygram
machine "Text with Attribute Test"

state A "Start"
state B "End"

A -"process", timeout: 5000-> B
```

## Annotation + Text + Attribute (Full Combination)

```dygram
machine "Full Combination Test"

state A "Start"
state B "End"

A -@priority("1"), "critical path", timeout: 5000-> B
```

## Multiple Annotations + Multiple Attributes

```dygram
machine "Complex Combination Test"

state A "Start"
state B "End"

A -@async, @retry("3"), timeout: 5000, maxRetries: 5-> B
```

## Annotation with Attributes + Edge Attributes

```dygram
machine "Annotation and Edge Attributes Test"

state A "Start"
state B "End"

A -@style(color: blue; weight: 2), async, timeout: 1000-> B
```

## Edge with All Features

```dygram
machine "Kitchen Sink Test"

state A "Start"
state B "End"

A -@priority("1"), @async, @style(color: green), "main flow", timeout: 5000, retries: 3-> B
```

## Semicolon Rules

### Attribute with Semicolon (Valid)

```dygram
machine "Attribute Semicolon Test"

state A "Start"
state B "End"

A -timeout: 5000;-> B
```

### Multiple Attributes with Semicolons (Valid)

```dygram
machine "Multiple Attributes Semicolons Test"

state A "Start"
state B "End"

A -timeout: 5000; retries: 3;-> B
```

### Annotation without Semicolon (Correct Syntax)

```dygram
machine "Annotation No Semicolon Test"

state A "Start"
state B "End"

A -@priority("1")-> B
```

## Multiple Targets

```dygram
machine "Multiple Targets Test"

state A "Start"
state B "End1"
state C "End2"

A -@priority("1"), "broadcast", timeout: 1000-> B, C
```

## Chained Edges

```dygram
machine "Chained Edges Test"

state A "Start"
state B "Middle"
state C "End"

A -@async, "first"-> B -@priority("2"), "second"-> C
```
