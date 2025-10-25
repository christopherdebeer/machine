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

## Advanced Example: Refined Styling, Ports, and Layout

The following example combines reusable style metadata, nested namespaces, and
attribute-level ports. Style nodes remain metadata only—they never appear in the
rendered diagram—but any node or edge annotated with the matching selector will
inherit the declared Graphviz attributes.

```dygram
machine "Refined styling, ports, and layout"
description: "my machine description"
type: "example"

parent {
    spouse: "Alice";
    child1 @highlight {
        age: 38;
        grandchild {
            age: 7;
        }
    }
    child2 @highlight {
        likes: apples; // node IDs can be used as attribute values
    }
}

apples;

// Style metadata only – applies to any node or edge annotated with @highlight
style highlightStyle @highlight {
    color: red;
    rank: "group:one"; // supports rank aliases such as group:/align:/same:
    shape: "star";
}

parent.spouse -"begets..."-> parent.child1;
child1 -@highlight @style("color: yellow; gradientangle: 90")-> child2;

// Inferred edge from attribute reference
child2.likes -likes-> apples;
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

## Benefits

- **Reusable**: Define styles once, apply to many nodes and edges
- **Declarative**: Separates visual styling from behavior
- **Type-Safe**: Works with existing annotation system
- **No Grammar Changes**: Uses existing DyGram syntax
- **Flexible**: Hide annotation text while keeping visual styles
