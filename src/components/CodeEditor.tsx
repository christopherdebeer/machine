import React, { useEffect, useRef, useState } from 'react';
import type { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';

type ViewMode = 'source' | 'diagram' | 'both';

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
    const [isLandscape, setIsLandscape] = useState<boolean>(false);

    // Responsive layout detection - landscape vs portrait
    useEffect(() => {
        const handleResize = () => {
            const isLandscapeOrientation = window.innerWidth > window.innerHeight;
            setIsLandscape(isLandscapeOrientation);
        };

        handleResize();
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

    // Cycle through view modes
    const cycleViewMode = () => {
        setViewMode(current => {
            if (current === 'both') return 'source';
            if (current === 'source') return 'diagram';
            return 'both';
        });
    };

    // Get icon and label for current view mode
    const getViewModeDisplay = () => {
        switch (viewMode) {
            case 'source': return { icon: '⌨', label: 'Source' };
            case 'diagram': return { icon: '◊', label: 'Diagram' };
            case 'both': return { icon: '⊞', label: 'Both' };
        }
    };

    const { icon, label } = getViewModeDisplay();

    // Overlay button style
    const overlayButtonStyle: React.CSSProperties = {
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid rgba(0, 0, 0, 0.15)',
        padding: '0.35rem 0.6rem',
        fontSize: '0.7rem',
        cursor: 'pointer',
        borderRadius: '4px',
        color: '#555',
        transition: 'all 0.2s ease',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(4px)'
    };

    const containerStyle: React.CSSProperties = {
        marginTop: '1rem',
        position: 'relative'
    };

    // Use landscape orientation for side-by-side layout
    const useHorizontalLayout = isLandscape && viewMode === 'both';

    const contentWrapperStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: useHorizontalLayout ? 'row' : 'column',
        gap: '1rem',
        width: '100%'
    };

    const editorStyle: React.CSSProperties = {
        display: viewMode === 'diagram' ? 'none' : 'block',
        flex: useHorizontalLayout ? '1' : 'none',
        minWidth: useHorizontalLayout ? '0' : 'auto',
        height: height
    };

    const outputStyle: React.CSSProperties = {
        display: viewMode === 'source' ? 'none' : 'flex',
        justifyContent: 'center',
        flex: useHorizontalLayout ? '1' : 'none',
        minWidth: useHorizontalLayout ? '0' : 'auto'
    };

    return (
        <div className="code-block" style={containerStyle}>
            {/* Single overlay toggle button */}
            <button
                onClick={cycleViewMode}
                style={overlayButtonStyle}
                title={`Currently showing: ${label}. Click to cycle views.`}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.25)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.15)';
                }}
            >
                <span style={{ fontSize: '0.9rem' }}>{icon}</span>
                <span>{label}</span>
            </button>

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
