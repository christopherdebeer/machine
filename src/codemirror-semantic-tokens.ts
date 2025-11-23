/**
 * LSP Semantic Tokens to CodeMirror Bridge
 *
 * This module bridges Langium's LSP semantic tokens with CodeMirror 6's decoration system,
 * enabling centralized syntax highlighting from a single source of truth (MachineSemanticTokenProvider).
 *
 * Architecture:
 * 1. Call Langium's semantic token provider directly
 * 2. Decode LSP tokens (delta-encoded integer arrays)
 * 3. Convert to CodeMirror decorations
 * 4. Apply via idiomatic ViewPlugin pattern
 */

import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Range, Text } from '@codemirror/state';
import { parseHelper } from 'langium/test';
import { createMachineServices } from './language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { Machine } from './language/generated/ast.js';

// Initialize Langium services for parsing
const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

/**
 * LSP Semantic Token Types to CodeMirror CSS classes
 *
 * Maps standard LSP token types (0-based enum) to CodeMirror CSS classes.
 * See: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#semanticTokenTypes
 */
const TOKEN_TYPE_MAP: Record<number, string> = {
    0: 'cm-semantic-namespace',      // namespace
    1: 'cm-semantic-class',           // class/type
    2: 'cm-semantic-enum',            // enum
    3: 'cm-semantic-interface',       // interface
    4: 'cm-semantic-struct',          // struct
    5: 'cm-semantic-type',            // typeParameter
    6: 'cm-semantic-parameter',       // parameter
    7: 'cm-semantic-variable',        // variable
    8: 'cm-semantic-property',        // property
    9: 'cm-semantic-enum-member',     // enumMember
    10: 'cm-semantic-decorator',      // decorator
    11: 'cm-semantic-event',          // event
    12: 'cm-semantic-function',       // function
    13: 'cm-semantic-method',         // method
    14: 'cm-semantic-macro',          // macro
    15: 'cm-semantic-label',          // label
    16: 'cm-semantic-comment',        // comment
    17: 'cm-semantic-string',         // string
    18: 'cm-semantic-keyword',        // keyword
    19: 'cm-semantic-number',         // number
    20: 'cm-semantic-regexp',         // regexp
    21: 'cm-semantic-operator',       // operator
};

/**
 * Decode LSP semantic tokens into CodeMirror decorations
 *
 * LSP tokens are encoded as an array of integers in groups of 5:
 * [lineDelta, charDelta, length, tokenType, tokenModifiers]
 *
 * Positions use delta encoding (relative to previous token) for efficiency.
 * We decode to absolute document offsets for CodeMirror decorations.
 *
 * @param data - LSP semantic token data (delta-encoded integer array)
 * @param doc - CodeMirror document
 * @returns Array of decoration ranges
 */
function decodeSemanticTokens(
    data: number[],
    doc: Text
): Range<Decoration>[] {
    const decorations: Range<Decoration>[] = [];

    let currentLine = 0;
    let currentChar = 0;

    // Process tokens in groups of 5 integers
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
            // CodeMirror lines are 1-based, LSP lines are 0-based
            const line = doc.line(currentLine + 1);
            const from = line.from + currentChar;
            const to = from + length;

            // Validate range bounds
            if (from < 0 || to > doc.length || from >= to) {
                console.warn(`[SemanticTokens] Invalid range ${from}-${to} (doc length: ${doc.length})`);
                continue;
            }

            // Map token type to CSS class
            const className = TOKEN_TYPE_MAP[tokenType] || 'cm-semantic-unknown';

            // Create decoration mark
            decorations.push(
                Decoration.mark({ class: className }).range(from, to)
            );
        } catch (e) {
            console.warn(`[SemanticTokens] Error at line ${currentLine}:${currentChar}:`, e);
        }
    }

    return decorations;
}

/**
 * ViewPlugin that provides semantic highlighting via Langium's SemanticTokenProvider
 *
 * This is the idiomatic CodeMirror 6 way to implement custom highlighting based on
 * external analysis (like LSP semantic tokens). The plugin:
 * 1. Parses the document with Langium
 * 2. Requests semantic tokens from the provider
 * 3. Decodes LSP tokens to CodeMirror decorations
 * 4. Updates on document changes (debounced)
 */
export const semanticHighlightingFromLSP = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    private updateTimeout: number | null = null;
    private cachedCode: string = '';
    private isUpdating: boolean = false;

    constructor(view: EditorView) {
        this.decorations = Decoration.none;
        // Don't schedule initial update here - let the first update() call handle it
    }

    update(update: ViewUpdate) {
        // Only regenerate tokens if document actually changed
        if (update.docChanged) {
            this.scheduleUpdate(update.view);
        }
    }

    /**
     * Debounce token generation to avoid excessive parsing during rapid typing
     */
    private scheduleUpdate(view: EditorView) {
        if (this.updateTimeout !== null) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = window.setTimeout(() => {
            this.updateDecorations(view);
            this.updateTimeout = null;
        }, 150); // 150ms debounce for responsive feel
    }

    /**
     * Generate semantic token decorations from Langium
     */
    private async updateDecorations(view: EditorView) {
        const code = view.state.doc.toString();

        // Skip if code hasn't changed (viewport scroll, selection changes, etc.)
        if (code === this.cachedCode) {
            return;
        }

        // Prevent concurrent updates
        if (this.isUpdating) {
            return;
        }

        this.cachedCode = code;
        this.isUpdating = true;

        try {
            // Parse document with Langium
            const document = await parse(code);

            // Get semantic token provider
            const tokenProvider = services.Machine.lsp.SemanticTokenProvider;

            if (!tokenProvider) {
                console.warn('[SemanticTokens] SemanticTokenProvider not available');
                this.decorations = Decoration.none;
                this.isUpdating = false;
                return;
            }

            // Request semantic tokens (LSP format)
            const params = {
                textDocument: {
                    uri: 'inmemory://codemirror.dygram'
                }
            };

            const result = await tokenProvider.semanticHighlight(
                document,
                params,
                {} // cancel token
            );

            if (!result || !result.data || result.data.length === 0) {
                // No tokens - clear decorations
                this.decorations = Decoration.none;
                this.isUpdating = false;
                return;
            }

            // Decode LSP tokens to CodeMirror decorations
            const ranges = decodeSemanticTokens(result.data, view.state.doc);

            // Update decorations
            this.decorations = Decoration.set(ranges, true);

        } catch (error) {
            console.error('[SemanticTokens] Error generating tokens:', error);
            // Keep previous decorations on error (graceful degradation)
        } finally {
            this.isUpdating = false;
        }
    }

    destroy() {
        if (this.updateTimeout !== null) {
            clearTimeout(this.updateTimeout);
        }
    }
}, {
    // Provide decorations to CodeMirror
    decorations: v => v.decorations
});
