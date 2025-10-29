/**
 * CodeMirror integration with Langium Language Server
 * This module provides LSP features (diagnostics, semantic highlighting, completions) for CodeMirror
 */

import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, gutter, GutterMarker, showTooltip, Tooltip } from '@codemirror/view';
import { StateField, StateEffect, Range, RangeSet } from '@codemirror/state';
import { linter, Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import { createMachineServices } from './language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from './language/generated/ast.js';
import type { CompletionItemKind } from 'vscode-languageserver-protocol';

// Initialize Langium services for parsing
const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

/**
 * Gutter marker for diagnostic annotations
 */
class DiagnosticMarker extends GutterMarker {
    constructor(readonly severity: 'error' | 'warning' | 'info') {
        super();
    }

    override toDOM() {
        const marker = document.createElement('div');
        marker.className = `cm-diagnostic-gutter-marker cm-diagnostic-${this.severity}`;
        marker.title = this.severity.charAt(0).toUpperCase() + this.severity.slice(1);

        // Add visual indicator
        const icon = document.createElement('span');
        icon.className = 'cm-diagnostic-icon';

        switch (this.severity) {
            case 'error':
                icon.textContent = '✖';
                break;
            case 'warning':
                icon.textContent = '⚠';
                break;
            case 'info':
                icon.textContent = 'ℹ';
                break;
        }

        marker.appendChild(icon);
        return marker;
    }
}

/**
 * State effect for updating diagnostics with version tracking to prevent stale updates
 */
const setDiagnosticsEffect = StateEffect.define<{ diagnostics: CMDiagnostic[], version: number }>();

/**
 * State field to store current diagnostics with version tracking
 */
const diagnosticsState = StateField.define<{ diagnostics: CMDiagnostic[], version: number }>({
    create: () => ({ diagnostics: [], version: 0 }),
    update(state, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setDiagnosticsEffect)) {
                // Only update if the new version is newer than the current version
                if (effect.value.version >= state.version) {
                    return effect.value;
                }
            }
        }
        return state;
    }
});

/**
 * Convert LSP severity to CodeMirror severity
 * Note: CodeMirror only supports 'error' | 'warning' | 'info', so we map 'hint' to 'info'
 */
function convertSeverity(severity: number | undefined): 'error' | 'warning' | 'info' {
    switch (severity) {
        case 1: return 'error';
        case 2: return 'warning';
        case 3: return 'info';
        case 4: return 'info'; // Map hint to info since CodeMirror doesn't support hint
        default: return 'error';
    }
}

/**
 * State effect for showing/hiding diagnostic tooltips
 */
const showDiagnosticTooltipEffect = StateEffect.define<{ pos: number; lineNumber: number } | null>();

/**
 * State field to track active tooltip position
 */
const tooltipState = StateField.define<{ pos: number; lineNumber: number } | null>({
    create: () => null,
    update(state, tr) {
        for (const effect of tr.effects) {
            if (effect.is(showDiagnosticTooltipEffect)) {
                return effect.value;
            }
        }
        return state;
    },
    provide: field => showTooltip.compute([field, diagnosticsState], state => {
        const tooltipInfo = state.field(field);
        if (!tooltipInfo) return null;

        const diagState = state.field(diagnosticsState, false);
        if (!diagState) return null;

        // Get diagnostics for the line
        const lineDiagnostics = diagState.diagnostics.filter(d => {
            const diagLine = state.doc.lineAt(d.from);
            return diagLine.number === tooltipInfo.lineNumber;
        });

        if (lineDiagnostics.length === 0) return null;

        // Create tooltip
        return {
            pos: tooltipInfo.pos,
            above: true,
            strictSide: false,
            arrow: true,
            create: () => {
                const dom = document.createElement('div');
                dom.className = 'cm-diagnostic-tooltip';
                
                lineDiagnostics.forEach(d => {
                    const line = document.createElement('div');
                    line.className = `cm-diagnostic-tooltip-line cm-diagnostic-tooltip-${d.severity}`;
                    line.textContent = `${d.severity.toUpperCase()}: ${d.message}`;
                    dom.appendChild(line);
                });

                return { dom };
            }
        } as Tooltip;
    })
});

// Track tooltip timeout for auto-hide on mobile
let tooltipTimeout: number | null = null;

/**
 * Show diagnostic tooltip for a line
 */
function showDiagnosticTooltip(view: EditorView, lineBlock: any) {
    // Clear any existing timeout
    if (tooltipTimeout !== null) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
    }

    // Get the line info from the document
    const lineInfo = view.state.doc.lineAt(lineBlock.from);
    
    // Toggle tooltip - if already showing for this line, hide it
    const currentTooltip = view.state.field(tooltipState, false);
    if (currentTooltip && currentTooltip.lineNumber === lineInfo.number) {
        view.dispatch({
            effects: showDiagnosticTooltipEffect.of(null)
        });
        return;
    }

    // Show tooltip for this line
    view.dispatch({
        effects: showDiagnosticTooltipEffect.of({
            pos: lineBlock.from,
            lineNumber: lineInfo.number
        })
    });

    // Auto-hide after 5 seconds on mobile
    if ('ontouchstart' in window) {
        tooltipTimeout = window.setTimeout(() => {
            view.dispatch({
                effects: showDiagnosticTooltipEffect.of(null)
            });
            tooltipTimeout = null;
        }, 5000);
    }
}

/**
 * Hide diagnostic tooltip
 */
function hideDiagnosticTooltip(view: EditorView) {
    if (tooltipTimeout !== null) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
    }
    
    view.dispatch({
        effects: showDiagnosticTooltipEffect.of(null)
    });
}

/**
 * Diagnostic gutter extension that shows markers for errors, warnings, info, and hints
 */
const diagnosticGutter = gutter({
    class: 'cm-diagnostic-gutter',
    markers: view => {
        const state = view.state.field(diagnosticsState, false);
        if (!state || state.diagnostics.length === 0) {
            return RangeSet.empty;
        }
        const diagnostics = state.diagnostics;

        const markers: Range<GutterMarker>[] = [];
        const lineMap = new Map<number, 'error' | 'warning' | 'info'>();

        // Group diagnostics by line and prioritize severity
        for (const diagnostic of diagnostics) {
            const line = view.state.doc.lineAt(diagnostic.from);
            const lineNum = line.number;
            const currentSeverity = lineMap.get(lineNum);

            // Map severity, treating 'hint' as 'info' for consistency
            const severity: 'error' | 'warning' | 'info' =
                diagnostic.severity === 'hint' ? 'info' : diagnostic.severity;

            // Priority: error > warning > info
            if (!currentSeverity ||
                (severity === 'error') ||
                (severity === 'warning' && currentSeverity !== 'error')) {
                lineMap.set(lineNum, severity);
            }
        }

        // Create markers for each line
        for (const [lineNum, severity] of lineMap.entries()) {
            const line = view.state.doc.line(lineNum);
            markers.push(new DiagnosticMarker(severity).range(line.from));
        }

        return RangeSet.of(markers, true);
    },
    initialSpacer: () => new DiagnosticMarker('error'),
    domEventHandlers: {
        mouseenter(view, line) {
            // Only show tooltip on hover if not on mobile
            if (!('ontouchstart' in window)) {
                showDiagnosticTooltip(view, line);
            }
            return false;
        },
        mouseleave(view) {
            // Remove tooltip on mouse leave for desktop
            if (!('ontouchstart' in window)) {
                hideDiagnosticTooltip(view);
            }
            return false;
        },
        click(view, line) {
            // Handle click/tap for both desktop and mobile
            showDiagnosticTooltip(view, line);
            return true; // Prevent default to avoid text selection
        }
    }
});

// Track linter version to prevent stale updates
let linterVersion = 0;

/**
 * Create a linter that uses Langium's parser and validator
 */
export function createLangumLinter() {
    return linter(async (view) => {
        const code = view.state.doc.toString();
        const currentVersion = ++linterVersion; // Increment version for this lint run
        const diagnostics: CMDiagnostic[] = [];

        try {
            // Parse the document using Langium
            const document = await parse(code);

            // Explicitly trigger validation - returns array of diagnostics directly
            const validationDiagnostics = await services.Machine.validation.DocumentValidator.validateDocument(document);

            // Convert parser errors to diagnostics
            if (document.parseResult.parserErrors.length > 0) {
                for (const error of document.parseResult.parserErrors) {
                    // Use token position information if available
                    let from = 0;
                    let to = 1;

                    if (error.token && typeof error.token === 'object') {
                        // Try to extract position from token
                        const token = error.token as any;

                        // First try offset-based positioning (most accurate)
                        if (token.offset !== undefined && token.length !== undefined) {
                            from = token.offset;
                            to = from + token.length;
                        }
                        // Fall back to line/column based positioning
                        else if (token.startLine !== undefined) {
                            try {
                                // Convert 1-based line numbers to 0-based
                                const line = view.state.doc.line(token.startLine);
                                const startCol = token.startColumn !== undefined ? token.startColumn - 1 : 0;
                                from = line.from + startCol;

                                // Calculate end position
                                if (token.endLine !== undefined && token.endColumn !== undefined) {
                                    const endLine = view.state.doc.line(token.endLine);
                                    const endCol = token.endColumn - 1;
                                    to = endLine.from + endCol;
                                } else {
                                    // If no end position, highlight to end of line or next few chars
                                    to = Math.min(line.to, from + Math.max(1, token.image?.length || 1));
                                }
                            } catch (lineError) {
                                console.warn('Error converting line/column to offset:', lineError);
                                // Fall back to start of document
                                from = 0;
                                to = 1;
                            }
                        }
                    }

                    diagnostics.push({
                        from: Math.max(0, from),
                        to: Math.min(view.state.doc.length, Math.max(from + 1, to)),
                        severity: 'error' as const,
                        message: error.message
                    });
                }
            }

            // Get validation diagnostics from the validation result
            if (validationDiagnostics && validationDiagnostics.length > 0) {
                for (const diag of validationDiagnostics) {
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

        // Update the diagnostics state for the gutter with version tracking
        view.dispatch({
            effects: setDiagnosticsEffect.of({
                diagnostics,
                version: currentVersion
            })
        });

        return diagnostics;
    }, {
        delay: 300 // Debounce validation
    });
}


/**
 * Custom theme with semantic token highlighting and diagnostic gutter styling
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

    // Diagnostic gutter styling
    '.cm-diagnostic-gutter': {
        width: '1.2em',
        paddingLeft: '2px'
    },
    '.cm-diagnostic-gutter-marker': {
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '1em',
        width: '1em',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent'
    },
    '.cm-diagnostic-icon': {
        fontSize: '0.9em',
        fontWeight: 'bold'
    },
    '.cm-diagnostic-error': {
        color: '#f48771'
    },
    '.cm-diagnostic-warning': {
        color: '#cca700'
    },
    '.cm-diagnostic-info': {
        color: '#75beff'
    },
    '.cm-diagnostic-hint': {
        color: '#d4d4d4'
    },
    // Diagnostic tooltip styling
    '.cm-tooltip.cm-diagnostic-tooltip': {
        background: '#2d2d30',
        border: '1px solid #3e3e42',
        borderRadius: '4px',
        padding: '8px 12px',
        maxWidth: '400px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '12px',
        lineHeight: '1.4',
        color: '#d4d4d4'
    },
    '.cm-diagnostic-tooltip-line': {
        margin: '4px 0'
    },
    '.cm-diagnostic-tooltip-error': {
        color: '#f48771'
    },
    '.cm-diagnostic-tooltip-warning': {
        color: '#cca700'
    },
    '.cm-diagnostic-tooltip-info': {
        color: '#75beff'
    },

    // Inline lint decorations (underlines in the editor)
    '.cm-lintRange-error': {
        backgroundImage: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'6\' height=\'3\'><path d=\'m0 3 l3 -3 l3 3\' stroke=\'%23f48771\' fill=\'none\' stroke-width=\'.7\'/></svg>")',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left bottom',
        paddingBottom: '2px'
    },
    '.cm-lintRange-warning': {
        backgroundImage: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'6\' height=\'3\'><path d=\'m0 3 l3 -3 l3 3\' stroke=\'%23efefef\' fill=\'none\' stroke-width=\'.7\'/></svg>")',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left bottom',
        paddingBottom: '2px'
    },
    '.cm-lintRange-info': {
        backgroundImage: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'6\' height=\'3\'><path d=\'m0 3 l3 -3 l3 3\' stroke=\'%2375beff\' fill=\'none\' stroke-width=\'.7\'/></svg>")',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'left bottom',
        paddingBottom: '2px'
    },
    '.cm-lintRange-active': {
        backgroundColor: 'rgba(244, 135, 113, 0.15)'
    },

    // Lint panel (the popup that shows all errors)
    '.cm-panel.cm-panel-lint': {
        background: '#2d2d30',
        border: '1px solid #3e3e42',
        color: '#d4d4d4'
    },
    '.cm-panel.cm-panel-lint ul': {
        maxHeight: '200px',
        overflowY: 'auto'
    },
    '.cm-panel.cm-panel-lint li': {
        padding: '4px 8px',
        cursor: 'pointer',
        borderBottom: '1px solid #3e3e42'
    },
    '.cm-panel.cm-panel-lint li:hover': {
        background: '#3e3e42'
    },
    '.cm-diagnostic-error .cm-diagnostic': {
        color: '#f48771'
    },
    '.cm-diagnostic-warning .cm-diagnostic': {
        color: '#cca700'
    },
    '.cm-diagnostic-info .cm-diagnostic': {
        color: '#75beff'
    }
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
 * Map Langium CompletionItemKind to CodeMirror completion type
 */
function mapCompletionItemKind(kind: CompletionItemKind | undefined): string {
    // CompletionItemKind enum from LSP protocol
    switch (kind) {
        case 1: return 'text';
        case 2: return 'method';
        case 3: return 'function';
        case 4: return 'constructor';
        case 5: return 'variable';
        case 6: return 'class';
        case 7: return 'interface';
        case 8: return 'module';
        case 9: return 'property';
        case 10: return 'enum';
        case 14: return 'keyword';
        case 15: return 'constant';
        case 17: return 'type';
        default: return 'text';
    }
}

/**
 * Create a completion source that uses Langium's CompletionProvider
 */
async function langiumCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
    const { state, pos, explicit } = context;

    // Get the text and cursor position
    const text = state.doc.toString();

    // Convert offset to line/character position
    const line = state.doc.lineAt(pos);
    const lineNumber = line.number - 1; // 0-based line number
    const character = pos - line.from; // Character offset in line

    try {
        // Parse the document
        const document = await parse(text);

        // Get completion items from Langium's CompletionProvider
        const completionProvider = services.Machine.lsp.CompletionProvider;
        if (!completionProvider) {
            return null;
        }

        // Create LSP-compatible completion params
        const completionParams = {
            textDocument: {
                uri: 'inmemory://playground.dygram'
            },
            position: {
                line: lineNumber,
                character: character
            },
            context: {
                triggerKind: explicit ? 1 : 2, // 1 = Invoked, 2 = TriggerCharacter
            }
        };

        // Get completions from Langium
        const completionList = await completionProvider.getCompletion(document, completionParams);

        if (!completionList || !completionList.items || completionList.items.length === 0) {
            return null;
        }

        // Find the word boundary for replacement
        const wordMatch = context.matchBefore(/\w*/);
        const from = wordMatch ? wordMatch.from : pos;

        // Convert Langium completions to CodeMirror format
        const options: Completion[] = completionList.items.map((item) => {
            const completion: Completion = {
                label: item.label,
                type: mapCompletionItemKind(item.kind),
                apply: item.insertText || item.label,
                detail: item.detail,
                info: item.documentation ?
                    (typeof item.documentation === 'string' ? item.documentation : item.documentation.value)
                    : undefined,
                boost: item.sortText ? -parseInt(item.sortText, 10) : 0
            };
            return completion;
        });

        return {
            from,
            options,
            validFor: /^\w*$/
        };
    } catch (error) {
        console.error('Error getting completions:', error);
        return null;
    }
}

/**
 * Create the Langium autocompletion extension
 */
export function createLangiumCompletion() {
    return autocompletion({
        override: [langiumCompletionSource],
        activateOnTyping: true,
        maxRenderedOptions: 20,
        defaultKeymap: true
    });
}

/**
 * Create all extensions needed for Langium LSP integration
 */
export function createLangiumExtensions() {
    return [
        diagnosticsState,
        tooltipState,
        diagnosticGutter,
        createLangumLinter(),
        createLangiumCompletion(),
        semanticHighlighting,
        semanticHighlightTheme
    ];
}
