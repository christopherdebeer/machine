import React, { useEffect, useState } from 'react';
import { CodeEditor } from './CodeEditor';

interface ExampleLoaderProps {
    path: string;
    language?: string;
    readOnly?: boolean;
    height?: string;
    id?: string;
}

/**
 * ExampleLoader dynamically loads example files from the examples directory
 * and renders them using the CodeEditor component.
 *
 * This allows MDX files to reference example files directly, maintaining a
 * single source of truth for example code.
 *
 * @example
 * ```mdx
 * import { ExampleLoader } from '../components/ExampleLoader';
 *
 * <ExampleLoader
 *   path="examples/advanced/annotations.dygram"
 *   height="200px"
 * />
 * ```
 */
export const ExampleLoader: React.FC<ExampleLoaderProps> = ({
    path,
    language = 'dygram',
    readOnly = false,
    height = '200px',
    id
}) => {
    const [code, setCode] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadExample = async () => {
            setLoading(true);
            setError(null);

            try {
                // Add base path for the vite build
                const basePath = import.meta.env.BASE_URL || '/';
                const fullPath = path.startsWith('/') ? path : `${basePath}${path}`;

                const response = await fetch(fullPath);

                if (!response.ok) {
                    throw new Error(`Failed to load example: ${response.status} ${response.statusText}`);
                }

                const content = await response.text();
                setCode(content);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                setError(errorMessage);
                console.error(`Error loading example from ${path}:`, err);
            } finally {
                setLoading(false);
            }
        };

        loadExample();
    }, [path]);

    if (loading) {
        return (
            <div className="example-loader loading" style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                <p style={{ margin: 0, color: '#666' }}>Loading example...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="example-loader error" style={{ padding: '1rem', backgroundColor: '#fee', borderRadius: '4px', border: '1px solid #fcc' }}>
                <p style={{ margin: 0, color: '#c00' }}>
                    <strong>Error loading example:</strong> {error}
                </p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#666' }}>
                    Path: {path}
                </p>
            </div>
        );
    }

    return (
        <CodeEditor
            initialCode={code}
            language={language}
            readOnly={readOnly}
            height={height}
            id={id}
        />
    );
};
