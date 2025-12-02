# Edge Syntax Validation Examples

This document tests all valid combinations of edge syntax elements:
- Simple edges (no label)
- Text labels (string or ID)
- Attributes (named key:value pairs)
- Annotations (@name or @name(value))
- Cumulative combinations

## Simple Edge (No Label)

```dy
machine "Simple Edge Test"

state A "Start"
state B "End"

A -> B
```

## Text Label Only

### String Label

```dy
machine "String Label Test"

state A "Start"
state B "End"

A -"transition text"-> B
```

### ID Label

```dy
machine "ID Label Test"

state A "Start"
state B "End"

A -transitionLabel-> B
```

## Attribute Only

### Named Attribute with Value

```dy
machine "Named Attribute Test"

state A "Start"
state B "End"

A -timeout: 5000-> B
```

### Named Attribute without Value

```dy
machine "Flag Attribute Test"

state A "Start"
state B "End"

A -async-> B
```

### Array Attribute

```dy
machine "Array Attribute Test"

state A "Start"
state B "End"

A -[1, 2, 3]-> B
```

## Annotation Only

### Simple Annotation

```dy
machine "Simple Annotation Test"

state A "Start"
state B "End"

A -@priority("3")-> B
```

### Annotation with String Value

```dy
machine "Annotation String Test"

state A "Start"
state B "End"

A -@label("important")-> B
```

### Annotation with Attributes

```dy
machine "Annotation Attributes Test"

state A "Start"
state B "End"

A -@style(color: red; weight: bold)-> B
```

## Multiple Annotations

```dy
machine "Multiple Annotations Test"

state A "Start"
state B "End"

A -@priority("1"), @async, @retry("3")-> B
```

## Annotation + Text Label

```dy
machine "Annotation with Text Test"

state A "Start"
state B "End"

A -@priority("1"), "high priority transition"-> B
```

## Annotation + Attribute

```dy
machine "Annotation with Attribute Test"

state A "Start"
state B "End"

A -@async, timeout: 5000-> B
```

## Multiple Attributes

```dy
machine "Multiple Attributes Test"

state A "Start"
state B "End"

A -timeout: 5000, retries: 3-> B
```

## Text + Attribute

```dy
machine "Text with Attribute Test"

state A "Start"
state B "End"

A -"process", timeout: 5000-> B
```

## Annotation + Text + Attribute (Full Combination)

```dy
machine "Full Combination Test"

state A "Start"
state B "End"

A -@priority("1"), "critical path", timeout: 5000-> B
```

## Multiple Annotations + Multiple Attributes

```dy
machine "Complex Combination Test"

state A "Start"
state B "End"

A -@async, @retry("3"), timeout: 5000, maxRetries: 5-> B
```

## Annotation with Attributes + Edge Attributes

```dy
machine "Annotation and Edge Attributes Test"

state A "Start"
state B "End"

A -@style(color: blue; weight: 2), async, timeout: 1000-> B
```

## Edge with All Features

```dy
machine "Kitchen Sink Test"

state A "Start"
state B "End"

A -@priority("1"), @async, @style(color: green), "main flow", timeout: 5000, retries: 3-> B
```

## Semicolon Rules

### Attribute with Semicolon (Valid)

```dy
machine "Attribute Semicolon Test"

state A "Start"
state B "End"

A -timeout: 5000;-> B
```

### Multiple Attributes with Semicolons (Valid)

```dy
machine "Multiple Attributes Semicolons Test"

state A "Start"
state B "End"

A -timeout: 5000; retries: 3;-> B
```

### Annotation without Semicolon (Correct Syntax)

```dy
machine "Annotation No Semicolon Test"

state A "Start"
state B "End"

A -@priority("1")-> B
```

## Multiple Targets

```dy
machine "Multiple Targets Test"

state A "Start"
state B "End1"
state C "End2"

A -@priority("1"), "broadcast", timeout: 1000-> B, C
```

## Chained Edges

```dy
machine "Chained Edges Test"

state A "Start"
state B "Middle"
state C "End"

A -@async, "first"-> B -@priority("2"), "second"-> C
```
