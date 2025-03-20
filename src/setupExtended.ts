import { MonacoEditorLanguageClientWrapper, UserConfig } from 'monaco-editor-wrapper';
import { configureWorker, defineUserServices } from './setupCommon.js';
import { MachineExecutor } from './language/machine-executor.js';
import { render, downloadSVG, downloadPNG, toggleTheme, initTheme } from './language/diagram-controls.js';

// define global functions for TypeScript
declare global {
    interface Window {
        render: typeof render;
        downloadSVG: typeof downloadSVG;
        downloadPNG: typeof downloadPNG;
        toggleTheme: typeof toggleTheme;
    }
}

// Make functions available globally
window.render = render;
window.downloadSVG = downloadSVG;
window.downloadPNG = downloadPNG;
window.toggleTheme = toggleTheme;

export const setupConfigExtended = (): UserConfig => {
    const extensionFilesOrContents = new Map();
    extensionFilesOrContents.set('/language-configuration.json', new URL('../language-configuration.json', import.meta.url));
    extensionFilesOrContents.set('/machine-grammar.json', new URL('../syntaxes/machine.tmLanguage.json', import.meta.url));

    return {
        wrapperConfig: {
            serviceConfig: defineUserServices(),
            editorAppConfig: {
                $type: 'extended',
                languageId: 'machine',
                code: `// Machine is running in the web!
machine "Example machine, with various nodes"

state init;
state s1;
state s2;
tool validator;

context input {
  query<string>;
}

context data {
  meta<any>;
}

init -reads: query-> data;
init -"Use validator tool to vaidate query"-> validator;
init -"Once valid", writes: meta-> data;
init -then-> s1;
s1 -reads: meta-> data;
s1 -finailise-> s2;
s1 -catch-> init;
`,
                useDiffEditor: false,
                extensions: [{
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
                }],                
                userConfiguration: {
                    json: JSON.stringify({
                        'workbench.colorTheme': 'Default Dark Modern',
                        'editor.semanticHighlighting.enabled': true
                    })
                }
            }
        },
        languageClientConfig: configureWorker()
    };
};

export const executeExtended = async (htmlElement: HTMLElement) => {
    // Initialize theme when the editor starts
    initTheme();

    const userConfig = setupConfigExtended();
    const wrapper = new MonacoEditorLanguageClientWrapper();
    await wrapper.initAndStart(userConfig, htmlElement);
    wrapper.getEditor()?.updateOptions({
        wordWrap: "on"
    })
    const src = wrapper.getEditor()?.getValue();
    console.log(src);

    const client = wrapper.getLanguageClient();
    if (!client) {
        throw new Error('Unable to obtain language client for the Minilogo!');
    }

    let running = false;
    let timeout: NodeJS.Timeout | null = null;
    client.onNotification('browser/DocumentChange', (resp) => {
        // always store this new program in local storage
        const value = wrapper.getModel()?.getValue();
        if (window.localStorage && value) {
            window.localStorage.setItem('mainCode', value);
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
            console.info('generating & running current code...');
            let result = JSON.parse(resp.content);
            let data = result.$data;
            let mermaid = result.$mermaid;
            try {
                const executor = new MachineExecutor({
                    title: 'asdas',
                    nodes: [{
                        name: 'foo'
                    }],
                    edges: []
                })
                // await executor.step();
                running = false;
                console.log(resp, data, mermaid, executor)
                window.render(mermaid)
            } catch (e) {
                // failed at some point, log & disable running so we can try again
                console.error(e);
                running = false;
            }
        }, 200);
    });
};
