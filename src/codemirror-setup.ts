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
import { RailsExecutor } from './language/rails-executor.js';
import { createStorage } from './language/storage.js';
import { createLangiumExtensions } from './codemirror-langium.js';
import { loadSettings, saveSettings } from './language/shared-settings.js';
import { renderExampleButtons } from './language/shared-examples.js';

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
function scheduleUpdateDiagram(code: string, diagramElement: HTMLElement | null): void {
    if (updateDiagramTimeout !== null) {
        clearTimeout(updateDiagramTimeout);
    }

    updateDiagramTimeout = window.setTimeout(async () => {
        if (diagramElement) {
            try {
                const dotCode = await generateGraphvizFromCode(code);
                await renderDiagram(dotCode, diagramElement);
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
            if (transaction.docChanged && diagramElement) {
                const code = editorView?.state.doc.toString() || '';
                scheduleUpdateDiagram(code, diagramElement);
            }
        }
    });

    // Example buttons are now set up dynamically by loadDynamicExamples()

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
        if (editorView && outputElement) {
            const code = editorView.state.doc.toString();
            executeCode(code, outputElement, diagramElement);
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
 * Generate Graphviz DOT diagram from Machine DSL code using the actual parser and generator
 */
async function generateGraphvizFromCode(code: string): Promise<string> {
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

        // Generate Graphviz DOT diagram using the actual generator
        const result = generateGraphviz(model, 'playground.machine', undefined);
        return result.content;
    } catch (error) {
        console.error('Error generating Graphviz from code:', error);
        // Return a simple error diagram in DOT format
        const errorMsg = (error instanceof Error ? error.message : 'Unknown error').replace(/"/g, '\\"');
        return `digraph {
    rankdir=TB;
    node [shape=box, style=filled, fillcolor="#ff6b6b", fontcolor=white];
    Error [label="Error: ${errorMsg}"];
}`;
    }
}

/**
 * Escape HTML characters to prevent XSS and ensure proper display in HTML
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
async function executeCode(code: string, outputElement: HTMLElement | null, diagramElement: HTMLElement | null): Promise<void> {
    if (!outputElement) return;

    outputElement.innerHTML = '<div class="loading">Initializing runtime system...</div>';

    try {
        // Parse the code using the actual Langium parser
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

        // Convert to MachineData format for executor
        const machineData = convertToMachineData(model);
        
        // Get settings for LLM configuration
        const settings = loadSettings();

        // Initialize storage system (kept for future use but not required for RailsExecutor)
        const storage = getStorage();

        outputElement.innerHTML = '<div class="loading">Creating executor...</div>';

        // Create RailsExecutor with LLM configuration
        let executor: RailsExecutor | null = null;

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

        console.log('🔧 Creating RailsExecutor with config:', {
            hasApiKey: !!settings.apiKey.trim(),
            apiKeyPrefix: settings.apiKey.substring(0, 10) + '...',
            model: settings.model,
            llmConfig
        });

        // Create RailsExecutor with proper LLM client
        if (llmConfig.llm) {
            try {
                executor = await RailsExecutor.create(machineData, llmConfig);
                console.log('✅ RailsExecutor created successfully');
            } catch (error) {
                console.error('❌ Failed to create RailsExecutor:', error);
            }
        } else {
            // Create executor without LLM for static analysis only
            executor = new RailsExecutor(machineData, {});
            console.log('✅ RailsExecutor created (no API key - static mode only)');
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

        outputElement.innerHTML = '<div class="loading">Executing machine...</div>';

        let executionResult = null;
        let executionSteps = 0;
        let maxSteps = 10; // Prevent infinite loops in demo

        // Generate static Graphviz diagram
        const staticDotCode = await generateGraphvizFromCode(code);

        // Render the static diagram initially
        if (diagramElement) {
            diagramElement.innerHTML = '<div class="loading">Rendering diagram...</div>';
            try {
                await renderDiagram(staticDotCode, diagramElement);
            } catch (err) {
                console.warn(`Failed to render diagram/`)
                console.error(err);
            } 
        }
        
        if (hasTaskNodes && hasApiKey && executor) {
            console.log('🚀 Starting execution with LLM support...');
            try {
                // Execute the machine step by step until completion or max steps
                while (executionSteps < maxSteps) {
                    console.log(`🔄 Attempting step ${executionSteps + 1}...`);
                    const stepped = await executor.step();
                    executionSteps++;

                    console.log(`✅ Step ${executionSteps} result:`, { stepped, currentContext: executor.getContext() });

                    if (!stepped) {
                        console.log('🛑 No more transitions available');
                        break;
                    }

                    // Update UI with progress
                    outputElement.innerHTML = `<div class="loading">Executing step ${executionSteps}...</div>`;
                }

                executionResult = executor.getContext();
                console.log('🏁 Final execution result:', executionResult);
            } catch (execError) {
                console.error('❌ Execution failed:', execError);
                // Continue with static analysis even if execution fails
            }
        } else if (hasTaskNodes && !hasApiKey) {
            console.log('⚠️ Machine with tasks but no API key - showing static analysis only');
        } else {
            console.log('ℹ️ No task nodes - static analysis only');
        }

        // Get mutations from executor if available
        const mutations = executor ? executor.getMutations() : [];

        // Use the static Graphviz diagram
        let runtimeDotCode = staticDotCode;

        console.log('🎨 Diagram generation:', {
            hasExecutionResult: !!executionResult,
            usingGraphviz: true
        });

        // Display comprehensive results
        const lines = code.split('\n').length;
        const timestamp = new Date().toISOString();
        
        let statusMessage = '✓ Machine parsed and analyzed';
        let statusColor = '#4ec9b0';
        
        if (executionResult && executionSteps > 0) {
            statusMessage = `✓ Machine executed (${executionSteps} steps) - Current: ${executionResult.currentNode}`;
            statusColor = '#4ec9b0';
        } else if (hasTaskNodes && !hasApiKey) {
            statusMessage = '⚠ Machine ready (API key required for task execution)';
            statusColor = '#ffa500';
        } else if (hasTaskNodes && hasApiKey) {
            statusMessage = '⚠ Machine parsed (execution failed - check credentials)';
            statusColor = '#ffa500';
        }

        // Build detailed output
        let outputHTML = `
            <div style="color: ${statusColor}; margin-bottom: 12px;">
                ${statusMessage}
            </div>
            <div style="color: #858585; font-size: 12px;">
                Lines: ${lines}<br>
                Nodes: ${machineData.nodes.length} (${taskNodes.length} tasks)<br>
                Edges: ${machineData.edges.length}<br>
                ${executionResult ? `Visited: ${executionResult.visitedNodes.size}<br>` : ''}
                ${mutations.length > 0 ? `Mutations: ${mutations.length}<br>` : ''}
                Time: ${timestamp}
            </div>
        `;

        // Add execution history if available
        if (executionResult && executionResult.history.length > 0) {
            outputHTML += `
                <div style="margin-top: 12px; padding: 8px; background: #2d2d30; border-radius: 4px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 4px;">Execution History:</div>
                    ${executionResult.history.map((step: any, idx: number) => {
                        let outputDisplay = '';
                        if (step.output) {
                            let serializedOutput: string;
                            if (typeof step.output === 'object' && step.output !== null) {
                                try {
                                    serializedOutput = JSON.stringify(step.output);
                                } catch (error) {
                                    serializedOutput = String(step.output);
                                }
                            } else {
                                serializedOutput = String(step.output);
                            }
                            outputDisplay = `<br>&nbsp;&nbsp;&nbsp;&nbsp;Output: ${serializedOutput.substring(0, 50)}${serializedOutput.length > 50 ? '...' : ''}`;
                        }
                        return `
                        <div style="color: #d4d4d4; font-size: 11px;">
                            ${idx + 1}. ${step.from} → ${step.to} (${step.transition})
                            ${outputDisplay}
                        </div>
                    `;
                    }).join('')}
                </div>
            `;
        }

        // Add mutations if any occurred
        if (mutations.length > 0) {
            outputHTML += `
                <div style="margin-top: 12px; padding: 8px; background: #2d2d30; border-radius: 4px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 4px;">Machine Mutations:</div>
                    ${mutations.slice(0, 10).map((mutation: any, idx: number) => `
                        <div style="color: #4ec9b0; font-size: 11px;">
                            ${idx + 1}. ${mutation.type}${mutation.data ? ': ' + JSON.stringify(mutation.data).substring(0, 50) : ''}
                        </div>
                    `).join('')}
                    ${mutations.length > 10 ? `<div style="color: #858585; font-size: 11px; margin-top: 4px;">... and ${mutations.length - 10} more</div>` : ''}
                </div>
            `;
        }

        
        // Add intermediate information
        outputHTML += `
            <div style="margin-top: 12px; padding: 8px; background: #2d2d30; border-radius: 4px;">
                <div style="color: #cccccc; font-size: 12px; margin-bottom: 4px;">[${machineData.title}] Diagram source (Graphviz DOT):</div>
                <div style="color: #d4d4d4; font-size: 11px;">
                    <pre><code>${escapeHtml(staticDotCode)}</code></pre>
                </div>
            </div>
        `;

        outputElement.innerHTML = outputHTML;

        // Render the final diagram
        if (diagramElement) {
            diagramElement.innerHTML = '<div class="loading">Rendering diagram...</div>';
            try {
                await renderDiagram(runtimeDotCode, diagramElement);
            } catch (err) {
                console.warn(`Failed to render diagram`)
                console.error(err);
            }
        }

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
            
            // Create safe mutations copy
            const safeMutations = mutations.map((mutation: any) => ({
                type: mutation.type,
                timestamp: mutation.timestamp,
                data: mutation.data || {}
            }));
            
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
        outputElement.innerHTML = `
            <div class="error">
                <strong>Runtime Error:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
            </div>
        `;
    }
}
