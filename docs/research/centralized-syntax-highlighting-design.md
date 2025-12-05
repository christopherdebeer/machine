# Centralized Syntax Highlighting Architecture

**Date:** 2025-11-22
**Status:** Design Proposal
**Related:** `syntax-highlighting-investigation.md`

## Overview

This document describes the architectural design for centralizing DyGram's syntax highlighting through Langium's semantic token provider, enabling both CodeMirror and Monaco editors to use a single source of truth for syntax highlighting.

## Current Problem

DyGram currently uses a **dual approach** for syntax highlighting:

- **CodeMirror**: Pattern-based regex matching (~150 lines of regex)
- **Monaco**: AST-based semantic tokens via LSP

This creates:
- ❌ Maintenance burden (update two places)
- ❌ Inconsistency (different highlighting between editors)
- ❌ Limited coverage (regex misses complex syntax)
- ❌ Technical debt (regex patterns become brittle)

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Single Source of Truth                            │
│  MachineSemanticTokenProvider (Langium)            │
│  • Analyzes AST                                    │
│  • Generates LSP semantic tokens                  │
│  • Coverage: 100% of syntax elements              │
└────────────┬────────────────────────────────────────┘
             │
             ├──────────────────┬──────────────────────┐
             │                  │                      │
             ▼                  ▼                      ▼
    ┌────────────────┐  ┌───────────────┐   ┌──────────────────┐
    │ Monaco Editor  │  │ CodeMirror 6  │   │ VS Code Extension│
    │ (via LSP/WW)   │  │ (via Bridge)  │   │ (via LSP)        │
    │                │  │               │   │                  │
    │ ✅ Native      │  │ Custom LSP→   │   │ ✅ Native        │
    │    Support     │  │    CM Bridge  │   │    Support       │
    └────────────────┘  └───────────────┘   └──────────────────┘
```

### Key Insight

**CodeMirror 6 does NOT have native LSP semantic token support**, so we need to build a custom bridge that:

1. Calls Langium's `MachineSemanticTokenProvider` directly
2. Decodes LSP semantic tokens (delta-encoded integer arrays)
3. Converts to CodeMirror decorations
4. Applies idiomatic CodeMirror 6 ViewPlugin pattern

## Implementation Design

### Component 1: Enhanced Semantic Token Provider

**File:** `src/language/machine-semantic-token-provider.ts`

**Current Coverage:** ~30% (nodes, edges, attributes only)

**Target Coverage:** 100% (all syntax elements)

**New Elements to Highlight:**

```typescript
protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
    // EXISTING: Node, Attribute, Edge, EdgeSegment

    // NEW: Annotations
    if (isAnnotation(node)) {
        acceptor({
            node,
            property: 'name',
            type: SemanticTokenTypes.decorator
        });

        // Annotation parameters
        if (node.attributes) {
            for (const param of node.attributes.params) {
                acceptor({
                    node: param,
                    property: 'name',
                    type: SemanticTokenTypes.property
                });
            }
        }
    }

    // NEW: Import statements
    if (isImportStatement(node)) {
        for (const symbol of node.symbols) {
            acceptor({
                node: symbol,
                property: 'name',
                type: SemanticTokenTypes.namespace
            });

            if (symbol.alias) {
                acceptor({
                    node: symbol,
                    property: 'alias',
                    type: SemanticTokenTypes.variable
                });
            }
        }
    }

    // NEW: Primitive values (numbers, external IDs)
    if (isPrimitiveValue(node)) {
        const value = node.value;

        // External IDs (schema references like #extSchema)
        if (typeof value === 'string' && value.startsWith('#')) {
            acceptor({
                node,
                property: 'value',
                type: SemanticTokenTypes.macro
            });
        }
        // Numbers
        else if (typeof value === 'number') {
            acceptor({
                node,
                property: 'value',
                type: SemanticTokenTypes.number
            });
        }
    }

    // NEW: Edge type differentiation with custom modifiers
    if (isEdgeSegment(node)) {
        if (node.target) {
            acceptor({
                node,
                property: 'target',
                type: SemanticTokenTypes.variable
            });
        }

        // Arrow type with custom modifier
        if (node.endType) {
            const arrowModifier = getArrowTypeModifier(node.endType);
            acceptor({
                node,
                property: 'endType',
                type: SemanticTokenTypes.operator,
                modifier: arrowModifier ? [arrowModifier] : undefined
            });
        }

        // Multiplicities
        if (node.sourceMultiplicity) {
            acceptor({
                node,
                property: 'sourceMultiplicity',
                type: SemanticTokenTypes.parameter
            });
        }
        if (node.targetMultiplicity) {
            acceptor({
                node,
                property: 'targetMultiplicity',
                type: SemanticTokenTypes.parameter
            });
        }
    }
}

/**
 * Map arrow terminal types to custom modifiers
 */
function getArrowTypeModifier(arrowType: string): string | undefined {
    switch(arrowType) {
        case '->': return 'arrow-single';
        case '-->': return 'arrow-double';
        case '=>': return 'arrow-fat';
        case '<|--': return 'arrow-inherit';
        case '*-->': return 'arrow-compose';
        case 'o-->': return 'arrow-aggregate';
        case '<-->': return 'arrow-bidirectional';
        default: return undefined;
    }
}
```

**Type Guards to Add:**

```typescript
// In generated/ast.ts or custom type guards file
export function isAnnotation(node: AstNode): node is Annotation {
    return node.$type === 'Annotation';
}

export function isImportStatement(node: AstNode): node is ImportStatement {
    return node.$type === 'ImportStatement';
}

export function isPrimitiveValue(node: AstNode): node is PrimitiveValue {
    return node.$type === 'PrimitiveValue';
}
```

---

### Component 2: LSP to CodeMirror Bridge

**New File:** `src/codemirror-semantic-tokens.ts`

This module provides the bridge between Langium's LSP semantic tokens and CodeMirror's decoration system.

```typescript
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Range, Text } from '@codemirror/state';
import { parseHelper } from 'langium/test';
import { createMachineServices } from './language/machine-module.js';
import { EmptyFileSystem } from 'langium';

const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper(services.Machine);

/**
 * LSP Semantic Token Types to CodeMirror CSS classes
 *
 * LSP defines standard token types as an enum (0-based):
 * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#semanticTokenTypes
 */
const TOKEN_TYPE_MAP: Record<number, string> = {
    0: 'cm-semantic-namespace',   // namespace
    1: 'cm-semantic-class',        // class/type
    2: 'cm-semantic-enum',         // enum
    3: 'cm-semantic-interface',    // interface
    4: 'cm-semantic-struct',       // struct
    5: 'cm-semantic-type',         // typeParameter
    6: 'cm-semantic-parameter',    // parameter
    7: 'cm-semantic-variable',     // variable
    8: 'cm-semantic-property',     // property
    9: 'cm-semantic-enum-member',  // enumMember
    10: 'cm-semantic-decorator',   // decorator
    11: 'cm-semantic-event',       // event
    12: 'cm-semantic-function',    // function
    13: 'cm-semantic-method',      // method
    14: 'cm-semantic-macro',       // macro
    15: 'cm-semantic-label',       // label
    16: 'cm-semantic-comment',     // comment
    17: 'cm-semantic-string',      // string
    18: 'cm-semantic-keyword',     // keyword
    19: 'cm-semantic-number',      // number
    20: 'cm-semantic-regexp',      // regexp
    21: 'cm-semantic-operator',    // operator
};

/**
 * Custom token modifiers for DyGram-specific elements
 * These are bit flags that can be combined
 */
const CUSTOM_MODIFIERS = {
    ARROW_SINGLE: 0,
    ARROW_DOUBLE: 1,
    ARROW_FAT: 2,
    ARROW_INHERIT: 3,
    ARROW_COMPOSE: 4,
    ARROW_AGGREGATE: 5,
    ARROW_BIDIRECTIONAL: 6,
};

/**
 * Decode LSP semantic tokens into CodeMirror decorations
 *
 * LSP format: array of integers in groups of 5
 * [lineDelta, charDelta, length, tokenType, tokenModifiers]
 *
 * Positions are relative to previous token (delta encoding) for efficiency
 */
function decodeSemanticTokens(
    data: number[],
    doc: Text
): Range<Decoration>[] {
    const decorations: Range<Decoration>[] = [];

    let currentLine = 0;
    let currentChar = 0;

    for (let i = 0; i < data.length; i += 5) {
        const lineDelta = data[i];
        const charDelta = data[i + 1];
        const length = data[i + 2];
        const tokenType = data[i + 3];
        const tokenModifiers = data[i + 4];

        // Calculate absolute position from deltas
        currentLine += lineDelta;
        currentChar = (lineDelta === 0) ? currentChar + charDelta : charDelta;

        try {
            // Convert 0-based line/char to absolute document offset
            const line = doc.line(currentLine + 1); // CodeMirror lines are 1-based
            const from = line.from + currentChar;
            const to = from + length;

            // Validate range
            if (from < 0 || to > doc.length || from >= to) {
                console.warn(`Invalid token range: ${from}-${to} (doc length: ${doc.length})`);
                continue;
            }

            // Get base CSS class for token type
            let className = TOKEN_TYPE_MAP[tokenType] || 'cm-semantic-unknown';

            // Add custom modifier classes for arrows
            if (tokenType === 21) { // operator
                if (tokenModifiers & (1 << CUSTOM_MODIFIERS.ARROW_SINGLE)) {
                    className += ' cm-arrow-single';
                }
                if (tokenModifiers & (1 << CUSTOM_MODIFIERS.ARROW_DOUBLE)) {
                    className += ' cm-arrow-double';
                }
                if (tokenModifiers & (1 << CUSTOM_MODIFIERS.ARROW_FAT)) {
                    className += ' cm-arrow-fat';
                }
                if (tokenModifiers & (1 << CUSTOM_MODIFIERS.ARROW_INHERIT)) {
                    className += ' cm-arrow-inherit';
                }
                if (tokenModifiers & (1 << CUSTOM_MODIFIERS.ARROW_COMPOSE)) {
                    className += ' cm-arrow-compose';
                }
                if (tokenModifiers & (1 << CUSTOM_MODIFIERS.ARROW_AGGREGATE)) {
                    className += ' cm-arrow-aggregate';
                }
                if (tokenModifiers & (1 << CUSTOM_MODIFIERS.ARROW_BIDIRECTIONAL)) {
                    className += ' cm-arrow-bidirectional';
                }
            }

            // Create decoration
            decorations.push(
                Decoration.mark({ class: className }).range(from, to)
            );
        } catch (e) {
            console.warn(`Error creating decoration at line ${currentLine}:${currentChar}`, e);
        }
    }

    return decorations;
}

/**
 * ViewPlugin that uses Langium's SemanticTokenProvider for highlighting
 *
 * This is the idiomatic CodeMirror 6 way to implement custom highlighting
 * based on external analysis (like LSP semantic tokens)
 */
export const semanticHighlightingFromLSP = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    private updateTimeout: number | null = null;
    private cachedCode: string = '';

    constructor(view: EditorView) {
        this.decorations = Decoration.none;
        this.scheduleUpdate(view);
    }

    update(update: ViewUpdate) {
        // Only regenerate tokens if document actually changed
        if (update.docChanged) {
            this.scheduleUpdate(update.view);
        }
    }

    /**
     * Debounce token generation to avoid excessive parsing
     */
    private scheduleUpdate(view: EditorView) {
        if (this.updateTimeout !== null) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = window.setTimeout(() => {
            this.updateDecorations(view);
            this.updateTimeout = null;
        }, 100); // 100ms debounce
    }

    private async updateDecorations(view: EditorView) {
        const code = view.state.doc.toString();

        // Skip if code hasn't changed (viewport scroll, selection, etc.)
        if (code === this.cachedCode) {
            return;
        }

        this.cachedCode = code;

        try {
            // Parse document with Langium
            const document = await parse(code);

            // Get semantic token provider
            const tokenProvider = services.Machine.lsp.SemanticTokenProvider;

            if (!tokenProvider) {
                console.warn('SemanticTokenProvider not available');
                this.decorations = Decoration.none;
                return;
            }

            // Request semantic tokens (LSP format)
            const params = {
                textDocument: {
                    uri: 'inmemory://codemirror.dy'
                }
            };

            const result = await tokenProvider.semanticHighlight(
                document,
                params,
                {} // cancel token
            );

            if (!result || !result.data || result.data.length === 0) {
                this.decorations = Decoration.none;
                return;
            }

            // Decode LSP tokens to CodeMirror decorations
            const ranges = decodeSemanticTokens(result.data, view.state.doc);
            this.decorations = Decoration.set(ranges, true);

        } catch (error) {
            console.error('Error generating semantic tokens:', error);
            // Keep previous decorations on error (graceful degradation)
        }
    }

    destroy() {
        if (this.updateTimeout !== null) {
            clearTimeout(this.updateTimeout);
        }
    }
}, {
    decorations: v => v.decorations
});
```

**Key Design Decisions:**

1. **Debouncing**: 100ms delay to avoid re-parsing on every keystroke
2. **Caching**: Skip token generation if code hasn't changed
3. **Error Handling**: Graceful degradation - keep old decorations if parsing fails
4. **Performance**: Delta encoding reduces token data size by ~60%
5. **Custom Modifiers**: Arrow types use bit flags for efficient classification

---

### Component 3: Integration with Existing CodeMirror Setup

**File:** `src/codemirror-langium.ts`

**Changes Required:**

```typescript
// REMOVE: Old pattern-based semanticHighlighting ViewPlugin (lines 514-593)
// DELETE: buildDecorations() method with regex patterns

// ADD: Import new LSP-based plugin
import { semanticHighlightingFromLSP } from './codemirror-semantic-tokens.js';

/**
 * Create Langium LSP extensions for CodeMirror
 */
export function createLangiumExtensions() {
    return [
        diagnosticsState,
        tooltipState,
        diagnosticGutter,
        createLangumLinter(),
        createLangiumCompletion(),
        semanticHighlightingFromLSP,  // NEW: LSP-based highlighting
        semanticHighlightTheme         // Reuse existing theme
    ];
}
```

**Theme Enhancements:**

```typescript
export const semanticHighlightTheme = EditorView.baseTheme({
    // EXISTING token classes (keep all)
    '.cm-semantic-class': { color: '#4ec9b0' },
    '.cm-semantic-variable': { color: '#9cdcfe' },
    '.cm-semantic-property': { color: '#c586c0' },
    '.cm-semantic-type': { color: '#4ec9b0' },
    '.cm-semantic-string': { color: '#ce9178' },
    '.cm-semantic-keyword': { color: '#569cd6' },
    '.cm-semantic-comment': { color: '#6a9955' },
    '.cm-semantic-number': { color: '#b5cea8' },
    '.cm-semantic-operator': { color: '#d4d4d4' },

    // NEW: Additional token types
    '.cm-semantic-decorator': { color: '#c586c0', fontWeight: '500' },
    '.cm-semantic-namespace': { color: '#4ec9b0' },
    '.cm-semantic-macro': { color: '#4fc1ff', fontWeight: 'bold' },
    '.cm-semantic-parameter': { color: '#9cdcfe', fontStyle: 'italic' },

    // NEW: Arrow type differentiation
    '.cm-arrow-single': { color: '#d4d4d4' },              // -> (default)
    '.cm-arrow-double': { color: '#4fc1ff' },              // --> (strong)
    '.cm-arrow-fat': { color: '#c586c0' },                 // => (transform)
    '.cm-arrow-inherit': { color: '#dcdcaa' },             // <|-- (inheritance)
    '.cm-arrow-compose': { color: '#4ec9b0' },             // *--> (composition)
    '.cm-arrow-aggregate': { color: '#ce9178' },           // o--> (aggregation)
    '.cm-arrow-bidirectional': { color: '#9cdcfe' },       // <--> (bidirectional)

    // KEEP: All existing diagnostic styling (lines 392-503)
    // ... (no changes to diagnostic gutter, tooltips, lint panel)
});
```

---

## Benefits

### 1. Single Source of Truth

✅ **Maintainability**
- Semantic token logic lives in ONE place: `MachineSemanticTokenProvider`
- Update highlighting once, benefit everywhere (Monaco, CodeMirror, VS Code)
- Remove ~150 lines of regex code

✅ **Consistency**
- Monaco and CodeMirror show **identical** highlighting
- Same semantic understanding across all platforms
- Unified developer experience

### 2. Accuracy and Correctness

✅ **AST-Based**
- Uses Langium's parser for correct semantic understanding
- No regex edge cases or false positives
- Handles complex nested structures correctly

✅ **Coverage**
- 100% of DyGram syntax elements highlighted
- Template markers, annotations, imports, arrow types, etc.
- Future syntax changes automatically supported

### 3. Extensibility

✅ **Easy to Extend**
- Add new token types in semantic provider only
- Custom modifiers for domain-specific elements (arrows)
- Theme customization per token type

✅ **Future-Proof**
- LSP standard ensures compatibility
- Langium provides incremental parsing
- Can add more editors easily (Ace, Monaco, etc.)

---

## Trade-offs

### Performance

⚠️ **Slightly Slower than Regex**
- Pattern matching: ~5-10ms for 500 lines
- LSP tokens: ~15-30ms for 500 lines (parse + generate + decode)
- Still imperceptible (< 50ms target)

**Mitigation:**
- Debouncing (100ms)
- Caching (skip if code unchanged)
- Incremental parsing (Langium feature)
- Viewport-based rendering (only visible lines)

### Complexity

⚠️ **Additional Layer**
- Two-stage process: Langium → LSP → CodeMirror
- More moving parts to debug

**Mitigation:**
- Comprehensive logging
- Clear error messages
- Fallback to no highlighting on failure
- Good documentation

### Development Effort

⚠️ **Initial Implementation**
- ~1 day: Enhance semantic token provider
- ~1 day: Build LSP bridge
- ~0.5 days: Integration and testing
- ~0.5 days: Documentation

**Total:** ~3 days

---

## Implementation Phases

### Phase 1: Enhance Semantic Token Provider (1 day)

**Goal:** Increase coverage from 30% to 100%

**Tasks:**
1. Add type guards for all AST node types
2. Extend `highlightElement()` for annotations, imports, primitives
3. Add custom modifiers for arrow types
4. Test semantic token output manually

**Files Modified:**
- `src/language/machine-semantic-token-provider.ts`

**Verification:**
- Monaco highlighting improves automatically
- All syntax elements classified

---

### Phase 2: Build LSP Bridge (1 day)

**Goal:** Create CodeMirror plugin that consumes LSP tokens

**Tasks:**
1. Create `codemirror-semantic-tokens.ts`
2. Implement LSP token decoder
3. Implement ViewPlugin with debouncing
4. Add comprehensive error handling

**Files Created:**
- `src/codemirror-semantic-tokens.ts`

**Verification:**
- Unit tests for token decoder
- Performance benchmarks (< 50ms for 1000 lines)
- Edge case testing (large files, rapid typing)

---

### Phase 3: Integration (0.5 days)

**Goal:** Replace pattern-based highlighting in CodeMirror

**Tasks:**
1. Remove old `semanticHighlighting` plugin
2. Import and use `semanticHighlightingFromLSP`
3. Add new theme classes for arrows, decorators, etc.
4. Side-by-side comparison testing

**Files Modified:**
- `src/codemirror-langium.ts`

**Verification:**
- Monaco vs CodeMirror highlighting matches
- All examples render correctly
- No regressions in diagnostics/completions

---

### Phase 4: Documentation and Rollout (0.5 days)

**Goal:** Document architecture and deploy gradually

**Tasks:**
1. Document architecture in development docs
2. Update CLAUDE.md with new approach
3. Add JSDoc comments to bridge code
4. Create migration plan with feature flag

**Files Modified:**
- `docs/development/centralized-syntax-highlighting-design.md`
- `CLAUDE.md`
- `src/codemirror-semantic-tokens.ts` (JSDoc)

**Feature Flag Approach:**
```typescript
const USE_LSP_HIGHLIGHTING = true; // Toggle for A/B testing

export function createLangiumExtensions() {
    return [
        // ... other extensions
        USE_LSP_HIGHLIGHTING
            ? semanticHighlightingFromLSP
            : semanticHighlighting, // fallback
        semanticHighlightTheme
    ];
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// Test LSP token decoder
describe('decodeSemanticTokens', () => {
    it('decodes single token correctly', () => {
        const data = [0, 0, 7, 18, 0]; // "machine" keyword at 0:0
        const doc = Text.of(['machine "Test"']);
        const decorations = decodeSemanticTokens(data, doc);

        expect(decorations).toHaveLength(1);
        expect(decorations[0].from).toBe(0);
        expect(decorations[0].to).toBe(7);
    });

    it('handles multi-line delta encoding', () => {
        const data = [
            0, 0, 7, 18, 0,  // line 0, char 0, len 7 (machine)
            1, 0, 5, 18, 0,  // line 1, char 0, len 5 (state)
        ];
        const doc = Text.of(['machine "Test"', 'state Start']);
        const decorations = decodeSemanticTokens(data, doc);

        expect(decorations).toHaveLength(2);
    });

    it('gracefully handles invalid positions', () => {
        const data = [0, 100, 5, 18, 0]; // Invalid char offset
        const doc = Text.of(['machine "Test"']);
        const decorations = decodeSemanticTokens(data, doc);

        expect(decorations).toHaveLength(0); // Skip invalid token
    });
});
```

### Integration Tests

```typescript
describe('semanticHighlightingFromLSP', () => {
    it('generates decorations from Langium tokens', async () => {
        const code = 'machine "Test"\nstate Start;';
        const view = new EditorView({
            doc: code,
            extensions: [semanticHighlightingFromLSP]
        });

        // Wait for async token generation
        await new Promise(resolve => setTimeout(resolve, 200));

        const plugin = view.plugin(semanticHighlightingFromLSP);
        expect(plugin.decorations.size).toBeGreaterThan(0);
    });
});
```

### Visual Comparison Tests

Create side-by-side comparison page:

```html
<!-- test/visual-comparison.html -->
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <div>
        <h3>Monaco (LSP Native)</h3>
        <div id="monaco-editor"></div>
    </div>
    <div>
        <h3>CodeMirror (LSP Bridge)</h3>
        <div id="codemirror-editor"></div>
    </div>
</div>
```

Load same DyGram code in both, verify highlighting matches.

---

## Performance Benchmarks

### Target Metrics

| File Size | Parse Time | Token Gen | Decode | Total | Target |
|-----------|------------|-----------|--------|-------|--------|
| 100 lines | ~5ms | ~3ms | ~2ms | **~10ms** | < 20ms |
| 500 lines | ~15ms | ~8ms | ~5ms | **~28ms** | < 50ms |
| 1000 lines | ~30ms | ~15ms | ~10ms | **~55ms** | < 100ms |
| 5000 lines | ~150ms | ~75ms | ~50ms | **~275ms** | < 500ms |

### Optimization Strategies

1. **Incremental Parsing** (Langium feature)
   - Only reparse changed regions
   - Can reduce parse time by 80% for small edits

2. **Token Caching**
   - Cache LSP token array by document version
   - Skip generation if doc unchanged (cursor moves, selections)

3. **Viewport-Based Rendering**
   - CodeMirror only renders visible viewport
   - Generate tokens for visible range first, background for rest

4. **Web Worker** (future enhancement)
   - Move token generation to worker thread
   - Non-blocking UI during highlighting

---

## Migration Plan

### Week 1: Feature Flag Rollout

- Merge LSP bridge code with feature flag **OFF**
- Deploy to staging
- Enable flag for internal testing
- Collect performance metrics

### Week 2: Beta Testing

- Enable flag for 10% of users (A/B test)
- Monitor error rates, performance
- Compare Monaco vs CodeMirror screenshots
- Fix any issues discovered

### Week 3: Gradual Rollout

- Enable for 50% of users
- Monitor for regressions
- Enable for 100% if no issues

### Week 4: Cleanup

- Remove feature flag
- Remove old pattern-based code (~150 lines)
- Update documentation
- Celebrate! 🎉

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Performance regression | High | Low | Profile early, optimize, use feature flag for gradual rollout |
| LSP spec changes | Medium | Very Low | Langium is stable (v4.0), LSP is standardized (v3.17) |
| Position mapping bugs | Medium | Medium | Comprehensive tests, clear logging, fallback to no highlighting |
| Browser compatibility | Low | Very Low | LSP and CodeMirror support all modern browsers |
| Async timing issues | Low | Medium | Debouncing, show stale decorations during update |

---

## Success Criteria

### Functional

✅ **Parity**: CodeMirror and Monaco show identical highlighting
✅ **Coverage**: 100% of DyGram syntax highlighted (vs 30% today)
✅ **Accuracy**: No regex false positives, AST-based correctness

### Performance

✅ **Latency**: < 50ms for 1000-line files
✅ **Memory**: < 200KB overhead for typical files
✅ **Responsiveness**: No perceptible lag during typing

### Code Quality

✅ **Maintainability**: -150 lines of regex, +1 semantic token provider
✅ **Documentation**: Clear architecture docs, JSDoc comments
✅ **Testing**: Unit tests for decoder, integration tests for plugin

---

## References

### Technical Resources

- [LSP Semantic Tokens Spec](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens)
- [Langium Semantic Highlighting Guide](https://langium.org/docs/recipes/keywords-as-identifiers/)
- [CodeMirror ViewPlugin Documentation](https://codemirror.net/docs/ref/#view.ViewPlugin)
- [pygls: How to Interpret Semantic Tokens](https://pygls.readthedocs.io/en/latest/protocol/howto/interpret-semantic-tokens.html)

### Codebase Files

- Investigation: `docs/development/syntax-highlighting-investigation.md`
- Grammar: `src/language/machine.langium`
- Semantic Provider: `src/language/machine-semantic-token-provider.ts`
- CodeMirror Integration: `src/codemirror-langium.ts`
- Monaco Setup: `src/setupExtended.ts`

---

## Next Steps

1. ✅ Review and approve this design
2. 🔲 Create implementation tickets (GitHub issues)
3. 🔲 Phase 1: Enhance semantic token provider
4. 🔲 Phase 2: Build LSP bridge
5. 🔲 Phase 3: Integration testing
6. 🔲 Phase 4: Documentation and rollout

---

## Conclusion

Centralizing syntax highlighting through Langium's semantic token provider is **architecturally sound** and **technically feasible**. While CodeMirror 6 doesn't natively support LSP semantic tokens, a custom bridge is straightforward to implement and provides significant long-term benefits:

- **30% → 100% syntax coverage**
- **Eliminates ~150 lines of regex**
- **Single source of truth for all editors**
- **AST-based accuracy**
- **Easy to extend and maintain**

The ~3-day investment will pay dividends in consistency, maintainability, and extensibility as DyGram evolves.
