import React, { useEffect, useRef, useState } from 'react';
import type { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';

type ViewMode = 'source' | 'diagram' | 'both';
type LayoutMode = 'vertical' | 'horizontal';

interface CodeEditorProps {
    initialCode: string;
    language?: string;
    readOnly?: boolean;
    height?: string;
    id?: string;
}

/**
 * Interactive code editor component that integrates with Monaco and executeExtended
 * This creates a div that will be processed by setupExtended.ts just like the original HTML
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
    initialCode,
    language = 'machine',
    readOnly = false,
    height,
    id
}) => {
    const codeRef = useRef<HTMLDivElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<MonacoEditorLanguageClientWrapper | null>(null);
    const initializingRef = useRef<boolean>(false);

    // View control state
    const [viewMode, setViewMode] = useState<ViewMode>('both');
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('vertical');
    const [isCompact, setIsCompact] = useState<boolean>(false);

    // Responsive layout detection
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setIsCompact(width < 768);
            // Auto-switch to vertical on mobile
            if (width < 768 && layoutMode === 'horizontal') {
                setLayoutMode('vertical');
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [layoutMode]);

    useEffect(() => {
        let mounted = true;

        // Setup Monaco and execute the code after component mounts
        const setupEditor = async () => {
            if (!codeRef.current || !outputRef.current || !mounted) {
                return;
            }

            // Check if Monaco is already initialized in this DOM element
            // This prevents React StrictMode from creating duplicate editors
            if (codeRef.current.hasAttribute('data-monaco-initialized')) {
                console.log('Editor already initialized in this DOM element, skipping...');
                return;
            }

            // Prevent multiple simultaneous initializations
            if (initializingRef.current) {
                console.log('Editor initialization already in progress, skipping...');
                return;
            }

            try {
                initializingRef.current = true;
                
                // Mark DOM element as being initialized
                codeRef.current.setAttribute('data-monaco-initialized', 'true');
                
                // Import the setup functions
                const { configureMonacoWorkers } = await import('../setupCommon');
                const { executeExtended } = await import('../setupExtended');

                await configureMonacoWorkers();
                
                // Store the wrapper for cleanup
                wrapperRef.current = await executeExtended(codeRef.current, false, outputRef.current);
            } catch (error) {
                console.error('Failed to setup editor:', error);
                // Remove the marker if initialization failed
                if (codeRef.current) {
                    codeRef.current.removeAttribute('data-monaco-initialized');
                }
            } finally {
                initializingRef.current = false;
            }
        };

        setupEditor();

        // Cleanup function to dispose of Monaco editor when component unmounts
        return () => {
            mounted = false;
            if (wrapperRef.current) {
                try {
                    wrapperRef.current.dispose();
                    wrapperRef.current = null;
                } catch (error) {
                    console.error('Failed to dispose editor:', error);
                }
            }
            // Remove the initialization marker
            if (codeRef.current) {
                codeRef.current.removeAttribute('data-monaco-initialized');
            }
            // Reset initialization flag on cleanup
            initializingRef.current = false;
        };
    }, [initialCode]);

    // Button styles
    const buttonStyle: React.CSSProperties = {
        background: 'none',
        border: '1px solid rgba(0, 0, 0, 0.2)',
        padding: '0.25rem 0.5rem',
        fontSize: '0.75rem',
        cursor: 'pointer',
        borderRadius: '3px',
        color: '#666',
        transition: 'all 0.2s ease',
        fontFamily: 'inherit'
    };

    const activeButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        background: 'rgba(0, 0, 0, 0.1)',
        color: '#000',
        borderColor: 'rgba(0, 0, 0, 0.3)'
    };

    const containerStyle: React.CSSProperties = {
        marginTop: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
    };

    const controlsStyle: React.CSSProperties = {
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '0.5rem',
        background: 'rgba(0, 0, 0, 0.02)',
        borderRadius: '4px',
        fontSize: '0.75rem'
    };

    const contentWrapperStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: layoutMode === 'horizontal' && viewMode === 'both' ? 'row' : 'column',
        gap: '1rem',
        width: '100%'
    };

    const editorStyle: React.CSSProperties = {
        display: viewMode === 'diagram' ? 'none' : 'block',
        flex: layoutMode === 'horizontal' && viewMode === 'both' ? '1' : 'none',
        minWidth: layoutMode === 'horizontal' && viewMode === 'both' ? '0' : 'auto',
        height: height
    };

    const outputStyle: React.CSSProperties = {
        display: viewMode === 'source' ? 'none' : 'flex',
        justifyContent: 'center',
        flex: layoutMode === 'horizontal' && viewMode === 'both' ? '1' : 'none',
        minWidth: layoutMode === 'horizontal' && viewMode === 'both' ? '0' : 'auto'
    };

    return (
        <div className="code-block" style={containerStyle}>
            {/* View Controls */}
            <div style={controlsStyle}>
                <span style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.5rem' }}>View:</span>
                <button
                    onClick={() => setViewMode('source')}
                    style={viewMode === 'source' ? activeButtonStyle : buttonStyle}
                    title="Show source code only"
                >
                    Source
                </button>
                <button
                    onClick={() => setViewMode('diagram')}
                    style={viewMode === 'diagram' ? activeButtonStyle : buttonStyle}
                    title="Show diagram only"
                >
                    Diagram
                </button>
                <button
                    onClick={() => setViewMode('both')}
                    style={viewMode === 'both' ? activeButtonStyle : buttonStyle}
                    title="Show both source and diagram"
                >
                    Both
                </button>

                {/* Layout toggle - only show when both views are visible */}
                {viewMode === 'both' && !isCompact && (
                    <>
                        <span style={{
                            marginLeft: '1rem',
                            marginRight: '0.5rem',
                            color: '#999',
                            fontSize: '0.75rem'
                        }}>|</span>
                        <span style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.5rem' }}>Layout:</span>
                        <button
                            onClick={() => setLayoutMode('vertical')}
                            style={layoutMode === 'vertical' ? activeButtonStyle : buttonStyle}
                            title="Stack views vertically"
                        >
                            ↓ Vertical
                        </button>
                        <button
                            onClick={() => setLayoutMode('horizontal')}
                            style={layoutMode === 'horizontal' ? activeButtonStyle : buttonStyle}
                            title="Place views side by side"
                        >
                            → Horizontal
                        </button>
                    </>
                )}
            </div>

            {/* Content */}
            <div style={contentWrapperStyle}>
                <div
                    ref={codeRef}
                    className="code machine-lang"
                    id={id}
                    data-language={language}
                    style={editorStyle}
                >
                    {initialCode}
                </div>
                <div ref={outputRef} className="output" style={outputStyle}></div>
            </div>
        </div>
    );
};
