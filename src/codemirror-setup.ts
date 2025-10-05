import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';

// Example code snippets
const examples = {
    basic: `machine "Hello World"

state start;
state end;

start -> end;`,

    workflow: `machine "Task Management"

Input task {
    description<string>: "TBD";
    priority<Integer>: 5;
};

Task process {
    prompt: "Analyze task: {{ task.description }}";
};

Result output {
    status: "TBD";
};

task -requires-> process;
process -produces-> output;`,

    system: `machine "Data Pipeline"

Concept source "API Endpoint" {
    url: "https://api.example.com/data";
    format: "JSON";
};

Concept processor "Data Transform" {
    operation: "normalize";
    validation: true;
};

Concept destination "Database" {
    type: "PostgreSQL";
    table: "processed_data";
};

source -feeds-> processor;
processor -stores-> destination;`
};

let editorView: EditorView | null = null;

/**
 * Set up CodeMirror editor with mobile-optimized configuration
 */
export function setupCodeMirrorPlayground(): void {
    const editorElement = document.getElementById('editor');
    const runBtn = document.getElementById('run-btn');
    const shareBtn = document.getElementById('share-btn');
    const outputElement = document.getElementById('output');
    const diagramElement = document.getElementById('diagram');

    if (!editorElement) {
        console.error('Editor element not found');
        return;
    }

    // Create editor state with extensions
    const startState = EditorState.create({
        doc: examples.basic,
        extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
                ...lintKeymap,
            ]),
            oneDark,
            EditorView.lineWrapping,
            // Mobile-specific: larger touch targets
            EditorView.theme({
                '&': {
                    fontSize: '14px',
                },
                '.cm-scroller': {
                    fontFamily: 'Monaco, Courier New, monospace',
                },
                '.cm-gutters': {
                    fontSize: '13px',
                },
            }),
        ],
    });

    // Clear loading message
    editorElement.innerHTML = '';

    // Create editor view
    editorView = new EditorView({
        state: startState,
        parent: editorElement,
    });

    // Set up example buttons
    const exampleButtons = document.querySelectorAll('.example-btn');
    exampleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const example = btn.getAttribute('data-example') as keyof typeof examples;
            if (example && examples[example] && editorView) {
                editorView.dispatch({
                    changes: {
                        from: 0,
                        to: editorView.state.doc.length,
                        insert: examples[example],
                    },
                });
            }
        });
    });

    // Set up run button
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            if (editorView && outputElement) {
                const code = editorView.state.doc.toString();
                executeCode(code, outputElement, diagramElement);
            }
        });
    }

    // Set up share button
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (editorView) {
                const code = editorView.state.doc.toString();
                shareCode(code);
            }
        });
    }

    // Auto-run on load
    setTimeout(() => {
        if (editorView && outputElement) {
            const code = editorView.state.doc.toString();
            executeCode(code, outputElement, diagramElement);
        }
    }, 500);
}

/**
 * Execute the code and display results
 */
function executeCode(code: string, outputElement: HTMLElement | null, diagramElement: HTMLElement | null): void {
    if (!outputElement) return;

    outputElement.innerHTML = '<div class="loading">Processing...</div>';

    try {
        // Parse the code (simplified - in real implementation would use Langium parser)
        const lines = code.split('\n');
        const result = {
            success: true,
            message: 'Code parsed successfully',
            lines: lines.length,
            timestamp: new Date().toISOString(),
        };

        // Display results
        outputElement.innerHTML = `
            <div style="color: #4ec9b0; margin-bottom: 12px;">
                ✓ Execution successful
            </div>
            <div style="color: #858585; font-size: 12px;">
                Lines: ${result.lines}<br>
                Time: ${result.timestamp}
            </div>
        `;

        // In a real implementation, this would generate and render a Mermaid diagram
        if (diagramElement) {
            diagramElement.innerHTML = `
                <div style="text-align: center; padding: 24px; color: #858585;">
                    <svg width="200" height="100" viewBox="0 0 200 100">
                        <rect x="10" y="10" width="80" height="40" fill="#0e639c" rx="4"/>
                        <text x="50" y="35" text-anchor="middle" fill="white" font-size="12">Start</text>
                        <line x1="90" y1="30" x2="110" y2="30" stroke="#858585" stroke-width="2" marker-end="url(#arrowhead)"/>
                        <rect x="110" y="10" width="80" height="40" fill="#0e639c" rx="4"/>
                        <text x="150" y="35" text-anchor="middle" fill="white" font-size="12">End</text>
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                                <polygon points="0 0, 10 3, 0 6" fill="#858585"/>
                            </marker>
                        </defs>
                    </svg>
                    <div style="margin-top: 12px; font-size: 12px;">
                        Diagram visualization (simplified)
                    </div>
                </div>
            `;
        }
    } catch (error) {
        outputElement.innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
            </div>
        `;
    }
}

/**
 * Share code via clipboard or Web Share API
 */
function shareCode(code: string): void {
    if (navigator.share) {
        navigator.share({
            title: 'DyGram Code',
            text: code,
        }).catch(err => {
            console.error('Error sharing:', err);
            fallbackCopyToClipboard(code);
        });
    } else {
        fallbackCopyToClipboard(code);
    }
}

/**
 * Fallback copy to clipboard
 */
function fallbackCopyToClipboard(text: string): void {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Code copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy code');
        });
    } else {
        alert('Sharing not supported in this browser');
    }
}
