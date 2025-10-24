/**
 * CodeMirror Playground - React Application
 *
 * Full React implementation of the CodeMirror editor playground with styled-components
 * Mobile-optimized version
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import styled from "styled-components";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldKeymap,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { ExecutionControls } from "./ExecutionControls";
import { ExampleButtons } from "./ExampleButtons";
import { loadSettings, saveSettings } from "../language/shared-settings";
import { OutputPanel, OutputData } from "./OutputPanel";
import { createLangiumExtensions } from "../codemirror-langium";
import { createMachineServices } from "../language/machine-module";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { Machine } from "../language/generated/ast";
import {
  generateGraphviz,
  generateJSON,
} from "../language/generator/generator";
import { render as renderGraphviz } from "../language/diagram-controls";
import { RailsExecutor } from "../language/rails-executor";
import { RuntimeVisualizer } from "../language/runtime-visualizer";
import type { MachineData } from "../language/base-executor";

// Types
type SectionSize = 'small' | 'medium' | 'big';

// Helper function to get flex-basis for section size
const getSectionFlexBasis = (collapsed: boolean, size: SectionSize): string => {
    if (collapsed) return '0';
    switch (size) {
        case 'small': return '20%';
        case 'medium': return '50%';
        case 'big': return '80%';
    }
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
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

  &:hover {
    background: #333336;
  }

  @media (min-width: 768px) {
    writing-mode: ${(props) => (props.$sideways ? "sideways-lr;" : "unset")};
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

const SizeControls = styled.div`
    display: flex;
    gap: 4px;
    margin-left: 8px;
`;

const SizeBtn = styled.button<{ $active?: boolean }>`
    background: ${props => props.$active ? '#0e639c' : 'transparent'};
    border: 1px solid ${props => props.$active ? '#0e639c' : '#505053'};
    color: ${props => props.$active ? '#ffffff' : '#cccccc'};
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    min-width: 24px;
    transition: all 0.2s ease;

    &:hover {
        background: ${props => props.$active ? '#0e639c' : '#3e3e42'};
        border-color: #0e639c;
    }


`;

const HeaderControls = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const SettingsPanel = styled.div<{ $collapsed?: boolean }>`
  background: #252526;
  padding: 0.3em;
  border-bottom: 1px solid #3e3e42;
  display: ${(props) => (props.$collapsed ? "none" : "flex")};
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
    width: 100%;
`;

const MainContainer = styled.div<{ $collapsed?: boolean }>`
    flex: 1;
    display: flex;
    flex-direction: column;
    flex-basis: ${props => props.$collapsed ? '0' : '100%'};
    overflow: hidden;

    @media (min-width: 768px) {
        flex-direction: ${props => props.$collapsed ? 'column' : 'row'};
    }
`;

// Generic Section component (DRY)
const Section = styled.div<{ $collapsed?: boolean; $size?: SectionSize; $borderRight?: boolean }>`
    flex: ${props => props.$collapsed ? '0 0 0' : '1'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #1e1e1e;
    transition: flex 0.3s ease;
    height: ${props => props.$collapsed ? '0' : 'auto'};
    flex-basis: ${props => getSectionFlexBasis(props.$collapsed || false, props.$size || 'medium')};
    
    @media (min-width: 768px) {
        ${props => props.$borderRight && 'border-right: 1px solid #3e3e42;'}
    }
`;

const EditorSection = Section;

const SectionContent = styled.div<{ $collapsed?: boolean }>`
  flex: ${(props) => (props.$collapsed ? "0 0 auto" : "1 1 0")};
  overflow: ${(props) => (props.$collapsed ? "hidden" : "auto")};
  transition: flex 0.3s ease;
  min-height: 0;
  min-width: 0;
  width: ${(props) => (props.$collapsed ? "0" : "auto")};
  height: ${(props) => (props.$collapsed ? "0" : "auto")};
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

const OutputSection = Section;

const ExecutionSection = Section;

// Main Component
export const CodeMirrorPlayground: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

    const [settings, setSettings] = useState(() => loadSettings());
    const [settingsCollapsed, setSettingsCollapsed] = useState(false);
    const [editorCollapsed, setEditorCollapsed] = useState(false);
    const [outputCollapsed, setOutputCollapsed] = useState(false);
    const [executionCollapsed, setExecutionCollapsed] = useState(false);
    const [editorSize, setEditorSize] = useState<SectionSize>('medium');
    const [outputSize, setOutputSize] = useState<SectionSize>('medium');
    const [executionSize, setExecutionSize] = useState<SectionSize>('medium');
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
          "&": {
            fontSize: "14px",
          },
          ".cm-scroller": {
            fontFamily: "Monaco, Courier New, monospace",
          },
          ".cm-gutters": {
            fontSize: "13px",
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
      },
    });

    editorViewRef.current = view;

    // Trigger initial render
    handleDocumentChange(defaultCode);

    return () => {
      view.destroy();
    };
  }, []);

  // Handle settings changes
  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newModel = e.target.value;
      setSettings((prev) => {
        const updated = { ...prev, model: newModel };
        saveSettings(updated.model, updated.apiKey);
        return updated;
      });
    },
    []
  );

  const handleApiKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newApiKey = e.target.value;
      setSettings((prev) => {
        const updated = { ...prev, apiKey: newApiKey };
        saveSettings(updated.model, updated.apiKey);
        return updated;
      });
    },
    []
  );

  // Handle section toggles
  const toggleSettings = useCallback(() => {
    setSettingsCollapsed((prev) => !prev);
  }, []);

  const toggleEditor = useCallback(() => {
    setEditorCollapsed((prev) => !prev);
  }, []);

  const toggleOutput = useCallback(() => {
    setOutputCollapsed((prev) => !prev);
  }, []);

  const toggleExecution = useCallback(() => {
    setExecutionCollapsed((prev) => !prev);
  }, []);


    // Handle size changes
    const handleEditorSizeChange = useCallback((size: SectionSize) => {
        setEditorSize(size);
    }, []);

    const handleOutputSizeChange = useCallback((size: SectionSize) => {
        setOutputSize(size);
    }, []);

    const handleExecutionSizeChange = useCallback((size: SectionSize) => {
        setExecutionSize(size);
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
      title: machine.title || "Untitled",
      nodes: machine.nodes.map((node) => ({
        name: node.name,
        type: node.type || "State",
        parent:
          node.$container && node.$container.$type === "Node"
            ? (node.$container as any).name
            : undefined,
        attributes: node.attributes.map((attr) => ({
          name: attr.name,
          type: attr.type?.base || "string",
          value: attr.value ? String(attr.value) : "",
        })),
      })),
      edges: machine.edges.flatMap((edge) =>
        edge.segments.flatMap((segment) =>
          segment.target.map((targetRef) => ({
            source: edge.source[0]?.ref?.name || "",
            target: targetRef.ref?.name || "",
            label:
              segment.label.length > 0
                ? segment.label[0].value.map((v) => v.text || "").join(" ")
                : undefined,
            type: segment.endType,
          }))
        )
      ),
    };
  }, []);

  // Helper to update visualization with runtime state
  const updateRuntimeVisualization = useCallback(
    async (exec: RailsExecutor) => {
      try {
        const visualizer = new RuntimeVisualizer(exec);
        const runtimeDot = visualizer.generateRuntimeVisualization({
          showCurrentState: true,
          showVisitCounts: true,
          showExecutionPath: true,
          showRuntimeValues: true,
          mobileOptimized: true,
        });

        // Render runtime SVG
        const tempDiv = window.document.createElement("div");
        await renderGraphviz(runtimeDot, tempDiv, `runtime-${Date.now()}`);

        // Update output with runtime visualization
        setOutputData((prev) => ({
          ...prev,
          svg: tempDiv.innerHTML,
          dot: runtimeDot,
        }));
      } catch (error) {
        console.error("Error updating runtime visualization:", error);
      }
    },
    []
  );

  // Execution handlers
  const handleExecute = useCallback(async () => {
    if (isExecuting) {
      console.warn("Execution already in progress");
      return;
    }

    if (!outputData.machine || !settings.apiKey) {
      console.error("No machine parsed or API key missing");
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
          provider: "anthropic",
          apiKey: settings.apiKey,
          modelId: settings.model,
        },
      });

      setExecutor(exec);

      // Execute machine
      console.log("Starting execution...");
      await exec.execute();

      // Update visualization with final state
      await updateRuntimeVisualization(exec);

      console.log("Execution complete");
    } catch (error) {
      console.error("Execution error:", error);
    } finally {
      setIsExecuting(false);
    }
  }, [
    isExecuting,
    outputData.machine,
    settings,
    convertToMachineData,
    updateRuntimeVisualization,
  ]);

  const handleStep = useCallback(async () => {
    if (!outputData.machine || !settings.apiKey) {
      console.error("No machine parsed or API key missing");
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
            provider: "anthropic",
            apiKey: settings.apiKey,
            modelId: settings.model,
          },
        });

        setExecutor(exec);
      }

      // Execute one step
      console.log("Executing step...");
      const continued = await exec.step();

      // Update visualization
      await updateRuntimeVisualization(exec);

      if (!continued) {
        console.log("Machine execution complete");
      }
    } catch (error) {
      console.error("Step error:", error);
    }
  }, [
    executor,
    outputData.machine,
    settings,
    convertToMachineData,
    updateRuntimeVisualization,
  ]);

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
          console.warn(
            "Parse errors detected:",
            document.parseResult.parserErrors
          );
          // Still try to render what we can
        }

        // Get the machine model
        const model = document.parseResult.value as Machine;
        if (!model) {
          console.warn("No machine model parsed");
          return;
        }

        // Generate Graphviz DOT diagram
        const graphvizResult = generateGraphviz(
          model,
          "playground.machine",
          undefined
        );
        const dotCode = graphvizResult.content;

        // Generate JSON representation (handles circular references)
        const jsonResult = generateJSON(model);
        const jsonData = jsonResult.content;

        // Render SVG in a temporary div
        const tempDiv = window.document.createElement("div");
        await renderGraphviz(
          dotCode,
          tempDiv,
          `${Math.floor(Math.random() * 1000000000)}`
        );

        // Update output data state
        setOutputData({
          svg: tempDiv.innerHTML,
          dot: dotCode,
          json: jsonData,
          machine: model,
          ast: model,
        });
      } catch (error) {
        console.error("Error updating diagram:", error);
      }
    }, 500); // 500ms debounce
  }, []);

  const handleStop = useCallback(() => {
    console.log("Stopping execution");
    setIsExecuting(false);
    // Executor will be preserved for inspection
  }, []);

  const handleReset = useCallback(async () => {
    console.log("Resetting machine");
    setExecutor(null);
    setIsExecuting(false);
    setCurrentMachineData(null);

    // Re-render static diagram
    if (editorViewRef.current && outputData.machine) {
      try {
        // Generate static Graphviz DOT diagram
        const graphvizResult = generateGraphviz(
          outputData.machine,
          "playground.machine",
          undefined
        );
        const dotCode = graphvizResult.content;

        // Generate JSON representation
        const jsonResult = generateJSON(outputData.machine);
        const jsonData = jsonResult.content;

        // Render SVG in a temporary div
        const tempDiv = window.document.createElement("div");
        await renderGraphviz(
          dotCode,
          tempDiv,
          `${Math.floor(Math.random() * 1000000000)}`
        );

        // Update output data with static visualization
        setOutputData({
          svg: tempDiv.innerHTML,
          dot: dotCode,
          json: jsonData,
          machine: outputData.machine,
          ast: outputData.machine,
        });
      } catch (error) {
        console.error("Error resetting to static diagram:", error);
      }
    }
  }, [outputData.machine]);


    const generatePngFromSvg = useCallback(async (svgContent: string): Promise<string | undefined> => {
        if (!svgContent) {
            return undefined;
        }

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

                    image.onerror = () => {
                        reject(new Error('Unable to load SVG for PNG conversion'));
                    };

                    image.src = url;
                });

                return dataUrl;
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Failed to generate PNG preview from SVG:', error);
            return undefined;
        }
    }, []);


    return (
        <Container>
            <Header>
                <HeaderTitle>
                    <a href="./">DyGram</a>
                </HeaderTitle>
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

            <MainContainer $collapsed={outputCollapsed && editorCollapsed}>
                <SectionHeader onClick={toggleEditor} $sideways={outputCollapsed && editorCollapsed ? false : true}>
                    <span>Editor</span>
                    <HeaderControls>
                        {!editorCollapsed && (
                            <SizeControls>
                                <SizeBtn 
                                    $active={editorSize === 'small'} 
                                    onClick={(e) => { e.stopPropagation(); handleEditorSizeChange('small'); }}
                                >
                                    S
                                </SizeBtn>
                                <SizeBtn 
                                    $active={editorSize === 'medium'} 
                                    onClick={(e) => { e.stopPropagation(); handleEditorSizeChange('medium'); }}
                                >
                                    M
                                </SizeBtn>
                                <SizeBtn 
                                    $active={editorSize === 'big'} 
                                    onClick={(e) => { e.stopPropagation(); handleEditorSizeChange('big'); }}
                                >
                                    B
                                </SizeBtn>
                            </SizeControls>
                        )}
                        <ToggleBtn>{editorCollapsed ? '▶' : '▼'}</ToggleBtn>
                    </HeaderControls>
                </SectionHeader>
                <EditorSection $collapsed={editorCollapsed} $size={editorSize} $borderRight>
                    <SectionContent $collapsed={editorCollapsed}>
                        <EditorContainer ref={editorRef} />
                    </SectionContent>
                </EditorSection>

                <SectionHeader onClick={toggleOutput} $sideways={outputCollapsed && editorCollapsed ? false : true}>
                    <span>Output</span>
                    <HeaderControls>
                        {!outputCollapsed && (
                            <SizeControls>
                                <SizeBtn 
                                    $active={outputSize === 'small'} 
                                    onClick={(e) => { e.stopPropagation(); handleOutputSizeChange('small'); }}
                                >
                                    S
                                </SizeBtn>
                                <SizeBtn 
                                    $active={outputSize === 'medium'} 
                                    onClick={(e) => { e.stopPropagation(); handleOutputSizeChange('medium'); }}
                                >
                                    M
                                </SizeBtn>
                                <SizeBtn 
                                    $active={outputSize === 'big'} 
                                    onClick={(e) => { e.stopPropagation(); handleOutputSizeChange('big'); }}
                                >
                                    L
                                </SizeBtn>
                            </SizeControls>
                        )}
                        <ToggleBtn>{outputCollapsed ? '▶' : '▼'}</ToggleBtn>
                    </HeaderControls>
                </SectionHeader>
                <OutputSection $collapsed={outputCollapsed} $size={outputSize}>
                    
                    <SectionContent $collapsed={outputCollapsed}>
                        <OutputPanel 
                            defaultFormat="svg"
                            mobile={true}
                            data={outputData}
                        />
                    </SectionContent>
                </OutputSection>
            </MainContainer>

            <SectionHeader onClick={toggleExecution}>
                <span>Execution</span>
                <HeaderControls>
                    {!executionCollapsed && (
                        <SizeControls>
                            <SizeBtn 
                                $active={executionSize === 'small'} 
                                onClick={(e) => { e.stopPropagation(); handleExecutionSizeChange('small'); }}
                            >
                                S
                            </SizeBtn>
                            <SizeBtn 
                                $active={executionSize === 'medium'} 
                                onClick={(e) => { e.stopPropagation(); handleExecutionSizeChange('medium'); }}
                            >
                                M
                            </SizeBtn>
                            <SizeBtn 
                                $active={executionSize === 'big'} 
                                onClick={(e) => { e.stopPropagation(); handleExecutionSizeChange('big'); }}
                            >
                                L
                            </SizeBtn>
                        </SizeControls>
                    )}
                    <ToggleBtn>{executionCollapsed ? '▶' : '▼'}</ToggleBtn>
                </HeaderControls>
            </SectionHeader>
            <ExecutionSection $collapsed={executionCollapsed} $size={executionSize}>
                
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
        </Container>
    );
};
