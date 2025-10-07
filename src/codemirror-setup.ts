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
import { MachineExecutor } from './language/machine-executor.js';
import { EvolutionaryExecutor } from './language/task-evolution.js';
import { createStorage } from './language/storage.js';

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
 * Convert parsed Machine AST to MachineData format for executor
 */
function convertToMachineData(machine: Machine): any {
    const nodes: any[] = [];
    const edges: any[] = [];

    // Process nodes
    machine.nodes?.forEach(node => {
        const nodeData: any = {
            name: node.name,
            type: node.type || 'state'
        };

        // Convert attributes
        if (node.attributes && node.attributes.length > 0) {
            nodeData.attributes = node.attributes.map(attr => ({
                name: attr.name,
                type: attr.type || 'string',
                value: attr.value?.value || attr.value || ''
            }));
        }

        nodes.push(nodeData);
    });

    // Process edges - the AST has a more complex structure with segments
    machine.edges?.forEach(edge => {
        // Each edge can have multiple segments
        edge.segments?.forEach(segment => {
            // Each segment connects source nodes to target nodes
            edge.source?.forEach(sourceRef => {
                segment.target?.forEach(targetRef => {
                    const edgeData: any = {
                        source: sourceRef.ref?.name || '',
                        target: targetRef.ref?.name || ''
                    };

                    // Extract label information from segment
                    if (segment.label && segment.label.length > 0) {
                        const labelParts: string[] = [];
                        segment.label.forEach(edgeType => {
                            edgeType.value?.forEach(attr => {
                                if (attr.text) {
                                    labelParts.push(String(attr.text));
                                } else if (attr.name) {
                                    labelParts.push(attr.name);
                                }
                            });
                        });
                        if (labelParts.length > 0) {
                            edgeData.label = labelParts.join(' ');
                        }
                    }

                    // Set edge type based on arrow type
                    if (segment.endType) {
                        edgeData.type = segment.endType;
                    }

                    edges.push(edgeData);
                });
            });
        });
    });

    return {
        title: machine.title || 'Untitled Machine',
        nodes,
        edges
    };
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
        
        // Initialize storage system
        const storage = getStorage();
        
        outputElement.innerHTML = '<div class="loading">Creating evolutionary executor...</div>';

        // Create EvolutionaryExecutor with storage and LLM configuration
        let executor: EvolutionaryExecutor;
        
        const llmConfig = settings.apiKey.trim() ? {
            llm: {
                provider: 'anthropic' as const, // Use Anthropic for better browser compatibility
                apiKey: settings.apiKey,
                modelId: settings.model
            }
        } : {};

        console.log('🔧 Creating EvolutionaryExecutor with config:', {
            hasApiKey: !!settings.apiKey.trim(),
            apiKeyPrefix: settings.apiKey.substring(0, 10) + '...',
            model: settings.model,
            llmConfig
        });

        // Create base executor first with proper LLM client
        const baseExecutor = llmConfig.llm ? 
            await MachineExecutor.create(machineData, llmConfig) :
            new MachineExecutor(machineData, llmConfig);
        
        // Create EvolutionaryExecutor by extending the properly configured base executor
        executor = new EvolutionaryExecutor(machineData, llmConfig, storage);
        
        // Replace the LLM client with the properly configured one
        if (llmConfig.llm && baseExecutor) {
            (executor as any).llmClient = (baseExecutor as any).llmClient;
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
        
        if (hasTaskNodes && hasApiKey) {
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
            console.log('⚠️ Simulating execution without API key...');
            // Simulate execution without LLM calls for demo purposes
            try {
                const stepped = await executor.step();
                if (stepped) {
                    executionResult = executor.getContext();
                }
                console.log('🔄 Simulated execution result:', { stepped, executionResult });
            } catch (execError) {
                console.warn('❌ Simulated execution failed:', execError);
            }
        } else {
            console.log('ℹ️ No task nodes or API key - skipping execution');
        }

        // Get task metrics and evolution information
        const taskMetrics = executor.getTaskMetrics();
        const mutations = executor.getMutations();
        const evolutions = mutations.filter((m: any) => m.type === 'task_evolution');

        // Generate both static and runtime diagrams
        const staticMermaidCode = await generateMermaidFromCode(code);
        let runtimeMermaidCode = staticMermaidCode;
        
        if (executionResult) {
            // Generate runtime diagram showing execution state
            runtimeMermaidCode = executor.toMermaidRuntime();
        }

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
                ${evolutions.length > 0 ? `Evolutions: ${evolutions.length}<br>` : ''}
                Time: ${timestamp}
            </div>
        `;

        // Add execution history if available
        if (executionResult && executionResult.history.length > 0) {
            outputHTML += `
                <div style="margin-top: 12px; padding: 8px; background: #2d2d30; border-radius: 4px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 4px;">Execution History:</div>
                    ${executionResult.history.map((step: any, idx: number) => `
                        <div style="color: #d4d4d4; font-size: 11px;">
                            ${idx + 1}. ${step.from} → ${step.to} (${step.transition})
                            ${step.output ? `<br>&nbsp;&nbsp;&nbsp;&nbsp;Output: ${String(step.output).substring(0, 50)}${String(step.output).length > 50 ? '...' : ''}` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Add task evolution metrics if available
        if (taskMetrics.size > 0) {
            outputHTML += `
                <div style="margin-top: 12px; padding: 8px; background: #2d2d30; border-radius: 4px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 4px;">Task Evolution Status:</div>
                    ${Array.from(taskMetrics.entries()).map(([taskName, metrics]) => `
                        <div style="color: #d4d4d4; font-size: 11px; margin-bottom: 4px;">
                            <strong>${taskName}</strong>: ${metrics.stage} 
                            (${metrics.execution_count} runs, ${(metrics.success_rate * 100).toFixed(1)}% success)
                            ${metrics.code_path ? `<br>&nbsp;&nbsp;&nbsp;&nbsp;Code: ${metrics.code_path}` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Add evolution events if any occurred
        if (evolutions.length > 0) {
            outputHTML += `
                <div style="margin-top: 12px; padding: 8px; background: #2d2d30; border-radius: 4px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 4px;">Evolution Events:</div>
                    ${evolutions.map((evolution: any, idx: number) => `
                        <div style="color: #4ec9b0; font-size: 11px;">
                            ${idx + 1}. ${evolution.data.task}: ${evolution.data.from_stage} → ${evolution.data.to_stage}
                            <br>&nbsp;&nbsp;&nbsp;&nbsp;Generated: ${evolution.data.code_path}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Add storage information
        outputHTML += `
            <div style="margin-top: 12px; padding: 8px; background: #2d2d30; border-radius: 4px;">
                <div style="color: #cccccc; font-size: 12px; margin-bottom: 4px;">Storage:</div>
                <div style="color: #d4d4d4; font-size: 11px;">
                    Backend: ${storage.constructor.name}<br>
                    Patterns: Available for reuse<br>
                    Persistence: ${storage.constructor.name !== 'MemoryStorage' ? 'Enabled' : 'Session-only'}
                </div>
            </div>
        `;

        outputElement.innerHTML = outputHTML;

        // Render the appropriate diagram (runtime if available, otherwise static)
        if (diagramElement) {
            diagramElement.innerHTML = '<div class="loading">Rendering diagram...</div>';
            await renderDiagram(runtimeMermaidCode, diagramElement);
        }

        // Save machine version to storage for future reference
        try {
            const machineId = machineData.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const versionKey = `machine_${machineId}_${Date.now()}`;
            
            await storage.saveMachineVersion(versionKey, {
                version: `v${Date.now()}`,
                timestamp: new Date().toISOString(),
                machine_data: machineData,
                mutations_since_last: mutations,
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
