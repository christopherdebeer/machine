import React, { useEffect, useRef } from 'react';

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

    useEffect(() => {
        // Setup Monaco and execute the code after component mounts
        const setupEditor = async () => {
            if (codeRef.current && outputRef.current) {
                // Import the setup functions
                const { configureMonacoWorkers } = await import('../setupCommon');
                const { executeExtended } = await import('../setupExtended');

                await configureMonacoWorkers();
                executeExtended(codeRef.current, false, outputRef.current);
            }
        };

        setupEditor();
    }, [initialCode]);

    return (
        <div className="code-block" style={{ marginTop: '1rem' }}>
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
        </div>
    );
};
