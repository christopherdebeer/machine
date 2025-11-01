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
    closeBracketsKeymap,
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
                    height: height || '300px',
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
            const parse = parseHelper<Machine>(services.Machine);

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

    // Render based on mode
    const renderContent = () => {
        switch (mode) {
            case 'code-only':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div
                            ref={editorRef}
                            className="code-editor-container"
                            style={{ minHeight: height || '300px' }}
                        />
                        {showOutput && outputSvg && (
                            <div ref={outputRef} className="output" dangerouslySetInnerHTML={{ __html: outputSvg }} />
                        )}
                    </div>
                );

            case 'visual-only':
                return (
                    <div ref={outputRef} className="output" dangerouslySetInnerHTML={{ __html: outputSvg }} />
                );

            case 'split':
                return (
                    <div style={{ display: 'flex', gap: '1rem', flexDirection: 'row', flexWrap: 'wrap' }}>
                        <div
                            ref={editorRef}
                            className="code-editor-container"
                            style={{ flex: '1 1 45%', minWidth: '300px', minHeight: height || '300px' }}
                        />
                        {showOutput && (
                            <div
                                ref={outputRef}
                                className="output"
                                style={{ flex: '1 1 45%', minWidth: '300px' }}
                                dangerouslySetInnerHTML={{ __html: outputSvg }}
                            />
                        )}
                    </div>
                );

            case 'toggle':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                            <div
                                ref={editorRef}
                                className="code-editor-container"
                                style={{ minHeight: height || '300px' }}
                            />
                        ) : (
                            <div ref={outputRef} className="output" dangerouslySetInnerHTML={{ __html: outputSvg }} />
                        )}
                    </div>
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
