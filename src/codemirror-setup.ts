import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import mermaid from 'mermaid';

// Initialize mermaid with custom settings
mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    htmlLabels: true
});

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
 * Download the diagram as SVG
 */
function downloadSVG(): void {
    const svg = document.querySelector('#diagram svg');
    if (!svg) {
        alert('No diagram to download. Please run the code first.');
        return;
    }
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'machine_diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download the diagram as PNG
 */
function downloadPNG(): void {
    const svg = document.querySelector('#diagram svg');
    if (!svg) {
        alert('No diagram to download. Please run the code first.');
        return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2D context for canvas');
        return;
    }
    const loader = new Image();

    loader.onload = function() {
        canvas.width = loader.width;
        canvas.height = loader.height;
        ctx.drawImage(loader, 0, 0);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'machine_diagram.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    const serializer = new XMLSerializer();
    const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serializer.serializeToString(svg));
    loader.src = source;
}

/**
 * Render Mermaid diagram
 */
async function renderDiagram(mermaidCode: string, container: HTMLElement): Promise<void> {
    try {
        const uniqueId = "mermaid-svg-" + Date.now();
        await mermaid.mermaidAPI.getDiagramFromText(mermaidCode);
        const render = await mermaid.render(uniqueId, mermaidCode);
        container.innerHTML = render.svg;
        render.bindFunctions?.(container);
    } catch (error) {
        console.error('Error rendering diagram:', error);
        container.innerHTML = `
            <div class="error">
                <strong>Diagram Error:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
            </div>
        `;
    }
}

/**
 * Set up CodeMirror editor with mobile-optimized configuration
 */
export function setupCodeMirrorPlayground(): void {
    const editorElement = document.getElementById('editor');
    const runBtn = document.getElementById('run-btn');
    const downloadSvgBtn = document.getElementById('download-svg-btn');
    const downloadPngBtn = document.getElementById('download-png-btn');
    const outputElement = document.getElementById('outputInfo');
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

    // Set up download SVG button
    if (downloadSvgBtn) {
        downloadSvgBtn.addEventListener('click', () => {
            downloadSVG();
        });
    }

    // Set up download PNG button
    if (downloadPngBtn) {
        downloadPngBtn.addEventListener('click', () => {
            downloadPNG();
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
 * Generate a simple Mermaid diagram from Machine DSL code
 */
function generateMermaidFromCode(code: string): string {
    // This is a simplified parser - in production this would use the Langium parser
    // Extract states
    const states: string[] = [];
    const stateRegex = /state\s+(\w+)/g;
    let match;
    while ((match = stateRegex.exec(code)) !== null) {
        states.push(match[1]);
    }

    // Extract transitions
    const transitions: Array<{from: string, to: string, label?: string}> = [];
    const transitionRegex = /(\w+)\s*-([^>]*)->\s*(\w+)/g;
    while ((match = transitionRegex.exec(code)) !== null) {
        const label = match[2].trim();
        transitions.push({
            from: match[1],
            to: match[3],
            label: label || undefined
        });
    }

    // Generate Mermaid code
    let mermaid = 'stateDiagram-v2\n';

    // Add transitions (which will implicitly define states)
    for (const t of transitions) {
        if (t.label) {
            mermaid += `    ${t.from} --> ${t.to}: ${t.label}\n`;
        } else {
            mermaid += `    ${t.from} --> ${t.to}\n`;
        }
    }

    // If no transitions but we have states, just list them
    if (transitions.length === 0 && states.length > 0) {
        for (const state of states) {
            mermaid += `    ${state}\n`;
        }
    }

    return mermaid;
}

/**
 * Execute the code and display results
 */
async function executeCode(code: string, outputElement: HTMLElement | null, diagramElement: HTMLElement | null): Promise<void> {
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

        // Generate Mermaid diagram
        const mermaidCode = generateMermaidFromCode(code);

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

        // Render Mermaid diagram
        if (diagramElement) {
            diagramElement.innerHTML = '<div class="loading">Rendering diagram...</div>';
            await renderDiagram(mermaidCode, diagramElement);
        }
    } catch (error) {
        outputElement.innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
            </div>
        `;
    }
}

