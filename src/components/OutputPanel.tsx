/**
 * Output Panel Component - React Implementation
 * 
 * Provides unified output format toggling for both Monaco and CodeMirror playgrounds
 * Supports: SVG diagram, DOT source, JSON, AST, CST
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { Machine } from '../language/generated/ast.js'

export type OutputFormat = 'svg' | 'png' | 'dot' | 'json' | 'ast' | 'cst' | 'src';

export interface OutputData {
    svg?: string;
    png?: string;
    dot?: string;
    json?: string;
    ast?: any;
    cst?: any;
    src?: string;
    machine?: Machine;
}

interface OutputPanelProps {
    defaultFormat?: OutputFormat;
    mobile?: boolean;
    onFormatChange?: (format: OutputFormat) => void;
    data?: OutputData;
    onSourceLocationClick?: (location: { lineStart: number; charStart: number; lineEnd: number; charEnd: number }) => void;
}

// Styled Components
const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
`;

const ToggleContainer = styled.div`
    display: flex;
    gap: 0.3em;
    padding: 0.3em 0.6em;;
    background: #2d2d30;
    border-bottom: 1px solid #3e3e42;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    flex-wrap: wrap;
`;

const ToggleButton = styled.button<{ $active: boolean }>`
    background: ${props => props.$active ? '#0e639c' : '#3e3e42'};
    color: ${props => props.$active ? '#ffffff' : '#d4d4d4'};
    border: none;
    padding: 0.3em 0.4em;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.2s;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    &:hover {
        background: ${props => props.$active ? '#1177bb' : '#505053'};
    }
`;

const ActionsGroup = styled.div`
    display: flex;
    gap: 0.3em;
    margin-left: auto;
    align-items: center;
`;

const ContentContainer = styled.div<{ $fitToContainer?: boolean }>`
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: center;
    background: white;

    ${props => props.$fitToContainer && `
        .dygram-svg > svg{
            max-height: 100%;
            max-width: 100%;
        }
        .dygram-svg {
            max-width: 100%;
            max-height: 100%;
            display: flex;
            align-items: center;
            margin: 0 auto;
        }
    `}
`;

const SVGWrapper = styled.div`
    overflow: auto;
    height: 100%;
    width: 100%;

    & > svg {
        margin: 0 auto;
        display: block;
    }
}`

const ActionButton = styled.button<{ $active?: boolean }>`
    background: ${props => props.$active ? '#0e639c' : 'transparent'};
    color: ${props => props.$active ? '#ffffff' : '#cccccc'};
    border: 1px solid ${props => props.$active ? '#0e639c' : '#3e3e42'};
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    &:hover {
        background: ${props => props.$active ? '#1177bb' : '#3e3e42'};
        border-color: ${props => props.$active ? '#1177bb' : '#505053'};
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const PNGImage = styled.img`
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
`;

const CodeBlock = styled.div`
    background: #1e1e1e;
    border-radius: 4px;
    padding: 12px;
    width: 100%;
    height: 100%;
    overflow: auto;
`;

const CodeHeader = styled.div`
    color: #cccccc;
    font-size: 12px;
    margin-bottom: 8px;
    font-weight: 600;
`;

const CodePre = styled.pre`
    margin: 0;
    padding: 12px;
    background: #2d2d30;
    border-radius: 4px;
    overflow-x: auto;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #d4d4d4;
    white-space: pre-wrap;
`;

const EmptyState = styled.div`
    color: #858585;
    text-align: center;
    padding: 40px;
`;

/**
 * Escape HTML for safe display
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Simplify AST for display (remove circular references)
 */
function simplifyAST(node: any, seen: Set<any> = new Set()): any {
    if (node === null || node === undefined) return node;
    if (typeof node !== 'object') return node;
    if (seen.has(node)) return '[Circular]';

    seen.add(node);

    if (Array.isArray(node)) {
        return node.map(item => simplifyAST(item, seen));
    }

    const simplified: any = {};

    for (const key in node) {
        // Skip internal Langium properties
        if (key.startsWith('$')) continue;

        try {
            simplified[key] = simplifyAST(node[key], seen);
        } catch {
            simplified[key] = '[Error]';
        }
    }

    return simplified;
}

/**
 * Simplify CST for display
 */
function simplifyCST(node: any, depth: number = 0, maxDepth: number = 10): any {
    if (depth > maxDepth) return '[Max depth reached]';
    if (node === null || node === undefined) return node;
    if (typeof node !== 'object') return node;

    if (Array.isArray(node)) {
        return node.slice(0, 100).map(item => simplifyCST(item, depth + 1, maxDepth));
    }

    const simplified: any = {};

    // Include relevant CST properties
    if ('element' in node) simplified.element = node.element;
    if ('feature' in node) simplified.feature = node.feature;
    if ('type' in node) simplified.type = node.type;
    if ('text' in node) simplified.text = node.text;
    if ('offset' in node) simplified.offset = node.offset;
    if ('length' in node) simplified.length = node.length;
    if ('children' in node && Array.isArray(node.children)) {
        simplified.children = node.children.slice(0, 20).map((c: any) => simplifyCST(c, depth + 1, maxDepth));
    }

    return simplified;
}

/**
 * Output Panel Component
 */
export const OutputPanel: React.FC<OutputPanelProps> = ({
    defaultFormat = 'svg',
    mobile = false,
    onFormatChange,
    data,
    onSourceLocationClick
}) => {
    const [currentFormat, setCurrentFormat] = useState<OutputFormat>(defaultFormat);
    const [outputData, setOutputData] = useState<OutputData>(data || {});
    const [fitToContainer, setFitToContainer] = useState(true);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
    const svgContainerRef = useRef<HTMLDivElement>(null);

    // Update internal state when data prop changes
    useEffect(() => {
        if (data) {
            setOutputData(data);
        }
    }, [data]);

    // Setup SVG interaction for bidirectional highlighting
    useEffect(() => {
        if (!svgContainerRef.current || !outputData.svg || currentFormat !== 'svg') {
            return;
        }

        const handleElementClick = (event: Event) => {
            const target = event.target as SVGElement;

            // Find the closest element with source position data (in xlink:href or href)
            let element: SVGElement | null = target;
            while (element && element !== svgContainerRef.current) {
                // Check for URL attribute (rendered as xlink:href in SVG)
                const href = element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                           element.getAttribute('href');

                if (href && href.startsWith('#L')) {
                    // Parse format: #L{startLine}:{startChar}-{endLine}:{endChar}
                    const match = href.match(/^#L(\d+):(\d+)-(\d+):(\d+)$/);
                    if (match) {
                        onSourceLocationClick?.({
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

        const svgContainer = svgContainerRef.current;

        // Get all interactive SVG elements (nodes and edges with position data)
        // Look for elements with xlink:href or href attributes
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
    }, [outputData.svg, currentFormat, onSourceLocationClick]);

    // Toggle fit to container
    const toggleFitToContainer = useCallback(() => {
        setFitToContainer(prev => !prev);
    }, []);

    const formats: Array<{ format: OutputFormat; label: string; title: string }> = [
        { format: 'svg', label: 'SVG', title: 'Rendered diagram' },
        { format: 'png', label: 'PNG', title: 'Rasterized diagram' },
        { format: 'dot', label: 'DOT', title: 'Graphviz DOT source' },
        { format: 'json', label: 'JSON', title: 'Machine JSON representation' },
        { format: 'ast', label: 'AST', title: 'Abstract Syntax Tree' },
        { format: 'cst', label: 'CST', title: 'Concrete Syntax Tree' },
        { format: 'src', label: 'SRC', title: 'Source Dygram definition' }
    ];

    const handleFormatChange = useCallback((format: OutputFormat) => {
        setCurrentFormat(format);
        if (onFormatChange) {
            onFormatChange(format);
        }
    }, [onFormatChange]);

    const updateData = useCallback((data: OutputData) => {
        setOutputData(prev => ({ ...prev, ...data }));
    }, []);

    const clear = useCallback(() => {
        setOutputData({});
    }, []);

    // Expose methods via ref (for imperative usage)
    useEffect(() => {
        // Store methods on a global object for backward compatibility
        (window as any).__outputPanelMethods = {
            updateData,
            clear,
            setFormat: handleFormatChange,
            getCurrentFormat: () => currentFormat
        };
    }, [updateData, clear, handleFormatChange, currentFormat]);

    const renderContent = () => {
        switch (currentFormat) {
            case 'svg':
                if (outputData.svg) {
                    return <SVGWrapper ref={svgContainerRef} className={'dygram-svg'} dangerouslySetInnerHTML={{ __html: outputData.svg }} />;
                }
                return <EmptyState>No SVG diagram available</EmptyState>;

            case 'png':
                if (outputData.png) {
                    return (
                        <SVGWrapper>
                            <PNGImage src={outputData.png} alt="Machine diagram PNG" />
                        </SVGWrapper>
                    );
                }
                return <EmptyState>No PNG image available</EmptyState>;

            case 'dot':
                if (outputData.dot) {
                    return (
                        <CodeBlock>
                            <CodeHeader>Graphviz DOT Source</CodeHeader>
                            <CodePre>
                                <code>{outputData.dot}</code>
                            </CodePre>
                        </CodeBlock>
                    );
                }
                return <EmptyState>No DOT source available</EmptyState>;

            case 'json':
                if (outputData.json) {
                    let formatted: string;
                    try {
                        const parsed = typeof outputData.json === 'string'
                            ? JSON.parse(outputData.json)
                            : outputData.json;
                        formatted = JSON.stringify(parsed, null, 2);
                    } catch {
                        formatted = outputData.json;
                    }

                    return (
                        <CodeBlock>
                            <CodeHeader>Machine JSON</CodeHeader>
                            <CodePre>
                                <code>{formatted}</code>
                            </CodePre>
                        </CodeBlock>
                    );
                }
                return <EmptyState>No JSON data available</EmptyState>;

            case 'ast':
                if (outputData.ast || outputData.machine) {
                    const ast = outputData.ast || outputData.machine;
                    let formatted: string;

                    try {
                        const simplified = simplifyAST(ast);
                        formatted = JSON.stringify(simplified, null, 2);
                    } catch (error) {
                        formatted = `Error serializing AST: ${error instanceof Error ? error.message : String(error)}`;
                    }

                    return (
                        <CodeBlock>
                            <CodeHeader>Abstract Syntax Tree (AST)</CodeHeader>
                            <CodePre>
                                <code>{formatted}</code>
                            </CodePre>
                        </CodeBlock>
                    );
                }
                return <EmptyState>No AST data available</EmptyState>;

            case 'cst':
                if (outputData.cst) {
                    let formatted: string;

                    try {
                        const simplified = simplifyCST(outputData.cst);
                        formatted = JSON.stringify(simplified, null, 2);
                    } catch (error) {
                        formatted = `Error serializing CST: ${error instanceof Error ? error.message : String(error)}`;
                    }

                    return (
                        <CodeBlock>
                            <CodeHeader>Concrete Syntax Tree (CST)</CodeHeader>
                            <CodePre>
                                <code>{formatted}</code>
                            </CodePre>
                        </CodeBlock>
                    );
                }
                return <EmptyState>No CST data available</EmptyState>;

            case 'src':
                if (outputData.src) {
                    return (
                        <CodeBlock>
                            <CodeHeader>Source Definition</CodeHeader>
                            <CodePre>
                                <code>{outputData.src}</code>
                            </CodePre>
                        </CodeBlock>
                    );
                }
                return <EmptyState>No source available</EmptyState>;

            default:
                return <EmptyState>Unknown format</EmptyState>;
        }
    };

    const copyableContent = useMemo(() => {
        switch (currentFormat) {
            case 'svg':
                return outputData.svg ?? null;
            case 'png':
                return outputData.png ?? null;
            case 'dot':
                return outputData.dot ?? null;
            case 'json':
                if (!outputData.json) return null;
                try {
                    const parsed = typeof outputData.json === 'string'
                        ? JSON.parse(outputData.json)
                        : outputData.json;
                    return JSON.stringify(parsed, null, 2);
                } catch {
                    return typeof outputData.json === 'string'
                        ? outputData.json
                        : JSON.stringify(outputData.json, null, 2);
                }
            case 'ast':
                if (outputData.ast || outputData.machine) {
                    try {
                        const simplified = simplifyAST(outputData.ast || outputData.machine);
                        return JSON.stringify(simplified, null, 2);
                    } catch (error) {
                        return `Error serializing AST: ${error instanceof Error ? error.message : String(error)}`;
                    }
                }
                return null;
            case 'cst':
                if (outputData.cst) {
                    try {
                        const simplified = simplifyCST(outputData.cst);
                        return JSON.stringify(simplified, null, 2);
                    } catch (error) {
                        return `Error serializing CST: ${error instanceof Error ? error.message : String(error)}`;
                    }
                }
                return null;
            case 'src':
                return outputData.src ?? null;
            default:
                return null;
        }
    }, [currentFormat, outputData]);

    useEffect(() => {
        if (copyStatus === 'idle') {
            return;
        }

        const timeout = window.setTimeout(() => {
            setCopyStatus('idle');
        }, 2000);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [copyStatus]);

    const handleCopy = useCallback(async () => {
        if (!copyableContent) {
            console.warn(`No content available to copy for format: ${currentFormat}`);
            return;
        }

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(copyableContent);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = copyableContent;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            setCopyStatus('copied');
        } catch (error) {
            console.error('Failed to copy output content:', error);
            setCopyStatus('error');
        }
    }, [copyableContent, currentFormat]);

    const copyButtonLabel = copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Retry Copy' : 'Copy';
    const copyButtonTitle = copyStatus === 'copied'
        ? 'Output copied to clipboard'
        : copyStatus === 'error'
            ? 'Copy failed, try again'
            : 'Copy output to clipboard';

    return (
        <Container>
            <ToggleContainer>
                {formats.map(({ format, label, title }) => (
                    <ToggleButton
                        key={format}
                        $active={format === currentFormat}
                        onClick={() => handleFormatChange(format)}
                        title={title}
                    >
                        {label}
                    </ToggleButton>
                ))}
                <ActionsGroup>
                    <ActionButton
                        onClick={handleCopy}
                        disabled={!copyableContent}
                        title={copyButtonTitle}
                    >
                        {copyButtonLabel}
                    </ActionButton>
                    {currentFormat === 'svg' && (
                        <ActionButton
                            $active={fitToContainer}
                            onClick={toggleFitToContainer}
                            title="Fit diagram to container"
                        >
                            Fit
                        </ActionButton>
                    )}
                </ActionsGroup>
            </ToggleContainer>
            <ContentContainer $fitToContainer={fitToContainer}>
                {renderContent()}
            </ContentContainer>
        </Container>
    );
};

// Export a hook for using the output panel imperatively
export const useOutputPanel = () => {
    return {
        updateData: (data: OutputData) => {
            (window as any).__outputPanelMethods?.updateData(data);
        },
        clear: () => {
            (window as any).__outputPanelMethods?.clear();
        },
        setFormat: (format: OutputFormat) => {
            (window as any).__outputPanelMethods?.setFormat(format);
        },
        getCurrentFormat: (): OutputFormat => {
            return (window as any).__outputPanelMethods?.getCurrentFormat() || 'svg';
        }
    };
};
