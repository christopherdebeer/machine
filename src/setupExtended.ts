/**
 * Monaco Editor Configuration for DyGram
 *
 * Provides setupConfigExtended function to configure Monaco editor
 * with DyGram language support
 */

import { UserConfig, EditorAppConfigExtended } from 'monaco-editor-wrapper';
import { configureWorker, defineUserServices } from './setupCommon.js';

// Extension registration state - ensure we only register once
let extensionRegistered = false;

/**
 * Setup Monaco editor configuration with DyGram language support
 */
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

    const config: EditorAppConfigExtended = {
        $type: 'extended',
        languageId: 'machine',
        code: src,
        codeUri: 'example-' + Math.random() * 1000000000 + '.machine',
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
    };

    return {
        wrapperConfig: {
            serviceConfig: defineUserServices(),
            editorAppConfig: config,
        },
        languageClientConfig: configureWorker()
    };
};
