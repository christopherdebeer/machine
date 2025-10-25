# Styling and Validation

StrictMode, warning visualization, and diagram controls.

## StrictMode Annotation

Enable strict validation to catch errors early:

```dygram
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

```dygram
machine "Strict Validation" @StrictMode

Task start "Start";

// ERROR: 'undefined_node' not declared
start -> undefined_node;  // This will cause a validation error
```

### Non-Strict Mode (Default)

```dygram
machine "Lenient Machine"

Task start "Start";

// Auto-creates 'undefined_node' as a generic node
start -> undefined_node;  // This works, node is auto-created
```

## Warning Visualization

Control how validation warnings appear in diagrams:

### Inline Warning Mode

Warnings shown in node styling:

```dygram
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

```dygram
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

Control graph layout direction:

### Default Top-to-Bottom

```dygram
machine "Top to Bottom"

Task a "A";
Task b "B";
Task c "C";

a -> b -> c;

// Renders vertically by default (TB - Top to Bottom)
```

### Overriding Direction

Currently, the default direction is `TB` (top-to-bottom), set in `graphviz-dot-diagram.ts:393` and `467`.

**Note**: Direct override of `rankdir` in nested subgraphs is not yet exposed as a DSL feature. This is a documented gap - see below.

### Programmatic Direction (Future)

Planned support for direction attributes:

```dygram
machine "Custom Direction"

// Future syntax (not yet implemented):
Process horizontal @Direction("LR") {
    Task a -> Task b -> Task c;
};

Process vertical @Direction("TB") {
    Task d -> Task e -> Task f;
};
```

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

```dygram
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

Custom edge styling with annotations:

```dygram
machine "Styled Edges"

Task start "Start";
Task critical "Critical Path";
Task optional "Optional";
Task end "End";

// Critical path in red
start -@style("color: red; stroke-width: 4px")-> critical;

// Optional path in gray, dashed
start -@style("color: gray; stroke-dasharray: 5,5")-> optional;

// Normal path
critical -> end;
optional -> end;
```

Edge styling properties:
- `color`: Edge color
- `stroke-width`: Line thickness
- `stroke-dasharray`: Dashed lines (e.g., `5,5`)
- Standard CSS/SVG styling properties

## Validation Context Integration

Using validation context in diagrams:

```typescript
import { ValidationContext } from 'dygram';

const validationContext = new ValidationContext();
// ... validation occurs, warnings/errors collected ...

const options: DiagramOptions = {
    validationContext: validationContext,
    showValidationWarnings: true,
    warningMode: 'both',
    minSeverity: 'warning'
};

const dot = generateGraphvizFromJSON(machineJson, options);
```

## Documented Gaps

### 1. Nested Diagram Direction Override

**Current State**: All subgraphs use the parent's `rankdir` (currently hardcoded to `TB`).

**Desired Feature**:
```dygram
machine "Mixed Directions"

Process vertical @Direction("TB") {
    Task a -> Task b -> Task c;
};

Process horizontal @Direction("LR") {
    Task x -> Task y -> Task z;
};
```

**Implementation Need**: Add support for direction attributes/annotations on `Process` nodes that override the subgraph `rankdir` in Graphviz generation.

### 2. Node Styling Annotations

**Status**: ✅ **IMPLEMENTED**

Inline style annotations are now supported for both nodes and edges using the `@Style` annotation:

```dygram
// String syntax
Task important @Style("fillcolor: yellow; shape: box") {
    prompt: "Important task";
};

// Attribute syntax (NEW)
Task critical @Style(fillcolor: red, color: white, penwidth: 3) {
    prompt: "Critical task";
};

// Edge inline styling
Task start;
Task end;
start -@Style(color: blue, penwidth: 4)-> end;
```

See [Custom Styling](../styling.md#inline-style-annotations) for full documentation.

### 3. Global Styling Themes

**Desired Feature**: Machine-level styling presets
```dygram
machine "Themed" @Theme("dark") @Palette("colorblind-safe")
```

## Next Steps

- **[Attributes & Types](./attributes-and-types.md)** - Type systems and schemas
- **[Advanced Features](./advanced-features.md)** - Complex patterns
- **[CLI & API Usage](./cli-and-api.md)** - Using these options
