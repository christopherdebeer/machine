# Styling and Validation

StrictMode, warning visualization, and diagram controls.

## StrictMode Annotation

Enable strict validation to catch errors early:

```dy
machine "Strict Machine" @StrictMode

Task process "Process data";
Task validate "Validate";

// In strict mode, this would error if 'missing' node doesn't exist
process -> validate;
```

StrictMode behavior:
- **Without @StrictMode**: Auto-creates missing nodes referenced in edges
- **With @StrictMode**: Errors on references to undefined nodes
- Helps catch typos and missing definitions
- Recommended for production machines

### StrictMode Example with Error

```dy
machine "Strict Validation" @StrictMode

Task start "Start";

// ERROR: 'undefined_node' not declared
start -> undefined_node;  // This will cause a validation error
```

### Non-Strict Mode (Default)

```dy
machine "Lenient Machine"

Task start "Start";

// Auto-creates 'undefined_node' as a generic node
start -> undefined_node;  // This works, node is auto-created
```

## Warning Visualization

Control how validation warnings appear in diagrams:

### Inline Warning Mode

Warnings shown in node styling:

```dy
machine "Inline Warnings" @StrictMode

Task process {
    // Warning: unused attribute might show with color coding
    unused_param: "value";
    prompt: "Process data";
};
```

Configuration (programmatic):
```typescript
const options: DiagramOptions = {
    showValidationWarnings: true,
    warningMode: 'inline',  // Warnings affect node styling
    minSeverity: 'warning'  // Show warnings and above
};
```

### Notes Warning Mode

Warnings as separate note nodes:

```dy
machine "Warning Notes"

Task process "Process data";

// In 'notes' mode, warnings create note nodes
// Example output:
// note process "⚠ Warning: Potential issue detected"
```

Configuration:
```typescript
const options: DiagramOptions = {
    showValidationWarnings: true,
    warningMode: 'notes',  // Create note nodes for warnings
    minSeverity: 'info'    // Show all warnings
};
```

### Combined Warning Mode

Both inline styling and notes:

```typescript
const options: DiagramOptions = {
    showValidationWarnings: true,
    warningMode: 'both',    // Both inline + notes
    minSeverity: 'warning'
};
```

### Disable Warnings

```typescript
const options: DiagramOptions = {
    showValidationWarnings: false,
    warningMode: 'none'  // No warning visualization
};
```

## Severity Levels

Control minimum severity to display:

```typescript
// Show only errors
const errorOnly: DiagramOptions = {
    minSeverity: 'error'
};

// Show warnings and errors
const warningsAndErrors: DiagramOptions = {
    minSeverity: 'warning'
};

// Show all (info, hints, warnings, errors)
const showAll: DiagramOptions = {
    minSeverity: 'hint'
};
```

## Diagram Direction Control

Control graph layout direction using `@style` annotations:

### Machine-Level Direction

```dy
// Left-to-right layout
machine "Horizontal Flow" @style(rankdir: LR)

Task a "A";
Task b "B";
Task c "C";

a -> b -> c;
```

### Supported Directions

```dy
// Top-to-bottom (default)
machine "Vertical" @style(rankdir: TB)

// Left-to-right
machine "Horizontal" @style(rankdir: LR)

// Right-to-left
machine "RTL" @style(rankdir: RL)

// Bottom-to-top
machine "Bottom Up" @style(rankdir: BT)
```

**Note**: Direction control applies to the entire diagram. For nested subgraphs, all use the machine-level direction setting.

## Attribute Ports and Cluster Anchors

Graphviz diagrams now expose deterministic ports for every attribute row. Use `sourceAttribute` / `targetAttribute` when defining an edge to connect directly to the value cell of an attribute:

```dy
machine "Attribute Anchors"

Context api {
    endpoint: "https://api.example.com";
    token<string>;
};

Task call_api "Invoke API" {
    operation: "GET";
};

api -> call_api {
    text: "uses";
    sourceAttribute: endpoint;
    targetAttribute: operation;
};
```

- Attribute names are sanitized into stable port IDs (spaces and symbols become `_`).
- Duplicate attribute names receive an automatic index suffix (e.g., `config__value_1`).
- For manual control, `sourcePort` / `targetPort` can reference the generated port name (e.g., `sourcePort: endpoint__value`).

Edges attached to namespace parents (clusters) now terminate at an invisible anchor aligned with the namespace header instead of jumping to the first child node. You can explicitly connect to the cluster boundary by setting `sourcePort: "cluster"` or `targetPort: "cluster"`.

## Rank Hints for Layout

Use the `@rank` annotation (or a `rank` attribute) to group nodes horizontally or pin them to the top/bottom of the diagram:

```dy
machine "Ranked Layout"

Task start @rank("header");
Task plan @rank("same:planning");
Task review @rank("same:planning");
Task archive @rank("footer");

start -> plan -> review -> archive;
```

- `@rank("header")`, `@rank("top")`, or `@rank("min")` place nodes in the top rank.
- `@rank("footer")`, `@rank("bottom")`, or `@rank("max")` place nodes in the bottom rank.
- `@rank("same:groupName")` (aliases: `group:` / `align:`) keeps all members of the group aligned on the same level.
- For parent namespaces, the annotation targets the namespace anchor so the entire cluster honors the rank.

## Runtime Visualization Options

Configure runtime execution visualization:

```typescript
import { generateRuntimeGraphviz } from 'dygram';

const options: DiagramOptions = {
    // Show runtime state (current node, visited, etc.)
    showRuntimeState: true,

    // Show execution path history
    showExecutionPath: true,

    // Show visit counts on nodes
    showVisitCounts: true,

    // Show runtime values in context
    showRuntimeValues: true,

    // Optimize for mobile display
    mobileOptimized: false
};

const runtimeDot = generateRuntimeGraphviz(
    machineJson,
    executionContext,
    options
);
```

### Runtime Visualization Example

```dy
machine "Runtime Demo"

Context state {
    counter<number>: 0;
    status: "running";
};

Task increment {
    prompt: "Increment counter: {{ state.counter }}";
};

Task check {
    prompt: "Check if counter >= 5";
};

State done "Done";

increment -> check;
check -"counter < 5"-> increment;
check -"counter >= 5"-> done;
```

With runtime visualization:
- Current executing node highlighted
- Visited nodes marked
- Visit counts displayed
- Runtime values shown
- Execution path traced

## Edge Styling

Custom edge styling with `@style` annotations:

```dy
machine "Styled Edges"

Task start "Start";
Task critical "Critical Path";
Task optional "Optional";
Task end "End";

// Critical path in red with thick line
start -@style(color: red; penwidth: 4;)-> critical;

// Optional path in gray, dashed
start -@style(color: gray; style: dashed;)-> optional;

// Normal path
critical -> end;
optional -> end;
```

**Edge styling properties** (Graphviz attributes):
- `color`: Edge color (e.g., "red", "#ff0000")
- `penwidth`: Line thickness (numeric)
- `style`: Line style ("solid", "dashed", "dotted", "bold")
- `arrowhead`: Arrow head style ("normal", "box", "diamond", "none")
- `arrowtail`: Arrow tail style
- `arrowsize`: Arrow size multiplier

See the [Graphviz documentation](https://graphviz.org/doc/info/attrs.html) for all available edge attributes.

## Validation Context Integration

For programmatic validation API usage, see **[API Reference - Validation](../api/README.md#validation-context)**.

**Quick example** for visualization:

```typescript
import { generateGraphvizFromJSON } from 'dygram';

const options = {
    showValidationWarnings: true,
    warningMode: 'both',
    minSeverity: 'warning'
};

const dot = generateGraphvizFromJSON(machineJson, options);
```

## Styling Features

For comprehensive styling documentation, see:
- **[Styling Guide](../styling.md)** - Complete guide to all three styling mechanisms
- **[Graphviz Attributes](https://graphviz.org/doc/info/attrs.html)** - Full attribute reference

### Quick Reference

**Three Styling Mechanisms**:
1. `@style(attr: value;)` - Inline annotations on machines, nodes, and edges
2. `style: { attr: value; }` - Style attributes within nodes
3. `style name @selector { attr: value; }` - Reusable style definitions

## Next Steps

- **[Attributes & Types](./attributes-and-types.md)** - Type systems and schemas
- **[Advanced Features](./advanced-features.md)** - Complex patterns
- **[CLI & API Usage](./cli-and-api.md)** - Using these options
