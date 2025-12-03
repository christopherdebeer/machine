/**
 * CodeMirror Playground - React Application
 *
 * Full React implementation of the CodeMirror editor playground with styled-components
 * Mobile-optimized version
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import styled from "styled-components";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  Decoration,
  DecorationSet,
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
import { ExecutionControls } from "./ExecutionControls.js";
import { ExecutionStateVisualizer } from "./ExecutionStateVisualizer.js";
import { UnifiedFileTree } from "./UnifiedFileTree.js";
import { loadSettings, saveSettings } from "../language/shared-settings.js";
import {
  fetchAnthropicModels,
  clearModelsCache,
  type ModelInfo,
} from "../language/model-fetcher.js";
import { VirtualFileSystem } from "../playground/virtual-filesystem.js";
import { FileAccessService } from "../playground/file-access-service.js";
import { OutputPanel, OutputData, OutputFormat } from "./OutputPanel.js";
import { createLangiumExtensions } from "../codemirror-langium.js";
import { createMachineServices } from "../language/machine-module.js";
import { isFileApiAvailable, writeFile } from "../api/files-api.js";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { Machine } from "../language/generated/ast.js";
import { generateJSON, generateDSL } from "../language/generator/generator.js";
import { serializeMachineToJSON } from "../language/json/serializer.js";
import { generateGraphvizFromJSON } from "../language/diagram/index.js";
import { render as renderGraphviz } from "../language/diagram-controls.js";
import { MachineExecutor } from "../language/executor.js";
import type { MachineJSON } from "../language/json/types.js";
import {
  getExampleByKey,
  getDefaultExample,
  type Example,
} from "../language/shared-examples.js";
import {
  base64UrlEncode,
  base64UrlDecode,
  parseHashParams as parseHashParamsUtil,
  updateHashParams as updateHashParamsUtil,
  type HashParams as HashParamsType,
} from "../utils/url-encoding.js";
import { checkRecordingsAvailable } from "../api/recordings-api.js";
import { BrowserPlaybackClient } from "../language/browser-playback-client.js";
import { BrowserRecordingClient } from "../language/browser-recording-client.js";

// CodeMirror highlighting effect for SVG → Editor navigation
const setHighlightEffect = StateEffect.define<{
  from: number;
  to: number;
} | null>();

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(highlights, tr) {
    highlights = highlights.map(tr.changes);
    for (let effect of tr.effects) {
      if (effect.is(setHighlightEffect)) {
        if (effect.value === null) {
          highlights = Decoration.none;
        } else {
          const mark = Decoration.mark({
            class: "cm-svg-highlight",
            attributes: {
              style:
                "background-color: rgba(14, 99, 156, 0.2); border-bottom: 2px solid rgba(14, 99, 156, 0.8);",
            },
          });
          highlights = Decoration.set([
            mark.range(effect.value.from, effect.value.to),
          ]);
        }
      }
    }
    return highlights;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Types
type SectionSize = "small" | "medium" | "big";

// Use HashParams from shared utility
type HashParams = HashParamsType;

interface SectionStates {
  settingsCollapsed: boolean;
  editorCollapsed: boolean;
  outputCollapsed: boolean;
  executionCollapsed: boolean;
  filesCollapsed: boolean;
  editorSize: SectionSize;
  outputSize: SectionSize;
  executionSize: SectionSize;
  filesSize: SectionSize;
  outputFormat: OutputFormat;
  fitToContainer: boolean;
}

// Use shared encoding/decoding utilities from url-encoding module
// (Functions imported above: base64UrlEncode, base64UrlDecode)

// Section state encoding/decoding helpers
function encodeSectionStates(states: SectionStates): string {
  // Create a compact representation using single characters
  // Format: [s][e][o][x][f][eSize][oSize][xSize][fSize][format][fit]
  // s = settings collapsed (0/1)
  // e = editor collapsed (0/1)
  // o = output collapsed (0/1)
  // x = execution collapsed (0/1)
  // f = files collapsed (0/1)
  // eSize = editor size (s/m/b for small/medium/big)
  // oSize = output size (s/m/b)
  // xSize = execution size (s/m/b)
  // fSize = files size (s/m/b)
  // format = output format (0=svg, 1=png, 2=dot, 3=json, 4=ast, 5=cst, 6=src)
  // fit = fit to container (0/1)

  const sizeMap: Record<SectionSize, string> = {
    small: "s",
    medium: "m",
    big: "b",
  };
  const formatMap: Record<OutputFormat, string> = {
    svg: "0",
    png: "1",
    dot: "2",
    json: "3",
    ast: "4",
    cst: "5",
    src: "6",
  };

  return [
    states.settingsCollapsed ? "1" : "0",
    states.editorCollapsed ? "1" : "0",
    states.outputCollapsed ? "1" : "0",
    states.executionCollapsed ? "1" : "0",
    states.filesCollapsed ? "1" : "0",
    sizeMap[states.editorSize],
    sizeMap[states.outputSize],
    sizeMap[states.executionSize],
    sizeMap[states.filesSize],
    formatMap[states.outputFormat],
    states.fitToContainer ? "1" : "0",
  ].join("");
}

function decodeSectionStates(encoded: string): Partial<SectionStates> {
  // Support both old (9-char) and new (11-char) formats for backward compatibility
  if (!encoded || (encoded.length !== 9 && encoded.length !== 11)) {
    return {}; // Return empty object for invalid input
  }

  const sizeMap: Record<string, SectionSize> = {
    s: "small",
    m: "medium",
    b: "big",
  };
  const formatMap: Record<string, OutputFormat> = {
    "0": "svg",
    "1": "png",
    "2": "dot",
    "3": "json",
    "4": "ast",
    "5": "cst",
    "6": "src",
  };

  try {
    // Handle old 9-character format (without files section)
    if (encoded.length === 9) {
      return {
        settingsCollapsed: encoded[0] === "1",
        editorCollapsed: encoded[1] === "1",
        outputCollapsed: encoded[2] === "1",
        executionCollapsed: encoded[3] === "1",
        editorSize: sizeMap[encoded[4]] || "medium",
        outputSize: sizeMap[encoded[5]] || "medium",
        executionSize: sizeMap[encoded[6]] || "medium",
        outputFormat: formatMap[encoded[7]] || "svg",
        fitToContainer: encoded[8] === "1",
        // Files section defaults when not present
        filesCollapsed: true,
        filesSize: "medium",
      };
    }

    // Handle new 11-character format (with files section)
    return {
      settingsCollapsed: encoded[0] === "1",
      editorCollapsed: encoded[1] === "1",
      outputCollapsed: encoded[2] === "1",
      executionCollapsed: encoded[3] === "1",
      filesCollapsed: encoded[4] === "1",
      editorSize: sizeMap[encoded[5]] || "medium",
      outputSize: sizeMap[encoded[6]] || "medium",
      executionSize: sizeMap[encoded[7]] || "medium",
      filesSize: sizeMap[encoded[8]] || "medium",
      outputFormat: formatMap[encoded[9]] || "svg",
      fitToContainer: encoded[10] === "1",
    };
  } catch (error) {
    console.error("Failed to decode section states:", error);
    return {};
  }
}

// Use shared hash parameter utilities
const parseHashParams = parseHashParamsUtil;
const updateHashParams = updateHashParamsUtil;

// Helper function to get flex-basis for section size
const getSectionFlexBasis = (collapsed: boolean, size: SectionSize): string => {
  if (collapsed) return "0";
  switch (size) {
    case "small":
      return "20%";
    case "medium":
      return "50%";
    case "big":
      return "100%";
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
  background: #717575;
  background: linear-gradient(
    180deg,
    rgba(113, 117, 117, 1) 0%,
    rgba(74, 74, 74, 1) 50%,
    rgba(43, 41, 41, 1) 100%
  );
`;

const HeaderTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  display: flex;
  gap: 1em;
  justify-content: space-between;
  width: 100%;
  align-items: center;

  a {
    color: #ffffff;
    text-decoration: none;
  }
`;

const SectionHeader = styled.div<{ $collapsed?: boolean; $sideways?: boolean }>`
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
  background: ${(props) => (props.$active ? "#0e639c" : "transparent")};
  border: 1px solid ${(props) => (props.$active ? "#0e639c" : "#505053")};
  color: ${(props) => (props.$active ? "#ffffff" : "#cccccc")};
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  min-width: 24px;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => (props.$active ? "#0e639c" : "#3e3e42")};
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
  position: relative;

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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const RefreshButton = styled.button`
  background: transparent;
  border: 1px solid #505053;
  color: #cccccc;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  min-width: 32px;
  height: 32px;

  &:hover {
    background: #3e3e42;
    border-color: #0e639c;
    color: #ffffff;
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }
`;

const TabBar = styled.div`
  display: flex;
  gap: 2px;
  background: #2d2d30;
  padding: 4px;
  overflow-x: auto;
  border-bottom: 1px solid #3e3e42;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 3px;
  }
`;

const Tab = styled.div<{ $active?: boolean }>`
  background: ${(props) => (props.$active ? "#1e1e1e" : "#252526")};
  color: ${(props) => (props.$active ? "#ffffff" : "#cccccc")};
  padding: 6px 12px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 13px;
  border: 1px solid ${(props) => (props.$active ? "#3e3e42" : "transparent")};
  border-bottom: none;

  &:hover {
    background: ${(props) => (props.$active ? "#1e1e1e" : "#2a2d2e")};
  }
`;

const TabName = styled.span`
  flex: 1;
`;

const TabCloseBtn = styled.button`
  background: transparent;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border-radius: 3px;

  &:hover {
    background: #3e3e42;
    color: #ffffff;
  }
`;

const SaveButton = styled.button`
  background: #0e639c;
  border: none;
  color: #ffffff;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  transition: all 0.2s ease;

  &:hover {
    background: #1177bb;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #505053;
  }
`;

const OverlayButton = styled.button<{ $success?: boolean }>`
  position: absolute;
  top: 0.3em;
  right: 0.3em;
  padding: 0.2em 0.4em;
  background: ${(props) => (props.$success ? "#10b981" : "rgba(0, 0, 0, 0.6)")};
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8em;
  display: flex;
  align-items: center;
  gap: 0.2em;
  z-index: 10;
  transition: all 0.2s;
  opacity: 0.4;

  &:hover {
    background: ${(props) =>
      props.$success ? "#10b981" : "rgba(0, 0, 0, 0.8)"};
    opacity: 1;
  }

  &:active {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const OverlayButtonGroup = styled.div`
  position: absolute;
  top: 1.4em;
  right: 0.4em;
  display: flex;
  gap: 0.3em;
  z-index: 10;
  width: 100%;
  height: 0;
  align-items: flex-end;
  justify-content: end;
  overflow: visible;

  & > button {
    position: relative;
  }
`;

const MainContainer = styled.div<{
  $collapsed?: boolean;
  $singleSection?: boolean;
}>`
  flex: 1;
  display: flex;
  flex-direction: column;
  flex-basis: ${(props) => (props.$collapsed ? "0" : "100%")};
  overflow: hidden;

  @media (min-width: 768px) {
    flex-direction: ${(props) =>
      props.$collapsed || props.$singleSection ? "column" : "row"};
  }
`;

// Generic Section component (DRY)
const Section = styled.div<{
  $collapsed?: boolean;
  $size?: SectionSize;
  $borderRight?: boolean;
}>`
  flex: ${(props) => (props.$collapsed ? "0 0 0" : "1")};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1e1e1e;
  transition: flex 0.3s ease;
  height: ${(props) => (props.$collapsed ? "0" : "auto")};
  flex-basis: ${(props) =>
    getSectionFlexBasis(props.$collapsed || false, props.$size || "medium")};

  @media (min-width: 768px) {
    ${(props) => props.$borderRight && "border-right: 1px solid #3e3e42;"}
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
  position: relative;

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

const HeaderToggles = styled.div`
  display: flex;
  gap: 0.3em;
`;

const HeaderToggle = styled.button<{ $active?: boolean }>`
  opacity: ${(props) => (props.$active ? 1 : 0.5)};
  width: 1em;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.8em;
  height: 1em;
  font-family: monospace;
  border-radius: 0.3em;
  border: 0;
  cursor: pointer;
`;

const Logo = styled.img`
  height: 1.5em;
  mix-blend-mode: lighten;
`;

const OutputSection = Section;

const ExecutionSection = Section;

// Main Component
export const CodeMirrorPlayground: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const outputPanelRef = useRef<HTMLDivElement>(null);
  const currentHighlightedElements = useRef<SVGElement[]>([]);

  const [settings, setSettings] = useState(() => loadSettings());
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(true);
  const [filesCollapsed, setFilesCollapsed] = useState(true);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [executionCollapsed, setExecutionCollapsed] = useState(true);
  const [editorSize, setEditorSize] = useState<SectionSize>("medium");
  const [outputSize, setOutputSize] = useState<SectionSize>("medium");
  const [filesSize, setFilesSize] = useState<SectionSize>("medium");
  const [executionSize, setExecutionSize] = useState<SectionSize>("medium");
  const [outputData, setOutputData] = useState<OutputData>({});
  const [executor, setExecutor] = useState<MachineExecutor | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentMachineData, setCurrentMachineData] =
    useState<MachineJSON | null>(null);
  const [selectedExample, setSelectedExample] = useState<Example | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("svg");
  const [fitToContainer, setFitToContainer] = useState(true);
  const [logLevel, setLogLevel] = useState<string>("info");
  const [isFormatting, setIsFormatting] = useState(false);

  // Playback mode state
  const [recordingsAvailable, setRecordingsAvailable] = useState(false);
  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [playbackClient, setPlaybackClient] =
    useState<BrowserPlaybackClient | null>(null);

  // Recording mode state
  const [isRecordingMode, setIsRecordingMode] = useState(false);
  const [recordingClient, setRecordingClient] = useState<any | null>(null);

  // Multi-file editor state
  const [openFiles, setOpenFiles] = useState<
    Array<{ path: string; content: string; name: string }>
  >([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const activeFileIndexRef = useRef(0);

  // Track if we're in initial load to prevent premature hash updates
  const isInitialLoadRef = useRef(true);

  // Sync activeFileIndexRef with activeFileIndex
  useEffect(() => {
    activeFileIndexRef.current = activeFileIndex;
  }, [activeFileIndex]);

  // Unified file access (VFS + API)
  const [fileService] = useState(() => {
    const vfs = new VirtualFileSystem("dygram-playground-vfs");
    // Load from localStorage (VFS handles this automatically)
    vfs.loadFromLocalStorage();
    return new FileAccessService(vfs, { workingDir: "examples" });
  });

  // Helper: Clear all SVG highlighting
  const clearSVGHighlighting = useCallback(() => {
    currentHighlightedElements.current.forEach((element) => {
      element.style.filter = "";
      element.style.opacity = "";
    });
    currentHighlightedElements.current = [];
  }, []);

  // Helper: Highlight SVG elements by source position
  const highlightSVGElementsAtPosition = useCallback(
    (line: number, character: number) => {
      clearSVGHighlighting();

      if (!outputPanelRef.current) return;

      // Find all SVG elements with position data (in xlink:href or href)
      const elements = outputPanelRef.current.querySelectorAll(
        '[href^="#L"], [*|href^="#L"]'
      );

      elements.forEach((element) => {
        // Parse position from href attribute: #L{startLine}:{startChar}-{endLine}:{endChar}
        const svgElement = element as SVGElement;
        const href =
          svgElement.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
          svgElement.getAttribute("href");

        if (!href || !href.startsWith("#L")) return;

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

          // Highlight this element
          svgElement.style.filter =
            "drop-shadow(0 0 8px rgba(14, 99, 156, 0.8))";
          svgElement.style.opacity = "1";
          currentHighlightedElements.current.push(svgElement);
        }
      });
    },
    [clearSVGHighlighting]
  );

  // Handle SVG element click - highlight source location without changing cursor
  const handleSourceLocationClick = useCallback(
    (location: {
      lineStart: number;
      charStart: number;
      lineEnd: number;
      charEnd: number;
    }) => {
      if (!editorViewRef.current) return;

      const view = editorViewRef.current;
      const doc = view.state.doc;

      // Convert line/char to offset
      const startOffset =
        doc.line(location.lineStart + 1).from + location.charStart;
      const endOffset = doc.line(location.lineEnd + 1).from + location.charEnd;

      // Highlight the range without changing selection
      view.dispatch({
        effects: setHighlightEffect.of({ from: startOffset, to: endOffset }),
        scrollIntoView: true,
      });

      // Scroll to the highlighted range
      view.dispatch({
        effects: EditorView.scrollIntoView(startOffset, { y: "center" }),
      });
    },
    []
  );

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return;

    // Determine initial content from URL hash or default
    const hashParams = parseHashParams();
    let initialCode = "";
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
      if (sectionStates.filesCollapsed !== undefined) {
        setFilesCollapsed(sectionStates.filesCollapsed);
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
      if (sectionStates.filesSize !== undefined) {
        setFilesSize(sectionStates.filesSize);
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
        example: initialExample.name.toLowerCase().replace(/\s+/g, "-"),
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
        highlightField,
        keymap.of([
          // Custom format keymap
          {
            key: "Ctrl-Shift-f",
            mac: "Cmd-Shift-f",
            run: () => {
              handleFormatDocument();
              return true;
            },
          },
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

        // Update SVG highlighting on selection/cursor changes
        if (transaction.selection) {
          const pos = transaction.state.selection.main.head;
          const line = transaction.state.doc.lineAt(pos);
          const character = pos - line.from;

          // Clear any SVG→Editor highlight when user moves cursor
          const hasHighlightEffect = transaction.effects.some((e) =>
            e.is(setHighlightEffect)
          );
          if (!hasHighlightEffect) {
            view.dispatch({
              effects: setHighlightEffect.of(null),
            });
          }
          // Highlight SVG elements at cursor position
          highlightSVGElementsAtPosition(line.number - 1, character);
        }

        // Update output panel on document changes
        if (transaction.docChanged) {
          const code = view.state.doc.toString();
          handleDocumentChange(code);

          // Update content in open files array
          setOpenFiles((prev) => {
            const currentIndex = activeFileIndexRef.current;
            if (prev.length > 0 && currentIndex < prev.length) {
              const updated = [...prev];
              updated[currentIndex] = {
                ...updated[currentIndex],
                content: code,
              };
              return updated;
            }
            return prev;
          });

          // Mark as dirty and update URL hash with content
          setIsDirty(true);

          // Update URL hash with encoded content
          if (selectedExample) {
            updateHashParams({
              example: selectedExample.name.toLowerCase().replace(/\s+/g, "-"),
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

    // Mark initial load as complete after a short delay to ensure all state updates are processed
    setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 100);

    return () => {
      view.destroy();
    };
  }, []);

  // Update URL hash when section states change
  useEffect(() => {
    // Skip hash updates during initial load to prevent overwriting restored state
    if (isInitialLoadRef.current) {
      return;
    }

    const currentSectionStates: SectionStates = {
      settingsCollapsed,
      editorCollapsed,
      outputCollapsed,
      executionCollapsed,
      filesCollapsed,
      editorSize,
      outputSize,
      executionSize,
      filesSize,
      outputFormat,
      fitToContainer,
    };

    // Get current hash params
    const hashParams = parseHashParams();

    // Encode current section states
    const encodedSections = encodeSectionStates(currentSectionStates);

    // Update hash params with new section states
    updateHashParams({
      ...hashParams,
      sections: encodedSections,
    });
  }, [
    settingsCollapsed,
    editorCollapsed,
    outputCollapsed,
    executionCollapsed,
    filesCollapsed,
    editorSize,
    outputSize,
    executionSize,
    filesSize,
    outputFormat,
    fitToContainer,
  ]);

  // Check for recordings when example changes
  useEffect(() => {
    const checkRecordings = async () => {
      if (!selectedExample) {
        setRecordingsAvailable(false);
        setIsPlaybackMode(false);
        setPlaybackClient(null);
        setIsRecordingMode(false);
        setRecordingClient(null);
        return;
      }

      try {
        // Extract example name from filename (remove extension)
        const exampleName = selectedExample.filename.replace(
          /\.(dy|dygram|mach)$/,
          ""
        );

        // Check if recordings exist
        const available = await checkRecordingsAvailable(
          exampleName,
          selectedExample.category
        );
        setRecordingsAvailable(available);

        if (!available) {
          setIsPlaybackMode(false);
          setPlaybackClient(null);
        }

        // Reset recording mode when switching examples
        setIsRecordingMode(false);
        setRecordingClient(null);
      } catch (error) {
        console.warn("Failed to check recordings:", error);
        setRecordingsAvailable(false);
        setIsPlaybackMode(false);
        setPlaybackClient(null);
        setIsRecordingMode(false);
        setRecordingClient(null);
      }
    };

    checkRecordings();
  }, [selectedExample]);

  // Fetch available models on mount and when API key changes
  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const models = await fetchAnthropicModels(settings.apiKey);
        setAvailableModels(models);
      } catch (error) {
        console.warn("Failed to load models:", error);
        // fetchAnthropicModels already handles fallback to hardcoded models
      } finally {
        setIsLoadingModels(false);
      }
    };

    loadModels();
  }, [settings.apiKey]);

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

  const handleRefreshModels = useCallback(async () => {
    setIsLoadingModels(true);
    clearModelsCache();
    try {
      const models = await fetchAnthropicModels(settings.apiKey);
      setAvailableModels(models);
    } catch (error) {
      console.warn("Failed to refresh models:", error);
    } finally {
      setIsLoadingModels(false);
    }
  }, [settings.apiKey]);

  // Handle section toggles
  const toggleSettings = useCallback(() => {
    setSettingsCollapsed((prev) => !prev);
  }, []);

  const toggleFiles = useCallback(() => {
    setFilesCollapsed((prev) => !prev);
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

  const handleFilesSizeChange = useCallback((size: SectionSize) => {
    setFilesSize(size);
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
        example: example.name.toLowerCase().replace(/\s+/g, "-"),
      });
    }
  }, []);

  // Handle file selection from Unified FileTree
  const handleFileSelect = useCallback(
    (path: string, content: string) => {
      const pathParts = path.split("/");
      const filename = pathParts[pathParts.length - 1];
      const name = filename
        .replace(/\.(dygram|mach)$/, "")
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      // Check if file is already open
      const existingIndex = openFiles.findIndex((f) => f.path === path);

      if (existingIndex >= 0) {
        // File already open, just switch to it
        setActiveFileIndex(existingIndex);
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: {
              from: 0,
              to: editorViewRef.current.state.doc.length,
              insert: openFiles[existingIndex].content,
            },
          });
        }
      } else {
        // Open new file
        const newFile = { path, content, name };
        setOpenFiles((prev) => [...prev, newFile]);
        setActiveFileIndex(openFiles.length); // New file will be at end of array

        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: {
              from: 0,
              to: editorViewRef.current.state.doc.length,
              insert: content,
            },
          });
        }
      }

      // Create an example-like object for consistency
      const category = pathParts.length > 1 ? pathParts[0] : "root";
      const fileExample: Example = {
        path,
        name,
        title: name,
        category,
        filename,
        content,
      };

      setSelectedExample(fileExample);
      setIsDirty(false);

      // Update URL hash
      updateHashParams({
        example: name.toLowerCase().replace(/\s+/g, "-"),
      });
    },
    [openFiles]
  );

  // Handle tab switching
  const handleTabSwitch = useCallback(
    (index: number) => {
      if (index >= 0 && index < openFiles.length) {
        setActiveFileIndex(index);
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: {
              from: 0,
              to: editorViewRef.current.state.doc.length,
              insert: openFiles[index].content,
            },
          });
        }
      }
    },
    [openFiles]
  );

  // Handle tab close
  const handleTabClose = useCallback(
    (index: number) => {
      const newFiles = openFiles.filter((_, i) => i !== index);
      setOpenFiles(newFiles);

      // Adjust active index
      if (newFiles.length === 0) {
        setActiveFileIndex(0);
        // Clear editor
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: {
              from: 0,
              to: editorViewRef.current.state.doc.length,
              insert: "",
            },
          });
        }
      } else if (index === activeFileIndex) {
        // Closed active tab, switch to previous or next
        const newIndex = index > 0 ? index - 1 : 0;
        setActiveFileIndex(newIndex);
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: {
              from: 0,
              to: editorViewRef.current.state.doc.length,
              insert: newFiles[newIndex].content,
            },
          });
        }
      } else if (index < activeFileIndex) {
        // Closed tab before active, adjust index
        setActiveFileIndex(activeFileIndex - 1);
      }
    },
    [openFiles, activeFileIndex]
  );

  // Handle save file
  const handleSaveFile = useCallback(async () => {
    if (openFiles.length === 0 || activeFileIndex >= openFiles.length) {
      return;
    }

    const activeFile = openFiles[activeFileIndex];

    try {
      // Use FileAccessService which tries API first, falls back to VFS
      await fileService.writeFile(activeFile.path, activeFile.content);

      const apiAvailable = fileService.isApiAvailable();
      if (apiAvailable) {
        alert(`Saved ${activeFile.name} to both API and VFS!`);
      } else {
        alert(`Saved ${activeFile.name} to virtual filesystem!`);
      }

      setIsDirty(false);
    } catch (error) {
      console.error("Error saving file:", error);
      alert(
        `Failed to save file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }, [openFiles, activeFileIndex, fileService]);

  // Handle format document
  const handleFormatDocument = useCallback(async () => {
    if (!editorViewRef.current || isFormatting) {
      return;
    }

    try {
      setIsFormatting(true);

      // Get current editor content
      const currentCode = editorViewRef.current.state.doc.toString();

      if (!currentCode.trim()) {
        console.warn("No content to format");
        return;
      }

      // Initialize Langium services for parsing
      const services = createMachineServices(EmptyFileSystem);
      const parse = parseHelper<Machine>(services.Machine);

      // Parse the current code
      const document = await parse(currentCode);

      // Check for parser errors
      if (document.parseResult.parserErrors.length > 0) {
        console.error(
          "Cannot format document with parse errors:",
          document.parseResult.parserErrors
        );
        // alert("Cannot format document: Please fix syntax errors first");
        // return;
      }

      // Get the machine model
      const model = document.parseResult.value as Machine;
      if (!model) {
        console.error("No machine model parsed");
        alert("Cannot format document: Invalid machine definition");
        return;
      }

      // Convert to JSON and back to DSL for formatting
      const machineJson = serializeMachineToJSON(model);
      const formattedDSL = generateDSL(machineJson);

      // Update editor with formatted content
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: formattedDSL,
        },
      });

      // Update content in open files array
      setOpenFiles((prev) => {
        const currentIndex = activeFileIndexRef.current;
        if (prev.length > 0 && currentIndex < prev.length) {
          const updated = [...prev];
          updated[currentIndex] = {
            ...updated[currentIndex],
            content: formattedDSL,
          };
          return updated;
        }
        return prev;
      });

      // Mark as dirty since content changed
      setIsDirty(true);

      console.log("Document formatted successfully");
    } catch (error) {
      console.error("Error formatting document:", error);
      alert(
        `Failed to format document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsFormatting(false);
    }
  }, [isFormatting]);

  // Helper to convert Machine AST to canonical Machine JSON
  const convertToMachineData = useCallback((machine: Machine): MachineJSON => {
    return serializeMachineToJSON(machine);
  }, []);

  // Helper to refresh visualization (component will call this)
  const refreshVisualization = useCallback(async () => {
    // ExecutionStateVisualizer component now handles visualization internally
    // This is a no-op placeholder for compatibility
    return Promise.resolve();
  }, []);

  // PNG generation utility
  const generatePngFromSvg = useCallback(
    async (svgContent: string): Promise<string | undefined> => {
      if (!svgContent) {
        return undefined;
      }

      try {
        const blob = new Blob([svgContent], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const image = new Image();

            image.onload = () => {
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");

              if (!context) {
                reject(new Error("Unable to obtain 2D canvas context"));
                return;
              }

              canvas.width = image.width;
              canvas.height = image.height;
              context.drawImage(image, 0, 0);
              resolve(canvas.toDataURL("image/png"));
            };

            image.onerror = () => {
              reject(new Error("Unable to load SVG for PNG conversion"));
            };

            image.src = url;
          });

          return dataUrl;
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error("Failed to generate PNG preview from SVG:", error);
        return undefined;
      }
    },
    []
  );

  // Update SVG visualization with execution state
  const updateRuntimeVisualization = useCallback(
    async (exec: MachineExecutor) => {
      console.log("[updateRuntimeVisualization] Called", {
        hasExecutor: !!exec,
        hasCurrentMachineData: !!currentMachineData,
      });

      if (!exec) {
        console.warn("[updateRuntimeVisualization] No executor provided");
        return;
      }

      // Get machine data from executor if not available in state
      const machineData = currentMachineData || exec.getMachineDefinition();
      if (!machineData) {
        console.warn("[updateRuntimeVisualization] No machine data available");
        return;
      }

      try {
        // Get current execution state
        const state = exec.getState();
        console.log("[updateRuntimeVisualization] Execution state:", {
          state,
          machineData,
        });

        // Check if there are any paths with execution
        if (!state.paths || state.paths.length === 0) {
          console.warn("[updateRuntimeVisualization] No execution paths found");
          return;
        }

        // Generate new Graphviz with ExecutionState (conversion handled internally)
        const { generateRuntimeGraphviz } = await import(
          "../language/diagram/index.js"
        );
        const dotWithContext = generateRuntimeGraphviz(machineData, state, {
          showRuntimeState: true,
          showVisitCounts: true,
          showExecutionPath: true,
        });

        console.log(
          "[updateRuntimeVisualization] Generated runtime DOT, length:",
          dotWithContext.length
        );

        // Render to SVG
        const tempDiv = window.document.createElement("div");
        const svgResult = await renderGraphviz(dotWithContext, tempDiv);

        // Generate PNG from SVG
        const pngDataUrl = await generatePngFromSvg(tempDiv.innerHTML);

        console.log(
          "[updateRuntimeVisualization] Rendered SVG, length:",
          tempDiv.innerHTML.length
        );

        // Update output panel with new SVG
        setOutputData((prev) => ({
          ...prev,
          graphviz: dotWithContext,
          svg: tempDiv.innerHTML,
          png: pngDataUrl,
        }));

        console.log("[updateRuntimeVisualization] Updated output data");
      } catch (error) {
        console.error("[updateRuntimeVisualization] Failed:", error);
      }
    },
    [currentMachineData, generatePngFromSvg]
  );

  // Subscribe to executor state changes for reactive SVG updates
  useEffect(() => {
    if (!executor) return;

    // Subscribe to state changes
    if (typeof executor.setOnStateChangeCallback === "function") {
      executor.setOnStateChangeCallback(() => {
        updateRuntimeVisualization(executor);
      });

      return () => {
        // Clean up callback
        if (typeof executor.setOnStateChangeCallback === "function") {
          executor.setOnStateChangeCallback(undefined);
        }
      };
    }

    return () => {};
  }, [executor, updateRuntimeVisualization]);

  // Execution handlers
  const handleExecute = useCallback(async () => {
    if (isExecuting) {
      console.warn("Execution already in progress");
      return;
    }

    if (!outputData.machine) {
      console.error("No machine parsed");
      return;
    }

    // Check if we need API key (not in playback mode)
    if (!isPlaybackMode && !settings.apiKey) {
      console.error("API key missing (required for live execution)");
      return;
    }

    try {
      setIsExecuting(true);

      // Convert AST to MachineJSON
      const machineJSON = convertToMachineData(outputData.machine);
      setCurrentMachineData(machineJSON);

      // Create executor with appropriate client
      let exec: MachineExecutor;

      if (isPlaybackMode && playbackClient) {
        // Playback mode - use recordings
        console.log("Starting playback execution...");
        exec = await MachineExecutor.create(machineJSON, {
          llm: playbackClient as any, // Duck typing - playback client implements same interface
        });
      } else if (isRecordingMode && recordingClient) {
        // Recording mode - use recording client (transparently records)
        console.log("Starting recording execution...");
        exec = await MachineExecutor.create(machineJSON, {
          llm: recordingClient as any, // Duck typing - recording client implements same interface
        });
      } else {
        // Live mode - use API
        console.log("Starting live execution...");
        exec = await MachineExecutor.create(machineJSON, {
          llm: {
            provider: "anthropic",
            apiKey: settings.apiKey,
            modelId: settings.model,
          },
        });
      }

      setExecutor(exec);

      // Set up state change callback BEFORE execution starts
      // This ensures diagram updates during execution, not just at the end
      if (typeof exec.setOnStateChangeCallback === "function") {
        exec.setOnStateChangeCallback((...args) => {
          exec
            .getLogger()
            .info(
              "sync",
              `CodeMirror playground OnStateChangeCallback called`,
              args
            );
          updateRuntimeVisualization(exec);
        });
      }

      // Set up machine update callback to capture meta-programming changes
      if (typeof exec.setMachineUpdateCallback === "function") {
        exec.setMachineUpdateCallback((dsl: string) => {
          console.log(
            "[Playground] Machine updated via meta-programming, updating editor"
          );

          // Update editor with new DSL
          if (editorViewRef.current) {
            editorViewRef.current.dispatch({
              changes: {
                from: 0,
                to: editorViewRef.current.state.doc.length,
                insert: dsl,
              },
            });
          }

          // Update machine data
          const updatedMachineData = exec.getMachineDefinition();
          setCurrentMachineData(updatedMachineData);

          // Mark as dirty so user knows to save
          setIsDirty(true);
        });
      }
      if (typeof exec.setMachineUpdateCallback === "function") {
        exec.setMachineUpdateCallback((...args) => {
          exec
            .getLogger()
            .info(
              "sync",
              `CodeMirror playground MachineUpdateCallback called`,
              args
            );
          updateRuntimeVisualization(exec);
        });
      }

      // Execute machine
      await exec.execute();

      // Final update to ensure we have the complete state
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
    isPlaybackMode,
    playbackClient,
    convertToMachineData,
    updateRuntimeVisualization,
  ]);

  const handleStep = useCallback(async () => {
    if (!outputData.machine) {
      console.error("No machine parsed");
      return;
    }

    // Check if we need API key (not in playback mode)
    if (!isPlaybackMode && !settings.apiKey) {
      console.error("API key missing (required for live execution)");
      return;
    }

    try {
      let exec = executor;

      // Create executor if not exists (first step)
      if (!exec) {
        const machineJSON = convertToMachineData(outputData.machine);
        setCurrentMachineData(machineJSON);

        if (isPlaybackMode && playbackClient) {
          // Playback mode
          exec = await MachineExecutor.create(machineJSON, {
            llm: playbackClient as any,
          });
        } else {
          // Live mode
          exec = await MachineExecutor.create(machineJSON, {
            llm: {
              provider: "anthropic",
              apiKey: settings.apiKey,
              modelId: settings.model,
            },
          });
        }

        setExecutor(exec);

        // Set up callbacks for new executor
        if (typeof exec.setOnStateChangeCallback === "function") {
          exec.setOnStateChangeCallback(() => {
            updateRuntimeVisualization(exec);
          });
        }

        if (typeof exec.setMachineUpdateCallback === "function") {
          exec.setMachineUpdateCallback((dsl: string) => {
            console.log(
              "[Playground] Machine updated via meta-programming (step mode), updating editor"
            );

            // Update editor with new DSL
            if (editorViewRef.current) {
              editorViewRef.current.dispatch({
                changes: {
                  from: 0,
                  to: editorViewRef.current.state.doc.length,
                  insert: dsl,
                },
              });
            }

            // Update machine data
            const updatedMachineData = exec.getMachineDefinition();
            setCurrentMachineData(updatedMachineData);

            // Mark as dirty
            setIsDirty(true);
          });
        }
      }

      // Execute one step
      console.log("Executing step...");
      const continued = await exec.step();

      // Update SVG visualization with execution context
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
    isPlaybackMode,
    playbackClient,
    convertToMachineData,
    updateRuntimeVisualization,
  ]);

  const handleStepTurn = useCallback(async () => {
    if (!outputData.machine) {
      console.error("No machine parsed");
      return;
    }

    // Check if we need API key (not in playback mode)
    if (!isPlaybackMode && !settings.apiKey) {
      console.error("API key missing (required for live execution)");
      return;
    }

    try {
      let exec = executor;

      // Create executor if not exists (first turn step)
      if (!exec) {
        const machineJSON = convertToMachineData(outputData.machine);
        setCurrentMachineData(machineJSON);

        if (isPlaybackMode && playbackClient) {
          // Playback mode
          exec = await MachineExecutor.create(machineJSON, {
            llm: playbackClient as any,
          });
        } else {
          // Live mode
          exec = await MachineExecutor.create(machineJSON, {
            llm: {
              provider: "anthropic",
              apiKey: settings.apiKey,
              modelId: settings.model,
            },
          });
        }

        setExecutor(exec);

        // Set up callbacks for new executor
        if (typeof exec.setOnStateChangeCallback === "function") {
          exec.setOnStateChangeCallback(() => {
            updateRuntimeVisualization(exec);
          });
        }

        if (typeof exec.setMachineUpdateCallback === "function") {
          exec.setMachineUpdateCallback((dsl: string) => {
            console.log(
              "[Playground] Machine updated via meta-programming (turn step mode), updating editor"
            );

            // Update editor with new DSL
            if (editorViewRef.current) {
              editorViewRef.current.dispatch({
                changes: {
                  from: 0,
                  to: editorViewRef.current.state.doc.length,
                  insert: dsl,
                },
              });
            }

            // Update machine data
            const updatedMachineData = exec.getMachineDefinition();
            setCurrentMachineData(updatedMachineData);

            // Mark as dirty
            setIsDirty(true);
          });
        }
      }

      // Execute one turn
      console.log("Executing turn step...");
      const result = await exec.stepTurn();

      console.log(`Turn step result: ${result.status}`);
      console.log(`Tools used: ${result.toolExecutions.length}`);
      console.log(`Text output: ${result.text.substring(0, 100)}...`);

      // Update SVG visualization with execution context
      await updateRuntimeVisualization(exec);

      if (result.status === "complete") {
        console.log("Turn complete");
      } else if (result.status === "error") {
        console.error("Turn error:", result.error);
      }
    } catch (error) {
      console.error("Turn step error:", error);
    }
  }, [
    executor,
    outputData.machine,
    settings,
    isPlaybackMode,
    playbackClient,
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

        // Convert Machine AST to JSON and generate Graphviz DOT
        const machineJson = serializeMachineToJSON(model);
        const dotCode = generateGraphvizFromJSON(machineJson);

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
          cst: document.parseResult.value.$cstNode,
          src: code,
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

  const handleLogLevelChange = useCallback(
    (level: string) => {
      setLogLevel(level);
      if (executor) {
        executor.setLogLevel(level as any);
      }
    },
    [executor]
  );

  const handleTogglePlaybackMode = useCallback(async () => {
    if (!selectedExample || !recordingsAvailable) {
      console.warn("Cannot toggle playback mode: no recordings available");
      return;
    }

    const newPlaybackMode = !isPlaybackMode;
    setIsPlaybackMode(newPlaybackMode);

    if (newPlaybackMode) {
      // Enable playback mode - create playback client
      try {
        const exampleName = selectedExample.filename.replace(
          /\.(dy|dygram|mach)$/,
          ""
        );
        const client = await BrowserPlaybackClient.create({
          exampleName,
          category: selectedExample.category,
        });
        setPlaybackClient(client);
        console.log(
          `Playback mode enabled: ${client.getRecordingCount()} recordings loaded`
        );
      } catch (error) {
        console.error("Failed to create playback client:", error);
        setIsPlaybackMode(false);
        setPlaybackClient(null);
      }
    } else {
      // Disable playback mode
      setPlaybackClient(null);
      console.log("Playback mode disabled");
    }

    // Reset executor when toggling modes
    setExecutor(null);
    setIsExecuting(false);
  }, [selectedExample, recordingsAvailable, isPlaybackMode]);

  const handleToggleRecordingMode = useCallback(async () => {
    if (!selectedExample || !settings.apiKey) {
      if (!settings.apiKey) {
        alert(
          "API key required for recording mode. Please set your Anthropic API key in settings."
        );
      }
      return;
    }

    const newRecordingMode = !isRecordingMode;
    setIsRecordingMode(newRecordingMode);

    if (newRecordingMode) {
      // Enable recording mode - create recording client
      try {
        const exampleName = selectedExample.filename.replace(
          /\.(dy|dygram|mach)$/,
          ""
        );
        const client = await BrowserRecordingClient.create({
          apiKey: settings.apiKey,
          modelId: settings.model,
          exampleName,
          category: selectedExample.category,
          userNotes: `Recording for ${selectedExample.name}`,
        });
        setRecordingClient(client);
        console.log(
          `Recording mode enabled for ${selectedExample.category}/${exampleName}`
        );
      } catch (error) {
        console.error("Failed to create recording client:", error);
        alert(
          `Failed to enable recording mode: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        setIsRecordingMode(false);
        setRecordingClient(null);
      }
    } else {
      // Disable recording mode
      if (recordingClient && recordingClient.getRecordingCount() > 0) {
        const count = recordingClient.getRecordingCount();
        if (
          confirm(
            `You have ${count} recording(s). Export before disabling recording mode?`
          )
        ) {
          recordingClient.downloadRecordings();
        }
      }
      setRecordingClient(null);
      console.log("Recording mode disabled");
    }

    // Reset executor when toggling modes
    setExecutor(null);
    setIsExecuting(false);
  }, [
    selectedExample,
    settings.apiKey,
    settings.model,
    isRecordingMode,
    recordingClient,
  ]);

  const handleExportRecordings = useCallback(() => {
    if (!recordingClient) return;

    try {
      recordingClient.downloadRecordings();
      console.log("Recordings exported successfully");
    } catch (error) {
      console.error("Failed to export recordings:", error);
      alert(
        `Failed to export recordings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }, [recordingClient]);

  const handleClearRecordings = useCallback(() => {
    if (!recordingClient) return;

    const count = recordingClient.getRecordingCount();
    if (count === 0) return;

    if (confirm(`Clear all ${count} recording(s)? This cannot be undone.`)) {
      recordingClient.clearRecordings();
      console.log("Recordings cleared");
    }
  }, [recordingClient]);

  const handleReset = useCallback(async () => {
    console.log("Resetting machine");
    setExecutor(null);
    setIsExecuting(false);
    setCurrentMachineData(null);

    // Re-render static diagram
    if (editorViewRef.current && outputData.machine) {
      try {
        // Convert Machine AST to JSON and generate Graphviz DOT
        const machineJson = serializeMachineToJSON(outputData.machine);
        const dotCode = generateGraphvizFromJSON(machineJson);

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
  }, [outputData.machine, generatePngFromSvg]);

  return (
    <Container>
      <Header>
        <HeaderTitle>
          <a href="./">DyGram</a>
          <Logo src="./static/icon.png" alt="Logo" />
          <HeaderToggles>
            <HeaderToggle $active={!editorCollapsed} onClick={toggleEditor}>
              E
            </HeaderToggle>
            <HeaderToggle $active={!outputCollapsed} onClick={toggleOutput}>
              O
            </HeaderToggle>
            <HeaderToggle $active={!settingsCollapsed} onClick={toggleSettings}>
              S
            </HeaderToggle>
            <HeaderToggle $active={!filesCollapsed} onClick={toggleFiles}>
              F
            </HeaderToggle>
            <HeaderToggle
              $active={!executionCollapsed}
              onClick={toggleExecution}
            >
              X
            </HeaderToggle>
          </HeaderToggles>
        </HeaderTitle>
      </Header>

      {!settingsCollapsed && (
        <>
          <SectionHeader>
            <span>Settings</span>
            <ToggleBtn onClick={toggleSettings}>✕</ToggleBtn>
          </SectionHeader>
          <SettingsPanel $collapsed={settingsCollapsed}>
            <SettingsGroup>
              <label htmlFor="model-select">
                Model:{" "}
                {isLoadingModels && (
                  <span style={{ fontSize: "10px", color: "#888" }}>
                    (loading...)
                  </span>
                )}
              </label>
              <SettingsSelect
                id="model-select"
                value={settings.model}
                onChange={handleModelChange}
                disabled={isLoadingModels}
              >
                {availableModels.length > 0 ? (
                  availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                ) : (
                  <option value={settings.model}>{settings.model}</option>
                )}
              </SettingsSelect>
              <RefreshButton
                onClick={handleRefreshModels}
                disabled={isLoadingModels}
                title="Refresh models list"
              >
                ↻
              </RefreshButton>
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
          </SettingsPanel>{" "}
        </>
      )}

      {/* Files Section */}
      {!filesCollapsed && (
        <>
          <SectionHeader>
            <span>Files</span>
            <HeaderControls>
              {!filesCollapsed && (
              <SizeControls>
                <SizeBtn
                  $active={filesSize === "small"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFilesSizeChange("small");
                  }}
                >
                  S
                </SizeBtn>
                <SizeBtn
                  $active={filesSize === "medium"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFilesSizeChange("medium");
                  }}
                >
                  M
                </SizeBtn>
                <SizeBtn
                  $active={filesSize === "big"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFilesSizeChange("big");
                  }}
                >
                  L
                </SizeBtn>
              </SizeControls>
            )}
            <ToggleBtn onClick={toggleFiles}>✕</ToggleBtn>
            </HeaderControls>
          </SectionHeader>
          <Section $collapsed={filesCollapsed} $size={filesSize}>
            <UnifiedFileTree
              fileService={fileService}
              onSelectFile={handleFileSelect}
              onFilesChanged={() => {
                /* Trigger re-render if needed */
              }}
            />
          </Section>
        </>
      )}

      {(!outputCollapsed || !editorCollapsed) && (
        <>
          <MainContainer
            $collapsed={outputCollapsed && editorCollapsed}
            $singleSection={editorCollapsed !== outputCollapsed}
          >
            {!editorCollapsed && (
              <>
                <SectionHeader
                  $sideways={!editorCollapsed && !outputCollapsed}
                >
                  <span>Editor</span>
                  <HeaderControls>
                    {!editorCollapsed && (
                      <SizeControls>
                        <SizeBtn
                          $active={editorSize === "small"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditorSizeChange("small");
                          }}
                        >
                          S
                        </SizeBtn>
                        <SizeBtn
                          $active={editorSize === "medium"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditorSizeChange("medium");
                          }}
                        >
                          M
                        </SizeBtn>
                        <SizeBtn
                          $active={editorSize === "big"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditorSizeChange("big");
                          }}
                        >
                          L
                        </SizeBtn>
                      </SizeControls>
                    )}
                    <ToggleBtn onClick={toggleEditor}>✕</ToggleBtn>
                  </HeaderControls>
                </SectionHeader>
                <EditorSection
                  $collapsed={editorCollapsed}
                  $size={editorSize}
                  $borderRight
                >
                  {openFiles.length > 0 && !editorCollapsed && (
                    <TabBar>
                      {openFiles.map((file, index) => (
                        <Tab
                          key={file.path}
                          $active={index === activeFileIndex}
                          onClick={() => handleTabSwitch(index)}
                        >
                          <TabName>{file.name}</TabName>
                          <TabCloseBtn
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTabClose(index);
                            }}
                            title="Close"
                          >
                            ×
                          </TabCloseBtn>
                        </Tab>
                      ))}
                      {isDirty && (
                        <SaveButton
                          onClick={handleSaveFile}
                          title="Save current file (API + VFS)"
                        >
                          💾 Save
                        </SaveButton>
                      )}
                    </TabBar>
                  )}
                  <SectionContent $collapsed={editorCollapsed}>
                    <EditorContainer ref={editorRef}>
                      {!editorCollapsed && (
                        <OverlayButtonGroup>
                          <OverlayButton
                            onClick={handleFormatDocument}
                            disabled={isFormatting}
                            title="Format document (DSL > JSON > DSL)"
                          >
                            {isFormatting ? "⏳" : "🎨"} Format
                          </OverlayButton>
                        </OverlayButtonGroup>
                      )}
                    </EditorContainer>
                  </SectionContent>
                </EditorSection>{" "}
              </>
            )}

            {!outputCollapsed && (
              <>
                <SectionHeader
                  $sideways={!editorCollapsed && !outputCollapsed}
                >
                  <span>Output</span>
                  <HeaderControls>
                    {!outputCollapsed && (
                      <SizeControls>
                        <SizeBtn
                          $active={outputSize === "small"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOutputSizeChange("small");
                          }}
                        >
                          S
                        </SizeBtn>
                        <SizeBtn
                          $active={outputSize === "medium"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOutputSizeChange("medium");
                          }}
                        >
                          M
                        </SizeBtn>
                        <SizeBtn
                          $active={outputSize === "big"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOutputSizeChange("big");
                          }}
                        >
                          L
                        </SizeBtn>
                      </SizeControls>
                    )}
                    <ToggleBtn onClick={toggleOutput}>✕</ToggleBtn>
                  </HeaderControls>
                </SectionHeader>
                <OutputSection $collapsed={outputCollapsed} $size={outputSize}>
                  <SectionContent $collapsed={outputCollapsed}>
                    <div
                      ref={outputPanelRef}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <OutputPanel
                        defaultFormat={outputFormat}
                        mobile={true}
                        data={outputData}
                        onFormatChange={handleOutputFormatChange}
                        onSourceLocationClick={handleSourceLocationClick}
                      />
                    </div>
                  </SectionContent>
                </OutputSection>{" "}
              </>
            )}
          </MainContainer>{" "}
        </>
      )}

      {!executionCollapsed && (
        <>
          <SectionHeader>
            <span>Execution</span>
            <HeaderControls>
              {!executionCollapsed && (
                <SizeControls>
                  <SizeBtn
                    $active={executionSize === "small"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecutionSizeChange("small");
                    }}
                  >
                    S
                  </SizeBtn>
                  <SizeBtn
                    $active={executionSize === "medium"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecutionSizeChange("medium");
                    }}
                  >
                    M
                  </SizeBtn>
                  <SizeBtn
                    $active={executionSize === "big"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecutionSizeChange("big");
                    }}
                  >
                    L
                  </SizeBtn>
                </SizeControls>
              )}
              <ToggleBtn onClick={toggleExecution}>✕</ToggleBtn>
            </HeaderControls>
          </SectionHeader>
          <ExecutionSection
            $collapsed={executionCollapsed}
            $size={executionSize}
          >
            <SectionContent $collapsed={executionCollapsed}>
              {executor && (
                <ExecutionStateVisualizer executor={executor} mobile={false} />
              )}
              <ExecutionControls
                onExecute={handleExecute}
                onStep={handleStep}
                onStepTurn={handleStepTurn}
                onStop={handleStop}
                onReset={handleReset}
                mobile={false}
                showLog={true}
                executor={executor}
                logLevel={logLevel}
                onLogLevelChange={handleLogLevelChange}
                playbackMode={isPlaybackMode}
                recordingsAvailable={recordingsAvailable}
                onTogglePlaybackMode={handleTogglePlaybackMode}
                playbackClient={playbackClient}
                recordingMode={isRecordingMode}
                onToggleRecordingMode={handleToggleRecordingMode}
                recordingClient={recordingClient}
                onExportRecordings={handleExportRecordings}
                onClearRecordings={handleClearRecordings}
              />
            </SectionContent>
          </ExecutionSection>{" "}
        </>
      )}
    </Container>
  );
};
