/**
 * CodeMirror Playground - React Application
 * 
 * Full React implementation of the CodeMirror editor playground with styled-components
 * Mobile-optimized version
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { ExecutionControls } from './ExecutionControls';
import { ExampleButtons } from './ExampleButtons';
import { loadSettings, saveSettings } from '../language/shared-settings';
import { OutputPanel, OutputData } from './OutputPanel';
import { createLangiumExtensions } from '../codemirror-langium';
import { createMachineServices } from '../language/machine-module';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from '../language/generated/ast';
import { generateGraphviz, generateJSON } from '../language/generator/generator';
import { render as renderGraphviz } from '../language/diagram-controls';
import { RailsExecutor } from '../language/rails-executor';
import { RuntimeVisualizer } from '../language/runtime-visualizer';
import type { MachineData } from '../language/base-executor';

// Styled Components
const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    overflow: hidden;
`;

const Header = styled.div`
    background: #252526;
    padding: 12px 16px;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
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

const HeaderActions = styled.div`
    display: flex;
    gap: 8px;
`;

const Button = styled.button`
    background: #0e639c;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.2s;

    &:active {
        background: #1177bb;
    }

    &.secondary {
        background: #3e3e42;

        &:active {
            background: #505053;
        }
    }
`;

const SectionHeader = styled.div<{ $collapsed?: boolean, $sideways?: boolean }>`
    background: #2d2d30;
    padding: 0.25em 0.6em;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #cccccc;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
    flex: 0 0 auto;

    &:hover {
        background: #333336;
    }

    @media (min-width: 768px) {
        writing-mode: ${props => props.$sideways ? 'sideways-lr;' : 'unset'};
    }
`;

const ToggleBtn = styled.button`
    background: transparent;
    border: none;
    color: #cccccc;
    font-size: 16px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const SettingsPanel = styled.div<{ $collapsed?: boolean }>`
    background: #252526;
    padding: 0.3em;
    border-bottom: 1px solid #3e3e42;
    display: ${props => props.$collapsed ? 'none' : 'flex'};
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
`;

const SettingsGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 200px;

    label {
        font-size: 12px;
        color: #cccccc;
        white-space: nowrap;
    }
`;

const SettingsInput = styled.input`
    flex: 1;
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
    flex: 1;
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

const ExamplesContainer = styled.div`
    background: #252526;
    padding: 0.4em;
    display: flex;
    gap: 0.3em;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    min-height: 44px;
    flex-wrap: wrap;
`;

const MainContainer = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;

    @media (min-width: 768px) {
        flex-direction: row;
    }
`;

const EditorSection = styled.div<{ $collapsed?: boolean }>`
    flex: ${props => props.$collapsed ? '0 0 0' : '1 1 0'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: flex 0.3s ease;
    height: ${props => props.$collapsed ? '0' : 'auto'};
    min-height: 0;

    @media (min-width: 768px) {
        border-right: 1px solid #3e3e42;
    }
`;

const SectionContent = styled.div<{ $collapsed?: boolean }>`
    flex: ${props => props.$collapsed ? '0 0 0' : '1 1 0'};
    overflow: ${props => props.$collapsed ? 'hidden' : 'auto'};
    transition: flex 0.3s ease;
    min-height: 0;
    display: flex;
    flex-direction: column;

    > * {
        flex: 1 1 0;
        min-height: 0;
    }
`;

const EditorContainer = styled.div`
    flex: 1 1 0;
    min-height: 0;
    overflow: auto;

    .cm-editor {
        height: 100%;
        font-size: 14px;
    }

    .cm-scroller {
        overflow: auto;
        -webkit-overflow-scrolling: touch;
    }

    .cm-content {
        padding: 8px 0;
    }

    .cm-line {
        padding: 0 16px;
    }

    .cm-gutters {
        background: #1e1e1e;
        border-right: 1px solid #3e3e42;
    }
`;

const OutputSection = styled.div<{ $collapsed?: boolean }>`
    flex: ${props => props.$collapsed ? '0 0 0' : '1 1 0'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #1e1e1e;
    transition: flex 0.3s ease;
    min-height: 0;
    height: ${props => props.$collapsed ? '0' : 'auto'};
    flex-grow: 1;
`;

const ExecutionSection = styled.div<{ $collapsed?: boolean }>`
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #1e1e1e;
    transition: flex 0.3s ease;
    max-height: ${props => props.$collapsed ? '0' : '400px'};
    height: ${props => props.$collapsed ? '0' : 'auto'};
    flex: ${props => props.$collapsed ? '0 0 0' : '1 1 auto'};
    min-height: 0;
`;

const ExecutionContainer = styled.div`
    display: flex;
    flex-direction: column;
`;

// Main Component
export const CodeMirrorPlayground: React.FC = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const editorViewRef = useRef<EditorView | null>(null);

    const [settings, setSettings] = useState(() => loadSettings());
    const [settingsCollapsed, setSettingsCollapsed] = useState(false);
    const [editorCollapsed, setEditorCollapsed] = useState(false);
    const [outputCollapsed, setOutputCollapsed] = useState(false);
    const [executionCollapsed, setExecutionCollapsed] = useState(false);
    const [outputData, setOutputData] = useState<OutputData>({});
    const [executor, setExecutor] = useState<RailsExecutor | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [currentMachineData, setCurrentMachineData] = useState<MachineData | null>(null);

    // Initialize editor
    useEffect(() => {
        if (!editorRef.current) return;

        const defaultCode = `machine "Hello World"

state start;
state end;

start -> end;`;

        const startState = EditorState.create({
            doc: defaultCode,
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
                ...createLangiumExtensions(),
            ],
        });

        const view = new EditorView({
            state: startState,
            parent: editorRef.current,
            dispatch: (transaction) => {
                view.update([transaction]);

                // Update output panel on document changes
                if (transaction.docChanged) {
                    const code = view.state.doc.toString();
                    handleDocumentChange(code);
                }
            }
        });

        editorViewRef.current = view;

        // Trigger initial render
        handleDocumentChange(defaultCode);

        return () => {
            view.destroy();
        };
    }, []);


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

    // Handle section toggles
    const toggleSettings = useCallback(() => {
        setSettingsCollapsed(prev => !prev);
    }, []);

    const toggleEditor = useCallback(() => {
        setEditorCollapsed(prev => !prev);
    }, []);

    const toggleOutput = useCallback(() => {
        setOutputCollapsed(prev => !prev);
    }, []);

    const toggleExecution = useCallback(() => {
        setExecutionCollapsed(prev => !prev);
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

    // Handle run (same as execute)
    const handleRun = useCallback(async () => {
        await handleExecute();
    }, []);

    // Handle example loading
    const handleLoadExample = useCallback((content: string) => {
        if (editorViewRef.current) {
            editorViewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: editorViewRef.current.state.doc.length,
                    insert: content,
                },
            });
        }
    }, []);

    // Helper to convert Machine AST to MachineData
    const convertToMachineData = useCallback((machine: Machine): MachineData => {
        return {
            title: machine.title || 'Untitled',
            nodes: machine.nodes.map(node => ({
                name: node.name,
                type: node.type || 'State',
                parent: node.$container && node.$container.$type === 'Node' ? (node.$container as any).name : undefined,
                attributes: node.attributes.map(attr => ({
                    name: attr.name,
                    type: attr.type?.base || 'string',
                    value: attr.value ? String(attr.value) : ''
                }))
            })),
            edges: machine.edges.flatMap(edge => 
                edge.segments.flatMap(segment => 
                    segment.target.map(targetRef => ({
                        source: edge.source[0]?.ref?.name || '',
                        target: targetRef.ref?.name || '',
                        label: segment.label.length > 0 ? segment.label[0].value.map(v => v.text || '').join(' ') : undefined,
                        type: segment.endType
                    }))
                )
            )
        };
    }, []);

    // Helper to update visualization with runtime state
    const updateRuntimeVisualization = useCallback(async (exec: RailsExecutor) => {
        try {
            const visualizer = new RuntimeVisualizer(exec);
            const runtimeDot = visualizer.generateRuntimeVisualization({
                showCurrentState: true,
                showVisitCounts: true,
                showExecutionPath: true,
                showRuntimeValues: true,
                mobileOptimized: true
            });

            // Render runtime SVG
            const tempDiv = window.document.createElement('div');
            await renderGraphviz(runtimeDot, tempDiv, `runtime-${Date.now()}`);

            // Update output with runtime visualization
            setOutputData(prev => ({
                ...prev,
                svg: tempDiv.innerHTML,
                dot: runtimeDot
            }));
        } catch (error) {
            console.error('Error updating runtime visualization:', error);
        }
    }, []);

    // Execution handlers
    const handleExecute = useCallback(async () => {
        if (isExecuting) {
            console.warn('Execution already in progress');
            return;
        }

        if (!outputData.machine || !settings.apiKey) {
            console.error('No machine parsed or API key missing');
            return;
        }

        try {
            setIsExecuting(true);

            // Convert AST to MachineData
            const machineData = convertToMachineData(outputData.machine);
            setCurrentMachineData(machineData);

            // Create executor
            const exec = await RailsExecutor.create(machineData, {
                llm: {
                    provider: 'anthropic',
                    apiKey: settings.apiKey,
                    modelId: settings.model
                }
            });

            setExecutor(exec);

            // Execute machine
            console.log('Starting execution...');
            await exec.execute();

            // Update visualization with final state
            await updateRuntimeVisualization(exec);

            console.log('Execution complete');
        } catch (error) {
            console.error('Execution error:', error);
        } finally {
            setIsExecuting(false);
        }
    }, [isExecuting, outputData.machine, settings, convertToMachineData, updateRuntimeVisualization]);

    const handleStep = useCallback(async () => {
        if (!outputData.machine || !settings.apiKey) {
            console.error('No machine parsed or API key missing');
            return;
        }

        try {
            let exec = executor;

            // Create executor if not exists (first step)
            if (!exec) {
                const machineData = convertToMachineData(outputData.machine);
                setCurrentMachineData(machineData);

                exec = await RailsExecutor.create(machineData, {
                    llm: {
                        provider: 'anthropic',
                        apiKey: settings.apiKey,
                        modelId: settings.model
                    }
                });

                setExecutor(exec);
            }

            // Execute one step
            console.log('Executing step...');
            const continued = await exec.step();

            // Update visualization
            await updateRuntimeVisualization(exec);

            if (!continued) {
                console.log('Machine execution complete');
            }
        } catch (error) {
            console.error('Step error:', error);
        }
    }, [executor, outputData.machine, settings, convertToMachineData, updateRuntimeVisualization]);

    // Handle document changes with debouncing
    const updateTimeoutRef = useRef<number | null>(null);
    const handleDocumentChange = useCallback((code: string) => {
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
                    // Still try to render what we can
                }

                // Get the machine model
                const model = document.parseResult.value as Machine;
                if (!model) {
                    console.warn('No machine model parsed');
                    return;
                }

                // Generate Graphviz DOT diagram
                const graphvizResult = generateGraphviz(model, 'playground.machine', undefined);
                const dotCode = graphvizResult.content;

                // Generate JSON representation (handles circular references)
                const jsonResult = generateJSON(model);
                const jsonData = jsonResult.content;

                // Render SVG in a temporary div
                const tempDiv = window.document.createElement('div');
                await renderGraphviz(dotCode, tempDiv, `${Math.floor(Math.random() * 1000000000)}`);

                // Update output data state
                setOutputData({
                    svg: tempDiv.innerHTML,
                    dot: dotCode,
                    json: jsonData,
                    machine: model,
                    ast: model
                });
            } catch (error) {
                console.error('Error updating diagram:', error);
            }
        }, 500); // 500ms debounce
    }, []);

    const handleStop = useCallback(() => {
        console.log('Stopping execution');
        setIsExecuting(false);
        // Executor will be preserved for inspection
    }, []);

    const handleReset = useCallback(async () => {
        console.log('Resetting machine');
        setExecutor(null);
        setIsExecuting(false);
        setCurrentMachineData(null);

        // Re-render static diagram
        if (editorViewRef.current && outputData.machine) {
            try {
                // Generate static Graphviz DOT diagram
                const graphvizResult = generateGraphviz(outputData.machine, 'playground.machine', undefined);
                const dotCode = graphvizResult.content;

                // Generate JSON representation
                const jsonResult = generateJSON(outputData.machine);
                const jsonData = jsonResult.content;

                // Render SVG in a temporary div
                const tempDiv = window.document.createElement('div');
                await renderGraphviz(dotCode, tempDiv, `${Math.floor(Math.random() * 1000000000)}`);

                // Update output data with static visualization
                setOutputData({
                    svg: tempDiv.innerHTML,
                    dot: dotCode,
                    json: jsonData,
                    machine: outputData.machine,
                    ast: outputData.machine
                });
            } catch (error) {
                console.error('Error resetting to static diagram:', error);
            }
        }
    }, [outputData.machine]);

    return (
        <Container>
            <Header>
                <HeaderTitle>
                    <a href="./">DyGram</a>
                </HeaderTitle>
                <HeaderActions>
                    <Button className="secondary" onClick={handleDownloadSVG}>
                        SVG
                    </Button>
                    <Button className="secondary" onClick={handleDownloadPNG}>
                        PNG
                    </Button>
                    <Button onClick={handleRun}>
                        Run
                    </Button>
                </HeaderActions>
            </Header>

            <SectionHeader onClick={toggleSettings}>
                <span>Settings</span>
                <ToggleBtn>{settingsCollapsed ? '▶' : '▼'}</ToggleBtn>
            </SectionHeader>
            <SettingsPanel $collapsed={settingsCollapsed}>
                <SettingsGroup>
                    <label htmlFor="model-select">Model:</label>
                    <SettingsSelect
                        id="model-select"
                        value={settings.model}
                        onChange={handleModelChange}
                    >
                        <option value="claude-sonnet-4-5-20250929">claude-sonnet-4-5-20250929</option>
                        <option value="claude-sonnet-4-20250514">claude-sonnet-4-20250514</option>
                        <option value="claude-3-7-sonnet-latest">claude-3-7-sonnet-latest</option>
                        <option value="claude-3-5-haiku-latest">claude-3-5-haiku-latest</option>
                    </SettingsSelect>
                </SettingsGroup>
                <SettingsGroup>
                    <label htmlFor="api-key-input">API Key:</label>
                    <SettingsInput
                        type="password"
                        id="api-key-input"
                        placeholder="Anthropic API key..."
                        value={settings.apiKey}
                        onChange={handleApiKeyChange}
                    />
                </SettingsGroup>
                <ExamplesContainer>
                    <ExampleButtons onLoadExample={handleLoadExample} categoryView={true} />
                </ExamplesContainer>
            </SettingsPanel>

            <MainContainer>
                <SectionHeader onClick={toggleEditor} $sideways={true}>
                    <span>Editor</span>
                    <ToggleBtn>{editorCollapsed ? '▶' : '▼'}</ToggleBtn>
                </SectionHeader>
                <EditorSection $collapsed={editorCollapsed}>
                    <SectionContent $collapsed={editorCollapsed}>
                        <EditorContainer ref={editorRef} />
                    </SectionContent>
                </EditorSection>

                <SectionHeader onClick={toggleOutput} $sideways={true}>
                        <span>Output</span>
                        <ToggleBtn>{outputCollapsed ? '▶' : '▼'}</ToggleBtn>
                    </SectionHeader>
                <OutputSection $collapsed={outputCollapsed}>
                    
                    <SectionContent $collapsed={outputCollapsed}>
                        <OutputPanel 
                            defaultFormat="svg"
                            mobile={true}
                            data={outputData}
                        />
                    </SectionContent>
                </OutputSection>
            </MainContainer>

            <ExecutionContainer>
                <SectionHeader onClick={toggleExecution}>
                    <span>Execution</span>
                    <ToggleBtn>{executionCollapsed ? '▶' : '▼'}</ToggleBtn>
                </SectionHeader>
                <ExecutionSection $collapsed={executionCollapsed}>
                    <SectionContent $collapsed={executionCollapsed}>
                        <ExecutionControls
                            onExecute={handleExecute}
                            onStep={handleStep}
                            onStop={handleStop}
                            onReset={handleReset}
                            mobile={false}
                            showLog={true}
                        />
                    </SectionContent>
                </ExecutionSection>
            </ExecutionContainer>
        </Container>
    );
};
