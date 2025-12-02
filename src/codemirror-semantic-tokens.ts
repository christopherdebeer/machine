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
 * Langium Semantic Token Types to CodeMirror CSS classes
 *
 * IMPORTANT: Langium uses a CUSTOM token type mapping that differs from the LSP standard!
 * This mapping MUST match AllSemanticTokenTypes from Langium's semantic-token-provider.ts
 * See: node_modules/langium/src/lsp/semantic-token-provider.ts
 */
const TOKEN_TYPE_MAP: Record<number, string> = {
    0: 'cm-semantic-class',           // class
    1: 'cm-semantic-comment',         // comment
    2: 'cm-semantic-enum',            // enum
    3: 'cm-semantic-enum-member',     // enumMember
    4: 'cm-semantic-event',           // event
    5: 'cm-semantic-function',        // function
    6: 'cm-semantic-interface',       // interface
    7: 'cm-semantic-keyword',         // keyword
    8: 'cm-semantic-macro',           // macro
    9: 'cm-semantic-method',          // method
    10: 'cm-semantic-modifier',       // modifier
    11: 'cm-semantic-namespace',      // namespace
    12: 'cm-semantic-number',         // number
    13: 'cm-semantic-operator',       // operator
    14: 'cm-semantic-parameter',      // parameter
    15: 'cm-semantic-property',       // property
    16: 'cm-semantic-regexp',         // regexp
    17: 'cm-semantic-string',         // string
    18: 'cm-semantic-struct',         // struct
    19: 'cm-semantic-type',           // type
    20: 'cm-semantic-type-parameter', // typeParameter
    21: 'cm-semantic-variable',       // variable
    22: 'cm-semantic-decorator',      // decorator
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
    private view: EditorView;

    constructor(view: EditorView) {
        this.view = view;
        this.decorations = Decoration.none;
        // Schedule initial update for the initial document
        this.scheduleUpdate(view);
    }

    update(update: ViewUpdate) {
        this.view = update.view;
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
                    uri: 'inmemory://codemirror.dy'
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

            // Force view update to display decorations (async decorations require manual refresh)
            this.view.dispatch({});

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
