/**
 * Diagram Highlighter Component
 * 
 * Handles reverse highlighting - highlighting diagram elements based on cursor position in source code
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { SourceLocation } from './InteractiveSVG';

export interface ElementSourceMap {
    [elementId: string]: SourceLocation;
}

export interface SourceElementMap {
    [sourceOffset: number]: string[]; // Multiple elements can map to same source
}

interface DiagramHighlighterProps {
    svgContent: string;
    onRegisterCursorCallback?: (callback: (location: SourceLocation) => void) => void;
    onElementClick?: (location: SourceLocation) => void;
    onRegisterClearSourceCallback?: (callback: () => void) => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Parse source mapping from SVG class attributes
 */
function parseSourceMapping(svgElement: SVGElement): { elementMap: ElementSourceMap; sourceMap: SourceElementMap } {
    const elementMap: ElementSourceMap = {};
    const sourceMap: SourceElementMap = {};

    // Find all elements with source mapping class attributes
    const elementsWithMapping = svgElement.querySelectorAll('[class*="src-L"]');
    
    elementsWithMapping.forEach((element) => {
        const classList = element.getAttribute('class') || '';
        const sourceMatch = classList.match(/src-L(\d+)C(\d+)-L(\d+)C(\d+)-O(\d+)-(\d+)/);
        
        if (sourceMatch) {
            const [, startLine, startColumn, endLine, endColumn, startOffset, endOffset] = sourceMatch;
            const elementId = element.id || `element-${Math.random().toString(36).substr(2, 9)}`;
            
            // Ensure element has an ID for targeting
            if (!element.id) {
                element.id = elementId;
            }
            
            const location: SourceLocation = {
                startLine: parseInt(startLine),
                startColumn: parseInt(startColumn),
                endLine: parseInt(endLine),
                endColumn: parseInt(endColumn),
                startOffset: parseInt(startOffset),
                endOffset: parseInt(endOffset)
            };
            
            // Map element ID to source location
            elementMap[elementId] = location;
            
            // Map source offsets to element IDs (for reverse lookup)
            for (let offset = location.startOffset; offset <= location.endOffset; offset++) {
                if (!sourceMap[offset]) {
                    sourceMap[offset] = [];
                }
                sourceMap[offset].push(elementId);
            }
        }
    });
    
    console.log('🗺️ DiagramHighlighter: Parsed source mapping', {
        elementCount: Object.keys(elementMap).length,
        sourceRanges: Object.keys(sourceMap).length
    });
    
    return { elementMap, sourceMap };
}

/**
 * Highlight diagram elements based on source location
 */
function highlightElements(svgElement: SVGElement, elementIds: string[], highlight: boolean = true) {
    elementIds.forEach(elementId => {
        const element = svgElement.querySelector(`#${elementId}`);
        if (element) {
            if (highlight) {
                // Add highlight class
                element.classList.add('source-cursor-highlight');
                console.log('🎨 DiagramHighlighter: Highlighting element', elementId);
            } else {
                // Remove highlight class
                element.classList.remove('source-cursor-highlight');
            }
        }
    });
}

/**
 * Find elements that overlap with a source location range
 */
function findElementsInRange(sourceMap: SourceElementMap, location: SourceLocation): string[] {
    const elementIds = new Set<string>();
    
    // Check all offsets in the cursor location range
    for (let offset = location.startOffset; offset <= location.endOffset; offset++) {
        const elements = sourceMap[offset];
        if (elements) {
            elements.forEach(id => elementIds.add(id));
        }
    }
    
    return Array.from(elementIds);
}

/**
 * Diagram Highlighter Component
 */
export const DiagramHighlighter: React.FC<DiagramHighlighterProps> = ({
    svgContent,
    onRegisterCursorCallback,
    onElementClick,
    onRegisterClearSourceCallback,
    className,
    style
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const currentHighlightedElements = useRef<string[]>([]);
    const sourceMappingRef = useRef<{ elementMap: ElementSourceMap; sourceMap: SourceElementMap } | null>(null);
    const clearSourceHighlights = useRef<(() => void) | null>(null);

    // Handle SVG element clicks
    const handleSVGClick = useCallback((event: Event) => {
        if (!sourceMappingRef.current || !onElementClick) return;

        const target = event.target as Element;
        if (!target) return;

        // Find the closest element with source mapping
        let element = target;
        let sourceLocation: SourceLocation | null = null;

        while (element && element !== containerRef.current) {
            const elementId = element.id;
            if (elementId && sourceMappingRef.current.elementMap[elementId]) {
                sourceLocation = sourceMappingRef.current.elementMap[elementId];
                break;
            }
            element = element.parentElement!;
        }

        if (sourceLocation) {
            console.log('🎯 DiagramHighlighter: Element clicked', { elementId: element.id, sourceLocation });
            onElementClick(sourceLocation);
        }
    }, [onElementClick]);

    // Parse SVG and extract source mapping when content changes
    useEffect(() => {
        if (!containerRef.current || !svgContent) return;

        // Set SVG content
        containerRef.current.innerHTML = svgContent;
        
        const svgElement = containerRef.current.querySelector('svg');
        if (!svgElement) return;

        // Parse source mapping
        sourceMappingRef.current = parseSourceMapping(svgElement);

        // Add click event listeners to elements with source mapping
        if (onElementClick) {
            const elementsWithMapping = svgElement.querySelectorAll('[class*="src-L"]');
            elementsWithMapping.forEach(element => {
                element.addEventListener('click', handleSVGClick);
                // Add cursor pointer to indicate clickable
                (element as HTMLElement).style.cursor = 'pointer';
            });
        }

        // Add CSS for highlighting
        const style = document.createElement('style');
        style.textContent = `
            .source-cursor-highlight {
                filter: drop-shadow(0 0 4px rgba(255, 193, 7, 0.8)) !important;
                stroke: rgba(255, 193, 7, 0.9) !important;
                stroke-width: 2px !important;
                animation: pulse-highlight 1.5s ease-in-out infinite alternate;
            }
            
            @keyframes pulse-highlight {
                from { filter: drop-shadow(0 0 4px rgba(255, 193, 7, 0.6)); }
                to { filter: drop-shadow(0 0 8px rgba(255, 193, 7, 1.0)); }
            }
            
            /* Cluster highlighting */
            .source-cursor-highlight[class*="cluster"] {
                stroke: rgba(255, 193, 7, 0.7) !important;
                stroke-width: 3px !important;
                fill: rgba(255, 193, 7, 0.1) !important;
            }
            
            /* Note highlighting */  
            .source-cursor-highlight[shape="note"] {
                fill: rgba(255, 193, 7, 0.2) !important;
                stroke: rgba(255, 193, 7, 0.9) !important;
            }
            
            /* Hover effects for clickable elements */
            [class*="src-L"]:hover {
                filter: drop-shadow(0 0 2px rgba(59, 130, 246, 0.5)) !important;
            }
        `;
        
        // Add style to document head if not already present
        if (!document.querySelector('#diagram-highlighter-styles')) {
            style.id = 'diagram-highlighter-styles';
            document.head.appendChild(style);
        }

        // Cleanup function to remove event listeners
        return () => {
            if (onElementClick) {
                const elementsWithMapping = svgElement.querySelectorAll('[class*="src-L"]');
                elementsWithMapping.forEach(element => {
                    element.removeEventListener('click', handleSVGClick);
                });
            }
        };

    }, [svgContent, handleSVGClick, onElementClick]);

    // Handle cursor position changes
    const handleCursorChange = useCallback((location: SourceLocation) => {
        if (!containerRef.current || !sourceMappingRef.current) return;

        const svgElement = containerRef.current.querySelector('svg');
        if (!svgElement) return;

        const { sourceMap } = sourceMappingRef.current;

        // Clear previous highlights
        if (currentHighlightedElements.current.length > 0) {
            highlightElements(svgElement, currentHighlightedElements.current, false);
            currentHighlightedElements.current = [];
        }

        // Find elements to highlight based on cursor position
        const elementsToHighlight = findElementsInRange(sourceMap, location);
        
        if (elementsToHighlight.length > 0) {
            console.log('🎯 DiagramHighlighter: Cursor at', location, 'highlighting elements:', elementsToHighlight);
            highlightElements(svgElement, elementsToHighlight, true);
            currentHighlightedElements.current = elementsToHighlight;
        }

    }, []);

    // Register cursor change callback
    useEffect(() => {
        if (onRegisterCursorCallback) {
            onRegisterCursorCallback(handleCursorChange);
        }
    }, [onRegisterCursorCallback, handleCursorChange]);

    // Register clear source highlights callback
    useEffect(() => {
        if (onRegisterClearSourceCallback) {
            const clearCallback = () => {
                if (!containerRef.current || !sourceMappingRef.current) return;
                
                const svgElement = containerRef.current.querySelector('svg');
                if (!svgElement) return;

                // Clear all diagram highlights
                if (currentHighlightedElements.current.length > 0) {
                    highlightElements(svgElement, currentHighlightedElements.current, false);
                    currentHighlightedElements.current = [];
                    console.log('🧹 DiagramHighlighter: Cleared all diagram highlights for mutual exclusivity');
                }
            };
            
            clearSourceHighlights.current = clearCallback;
            onRegisterClearSourceCallback(clearCallback);
        }
    }, [onRegisterClearSourceCallback]);

    return (
        <div
            ref={containerRef}
            className={className}
            style={style}
        />
    );
};

/**
 * Hook for using diagram highlighting functionality
 */
export function useDiagramHighlighter() {
    const [cursorChangeCallback, setCursorChangeCallback] = React.useState<((location: SourceLocation) => void) | null>(null);

    const registerCursorCallback = useCallback((callback: (location: SourceLocation) => void) => {
        setCursorChangeCallback(() => callback);
    }, []);

    const highlightAtCursor = useCallback((location: SourceLocation) => {
        if (cursorChangeCallback) {
            cursorChangeCallback(location);
        }
    }, [cursorChangeCallback]);

    return {
        registerCursorCallback,
        highlightAtCursor
    };
}
