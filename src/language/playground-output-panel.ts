/**
 * Shared Output Panel Component
 *
 * Provides unified output format toggling for both Monaco and CodeMirror playgrounds
 * Supports: SVG diagram, DOT source, JSON, AST, CST
 */

import { Machine } from './generated/ast.js';

export type OutputFormat = 'svg' | 'dot' | 'json' | 'ast' | 'cst';

export interface OutputPanelConfig {
    container: HTMLElement;
    defaultFormat?: OutputFormat;
    onFormatChange?: (format: OutputFormat) => void;
    mobile?: boolean; // Mobile-optimized layout
}

export interface OutputData {
    svg?: string;
    dot?: string;
    json?: string;
    ast?: any;
    cst?: any;
    machine?: Machine;
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Output Panel Manager
 */
export class OutputPanel {
    private container: HTMLElement;
    private currentFormat: OutputFormat;
    private onFormatChange?: (format: OutputFormat) => void;
    private mobile: boolean;
    private outputData: OutputData = {};
    private toggleContainer?: HTMLElement;
    private contentContainer?: HTMLElement;
    private onSourceLocationClick?: (location: { lineStart: number; charStart: number; lineEnd: number; charEnd: number }) => void;

    constructor(config: OutputPanelConfig) {
        this.container = config.container;
        this.currentFormat = config.defaultFormat || 'svg';
        this.onFormatChange = config.onFormatChange;
        this.mobile = config.mobile || false;

        this.initialize();
    }

    /**
     * Set callback for source location clicks (SVG → Editor)
     */
    setSourceLocationClickHandler(handler: (location: { lineStart: number; charStart: number; lineEnd: number; charEnd: number }) => void): void {
        this.onSourceLocationClick = handler;
    }

    /**
     * Initialize the output panel UI
     */
    private initialize(): void {
        // Create toggle buttons container
        this.toggleContainer = document.createElement('div');
        this.toggleContainer.className = 'output-format-toggles';
        this.toggleContainer.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 8px 12px;
            background: #2d2d30;
            border-bottom: 1px solid #3e3e42;
            ${this.mobile ? '-webkit-overflow-scrolling: touch;' : ''}
        `;

        // Create content container
        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'output-format-content';
        this.contentContainer.style.cssText = `
    xdisplay: flex
;
    justify-content: center;
    background-color: white;
    align-items: center;
    flex-grow: 1;
    flex-shrink: 1;
        `;

        // Add toggle buttons
        const formats: Array<{ format: OutputFormat; label: string; title: string }> = [
            { format: 'svg', label: 'SVG', title: 'Rendered diagram' },
            { format: 'dot', label: 'DOT', title: 'Graphviz DOT source' },
            { format: 'json', label: 'JSON', title: 'Machine JSON representation' },
            { format: 'ast', label: 'AST', title: 'Abstract Syntax Tree' },
            { format: 'cst', label: 'CST', title: 'Concrete Syntax Tree' }
        ];

        formats.forEach(({ format, label, title }) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.title = title;
            button.className = 'output-format-btn';
            button.style.cssText = `
                background: ${format === this.currentFormat ? '#0e639c' : '#3e3e42'};
                color: ${format === this.currentFormat ? '#ffffff' : '#d4d4d4'};
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                white-space: nowrap;
                transition: background 0.2s;
                white-space: pre-wrap;
            `;

            button.addEventListener('click', () => {
                this.setFormat(format);
            });

            this.toggleContainer!.appendChild(button);
        });

        // Clear and setup container
        this.container.innerHTML = '';
        this.container.style.cssText = `
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;
        this.container.appendChild(this.toggleContainer);
        this.container.appendChild(this.contentContainer);
    }

    /**
     * Set the current output format
     */
    setFormat(format: OutputFormat): void {
        if (this.currentFormat === format) return;

        this.currentFormat = format;

        // Update button states
        const buttons = this.toggleContainer!.querySelectorAll('.output-format-btn');
        const formats: OutputFormat[] = ['svg', 'dot', 'json', 'ast', 'cst'];

        buttons.forEach((button, index) => {
            const btn = button as HTMLButtonElement;
            const isActive = formats[index] === format;
            btn.style.background = isActive ? '#0e639c' : '#3e3e42';
            btn.style.color = isActive ? '#ffffff' : '#d4d4d4';
        });

        // Render current data in new format
        this.render();

        // Notify listeners
        if (this.onFormatChange) {
            this.onFormatChange(format);
        }
    }

    /**
     * Update output data
     */
    updateData(data: OutputData): void {
        this.outputData = { ...this.outputData, ...data };
        this.render();
    }

    /**
     * Render current format
     */
    private render(): void {
        if (!this.contentContainer) return;

        switch (this.currentFormat) {
            case 'svg':
                this.renderSVG();
                break;
            case 'dot':
                this.renderDOT();
                break;
            case 'json':
                this.renderJSON();
                break;
            case 'ast':
                this.renderAST();
                break;
            case 'cst':
                this.renderCST();
                break;
        }
    }

    /**
     * Render SVG diagram
     */
    private renderSVG(): void {
        if (!this.contentContainer) return;

        if (this.outputData.svg) {
            this.contentContainer.innerHTML = this.outputData.svg;

            // Setup bidirectional highlighting: SVG → Editor
            this.setupSVGClickHandlers();
        } else {
            this.contentContainer.innerHTML = `
                <div style="color: #858585; text-align: center; padding: 40px;">
                    No SVG diagram available
                </div>
            `;
        }
    }

    /**
     * Setup click handlers for SVG elements to highlight source code
     */
    private setupSVGClickHandlers(): void {
        if (!this.contentContainer || !this.onSourceLocationClick) return;

        const handleElementClick = (event: Event) => {
            const target = event.target as SVGElement;

            // Find the closest element with source position data
            let element: SVGElement | null = target;
            while (element && element !== this.contentContainer) {
                const href = element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                           element.getAttribute('href');

                if (href && href.startsWith('#L')) {
                    // Parse format: #L{startLine}:{startChar}-{endLine}:{endChar}
                    const match = href.match(/^#L(\d+):(\d+)-(\d+):(\d+)$/);
                    if (match) {
                        this.onSourceLocationClick?.({
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

        // Get all interactive SVG elements
        const elements = this.contentContainer.querySelectorAll('[href^="#L"], [*|href^="#L"]');

        elements.forEach(element => {
            element.addEventListener('click', handleElementClick);
            element.addEventListener('touchend', handleElementClick, { passive: false } as any);
            (element as HTMLElement).style.cursor = 'pointer';
        });
    }

    /**
     * Render DOT source
     */
    private renderDOT(): void {
        if (!this.contentContainer) return;

        if (this.outputData.dot) {
            this.contentContainer.innerHTML = `
                <div style="background: #1e1e1e; border-radius: 4px; padding: 12px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 8px; font-weight: 600;">
                        Graphviz DOT Source
                    </div>
                    <pre style="
                        margin: 0;
                        padding: 12px;
                        background: #2d2d30;
                        border-radius: 4px;
                        overflow-x: auto;
                        font-family: 'Monaco', 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.5;
                        color: #d4d4d4;
                    "><code style="white-space: pre-wrap;">${escapeHtml(this.outputData.dot)}</code></pre>
                </div>
            `;
        } else {
            this.contentContainer.innerHTML = `
                <div style="color: #858585; text-align: center; padding: 40px;">
                    No DOT source available
                </div>
            `;
        }
    }

    /**
     * Render JSON
     */
    private renderJSON(): void {
        if (!this.contentContainer) return;

        if (this.outputData.json) {
            // Pretty-print JSON
            let formatted: string;
            try {
                const parsed = typeof this.outputData.json === 'string'
                    ? JSON.parse(this.outputData.json)
                    : this.outputData.json;
                formatted = JSON.stringify(parsed, null, 2);
            } catch {
                formatted = this.outputData.json;
            }

            this.contentContainer.innerHTML = `
                <div style="background: #1e1e1e; border-radius: 4px; padding: 12px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 8px; font-weight: 600;">
                        Machine JSON
                    </div>
                    <pre style="
                        margin: 0;
                        padding: 12px;
                        background: #2d2d30;
                        border-radius: 4px;
                        overflow-x: auto;
                        font-family: 'Monaco', 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.5;
                        color: #d4d4d4;
                    "><code>${escapeHtml(formatted)}</code></pre>
                </div>
            `;
        } else {
            this.contentContainer.innerHTML = `
                <div style="color: #858585; text-align: center; padding: 40px;">
                    No JSON data available
                </div>
            `;
        }
    }

    /**
     * Render AST
     */
    private renderAST(): void {
        if (!this.contentContainer) return;

        if (this.outputData.ast || this.outputData.machine) {
            const ast = this.outputData.ast || this.outputData.machine;
            let formatted: string;

            try {
                // Create a simplified AST without circular references
                const simplified = this.simplifyAST(ast);
                formatted = JSON.stringify(simplified, null, 2);
            } catch (error) {
                formatted = `Error serializing AST: ${error instanceof Error ? error.message : String(error)}`;
            }

            this.contentContainer.innerHTML = `
                <div style="background: #1e1e1e; border-radius: 4px; padding: 12px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 8px; font-weight: 600;">
                        Abstract Syntax Tree (AST)
                    </div>
                    <pre style="
                        margin: 0;
                        padding: 12px;
                        background: #2d2d30;
                        border-radius: 4px;
                        overflow-x: auto;
                        font-family: 'Monaco', 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.5;
                        color: #d4d4d4;
                    "><code>${escapeHtml(formatted)}</code></pre>
                </div>
            `;
        } else {
            this.contentContainer.innerHTML = `
                <div style="color: #858585; text-align: center; padding: 40px;">
                    No AST data available
                </div>
            `;
        }
    }

    /**
     * Render CST
     */
    private renderCST(): void {
        if (!this.contentContainer) return;

        if (this.outputData.cst) {
            let formatted: string;

            try {
                // CST may have circular references, handle carefully
                const simplified = this.simplifyCST(this.outputData.cst);
                formatted = JSON.stringify(simplified, null, 2);
            } catch (error) {
                formatted = `Error serializing CST: ${error instanceof Error ? error.message : String(error)}`;
            }

            this.contentContainer.innerHTML = `
                <div style="background: #1e1e1e; border-radius: 4px; padding: 12px;">
                    <div style="color: #cccccc; font-size: 12px; margin-bottom: 8px; font-weight: 600;">
                        Concrete Syntax Tree (CST)
                    </div>
                    <pre style="
                        margin: 0;
                        padding: 12px;
                        background: #2d2d30;
                        border-radius: 4px;
                        overflow-x: auto;
                        font-family: 'Monaco', 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.5;
                        color: #d4d4d4;
                    "><code>${escapeHtml(formatted)}</code></pre>
                </div>
            `;
        } else {
            this.contentContainer.innerHTML = `
                <div style="color: #858585; text-align: center; padding: 40px;">
                    No CST data available
                </div>
            `;
        }
    }

    /**
     * Simplify AST for display (remove circular references)
     */
    private simplifyAST(node: any, seen: Set<any> = new Set()): any {
        if (node === null || node === undefined) return node;
        if (typeof node !== 'object') return node;
        if (seen.has(node)) return '[Circular]';

        seen.add(node);

        if (Array.isArray(node)) {
            return node.map(item => this.simplifyAST(item, seen));
        }

        const simplified: any = {};

        for (const key in node) {
            // Skip internal Langium properties
            if (key.startsWith('$')) continue;

            try {
                simplified[key] = this.simplifyAST(node[key], seen);
            } catch {
                simplified[key] = '[Error]';
            }
        }

        return simplified;
    }

    /**
     * Simplify CST for display
     */
    private simplifyCST(node: any, depth: number = 0, maxDepth: number = 10): any {
        if (depth > maxDepth) return '[Max depth reached]';
        if (node === null || node === undefined) return node;
        if (typeof node !== 'object') return node;

        if (Array.isArray(node)) {
            return node.slice(0, 100).map(item => this.simplifyCST(item, depth + 1, maxDepth));
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
            simplified.children = node.children.slice(0, 20).map((c: any) => this.simplifyCST(c, depth + 1, maxDepth));
        }

        return simplified;
    }

    /**
     * Get current format
     */
    getCurrentFormat(): OutputFormat {
        return this.currentFormat;
    }

    /**
     * Clear output
     */
    clear(): void {
        this.outputData = {};
        this.render();
    }
}
