import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from './language/machine-module.js';
import { Machine } from './language/generated/ast.js';
import { generateJSON, generateGraphviz } from './language/generator/generator.js';
import { render as renderGraphviz, downloadSVG, downloadPNG } from './language/diagram-controls.js';
import { MachineExecutor } from './language/executor.js';
import { createStorage } from './language/storage.js';
import { createLangiumExtensions } from './codemirror-langium.js';
import { loadSettings, saveSettings } from './language/shared-settings.js';
import { renderExampleButtons } from './language/shared-examples.js';
import { ExecutionControlsWrapper } from './components/ExecutionControlsWrapper.js';
import { OutputPanel } from './language/playground-output-panel.js';

// Initialize Langium services for parsing
const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

// Example code snippets - will be populated dynamically
const examples: Record<string, string> = {
    basic: `machine "Hello World"

state start;
state end;

start -> end;`,

    workflow: `machine "Task Management"

Input task {
    description<string>: "TBD";
    priority<number>: 5;
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

/**
 * Load examples dynamically using shared example loader
 */
export async function loadDynamicExamples(): Promise<void> {
    try {
        const examplesContainer = document.querySelector('.examples');
        if (!examplesContainer) return;

        // Use shared example loader with category view
        renderExampleButtons(
            examplesContainer as HTMLElement,
            (content, example) => {
                if (editorView) {
                    editorView.dispatch({
                        changes: {
                            from: 0,
                            to: editorView.state.doc.length,
                            insert: content,
                        },
                    });
                }
            },
            {
                categoryView: true,
                buttonClass: 'example-btn',
                categoryButtonClass: 'example-btn category-btn'
            }
        );
    } catch (error) {
        console.error('Error loading dynamic examples:', error);
    }
}

let editorView: EditorView | null = null;
let updateDiagramTimeout: number | null = null;

// Shared components
let executionControls: ExecutionControlsWrapper | null = null;
let outputPanel: OutputPanel | null = null;

// Current executor
let currentExecutor: MachineExecutor | null = null;

/**
 * Render Graphviz DOT diagram
 */
async function renderDiagram(dotCode: string, container: HTMLElement): Promise<void> {
    try {
        console.log('[Playground] Rendering diagram with Graphviz...');
        await renderGraphviz(dotCode, container);
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
 * Update diagram with debouncing
 */
function scheduleUpdateDiagram(code: string): void {
    if (updateDiagramTimeout !== null) {
        clearTimeout(updateDiagramTimeout);
    }

    updateDiagramTimeout = window.setTimeout(async () => {
        if (outputPanel) {
            try {
                const dotCode = await generateGraphvizFromCode(code);
                const tempDiv = window.document.createElement('div');
                await renderDiagram(dotCode, tempDiv);

                // Parse the code to get the machine model
                const langiumDoc = await parse(code);
                const model = langiumDoc.parseResult.value as Machine;

                if (model) {
                    // Convert to JSON for OutputPanel
                    const machineData = convertToMachineData(model);
                    outputPanel.updateData({
                        svg: tempDiv.innerHTML,
                        dot: dotCode,
                        json: JSON.stringify(machineData, null, 2),
                        machine: model,
                        ast: model
                    });
                }
            } catch (error) {
                console.error('Error updating diagram:', error);
            }
        }
    }, 500); // 500ms debounce
}

/**
 * Setup shared components (OutputPanel and ExecutionControls)
 */
function setupSharedComponents(): void {
    // Initialize OutputPanel
    const outputContainer = document.getElementById('output-panel-container');
    if (outputContainer) {
        outputPanel = new OutputPanel({
            container: outputContainer,
            defaultFormat: 'svg',
            mobile: true // Mobile-optimized
        });
    }

    // Initialize ExecutionControls (React component via wrapper)
    const executionContainer = document.getElementById('execution-controls');
    if (executionContainer) {
        executionControls = new ExecutionControlsWrapper({
            container: executionContainer,
            onExecute: executeFullMachine,
            onStep: stepMachine,
            onStop: stopMachine,
            onReset: resetMachine,
            mobile: true, // Mobile-optimized
            showLog: true
        });
    }
}

/**
 * Execute full machine (auto-execute all steps)
 */
async function executeFullMachine(): Promise<void> {
    if (!currentExecutor) {
        if (executionControls) {
            executionControls.addLogEntry('No executor available. Please run code first.', 'error');
        }
        return;
    }

    let stepCount = 0;
    const maxSteps = 10;

    while (stepCount < maxSteps) {
        const stepped = await currentExecutor.step();
        stepCount++;

        const state = currentExecutor.getState();
        const primaryPath = state.paths[0];
        if (executionControls) {
            executionControls.updateState({
                currentNode: primaryPath.currentNode,
                stepCount: primaryPath.history.length
            });
            executionControls.addLogEntry(`Step ${stepCount}: At node ${primaryPath.currentNode}`, 'info');
        }

        if (!stepped) {
            if (executionControls) {
                executionControls.addLogEntry('Machine execution complete', 'success');
            }
            break;
        }
    }
}

/**
 * Execute one step
 */
async function stepMachine(): Promise<void> {
    if (!currentExecutor) {
        if (executionControls) {
            executionControls.addLogEntry('No executor available. Please run code first.', 'error');
        }
        return;
    }

    const stepped = await currentExecutor.step();
    const state = currentExecutor.getState();
    const primaryPath = state.paths[0];

    if (executionControls) {
        executionControls.updateState({
            currentNode: primaryPath.currentNode,
            stepCount: primaryPath.history.length
        });
        executionControls.addLogEntry(`Step: At node ${primaryPath.currentNode}`, 'info');
    }

    if (!stepped) {
        if (executionControls) {
            executionControls.addLogEntry('Machine execution complete', 'success');
        }
    }
}

/**
 * Stop execution
 */
function stopMachine(): void {
    // Reset state
    if (executionControls) {
        executionControls.addLogEntry('Execution stopped', 'warning');
    }
}

/**
 * Reset machine
 */
function resetMachine(): void {
    currentExecutor = null;
    if (executionControls) {
        executionControls.clearLog();
        executionControls.addLogEntry('Machine reset', 'info');
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
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;

    if (!editorElement) {
        console.error('Editor element not found');
        return;
    }

    // Initialize shared components
    setupSharedComponents();

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
            // Langium LSP integration: diagnostics and semantic highlighting
            ...createLangiumExtensions(),
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
            if (transaction.docChanged) {
                const code = editorView?.state.doc.toString() || '';
                scheduleUpdateDiagram(code);
            }
        }
    });

    // Example buttons are now set up dynamically by loadDynamicExamples()

    // Set up run button
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            if (editorView) {
                const code = editorView.state.doc.toString();
                executeCode(code);
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
            const currentSettings = loadSettings();
            saveSettings(modelSelect.value, currentSettings.apiKey);
        });
    }

    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', () => {
            const currentSettings = loadSettings();
            saveSettings(currentSettings.model, apiKeyInput.value);
        });
    }

    // Auto-run on load
    setTimeout(() => {
        if (editorView) {
            const code = editorView.state.doc.toString();
            executeCode(code);
        }
    }, 500);
}

/**
 * Convert parsed Machine AST to MachineData format for executor
 * This function safely extracts data from the Langium AST without circular references
 */
function convertToMachineData(machine: Machine): any {
    const json = generateJSON(machine)
    console.log("convertToMachineData JSON", json.content)
    return JSON.parse(json.content);
}

/**
 * Generate an error diagram showing parse/validation errors using Graphviz DOT format
 * This matches the behavior in Monaco's main-browser.ts
 */
function generateErrorDiagram(errors: Array<{message: string, line?: number, col?: number}>): string {
    if (errors.length === 0) {
        return "";
    }

    const escapeLabel = (str: string) => str.replace(/"/g, '\\"').replace(/\n/g, '\\n');

    let diagram = `digraph {\n`;
    diagram += `  // Graph attributes\n`;
    diagram += `  rankdir=TB;\n`;
    diagram += `  node [shape=box, fontname="Arial", fontsize=12];\n\n`;

    diagram += `  ErrorHeader [label="⚠️ Parse Errors Detected (${errors.length})", `;
    diagram += `fillcolor="#ff6b6b", style=filled, fontcolor=white];\n\n`;

    errors.forEach((error, index) => {
        const errorId = `E${index}`;
        const location = error.line !== undefined && error.col !== undefined
            ? `Line ${error.line}:${error.col}\\n`
            : '';
        const message = escapeLabel(error.message);

        diagram += `  ${errorId} [label="${location}${message}", `;
        diagram += `fillcolor="#ffe0e0", style=filled, color="#ff6b6b"];\n`;
        diagram += `  ErrorHeader -> ${errorId};\n`;
    });

    diagram += `}\n`;
    return diagram;
}

/**
 * Generate Graphviz DOT diagram from Machine DSL code using the actual parser and generator
 */
async function generateGraphvizFromCode(code: string): Promise<string> {
    try {
        // Parse the code using the Langium parser
        const document = await parse(code);

        // Check for parser errors - but don't throw, generate error diagram instead
        if (document.parseResult.parserErrors.length > 0) {
            const errors = document.parseResult.parserErrors.map(e => {
                // Extract position information if available
                let line: number | undefined;
                let col: number | undefined;

                if (e.token && typeof e.token === 'object') {
                    const token = e.token as any;
                    if (token.startLine !== undefined) {
                        line = token.startLine;
                        col = token.startColumn !== undefined ? token.startColumn : undefined;
                    }
                }

                return {
                    message: e.message,
                    line,
                    col
                };
            });

            // Generate error diagram like Monaco does
            return generateErrorDiagram(errors);
        }

        // Check if we got a valid machine
        const model = document.parseResult.value as Machine;
        if (!model) {
            return generateErrorDiagram([{ message: 'Failed to parse machine: no model returned' }]);
        }

        // Generate Graphviz DOT diagram using the actual generator
        const result = generateGraphviz(model, 'playground.machine', undefined);
        return result.content;
    } catch (error) {
        console.error('Error generating Graphviz from code:', error);
        // Return an error diagram in DOT format
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return generateErrorDiagram([{ message: errorMsg }]);
    }
}

// Global storage instance for persistence
let globalStorage: any = null;

/**
 * Get or create storage instance
 */
function getStorage() {
    if (!globalStorage) {
        globalStorage = createStorage(); // Auto-selects best available (IndexedDB > localStorage > memory)
    }
    return globalStorage;
}

/**
 * Execute the code using the full EvolutionaryExecutor system
 */
async function executeCode(code: string): Promise<void> {
    if (!outputPanel) {
        console.error('OutputPanel not initialized');
        return;
    }

    try {
        // Parse the code using the actual Langium parser
        const document = await parse(code);

        // Check for parser errors - handle gracefully like Monaco does
        if (document.parseResult.parserErrors.length > 0) {
            const errors = document.parseResult.parserErrors.map(e => {
                let line: number | undefined;
                let col: number | undefined;

                if (e.token && typeof e.token === 'object') {
                    const token = e.token as any;
                    if (token.startLine !== undefined) {
                        line = token.startLine;
                        col = token.startColumn !== undefined ? token.startColumn : undefined;
                    }
                }

                return {
                    message: e.message,
                    line,
                    col
                };
            });

            // Generate error diagram
            const errorDiagram = generateErrorDiagram(errors);

            // Render the error diagram to OutputPanel
            const tempDiv = window.document.createElement('div');
            try {
                await renderDiagram(errorDiagram, tempDiv);
                outputPanel.updateData({
                    svg: tempDiv.innerHTML,
                    dot: errorDiagram
                });
            } catch (err) {
                console.warn('Failed to render error diagram:', err);
            }

            return;
        }

        // Check if we got a valid machine
        const model = document.parseResult.value as Machine;
        if (!model) {
            const errorDiagram = generateErrorDiagram([{ message: 'Failed to parse machine: no model returned' }]);

            const tempDiv = window.document.createElement('div');
            try {
                await renderDiagram(errorDiagram, tempDiv);
                outputPanel.updateData({
                    svg: tempDiv.innerHTML,
                    dot: errorDiagram
                });
            } catch (err) {
                console.warn('Failed to render error diagram:', err);
            }

            return;
        }

        // Convert to MachineData format for executor
        const machineData = convertToMachineData(model);
        
        // Get settings for LLM configuration
        const settings = loadSettings();

        // Initialize storage system (kept for future use but not required for MachineExecutor)
        const storage = getStorage();

        // Create MachineExecutor with LLM configuration
        let executor: MachineExecutor | null = null;

        const llmConfig = settings.apiKey.trim() ? {
            llm: {
                provider: 'anthropic' as const, // Use Anthropic for better browser compatibility
                apiKey: settings.apiKey,
                modelId: settings.model
            },
            agentSDK: {
                model: 'sonnet' as const,
                maxTurns: 20,
                persistHistory: false,
                apiKey: settings.apiKey
            }
        } : {};

        console.log('🔧 Creating MachineExecutor with config:', {
            hasApiKey: !!settings.apiKey.trim(),
            apiKeyPrefix: settings.apiKey.substring(0, 10) + '...',
            model: settings.model,
            llmConfig
        });

        // Create MachineExecutor with proper LLM client
        if (llmConfig.llm) {
            try {
                executor = await MachineExecutor.create(machineData, llmConfig);
                currentExecutor = executor; // Store globally for execution controls
                console.log('✅ MachineExecutor created successfully');
            } catch (error) {
                console.error('❌ Failed to create MachineExecutor:', error);
            }
        } else {
            // Create executor without LLM for static analysis only
            executor = new MachineExecutor(machineData, {});
            currentExecutor = executor; // Store globally for execution controls
            console.log('✅ MachineExecutor created (no API key - static mode only)');
        }

        // Identify task nodes for execution
        const taskNodes = machineData.nodes.filter((node: any) => 
            node.type === 'Task' || node.type === 'task' || 
            (node.attributes && node.attributes.some((attr: any) => attr.name === 'prompt'))
        );

        const hasTaskNodes = taskNodes.length > 0;
        const hasApiKey = settings.apiKey.trim().length > 0;

        console.log('🔍 Task analysis:', {
            totalNodes: machineData.nodes.length,
            taskNodes: taskNodes.map((n: any) => ({ name: n.name, type: n.type, attributes: n.attributes })),
            hasTaskNodes,
            hasApiKey,
            apiKeyLength: settings.apiKey.length
        });

        let executionResult = null;
        let executionSteps = 0;
        let maxSteps = 10; // Prevent infinite loops in demo

        // Generate static Graphviz diagram
        const staticDotCode = await generateGraphvizFromCode(code);

        // Render the static diagram initially using OutputPanel
        const tempDiv = window.document.createElement('div');
        try {
            await renderDiagram(staticDotCode, tempDiv);
            outputPanel.updateData({
                svg: tempDiv.innerHTML,
                dot: staticDotCode,
                json: JSON.stringify(machineData, null, 2),
                machine: model,
                ast: model
            });
        } catch (err) {
            console.warn(`Failed to render diagram`);
            console.error(err);
        }
        
        if (hasTaskNodes && executor) {
            console.log('🚀 Starting execution...');
            try {
                // Execute the machine step by step until completion or max steps
                while (executionSteps < maxSteps) {
                    console.log(`🔄 Attempting step ${executionSteps + 1}...`);
                    const stepped = await executor.step();
                    executionSteps++;

                    const currentState = executor.getState();
                    console.log(`✅ Step ${executionSteps} result:`, { stepped, currentState });

                    if (!stepped) {
                        console.log('🛑 No more transitions available');
                        break;
                    }
                }

                executionResult = executor.getState();
                console.log('🏁 Final execution result:', executionResult);
            } catch (execError) {
                console.error('❌ Execution failed:', execError);

                // Log API key related errors
                const errorMessage = execError instanceof Error ? execError.message : String(execError);
                if (!hasApiKey || errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('unauthorized')) {
                    console.log('⚠️ Execution failed: API key required for agent decisions');
                }
                // Continue with static analysis even if execution fails
            }
        } else {
            console.log('ℹ️ No task nodes - static analysis only');
        }

        // Log execution summary
        console.log('🎨 Execution complete:', {
            hasExecutionResult: !!executionResult,
            executionSteps,
            hasTaskNodes,
            hasApiKey
        });

        // Save machine version to storage for future reference
        try {
            const machineId = machineData.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const versionKey = `machine_${machineId}_${Date.now()}`;

            // Create a safe copy of machine data without circular references
            const safeMachineData = {
                title: machineData.title,
                nodes: machineData.nodes.map((node: any) => ({
                    name: node.name,
                    type: node.type,
                    attributes: node.attributes ? node.attributes.map((attr: any) => ({
                        name: attr.name,
                        type: attr.type,
                        value: attr.value
                    })) : []
                })),
                edges: machineData.edges.map((edge: any) => ({
                    source: edge.source,
                    target: edge.target,
                    label: edge.label,
                    type: edge.type
                }))
            };

            // Machine mutations are no longer tracked separately
            // The full execution state includes all state changes
            const safeMutations: any[] = [];

            await storage.saveMachineVersion(versionKey, {
                version: `v${Date.now()}`,
                timestamp: new Date().toISOString(),
                machine_data: safeMachineData,
                mutations_since_last: safeMutations,
                performance_metrics: {
                    avg_execution_time_ms: executionSteps * 100, // Rough estimate
                    success_rate: executionResult ? 1.0 : 0.5,
                    cost_per_execution: hasApiKey ? 0.01 : 0,
                    execution_count: executionSteps
                }
            });
        } catch (storageError) {
            console.warn('Failed to save machine version:', storageError);
        }

    } catch (error) {
        console.error('Runtime error:', error);
        // Display error in OutputPanel
        if (outputPanel) {
            const errorDiagram = generateErrorDiagram([{
                message: error instanceof Error ? error.message : 'Unknown error'
            }]);
            const tempDiv = window.document.createElement('div');
            try {
                await renderDiagram(errorDiagram, tempDiv);
                outputPanel.updateData({
                    svg: tempDiv.innerHTML,
                    dot: errorDiagram
                });
            } catch (err) {
                console.error('Failed to render error diagram:', err);
            }
        }
    }
}
