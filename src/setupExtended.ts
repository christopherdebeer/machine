import { MonacoEditorLanguageClientWrapper, UserConfig } from 'monaco-editor-wrapper';
import { configureWorker, defineUserServices } from './setupCommon.js';

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
    const userConfig = setupConfigExtended();
    const wrapper = new MonacoEditorLanguageClientWrapper();
    await wrapper.initAndStart(userConfig, htmlElement);
};
