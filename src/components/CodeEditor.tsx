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

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
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
import { createLangiumExtensions } from '../codemirror-langium.js'
import { getSharedServices, registerFile, unregisterFile, updateFile } from '../shared-services.js'
import { base64UrlEncode } from '../utils/url-encoding.js'
import { Machine } from '../language/generated/ast.js'
import { parseHelper } from 'langium/test';
import { generateGraphvizFromJSON } from '../language/diagram/index.js'
import { serializeMachineToJSON } from '../language/json/serializer.js'
import { render as renderGraphviz } from '../language/diagram-controls.js'
import styled from 'styled-components';

// CodeMirror highlighting effect for SVG → Editor navigation
const setHighlightEffect = StateEffect.define<{from: number; to: number} | null>();

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
            attributes: { style: "background-color: rgba(14, 99, 156, 0.2); border-bottom: 2px solid rgba(14, 99, 156, 0.8);" }
          });
          highlights = Decoration.set([mark.range(effect.value.from, effect.value.to)]);
        }
      }
    }
    return highlights;
  },
  provide: f => EditorView.decorations.from(f)
});

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
    border-radius: 0.3em;
    box-shadow: 0 0 1em black;
    overflow: auto;
    align-items: center;
    max-height: 500px;
    display: block;
`;

const OverlayButton = styled.button<{ $success?: boolean }>`
    position: absolute;
    top: 0.3em;
    right: 0.3em;
    padding: 0.2em;
    background: ${props => props.$success ? '#10b981' : 'rgba(0, 0, 0, 0.6)'};
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
        background: ${props => props.$success ? '#10b981' : 'rgba(0, 0, 0, 0.8)'};
        opacity: 1;
    }

    &:active {
        transform: scale(0.95);
    }
`;

const OverlayButtonGroup = styled.div`
    position: sticky;
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

const Wrapper = styled.div`
    padding: 0.6em;
    background-color: #282c34;
    border-radius: 0.6em;
`

const CodeEditorWrapper = styled.div`
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    position: relative;
    padding-bottom: 0.6em;
    min-width: 200px;
    max-height: 80vh;
`

const SVGWrapper = styled.div<{ $fitToView?: boolean }>`
    height: 100%;
    width: 100%;

    display: ${props => props.$fitToView ? 'flex' : 'display'};
    align-items: center;

    & > svg {
        width: ${props => props.$fitToView ? 'auto' : 'revert-layer'} !important;
        height: ${props => props.$fitToView ? 'auto' : 'revert-layer'} !important;
        max-height: ${props => props.$fitToView ? '100%' : 'none'};
        max-width: ${props => props.$fitToView ? '100%' : 'none'};
        margin: auto;
        display: block;
    }
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
    const currentHighlightedElements = useRef<SVGElement[]>([]);
    const [currentView, setCurrentView] = useState<'code' | 'visual'>(defaultView);
    const [outputSvg, setOutputSvg] = useState<string>('');
    const [fitToView, setFitToView] = useState<boolean>(true);
    const [copyCodeSuccess, setCopyCodeSuccess] = useState<boolean>(false);
    const [copyVisualSuccess, setCopyVisualSuccess] = useState<boolean>(false);

    // Helper: Clear all SVG highlighting
    const clearSVGHighlighting = useCallback(() => {
        currentHighlightedElements.current.forEach(element => {
            element.style.filter = '';
            element.style.opacity = '';
        });
        currentHighlightedElements.current = [];
    }, []);

    // Helper: Highlight SVG elements by source position
    const highlightSVGElementsAtPosition = useCallback((line: number, character: number) => {
        clearSVGHighlighting();

        if (!outputRef.current) return;

        // Find all SVG elements with position data (in xlink:href or href)
        const elements = outputRef.current.querySelectorAll('[href^="#L"], [*|href^="#L"]');

        elements.forEach(element => {
            // Parse position from href attribute: #L{startLine}:{startChar}-{endLine}:{endChar}
            const svgElement = element as SVGElement;
            const href = svgElement.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                        svgElement.getAttribute('href');

            if (!href || !href.startsWith('#L')) return;

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
                svgElement.style.filter = 'drop-shadow(0 0 8px rgba(14, 99, 156, 0.8))';
                svgElement.style.opacity = '1';
                currentHighlightedElements.current.push(svgElement);
            }
        });
    }, [clearSVGHighlighting]);

    // Handle SVG element click - highlight source location without changing cursor
    const handleSourceLocationClick = useCallback((location: { lineStart: number; charStart: number; lineEnd: number; charEnd: number }) => {
        if (!editorViewRef.current) return;

        const view = editorViewRef.current;
        const doc = view.state.doc;

        // Convert line/char to offset
        const startOffset = doc.line(location.lineStart + 1).from + location.charStart;
        const endOffset = doc.line(location.lineEnd + 1).from + location.charEnd;

        // Highlight the range without changing selection
        view.dispatch({
            effects: setHighlightEffect.of({ from: startOffset, to: endOffset }),
            scrollIntoView: true
        });

        // Scroll to the highlighted range
        view.dispatch({
            effects: EditorView.scrollIntoView(startOffset, { y: "center" })
        });
    }, []);

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
            highlightField,
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

                // Update SVG highlighting on selection/cursor changes
                if (transaction.selectionSet) {
                    const pos = transaction.state.selection.main.head;
                    const line = transaction.state.doc.lineAt(pos);
                    const character = pos - line.from;

                    // Clear any SVG→Editor highlight when user moves cursor
                    const hasHighlightEffect = transaction.effects.some(e => e.is(setHighlightEffect));
                    if (!hasHighlightEffect) {
                        view.dispatch({
                            effects: setHighlightEffect.of(null)
                        });
                    }

                    // Highlight SVG elements at cursor position
                    highlightSVGElementsAtPosition(line.number - 1, character);
                }

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

            // Convert Machine AST to JSON and generate Graphviz DOT
            const machineJson = serializeMachineToJSON(model);
            const dotCode = generateGraphvizFromJSON(machineJson);

            // Render to temporary div
            const tempDiv = window.document.createElement('div');
            await renderGraphviz(dotCode, tempDiv, `editor-${Date.now()}`);

            // Update output
            setOutputSvg(tempDiv.innerHTML);
        } catch (error) {
            console.error('Error generating visualization:', error);
        }
    };

    // Setup SVG interaction for bidirectional highlighting
    useEffect(() => {
        if (!outputRef.current || !outputSvg) {
            return;
        }

        const handleElementClick = (event: Event) => {
            const target = event.target as SVGElement;

            // Find the closest element with source position data (in xlink:href or href)
            let element: SVGElement | null = target;
            while (element && element !== outputRef.current) {
                // Check for URL attribute (rendered as xlink:href in SVG)
                const href = element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                           element.getAttribute('href');

                if (href && href.startsWith('#L')) {
                    // Parse format: #L{startLine}:{startChar}-{endLine}:{endChar}
                    const match = href.match(/^#L(\d+):(\d+)-(\d+):(\d+)$/);
                    if (match) {
                        handleSourceLocationClick({
                            lineStart: parseInt(match[1], 10),
                            charStart: parseInt(match[2], 10),
                            lineEnd: parseInt(match[3], 10),
                            charEnd: parseInt(match[4], 10)
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                }

                element = element.parentElement as SVGElement | null;
            }
        };

        const svgContainer = outputRef.current;

        // Get all interactive SVG elements (nodes and edges with position data)
        const elements = svgContainer.querySelectorAll('[href^="#L"], [*|href^="#L"]');

        elements.forEach(element => {
            // Desktop: click
            element.addEventListener('click', handleElementClick);

            // Mobile: touch (iOS specific handling)
            element.addEventListener('touchend', handleElementClick, { passive: false });

            // Make elements visually interactive
            (element as HTMLElement).style.cursor = 'pointer';
        });

        // Cleanup
        return () => {
            elements.forEach(element => {
                element.removeEventListener('click', handleElementClick);
                element.removeEventListener('touchend', handleElementClick);
                (element as HTMLElement).style.cursor = '';
            });
        };
    }, [outputSvg, handleSourceLocationClick]);

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
                        ><OverlayButtonGroup>
                            <OverlayButton
                                onClick={copyCodeToClipboard}
                                $success={copyCodeSuccess}
                                title="Copy code to clipboard"
                            >
                                {copyCodeSuccess ? '✓ Copied!' : 'Copy'}
                            </OverlayButton>
                            </OverlayButtonGroup>
                        </CodeEditorWrapper>
                        {showOutput && outputSvg && (
                            <Output
                                ref={outputRef}
                                className="output"
                                $fitToView={fitToView}
                            >
                                
                                <OverlayButtonGroup>
                                    <OverlayButton
                                        onClick={() => setFitToView(!fitToView)}
                                        title="Toggle fit to view"
                                    >
                                        {fitToView ? 'Zoom' : 'Fit'}
                                    </OverlayButton>
                                    <OverlayButton
                                        onClick={copySvgToClipboard}
                                        $success={copyVisualSuccess}
                                        title="Copy diagram as image"
                                    >
                                        {copyVisualSuccess ? '✓ Copied!' : 'Copy'}
                                    </OverlayButton>
                                </OverlayButtonGroup>
                                <SVGWrapper $fitToView={fitToView} dangerouslySetInnerHTML={{ __html: outputSvg }} />
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
                        
                        <OverlayButtonGroup>
                            <OverlayButton
                                onClick={() => setFitToView(!fitToView)}
                                title="Toggle fit to view"
                            >
                                {fitToView ? 'Zoom' : 'Fit'}
                            </OverlayButton>
                            <OverlayButton
                                onClick={copySvgToClipboard}
                                $success={copyVisualSuccess}
                                title="Copy diagram as image"
                            >
                                {copyVisualSuccess ? '✓ Copied!' : 'Copy'}
                            </OverlayButton>
                        </OverlayButtonGroup>
                        <SVGWrapper $fitToView={fitToView} dangerouslySetInnerHTML={{ __html: outputSvg }} />
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
                                maxHeight: height,
                                overflowY: 'auto'
                            }}
                        >
                            <OverlayButtonGroup>
                            <OverlayButton
                                onClick={copyCodeToClipboard}
                                $success={copyCodeSuccess}
                                title="Copy code to clipboard"
                            >
                                {copyCodeSuccess ? '✓ Copied!' : 'Copy'}
                            </OverlayButton>
                            </OverlayButtonGroup>
                        </CodeEditorWrapper>
                        {showOutput && (
                            <Output
                                ref={outputRef}
                                className="output"
                                $fitToView={fitToView}
                                style={{ flex: '1 1 45%' }}
                            >
                                
                                <OverlayButtonGroup>
                                    <OverlayButton
                                        onClick={() => setFitToView(!fitToView)}
                                        title="Toggle fit to view"
                                    >
                                        {fitToView ? 'Zoom' : 'Fit'}
                                    </OverlayButton>
                                    <OverlayButton
                                        onClick={copySvgToClipboard}
                                        $success={copyVisualSuccess}
                                        title="Copy diagram as image"
                                    >
                                        {copyVisualSuccess ? '✓ Copied!' : 'Copy'}
                                    </OverlayButton>
                                </OverlayButtonGroup>
                                <SVGWrapper $fitToView={fitToView} dangerouslySetInnerHTML={{ __html: outputSvg }} />
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
                                <OverlayButtonGroup>
                                <OverlayButton
                                    onClick={copyCodeToClipboard}
                                    $success={copyCodeSuccess}
                                    title="Copy code to clipboard"
                                >
                                    {copyCodeSuccess ? '✓ Copied!' : 'Copy'}
                                </OverlayButton>
                                </OverlayButtonGroup>
                            </CodeEditorWrapper>
                        ) : (
                            <Output
                                ref={outputRef}
                                className="output"
                                $fitToView={fitToView}
                            >
                                <OverlayButtonGroup>
                                    <OverlayButton
                                        onClick={() => setFitToView(!fitToView)}
                                        title="Toggle fit to view"
                                    >
                                        {fitToView ? 'Zoom' : 'Fit'}
                                    </OverlayButton>
                                    <OverlayButton
                                        onClick={copySvgToClipboard}
                                        $success={copyVisualSuccess}
                                        title="Copy diagram as image"
                                    >
                                        {copyVisualSuccess ? '✓ Copied!' : 'Copy'}
                                    </OverlayButton>
                                </OverlayButtonGroup>
                                <SVGWrapper $fitToView={fitToView} dangerouslySetInnerHTML={{ __html: outputSvg }} />
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
