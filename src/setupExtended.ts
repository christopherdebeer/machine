import { MonacoEditorLanguageClientWrapper, UserConfig, EditorAppConfigExtended } from 'monaco-editor-wrapper';
import { configureWorker, defineUserServices } from './setupCommon.js';
import { RailsExecutor } from './language/rails-executor.js';
import { render, downloadSVG, downloadPNG, toggleTheme, initTheme } from './language/diagram-controls.js';
import { IDimension } from 'vscode/services';
import { KeyCode, KeyMod } from 'monaco-editor';

// LocalStorage keys
const STORAGE_KEYS = {
    MODEL: 'dygram_selected_model',
    API_KEY: 'dygram_api_key'
};

// Execution state
let currentExecutor: RailsExecutor | null = null;
let isExecuting = false;
let executionStepMode = false;

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
        saveSettings(modelSelect.value, apiKeyInput.value);
    });

    apiKeyInput.addEventListener('input', () => {
        saveSettings(modelSelect.value, apiKeyInput.value);
    });
}

export const executeExtended = async (htmlElement: HTMLElement, useDefault : boolean, outputEl : HTMLElement): Promise<MonacoEditorLanguageClientWrapper> => {
    // Initialize theme when the editor starts
    initTheme();
    // Setup settings UI
    setupSettingsUI();
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
            let mermaid = result.$mermaid;
            
            try {
                // Get API key and model from localStorage
                const settings = loadSettings();

                // Validate API key before attempting to create executor
                if (!settings.apiKey || settings.apiKey.trim() === '') {
                    console.warn('No API key configured. RailsExecutor creation skipped.');
                    // Still render the diagram even without executor
                    window.render(mermaid, outputEl, `${Math.floor(Math.random()  * 1000000000)}`);
                    running = false;
                    return;
                }

                // Create RailsExecutor with configuration
                console.log('Creating RailsExecutor with API key present');
                currentExecutor = await RailsExecutor.create(data, {
                    llm: {
                        provider: 'anthropic' as const,
                        apiKey: settings.apiKey,
                        modelId: 'claude-3-5-sonnet-20241022'
                    },
                    agentSDK: {
                        model: 'sonnet' as const,
                        maxTurns: 20,
                        persistHistory: false, // Don't persist in playground
                        apiKey: settings.apiKey
                    }
                });

                // Set up machine update callback to update editor when agent modifies machine
                currentExecutor.setMachineUpdateCallback((dsl: string) => {
                    if (editor) {
                        console.log('Machine definition updated by agent, updating editor');
                        addLogEntry('Machine definition updated by agent', 'info');
                        editor.setValue(dsl);
                    }
                });

                console.log('RailsExecutor created successfully:', currentExecutor);

                running = false;
                console.log(resp, data, mermaid, currentExecutor)
                window.render(mermaid, outputEl, `${Math.floor(Math.random()  * 1000000000)}`)
            } catch (e) {
                // Improved error handling with detailed logging
                const error = e as Error;
                console.error('Failed to create RailsExecutor:', error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                
                // Still try to render the diagram even if executor creation fails
                try {
                    window.render(mermaid, outputEl, `${Math.floor(Math.random()  * 1000000000)}`);
                } catch (renderError) {
                    console.error('Failed to render diagram:', renderError);
                }
                
                running = false;
            }
        }, 200);
    });

    return wrapper;
};

/**
 * Execution control functions
 */

function addLogEntry(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
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

            const context = currentExecutor.getContext();
            updateStatus('Running', context.currentNode, stepCount);
            addLogEntry(`Step ${stepCount}: At node ${context.currentNode}`, 'info');

            // Small delay to allow UI updates
            await new Promise(resolve => setTimeout(resolve, 500));

            if (!continued) {
                addLogEntry('Machine execution complete', 'success');
                updateStatus('Complete', context.currentNode, stepCount);
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
        const context = currentExecutor.getContext();
        const stepCount = context.history.length;

        addLogEntry(`Executing step ${stepCount + 1}...`, 'info');

        const continued = await currentExecutor.step();
        const newContext = currentExecutor.getContext();

        updateStatus('Step Mode', newContext.currentNode, newContext.history.length);
        addLogEntry(`Step ${newContext.history.length}: At node ${newContext.currentNode}`, 'info');

        if (!continued) {
            addLogEntry('Machine execution complete', 'success');
            updateStatus('Complete', newContext.currentNode, newContext.history.length);
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
    if (isExecuting) {
        isExecuting = false;
        addLogEntry('Execution stopped by user', 'warning');
        updateStatus('Stopped', currentExecutor?.getContext().currentNode || '-', currentExecutor?.getContext().history.length || 0);
    }

    if (executionStepMode) {
        executionStepMode = false;
        addLogEntry('Exited step-by-step mode', 'info');
        updateStatus('Stopped', currentExecutor?.getContext().currentNode || '-', currentExecutor?.getContext().history.length || 0);
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
