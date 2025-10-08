/**
 * CodeMirror integration with Langium Language Server
 * This module provides LSP features (diagnostics, semantic highlighting) for CodeMirror
 */

import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateField, StateEffect, Range } from '@codemirror/state';
import { linter, Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { Diagnostic } from 'vscode-languageserver';
import { createMachineServices } from './language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from './language/generated/ast.js';

// Initialize Langium services for parsing
const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

/**
 * State effect for updating diagnostics
 */
const setDiagnosticsEffect = StateEffect.define<Diagnostic[]>();

/**
 * State field to store current diagnostics
 */
const diagnosticsState = StateField.define<Diagnostic[]>({
    create: () => [],
    update(diagnostics, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setDiagnosticsEffect)) {
                return effect.value;
            }
        }
        return diagnostics;
    }
});

/**
 * Convert LSP severity to CodeMirror severity
 */
function convertSeverity(severity: number | undefined): 'error' | 'warning' | 'info' {
    switch (severity) {
        case 1: return 'error';
        case 2: return 'warning';
        case 3: return 'info';
        case 4: return 'info';
        default: return 'error';
    }
}

/**
 * Create a linter that uses Langium's parser and validator
 */
export function createLangumLinter() {
    return linter(async (view) => {
        const code = view.state.doc.toString();
        const diagnostics: CMDiagnostic[] = [];

        try {
            // Parse the document using Langium
            const document = await parse(code);

            // Convert parser errors to diagnostics
            if (document.parseResult.parserErrors.length > 0) {
                for (const error of document.parseResult.parserErrors) {
                    // Use token position information if available
                    let from = 0;
                    let to = 1;

                    if (error.token && typeof error.token === 'object') {
                        // Try to extract position from token
                        const token = error.token as any;
                        if (token.offset !== undefined && token.length !== undefined) {
                            from = token.offset;
                            to = from + token.length;
                        }
                    }

                    diagnostics.push({
                        from: Math.max(0, from),
                        to: Math.min(view.state.doc.length, Math.max(from + 1, to)),
                        severity: 'error',
                        message: error.message
                    });
                }
            }

            // Get validation diagnostics
            if (document.diagnostics) {
                for (const diag of document.diagnostics) {
                    if (diag.range) {
                        // Convert line/character positions to absolute offsets
                        const fromLine = view.state.doc.line(diag.range.start.line + 1);
                        const toLine = view.state.doc.line(diag.range.end.line + 1);
                        const from = fromLine.from + diag.range.start.character;
                        const to = toLine.from + diag.range.end.character;

                        diagnostics.push({
                            from: Math.max(0, from),
                            to: Math.min(view.state.doc.length, to),
                            severity: convertSeverity(diag.severity),
                            message: diag.message
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error during linting:', error);
        }

        return diagnostics;
    }, {
        delay: 300 // Debounce validation
    });
}


/**
 * Custom theme with semantic token highlighting
 */
export const semanticHighlightTheme = EditorView.baseTheme({
    '.cm-semantic-class': { color: '#4ec9b0' },
    '.cm-semantic-variable': { color: '#9cdcfe' },
    '.cm-semantic-property': { color: '#c586c0' },
    '.cm-semantic-type': { color: '#4ec9b0' },
    '.cm-semantic-string': { color: '#ce9178' },
    '.cm-semantic-keyword': { color: '#569cd6' },
    '.cm-semantic-comment': { color: '#6a9955' },
    '.cm-semantic-number': { color: '#b5cea8' },
    '.cm-semantic-operator': { color: '#d4d4d4' },
});

/**
 * Create a decoration for a semantic token
 */
const semanticMark = (className: string) => Decoration.mark({ class: className });

/**
 * View plugin that provides semantic highlighting based on the Langium AST
 */
export const semanticHighlighting = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView): DecorationSet {
        const builder: Range<Decoration>[] = [];
        const code = view.state.doc.toString();

        // Parse the document asynchronously (we'll use a simplified sync approach for decorations)
        // In practice, you'd want to cache this or use the results from the linter
        try {
            // For now, we'll use basic pattern matching for keywords
            // A full implementation would use the semantic token provider
            const keywords = ['machine', 'state', 'task', 'tool', 'context', 'Input', 'Output', 'Task', 'Concept', 'Result'];

            // Simple keyword highlighting
            for (const keyword of keywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'g');
                let match;
                while ((match = regex.exec(code)) !== null) {
                    const from = match.index;
                    const to = from + match[0].length;
                    builder.push(semanticMark('cm-semantic-keyword').range(from, to));
                }
            }

            // Highlight string literals
            const stringRegex = /"[^"]*"/g;
            let stringMatch;
            while ((stringMatch = stringRegex.exec(code)) !== null) {
                const from = stringMatch.index;
                const to = from + stringMatch[0].length;
                builder.push(semanticMark('cm-semantic-string').range(from, to));
            }

            // Highlight node names (identifiers after keywords)
            const nodeRegex = /\b(state|task|tool|context|Input|Output|Task|Concept|Result)\s+(\w+)/g;
            let nodeMatch;
            while ((nodeMatch = nodeRegex.exec(code)) !== null) {
                const from = nodeMatch.index + nodeMatch[1].length + 1;
                const to = from + nodeMatch[2].length;
                builder.push(semanticMark('cm-semantic-variable').range(from, to));
            }

            // Highlight type annotations
            const typeRegex = /<(\w+)>/g;
            let typeMatch;
            while ((typeMatch = typeRegex.exec(code)) !== null) {
                const from = typeMatch.index + 1;
                const to = from + typeMatch[1].length;
                builder.push(semanticMark('cm-semantic-type').range(from, to));
            }

            // Highlight property names
            const propRegex = /(\w+)(?=\s*:)/g;
            let propMatch;
            while ((propMatch = propRegex.exec(code)) !== null) {
                const from = propMatch.index;
                const to = from + propMatch[1].length;
                builder.push(semanticMark('cm-semantic-property').range(from, to));
            }

        } catch (error) {
            console.error('Error building semantic decorations:', error);
        }

        return Decoration.set(builder, true);
    }
}, {
    decorations: v => v.decorations
});

/**
 * Create all extensions needed for Langium LSP integration
 */
export function createLangiumExtensions() {
    return [
        diagnosticsState,
        createLangumLinter(),
        semanticHighlighting,
        semanticHighlightTheme
    ];
}
