import React, { useEffect, useRef } from "react";
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
import styled from "styled-components";
import { ExecutionControls } from "./ExecutionControls";
import { UnifiedFileTree } from "./UnifiedFileTree";
import { OutputPanel } from "./OutputPanel";
import { createLangiumExtensions } from "../codemirror-langium";
import { usePlaygroundController } from "./playground/usePlaygroundController";
import {
  Container,
  Header,
  HeaderTitle,
  SectionHeader,
  ToggleBtn,
  SizeControls,
  SizeBtn,
  HeaderControls,
  SettingsPanel,
  SettingsGroup,
  SettingsInput,
  SettingsSelect,
  TabBar,
  Tab,
  TabName,
  TabCloseBtn,
  SaveButton,
  MainContainer,
  EditorSection,
  OutputSection,
  ExecutionSection,
  SectionContent,
  EditorContainer as BaseEditorContainer,
} from "./playground/Layout";

const EditorContainer = styled(BaseEditorContainer)`
  .cm-editor {
    height: 100%;
    background: #1e1e1e;
  }

  .cm-gutters {
    background: #1e1e1e;
    border-right: 1px solid #3e3e42;
  }
`;

export const CodeMirrorPlayground: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const {
    settings,
    settingsCollapsed,
    filesCollapsed,
    editorCollapsed,
    outputCollapsed,
    executionCollapsed,
    editorSize,
    outputSize,
    executionSize,
    outputData,
    executor,
    isDirty,
    outputFormat,
    logLevel,
    openFiles,
    activeFileIndex,
    fileService,
    initialContent,
    handleModelChange,
    handleApiKeyChange,
    toggleSettings,
    toggleFiles,
    toggleEditor,
    toggleOutput,
    toggleExecution,
    handleEditorSizeChange,
    handleOutputSizeChange,
    handleExecutionSizeChange,
    handleOutputFormatChange,
    handleFileSelect,
    handleTabSwitch,
    handleTabClose,
    handleSaveFile,
    handleDocumentChange,
    handleExecute,
    handleStep,
    handleStop,
    handleReset,
    handleLogLevelChange,
    registerEditorApi,
  } = usePlaygroundController();

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const startState = EditorState.create({
      doc: initialContent,
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

        if (transaction.docChanged) {
          const code = view.state.doc.toString();
          handleDocumentChange(code);
        }
      },
    });

    editorViewRef.current = view;

    registerEditorApi({
      setContent: (content) => {
        if (!editorViewRef.current) return;
        editorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: editorViewRef.current.state.doc.length,
            insert: content,
          },
        });
      },
      getContent: () => editorViewRef.current?.state.doc.toString() ?? "",
    });

    // Render initial output
    handleDocumentChange(initialContent);

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [handleDocumentChange, initialContent, registerEditorApi]);

  return (
    <Container>
      <Header>
        <HeaderTitle>
          <a href="./">DyGram</a>
        </HeaderTitle>
      </Header>

      <SectionHeader onClick={toggleSettings}>
        <span>Settings</span>
        <ToggleBtn>{settingsCollapsed ? "▶" : "▼"}</ToggleBtn>
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
      </SettingsPanel>

      <SectionHeader onClick={toggleFiles}>
        <span>Files</span>
        <ToggleBtn>{filesCollapsed ? "▶" : "▼"}</ToggleBtn>
      </SectionHeader>
      {!filesCollapsed && (
        <UnifiedFileTree
          fileService={fileService}
          onSelectFile={(path, content) => handleFileSelect(path, content)}
          onFilesChanged={() => undefined}
        />
      )}

      <MainContainer $collapsed={outputCollapsed && editorCollapsed}>
        <SectionHeader
          onClick={toggleEditor}
          $sideways={outputCollapsed && editorCollapsed ? false : true}
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
                  B
                </SizeBtn>
              </SizeControls>
            )}
            <ToggleBtn>{editorCollapsed ? "▶" : "▼"}</ToggleBtn>
          </HeaderControls>
        </SectionHeader>
        <EditorSection $collapsed={editorCollapsed} $size={editorSize} $borderRight>
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
                <SaveButton onClick={handleSaveFile} title="Save current file (API + VFS)">
                  💾 Save
                </SaveButton>
              )}
            </TabBar>
          )}
          <SectionContent $collapsed={editorCollapsed}>
            <EditorContainer ref={editorRef} />
          </SectionContent>
        </EditorSection>

        <SectionHeader
          onClick={toggleOutput}
          $sideways={outputCollapsed && editorCollapsed ? false : true}
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
            <ToggleBtn>{outputCollapsed ? "▶" : "▼"}</ToggleBtn>
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
          <ToggleBtn>{executionCollapsed ? "▶" : "▼"}</ToggleBtn>
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
            executor={executor}
            logLevel={logLevel}
            onLogLevelChange={handleLogLevelChange}
          />
        </SectionContent>
      </ExecutionSection>
    </Container>
  );
};

