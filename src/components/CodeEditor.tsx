/**
 * CodeEditor Component - CodeMirror Implementation
 *
 * Interactive code editor component using CodeMirror 6 with Langium LSP integration.
 * This replaces the previous Monaco-based implementation with a lighter, more performant
 * CodeMirror-based editor that shares Langium services across all instances.
 *
 * Features:
 * - Shared Langium services for reduced memory footprint
 * - LSP diagnostics, completions, and semantic highlighting
 * - Cross-file imports when filename is provided
 * - Multiple display modes (code-only, visual-only, split, toggle)
 * - Mobile-optimized touch interactions
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { EditorState } from '@codemirror/state';
import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLineGutter,
    highlightSpecialChars,
    drawSelection,
    highlightActiveLine,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
    autocompletion,
    completionKeymap,
    closeBrackets,
} from '@codemirror/autocomplete';
import {
    foldGutter,
    indentOnInput,
    syntaxHighlighting,
    defaultHighlightStyle,
    bracketMatching,
    foldKeymap,
} from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { createLangiumExtensions } from '../codemirror-langium';
import { getSharedServices, registerFile, unregisterFile, updateFile } from '../shared-services';
import { base64UrlEncode } from '../utils/url-encoding';
import { Machine } from '../language/generated/ast';
import { parseHelper } from 'langium/test';
import { generateGraphviz } from '../language/generator/generator';
import { render as renderGraphviz } from '../language/diagram-controls';
import styled from 'styled-components';

export type DisplayMode = 'code-only' | 'visual-only' | 'split' | 'toggle';
export type ThemeMode = 'light' | 'dark' | 'auto';

export interface CodeEditorProps {
    // Content
    initialCode: string;
    filename?: string;

    // Features
    enableImports?: boolean;
    readOnly?: boolean;

    // Display modes
    mode?: DisplayMode;
    defaultView?: 'code' | 'visual'; // For toggle mode

    // Editor settings
    height?: string;
    theme?: ThemeMode;
    showLineNumbers?: boolean;

    // Output configuration
    showOutput?: boolean;

    // Advanced
    onCodeChange?: (code: string) => void;

    // Legacy props for backwards compatibility
    language?: string;
    id?: string;
}

const Output = styled.div<{ $fitToView?: boolean }>`
    min-width: 300px;
    border-radius: 0.3em;
    box-shadow: 0 0 1em black;
    position: relative;

    & > svg {
        width: ${props => props.$fitToView ? '100%' : 'auto'} !important;
        height: ${props => props.$fitToView ? 'auto' : 'auto'} !important;
        max-height: ${props => props.$fitToView ? 'none' : '500px'};
    }
`;

const OverlayButton = styled.button<{ $success?: boolean }>`
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 6px 12px;
    background: ${props => props.$success ? '#10b981' : 'rgba(0, 0, 0, 0.6)'};
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    z-index: 10;
    transition: all 0.2s;

    &:hover {
        background: ${props => props.$success ? '#10b981' : 'rgba(0, 0, 0, 0.8)'};
    }

    &:active {
        transform: scale(0.95);
    }
`;

const OverlayButtonGroup = styled.div`
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 8px;
    z-index: 10;
`;

const Wrapper = styled.div`
    padding: 0.6em;
    background-color: #282c34;
    border-radius: 0.6em;
`

const CodeEditorWrapper = styled.div`
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    position: relative;
`

/**
 * CodeEditor Component
 *
 * Embedded code editor with visualization support using CodeMirror 6.
 * Shares Langium services across all instances for optimal performance.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
    initialCode,
    filename,
    enableImports = false,
    readOnly = false,
    mode = 'code-only',
    defaultView = 'code',
    height,
    theme = 'dark',
    showLineNumbers = true,
    showOutput = true,
    onCodeChange,
    language = 'machine',
    id,
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const editorViewRef = useRef<EditorView | null>(null);
    const [currentView, setCurrentView] = useState<'code' | 'visual'>(defaultView);
    const [outputSvg, setOutputSvg] = useState<string>('');
    const [fitToView, setFitToView] = useState<boolean>(true);
    const [copyCodeSuccess, setCopyCodeSuccess] = useState<boolean>(false);
    const [copyVisualSuccess, setCopyVisualSuccess] = useState<boolean>(false);

    // Generate playground link using shared encoding utility
    const playgroundLink = useMemo(() => {
        const basePath = import.meta.env.BASE_URL || '/';
        const playgroundUrl = `${basePath}playground-mobile.html`;
        const encoded = base64UrlEncode(initialCode);
        return `${playgroundUrl}#content=${encoded}`;
    }, [initialCode]);

    // Register file in shared VFS if filename provided and imports enabled
    useEffect(() => {
        if (filename && enableImports) {
            registerFile(filename, initialCode);

            return () => {
                // Cleanup: unregister file when component unmounts
                unregisterFile(filename);
            };
        }
    }, [filename, enableImports, initialCode]);

    // Initialize CodeMirror editor
    useEffect(() => {
        if (!editorRef.current) return;

        // Skip if already initialized
        if (editorViewRef.current) return;

        const extensions = [
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
                // ...closeBracketsKeymap,
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
                    height: height || 'auto',
                },
                '.cm-scroller': {
                    fontFamily: 'Monaco, Courier New, monospace',
                    overflow: 'auto',
                },
                '.cm-gutters': {
                    fontSize: '13px',
                },
            }),
            // Langium LSP integration
            ...createLangiumExtensions(),
            // Read-only mode
            EditorView.editable.of(!readOnly),
        ];

        const startState = EditorState.create({
            doc: initialCode,
            extensions,
        });

        const view = new EditorView({
            state: startState,
            parent: editorRef.current,
            dispatch: (transaction) => {
                view.update([transaction]);

                // Handle document changes
                if (transaction.docChanged) {
                    const code = view.state.doc.toString();

                    // Update file in VFS if registered
                    if (filename && enableImports) {
                        updateFile(filename, code);
                    }

                    // Call user callback
                    if (onCodeChange) {
                        onCodeChange(code);
                    }

                    // Update visualization
                    if (showOutput) {
                        scheduleUpdateVisualization(code);
                    }
                }
            },
        });

        editorViewRef.current = view;

        // Initial visualization
        if (showOutput) {
            scheduleUpdateVisualization(initialCode);
        }

        return () => {
            view.destroy();
            editorViewRef.current = null;
        };
    }, []);

    // Update visualization with debouncing
    const updateTimeout = useRef<number | null>(null);
    const scheduleUpdateVisualization = (code: string) => {
        if (updateTimeout.current !== null) {
            clearTimeout(updateTimeout.current);
        }

        updateTimeout.current = window.setTimeout(async () => {
            await updateVisualization(code);
        }, 500);
    };

    // Generate and render visualization
    const updateVisualization = async (code: string) => {
        if (!outputRef.current) return;

        try {
            // Get shared services
            const services = getSharedServices();
            const parse = parseHelper<Machine>(services);

            // Parse the code
            const document = await parse(code);

            // Check for errors
            if (document.parseResult.parserErrors.length > 0) {
                console.warn('Parse errors:', document.parseResult.parserErrors);
                return;
            }

            const model = document.parseResult.value as Machine;
            if (!model) {
                console.warn('No machine model parsed');
                return;
            }

            // Generate Graphviz DOT
            const graphvizResult = generateGraphviz(model, filename || 'code-editor.machine', undefined);
            const dotCode = graphvizResult.content;

            // Render to temporary div
            const tempDiv = window.document.createElement('div');
            await renderGraphviz(dotCode, tempDiv, `editor-${Date.now()}`);

            // Update output
            setOutputSvg(tempDiv.innerHTML);
        } catch (error) {
            console.error('Error generating visualization:', error);
        }
    };

    // Copy code to clipboard
    const copyCodeToClipboard = async () => {
        if (!editorViewRef.current) return;

        const code = editorViewRef.current.state.doc.toString();
        try {
            await navigator.clipboard.writeText(code);
            setCopyCodeSuccess(true);
            setTimeout(() => setCopyCodeSuccess(false), 2000);
        } catch (error) {
            console.error('Failed to copy code:', error);
        }
    };

    // Copy SVG to clipboard as PNG data URL
    const copySvgToClipboard = async () => {
        if (!outputRef.current) return;

        try {
            const svgElement = outputRef.current.querySelector('svg');
            if (!svgElement) return;

            // Serialize SVG to string
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });

            // Create canvas to convert to PNG
            const img = new Image();
            const url = URL.createObjectURL(svgBlob);

            img.onload = async () => {
                const canvas = document.createElement('canvas');
                const bbox = svgElement.getBBox();
                canvas.width = bbox.width || svgElement.clientWidth;
                canvas.height = bbox.height || svgElement.clientHeight;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);

                    try {
                        // Convert to blob and copy to clipboard
                        canvas.toBlob(async (blob) => {
                            if (blob) {
                                await navigator.clipboard.write([
                                    new ClipboardItem({ 'image/png': blob })
                                ]);
                                setCopyVisualSuccess(true);
                                setTimeout(() => setCopyVisualSuccess(false), 2000);
                            }
                        }, 'image/png');
                    } catch (error) {
                        console.error('Failed to copy image:', error);
                    }
                }

                URL.revokeObjectURL(url);
            };

            img.src = url;
        } catch (error) {
            console.error('Failed to copy SVG:', error);
        }
    };

    // Render based on mode
    const renderContent = () => {
        switch (mode) {
            case 'code-only':
                return (
                    <Wrapper style={{ display: 'flex', flexDirection: 'column'}}>
                        <CodeEditorWrapper
                            ref={editorRef}
                            className="code-editor-container"
                            style={{
                                maxHeight: height || '500px',
                                overflowY: 'auto'
                            }}
                        >
                            <OverlayButton
                                onClick={copyCodeToClipboard}
                                $success={copyCodeSuccess}
                                title="Copy code to clipboard"
                            >
                                {copyCodeSuccess ? '✓ Copied!' : '📋 Copy'}
                            </OverlayButton>
                        </CodeEditorWrapper>
                        {showOutput && outputSvg && (
                            <Output
                                ref={outputRef}
                                className="output"
                                $fitToView={fitToView}
                            >
                                <div dangerouslySetInnerHTML={{ __html: outputSvg }} />
                                <OverlayButtonGroup>
                                    <OverlayButton
                                        onClick={() => setFitToView(!fitToView)}
                                        title="Toggle fit to view"
                                    >
                                        {fitToView ? '🔍 Zoom' : '📐 Fit'}
                                    </OverlayButton>
                                    <OverlayButton
                                        onClick={copySvgToClipboard}
                                        $success={copyVisualSuccess}
                                        title="Copy diagram as image"
                                    >
                                        {copyVisualSuccess ? '✓ Copied!' : '📋 Copy'}
                                    </OverlayButton>
                                </OverlayButtonGroup>
                            </Output>
                        )}
                    </Wrapper>
                );

            case 'visual-only':
                return (
                    <Output
                        ref={outputRef}
                        className="output"
                        $fitToView={fitToView}
                    >
                        <div dangerouslySetInnerHTML={{ __html: outputSvg }} />
                        <OverlayButtonGroup>
                            <OverlayButton
                                onClick={() => setFitToView(!fitToView)}
                                title="Toggle fit to view"
                            >
                                {fitToView ? '🔍 Zoom' : '📐 Fit'}
                            </OverlayButton>
                            <OverlayButton
                                onClick={copySvgToClipboard}
                                $success={copyVisualSuccess}
                                title="Copy diagram as image"
                            >
                                {copyVisualSuccess ? '✓ Copied!' : '📋 Copy'}
                            </OverlayButton>
                        </OverlayButtonGroup>
                    </Output>
                );

            case 'split':
                return (
                    <Wrapper style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                        <CodeEditorWrapper
                            ref={editorRef}
                            className="code-editor-container"
                            style={{
                                flex: '1 1 45%',
                                minWidth: '300px',
                                maxHeight: height || '500px',
                                overflowY: 'auto'
                            }}
                        >
                            <OverlayButton
                                onClick={copyCodeToClipboard}
                                $success={copyCodeSuccess}
                                title="Copy code to clipboard"
                            >
                                {copyCodeSuccess ? '✓ Copied!' : '📋 Copy'}
                            </OverlayButton>
                        </CodeEditorWrapper>
                        {showOutput && (
                            <Output
                                ref={outputRef}
                                className="output"
                                $fitToView={fitToView}
                                style={{ flex: '1 1 45%' }}
                            >
                                <div dangerouslySetInnerHTML={{ __html: outputSvg }} />
                                <OverlayButtonGroup>
                                    <OverlayButton
                                        onClick={() => setFitToView(!fitToView)}
                                        title="Toggle fit to view"
                                    >
                                        {fitToView ? '🔍 Zoom' : '📐 Fit'}
                                    </OverlayButton>
                                    <OverlayButton
                                        onClick={copySvgToClipboard}
                                        $success={copyVisualSuccess}
                                        title="Copy diagram as image"
                                    >
                                        {copyVisualSuccess ? '✓ Copied!' : '📋 Copy'}
                                    </OverlayButton>
                                </OverlayButtonGroup>
                            </Output>
                        )}
                    </Wrapper>
                );

            case 'toggle':
                return (
                    <Wrapper style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <button
                                onClick={() => setCurrentView('code')}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currentView === 'code' ? '#667eea' : '#374151',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.25rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Code
                            </button>
                            <button
                                onClick={() => setCurrentView('visual')}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currentView === 'visual' ? '#667eea' : '#374151',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.25rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Visual
                            </button>
                        </div>
                        {currentView === 'code' ? (
                            <CodeEditorWrapper
                                ref={editorRef}
                                className="code-editor-container"
                                style={{
                                    maxHeight: height || '500px',
                                    overflowY: 'auto'
                                }}
                            >
                                <OverlayButton
                                    onClick={copyCodeToClipboard}
                                    $success={copyCodeSuccess}
                                    title="Copy code to clipboard"
                                >
                                    {copyCodeSuccess ? '✓ Copied!' : '📋 Copy'}
                                </OverlayButton>
                            </CodeEditorWrapper>
                        ) : (
                            <Output
                                ref={outputRef}
                                className="output"
                                $fitToView={fitToView}
                            >
                                <div dangerouslySetInnerHTML={{ __html: outputSvg }} />
                                <OverlayButtonGroup>
                                    <OverlayButton
                                        onClick={() => setFitToView(!fitToView)}
                                        title="Toggle fit to view"
                                    >
                                        {fitToView ? '🔍 Zoom' : '📐 Fit'}
                                    </OverlayButton>
                                    <OverlayButton
                                        onClick={copySvgToClipboard}
                                        $success={copyVisualSuccess}
                                        title="Copy diagram as image"
                                    >
                                        {copyVisualSuccess ? '✓ Copied!' : '📋 Copy'}
                                    </OverlayButton>
                                </OverlayButtonGroup>
                            </Output>
                        )}
                    </Wrapper>
                );
        }
    };

    return (
        <div className="code-block" style={{ marginTop: '1rem', position: 'relative' }}>
            {renderContent()}
            <div
                style={{
                    marginTop: '0.5rem',
                    fontSize: '0.85rem',
                    opacity: 0.7,
                    textAlign: 'right',
                }}
            >
                <a
                    href={playgroundLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: '#667eea',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                    🎮 Open in Playground →
                </a>
            </div>
        </div>
    );
};
