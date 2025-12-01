/**
 * Monaco Playground - React Application
 *
 * Full React implementation of the Monaco editor playground with styled-components
 *
 * @deprecated This playground uses the legacy example loading system with embedded examples.
 *
 * TODO: Migrate to Files API to match CodeMirror playground:
 * - Replace ExampleButtons with UnifiedFileTree component
 * - Use FileAccessService to load examples from /api/files/list
 * - Deprecate shared-examples.ts embedded example system
 * - Load examples dynamically from examples/ directory via API
 * - Enable file creation/editing like CodeMirrorPlayground
 *
 * See src/components/CodeMirrorPlayground.tsx for reference implementation.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';
import { setupConfigExtended } from '../setupExtended';
import { configureMonacoWorkers } from '../setupCommon';
import { ExecutionControls } from './ExecutionControls';
// @deprecated TODO: Replace ExampleButtons with UnifiedFileTree - migrate to Files API
import { ExampleButtons } from './ExampleButtons';
import { loadSettings, saveSettings } from '../language/shared-settings';
import { OutputPanel, OutputData, OutputFormat } from './OutputPanel';
import { createMachineServices } from '../language/machine-module';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from '../language/generated/ast';
import { generateJSON } from '../language/generator/generator';
import { serializeMachineToJSON } from '../language/json/serializer';
import { generateGraphvizFromJSON } from '../language/diagram/index';
import { render as renderGraphviz } from '../language/diagram-controls';
// @deprecated TODO: Replace shared-examples with FileAccessService - migrate to Files API
import { getExampleByKey, type Example } from '../language/shared-examples';

// Styled Components
const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
`;

const Header = styled.div`
    background: #252526;
    padding: 12px 16px;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 0.6em;
`;

const HeaderLeft = styled.div`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6em;
`;

const HeaderTitle = styled.div`
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;

    a {
        color: #ffffff;
        text-decoration: none;
    }
`;

const SettingsGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;

    label {
        font-size: 12px;
        color: #cccccc;
        white-space: nowrap;
    }
`;

const SettingsInput = styled.input`
    background: #3e3e42;
    color: #d4d4d4;
    border: 1px solid #505053;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;

    &:focus {
        outline: none;
        border-color: #0e639c;
    }
`;

const SettingsSelect = styled.select`
    background: #3e3e42;
    color: #d4d4d4;
    border: 1px solid #505053;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;

    &:focus {
        outline: none;
        border-color: #0e639c;
    }
`;

const HeaderRight = styled.div`
    display: flex;
    gap: 8px;
`;

const Button = styled.button`
    background: #0e639c;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
        background: #1177bb;
    }

    &.secondary {
        background: #3e3e42;

        &:hover {
            background: #505053;
        }
    }
`;

const Wrapper = styled.div`
    display: flex;
    flex: 1;
    overflow: hidden;
`;

const EditorSection = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid #3e3e42;
`;

const EditorContainer = styled.div`
    flex: 1;
    overflow: hidden;
`;

const ExamplesSection = styled.div`
    padding: 12px 16px;
    background: #252526;
    border-top: 1px solid #3e3e42;

    h3 {
        font-size: 14px;
        margin-bottom: 8px;
        color: #cccccc;
    }
`;

const OutputSection = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const OutputContainer = styled.div`
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

const ExecutionSection = styled.div`
    flex: 0 0 auto;
    height: auto;
    flex-grow: 1;
    overflow: hidden;
`;

// Main Component
export const MonacoPlayground: React.FC = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const executionRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<MonacoEditorLanguageClientWrapper | null>(null);
    const updateTimeoutRef = useRef<number | null>(null);

    const [settings, setSettings] = useState(() => loadSettings());
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');
    const [outputData, setOutputData] = useState<OutputData>({});
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('svg');

    // PNG generation utility
    const generatePngFromSvg = useCallback(async (svgContent: string): Promise<string | undefined> => {
        if (!svgContent) return undefined;
        try {
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            try {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => {
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        if (!context) {
                            reject(new Error('Unable to obtain 2D canvas context'));
                            return;
                        }
                        canvas.width = image.width;
                        canvas.height = image.height;
                        context.drawImage(image, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    };
                    image.onerror = () => reject(new Error('Unable to load SVG for PNG conversion'));
                    image.src = url;
                });
                return dataUrl;
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Failed to generate PNG from SVG:', error);
            return undefined;
        }
    }, []);

    // Handle document changes with debouncing
    const handleDocumentChange = useCallback(async (code: string) => {
        // Clear previous timeout
        if (updateTimeoutRef.current !== null) {
            clearTimeout(updateTimeoutRef.current);
        }

        // Schedule update with debouncing
        updateTimeoutRef.current = window.setTimeout(async () => {
            try {
                // Initialize Langium services for parsing
                const services = createMachineServices(EmptyFileSystem);
                const parse = parseHelper<Machine>(services.Machine);

                // Parse the code
                const document = await parse(code);

                // Check for parser errors
                if (document.parseResult.parserErrors.length > 0) {
                    console.warn('Parse errors detected:', document.parseResult.parserErrors);
                }

                // Get the machine model
                const model = document.parseResult.value as Machine;
                if (!model) {
                    console.warn('No machine model parsed');
                    return;
                }

                // Convert Machine AST to JSON and generate Graphviz DOT
                const machineJson = serializeMachineToJSON(model);
                const dotCode = generateGraphvizFromJSON(machineJson);

                // Generate JSON representation
                const jsonResult = generateJSON(model);
                const jsonData = jsonResult.content;

                // Render SVG in a temporary div
                const tempDiv = window.document.createElement('div');
                await renderGraphviz(dotCode, tempDiv, `${Math.floor(Math.random() * 1000000000)}`);

                // Generate PNG from SVG
                const pngDataUrl = await generatePngFromSvg(tempDiv.innerHTML);

                // Update output data state
                setOutputData({
                    svg: tempDiv.innerHTML,
                    png: pngDataUrl,
                    dot: dotCode,
                    json: jsonData,
                    machine: model,
                    ast: model,
                });
            } catch (error) {
                console.error('Error updating diagram:', error);
            }
        }, 500); // 500ms debounce
    }, [generatePngFromSvg]);

    // Initialize Monaco workers
    useEffect(() => {
        configureMonacoWorkers();
    }, []);

    // Initialize editor
    useEffect(() => {
        if (!editorRef.current) return;

        const initEditor = async () => {
            const defaultCode = `// Machine is running in the web!
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
init -"Use validator tool to validate query"-> validator;
init -"Once valid", writes: meta-> data;
init -then-> s1;
s1 -reads: meta-> data;
s1 -finalize-> s2;
s1 -catch-> init;
`;

            const userConfig = setupConfigExtended(defaultCode, {
                theme: theme === 'dark' ? 'vs-dark' : 'vs',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                readOnly: false,
            });

            const wrapper = new MonacoEditorLanguageClientWrapper();
            await wrapper.initAndStart(userConfig, editorRef.current!);
            wrapperRef.current = wrapper;

            // Setup auto-resize
            const editor = wrapper.getEditor();
            if (editor) {
                const updateHeight = () => {
                    const contentHeight = Math.min(1000, editor.getContentHeight());
                    editorRef.current!.style.height = `${contentHeight}px`;
                    try {
                        editor.layout({
                            width: editorRef.current!.clientWidth,
                            height: contentHeight
                        });
                    } catch (e) {
                        // Ignore layout errors
                    }
                };
                editor.onDidContentSizeChange(updateHeight);
                updateHeight();

                // Listen for content changes to update diagram
                editor.onDidChangeModelContent(() => {
                    const code = editor.getValue();
                    handleDocumentChange(code);
                });
            }

            // Trigger initial render
            handleDocumentChange(defaultCode);
        };

        initEditor();

        return () => {
            if (wrapperRef.current) {
                wrapperRef.current.dispose();
            }
        };
    }, [theme, handleDocumentChange]);

    // Handle settings changes
    const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const newModel = e.target.value;
        setSettings(prev => {
            const updated = { ...prev, model: newModel };
            saveSettings(updated.model, updated.apiKey);
            return updated;
        });
    }, []);

    const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newApiKey = e.target.value;
        setSettings(prev => {
            const updated = { ...prev, apiKey: newApiKey };
            saveSettings(updated.model, updated.apiKey);
            return updated;
        });
    }, []);

    // Handle theme toggle
    const handleToggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    // Handle downloads
    const handleDownloadSVG = useCallback(() => {
        if (window.downloadSVG) {
            window.downloadSVG();
        }
    }, []);

    const handleDownloadPNG = useCallback(() => {
        if (window.downloadPNG) {
            window.downloadPNG();
        }
    }, []);

    // Handle output format change
    const handleOutputFormatChange = useCallback((format: OutputFormat) => {
        setOutputFormat(format);
    }, []);

    // Handle example loading
    const handleLoadExample = useCallback((content: string) => {
        const editor = wrapperRef.current?.getEditor();
        if (editor) {
            editor.setValue(content);
            // Trigger diagram update
            handleDocumentChange(content);
        }
    }, [handleDocumentChange]);

    // Execution handlers (to be implemented with MachineExecutor)
    const handleExecute = useCallback(async () => {
        console.log('Execute machine');
        // Implementation will use MachineExecutor
    }, []);

    const handleStep = useCallback(async () => {
        console.log('Step machine');
        // Implementation will use MachineExecutor
    }, []);

    const handleStop = useCallback(() => {
        console.log('Stop machine');
    }, []);

    const handleReset = useCallback(() => {
        console.log('Reset machine');
    }, []);

    return (
        <Container>
            <Header>
                <HeaderLeft>
                    <HeaderTitle>
                        <a href="./">DyGram</a>
                    </HeaderTitle>
                    <SettingsGroup>
                        <label htmlFor="model-select">Model:</label>
                        <SettingsSelect
                            id="model-select"
                            value={settings.model}
                            onChange={handleModelChange}
                        >
                            <option value="anthropic.claude-3-5-sonnet-20241022-v2:0">
                                Claude 3.5 Sonnet v2
                            </option>
                            <option value="anthropic.claude-3-5-sonnet-20240620-v1:0">
                                Claude 3.5 Sonnet
                            </option>
                            <option value="anthropic.claude-3-sonnet-20240229-v1:0">
                                Claude 3 Sonnet
                            </option>
                            <option value="anthropic.claude-3-haiku-20240307-v1:0">
                                Claude 3 Haiku
                            </option>
                        </SettingsSelect>
                    </SettingsGroup>
                    <SettingsGroup>
                        <label htmlFor="api-key-input">API Key:</label>
                        <SettingsInput
                            type="password"
                            id="api-key-input"
                            placeholder="AWS credentials..."
                            value={settings.apiKey}
                            onChange={handleApiKeyChange}
                        />
                    </SettingsGroup>
                </HeaderLeft>
                <HeaderRight>
                    <Button className="secondary" onClick={handleDownloadSVG}>
                        Download SVG
                    </Button>
                    <Button className="secondary" onClick={handleDownloadPNG}>
                        Download PNG
                    </Button>
                    <Button className="secondary" onClick={handleToggleTheme}>
                        Toggle Theme
                    </Button>
                </HeaderRight>
            </Header>

            <Wrapper>
                <EditorSection>
                    <EditorContainer ref={editorRef} />
                    <ExamplesSection>
                        <h3>Examples</h3>
                        <ExampleButtons onLoadExample={handleLoadExample} categoryView={true} />
                    </ExamplesSection>
                </EditorSection>

                <OutputSection>
                    <OutputContainer ref={outputRef}>
                        <OutputPanel
                            defaultFormat={outputFormat}
                            mobile={false}
                            data={outputData}
                            onFormatChange={handleOutputFormatChange}
                        />
                    </OutputContainer>
                </OutputSection>
            </Wrapper>

            <ExecutionSection ref={executionRef}>
                <ExecutionControls
                    onExecute={handleExecute}
                    onStep={handleStep}
                    onStop={handleStop}
                    onReset={handleReset}
                    mobile={false}
                    showLog={true}
                />
            </ExecutionSection>
        </Container>
    );
};
