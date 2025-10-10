import React from 'react';

interface CodeEditorProps {
    initialCode: string;
    language?: string;
    readOnly?: boolean;
    height?: string;
}

/**
 * Interactive code editor component for documentation
 * This is a placeholder that can be enhanced with Monaco or CodeMirror
 * integration in the future.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
    initialCode,
    language = 'dygram',
    readOnly = false,
    height = '300px'
}) => {
    const [code, setCode] = React.useState(initialCode);

    return (
        <div className="code-editor-wrapper" style={{ marginBottom: '1.5rem' }}>
            <div className="code-editor-header">
                <span className="language-badge">{language}</span>
                {!readOnly && (
                    <button
                        onClick={() => {
                            // Placeholder for "Run" functionality
                            console.log('Code:', code);
                            alert('Code execution would happen here. Integration with DyGram runtime coming soon!');
                        }}
                        className="run-button"
                    >
                        Run
                    </button>
                )}
            </div>
            <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                readOnly={readOnly}
                style={{
                    width: '100%',
                    height,
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    padding: '1rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: readOnly ? '#f5f5f5' : '#fff',
                    resize: 'vertical'
                }}
            />
        </div>
    );
};
