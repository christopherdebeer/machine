# Custom Styling

DyGram supports custom styling through three complementary mechanisms that allow you to control the visual appearance of your diagrams:

1. **@style annotations with inline attributes** - Apply styles directly to nodes and edges
2. **style attribute with object values** - Define styles as node attributes
3. **style nodes with selector annotations** - Create reusable style definitions

All three mechanisms use Graphviz DOT attributes and can be used together in the same diagram.

## Mechanism 1: @style Annotations

Apply styles directly to nodes, edges, or the machine itself using `@style` annotations with inline attributes:

```dygram
machine "Example" @style(rankdir: LR)

// Node with inline style
Task important @style(fillcolor: yellow; penwidth: 3;) {
    prompt: "Important task";
}

// Edge with inline style
a -@style(color: red; penwidth: 5;)-> b;
```

**Key Features**:
- Direct application of Graphviz attributes
- Works on machines, nodes, and edges
- Useful for one-off styling needs
- Can control layout (e.g., `rankdir: LR` for left-to-right)

## Mechanism 2: style Attribute

Define styles as object-valued attributes within nodes:

```dygram
Task process {
    style: {
        color: blue;
        shape: box;
    }
    prompt: "Process data";
}
```

**Key Features**:
- Styles defined within node structure
- Clean separation from other attributes
- Useful for node-specific styling

## Mechanism 3: Style Nodes with Selectors

Create reusable style definitions that apply to nodes based on annotation selectors:

### Syntax

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

## Combined Example: All Three Mechanisms

The following example demonstrates all three styling mechanisms working together:

```dygram
machine "Complete Styling Demo" @style(rankdir: LR)

// Mechanism 3: Style nodes with selectors
style criticalStyle @critical {
    fillcolor: "#ffcccc";
    penwidth: 3;
    color: "#cc0000";
}

// Mechanism 2: style attribute
Task process {
    style: {
        color: blue;
        shape: box;
    }
    prompt: "Process data";
}

// Mechanism 1 + 3: @style annotation with selector
Task validate @critical {
    prompt: "Validate";
}

// Mechanism 1: inline @style on edge
process -@style(color: green; penwidth: 2;)-> validate;
```

**In this example**:
- Machine uses `@style(rankdir: LR)` for left-to-right layout
- `process` node uses style attribute (Mechanism 2)
- `validate` node uses `@critical` selector matching `criticalStyle` (Mechanism 3)
- Edge uses inline `@style` (Mechanism 1)

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
        likes: apples; // node IDs automatically create attribute-sourced edges
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
```

In this example, the qualified edge `parent.spouse -> parent.child1` anchors the
connection to the `spouse` attribute port on the `parent` node, while the
attribute assignment `likes: apples;` automatically creates an inferred edge
from `child2` to the `apples` node. Attribute references can drill into
qualified paths (for example `orders.primary.status`) and the serializer will
attach the edge to the matching attribute cell on both the source and target
nodes.

## How It Works

### Mechanism 1: @style Annotations
1. Add `@style(attributes)` annotation to a machine, node, or edge
2. Provide inline Graphviz attributes (semicolon-separated)
3. Styles are applied directly during diagram generation

### Mechanism 2: style Attribute
1. Add a `style` attribute to a node
2. Provide an object with Graphviz attributes as key-value pairs
3. Styles are applied to that specific node

### Mechanism 3: Style Nodes with Selectors
1. **Define Style Nodes**: Create style nodes with the `style` keyword, a name, and a selector annotation
2. **Add Attributes**: Add any graphviz DOT attributes inside the style node's attribute block
3. **Apply Styles**: Use the matching annotation on any regular node to apply the style
4. **Non-Executable**: Style nodes are filtered out during rendering and execution - they're pure metadata

### Priority Order

When multiple styling mechanisms apply to the same element, they are merged with the following priority (highest to lowest):
1. Inline `@style` annotations (Mechanism 1)
2. `style` attributes (Mechanism 2)
3. Style nodes with selectors (Mechanism 3)

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

## Layout Control

Use `@style` annotations at the machine level to control diagram layout:

```dygram
// Left-to-right layout
machine "Horizontal Flow" @style(rankdir: LR)

// Top-to-bottom layout (default)
machine "Vertical Flow" @style(rankdir: TB)

// Right-to-left layout
machine "RTL Flow" @style(rankdir: RL)

// Bottom-to-top layout
machine "Bottom Up" @style(rankdir: BT)
```

You can also control node grouping and alignment:

```dygram
machine "Aligned Layout"

Task start @style(rank: min;) "Start";
Task a @style(rank: same:group1;) "Task A";
Task b @style(rank: same:group1;) "Task B";
Task end @style(rank: max;) "End";

start -> a;
start -> b;
a -> end;
b -> end;
```

**Layout Options**:
- `rankdir`: Direction (LR, RL, TB, BT)
- `rank`: Node alignment (min/max for top/bottom, same:name for grouping)
- `nodesep`: Horizontal spacing between nodes
- `ranksep`: Vertical spacing between ranks

## Benefits

- **Three Approaches**: Choose the right mechanism for your use case
- **Reusable**: Style nodes define styles once, apply to many nodes and edges
- **Declarative**: Separates visual styling from behavior
- **Flexible**: Mix and match mechanisms as needed
- **Layout Control**: Direct access to Graphviz layout attributes
- **Type-Safe**: Works with existing annotation system
