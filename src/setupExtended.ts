import { MonacoEditorLanguageClientWrapper, UserConfig, EditorAppConfigExtended } from 'monaco-editor-wrapper';
import { configureWorker, defineUserServices } from './setupCommon.js';
import { MachineExecutor } from './language/executor.js';
import { render, downloadSVG, downloadPNG, toggleTheme, initTheme } from './language/diagram-controls.js';
import { loadSettings, saveSettings } from './language/shared-settings.js';
import { renderExampleButtons } from './language/shared-examples.js';
import { ExecutionControlsWrapper } from './components/ExecutionControlsWrapper.js';
import { OutputPanel } from './language/playground-output-panel.js';
import { IDimension } from 'vscode/services';
import { KeyCode, KeyMod } from 'monaco-editor';

// Execution state
let currentExecutor: MachineExecutor | null = null;
let isExecuting = false;
let executionStepMode = false;

// Shared components
let executionControls: ExecutionControlsWrapper | null = null;
let outputPanel: OutputPanel | null = null;

// Extension registration state - ensure we only register once
let extensionRegistered = false;

// define global functions for TypeScript
declare global {
    interface Window {
        render: typeof render;
        downloadSVG: typeof downloadSVG;
        downloadPNG: typeof downloadPNG;
        toggleTheme: typeof toggleTheme;
        executeMachine: () => Promise<void>;
        stepMachine: () => Promise<void>;
        stopMachine: () => void;
        resetMachine: () => void;
    }
}

// Make functions available globally
window.render = render;
window.downloadSVG = downloadSVG;
window.downloadPNG = downloadPNG;
window.toggleTheme = toggleTheme;
window.executeMachine = executeMachine;
window.stepMachine = stepMachine;
window.stopMachine = stopMachine;
window.resetMachine = resetMachine;

export const setupConfigExtended = (src: string, options: any): UserConfig => {
    const extensionFilesOrContents = new Map();
    extensionFilesOrContents.set('/language-configuration.json', new URL('../language-configuration.json', import.meta.url));
    extensionFilesOrContents.set('/machine-grammar.json', new URL('../syntaxes/machine.tmLanguage.json', import.meta.url));
    
    // Only register extension once across all editor instances to prevent duplicate registration errors
    const extensions = extensionRegistered ? [] : [{
        config: {
            name: 'machine-web',
            publisher: 'generator-langium',
            version: '1.0.0',
            engines: {
                vscode: '*'
            },
            contributes: {
                languages: [{
                    id: 'machine',
                    extensions: [
                        '.machine'
                    ],
                    configuration: './language-configuration.json'
                }],
                grammars: [{
                    language: 'machine',
                    scopeName: 'source.machine',
                    path: './machine-grammar.json'
                }]
            }
        },
        filesOrContents: extensionFilesOrContents,
    }];
    
    // Mark extension as registered after first use
    if (!extensionRegistered) {
        extensionRegistered = true;
        console.log('Monaco extension registered for machine language');
    }
    
    const config : EditorAppConfigExtended = {
        $type: 'extended',
        languageId: 'machine',
        code: src,
        codeUri: `example-${Math.random() * 1000000000}.machine`,
        useDiffEditor: false,
        editorOptions: {
            wordWrap: "on",
            automaticLayout: true,
            ...options,
            
        },
        extensions: extensions,                
        userConfiguration: {
            json: JSON.stringify({
                'workbench.colorTheme': 'Default Dark Modern',
                'editor.semanticHighlighting.enabled': true
            })
        }
    }
    return {
        wrapperConfig: {
            serviceConfig: defineUserServices(),
            editorAppConfig: config,
        },
        languageClientConfig: configureWorker()
    };
};

/**
 * Setup settings UI
 */
function setupSettingsUI(): void {
    const modelSelect = document.getElementById('model-select-desktop') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key-input-desktop') as HTMLInputElement;

    if (!modelSelect || !apiKeyInput) {
        return;
    }

    // Load saved settings
    const settings = loadSettings();
    modelSelect.value = settings.model;
    apiKeyInput.value = settings.apiKey;

    // Save on change
    modelSelect.addEventListener('change', () => {
        const currentSettings = loadSettings();
        saveSettings(modelSelect.value, currentSettings.apiKey);
    });

    apiKeyInput.addEventListener('input', () => {
        const currentSettings = loadSettings();
        saveSettings(currentSettings.model, apiKeyInput.value);
    });
}

/**
 * Setup examples UI
 */
function setupExamplesUI(wrapper: MonacoEditorLanguageClientWrapper): void {
    const examplesContainer = document.getElementById('monaco-examples');
    if (!examplesContainer) {
        return;
    }

    // Use shared example loader with category view
    renderExampleButtons(
        examplesContainer,
        (content, example) => {
            const editor = wrapper.getEditor();
            if (editor) {
                editor.setValue(content);
            }
        },
        {
            categoryView: true,
            buttonClass: 'example-btn',
            categoryButtonClass: 'example-btn category-btn'
        }
    );
}

/**
 * Setup shared components (OutputPanel and ExecutionControls)
 */
function setupSharedComponents(outputEl: HTMLElement): void {
    // Initialize OutputPanel
    const outputContainer = document.getElementById('output-panel-container');
    if (outputContainer) {
        outputPanel = new OutputPanel({
            container: outputContainer,
            defaultFormat: 'svg',
            mobile: false
        });
    }

    // Initialize ExecutionControls (React component via wrapper)
    const executionContainer = document.getElementById('execution-controls');
    if (executionContainer) {
        executionControls = new ExecutionControlsWrapper({
            container: executionContainer,
            onExecute: executeMachine,
            onStep: stepMachine,
            onStop: stopMachine,
            onReset: resetMachine,
            mobile: false,
            showLog: true
        });
    }
}

export const executeExtended = async (htmlElement: HTMLElement, useDefault : boolean, outputEl : HTMLElement): Promise<MonacoEditorLanguageClientWrapper> => {
    // Initialize theme when the editor starts
    initTheme();
    // Setup settings UI
    setupSettingsUI();

    // Initialize shared components
    setupSharedComponents(outputEl);
    const defaultSrc = `// Machine is running in the web!
machine "Example machine, with various nodes"

state init;
state s1;
state s2;
tool validator;

context input {
  query<string>: "";
}

context data {
  meta<any>: true;
}

init -reads: query-> data;
init -"Use validator tool to vaidate query"-> validator;
init -"Once valid", writes: meta-> data;
init -then-> s1;
s1 -reads: meta-> data;
s1 -finailise-> s2;
s1 -catch-> init;
`
    const initialSrc = useDefault ? defaultSrc : htmlElement.textContent || defaultSrc;
    htmlElement.innerHTML = '';

    const userConfig = setupConfigExtended(initialSrc, {
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: {
            enabled: false
        },
        scrollBeyondLastLine: false,
        readOnly: false,

    });
    const wrapper = new MonacoEditorLanguageClientWrapper();
    await wrapper.initAndStart(userConfig, htmlElement);
    // const src = wrapper.getEditor()?.getValue();

    const client = wrapper.getLanguageClient();
    if (!client) {
        throw new Error('Unable to obtain language client for the Machine!');
    }

    const editor = wrapper.getEditor();
    const updateHeight = () => {
        if (!editor) return;
        
        const contentHeight = Math.min(1000, editor.getContentHeight());
        htmlElement.style.height = `${contentHeight}px`;
        try {
            editor.layout({ width: htmlElement.clientWidth, height: contentHeight });
        } finally {
            
        }
    };
    editor?.onDidContentSizeChange(updateHeight);
    updateHeight();
    window.onresize = function (){
        editor?.layout({} as IDimension);
    };

    // Track highlighted SVG elements for cleanup
    let currentHighlightedElements: SVGElement[] = [];

    // Setup bidirectional highlighting: Editor cursor → SVG elements
    editor?.onDidChangeCursorPosition((e) => {
        if (!outputPanel) return;

        const position = e.position;
        const line = position.lineNumber - 1; // Monaco is 1-based, our format is 0-based
        const character = position.column - 1;

        // Clear previous SVG highlights
        currentHighlightedElements.forEach(element => {
            element.style.filter = '';
            element.style.opacity = '';
        });
        currentHighlightedElements = [];

        // Find output container
        const outputContainer = document.getElementById('output-panel-container');
        if (!outputContainer) return;

        // Find all SVG elements with position data (in xlink:href or href)
        const elements = outputContainer.querySelectorAll('[href^="#L"], [*|href^="#L"]');

        elements.forEach(element => {
            const svgElement = element as SVGElement;
            const href = svgElement.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                        svgElement.getAttribute('href');

            if (!href || !href.startsWith('#L')) return;

            // Parse position from href: #L{startLine}:{startChar}-{endLine}:{endChar}
            const match = href.match(/^#L(\d+):(\d+)-(\d+):(\d+)$/);
            if (!match) return;

            const lineStart = parseInt(match[1], 10);
            const charStart = parseInt(match[2], 10);
            const lineEnd = parseInt(match[3], 10);
            const charEnd = parseInt(match[4], 10);

            // Check if cursor is within this element's range
            if (line >= lineStart && line <= lineEnd) {
                if (line === lineStart && character < charStart) return;
                if (line === lineEnd && character > charEnd) return;

                // Highlight this SVG element
                svgElement.style.filter = 'drop-shadow(0 0 8px rgba(14, 99, 156, 0.8))';
                svgElement.style.opacity = '1';
                currentHighlightedElements.push(svgElement);
            }
        });
    });

    // Setup bidirectional highlighting: SVG → Editor cursor
    if (outputPanel && editor) {
        outputPanel.setSourceLocationClickHandler((location) => {
            // Clear SVG highlights when clicking (they'll be reapplied by cursor move)
            currentHighlightedElements.forEach(element => {
                element.style.filter = '';
                element.style.opacity = '';
            });
            currentHighlightedElements = [];

            // Move cursor to the clicked location
            editor.setPosition({
                lineNumber: location.lineStart + 1, // Monaco is 1-based
                column: location.charStart + 1
            });

            // Reveal the position in the center of the editor
            editor.revealPositionInCenter({
                lineNumber: location.lineStart + 1,
                column: location.charStart + 1
            });

            // Set focus to the editor
            editor.focus();
        });
    }

    editor?.addAction({
        // An unique identifier of the contributed action.
        id: "machine-exec",

        // A label of the action that will be presented to the user.
        label: "Execute Machine",

        // An optional array of keybindings for the action.
        keybindings: [
            KeyMod.CtrlCmd | KeyCode.F10,
            // chord
            KeyMod.chord(
                KeyMod.CtrlCmd | KeyCode.KeyK,
                KeyMod.CtrlCmd | KeyCode.KeyM
            ),
        ],

        // A precondition for this action.
        precondition: undefined,

        // A rule to evaluate on top of the precondition in order to dispatch the keybindings.
        keybindingContext: undefined,

        contextMenuGroupId: "navigation",

        contextMenuOrder: 1.5,

        // Method that will be executed when the action is triggered.
        // @param editor The editor instance is passed in as a convenience
        run: function (ed) {
            alert("i'm running => " + ed.getPosition());
        },
    });

    let running = false;
    let timeout: NodeJS.Timeout | null = null;
    client.onNotification('browser/DocumentChange', (resp) => {
        // always store this new program in local storage
        if (!resp.uri.endsWith(userConfig.wrapperConfig.editorAppConfig.codeUri)) {
            return;
        }
        console.log("browser/DocumentChange", resp, userConfig)
        const value = wrapper.getModel()?.getValue();
        if (window.localStorage && value) {
            window.localStorage.setItem(resp.uri, value);
        }

        // block until we're finished with a given run
        if (running) {
            return;
        }
        
        // clear previous timeouts
        if (timeout) {
            clearTimeout(timeout);
        }

        // set a timeout to run the current code
        timeout = setTimeout(async () => {
            running = true;
            console.info('generating & running current code with Rails-Based Architecture...');
            let result = JSON.parse(resp.content);
            let data = result.$data;
            let dotCode = result.$mermaid; // Note: Despite property name, contains DOT/Graphviz format
            
            try {
                // Get API key and model from localStorage
                const settings = loadSettings();

                // Validate API key before attempting to create executor
                if (!settings.apiKey || settings.apiKey.trim() === '') {
                    console.warn('No API key configured. MachineExecutor creation skipped.');
                    // Still render the diagram even without executor
                    if (outputPanel) {
                        const tempDiv = document.createElement('div');
                        await window.render(dotCode, tempDiv, `${Math.floor(Math.random()  * 1000000000)}`);
                        outputPanel.updateData({
                            svg: tempDiv.innerHTML,
                            dot: dotCode,
                            json: JSON.stringify(data, null, 2),
                            machine: result.$machine,
                            ast: result.$machine
                        });
                    } else if (outputEl) {
                        // Fallback to old render method if outputPanel isn't available
                        window.render(dotCode, outputEl, `${Math.floor(Math.random()  * 1000000000)}`);
                    }
                    running = false;
                    return;
                }

                // Create MachineExecutor with configuration
                console.log('Creating MachineExecutor with API key present');
                currentExecutor = await MachineExecutor.create(data, {
                    llm: {
                        provider: 'anthropic' as const,
                        apiKey: settings.apiKey,
                        modelId: 'claude-3-5-sonnet-20241022'
                    }
                });

                console.log('MachineExecutor created successfully:', currentExecutor);

                running = false;
                console.log(resp, data, dotCode, currentExecutor)

                // Render SVG for OutputPanel
                if (outputPanel) {
                    const machine = result.$machine;

                    // Render SVG in a temporary div to capture the output
                    const tempDiv = document.createElement('div');
                    await window.render(dotCode, tempDiv, `${Math.floor(Math.random()  * 1000000000)}`);

                    outputPanel.updateData({
                        svg: tempDiv.innerHTML,
                        dot: dotCode,
                        json: JSON.stringify(data, null, 2),
                        machine: machine,
                        ast: machine
                    });
                } else {
                    // Fallback to old render method
                    window.render(dotCode, outputEl, `${Math.floor(Math.random()  * 1000000000)}`);
                }
            } catch (e) {
                // Improved error handling with detailed logging
                const error = e as Error;
                console.error('Failed to create MachineExecutor:', error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                
                // Still try to render the diagram even if executor creation fails
                try {
                    if (outputPanel) {
                        const tempDiv = document.createElement('div');
                        await window.render(dotCode, tempDiv, `${Math.floor(Math.random()  * 1000000000)}`);
                        outputPanel.updateData({
                            svg: tempDiv.innerHTML,
                            dot: dotCode,
                            json: JSON.stringify(data, null, 2),
                            machine: result.$machine,
                            ast: result.$machine
                        });
                    } else if (outputEl) {
                        window.render(dotCode, outputEl, `${Math.floor(Math.random()  * 1000000000)}`);
                    }
                } catch (renderError) {
                    console.error('Failed to render diagram:', renderError);
                }
                
                running = false;
            }
        }, 200);
    });

    // Setup examples UI
    setupExamplesUI(wrapper);

    return wrapper;
};

/**
 * Execution control functions
 */

function addLogEntry(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    // Use ExecutionControls if available
    if (executionControls) {
        executionControls.addLogEntry(message, type);
        return;
    }

    // Fallback to old method
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span><span class="log-message">${message}</span>`;

    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
}

function updateStatus(status: string, currentNode: string, stepCount: number) {
    // Use ExecutionControls if available
    if (executionControls) {
        executionControls.updateState({
            currentNode: currentNode,
            stepCount: stepCount
        });
        return;
    }

    // Fallback to old method
    const statusText = document.getElementById('status-text');
    const currentNodeEl = document.getElementById('current-node');
    const stepCountEl = document.getElementById('step-count');

    if (statusText) statusText.textContent = status;
    if (currentNodeEl) currentNodeEl.textContent = currentNode;
    if (stepCountEl) stepCountEl.textContent = String(stepCount);
}

function setButtonStates(executing: boolean, stepping: boolean) {
    const btnExecute = document.getElementById('btn-execute') as HTMLButtonElement;
    const btnStep = document.getElementById('btn-step') as HTMLButtonElement;
    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;

    if (btnExecute) btnExecute.disabled = executing || stepping;
    if (btnStep) btnStep.disabled = executing || !stepping;
    if (btnStop) btnStop.disabled = !executing && !stepping;
}

async function executeMachine() {
    if (isExecuting) {
        addLogEntry('Execution already in progress', 'warning');
        return;
    }

    try {
        isExecuting = true;
        executionStepMode = false;
        setButtonStates(true, false);

        addLogEntry('Starting machine execution...', 'info');
        updateStatus('Running', '-', 0);

        // Get settings
        const settings = loadSettings();

        if (!settings.apiKey) {
            addLogEntry('No API key configured. Execution will use placeholder mode.', 'warning');
        }

        // Get machine data from current editor
        // This requires accessing the executor created in executeExtended
        if (!currentExecutor) {
            addLogEntry('No executor available. Please wait for editor to initialize.', 'error');
            isExecuting = false;
            setButtonStates(false, false);
            updateStatus('Error', '-', 0);
            return;
        }

        let stepCount = 0;
        let continued = true;

        while (continued && isExecuting) {
            continued = await currentExecutor.step();
            stepCount++;

            const state = currentExecutor.getState();
            const activePath = state.paths.find(p => p.status === 'active');
            const currentNode = activePath?.currentNode || '-';

            updateStatus('Running', currentNode, stepCount);
            addLogEntry(`Step ${stepCount}: At node ${currentNode}`, 'info');

            // Small delay to allow UI updates
            await new Promise(resolve => setTimeout(resolve, 500));

            if (!continued) {
                addLogEntry('Machine execution complete', 'success');
                updateStatus('Complete', currentNode, stepCount);
                break;
            }
        }

        isExecuting = false;
        setButtonStates(false, false);
    } catch (error) {
        addLogEntry(`Execution error: ${error instanceof Error ? error.message : String(error)}`, 'error');
        updateStatus('Error', '-', 0);
        isExecuting = false;
        setButtonStates(false, false);
    }
}

async function stepMachine() {
    if (!executionStepMode) {
        // Enter step mode
        executionStepMode = true;
        setButtonStates(false, true);
        addLogEntry('Entered step-by-step mode', 'info');
        updateStatus('Step Mode', '-', 0);
        return;
    }

    if (!currentExecutor) {
        addLogEntry('No executor available', 'error');
        return;
    }

    try {
        const state = currentExecutor.getState();
        const activePath = state.paths.find(p => p.status === 'active');
        const stepCount = activePath?.stepCount || 0;

        addLogEntry(`Executing step ${stepCount + 1}...`, 'info');

        const continued = await currentExecutor.step();
        const newState = currentExecutor.getState();
        const newActivePath = newState.paths.find(p => p.status === 'active');
        const currentNode = newActivePath?.currentNode || '-';
        const totalSteps = newActivePath?.stepCount || 0;

        updateStatus('Step Mode', currentNode, totalSteps);
        addLogEntry(`Step ${totalSteps}: At node ${currentNode}`, 'info');

        if (!continued) {
            addLogEntry('Machine execution complete', 'success');
            updateStatus('Complete', currentNode, totalSteps);
            executionStepMode = false;
            setButtonStates(false, false);
        }
    } catch (error) {
        addLogEntry(`Step error: ${error instanceof Error ? error.message : String(error)}`, 'error');
        executionStepMode = false;
        setButtonStates(false, false);
    }
}

function stopMachine() {
    let currentNode = '-';
    let stepCount = 0;

    if (currentExecutor) {
        const state = currentExecutor.getState();
        const activePath = state.paths.find(p => p.status === 'active');
        currentNode = activePath?.currentNode || '-';
        stepCount = activePath?.stepCount || 0;
    }

    if (isExecuting) {
        isExecuting = false;
        addLogEntry('Execution stopped by user', 'warning');
        updateStatus('Stopped', currentNode, stepCount);
    }

    if (executionStepMode) {
        executionStepMode = false;
        addLogEntry('Exited step-by-step mode', 'info');
        updateStatus('Stopped', currentNode, stepCount);
    }

    setButtonStates(false, false);
}

function resetMachine() {
    stopMachine();

    // Clear log
    const logContent = document.getElementById('log-content');
    if (logContent) {
        logContent.innerHTML = '';
    }

    currentExecutor = null;
    updateStatus('Not Running', '-', 0);
    addLogEntry('Machine reset', 'info');
}
