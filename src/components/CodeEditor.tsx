import React, { useEffect, useRef, useMemo } from 'react';
import type { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';
import { base64UrlEncode } from '../utils/url-encoding';

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

    // Generate playground link using shared encoding utility
    const playgroundLink = useMemo(() => {
        const basePath = import.meta.env.BASE_URL || '/';
        const playgroundUrl = `${basePath}playground-mobile.html`;
        const encoded = base64UrlEncode(initialCode);
        return `${playgroundUrl}#content=${encoded}`;
    }, [initialCode]);

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

    return (
        <div className="code-block" style={{ marginTop: '1rem', position: 'relative' }}>
            <div
                ref={codeRef}
                className="code machine-lang"
                id={id}
                data-language={language}
                style={{ height: height }}
            >
                {initialCode}
            </div>
            <div ref={outputRef} className="output"></div>
            <div style={{
                marginTop: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.7,
                textAlign: 'right'
            }}>
                <a
                    href={playgroundLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: '#667eea',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                    🎮 Open in Playground →
                </a>
            </div>
        </div>
    );
};
