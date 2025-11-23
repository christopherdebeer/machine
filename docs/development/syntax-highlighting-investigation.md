# DyGram Syntax Highlighting Investigation

**Date:** 2025-11-22
**Status:** Investigation Complete
**Next Steps:** Implementation Planning

## Executive Summary

This document provides a comprehensive investigation of DyGram's current syntax highlighting implementation across CodeMirror and Monaco editors, identifies gaps in coverage, and proposes specific improvements to enhance the developer experience.

**Key Findings:**
- Current implementation uses dual approach: pattern-based regex (CodeMirror) and AST-based semantic tokens (Monaco)
- Semantic token provider covers only 30% of syntax elements
- Significant opportunities for improvement in arrow types, annotations, templates, and imports

---

## Current Implementation Architecture

### Multi-Platform Approach

DyGram supports syntax highlighting across multiple editors:

- **CodeMirror** (web playground): Custom LSP integration with pattern-based highlighting
- **Monaco Editor** (VS Code web): TextMate grammar + Monarch syntax + LSP server
- **Langium Framework**: Central DSL grammar definition that generates platform-specific syntax files

### Key Implementation Files

| Component | File | Purpose |
|-----------|------|---------|
| **Grammar** | `src/language/machine.langium` | Complete DSL definition with terminals and rules |
| **Semantic Tokens** | `src/language/machine-semantic-token-provider.ts` | AST-based token classification for LSP |
| **CodeMirror Integration** | `src/codemirror-langium.ts` | Pattern-based highlighting + LSP features |
| **Language Module** | `src/language/machine-module.ts` | Service registration and DI configuration |
| **Config** | `langium-config.json` | Build configuration for grammar generation |

---

## Current Highlighting Coverage

### What's Currently Highlighted

**In CodeMirror (Pattern-based regex):**
- Keywords: `machine`, `state`, `task`, `tool`, `context`, `Input`, `Output`, `Task`, `Concept`, `Result`
- String literals (double-quoted)
- Node names (identifiers after keywords)
- Type annotations (content in angle brackets `<Type>`)
- Property names (identifiers before colons)

**In Semantic Token Provider (AST-based):**
- Node types → `class` token type
- Node names → `variable` token type
- Attribute names → `property` token type
- Attribute types → `type` token type
- Edge sources/targets → `variable` token type
- Edge labels → `string` token type (if string literal)

**LSP Features:**
- Diagnostics with gutter markers
- Error/warning/info underlines
- Hover tooltips
- Autocompletion
- Bracket matching
- Auto-closing pairs

---

## Missing Highlighting Elements

Based on the grammar analysis and example code, these elements lack proper highlighting:

### High-Impact Missing Features

#### Arrow Types (no differentiation between arrow semantics)
- `->` (single arrow)
- `-->` (double arrow)
- `=>` (fat arrow)
- `<|--` (inheritance)
- `*-->` (composition)
- `o-->` (aggregation)
- `<-->` (bidirectional)

#### Annotations (not in semantic provider)
- `@Abstract`, `@StrictMode`, `@Async`, `@Documentation`
- Annotation parameters: `@style(color: red;)`
- Edge annotations

#### Template Markers (recognized but not highlighted distinctly)
- `{{ userRequest.query }}` in template strings

#### Import Statements (not in semantic provider)
- `import { Symbol } from "path"`
- Import aliases: `as alias`

### Medium-Impact Missing Features

#### Multiplicities (edge cardinality markers)
- `"1" -> "0..*"` notation

#### Edge Labels (inline labels between arrow dashes)
- `-label->`, `--label-->`, `=label=>`

#### Edge Attributes (inline attributes in edge syntax)
- `-condition: true, priority: 1->`

### Low-Impact Missing Features

#### Comments (terminal exists but not in semantic provider)
- `// single-line comments`
- `/* multi-line comments */`

#### Numbers (terminal exists but not highlighted)
- Numeric literals: `10`, `0.7`, `1e-3`

#### External IDs (schema references)
- `#requestSchema`, `#outputData`

#### Qualified Names (dotted paths)
- `analysis.processing`, `parent.child`

#### Question Marks (optional type markers)
- `<Promise<Result>?>` - the `?` for optional

---

## Improvement Opportunities

### High Priority Enhancements

#### 1. Enhanced Semantic Token Provider

**File:** `src/language/machine-semantic-token-provider.ts:12`

**Current State:** Only handles 5 AST node types (Node, Attribute, Edge, EdgeSegment)

**Improvement:** Extend to cover all syntax elements

**Implementation Approach:**
- Add type guards for: `isAnnotation`, `isImportStatement`, `isPrimitiveValue`
- Extend `highlightElement()` to handle all AST node types
- Register custom semantic token types in LSP capabilities

**Benefits:**
- Accurate, AST-based highlighting (not regex)
- Consistent across CodeMirror and Monaco
- Leverages Langium's parser for correctness

#### 2. Arrow Type Differentiation

**Current:** All arrows highlighted the same (or as operators)

**Improvement:** Different visual treatment per arrow type

**CodeMirror Theme Additions:**
```typescript
'.cm-arrow-single': { color: '#d4d4d4' },      // -> (default)
'.cm-arrow-double': { color: '#4fc1ff' },      // --> (strong)
'.cm-arrow-fat': { color: '#c586c0' },         // => (transform)
'.cm-arrow-inherit': { color: '#dcdcaa' },     // <|-- (inheritance)
'.cm-arrow-compose': { color: '#4ec9b0' },     // *--> (composition)
'.cm-arrow-aggregate': { color: '#ce9178' },   // o--> (aggregation)
'.cm-arrow-bidirectional': { color: '#9cdcfe' } // <--> (bidirectional)
```

**Semantic Provider Changes:**
```typescript
if (isEdgeSegment(node)) {
    // Highlight arrow type based on endType terminal
    const arrowType = getArrowType(node.endType);
    acceptor({
        node: node,
        property: 'endType',
        type: SemanticTokenTypes.operator,
        modifier: [arrowType] // Custom modifier
    });
}
```

**Benefits:**
- Visual distinction between relationship semantics
- Easier to understand diagram intent at a glance
- Aligns with UML conventions (composition/aggregation colors)

#### 3. Annotation Highlighting

**Current:** Annotations not highlighted in semantic provider

**Improvement:** Highlight as decorators with parameters

```typescript
if (isAnnotation(node)) {
    // Highlight @ symbol and name as decorator
    acceptor({
        node: node,
        property: 'name',
        type: SemanticTokenTypes.decorator
    });

    // Highlight string value if present
    if (node.value) {
        acceptor({
            node: node,
            property: 'value',
            type: SemanticTokenTypes.string
        });
    }

    // Highlight attribute parameters if present
    if (node.attributes) {
        // Highlight each parameter name as property
        for (const param of node.attributes.params) {
            acceptor({
                node: param,
                property: 'name',
                type: SemanticTokenTypes.property
            });
        }
    }
}
```

**Benefits:**
- Annotations stand out visually
- Parameter syntax is clear
- Consistent with TypeScript/Python decorator styling

#### 4. Template String Marker Highlighting

**Current:** Template strings detected but `{{}}` markers not distinct

**Improvement:** Highlight template markers separately from string content

```typescript
// In CodeMirror semantic highlighting:
const templateMarkerRegex = /\{\{[^}]*\}\}/g;
let match;
while ((match = templateMarkerRegex.exec(code)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    builder.push(semanticMark('cm-template-marker').range(from, to));
}

// Theme:
'.cm-template-marker': {
    color: '#dcdcaa',
    fontWeight: 'bold',
    background: 'rgba(220, 220, 170, 0.1)'
}
```

**Benefits:**
- Template placeholders are immediately visible
- Helps identify dynamic vs static content
- Reduces confusion about template syntax

#### 5. Import Statement Highlighting

**Current:** Not highlighted in semantic provider

**Improvement:** Highlight import keywords, symbols, and paths

```typescript
if (isImportStatement(node)) {
    // Highlight imported symbols as namespaces/classes
    for (const symbol of node.symbols) {
        acceptor({
            node: symbol,
            property: 'name',
            type: SemanticTokenTypes.namespace
        });

        // Highlight alias if present
        if (symbol.alias) {
            acceptor({
                node: symbol,
                property: 'alias',
                type: SemanticTokenTypes.variable
            });
        }
    }

    // Highlight path as string
    acceptor({
        node: node,
        property: 'path',
        type: SemanticTokenTypes.string
    });
}
```

**Benefits:**
- Import structure is clear
- Symbol names and aliases are distinct
- Follows common IDE conventions

#### 6. Comment Highlighting

**Current:** Comments hidden in grammar but not in semantic provider

**Improvement:** Explicit comment token classification

```typescript
// Langium handles comments via hidden terminals automatically
// But we can add explicit highlighting in CodeMirror:

const commentRegex = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
let match;
while ((match = commentRegex.exec(code)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    builder.push(semanticMark('cm-semantic-comment').range(from, to));
}
```

Already defined in theme at `src/codemirror-langium.ts:388`:
```typescript
'.cm-semantic-comment': { color: '#6a9955' }
```

**Benefits:**
- Comments are visually de-emphasized
- Syntax structure is clearer without noise
- Standard convention across all IDEs

#### 7. Number and External ID Highlighting

**Current:** Defined in grammar but not highlighted

**Improvement:** Add specific highlighting

```typescript
if (isPrimitiveValue(node)) {
    const value = node.value;

    // External IDs (schema references)
    if (typeof value === 'string' && value.startsWith('#')) {
        acceptor({
            node: node,
            property: 'value',
            type: SemanticTokenTypes.macro // or custom 'extid' type
        });
    }
    // Numbers
    else if (typeof value === 'number') {
        acceptor({
            node: node,
            property: 'value',
            type: SemanticTokenTypes.number
        });
    }
}
```

**CodeMirror Theme:**
```typescript
'.cm-semantic-number': { color: '#b5cea8' },  // Already exists
'.cm-semantic-extid': { color: '#4fc1ff', fontWeight: 'bold' }  // New
```

**Benefits:**
- Numbers are visually distinct from strings
- External references (schema IDs) stand out
- Easier to spot configuration values

---

### Medium Priority Enhancements

#### 8. Edge Label Highlighting

**Current:** Edge labels in `EdgeType` union not explicitly highlighted

**Improvement:** Distinct styling for inline edge labels vs attributes

```typescript
if (isEdgeSegment(node)) {
    // Highlight inline labels
    if (node.label) {
        for (const labelItem of node.label) {
            if (isEdgeAttribute(labelItem)) {
                // Highlight as edge metadata
                acceptor({
                    node: labelItem,
                    property: 'text',
                    type: SemanticTokenTypes.parameter
                });
            }
        }
    }
}
```

#### 9. Qualified Name Highlighting

**Current:** Qualified names (e.g., `parent.child`) treated as single identifier

**Improvement:** Highlight each segment

```typescript
// Pattern-based approach in CodeMirror:
const qualifiedNameRegex = /\b([A-Za-z_]\w*)(\.[A-Za-z_]\w*)+\b/g;
let match;
while ((match = qualifiedNameRegex.exec(code)) !== null) {
    // Highlight with special class for dotted paths
    builder.push(semanticMark('cm-qualified-name').range(match.index, match.index + match[0].length));
}

// Theme:
'.cm-qualified-name': {
    color: '#9cdcfe',
    fontStyle: 'italic'
}
```

#### 10. Multiplicity Highlighting

**Current:** Multiplicities are strings but not semantically distinct

**Improvement:** Highlight cardinality markers specially

```typescript
if (isEdgeSegment(node)) {
    if (node.sourceMultiplicity) {
        acceptor({
            node: node,
            property: 'sourceMultiplicity',
            type: SemanticTokenTypes.parameter
        });
    }
    if (node.targetMultiplicity) {
        acceptor({
            node: node,
            property: 'targetMultiplicity',
            type: SemanticTokenTypes.parameter
        });
    }
}
```

---

### Low Priority / Polish

#### 11. Bracket Pair Colorization

Leverage CodeMirror's bracket matching for nested structures:

```typescript
import { bracketMatching } from '@codemirror/language';

// In editor configuration (already present):
bracketMatching()  // Already enabled

// Consider adding rainbow brackets:
import { rainbowBrackets } from '@codemirror/rainbow-brackets';
rainbowBrackets()
```

#### 12. Indentation Guides

For nested node/edge structures:

```typescript
import { indentationMarkers } from '@replit/codemirror-indentation-markers';

// Add to extensions:
indentationMarkers()
```

---

## Technical Implementation Plan

### Phase 1: Enhance Semantic Token Provider (High Impact)

**Files to modify:**
- `src/language/machine-semantic-token-provider.ts`

**Changes:**
1. Add type guards for all AST node types
2. Extend `highlightElement()` with new cases
3. Add semantic token modifiers for arrow types
4. Register custom token types if needed

**Expected Outcome:**
- All syntax elements classified correctly
- Consistent highlighting across editors

---

### Phase 2: Improve CodeMirror Pattern Matching (Quick Wins)

**Files to modify:**
- `src/codemirror-langium.ts`

**Changes:**
1. Add comment regex to `buildDecorations()`
2. Add template marker regex
3. Add external ID regex
4. Add arrow type differentiation

**Expected Outcome:**
- Immediate visual improvements in web playground
- Better syntax readability

---

### Phase 3: Theme Refinement (Polish)

**Files to modify:**
- `src/codemirror-langium.ts` (semanticHighlightTheme)

**Changes:**
1. Add new CSS classes for arrow types
2. Add template marker styling
3. Add external ID styling
4. Refine existing colors for contrast

**Expected Outcome:**
- Professional, polished appearance
- Excellent visual hierarchy

---

### Phase 4: Monaco/TextMate Generation (Automated)

**Files affected:**
- `syntaxes/machine.tmLanguage.json` (generated)
- `src/syntaxes/machine.monarch.ts` (generated)

**Changes:**
Run Langium CLI after semantic provider changes:

```bash
npm run langium:generate
```

**Expected Outcome:**
- Monaco editor inherits improvements automatically
- VS Code extension benefits from enhanced grammar

---

## Semantic Highlighting Best Practices

### LSP Semantic Token Types (Standard)

DyGram currently uses these standard LSP token types:

| Token Type | Usage in DyGram |
|------------|-----------------|
| `class` | Node types |
| `variable` | Node names, edge sources/targets |
| `property` | Attribute names |
| `type` | Type annotations |
| `string` | String literals, edge labels |
| `keyword` | Keywords (via pattern matching) |
| `comment` | Comments |
| `number` | Numeric literals |
| `operator` | Arrow operators |

### Potential Custom Token Types

Consider registering custom types for DyGram-specific elements:

```typescript
enum CustomSemanticTokenTypes {
    annotation = 'annotation',
    edgeLabel = 'edgeLabel',
    multiplicity = 'multiplicity',
    templateMarker = 'templateMarker',
    externalId = 'externalId',
    arrowType = 'arrowType'
}
```

**Benefits:**
- Precise semantic classification
- Theme customization per element
- Future-proof for advanced features

---

## Comparison: Current vs. Improved

### Current Implementation

```dygram
machine "Demo" @StrictMode          // @StrictMode not highlighted
// Comment not highlighted specially
Input request {                     // Input highlighted, request highlighted
    query: "test";                  // query highlighted, "test" highlighted
    schema: #extSchema;             // #extSchema NOT highlighted specially
};

Task analyze "Analyze" {            // All highlighted
    prompt: "Process {{ request.query }}";  // {{ }} NOT highlighted specially
};

request -> analyze;                 // -> not distinguished from other arrows
analyze => result;                  // => looks same as ->
Child <|-- Parent;                  // <|-- looks same as ->
```

### Improved Implementation

```dygram
machine "Demo" @StrictMode          // @StrictMode highlighted as decorator (purple)
// Comment highlighted in green, de-emphasized
Input request {                     // Input: keyword (blue), request: variable (light blue)
    query: "test";                  // query: property (purple), "test": string (orange)
    schema: #extSchema;             // #extSchema: external ID (bright cyan, bold)
};

Task analyze "Analyze" {            // Task: keyword (blue), analyze: variable (light blue)
    prompt: "Process {{ request.query }}";  // {{ }}: template marker (yellow, bold background)
};

request -> analyze;                 // ->: default arrow (gray)
analyze => result;                  // =>: fat arrow (purple) - visually distinct
Child <|-- Parent;                  // <|-- inheritance arrow (yellow) - clearly different
```

---

## Summary of Recommendations

| Priority | Enhancement | Impact | Effort |
|----------|-------------|--------|--------|
| **HIGH** | Enhance semantic token provider | Very High | Medium |
| **HIGH** | Arrow type differentiation | High | Low |
| **HIGH** | Annotation highlighting | High | Medium |
| **HIGH** | Template marker highlighting | High | Low |
| **HIGH** | Import statement highlighting | Medium | Medium |
| **HIGH** | Comment highlighting | Medium | Low |
| **HIGH** | Number & external ID highlighting | Medium | Low |
| **MEDIUM** | Edge label highlighting | Medium | Medium |
| **MEDIUM** | Qualified name highlighting | Low | Low |
| **MEDIUM** | Multiplicity highlighting | Low | Low |
| **LOW** | Bracket pair colorization | Low | Very Low |
| **LOW** | Indentation guides | Low | Very Low |

---

## Key Files Reference

Here are the exact file paths for implementation:

- **Semantic Token Provider**: `src/language/machine-semantic-token-provider.ts:12`
- **CodeMirror Integration**: `src/codemirror-langium.ts:514`
- **Semantic Theme**: `src/codemirror-langium.ts:381`
- **Langium Grammar**: `src/language/machine.langium:1`
- **Language Module**: `src/language/machine-module.ts:38`
- **Generated AST Types**: `src/language/generated/ast.ts` (generated)

---

## Next Steps

1. **Review and approve** this investigation with stakeholders
2. **Create implementation tickets** for each priority level
3. **Start with Phase 1** (semantic token provider enhancements)
4. **Test incrementally** with existing examples
5. **Update documentation** as features are implemented
6. **Gather user feedback** on visual hierarchy and color choices

---

## Related Documents

- [Langium Documentation](https://langium.org/docs/reference/semantic-highlighting/)
- [LSP Semantic Tokens Specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens)
- [CodeMirror 6 Documentation](https://codemirror.net/docs/)
- Grammar Reference: `src/language/machine.langium`
- Syntax Documentation: `docs/syntax/`
