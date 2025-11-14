/**
 * Source Highlight Service
 * 
 * Provides functionality to highlight source code locations in CodeMirror editors
 * based on source mapping information from SVG click events.
 */

import React from 'react';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, Extension, Compartment } from '@codemirror/state';
import type { SourceLocation } from '../components/InteractiveSVG';

// State effect for adding highlights
const addHighlight = StateEffect.define<SourceLocation>();

// State effect for clearing highlights
const clearHighlights = StateEffect.define<void>();

// Decoration for highlighted source ranges
const highlightDecoration = Decoration.mark({
    class: 'source-highlight',
    attributes: {
        style: 'background-color: rgba(76, 175, 80, 0.3); border-radius: 2px;'
    }
});

// State field to manage highlight decorations
const highlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(highlights, tr) {
        // Apply document changes to existing highlights
        highlights = highlights.map(tr.changes);

        // Process state effects
        for (const effect of tr.effects) {
            if (effect.is(addHighlight)) {
                const location = effect.value;
                
                // Convert line/column to document positions
                const doc = tr.state.doc;
                const startPos = Math.min(location.startOffset, doc.length);
                const endPos = Math.min(location.endOffset, doc.length);
                
                // Ensure valid range
                if (startPos >= 0 && endPos > startPos && endPos <= doc.length) {
                    const decoration = highlightDecoration.range(startPos, endPos);
                    highlights = highlights.update({
                        add: [decoration]
                    });
                }
            } else if (effect.is(clearHighlights)) {
                highlights = Decoration.none;
            }
        }

        return highlights;
    },
    provide: f => EditorView.decorations.from(f)
});

// CSS styles for the highlight decoration
const highlightTheme = EditorView.theme({
    '.source-highlight': {
        backgroundColor: 'rgba(76, 175, 80, 0.3)',
        borderRadius: '2px',
        transition: 'background-color 0.2s ease'
    },
    '.source-highlight:hover': {
        backgroundColor: 'rgba(76, 175, 80, 0.5)'
    }
});

/**
 * CodeMirror extension that provides source highlighting functionality
 */
export const sourceHighlightExtension: Extension = [
    highlightField,
    highlightTheme
];

/**
 * Service class for managing source code highlighting in CodeMirror editors
 * Now supports per-editor instances to handle multiple editors on the same page
 */
export class SourceHighlightService {
    private editorView: EditorView | null = null;
    private cursorTrackingDisposer: (() => void) | null = null;
    private cursorTrackingCompartment = new Compartment();
    private cursorTrackingInitialized = false;
    private onCursorChange?: (location: SourceLocation) => void;
    private onClearDiagramHighlights?: () => void;
    private isProgrammaticMove: boolean = false;
    private hasActiveSourceHighlight: boolean = false;

    /**
     * Register a CodeMirror editor view with this service
     */
    setEditorView(view: EditorView): void {
        this.editorView = view;
        this.setupCursorTracking();
    }

    /**
     * Set up cursor position tracking for reverse highlighting
     */
    private setupCursorTracking(): void {
        if (!this.editorView || !this.onCursorChange) {
            return;
        }

        // Clean up existing tracking
        if (this.cursorTrackingDisposer) {
            this.cursorTrackingDisposer();
        }

        let debounceTimeout: number | null = null;

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.selectionSet) {
                // Skip processing if this is a programmatic move (check immediately, not in timeout)
                if (this.isProgrammaticMove) {
                    console.log('⏭️ SourceHighlightService: Skipping cursor tracking due to programmatic move');
                    this.isProgrammaticMove = false; // Reset flag
                    return;
                }

                // Debounce cursor position updates
                if (debounceTimeout) {
                    clearTimeout(debounceTimeout);
                }

                debounceTimeout = window.setTimeout(() => {
                    const selection = update.state.selection.main;
                    const doc = update.state.doc;
                    
                    // Convert cursor position to line/column
                    const line = doc.lineAt(selection.head);
                    const lineNumber = line.number;
                    const columnNumber = selection.head - line.from + 1;

                    const location: SourceLocation = {
                        startLine: lineNumber,
                        startColumn: columnNumber,
                        endLine: lineNumber,
                        endColumn: columnNumber,
                        startOffset: selection.head,
                        endOffset: selection.head
                    };

                    console.log('📍 SourceHighlightService: User cursor moved to', location);
                    
                    // Only clear source highlights if we have an active source highlight (from SVG click)
                    if (this.hasActiveSourceHighlight) {
                        console.log('🧹 SourceHighlightService: Clearing source highlights due to user cursor movement');
                        this.clearHighlights();
                        this.hasActiveSourceHighlight = false;
                    }
                    
                    // Trigger diagram highlighting
                    this.onCursorChange!(location);
                }, 300); // 300ms debounce
            }
        });

        const applyUpdateListener = () => {
            if (!this.editorView) {
                return;
            }

            if (!this.cursorTrackingInitialized) {
                this.editorView.dispatch({
                    effects: StateEffect.appendConfig.of(
                        this.cursorTrackingCompartment.of(updateListener)
                    )
                });
                this.cursorTrackingInitialized = true;
            } else {
                this.editorView.dispatch({
                    effects: this.cursorTrackingCompartment.reconfigure(updateListener)
                });
            }
        };

        applyUpdateListener();

        // Store disposer function
        this.cursorTrackingDisposer = () => {
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
            }

            if (this.cursorTrackingInitialized && this.editorView) {
                this.editorView.dispatch({
                    effects: this.cursorTrackingCompartment.reconfigure([])
                });
            }
        };
    }

    /**
     * Set callback for cursor position changes (for reverse highlighting)
     */
    setCursorChangeCallback(callback: (location: SourceLocation) => void): void {
        this.onCursorChange = callback;
        if (this.editorView) {
            this.setupCursorTracking();
        }
    }

    /**
     * Set callback for clearing diagram highlights (for mutual exclusivity)
     */
    setClearDiagramHighlightsCallback(callback: () => void): void {
        this.onClearDiagramHighlights = callback;
    }

    /**
     * Highlight a source location in the registered editor
     */
    highlightLocation(location: SourceLocation): void {
        console.log('🎨 SourceHighlightService: highlightLocation called', location);
        
        if (!this.editorView) {
            console.warn('❌ SourceHighlightService: No editor view registered');
            return;
        }

        // Clear diagram highlights first (mutual exclusivity)
        if (this.onClearDiagramHighlights) {
            console.log('🧹 SourceHighlightService: Clearing diagram highlights for mutual exclusivity');
            this.onClearDiagramHighlights();
        }

        console.log('✅ SourceHighlightService: Editor view found, clearing existing highlights');
        // Clear existing source highlights
        this.clearHighlights();

        console.log('🎯 SourceHighlightService: Adding new highlight', {
            startOffset: location.startOffset,
            endOffset: location.endOffset,
            docLength: this.editorView.state.doc.length
        });

        // Add new highlight
        this.editorView.dispatch({
            effects: addHighlight.of(location)
        });

        // Mark that we have an active source highlight
        this.hasActiveSourceHighlight = true;

        console.log('📜 SourceHighlightService: Scrolling to location');
        // Scroll to the highlighted location
        this.scrollToLocation(location);
    }

    /**
     * Clear all highlights in the registered editor
     */
    clearHighlights(): void {
        if (!this.editorView) {
            return;
        }

        this.editorView.dispatch({
            effects: clearHighlights.of()
        });
    }

    /**
     * Scroll the editor to show a specific source location
     * Enhanced to show as much of the target range as possible with context
     */
    private scrollToLocation(location: SourceLocation): void {
        if (!this.editorView) {
            return;
        }

        const doc = this.editorView.state.doc;
        const startPos = Math.min(location.startOffset, doc.length);
        const endPos = Math.min(location.endOffset, doc.length);

        // Set flag to prevent cursor tracking from clearing highlights
        this.isProgrammaticMove = true;

        // Calculate the range to show
        const rangeLength = endPos - startPos;
        
        // For single-line or short ranges, use enhanced positioning
        if (rangeLength <= 100) {
            // Get line information for context calculation
            const startLine = doc.lineAt(startPos);
            const endLine = doc.lineAt(endPos);
            
            // Add context lines (2-3 lines before start for readability)
            const contextLines = 2;
            const contextStartLine = Math.max(1, startLine.number - contextLines);
            const contextStartPos = doc.line(contextStartLine).from;
            
            // Position cursor at start of range and scroll to show context
            this.editorView.dispatch({
                selection: { anchor: startPos, head: startPos },
                effects: EditorView.scrollIntoView(startPos, { y: "start", yMargin: 20 })
            });
        } else {
            // For longer ranges, try to show as much as possible
            this.editorView.dispatch({
                selection: { anchor: startPos, head: startPos },
                effects: EditorView.scrollIntoView(startPos, { y: "start", yMargin: 10 })
            });
        }

        console.log('📜 SourceHighlightService: Enhanced scroll to location', {
            startPos,
            endPos,
            rangeLength,
            startLine: doc.lineAt(startPos).number,
            endLine: doc.lineAt(endPos).number
        });
    }

    /**
     * Get the current editor view
     */
    getEditorView(): EditorView | null {
        return this.editorView;
    }

    /**
     * Check if an editor is registered
     */
    hasEditor(): boolean {
        return this.editorView !== null;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.cursorTrackingDisposer) {
            this.cursorTrackingDisposer();
            this.cursorTrackingDisposer = null;
        }
        this.editorView = null;
        this.onCursorChange = undefined;
    }
}

/**
 * Global instance of the source highlight service (for backward compatibility)
 * @deprecated Use createSourceHighlightService() for new implementations
 */
export const sourceHighlightService = new SourceHighlightService();

/**
 * Create a new source highlight service instance
 * Use this for multiple editors on the same page
 */
export function createSourceHighlightService(): SourceHighlightService {
    return new SourceHighlightService();
}

/**
 * Hook for React components to use the source highlight service
 * @deprecated Use useSourceHighlightService() for new implementations
 */
export function useSourceHighlight() {
    return {
        highlightLocation: (location: SourceLocation) => sourceHighlightService.highlightLocation(location),
        clearHighlights: () => sourceHighlightService.clearHighlights(),
        setEditorView: (view: EditorView) => sourceHighlightService.setEditorView(view),
        hasEditor: () => sourceHighlightService.hasEditor()
    };
}

/**
 * Hook for React components to create and use a dedicated source highlight service
 * This ensures each editor has its own highlighting service instance
 */
export function useSourceHighlightService() {
    const [service] = React.useState(() => createSourceHighlightService());
    
    React.useEffect(() => {
        return () => {
            service.dispose();
        };
    }, [service]);

    return {
        highlightLocation: (location: SourceLocation) => service.highlightLocation(location),
        clearHighlights: () => service.clearHighlights(),
        setEditorView: (view: EditorView) => service.setEditorView(view),
        setCursorChangeCallback: (callback: (location: SourceLocation) => void) => service.setCursorChangeCallback(callback),
        setClearDiagramHighlightsCallback: (callback: () => void) => service.setClearDiagramHighlightsCallback(callback),
        hasEditor: () => service.hasEditor(),
        service // Expose the service instance for advanced usage
    };
}

/**
 * Utility function to convert line/column coordinates to document offset
 * This is useful when you have line/column information instead of offsets
 */
export function lineColumnToOffset(doc: any, line: number, column: number): number {
    try {
        // Convert 1-based line number to 0-based
        const lineObj = doc.line(line);
        return lineObj.from + Math.min(column - 1, lineObj.length);
    } catch (error) {
        console.warn('Failed to convert line/column to offset:', error);
        return 0;
    }
}

/**
 * Utility function to create a SourceLocation from line/column coordinates
 */
export function createSourceLocationFromLineColumn(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number,
    doc: any,
    fileUri?: string
): SourceLocation {
    const startOffset = lineColumnToOffset(doc, startLine, startColumn);
    const endOffset = lineColumnToOffset(doc, endLine, endColumn);

    return {
        startLine,
        startColumn,
        endLine,
        endColumn,
        startOffset,
        endOffset,
        fileUri
    };
}
