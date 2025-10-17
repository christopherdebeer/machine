import React, { useEffect, useRef, useState } from 'react';
import type { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';

interface CodeEditorProps {
    initialCode: string;
    language?: string;
    readOnly?: boolean;
    height?: string;
    id?: string;
    filename?: string;
}

type ViewMode = 'source' | 'diagram' | 'both';
type LayoutMode = 'vertical' | 'horizontal';

/**
 * Interactive code editor component that integrates with Monaco and executeExtended
 * This creates a div that will be processed by setupExtended.ts just like the original HTML
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
    initialCode,
    language = 'machine',
    readOnly = false,
    height,
    id,
    filename = 'code.machine'
}) => {
    const codeRef = useRef<HTMLDivElement>(null);
    const outputRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<MonacoEditorLanguageClientWrapper | null>(null);
    const initializingRef = useRef<boolean>(false);

    // View and layout state
    const [viewMode, setViewMode] = useState<ViewMode>('both');
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('vertical');
    const [isDesktop, setIsDesktop] = useState<boolean>(window.innerWidth >= 768);

    // Handle responsive behavior
    useEffect(() => {
        const handleResize = () => {
            setIsDesktop(window.innerWidth >= 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    // Determine which views to show
    const showSource = viewMode === 'source' || viewMode === 'both';
    const showDiagram = viewMode === 'diagram' || viewMode === 'both';
    const showBothViews = viewMode === 'both';

    // Container layout
    const containerStyle: React.CSSProperties = {
        marginTop: '1rem',
        display: 'flex',
        flexDirection: showBothViews && isDesktop && layoutMode === 'horizontal' ? 'row' : 'column',
        gap: showBothViews ? '1rem' : '0'
    };

    // Styles for the superscript header
    const headerStyle: React.CSSProperties = {
        fontSize: '0.75rem',
        color: '#666',
        marginBottom: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap'
    };

    const linkStyle: React.CSSProperties = {
        cursor: 'pointer',
        textDecoration: 'none',
        color: '#666',
        padding: '0 0.25rem'
    };

    const activeLinkStyle: React.CSSProperties = {
        ...linkStyle,
        fontWeight: 'bold',
        color: '#000'
    };

    const separatorStyle: React.CSSProperties = {
        color: '#ccc'
    };

    return (
        <div style={{ marginTop: '1rem' }}>
            {/* Superscript header with filename and view controls */}
            <div style={headerStyle}>
                <span>{filename}</span>
                <span style={separatorStyle}>•</span>
                <span>View:</span>
                <a
                    style={viewMode === 'source' ? activeLinkStyle : linkStyle}
                    onClick={(e) => { e.preventDefault(); setViewMode('source'); }}
                    href="#"
                >
                    Source
                </a>
                <span style={separatorStyle}>|</span>
                <a
                    style={viewMode === 'diagram' ? activeLinkStyle : linkStyle}
                    onClick={(e) => { e.preventDefault(); setViewMode('diagram'); }}
                    href="#"
                >
                    Diagram
                </a>
                <span style={separatorStyle}>|</span>
                <a
                    style={viewMode === 'both' ? activeLinkStyle : linkStyle}
                    onClick={(e) => { e.preventDefault(); setViewMode('both'); }}
                    href="#"
                >
                    Both
                </a>
                {/* Layout toggle - only show when both views are visible and on desktop */}
                {showBothViews && isDesktop && (
                    <>
                        <span style={separatorStyle}>•</span>
                        <span>Layout:</span>
                        <a
                            style={layoutMode === 'vertical' ? activeLinkStyle : linkStyle}
                            onClick={(e) => { e.preventDefault(); setLayoutMode('vertical'); }}
                            href="#"
                        >
                            ↓ Vertical
                        </a>
                        <span style={separatorStyle}>|</span>
                        <a
                            style={layoutMode === 'horizontal' ? activeLinkStyle : linkStyle}
                            onClick={(e) => { e.preventDefault(); setLayoutMode('horizontal'); }}
                            href="#"
                        >
                            → Horizontal
                        </a>
                    </>
                )}
            </div>

            {/* Content container */}
            <div style={containerStyle}>
                {/* Source view */}
                {showSource && (
                    <div className="code-block" style={{ flex: showBothViews ? 1 : undefined }}>
                        <div
                            ref={codeRef}
                            className="code machine-lang"
                            id={id}
                            data-language={language}
                            style={{ height: height }}
                        >
                            {initialCode}
                        </div>
                    </div>
                )}

                {/* Diagram view */}
                {showDiagram && (
                    <div
                        ref={outputRef}
                        className="output"
                        style={{ flex: showBothViews ? 1 : undefined }}
                    ></div>
                )}
            </div>
        </div>
    );
};
