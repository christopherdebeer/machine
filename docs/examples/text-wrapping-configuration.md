# Text Wrapping Configuration

This guide explains how to configure text wrapping in Graphviz diagrams to control how long text is broken across multiple lines.

## Overview

The Graphviz diagram generator automatically wraps long text to prevent layout issues and improve readability. You can customize the wrapping behavior by adding configuration attributes to your machine definition.

## Configuration Attributes

Add these attributes to your machine definition to override the default text wrapping lengths:

```dy examples/text-wrapping/overview.dygram
machine "MyMachine"
// Edge and multiplicity wrapping
maxEdgeLabelLength: 50          // Default: 40 characters
maxMultiplicityLength: 25       // Default: 20 characters

// Attribute wrapping  
maxAttributeKeyLength: 30       // Default: 25 characters
maxAttributeValueLength: 40     // Default: 30 characters

// Content wrapping
maxNodeTitleLength: 50          // Default: 40 characters
maxNoteContentLength: 50        // Default: 40 characters

// Your nodes and edges here...

```

## What Gets Wrapped

### Edge Labels
Long edge labels are wrapped at word boundaries using `\n` line breaks:

```dy examples/text-wrapping/edge-labels.dygram
machine "EdgeWrappingExample"
maxEdgeLabelLength: 20  // Short wrapping for demo

nodeA -"This is a very long edge label that will be wrapped"-> nodeB

```

### Edge Multiplicity
Source and target multiplicity labels are wrapped:

```dy examples/text-wrapping/multiplicity.dygram
machine "MultiplicityExample"
maxMultiplicityLength: 15

nodeA "0..many items" -> "1..single item" nodeB;
```

### Attribute Keys and Values
Both attribute names and values support wrapping:

```dy examples/text-wrapping/attribute.dygram
machine "AttributeWrappingExample"
maxAttributeKeyLength: 15
maxAttributeValueLength: 25

context Node {
  veryLongAttributeName: "This is a very long attribute value that will be wrapped across multiple lines"
  shortAttr: "short value"
}

```

### Node Titles and Descriptions
Node titles and descriptions are wrapped for readability:

```dy examples/text-wrapping/node-title.dygram
machine "NodeTitleExample"
maxNodeTitleLength: 25

longTitleNode "This is a very long node title that will be wrapped" {
  description: "And this is a long description that will also be wrapped"
}

```

## Advanced Features

### JSON Formatting
JSON strings in attribute values are automatically detected and pretty-formatted:

```dy
machine "JsonExample"
configNode {
  settings: '{"theme":"dark","features":{"notifications":true,"analytics":false}}'
}
```

### Multiline String Preservation
Existing line breaks in multiline strings are preserved:

```dy examples/text-wrapping/multiline.dygram
machine "MultilineExample"
instructionNode {
    steps: "Step 1: Initialize
    Step 2: Configure
    Step 3: Execute"
}
```

### Force Breaking Long Unbroken Text
Long URLs, hashes, or identifiers without spaces are automatically broken:

```dy examples/text-wrapping/force.dygram
machine "ForceBreakExample"
maxAttributeValueLength: 20

urlNode {
  endpoint: "https://api.example.com/very/long/path/that/exceeds/maximum/length"
  hash: "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567"
}

```

## Best Practices

1. **Start with defaults** - The default values work well for most diagrams
2. **Adjust for content** - If you have consistently long text, increase the limits
3. **Consider readability** - Very short limits can make text hard to read
4. **Test your diagrams** - Generate diagrams to see how the wrapping looks



## Technical Details

- **HTML labels** use `<br/>` tags for line breaks (nodes, attributes, notes)
- **DOT labels** use `\n` escape sequences (edges, multiplicity)
- **Word boundaries** are preserved when possible
- **Force breaking** handles long unbroken strings
- **JSON detection** automatically formats valid JSON strings
- **Left alignment** is enforced at multiple levels for consistency

The text wrapping system ensures your diagrams remain readable regardless of content length while giving you full control over the formatting through machine-level attributes.
