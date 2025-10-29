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
import { OutputPanel, OutputData, OutputFormat } from "./OutputPanel";
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
import { getExampleByKey, getDefaultExample, type Example } from "../language/shared-examples";

// Types
type SectionSize = 'small' | 'medium' | 'big';

// URL hash parameter helpers
interface HashParams {
  example?: string;
  content?: string;
  sections?: string;
}

interface SectionStates {
  settingsCollapsed: boolean;
  editorCollapsed: boolean;
  outputCollapsed: boolean;
  executionCollapsed: boolean;
  editorSize: SectionSize;
  outputSize: SectionSize;
  executionSize: SectionSize;
  outputFormat: OutputFormat;
  fitToContainer: boolean;
}

// Base64 URL-safe encoding/decoding helpers
function base64UrlEncode(str: string): string {
  return encodeURIComponent(btoa(str));
}

function base64UrlDecode(str: string): string {
  try {
    return atob(decodeURIComponent(str));
  } catch (error) {
    console.error('Failed to decode base64 content:', error);
    return '';
  }
}

// Section state encoding/decoding helpers
function encodeSectionStates(states: SectionStates): string {
  // Create a compact representation using single characters
  // Format: [s][e][o][x][eSize][oSize][xSize][format][fit]
  // s = settings collapsed (0/1)
  // e = editor collapsed (0/1) 
  // o = output collapsed (0/1)
  // x = execution collapsed (0/1)
  // eSize = editor size (s/m/b for small/medium/big)
  // oSize = output size (s/m/b)
  // xSize = execution size (s/m/b)
  // format = output format (0=svg, 1=png, 2=dot, 3=json, 4=ast, 5=cst)
  // fit = fit to container (0/1)
  
  const sizeMap: Record<SectionSize, string> = { small: 's', medium: 'm', big: 'b' };
  const formatMap: Record<OutputFormat, string> = { 
    svg: '0', png: '1', dot: '2', json: '3', ast: '4', cst: '5' 
  };
  
  return [
    states.settingsCollapsed ? '1' : '0',
    states.editorCollapsed ? '1' : '0', 
    states.outputCollapsed ? '1' : '0',
    states.executionCollapsed ? '1' : '0',
    sizeMap[states.editorSize],
    sizeMap[states.outputSize],
    sizeMap[states.executionSize],
    formatMap[states.outputFormat],
    states.fitToContainer ? '1' : '0'
  ].join('');
}

function decodeSectionStates(encoded: string): Partial<SectionStates> {
  if (!encoded || encoded.length !== 9) {
    return {}; // Return empty object for invalid input
  }
  
  const sizeMap: Record<string, SectionSize> = { s: 'small', m: 'medium', b: 'big' };
  const formatMap: Record<string, OutputFormat> = { 
    '0': 'svg', '1': 'png', '2': 'dot', '3': 'json', '4': 'ast', '5': 'cst' 
  };
  
  try {
    return {
      settingsCollapsed: encoded[0] === '1',
      editorCollapsed: encoded[1] === '1',
      outputCollapsed: encoded[2] === '1', 
      executionCollapsed: encoded[3] === '1',
      editorSize: sizeMap[encoded[4]] || 'medium',
      outputSize: sizeMap[encoded[5]] || 'medium',
      executionSize: sizeMap[encoded[6]] || 'medium',
      outputFormat: formatMap[encoded[7]] || 'svg',
      fitToContainer: encoded[8] === '1'
    };
  } catch (error) {
    console.error('Failed to decode section states:', error);
    return {};
  }
}

function parseHashParams(): HashParams {
  const hash = window.location.hash.slice(1); // Remove '#'
  const params: HashParams = {};
  
  if (!hash) return params;
  
  const pairs = hash.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key === 'example') {
      params.example = decodeURIComponent(value);
    } else if (key === 'content') {
      params.content = base64UrlDecode(value);
    } else if (key === 'sections') {
      params.sections = decodeURIComponent(value);
    }
  }
  
  return params;
}

function updateHashParams(params: HashParams): void {
  const parts: string[] = [];
  
  if (params.example) {
    parts.push(`example=${encodeURIComponent(params.example)}`);
  }
  if (params.content) {
    parts.push(`content=${base64UrlEncode(params.content)}`);
  }
  if (params.sections) {
    parts.push(`sections=${encodeURIComponent(params.sections)}`);
  }
  
  const newHash = parts.length > 0 ? `#${parts.join('&')}` : '';
  
  // Update hash without triggering page reload
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash || window.location.pathname);
  }
}

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
    const [selectedExample, setSelectedExample] = useState<Example | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('svg');
    const [fitToContainer, setFitToContainer] = useState(true);

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return;

    // Determine initial content from URL hash or default
    const hashParams = parseHashParams();
    let initialCode = '';
    let initialExample: Example | null = null;

    // Priority 1: URL hash with custom content
    if (hashParams.content) {
      initialCode = hashParams.content;
      // Try to match with an example if also specified
      if (hashParams.example) {
        const example = getExampleByKey(hashParams.example);
        if (example) {
          initialExample = example;
        }
      }
    }
    // Priority 2: URL hash with example parameter (no custom content)
    else if (hashParams.example) {
      const example = getExampleByKey(hashParams.example);
      if (example) {
        initialExample = example;
        initialCode = example.content;
      }
    }

    // Priority 3: Default example
    if (!initialCode) {
      const defaultExample = getDefaultExample();
      initialExample = defaultExample;
      initialCode = defaultExample.content;
    }

    // Restore section states from URL hash
    if (hashParams.sections) {
      const sectionStates = decodeSectionStates(hashParams.sections);
      if (sectionStates.settingsCollapsed !== undefined) {
        setSettingsCollapsed(sectionStates.settingsCollapsed);
      }
      if (sectionStates.editorCollapsed !== undefined) {
        setEditorCollapsed(sectionStates.editorCollapsed);
      }
      if (sectionStates.outputCollapsed !== undefined) {
        setOutputCollapsed(sectionStates.outputCollapsed);
      }
      if (sectionStates.executionCollapsed !== undefined) {
        setExecutionCollapsed(sectionStates.executionCollapsed);
      }
      if (sectionStates.editorSize !== undefined) {
        setEditorSize(sectionStates.editorSize);
      }
      if (sectionStates.outputSize !== undefined) {
        setOutputSize(sectionStates.outputSize);
      }
      if (sectionStates.executionSize !== undefined) {
        setExecutionSize(sectionStates.executionSize);
      }
      if (sectionStates.outputFormat !== undefined) {
        setOutputFormat(sectionStates.outputFormat);
      }
      if (sectionStates.fitToContainer !== undefined) {
        setFitToContainer(sectionStates.fitToContainer);
      }
    }

    // Set initial state
    setSelectedExample(initialExample);
    setIsDirty(!!hashParams.content);

    // Update URL hash to reflect initial state (only if not already set)
    if (!window.location.hash && initialExample) {
      updateHashParams({
        example: initialExample.name.toLowerCase().replace(/\s+/g, '-'),
      });
    }

    const startState = EditorState.create({
      doc: initialCode,
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
          
          // Mark as dirty and update URL hash with content
          setIsDirty(true);
          
          // Update URL hash with encoded content
          if (selectedExample) {
            updateHashParams({
              example: selectedExample.name.toLowerCase().replace(/\s+/g, '-'),
              content: code,
            });
          } else {
            updateHashParams({
              content: code,
            });
          }
        }
      },
    });

    editorViewRef.current = view;

    // Trigger initial render
    handleDocumentChange(initialCode);

    return () => {
      view.destroy();
    };
  }, []);

  // Update URL hash when section states change
  useEffect(() => {
    const currentSectionStates: SectionStates = {
      settingsCollapsed,
      editorCollapsed,
      outputCollapsed,
      executionCollapsed,
      editorSize,
      outputSize,
      executionSize,
      outputFormat,
      fitToContainer
    };

    // Get current hash params
    const hashParams = parseHashParams();
    
    // Encode current section states
    const encodedSections = encodeSectionStates(currentSectionStates);
    
    // Update hash params with new section states
    updateHashParams({
      ...hashParams,
      sections: encodedSections
    });
  }, [settingsCollapsed, editorCollapsed, outputCollapsed, executionCollapsed, editorSize, outputSize, executionSize, outputFormat, fitToContainer]);

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

  // Handle output format change
  const handleOutputFormatChange = useCallback((format: OutputFormat) => {
    setOutputFormat(format);
  }, []);

  // Handle run (same as execute)
  const handleRun = useCallback(async () => {
    await handleExecute();
  }, []);

  // Handle example loading
  const handleLoadExample = useCallback((content: string, example: Example) => {
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: content,
        },
      });
      
      // Update state
      setSelectedExample(example);
      setIsDirty(false);
      
      // Update URL hash (without content since it's a clean example)
      updateHashParams({
        example: example.name.toLowerCase().replace(/\s+/g, '-'),
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

        // Generate PNG from SVG
        const pngDataUrl = await generatePngFromSvg(tempDiv.innerHTML);

        // Update output with runtime visualization
        setOutputData((prev) => ({
          ...prev,
          svg: tempDiv.innerHTML,
          png: pngDataUrl,
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

        // Generate PNG from SVG
        const pngDataUrl = await generatePngFromSvg(tempDiv.innerHTML);

        // Update output data with static visualization
        setOutputData({
          svg: tempDiv.innerHTML,
          png: pngDataUrl,
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
                            defaultFormat={outputFormat}
                            mobile={true}
                            data={outputData}
                            onFormatChange={handleOutputFormatChange}
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
