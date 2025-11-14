/**
 * Interactive SVG Component
 * 
 * Wraps SVG content with click handlers that can identify edge/node/cluster/namespace clicks
 * and highlight the appropriate location in the original source file (DSL editor view).
 * 
 * This component processes SVG elements with source mapping data attributes and provides
 * bidirectional navigation between the visual diagram and the source code.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import styled from 'styled-components';

export interface SourceLocation {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    startOffset: number;
    endOffset: number;
    fileUri?: string;
}

export interface SVGClickEvent {
    elementType: 'node' | 'edge' | 'cluster' | 'namespace';
    elementId: string;
    sourceLocation?: SourceLocation;
    originalEvent: MouseEvent;
}

export interface InteractiveSVGProps {
    /** SVG content as HTML string */
    svgContent: string;
    /** Callback when an SVG element with source mapping is clicked */
    onElementClick?: (event: SVGClickEvent) => void;
    /** Callback when an SVG element is hovered */
    onElementHover?: (event: SVGClickEvent | null) => void;
    /** Additional CSS class name */
    className?: string;
    /** Additional styles */
    style?: React.CSSProperties;
    /** Whether to show visual feedback on hover */
    showHoverFeedback?: boolean;
}

const SVGContainer = styled.div<{ $showHoverFeedback?: boolean }>`
    width: 100%;
    height: 100%;
    cursor: default;

    /* Style for clickable elements */
    ${props => props.$showHoverFeedback && `
        .clickable-element {
            cursor: pointer;
            transition: opacity 0.2s ease;
        }

        .clickable-element:hover {
            opacity: 0.8;
            filter: drop-shadow(0 0 3px rgba(66, 165, 245, 0.6));
        }

        .clickable-element.highlighted {
            filter: drop-shadow(0 0 5px rgba(76, 175, 80, 0.8));
        }
    `}

    /* Ensure SVG elements are properly sized */
    svg {
        max-width: 100%;
        height: auto;
    }
`;

/**
 * Extract source location from SVG element class attributes
 * Parses class names with format: src-L{startLine}C{startColumn}-L{endLine}C{endColumn}-O{startOffset}-{endOffset}
 * Traverses up the DOM tree to find the closest ancestor with source mapping data
 */
function extractSourceLocation(element: Element): SourceLocation | undefined {
    let currentElement: Element | null = element;
    
    // Traverse up the DOM tree to find source mapping data
    while (currentElement && currentElement.tagName !== 'svg') {
        // Handle both SVG elements (which have className.baseVal) and HTML elements (which have className as string)
        let classList: string;
        
        if (currentElement instanceof SVGElement && 'baseVal' in currentElement.className) {
            classList = (currentElement.className as any).baseVal;
        } else {
            classList = currentElement.className as string;
        }
        
        if (typeof classList === 'string') {
            // Match pattern: src-L5C10-L5C25-O120-135
            const match = classList.match(/src-L(\d+)C(\d+)-L(\d+)C(\d+)-O(\d+)-(\d+)/);
            
            if (match) {
                console.log('📍 InteractiveSVG: Found source mapping on element', {
                    tagName: currentElement.tagName,
                    className: classList,
                    match: match[0]
                });
                
                return {
                    startLine: parseInt(match[1], 10),
                    startColumn: parseInt(match[2], 10),
                    endLine: parseInt(match[3], 10),
                    endColumn: parseInt(match[4], 10),
                    startOffset: parseInt(match[5], 10),
                    endOffset: parseInt(match[6], 10),
                    fileUri: undefined // File URI not encoded in class names for simplicity
                };
            }
        }
        
        // Move to parent element
        currentElement = currentElement.parentElement;
    }
    
    console.log('⚠️ InteractiveSVG: No source mapping found in element hierarchy', {
        originalTagName: element.tagName,
        originalClassName: element.className
    });
    
    return undefined;
}

/**
 * Determine element type and ID from SVG element
 */
function getElementInfo(element: Element): { elementType: SVGClickEvent['elementType']; elementId: string } | null {
    // Check for node elements (typically <g> elements with node IDs)
    if (element.tagName === 'g' || element.tagName === 'ellipse' || element.tagName === 'rect' || element.tagName === 'polygon') {
        const id = element.getAttribute('id') || element.getAttribute('data-node-id');
        if (id) {
            // Determine if it's a cluster or regular node
            if (id.startsWith('cluster_')) {
                return { elementType: 'cluster', elementId: id.replace('cluster_', '') };
            }
            return { elementType: 'node', elementId: id };
        }
    }

    // Check for edge elements (typically <path> or <g> elements with edge data)
    if (element.tagName === 'path' || element.tagName === 'g') {
        const href = element.getAttribute('href');
        if (href && href.startsWith('#edge-')) {
            const edgeId = href.replace('#edge-', '');
            return { elementType: 'edge', elementId: edgeId };
        }
    }

    // Check parent elements for clickable data
    let parent = element.parentElement;
    while (parent && parent.tagName !== 'svg') {
        const parentInfo = getElementInfo(parent);
        if (parentInfo) {
            return parentInfo;
        }
        parent = parent.parentElement;
    }

    return null;
}

/**
 * Find all clickable elements in the SVG and add appropriate classes
 */
function markClickableElements(container: HTMLElement, showHoverFeedback: boolean) {
    if (!showHoverFeedback) return;

    // Find all elements with source mapping data
    const elementsWithSourceData = container.querySelectorAll('[data-source-start-line]');
    
    elementsWithSourceData.forEach(element => {
        element.classList.add('clickable-element');
    });

    // Also mark elements that have href attributes pointing to source locations
    const elementsWithHref = container.querySelectorAll('[href^="#edge-"], [href^="#node-"], [href^="#cluster-"]');
    elementsWithHref.forEach(element => {
        element.classList.add('clickable-element');
    });
}

export const InteractiveSVG: React.FC<InteractiveSVGProps> = ({
    svgContent,
    onElementClick,
    onElementHover,
    className,
    style,
    showHoverFeedback = true
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const currentHoveredElement = useRef<Element | null>(null);

    // Handle click events
    const handleClick = useCallback((event: MouseEvent) => {
        console.log('🖱️ InteractiveSVG: Click detected', { target: event.target });
        
        if (!onElementClick) {
            console.log('❌ InteractiveSVG: No onElementClick handler provided');
            return;
        }

        const target = event.target as Element;
        console.log('🎯 InteractiveSVG: Target element', { 
            tagName: target.tagName, 
            id: target.getAttribute('id'),
            className: target.className,
            classList: target.classList?.toString()
        });

        const elementInfo = getElementInfo(target);
        console.log('📋 InteractiveSVG: Element info', elementInfo);
        
        if (!elementInfo) {
            console.log('❌ InteractiveSVG: No element info found for target');
            return;
        }

        const sourceLocation = extractSourceLocation(target);
        console.log('📍 InteractiveSVG: Source location', sourceLocation);
        
        const clickEvent: SVGClickEvent = {
            elementType: elementInfo.elementType,
            elementId: elementInfo.elementId,
            sourceLocation,
            originalEvent: event
        };

        console.log('🚀 InteractiveSVG: Calling onElementClick with event', clickEvent);
        onElementClick(clickEvent);
        event.preventDefault();
        event.stopPropagation();
    }, [onElementClick]);

    // Handle hover events
    const handleMouseOver = useCallback((event: MouseEvent) => {
        if (!onElementHover) return;

        const target = event.target as Element;
        const elementInfo = getElementInfo(target);
        
        if (!elementInfo) {
            // Clear hover if moving to non-interactive element
            if (currentHoveredElement.current) {
                currentHoveredElement.current.classList.remove('highlighted');
                currentHoveredElement.current = null;
                onElementHover(null);
            }
            return;
        }

        // Don't trigger if already hovering the same element
        if (currentHoveredElement.current === target) return;

        // Clear previous highlight
        if (currentHoveredElement.current) {
            currentHoveredElement.current.classList.remove('highlighted');
        }

        // Set new highlight
        currentHoveredElement.current = target;
        if (showHoverFeedback) {
            target.classList.add('highlighted');
        }

        const sourceLocation = extractSourceLocation(target);
        
        const hoverEvent: SVGClickEvent = {
            elementType: elementInfo.elementType,
            elementId: elementInfo.elementId,
            sourceLocation,
            originalEvent: event
        };

        onElementHover(hoverEvent);
    }, [onElementHover, showHoverFeedback]);

    const handleMouseLeave = useCallback((event: MouseEvent) => {
        if (!onElementHover) return;

        // Only clear if we're leaving the container entirely
        const relatedTarget = event.relatedTarget as Element;
        if (!containerRef.current?.contains(relatedTarget)) {
            if (currentHoveredElement.current) {
                currentHoveredElement.current.classList.remove('highlighted');
                currentHoveredElement.current = null;
            }
            onElementHover(null);
        }
    }, [onElementHover]);

    // Set up event listeners and mark clickable elements
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Mark clickable elements for visual feedback
        markClickableElements(container, showHoverFeedback);

        // Add event listeners
        container.addEventListener('click', handleClick);
        container.addEventListener('mouseover', handleMouseOver);
        container.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            container.removeEventListener('click', handleClick);
            container.removeEventListener('mouseover', handleMouseOver);
            container.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [svgContent, handleClick, handleMouseOver, handleMouseLeave, showHoverFeedback]);

    return (
        <SVGContainer
            ref={containerRef}
            className={className}
            style={style}
            $showHoverFeedback={showHoverFeedback}
            dangerouslySetInnerHTML={{ __html: svgContent }}
        />
    );
};

export default InteractiveSVG;
