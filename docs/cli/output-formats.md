# Output Formats

DyGram CLI supports multiple output formats for different use cases.

## Available Formats

### JSON Format

**Extension:** `.json`

**Commands:** `generate`, `batch`, `execute` (with `--format json`)

**Description:** Structured JSON representation of the machine graph.

**Use Cases:**
- Programmatic processing
- API integration
- State analysis
- Debugging

**Example:**
```bash
dy generate workflow.dy --format json
```

**Output Structure:**
```json
{
  "name": "WorkflowMachine",
  "nodes": [
    {
      "type": "State",
      "name": "Start",
      "edges": [...]
    }
  ],
  "edges": [...],
  "metadata": {...}
}
```

---

### HTML Format

**Extension:** `.html`

**Commands:** `generate`, `batch`

**Description:** Interactive HTML visualization with embedded JavaScript.

**Use Cases:**
- Shareable visualizations
- Presentations
- Web integration
- Documentation

**Example:**
```bash
dy generate workflow.dy --format html
```

**Features:**
- Interactive node exploration
- Zoom and pan
- Embedded visualization library
- Self-contained (no external dependencies)

**Tip:** Open HTML files directly in a browser for interactive diagrams.

---

### Graphviz/DOT Format

**Extension:** `.dot`

**Commands:** `generate`, `batch`, `execute` (with `--format dot`)

**Description:** DOT language for Graphviz rendering.

**Use Cases:**
- Complex visualizations
- Large graphs
- Custom styling
- Print-quality diagrams

**Example:**
```bash
dy generate workflow.dy --format dot
dot -Tpng workflow.dot -o workflow.png
```

**Rendering Options:**
```bash
# PNG
dot -Tpng workflow.dot -o workflow.png

# SVG
dot -Tsvg workflow.dot -o workflow.svg

# PDF
dot -Tpdf workflow.dot -o workflow.pdf
```

---

### DSL Format

**Extension:** `.dy`

**Commands:** `generate` only (backward compilation)

**Description:** Generate DyGram source from JSON.

**Requirements:** Input must be a JSON file

**Use Cases:**
- Round-trip transformation
- Programmatic generation
- Format migration
- Code generation

**Example:**
```bash
dy generate workflow.json --format dsl
```

**Note:** This is backward compilation - converting JSON back to DyGram source code.

---

### SVG Format

**Extension:** `.svg`

**Commands:** `execute` (with `--format svg`)

**Description:** Vector graphics format for runtime state visualization.

**Use Cases:**
- Runtime state diagrams
- Execution snapshots
- Documentation
- Presentations

**Example:**
```bash
dy exec show exec-20251203-143022 --format svg > state.svg
```

---

## Format Comparison

### By Command

**generate command:**
- JSON ✅
- HTML ✅
- Graphviz/DOT ✅
- DSL ✅ (requires JSON input)
- SVG ❌

**batch command:**
- JSON ✅
- HTML ✅
- Graphviz/DOT ✅
- DSL ❌
- SVG ❌

**execute command:**
- JSON ✅
- HTML ❌
- Graphviz/DOT ✅
- DSL ❌
- SVG ✅

### By Use Case

**For Visualization:**
- HTML (interactive, web-based)
- Graphviz/DOT (high-quality, customizable)
- SVG (vector graphics, scalable)

**For Processing:**
- JSON (structured data, programmatic access)

**For Code Generation:**
- DSL (backward compilation from JSON)

## Format Selection Guide

### Choose JSON when:
- Building tools that process machines
- Integrating with APIs
- Analyzing machine structure
- Debugging

### Choose HTML when:
- Sharing visualizations
- Creating presentations
- Embedding in documentation
- Quick visual inspection

### Choose Graphviz/DOT when:
- Creating print-quality diagrams
- Customizing visualization style
- Handling large/complex graphs
- Generating multiple output formats

### Choose DSL when:
- Converting JSON back to source
- Programmatically generating machines
- Migrating between formats

### Choose SVG when:
- Capturing runtime state visually
- Creating execution snapshots
- Embedding in documentation

## Multiple Formats

Generate multiple formats at once:

```bash
# Generate JSON and HTML
dy generate workflow.dy --format json,html

# Generate all visualization formats
dy generate workflow.dy --format json,html,dot

# Batch processing with multiple formats
dy batch "src/**/*.dy" --format json,html,dot
```

## Output Locations

### Default Behavior

Files are generated in the same directory as the source file:

```bash
dy generate workflow.dy --format json,html
# Creates:
#   workflow.json
#   workflow.html
```

### Custom Destination

Use `--destination` to specify output directory:

```bash
dy generate workflow.dy --format json,html --destination ./output
# Creates:
#   ./output/workflow.json
#   ./output/workflow.html
```

## Deprecated Formats

### Mermaid Format (Removed)

The Mermaid format is no longer supported. Use HTML or Graphviz/DOT instead:

- For web-based visualization: Use HTML format
- For diagram generation: Use Graphviz/DOT format

## Related Documentation

- [generate Command](./commands/generate.md)
- [batch Command](./commands/batch.md)
- [execute Command](./commands/execute.md)
- [CLI Reference](./README.md)
