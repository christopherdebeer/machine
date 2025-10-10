/**
 * CodeMirror integration with Langium Language Server
 * This module provides LSP features (diagnostics, semantic highlighting) for CodeMirror
 */

import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, gutter, GutterMarker } from '@codemirror/view';
import { StateField, StateEffect, Range, RangeSet } from '@codemirror/state';
import { linter, Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { createMachineServices } from './language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from './language/generated/ast.js';

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
 * Create a tooltip element for showing diagnostic messages
 */
function createDiagnosticTooltip(messages: string[]): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'cm-diagnostic-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        background: #2d2d30;
        border: 1px solid #3e3e42;
        border-radius: 4px;
        padding: 8px 12px;
        max-width: 400px;
        z-index: 1000;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        pointer-events: none;
    `;

    messages.forEach(msg => {
        const line = document.createElement('div');
        line.style.cssText = 'margin: 4px 0; font-size: 12px; line-height: 1.4;';
        line.textContent = msg;
        tooltip.appendChild(line);
    });

    return tooltip;
}

/**
 * Position tooltip near the target element
 */
function positionTooltip(tooltip: HTMLElement, targetElement: HTMLElement) {
    const rect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Position to the right of the marker, or left if not enough space
    let left = rect.right + 8;
    if (left + tooltipRect.width > window.innerWidth) {
        left = rect.left - tooltipRect.width - 8;
    }

    // Center vertically with the marker
    let top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);

    // Keep within viewport
    if (top < 8) top = 8;
    if (top + tooltipRect.height > window.innerHeight - 8) {
        top = window.innerHeight - tooltipRect.height - 8;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

// Track active tooltip to remove it when needed
let activeTooltip: HTMLElement | null = null;

/**
 * Show diagnostic tooltip for a line
 */
function showDiagnosticTooltip(view: EditorView, lineBlock: any, targetElement: HTMLElement) {
    // Remove any existing tooltip
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }

    // lineBlock has properties: from, to, text, number
    // Get the line info from the document
    const lineInfo = view.state.doc.lineAt(lineBlock.from);
    const state = view.state.field(diagnosticsState, false);
    if (!state) return;

    const lineDiagnostics = state.diagnostics.filter(d => {
        const diagLine = view.state.doc.lineAt(d.from);
        return diagLine.number === lineInfo.number;
    });

    if (lineDiagnostics.length > 0) {
        const messages = lineDiagnostics
            .map(d => `${d.severity.toUpperCase()}: ${d.message}`);

        const tooltip = createDiagnosticTooltip(messages);
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;

        // Position after adding to DOM so we can measure it
        requestAnimationFrame(() => {
            positionTooltip(tooltip, targetElement);
        });

        // Auto-hide after 5 seconds for mobile
        setTimeout(() => {
            if (activeTooltip === tooltip) {
                tooltip.remove();
                activeTooltip = null;
            }
        }, 5000);
    }
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
        mouseenter(view, line, event) {
            const marker = event.target as HTMLElement;
            // Only show tooltip on hover if not on mobile
            if (!('ontouchstart' in window)) {
                showDiagnosticTooltip(view, line, marker);
            }
            return false;
        },
        mouseleave() {
            // Remove tooltip on mouse leave for desktop
            if (activeTooltip && !('ontouchstart' in window)) {
                activeTooltip.remove();
                activeTooltip = null;
            }
            return false;
        },
        click(view, line, event) {
            // Handle click/tap for both desktop and mobile
            const marker = event.target as HTMLElement;

            // Toggle tooltip on click
            if (activeTooltip) {
                activeTooltip.remove();
                activeTooltip = null;
            } else {
                showDiagnosticTooltip(view, line, marker);
            }

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
    '.cm-diagnostic-tooltip': {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '12px',
        lineHeight: '1.4',
        color: '#d4d4d4'
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
 * Create all extensions needed for Langium LSP integration
 */
export function createLangiumExtensions() {
    return [
        diagnosticsState,
        diagnosticGutter,
        createLangumLinter(),
        semanticHighlighting,
        semanticHighlightTheme
    ];
}
