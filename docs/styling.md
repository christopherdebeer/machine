# Custom Styling

DyGram supports custom styling through special `style` nodes that define reusable visual styling rules. Style nodes are non-executable metadata that apply graphviz attributes to nodes based on annotation selectors.

## Syntax

Style nodes use the following syntax:

```dygram
style <name> @<selector> {
    <graphviz-attribute>: <value>;
    ...
}
```

- **name**: Identifier for the style node (for reference)
- **@selector**: Annotation name to match against other nodes
- **attributes**: Graphviz DOT attributes (fillcolor, penwidth, color, shape, etc.)

## Example

```dygram
machine "Custom Styling Example"

// Define style nodes with annotation selectors
// These are non-executable metadata that control visual appearance

style criticalStyle @Critical {
    fillcolor: "#ffcccc";
    penwidth: 3;
    color: "#cc0000";
}

style warningStyle @Warning {
    fillcolor: "#ffffcc";
    penwidth: 2;
    color: "#cccc00";
}

style successStyle @Success {
    fillcolor: "#ccffcc";
    penwidth: 2;
    color: "#00cc00";
}

// Regular nodes with annotations that trigger the styles

Task start "Initialize system" {
    prompt: "Initialize the payment processing system";
}

Task validatePayment "Validate Payment" @Critical {
    prompt: "Validate payment details with strict checks";
}

Task checkBalance "Check Balance" @Warning {
    prompt: "Check if account has sufficient balance";
}

State processing "Processing payment";

Task completePayment "Complete Payment" @Success {
    prompt: "Finalize the payment transaction";
}

State done "Transaction complete";

// Define the workflow
start -> validatePayment;
validatePayment -> checkBalance;
checkBalance -> processing;
processing -> completePayment;
completePayment -> done;
```

## How It Works

1. **Define Style Nodes**: Create style nodes with the `style` keyword, a name, and a selector annotation
2. **Add Attributes**: Add any graphviz DOT attributes inside the style node's attribute block
3. **Apply Styles**: Use the matching annotation on any regular node to apply the style
4. **Non-Executable**: Style nodes are filtered out during rendering and execution - they're pure metadata

## Supported Attributes

Style nodes support any graphviz DOT attribute:

- **Colors**: `fillcolor`, `color`, `fontcolor`
- **Lines**: `penwidth`, `style` (e.g., "dashed", "dotted")
- **Shapes**: `shape` (e.g., "box", "ellipse", "diamond")
- **Layout**: `peripheries`, `margin`, `height`, `width`
- And many more - see [Graphviz documentation](https://graphviz.org/doc/info/attrs.html)

## Multiple Styles

A node can have multiple annotations, and each matching style will be applied:

```dygram
style errorStyle @Error {
    color: "#ff0000";
}

style urgentStyle @Urgent {
    penwidth: 3;
}

Task criticalError @Error @Urgent {
    prompt: "Handle critical error";
}
```

## Edge Styling

Style nodes also work with edge annotations! You can apply custom styles to edges by adding annotations to edge labels.

```dygram
machine "Edge Styling Example"

// Define style for critical edges
style criticalEdge @critical {
    color: "#ff0000";
    penwidth: 5;
}

state a;
state b;
state c;

// Edge with annotation - visible in label
a -@critical important-> b;

// Edge with annotation - style only, hidden label
b -@critical @hideLabel-> c;
```

**Output**:
- First edge: Shows "@critical important" label with red, thick line
- Second edge: Shows no annotation text, only red, thick line styling

### Hiding Edge Annotation Labels

Use `@hideLabel` or `@hideAnnotation` to apply edge styles without showing the annotation text in the edge label:

```dygram
// Style is applied, but annotation text is hidden
process -@critical @hideLabel done-> complete;
```

This generates: `label="done"` (no "@critical" shown) but still applies `color="#ff0000", penwidth="5"` from the style node.

## Inline Style Annotations

In addition to reusable style nodes, you can apply styles directly to individual nodes and edges using the `@Style` annotation with attribute arguments:

### Node Inline Styling

```dygram
machine "Inline Style Example"

// Using attribute syntax (comma-separated key: value pairs)
Task important @Style(fillcolor: yellow, color: red, penwidth: 3) {
    prompt: "Critical task with inline styling";
}

// Using string syntax (semicolon-separated CSS-like)
Task warning @Style("fillcolor: orange; shape: diamond");

// Combining inline styles with other annotations
State active @Active @Style(fillcolor: lightgreen, shape: box);
```

### Edge Inline Styling

```dygram
machine "Edge Inline Styling"

Task start;
Task end;

// Attribute syntax for edges
start -@Style(color: red, penwidth: 4)-> end;

// String syntax for edges
start -@Style("color: blue; style: dashed") important-> end;
```

### Syntax Options

The `@Style` annotation supports two formats:

1. **Attribute Syntax**: `@Style(key1: value1, key2: value2)`
   - Comma-separated key-value pairs
   - No quotes needed for simple values
   - Example: `@Style(color: red, fillcolor: yellow)`

2. **String Syntax**: `@Style("key1: value1; key2: value2")`
   - Semicolon-separated key-value pairs
   - Wrapped in quotes
   - Example: `@Style("color: red; fillcolor: yellow")`

### Inline vs. Style Nodes

- **Inline styles**: Best for one-off styling or quick prototypes
- **Style nodes**: Best for reusable styles applied to multiple elements

You can combine both approaches:

```dygram
// Reusable style for multiple nodes
style errorStyle @Error {
    color: "#ff0000";
    penwidth: 3;
}

Task task1 @Error;  // Uses errorStyle
Task task2 @Style(fillcolor: yellow);  // One-off inline style
Task task3 @Error @Style(shape: star);  // Both: errorStyle + inline override
```

### Important Notes

- **@Style annotations are hidden**: Unlike other annotations, `@Style` doesn't appear in node or edge labels
- **Graphviz attributes**: All Graphviz DOT attributes are supported (see [Graphviz documentation](https://graphviz.org/doc/info/attrs.html))
- **Style merging**: When combining style nodes and inline styles, inline styles are applied last and can override style node attributes

## Benefits

- **Reusable**: Define styles once, apply to many nodes and edges (style nodes)
- **Flexible**: Quick one-off styling without creating style nodes (inline styles)
- **Declarative**: Separates visual styling from behavior
- **Type-Safe**: Works with existing annotation system
- **Clean Labels**: @Style annotations don't clutter visual output
- **Powerful**: Support for all Graphviz attributes
