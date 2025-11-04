# Edge Syntax Validation

This document contains comprehensive test cases for edge syntax combinations, validating that annotations, text labels, and attributes can be defined cumulatively in any order.

## Simple Edge (No Label)

```dygram
machine "Simple Edge Test"

state Start
state End

Start -> End
```

## Text Label Only

```dygram
machine "Text Label Test"

state Start
state End

Start -"text label"-> End
```

## Single Attribute

```dygram
machine "Single Attribute Test"

state Start
state End

Start -timeout: 5000-> End
```

## Single Annotation

```dygram
machine "Single Annotation Test"

state Start
state End

Start -@priority(1)-> End
```

## Multiple Annotations

```dygram
machine "Multiple Annotations Test"

state Start
state End

Start -@async, @retry(3)-> End
```

## Multiple Attributes

```dygram
machine "Multiple Attributes Test"

state Start
state End

Start -timeout: 5000, retries: 3-> End
```

## Annotation + Attribute

```dygram
machine "Annotation + Attribute Test"

state Start
state End

Start -@async, timeout: 5000-> End
```

## Text + Attribute (Key Test)

This combination should work - text label with attribute.

```dygram
machine "Text + Attribute Test"

state Start
state End

Start -"my label", timeout: 5000-> End
```

## Annotation + Text (Key Test)

This combination should work - annotation with text label.

```dygram
machine "Annotation + Text Test"

state Start
state End

Start -@priority(1), "high priority task"-> End
```

## Annotation + Text + Attribute (Key Test)

This combination should work - all three features together.

```dygram
machine "Annotation + Text + Attribute Test"

state Start
state End

Start -@async, "async operation", timeout: 5000-> End
```

## Text + Multiple Attributes

```dygram
machine "Text + Multiple Attributes Test"

state Start
state End

Start -"process data", timeout: 5000, retries: 3-> End
```

## Multiple Annotations + Text

```dygram
machine "Multiple Annotations + Text Test"

state Start
state End

Start -@async, @retry(3), "retryable async task"-> End
```

## Multiple Annotations + Attribute

```dygram
machine "Multiple Annotations + Attribute Test"

state Start
state End

Start -@async, @priority(2), timeout: 10000-> End
```

## Full Combination

All features: multiple annotations, text label, multiple attributes.

```dygram
machine "Full Combination Test"

state Start
state End

Start -@async, @priority(1), "critical async task", timeout: 5000, retries: 3-> End
```

## Attribute with Semicolon

```dygram
machine "Attribute with Semicolon Test"

state Start
state End

Start -timeout: 5000;-> End
```

## Text + Attribute with Semicolon

```dygram
machine "Text + Attribute with Semicolon Test"

state Start
state End

Start -"labeled", timeout: 5000;-> End
```

## Different Text Positions

### Text First, Then Attributes

```dygram
machine "Text First Position Test"

state Start
state End

Start -"label first", attr1: 100, attr2: 200-> End
```

### Attributes First, Then Text

```dygram
machine "Text Last Position Test"

state Start
state End

Start -attr1: 100, attr2: 200, "label last"-> End
```

### Text in Middle of Attributes

```dygram
machine "Text Middle Position Test"

state Start
state End

Start -attr1: 100, "label middle", attr2: 200-> End
```

## Annotation Order Tests

### Annotation, Text, Attribute (in order)

```dygram
machine "ATA Order Test"

state Start
state End

Start -@async, "operation", timeout: 1000-> End
```

### Annotation, Attribute, Text (different order)

```dygram
machine "AAT Order Test"

state Start
state End

Start -@async, timeout: 1000, "operation"-> End
```

### Text, Annotation, Attribute

Note: This violates grammar rules (annotations must come before attributes/text).
This test case is expected to fail parsing.

```dygram
machine "TAA Order Test - Invalid"

state Start
state End

Start -"operation", @async, timeout: 1000-> End
```
