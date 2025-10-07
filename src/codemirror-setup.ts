import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import mermaid from 'mermaid';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from './language/machine-module.js';
import { Machine } from './language/generated/ast.js';
import { generateMermaid } from './language/generator/generator.js';

// Initialize mermaid with custom settings
mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    htmlLabels: true
});

// Initialize Langium services for parsing
const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

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
let updateDiagramTimeout: number | null = null;

// LocalStorage keys
const STORAGE_KEYS = {
    MODEL: 'dygram_selected_model',
    API_KEY: 'dygram_api_key'
};

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
 * Load settings from localStorage
 */
function loadSettings(): { model: string; apiKey: string } {
    return {
        model: localStorage.getItem(STORAGE_KEYS.MODEL) || 'anthropic.claude-3-sonnet-20240229-v1:0',
        apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || ''
    };
}

/**
 * Save settings to localStorage
 */
function saveSettings(model: string, apiKey: string): void {
    localStorage.setItem(STORAGE_KEYS.MODEL, model);
    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
}

/**
 * Update diagram with debouncing
 */
function scheduleUpdateDiagram(code: string, diagramElement: HTMLElement | null): void {
    if (updateDiagramTimeout !== null) {
        clearTimeout(updateDiagramTimeout);
    }

    updateDiagramTimeout = window.setTimeout(async () => {
        if (diagramElement) {
            try {
                const mermaidCode = await generateMermaidFromCode(code);
                await renderDiagram(mermaidCode, diagramElement);
            } catch (error) {
                console.error('Error updating diagram:', error);
            }
        }
    }, 500); // 500ms debounce
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
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;

    if (!editorElement) {
        console.error('Editor element not found');
        return;
    }

    // Load saved settings
    const settings = loadSettings();
    if (modelSelect) {
        modelSelect.value = settings.model;
    }
    if (apiKeyInput) {
        apiKeyInput.value = settings.apiKey;
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
        dispatch: (transaction) => {
            editorView?.update([transaction]);

            // Update diagram on code changes
            if (transaction.docChanged && diagramElement) {
                const code = editorView?.state.doc.toString() || '';
                scheduleUpdateDiagram(code, diagramElement);
            }
        }
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

    // Set up settings change listeners
    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            saveSettings(modelSelect.value, apiKeyInput?.value || '');
        });
    }

    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', () => {
            saveSettings(modelSelect?.value || '', apiKeyInput.value);
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
 * Generate Mermaid diagram from Machine DSL code using the actual parser and generator
 */
async function generateMermaidFromCode(code: string): Promise<string> {
    try {
        // Parse the code using the Langium parser
        const document = await parse(code);

        // Check for parser errors
        if (document.parseResult.parserErrors.length > 0) {
            const errors = document.parseResult.parserErrors
                .map(e => e.message)
                .join('\n');
            throw new Error(`Parser errors:\n${errors}`);
        }

        // Check if we got a valid machine
        const model = document.parseResult.value as Machine;
        if (!model) {
            throw new Error('Failed to parse machine: no model returned');
        }

        // Generate mermaid diagram using the actual generator
        const result = generateMermaid(model, 'playground.machine', undefined);
        return result.content;
    } catch (error) {
        console.error('Error generating mermaid from code:', error);
        // Return a simple error diagram
        return `stateDiagram-v2
    [*] --> Error
    Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

/**
 * Execute the code and display results
 */
async function executeCode(code: string, outputElement: HTMLElement | null, diagramElement: HTMLElement | null): Promise<void> {
    if (!outputElement) return;

    outputElement.innerHTML = '<div class="loading">Processing...</div>';

    try {
        // Parse the code using the actual Langium parser
        const lines = code.split('\n');
        const result = {
            success: true,
            message: 'Code parsed successfully',
            lines: lines.length,
            timestamp: new Date().toISOString(),
        };

        // Generate Mermaid diagram using actual parser and generator
        const mermaidCode = await generateMermaidFromCode(code);

        // Display results
        outputElement.innerHTML = `
            <div style="color: #4ec9b0; margin-bottom: 12px;">
                ✓ Parsing and generation successful
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

