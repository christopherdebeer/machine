# Template String Parsing Enhancement

**Status:** Design Proposal
**Date:** 2025-11-22
**Author:** Claude

## Current State

### Architecture Overview

Template strings in DyGram are currently handled through a multi-layer approach:

1. **Grammar Level** (`machine.langium:25`)
   - Terminal `TEMPLATE_STR` matches strings containing `{{` markers
   - Pattern: `/"([^"\\]|\\.)*\{\{([^"\\]|\\.)*"/`
   - Distinguishes template strings from regular strings at lexer level

2. **Template Parser** (`template-parser.ts`)
   - Runtime parsing of template structure
   - Regex pattern: `/\{\{([^}]*)\}\}/g`
   - Produces `TemplateStructure` with parts (text vs placeholder)
   - Used by completion provider for IDE support

3. **Dependency Analyzer** (`dependency-analyzer.ts:68-78`)
   - Manual regex extraction: `/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g`
   - Extracts variable references (e.g., `config.apiUrl`)
   - Creates dependency graph for validation

4. **Type Checker** (`type-checker.ts:690-732`)
   - Validates template references
   - Splits references on `.` to resolve node.attribute paths
   - Checks type compatibility

### Pain Points

1. **Duplicated Parsing Logic**
   - Three different regex patterns across the codebase
   - `dependency-analyzer.ts`: `/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g`
   - `template-parser.ts`: `/\{\{([^}]*)\}\}/g`
   - Both patterns do similar work but with different goals

2. **No AST Representation**
   - Template structure not available in AST
   - Each component must parse string values manually
   - No type safety for template parts

3. **Limited Position Tracking**
   - Hard to map errors back to exact source locations within templates
   - Offset calculations are complex and error-prone
   - Difficult to provide precise diagnostics

4. **Decentralized Logic**
   - Template handling scattered across multiple modules
   - Hard to ensure consistency
   - Changes require updates in multiple places

## Proposed Enhancement

### Design Goals

1. **Centralize template parsing** - Single source of truth
2. **AST-level access** - Direct access to template structure from AST nodes
3. **Preserve position information** - Accurate source locations for diagnostics
4. **Backward compatible** - No breaking changes to grammar or public APIs
5. **Performance** - Cache parsed results, avoid re-parsing

### Approach: Template String Manager with AST Integration

#### Phase 1: Centralized Template Manager

Create a new `TemplateStringManager` class that:

1. **Caches parsed templates** - Avoid re-parsing the same template multiple times
2. **Provides unified API** - Single interface for all template operations
3. **Integrates with AST** - Direct access from `PrimitiveValue` nodes

```typescript
// src/language/template-string-manager.ts

export class TemplateStringManager {
    private cache: WeakMap<PrimitiveValue, TemplateStructure> = new WeakMap();

    /**
     * Get template structure for an AST node
     * Caches results to avoid re-parsing
     */
    getTemplateStructure(node: PrimitiveValue): TemplateStructure {
        if (this.cache.has(node)) {
            return this.cache.get(node)!;
        }

        const structure = parseTemplateString(node.value);
        this.cache.set(node, structure);
        return structure;
    }

    /**
     * Extract all template references from a node
     * Returns structured reference information with positions
     */
    extractReferences(node: PrimitiveValue): TemplateReference[] {
        const structure = this.getTemplateStructure(node);
        if (!structure.isTemplate) {
            return [];
        }

        const references: TemplateReference[] = [];
        for (const part of structure.parts) {
            if (part.type === 'placeholder') {
                const ref = parseReference(part.content);
                if (ref) {
                    references.push({
                        ...ref,
                        astNode: node,
                        offset: part.start,
                        length: part.end - part.start
                    });
                }
            }
        }
        return references;
    }

    /**
     * Validate all template references in a node
     */
    validateReferences(
        node: PrimitiveValue,
        typeChecker: TypeChecker
    ): ValidationResult[] {
        const references = this.extractReferences(node);
        return references.map(ref => ({
            reference: ref,
            result: typeChecker.validateTemplateReference(
                ref.path,
                ref.expectedType
            )
        }));
    }
}

export interface TemplateReference {
    /** Full reference path (e.g., "config.apiUrl") */
    path: string;
    /** Root node name (e.g., "config") */
    rootNode: string;
    /** Attribute path (e.g., ["apiUrl"]) */
    attributes: string[];
    /** AST node containing this reference */
    astNode: PrimitiveValue;
    /** Offset within the string value */
    offset: number;
    /** Length of the reference */
    length: number;
}
```

#### Phase 2: Enhanced Grammar Integration

While keeping the current terminal-based approach, we can enhance the grammar with better type information:

```langium
// Option A: Add a computed property to PrimitiveValue (via TypeScript)
// This doesn't change the grammar but adds AST node capabilities

// Option B: Add a dedicated TemplateString rule (more invasive)
TemplateString:
    value=TEMPLATE_STR
;

// Option C: Keep current approach but document template handling
PrimitiveValue:
    value=(EXTID|STRING|ID|NUMBER)
    // STRING may be TEMPLATE_STR which requires special handling
;
```

**Recommendation:** Keep current grammar (Option A/C), add TypeScript enhancements.

#### Phase 3: Update Consumers

Update all template consumers to use the centralized manager:

1. **Dependency Analyzer** - Use `TemplateStringManager.extractReferences()`
2. **Type Checker** - Use `TemplateStringManager.validateReferences()`
3. **Completion Provider** - Use `TemplateStringManager.getTemplateStructure()`
4. **CEL Evaluator** - Can also benefit from structured access

### Implementation Plan

#### Step 1: Create TemplateStringManager

File: `src/language/template-string-manager.ts`

- Implement caching layer
- Provide reference extraction
- Integrate with existing `template-parser.ts`
- Add comprehensive tests

#### Step 2: Add AST Extensions

File: `src/language/ast-extensions.ts` (new file)

```typescript
import { PrimitiveValue } from './generated/ast.js';
import { TemplateStringManager } from './template-string-manager.js';

const globalTemplateManager = new TemplateStringManager();

export function getTemplateStructure(node: PrimitiveValue): TemplateStructure {
    return globalTemplateManager.getTemplateStructure(node);
}

export function isTemplateString(node: PrimitiveValue): boolean {
    return typeof node.value === 'string' && node.value.includes('{{');
}

export function extractTemplateReferences(node: PrimitiveValue): TemplateReference[] {
    return globalTemplateManager.extractReferences(node);
}
```

#### Step 3: Refactor Dependency Analyzer

Update `dependency-analyzer.ts` to use the manager:

```typescript
// BEFORE (lines 68-78)
private extractTemplateReferences(text: string): string[] {
    const references: string[] = [];
    const pattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        references.push(match[1]);
    }
    return references;
}

// AFTER
private extractTemplateReferences(node: PrimitiveValue): TemplateReference[] {
    return this.templateManager.extractReferences(node);
}
```

Benefits:
- Single parsing implementation
- Position information preserved
- Type-safe reference objects

#### Step 4: Enhance Type Checker

Update `type-checker.ts` to leverage structured references:

```typescript
// BEFORE: validateTemplateReference(reference: string, expectedType?: string)
// Called with parsed string like "config.apiUrl"

// AFTER: Can work with TemplateReference objects directly
public validateTemplateReferences(node: PrimitiveValue): ValidationResult[] {
    return this.templateManager.validateReferences(node, this);
}

// Provides richer error messages with exact positions
```

#### Step 5: Update Tests

- Add tests for `TemplateStringManager`
- Update existing tests to use new APIs
- Verify performance improvements from caching

### Alternative Approach: Grammar-Level Template Parsing

This is a more invasive approach that parses templates directly in the grammar.

#### Grammar Changes

```langium
// Define template parts as parser rules
TemplateString:
    parts+=TemplatePart+
;

TemplatePart:
    TextPart | PlaceholderPart
;

TextPart:
    text=TEMPLATE_TEXT
;

PlaceholderPart:
    '{{' expression=TemplateExpression '}}'
;

TemplateExpression:
    // This is tricky - need to handle CEL expressions
    // May require dedicated lexer modes
    path=QualifiedName // Simplified: just node.attr references
;

// New terminals
terminal TEMPLATE_TEXT: /[^{]+/; // Text outside placeholders
terminal TEMPLATE_OPEN: '{{';
terminal TEMPLATE_CLOSE: '}}';
```

#### Challenges

1. **Lexer Modes** - Langium doesn't fully support lexer modes like ANTLR
2. **Ambiguity** - `{` could be object literal or template start
3. **Complexity** - CEL expressions are complex, hard to parse in grammar
4. **Breaking Change** - Would require AST changes, breaking existing code

#### Verdict

**Not recommended** - The complexity and breaking changes outweigh the benefits. The manager-based approach provides similar benefits with less risk.

## Comparison Matrix

| Aspect | Current | Manager Approach | Grammar Approach |
|--------|---------|------------------|------------------|
| Parsing logic | Scattered | Centralized | Grammar-level |
| AST representation | String only | Cache-backed | Native AST nodes |
| Position tracking | Manual | Structured | Automatic |
| Breaking changes | N/A | None | Major |
| Implementation complexity | N/A | Low | High |
| Performance | Multiple parses | Cached | Single parse |
| IDE support | Via template-parser | Enhanced | Native |
| Type safety | Limited | Improved | Full |

## Recommendation

**Implement the Template String Manager approach (Phase 1-5)**

### Why?

1. **Non-breaking** - No changes to grammar or public APIs
2. **Incremental** - Can be implemented step by step
3. **Low risk** - Uses existing parsing logic, just centralizes it
4. **High value** - Solves the main pain points (duplication, no caching)
5. **Testable** - Easy to add comprehensive tests

### Benefits

- ✅ Single source of truth for template parsing
- ✅ AST-level access via helper functions
- ✅ Position information preserved
- ✅ Performance improvement through caching
- ✅ Easier to maintain and extend
- ✅ Better error messages with precise locations

### Migration Path

1. Implement `TemplateStringManager` with full test coverage
2. Add `ast-extensions.ts` helper module
3. Update one consumer at a time (dependency analyzer first)
4. Verify no regressions with existing tests
5. Update documentation to reference new approach
6. Mark old manual parsing as deprecated (optional)

## Future Enhancements

Once the manager is in place, we can consider:

1. **CEL Expression Parsing** - Parse the full CEL syntax in placeholders
2. **Type Inference** - Infer expected types from context
3. **Rename Refactoring** - Update template references when nodes/attributes are renamed
4. **Find References** - Show all template usages of a node/attribute
5. **Template Validation** - Validate CEL syntax at parse time
6. **Template Formatting** - Auto-format template expressions

## Related Files

- `src/language/machine.langium:23-27` - Template terminal definition
- `src/language/template-parser.ts` - Current parsing implementation
- `src/language/dependency-analyzer.ts:68-78` - Manual extraction
- `src/language/type-checker.ts:690-732` - Template validation
- `src/language/machine-completion-provider.ts:624-741` - IDE support
- `docs/syntax/templates.md` - User documentation
- `test/integration/comprehensive-generative.test.ts` - Integration tests

## Conclusion

The Template String Manager approach provides the best balance of:
- Implementation complexity (low)
- Risk (minimal)
- Value delivered (high)
- Backward compatibility (full)

It solves the core problems (duplicated parsing, no caching, scattered logic) without requiring invasive grammar changes or breaking existing code.
