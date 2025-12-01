/**
 * Graphviz DOT Diagram Generator
 *
 * Generates DOT syntax from MachineJSON for rendering with Graphviz.
 * Supports both static and runtime visualizations with full nested namespace support.
 */

import { MachineJSON, DiagramOptions, RuntimeContext, RuntimeNodeState, RuntimeEdgeState, SemanticHierarchy } from './types.js';
import { NodeTypeChecker } from '../node-type-checker.js';
import { ValidationContext, ValidationSeverity } from '../validation-errors.js';
import { CelEvaluator } from '../cel-evaluator.js';
import { EdgeEvaluator, EdgeEvaluationResult } from './edge-evaluator.js';
import { mapCssPropertyToGraphviz } from '../utils/style-normalizer.js';
import { marked } from 'marked';
import { buildGlobalContext } from '../execution/context-builder.js';

/**
 * Interpolate template variables in a string value
 * Attempts to resolve {{ variable }} patterns using the provided context
 * Returns original value if interpolation fails or no context is provided
 */
function interpolateValue(value: string, context?: RuntimeContext, machineJson?: MachineJSON): string {
    if (!value || typeof value !== 'string') {
        return value;
    }

    // Check if the value contains template syntax
    const hasTemplate = /\{\{[^}]+\}\}/.test(value);
    if (!hasTemplate) {
        return value;
    }

    // For runtime diagrams, use runtime context
    if (context) {
        try {
            const celEvaluator = new CelEvaluator();
            
            // Build proper context structure for CEL evaluator
            // The context.attributes is a Map, we need to convert it to a nested object structure
            const attributesObj: Record<string, any> = {};
            
            if (context.attributes) {
                context.attributes.forEach((attrValue, attrKey) => {
                    // Handle nested attribute names like "input.query"
                    const parts = attrKey.split('.');
                    let current = attributesObj;
                    
                    for (let i = 0; i < parts.length - 1; i++) {
                        const part = parts[i];
                        if (!current[part]) {
                            current[part] = {};
                        }
                        current = current[part];
                    }
                    
                    current[parts[parts.length - 1]] = attrValue;
                });
            }

            const celContext = {
                errorCount: context.errorCount || 0,
                activeState: context.activeState || '',
                attributes: attributesObj
            };

            return celEvaluator.resolveTemplate(value, celContext);
        } catch (error) {
            console.warn('Failed to interpolate template value with runtime context:', value, error);
            return value; // Return original on error
        }
    }

    // For static diagrams, use global context from machine JSON
    if (machineJson) {
        try {
            const celEvaluator = new CelEvaluator();
            
            // Use the unified context building logic for static diagrams
            const globalContext = buildGlobalContext(machineJson);
            
            const celContext = {
                errorCount: 0,
                activeState: '',
                attributes: globalContext
            };

            return celEvaluator.resolveTemplate(value, celContext);
        } catch (error) {
            console.warn('Failed to interpolate template value with static context:', value, error);
            return value; // Return original on error
        }
    }

    // If no context available, return original value
    return value;
}

function sanitizeForDotId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]+/g, '_');
}

/**
 * Normalize direction value to Graphviz rankdir format
 * Supports both verbose (left-to-right) and short (LR) formats
 * Also supports CSS flex-inspired shorthand: "row" (TB) and "column" (LR)
 */
function normalizeDirectionValue(value: string): string {
    const normalized = value.toLowerCase().trim();
    const directionMap: Record<string, string> = {
        'left-to-right': 'LR',
        'right-to-left': 'RL',
        'top-to-bottom': 'TB',
        'bottom-to-top': 'BT',
        'lr': 'LR',
        'rl': 'RL',
        'tb': 'TB',
        'bt': 'BT',
        // CSS flex-inspired shorthand
        'row': 'TB',      // row flows top-to-bottom
        'column': 'LR'    // column flows left-to-right
    };
    return directionMap[normalized] || value;
}

/**
 * Extract direction from style attributes
 * Supports: direction property in @style annotations and style attributes
 * Returns normalized direction value (LR, RL, TB, BT) or undefined if not set
 */
function extractDirection(node: any): string | undefined {
    if (node.style) {
        if (node.style.rankdir !== undefined) {
            return normalizeDirectionValue(String(node.style.rankdir));
        }
        if (node.style.direction !== undefined) {
            return normalizeDirectionValue(String(node.style.direction));
        }
    }

    // Check @style annotations
    const annotations = node.annotations || [];
    for (const ann of annotations) {
        if (ann.name === 'style') {
            if (ann.attributes) {
                const direction = ann.attributes['direction'];
                if (direction !== undefined) {
                    return normalizeDirectionValue(String(direction));
                }
            } else if (ann.value) {
                const styleAttrs = ann.value.split(';').map((s: string) => s.trim()).filter((s: string) => s);
                for (const attr of styleAttrs) {
                    const [key, ...valueParts] = attr.split(':');
                    const normalizedKey = key.trim().toLowerCase();
                    if (normalizedKey === 'direction') {
                        return normalizeDirectionValue(valueParts.join(':').trim());
                    }
                }
            }
        }
    }

    // Check style attribute
    const styleAttr = node.attributes?.find((a: any) => a.name === 'style');
    if (styleAttr && styleAttr.value && typeof styleAttr.value === 'object') {
        const direction = styleAttr.value['direction'];
        if (direction !== undefined) {
            return normalizeDirectionValue(String(direction));
        }
    }

    return undefined;
}

function appendStyleAttributes(
    baseStyle: string,
    style?: Record<string, unknown>,
    skipKeys: Set<string> = new Set()
): string {
    if (!style) {
        return baseStyle;
    }

    let result = baseStyle;

    Object.entries(style).forEach(([key, value]) => {
        if (value === undefined || value === null) {
            return;
        }

        if (skipKeys.has(key)) {
            return;
        }

        const formattedValue = String(value).replace(/"/g, '\\"');
        result += `, ${key}="${formattedValue}"`;
    });

    return result;
}

/**
 * Extract grid size from style attributes
 * Supports: grid, columns, cols (for backwards compatibility)
 */
function extractGridSize(node: any): number | undefined {
    if (node.style) {
        const gridStyle = node.style.grid ?? node.style.columns ?? node.style.cols;
        if (gridStyle !== undefined) {
            const count = parseInt(String(gridStyle), 10);
            if (!isNaN(count)) {
                return count;
            }
        }
    }

    // Check @style annotations
    const annotations = node.annotations || [];
    for (const ann of annotations) {
        if (ann.name === 'style') {
            if (ann.attributes) {
                const grid = ann.attributes['grid'] || ann.attributes['columns'] || ann.attributes['cols'];
                if (grid !== undefined) {
                    const count = parseInt(String(grid), 10);
                    return isNaN(count) ? undefined : count;
                }
            } else if (ann.value) {
                const styleAttrs = ann.value.split(';').map((s: string) => s.trim()).filter((s: string) => s);
                for (const attr of styleAttrs) {
                    const [key, ...valueParts] = attr.split(':');
                    const normalizedKey = key.trim().toLowerCase();
                    if (normalizedKey === 'grid' || normalizedKey === 'columns' || normalizedKey === 'cols') {
                        const count = parseInt(valueParts.join(':').trim(), 10);
                        return isNaN(count) ? undefined : count;
                    }
                }
            }
        }
    }

    // Check style attribute
    const styleAttr = node.attributes?.find((a: any) => a.name === 'style');
    if (styleAttr && styleAttr.value && typeof styleAttr.value === 'object') {
        const grid = styleAttr.value['grid'] || styleAttr.value['columns'] || styleAttr.value['cols'];
        if (grid !== undefined) {
            const count = parseInt(String(grid), 10);
            return isNaN(count) ? undefined : count;
        }
    }

    return undefined;
}

/**
 * Extract grid position assignment from node style attributes
 * Supports: grid-position, grid-pos, column, col (for backwards compatibility)
 */
function extractNodeGridPosition(node: any): number | undefined {
    if (node.style) {
        const posStyle = node.style['grid-position'] || node.style['grid-pos'] ||
            node.style['column'] || node.style['col'];
        if (posStyle !== undefined) {
            const posNum = parseInt(String(posStyle), 10);
            if (!isNaN(posNum)) {
                return posNum;
            }
        }
    }

    // Check @style annotations
    const annotations = node.annotations || [];
    for (const ann of annotations) {
        if (ann.name === 'style') {
            if (ann.attributes) {
                const pos = ann.attributes['grid-position'] || ann.attributes['grid-pos'] ||
                           ann.attributes['column'] || ann.attributes['col'];
                if (pos !== undefined) {
                    const posNum = parseInt(String(pos), 10);
                    return isNaN(posNum) ? undefined : posNum;
                }
            } else if (ann.value) {
                const styleAttrs = ann.value.split(';').map((s: string) => s.trim()).filter((s: string) => s);
                for (const attr of styleAttrs) {
                    const [key, ...valueParts] = attr.split(':');
                    const normalizedKey = key.trim().toLowerCase();
                    if (normalizedKey === 'grid-position' || normalizedKey === 'grid-pos' ||
                        normalizedKey === 'column' || normalizedKey === 'col') {
                        const posNum = parseInt(valueParts.join(':').trim(), 10);
                        return isNaN(posNum) ? undefined : posNum;
                    }
                }
            }
        }
    }

    // Check style attribute
    const styleAttr = node.attributes?.find((a: any) => a.name === 'style');
    if (styleAttr && styleAttr.value && typeof styleAttr.value === 'object') {
        const pos = styleAttr.value['grid-position'] || styleAttr.value['grid-pos'] ||
                   styleAttr.value['column'] || styleAttr.value['col'];
        if (pos !== undefined) {
            const posNum = parseInt(String(pos), 10);
            return isNaN(posNum) ? undefined : posNum;
        }
    }

    return undefined;
}

/**
 * Generate grid layout infrastructure with invisible rail nodes and edges
 * The grid adapts to the specified direction (or defaults to parent):
 * - TB/BT: grid positions become columns (vertical stacks)
 * - LR/RL: grid positions become rows (horizontal stacks)
 *
 * @param nodes - Nodes to organize in the grid
 * @param gridSize - Number of grid positions
 * @param prefix - Prefix for rail node names
 * @param direction - Optional direction override (LR, RL, TB, BT)
 */
function generateGridLayout(nodes: any[], gridSize: number, prefix: string = '', direction?: string, debug: boolean = false): string {
    const lines: string[] = [];

    // Note: The direction parameter affects how grid positions are interpreted:
    // - TB/BT or undefined: grid positions become columns (vertical stacks)
    // - LR/RL: grid positions become rows (horizontal stacks)
    //
    // While Graphviz rankdir can only be set at the root graph level, we can use the
    // cluster-local direction to inform our rail/ranking strategy within subgraphs.
    // This enables cluster-level control of layout orientation through grid positioning.

    // Generate invisible rail nodes for each grid position
    const railNodes: string[] = [];
    for (let i = 1; i <= gridSize; i++) {
        const railName = `${prefix}__grid_rail_${i}`;
        railNodes.push(railName);
        lines.push(`  "${railName}" [shape=point, width=0, height=0, label="", style=${debug ? 'filled' : 'invis'}, fixedsize=true];`);
    }

    // Create invisible edges to enforce grid position ordering
    if (railNodes.length > 1) {
        for (let i = 0; i < railNodes.length - 1; i++) {
            lines.push(`  "${railNodes[i]}" -> "${railNodes[i + 1]}" [style=${debug ? 'filled' : 'invis'}];`);
        }
    }

    // Assign nodes to grid positions
    const nodesByPosition = new Map<number, string[]>();
    const nodesWithoutPosition: string[] = [];

    // First pass: collect nodes with explicit grid position assignments
    for (const node of nodes) {
        const pos = extractNodeGridPosition(node);
        if (pos !== undefined && pos >= 1 && pos <= gridSize) {
            if (!nodesByPosition.has(pos)) {
                nodesByPosition.set(pos, []);
            }
            nodesByPosition.get(pos)!.push(node.name);
        } else if (pos === undefined) {
            nodesWithoutPosition.push(node.name);
        }
    }

    // Auto-distribute nodes without explicit grid position assignment
    if (nodesWithoutPosition.length > 0) {
        let currentPos = 1;
        for (const nodeName of nodesWithoutPosition) {
            if (!nodesByPosition.has(currentPos)) {
                nodesByPosition.set(currentPos, []);
            }
            nodesByPosition.get(currentPos)!.push(nodeName);
            currentPos = (currentPos % gridSize) + 1;
        }
    }

    // Generate invisible edges from rail nodes to assigned nodes
    for (let pos = 1; pos <= gridSize; pos++) {
        const posNodes = nodesByPosition.get(pos);
        if (posNodes && posNodes.length > 0) {
            const railName = `${prefix}__grid_rail_${pos}`;
            lines.push(`  // Grid position ${pos}`);
            // Create rank group for this grid position
            const nodesList = [railName, ...posNodes].map(n => buildEndpointIdentifier(n)).join('; ');
            lines.push(`  { rank=same; ${nodesList}; }`);
        }
    }

    return lines.join('\n');
}

/**
 * Helper function to escape DOT special characters
 */
function escapeDot(text: string): string {
    if (!text) return '';
    // Escape backslashes, quotes, newlines, and record delimiters for DOT labels
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\|/g, '\\|');
}

/**
 * Helper function to escape text for HTML-like labels in Graphviz
 */
function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Process Markdown text and convert to HTML suitable for Graphviz HTML-like labels
 * Uses marked.js custom renderer to properly handle all markdown elements
 * within Graphviz's HTML subset constraints
 *
 * Supported Graphviz tags: <B>, <I>, <U>, <O>, <S>, <SUB>, <SUP>, <BR/>, <FONT>, <TABLE>
 */
function processMarkdown(text: string): string {
    if (!text) return '';

    // Check if the text contains Markdown syntax
    const hasMarkdown = /[*_`#\[\]~]/g.test(text);

    // If no Markdown syntax detected, just escape HTML
    if (!hasMarkdown) {
        return escapeHtml(text);
    }

    try {
        // Create custom renderer for Graphviz HTML subset
        const renderer = {
            // Bold text: **text** or __text__
            strong(token: any): string {
                const text = typeof token === 'string' ? token : token.text;
                return `<b>${text}</b>`;
            },

            // Italic text: *text* or _text_
            em(token: any): string {
                const text = typeof token === 'string' ? token : token.text;
                return `<i>${text}</i>`;
            },

            // Strikethrough: ~~text~~
            del(token: any): string {
                const text = typeof token === 'string' ? token : token.text;
                return `<s>${text}</s>`;
            },

            // Inline code: `code`
            // Use monospace font with light gray background color simulation
            codespan(token: any): string {
                const code = typeof token === 'string' ? token : token.text;
                const escaped = escapeHtml(code);
                return `<font face="monospace" color="#6C757D">${escaped}</font>`;
            },

            // Links: [text](url)
            // Show as underlined text (can't make clickable in labels, but preserve text)
            link(token: any): string {
                const text = typeof token === 'string' ? token : token.text;
                return `<u>${text}</u>`;
            },

            // Line breaks
            br(): string {
                return '<br/>';
            },

            // Images: ![alt](src)
            // Can't embed images in labels, just show alt text
            image(token: any): string {
                const text = typeof token === 'string' ? token : token.text;
                return escapeHtml(text || '[image]');
            },

            // Text nodes (escape HTML entities)
            text(token: any): string {
                const text = typeof token === 'string' ? token : token.text;
                return escapeHtml(text);
            },

            // Paragraphs (should not appear in inline parsing, but handle gracefully)
            paragraph(token: any): string {
                const text = typeof token === 'string' ? token : token.text;
                return text;
            },

            // HTML tags (strip for safety)
            html(token: any): string {
                return '';
            }
        };

        // Configure marked with custom renderer
        marked.use({
            renderer,
            breaks: true,
            gfm: true,
        });

        // Parse Markdown to HTML using custom renderer
        const html = marked.parseInline(text) as string;

        return html;
    } catch (error) {
        // If Markdown processing fails, fall back to HTML escaping
        console.warn('Failed to process Markdown:', error);
        return escapeHtml(text);
    }
}

const EDGE_METADATA_KEYS = new Set([
    'sourceAttribute',
    'targetAttribute',
    'sourcePort',
    'targetPort',
    'sourceHandle',
    'targetHandle',
]);

type AttributeColumn = 'key' | 'value';

interface AttributePortEntry {
    attr: any;
    base: string;
    occurrence: number;
    keyPort: string;
    valuePort: string;
}

function sanitizePortId(raw: string): string {
    if (!raw) {
        return '';
    }

    return raw
        .replace(/^["']|["']$/g, '')
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function buildAttributePortName(base: string, column: AttributeColumn, occurrence: number): string {
    const suffix = column === 'key' ? 'key' : 'value';
    const occurrenceSuffix = occurrence > 0 ? `_${occurrence}` : '';
    return `${base || 'attribute'}__${suffix}${occurrenceSuffix}`;
}

function normalizeHandleValue(value: any): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const str = typeof value === 'string' ? value : String(value);
    return str.replace(/^["']|["']$/g, '').trim();
}

function computeAttributePortEntries(attributes: any[]): AttributePortEntry[] {
    const occurrences = new Map<string, number>();
    return attributes.map((attr, index) => {
        let base = sanitizePortId(attr?.name ?? '') || `attribute_${index}`;
        const occurrence = occurrences.get(base) ?? 0;
        occurrences.set(base, occurrence + 1);

        return {
            attr,
            base,
            occurrence,
            keyPort: buildAttributePortName(base, 'key', occurrence),
            valuePort: buildAttributePortName(base, 'value', occurrence),
        };
    });
}

function findAttributePort(attributes: any[], attributeName: string, column: AttributeColumn): string | undefined {
    if (!attributeName) {
        return undefined;
    }

    const candidates = new Set<string>();
    const cleanedName = attributeName.replace(/^["']|["']$/g, '').trim();
    if (cleanedName) {
        candidates.add(cleanedName);
        candidates.add(sanitizePortId(cleanedName));

        const dotIndex = cleanedName.indexOf('.');
        if (dotIndex > 0) {
            const prefix = cleanedName.substring(0, dotIndex);
            if (prefix) {
                candidates.add(prefix);
                candidates.add(sanitizePortId(prefix));
            }
        }
    }

    const entries = computeAttributePortEntries(attributes);

    for (const entry of entries) {
        const attrName = entry.attr?.name ?? '';
        const sanitizedName = sanitizePortId(attrName);

        if (candidates.has(attrName) || candidates.has(sanitizedName)) {
            return column === 'key' ? entry.keyPort : entry.valuePort;
        }
    }

    return undefined;
}

function buildEndpointIdentifier(nodeName: string, port?: string): string {
    // Ensure nodeName is a string
    const nameStr = typeof nodeName === 'string' ? nodeName : String(nodeName);
    const escapedNode = nameStr.replace(/"/g, '\\"');
    if (port) {
        return `"${escapedNode}":"${port}"`;
    }
    return `"${escapedNode}"`;
}

/**
 * Check if a string is valid JSON
 */
function isJsonString(str: string): boolean {
    if (typeof str !== 'string') return false;
    
    // Quick check for JSON-like structure
    const trimmed = str.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
        return false;
    }
    
    try {
        const parsed = JSON.parse(str);
        return typeof parsed === 'object';
    } catch {
        return false;
    }
}

/**
 * Format attribute value for display in graphviz labels
 * Properly handles nested objects, arrays, JSON strings, and multiline strings
 */
function formatAttributeValueForDisplay(value: any): string {
    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/^["']|["']$/g, '');
        
        // Check if it's a JSON string and format it
        if (isJsonString(cleaned)) {
            try {
                const parsed = JSON.parse(cleaned);
                return JSON.stringify(parsed, null, 2);
            } catch {
                // If parsing fails, return as-is
                return cleaned;
            }
        }
        
        // Return the cleaned string (multiline strings will be handled by breakLongText with preserveLineBreaks)
        return cleaned;
    }

    if (typeof value === 'boolean' || typeof value === 'number') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return JSON.stringify(value, null, 2);
    }

    if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
    }

    return String(value);
}

/**
 * Get node shape based on type and annotations
 */
function getNodeShape(node: any, edges?: any[]): string {
    const nodeType = NodeTypeChecker.getNodeType(node, edges);

    // Check for annotations
    const annotations = node.annotations || [];
    const hasAbstract = annotations.some((a: any) => a.name === 'Abstract');

    // Map node types to shapes
    const shapeMap: Record<string, string> = {
        init: 'ellipse',       // Start/entry points
        end: 'ellipse',        // End/exit points
        task: 'box',           // Tasks/actions
        state: 'diamond',      // State nodes
        context: 'folder',     // Context/data storage
        tool: 'component',     // Tool/utility nodes
    };

    // Abstract nodes use octagon
    if (hasAbstract) {
        return 'egg';
    }

    // Handle undefined type (untyped nodes) - use plain box
    if (!nodeType) {
        return 'box';
    }

    return shapeMap[nodeType] || 'box';
}

/**
 * Generate node attributes for styling based on type and annotations
 * Also applies custom styles from style nodes and validation warnings if applicable
 */
function getNodeStyle(node: any, edges?: any[], styleNodes?: any[], validationContext?: ValidationContext): string {
    const nodeType = NodeTypeChecker.getNodeType(node, edges);
    const annotations = node.annotations || [];

    // Check for special annotations
    const hasDeprecated = annotations.some((a: any) => a.name === 'Deprecated');
    const hasCritical = annotations.some((a: any) => a.name === 'Critical');
    const hasSingleton = annotations.some((a: any) => a.name === 'Singleton');
    const hasAbstract = annotations.some((a: any) => a.name === 'Abstract');

    if (!nodeType && annotations.length === 0) {
        return 'fillcolor="#FFFFFF", style=filled, color="#000000"';
    }

    const styles: Record<string, string> = {
        task: 'fillcolor="#E3F2FD", style=filled, color="#1976D2"',
        state: 'fillcolor="#F3E5F5", style=filled, color="#7B1FA2"',
        context: 'fillcolor="#E8F5E9", style=filled, color="#388E3C"',
        tool: 'fillcolor="#FFF9C4", style=filled, color="#F57F17"',
        init: 'fillcolor="#FFF3E0", style=filled, color="#F57C00"',
    };

    let baseStyle = (nodeType && styles[nodeType]) || 'fillcolor="#FFFFFF", style=filled, color="#000000"';

    // Modify style based on annotations
    if (hasDeprecated) {
        // Deprecated: use dashed border and gray out
        baseStyle = baseStyle.replace('style=filled', 'style="filled,dashed"');
        baseStyle += ', fontcolor="#999999"';
    }

    if (hasCritical) {
        // Critical: use bold border and red accent
        // baseStyle = baseStyle.replace(/color="[^"]*"/, 'color="#ffadad"');
        baseStyle += ', penwidth=3';
    }

    if (hasSingleton) {
        // Singleton: use double border
        baseStyle += ', peripheries=2';
    }

    if (hasAbstract) {
        // Abstract: use dashed style if not already set
        if (!baseStyle.includes('dashed')) {
            baseStyle = baseStyle.replace('style=filled', 'style="filled,dashed"');
        }
    }

    baseStyle = appendStyleAttributes(baseStyle, node.style);

    // Apply custom styles from style nodes
    if (styleNodes && styleNodes.length > 0) {
        baseStyle = applyCustomStyles(node, styleNodes, baseStyle);
    }

    // Add validation warning styling if validation context is provided
    // This is applied last to ensure warnings are visible
    if (validationContext) {
        const nodeFlag = validationContext.getNodeFlag(node.name);
        if (nodeFlag && nodeFlag.errors.length > 0) {
            // Find the highest severity error
            const maxSeverity = getMaxSeverity(nodeFlag.errors);

            switch (maxSeverity) {
                case ValidationSeverity.ERROR:
                    // Red bold border for errors
                    baseStyle += ', penwidth=3, color="#D32F2F"';
                    break;
                case ValidationSeverity.WARNING:
                    // Orange border for warnings
                    baseStyle += ', penwidth=2, color="#FFA726"';
                    break;
                case ValidationSeverity.INFO:
                    // Blue dashed border for info
                    baseStyle += ', penwidth=2, color="#42A5F5"';
                    if (!baseStyle.includes('dashed')) {
                        baseStyle = baseStyle.replace('style=filled', 'style="filled,dashed"');
                    }
                    break;
                case ValidationSeverity.HINT:
                    // Light gray dashed border for hints
                    baseStyle += ', penwidth=1, color="#9E9E9E"';
                    if (!baseStyle.includes('dashed')) {
                        baseStyle = baseStyle.replace('style=filled', 'style="filled,dashed"');
                    }
                    break;
            }
        }
    }

    return baseStyle;
}

/**
 * Get the maximum (most severe) severity from a list of validation errors
 */
function getMaxSeverity(errors: any[]): ValidationSeverity {
    const severityOrder = [
        ValidationSeverity.ERROR,
        ValidationSeverity.WARNING,
        ValidationSeverity.INFO,
        ValidationSeverity.HINT
    ];

    for (const severity of severityOrder) {
        if (errors.some(e => e.severity === severity)) {
            return severity;
        }
    }

    return ValidationSeverity.HINT;
}

/**
 * Get icon for warning severity
 */
function getWarningIcon(severity: ValidationSeverity): string {
    switch (severity) {
        case ValidationSeverity.ERROR:
            return '🔴';
        case ValidationSeverity.WARNING:
            return '⚠️';
        case ValidationSeverity.INFO:
            return 'ℹ️';
        case ValidationSeverity.HINT:
            return '💡';
        default:
            return '⚠️';
    }
}

/**
 * Apply custom styles from style nodes based on annotation matching
 */
function applyCustomStyles(node: any, styleNodes: any[], baseStyle: string): string {
    let finalStyle = baseStyle;
    const nodeAnnotations = node.annotations || [];

    // Find matching style nodes
    for (const styleNode of styleNodes) {
        const styleAnnotations = styleNode.annotations || [];

        // Check if any of the node's annotations match the style node's selector annotation
        const hasMatchingAnnotation = styleAnnotations.some((styleAnnotation: any) =>
            nodeAnnotations.some((nodeAnn: any) => nodeAnn.name === styleAnnotation.name)
        );

        if (!hasMatchingAnnotation) {
            continue;
        }

        if (styleNode.style) {
            finalStyle = appendStyleAttributes(finalStyle, styleNode.style);
            continue;
        }

        if (styleNode.attributes) {
            const inlineStyle: Record<string, unknown> = {};
            for (const attr of styleNode.attributes) {
                let attrValue = attr.value;
                if (typeof attrValue === 'string') {
                    attrValue = attrValue.replace(/^["']|["']$/g, '');
                }
                inlineStyle[attr.name] = attrValue;
            }
            finalStyle = appendStyleAttributes(finalStyle, inlineStyle);
        }
    }

    return finalStyle;
}

/**
 * Generate HTML label for machine root showing title, description, version, and attributes
 */
function generateMachineLabel(machineJson: MachineJSON, options: DiagramOptions, wrappingConfig: TextWrappingConfig): string {
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // Title (bold, larger font)
    const title = options.title || machineJson.title || '';
    if (title) htmlLabel += '<tr><td align="center"><font point-size="12"><b>' + processMarkdown(title) + '</b></font></td></tr>';

    // Version (if present in attributes)
    const versionAttr = machineJson.attributes?.find(a => a.name === 'version');
    if (versionAttr || (machineJson.annotations && machineJson.annotations.length > 0)) {
        let versionValue = '';
        if (versionAttr?.value !== undefined) {
            versionValue = typeof versionAttr.value === 'string'
                ? versionAttr.value.replace(/^["']|["']$/g, '')
                : String(versionAttr.value);
        }
        // Annotations (if present)
        const annText = machineJson.annotations?.filter( ann => ann.name !== 'style').map(ann =>
            ann.value ? '@' + ann.name + '("' + ann.value + '")' : '@' + ann.name
        ).join(' ');
        const content = `${versionAttr ? ("v" + escapeHtml(versionValue)) : '' } ${ escapeHtml(annText || "")}`.trim()
        htmlLabel += content ? `<tr><td align="center"><font point-size="10">${content}</font></td></tr>` : '';
    }

    // Description (if present in attributes)
    const descAttr = machineJson.attributes?.find(a => a.name === 'description' || a.name === 'desc');
    if (descAttr) {
        let descValue = typeof descAttr.value === 'string'
            ? descAttr.value.replace(/^["']|["']$/g, '')
            : String(descAttr.value);
        // Interpolate templates if runtime context is available
        descValue = interpolateValue(descValue, options.runtimeContext, machineJson);
        htmlLabel += '<tr><td align="center"><font point-size="10"><i>' + processMarkdown(descValue) + '</i></font></td></tr>';
    }

    // Attributes table (excluding description and version which are shown above)
    const displayAttrs = machineJson.attributes?.filter(a =>
        a.name !== 'description' && a.name !== 'desc' && a.name !== 'version'
    ) || [];

    if (displayAttrs.length > 0) {
        htmlLabel += '<tr><td>';
        // Use shared generateAttributesTable function for consistency
        htmlLabel += generateAttributesTable(displayAttrs, options.runtimeContext);
        htmlLabel += '</td></tr>';
    }

    htmlLabel += '</table>';
    return htmlLabel;
}

/**
 * Text wrapping configuration with defaults
 */
interface TextWrappingConfig {
    maxEdgeLabelLength: number;
    maxMultiplicityLength: number;
    maxAttributeKeyLength: number;
    maxAttributeValueLength: number;
    maxNodeTitleLength: number;
    maxNodeDescLength: number;
    maxNodePromptLength: number;
    maxNoteContentLength: number;
}

/**
 * Get text wrapping configuration from machine attributes or use defaults
 */
function getTextWrappingConfig(machineJson: MachineJSON): TextWrappingConfig {
    const attrs = machineJson.attributes || [];
    const styleConfig = machineJson.style || {};

    const getAttrValue = (name: string, defaultValue: number): number => {
        const styleValue = styleConfig[name];
        if (styleValue !== undefined) {
            const numeric = typeof styleValue === 'number'
                ? styleValue
                : Number(String(styleValue));
            if (!isNaN(numeric)) {
                return numeric;
            }
        }

        const attr = attrs.find(a => a.name === name);
        if (attr?.value !== undefined) {
            const rawValue = typeof attr.value === 'string'
                ? attr.value.replace(/^["']|["']$/g, '')
                : attr.value;
            const numeric = typeof rawValue === 'number'
                ? rawValue
                : Number(rawValue);
            return isNaN(numeric) ? defaultValue : numeric;
        }
        return defaultValue;
    };

    return {
        maxEdgeLabelLength: getAttrValue('maxEdgeLabelLength', 40),
        maxMultiplicityLength: getAttrValue('maxMultiplicityLength', 20),
        maxAttributeKeyLength: getAttrValue('maxAttributeKeyLength', 25),
        maxAttributeValueLength: getAttrValue('maxAttributeValueLength', 30),
        maxNodeTitleLength: getAttrValue('maxNodeTitleLength', 40),
        maxNodeDescLength: getAttrValue('maxNodeDescLength', 60),
        maxNodePromptLength: getAttrValue('maxNodePromptLength', 100),
        maxNoteContentLength: getAttrValue('maxNoteContentLength', 40),
    };
}

// @rank annotation support removed in favor of column layout system

/**
 * Generate a DOT diagram from MachineJSON with optional runtime state
 *
 * This unified function generates both static and runtime diagrams based on whether
 * a runtime context is provided. Runtime information is rendered as decorations
 * on top of the base static visualization.
 *
 * @param machineJson - Machine definition in JSON format
 * @param options - Generation options (can include runtimeContext)
 * @returns DOT diagram as a string
 */
export function generateDotDiagram(machineJson: MachineJSON, options: DiagramOptions = {}): string {
    const lines: string[] = [];
    const runtimeContext = options.runtimeContext;

    // Get text wrapping configuration from machine attributes
    const wrappingConfig = getTextWrappingConfig(machineJson);

    // Separate style nodes from renderable nodes
    const styleNodes = machineJson.nodes.filter(n => NodeTypeChecker.isStyleNode(n));
    const renderableNodes = machineJson.nodes.filter(n => !NodeTypeChecker.isStyleNode(n) && (n.type?.toLowerCase() !== 'note'));
    const noteNodes = machineJson.nodes.filter(n => n.type?.toLowerCase() === 'note');

    const notesByParent = buildNotesByParent(noteNodes);

    // Build runtime node and edge states if context provided
    const nodeStates = runtimeContext ? buildNodeStates(machineJson, runtimeContext) : undefined;
    const edgeStates = runtimeContext ? buildEdgeStates(machineJson, runtimeContext) : undefined;

    // Header
    lines.push('digraph {');
    lines.push('  // Graph attributes');

    // Generate machine label with title, description, version, and attributes
    const machineLabel = generateMachineLabel(machineJson, options, wrappingConfig);
    lines.push('  label=<' + machineLabel + '>;');
    lines.push('  labelloc="t";');
    lines.push('  fontsize=10;');
    lines.push('  fontname="Arial";');
    lines.push('  compound=true;');
    lines.push('  rankdir=TB;');
    lines.push('  pad=0.25;');

    const skipGraphStyleKeys = new Set([
        'grid',
        'grid-position',
        'grid-pos',
        'columns',
        'cols',
        'col',
        'column',
        'maxedgelabellength',
        'maxmultiplicitylength',
        'maxattributekeylength',
        'maxattributevaluelength',
        'maxnodetitlelength',
        'maxnotecontentlength'
    ]);

    if (machineJson.style) {
        Object.entries(machineJson.style).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return;
            }

            const normalizedKey = key.trim().toLowerCase();
            if (skipGraphStyleKeys.has(normalizedKey)) {
                return;
            }

            let graphvizKey = mapCssPropertyToGraphviz(key.trim());
            let graphvizValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

            if (graphvizKey === 'rankdir' || normalizedKey === 'direction') {
                graphvizValue = normalizeDirectionValue(graphvizValue);
            }

            lines.push(`  ${graphvizKey}="${graphvizValue}";`);
        });
    } else if (machineJson.annotations) {
        machineJson.annotations.forEach((ann: any) => {
            if (ann.name !== 'style') {
                return;
            }

            if (ann.attributes) {
                Object.keys(ann.attributes).forEach(key => {
                    const normalizedKey = key.trim().toLowerCase();
                    if (skipGraphStyleKeys.has(normalizedKey)) {
                        return;
                    }

                    let value = ann.attributes[key];
                    const graphvizKey = mapCssPropertyToGraphviz(key.trim());
                    if (graphvizKey === 'rankdir' || normalizedKey === 'direction') {
                        value = normalizeDirectionValue(String(value));
                    }
                    lines.push(`  ${graphvizKey}="${value}";`);
                });
            } else if (ann.value) {
                const styleAttrs = ann.value.split(';').map((s: string) => s.trim()).filter((s: string) => s);
                styleAttrs.forEach((attr: string) => {
                    const [rawKey, ...valueParts] = attr.split(':');
                    if (!rawKey || valueParts.length === 0) {
                        return;
                    }
                    const normalizedKey = rawKey.trim().toLowerCase();
                    if (skipGraphStyleKeys.has(normalizedKey)) {
                        return;
                    }

                    let value = valueParts.join(':').trim();
                    const graphvizKey = mapCssPropertyToGraphviz(rawKey.trim());
                    if (graphvizKey === 'rankdir' || normalizedKey === 'direction') {
                        value = normalizeDirectionValue(value);
                    }
                    lines.push(`  ${graphvizKey}="${value}";`);
                });
            }
        });
    }

    lines.push('  node [fontname="Arial", fontsize=10];');  // Removed default shape=record to allow per-node shapes
    lines.push('  edge [fontname="Arial", fontsize=9];');
    lines.push('');

    // Build semantic hierarchy based on parent-child relationships (using only renderable nodes)
    const hierarchy = buildSemanticHierarchy(renderableNodes);
    const clusterTargets = new Map<string, string>();
    renderableNodes.forEach(node => {
        const entry = hierarchy[node.name];
        if (entry && entry.children.length > 0) {
            clusterTargets.set(node.name, getClusterAnchorName(node.name));
        }
    });
    const rootNodes = getRootNodes(renderableNodes);

    // Extract validation context from options
    const validationContext = options.validationContext as ValidationContext | undefined;

    // Generate nodes organized by semantic/lexical nesting
    lines.push('  // Node definitions with nested namespaces');
    lines.push(generateSemanticHierarchy(
        hierarchy,
        rootNodes,
        machineJson,
        1,
        styleNodes,
        validationContext,
        options,
        wrappingConfig,
        notesByParent,
        clusterTargets,
        nodeStates
    ));
    lines.push('');

    const rootNotes = notesByParent.get(ROOT_NOTE_PARENT);
    if (rootNotes && rootNotes.length > 0) {
        lines.push('  // Root-level notes');
        rootNotes.forEach(noteInfo => {
            const noteLines = generateNoteDefinition(noteInfo, '  ', wrappingConfig, clusterTargets);
            noteLines.forEach(line => lines.push(line));
        });
        lines.push('');
    }

    // Check for grid layout at machine level
    const machineGridSize = extractGridSize(machineJson);
    if (machineGridSize && machineGridSize > 0) {
        lines.push('  // Grid layout');
        const machineDirection = extractDirection(machineJson);
        lines.push(generateGridLayout(rootNodes, machineGridSize, 'root', machineDirection, isVisualDebug(machineJson)));
        lines.push('');
    }

    // Generate edges
    if (machineJson.edges && machineJson.edges.length > 0) {
        lines.push('  // Edges');
        lines.push(generateEdges(machineJson, styleNodes, wrappingConfig, options, edgeStates));
    }

    // Generate notes as edge labels
    // Note nodes are rendered alongside their targets within the semantic hierarchy

    // Generate validation warning notes if enabled
    const showNotes = options.warningMode === 'notes' || options.warningMode === 'both';
    if (validationContext && showNotes && options.showValidationWarnings !== false) {
        const warningNotesContent = generateWarningNotes(validationContext, options);
        if (warningNotesContent) {
            lines.push('');
            lines.push('  // Validation Warnings');
            lines.push(warningNotesContent);
        }
    }

    // Generate inferred dependencies
    if (machineJson.inferredDependencies && machineJson.inferredDependencies.length > 0) {
        lines.push('');
        lines.push('  // Inferred Dependencies');
        lines.push(generateInferredDependencies(machineJson.inferredDependencies));
    }

    // Add execution path information as comments when runtime context is provided
    if (runtimeContext && options.showExecutionPath !== false && runtimeContext.history.length > 0) {
        lines.push('');
        lines.push('  // Execution Path:');
        runtimeContext.history.forEach((step, idx) => {
            const timestamp = new Date(step.timestamp).toLocaleTimeString();
            lines.push(`  // ${idx + 1}. ${step.from} → ${step.to} (${step.transition}) at ${timestamp}`);
            if (step.output) {
                const truncatedOutput = step.output.length > 50
                    ? step.output.substring(0, 50) + '...'
                    : step.output;
                lines.push(`  //    Output: ${truncatedOutput}`);
            }
        });
    }

    lines.push('}');

    return lines.join('\n');
}

/**
 * Generate a runtime DOT diagram with execution state
 *
 * @deprecated Use generateDotDiagram with runtimeContext in options instead
 * This function is maintained for backward compatibility and delegates to the unified generator
 */
export function generateRuntimeDotDiagram(
    machineJson: MachineJSON,
    context: RuntimeContext,
    options: DiagramOptions = {}
): string {
    // Delegate to unified generator with runtime context
    return generateDotDiagram(machineJson, {
        ...options,
        runtimeContext: context,
        showRuntimeState: options.showRuntimeState !== false,
        showVisitCounts: options.showVisitCounts !== false,
        showExecutionPath: options.showExecutionPath !== false,
        showRuntimeValues: options.showRuntimeValues !== false
    });
}


/**
 * Build semantic hierarchy based on parent-child relationships
 */
type NoteRenderInfo = {
    note: any;
    dotId: string;
};

const ROOT_NOTE_PARENT = Symbol('root-note-parent');

type NotesByParentMap = Map<string | symbol, NoteRenderInfo[]>;

function buildNotesByParent(noteNodes: any[]): NotesByParentMap {
    const notesByParent: NotesByParentMap = new Map();
    const counters = new Map<string, number>();

    noteNodes.forEach(note => {
        const target = note.name;
        if (!target) {
            return;
        }

        const parentKey: string | symbol = note.parent ?? ROOT_NOTE_PARENT;
        const sanitizedTarget = sanitizeForDotId(String(target));
        const currentCount = counters.get(target) ?? 0;
        counters.set(target, currentCount + 1);

        const dotId = `note_${sanitizedTarget}_${currentCount}`;
        const entry: NoteRenderInfo = { note, dotId };
        const existing = notesByParent.get(parentKey);
        if (existing) {
            existing.push(entry);
        } else {
            notesByParent.set(parentKey, [entry]);
        }
    });

    return notesByParent;
}

function buildSemanticHierarchy(nodes: any[]): SemanticHierarchy {
    const hierarchy: SemanticHierarchy = {};

    nodes.forEach(node => {
        hierarchy[node.name] = {
            node: node,
            children: []
        };
    });

    nodes.forEach(node => {
        if (node.parent && hierarchy[node.parent]) {
            hierarchy[node.parent].children.push(node.name);
        }
    });

    return hierarchy;
}

/**
 * Get root nodes (nodes without parents)
 */
function getRootNodes(nodes: any[]): any[] {
    return nodes.filter(node => !node.parent);
}

/**
 * Generate HTML table for attributes
 * Shared function used by both nodes and notes to ensure consistent rendering
 */
function getNodeDisplayAttributes(node: any): any[] {
    return node.attributes?.filter((a: any) =>
        a.name !== 'desc' && a.name !== 'prompt' && a.name !== 'style'
    ) || [];
}

function getNamespaceDisplayAttributes(node: any): any[] {
    return node.attributes?.filter((a: any) =>
        a.name !== 'description' && a.name !== 'desc' && a.name !== 'prompt' && a.name !== 'style'
    ) || [];
}

function getNoteDisplayAttributes(note: any): any[] {
    return note.attributes?.filter((a: any) =>
        a.name !== 'target' && a.name !== 'desc' && a.name !== 'prompt' && a.name !== 'style'
    ) || [];
}

function generateAttributesTable(attributes: any[], runtimeContext?: RuntimeContext, wrappingConfig?: TextWrappingConfig): string {
    if (!attributes || attributes.length === 0) {
        return '';
    }

    let html = '<table border="0" cellborder="1" cellspacing="0" cellpadding="2" align="left">';
    const entries = computeAttributePortEntries(attributes);

    entries.forEach(({ attr, keyPort, valuePort }) => {
        let displayValue = attr.value?.value ?? attr.value;
        // Use formatAttributeValueForDisplay to properly handle nested objects and arrays
        displayValue = formatAttributeValueForDisplay(displayValue);

        // Interpolate templates if runtime context is available
        if (typeof displayValue === 'string' && runtimeContext) {
            displayValue = interpolateValue(displayValue, runtimeContext);
        }

        // Use wrappingConfig values or defaults
        const maxValueLength = wrappingConfig?.maxAttributeValueLength ?? 30;
        const maxKeyLength = wrappingConfig?.maxAttributeKeyLength ?? 25;

        // Break long values into multiple lines - process Markdown BEFORE joining with <br/>
        // Preserve existing line breaks for multiline strings and formatted JSON
        if (typeof displayValue === 'string') {
            const lines = breakLongText(displayValue, maxValueLength, { preserveLineBreaks: true });
            displayValue = lines.map(line => processMarkdown(line)).join('<BR/>');
        } else {
            displayValue = escapeHtml(String(displayValue));
        }

        // Break long attribute names into multiple lines - process Markdown BEFORE joining with <BR/>
        let attrName = attr.name;
        if (attrName && attrName.length > maxKeyLength) {
            const lines = breakLongText(attrName, maxKeyLength);
            attrName = lines.map(line => processMarkdown(line)).join('<BR/>');
        } else {
            attrName = processMarkdown(attrName);
        }

        const typeStr = attr.type ? ' : ' + escapeHtml(attr.type) : '';
        html += '<tr>';
        html += `<td port="${keyPort}" align="left" balign="left">${attrName}${typeStr}</td>`;
        html += `<td port="${valuePort}" align="left" balign="left">${displayValue}</td>`;
        html += '</tr>';
    });
    html += '</table>';
    return html;
}

/**
 * Generate HTML label for cluster showing title, description, and annotations
 * This is used as the cluster's native label positioned above the cluster
 */
function generateClusterLabel(node: any, runtimeContext?: RuntimeContext, wrappingConfig?: TextWrappingConfig): string {
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="2">';

    // First row: ID (bold), Type (italic), Annotations (italic)
    let firstRow = '<b>' + escapeHtml(node.name) + '</b>';

    if (node.type) {
        firstRow += ' <i>&lt;' + escapeHtml(node.type) + '&gt;</i>';
    }

    // Annotations (excluding @note and @style)
    // @style is applied visually, @note is displayed separately
    if (node.annotations && node.annotations.length > 0) {
        const displayAnnotations = node.annotations.filter((ann: any) =>
            ann.name !== 'note' && ann.name !== 'style'
        );
        if (displayAnnotations.length > 0) {
            firstRow += ' <i>';
            displayAnnotations.forEach((ann: any, idx: number) => {
                if (idx > 0) firstRow += ' ';
                if (ann.value) {
                    firstRow += '@' + escapeHtml(ann.name) + '("' + escapeHtml(ann.value) + '")';
                } else {
                    firstRow += '@' + escapeHtml(ann.name);
                }
            });
            firstRow += '</i>';
        }
    }

    htmlLabel += '<tr><td align="center">' + firstRow + '</td></tr>';

    // Description (if present)
    const descAttr = node.attributes?.find((a: any) => a.name === 'description' || a.name === 'desc' || a.name === 'prompt');
    if (node.title || descAttr) {
        const titleText = node.title ? String(node.title).replace(/^"|"$/g, '') : '';
        let descValue = descAttr?.value;
        if (typeof descValue === 'string') {
            descValue = descValue.replace(/^["']|["']$/g, '');
            // Interpolate templates if runtime context is available
            descValue = interpolateValue(descValue, runtimeContext);
        }
        
        let secondRow = '';
        if (titleText && titleText !== node.name) {
            const maxTitleLength = wrappingConfig?.maxNodeTitleLength ?? 40;
            const titleLines = breakLongText(titleText, maxTitleLength);
            secondRow += '<b>' + titleLines.map(line => processMarkdown(line)).join('<br/>') + '</b>';
        }
        if (descValue) {
            if (secondRow) secondRow += ' — ';
            const maxDescLength = wrappingConfig?.maxNodeDescLength ?? 60;
            const descLines = breakLongText(String(descValue), maxDescLength);
            secondRow += '<i>' + descLines.map(line => processMarkdown(line)).join('<br/>') + '</i>';
        }
        
        if (secondRow) {
            htmlLabel += '<tr><td align="center">' + secondRow + '</td></tr>';
        }
    }

    htmlLabel += '</table>';
    return htmlLabel;
}

/**
 * Generate HTML label for namespace (parent node) showing id, type, annotations, title, description, and attributes
 */
function generateNamespaceLabel(node: any, runtimeContext?: RuntimeContext, wrappingConfig?: TextWrappingConfig): string {
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // First row: ID (bold), Type (italic), Annotations (italic)
    let firstRow = '<b>' + escapeHtml(node.name) + '</b>';

    if (node.type) {
        firstRow += ' <i>&lt;' + escapeHtml(node.type) + '&gt;</i>';
    }

    // Annotations (excluding @note and @style)
    // @style is applied visually, @note is displayed separately
    if (node.annotations && node.annotations.length > 0) {
        const displayAnnotations = node.annotations.filter((ann: any) =>
            ann.name !== 'note' && ann.name !== 'style'
        );
        if (displayAnnotations.length > 0) {
            firstRow += ' <i>';
            displayAnnotations.forEach((ann: any, idx: number) => {
                if (idx > 0) firstRow += ' ';
                if (ann.value) {
                    firstRow += '@' + escapeHtml(ann.name) + '("' + escapeHtml(ann.value) + '")';
                } else {
                    firstRow += '@' + escapeHtml(ann.name);
                }
            });
            firstRow += '</i>';
        }
    }

    htmlLabel += '<tr><td align="left" port="cluster_header">' + firstRow + '</td></tr>';

    // Title (if different from ID)
    // Description
    const descAttr = node.attributes?.find((a: any) => a.name === 'description' || a.name === 'desc' || a.name === 'prompt');
    if (node.title || descAttr) {
        const titleText = node.title ? String(node.title).replace(/^"|"$/g, '') : '';
        let descValue = descAttr?.value;
        if (typeof descValue === 'string') {
            descValue = descValue.replace(/^["']|["']$/g, '');
            // Interpolate templates if runtime context is available
            descValue = interpolateValue(descValue, runtimeContext);
        }
        if (titleText && titleText !== node.name) {
            const maxTitleLength = wrappingConfig?.maxNodeTitleLength ?? 40;
            const titleLines = breakLongText(titleText, maxTitleLength);
            const titleHtml = '<b>' + titleLines.map(line => processMarkdown(line)).join('<br/>') + '</b>';
            
            let descHtml = '';
            if (descValue) {
                const maxDescLength = wrappingConfig?.maxNodeDescLength ?? 60;
                const descLines = breakLongText(String(descValue), maxDescLength);
                descHtml = '<i>' + descLines.map(line => processMarkdown(line)).join('<br/>') + '</i>';
            }
            
            htmlLabel += `<tr><td align="left">${titleHtml}${node.title && descAttr ? ' — ' : ''}${descHtml}</td></tr>`;
        }
    }

    // Attributes table (excluding description/desc/prompt)
    const displayAttrs = getNamespaceDisplayAttributes(node);

    if (displayAttrs.length > 0) {
        htmlLabel += '<tr><td>';
        htmlLabel += generateAttributesTable(displayAttrs, runtimeContext, wrappingConfig);
        htmlLabel += '</td></tr>';
    }

    htmlLabel += '</table>';
    return htmlLabel;
}

/**
 * Extract and apply cluster styling from node's style attribute and annotations
 * Returns an array of DOT style lines to be applied to the cluster subgraph
 */
function getClusterStyle(node: any, styleNodes: any[] = [], validationContext?: ValidationContext): string[] {
    const styleLines: string[] = [];
    
    // Default cluster styling
    styleLines.push('style=filled;');
    styleLines.push('fontsize=10;');
    styleLines.push('fillcolor="#FFFFFF";');
    styleLines.push('color="#999999";');

    // Apply style attribute (e.g., style: { color: green; fillcolor: green; })
    const styleAttr = node.attributes?.find((a: any) => a.name === 'style');
    if (styleAttr && styleAttr.value && typeof styleAttr.value === 'object') {
        // If style attribute is an object, apply each property
        Object.keys(styleAttr.value).forEach(key => {
            const value = styleAttr.value[key];
            if (value !== undefined && value !== null) {
                // Map CSS properties to Graphviz equivalents
                const graphvizKey = mapCssPropertyToGraphviz(key.trim());
                styleLines.push(`${graphvizKey}="${value}";`);
            }
        });
    }

    // Apply @style annotations directly (inline styles)
    const annotations = node.annotations || [];
    annotations.forEach((ann: any) => {
        if (ann.name === 'style') {
            // Check if annotation has attribute-style parameters
            if (ann.attributes) {
                // Apply each attribute as a graphviz property
                Object.keys(ann.attributes).forEach(key => {
                    const value = ann.attributes[key];
                    styleLines.push(`${key}="${value}";`);
                });
            } else if (ann.value) {
                // Parse string value for inline styles (e.g., @style("color: red; stroke-width: 3px;"))
                const styleAttrs = ann.value.split(';').map((s: string) => s.trim()).filter((s: string) => s);
                styleAttrs.forEach((attr: string) => {
                    const [key, ...valueParts] = attr.split(':');
                    if (key && valueParts.length > 0) {
                        let value = valueParts.join(':').trim();
                        // Map CSS properties to Graphviz equivalents
                        const graphvizKey = mapCssPropertyToGraphviz(key.trim());
                        // Normalize direction values
                        if (graphvizKey === 'rankdir' || key.trim().toLowerCase() === 'direction') {
                            value = normalizeDirectionValue(value);
                        }
                        // Skip layout properties (columns, cols, col, column) - these are handled separately
                        if (['columns', 'cols', 'col', 'column'].includes(key.trim().toLowerCase())) {
                            return;
                        }
                        styleLines.push(`${graphvizKey}="${value}";`);
                    }
                });
            }
        }
    });

    // Apply custom styles from style nodes
    if (styleNodes && styleNodes.length > 0) {
        const nodeAnnotations = node.annotations || [];
        
        // Find matching style nodes
        for (const styleNode of styleNodes) {
            const styleAnnotations = styleNode.annotations || [];

            // Check if any of the node's annotations match the style node's selector annotation
            for (const styleAnnotation of styleAnnotations) {
                const hasMatchingAnnotation = nodeAnnotations.some(
                    (nodeAnn: any) => nodeAnn.name === styleAnnotation.name
                );

                if (hasMatchingAnnotation) {
                    // Apply all attributes from the style node as graphviz properties
                    const styleAttrs = styleNode.attributes || [];
                    for (const attr of styleAttrs) {
                        let attrValue = attr.value;

                        // Clean up string values (remove quotes)
                        if (typeof attrValue === 'string') {
                            attrValue = attrValue.replace(/^["']|["']$/g, '');
                        }

                        // Add to style lines
                        styleLines.push(`${attr.name}="${attrValue}";`);
                    }
                }
            }
        }
    }

    // Add validation warning styling if validation context is provided
    if (validationContext) {
        const nodeFlag = validationContext.getNodeFlag(node.name);
        if (nodeFlag && nodeFlag.errors.length > 0) {
            // Find the highest severity error
            const maxSeverity = getMaxSeverity(nodeFlag.errors);

            switch (maxSeverity) {
                case ValidationSeverity.ERROR:
                    // Red border for errors
                    styleLines.push('penwidth=3;');
                    styleLines.push('color="#D32F2F";');
                    break;
                case ValidationSeverity.WARNING:
                    // Orange border for warnings
                    styleLines.push('penwidth=2;');
                    styleLines.push('color="#FFA726";');
                    break;
                case ValidationSeverity.INFO:
                    // Blue border for info
                    styleLines.push('penwidth=2;');
                    styleLines.push('color="#42A5F5";');
                    break;
                case ValidationSeverity.HINT:
                    // Light gray border for hints
                    styleLines.push('penwidth=1;');
                    styleLines.push('color="#9E9E9E";');
                    break;
            }
        }
    }

    return styleLines;
}

function isVisualDebug(machineJson: MachineJSON) {
    return machineJson.attributes?.some(attr => attr.name === 'debugVisual' && attr.value === true);
}

/**
 * Generate DOT syntax with true nested subgraphs
 */
function generateSemanticHierarchy(
    hierarchy: SemanticHierarchy,
    nodes: any[],
    machineJson: MachineJSON,
    level = 0,
    styleNodes: any[] = [],
    validationContext?: ValidationContext,
    options?: DiagramOptions,
    wrappingConfig?: TextWrappingConfig,
    notesByParent?: NotesByParentMap,
    clusterTargets?: Map<string, string>,
    nodeStates?: RuntimeNodeState[]
): string {
    const lines: string[] = [];
    const indent = '  '.repeat(level);
    const edges = machineJson.edges;

    // Build a lookup map for node states if available
    const nodeStateMap = nodeStates ? new Map(nodeStates.map(ns => [ns.name, ns])) : undefined;

    nodes.forEach(node => {
        const { children } = hierarchy[node.name];

        const noteEntries = notesByParent?.get(node.name) ?? [];

        if (children.length > 0) {
            // Node has children - create a cluster subgraph with proper label and styling
            lines.push(`${indent}subgraph cluster_${node.name} {`);

            // Extract cluster title and description for proper cluster label
            const clusterLabel = generateClusterLabel(node, options?.runtimeContext, wrappingConfig);
            lines.push(`${indent}  label=<${clusterLabel}>;`);
            lines.push(`${indent}  labelloc="t";`);

            // Apply cluster styling from node's style attribute
            const clusterStyle = getClusterStyle(node, styleNodes, validationContext);
            clusterStyle.forEach(styleLine => {
                lines.push(`${indent}  ${styleLine}`);
            });

            // Only render namespace node if it has displayable attributes (excluding style, desc, prompt)
            const displayAttrs = getNamespaceDisplayAttributes(node);
            if (displayAttrs.length > 0) {
                const namespaceLabel = generateAttributesTable(displayAttrs, options?.runtimeContext, wrappingConfig);
                lines.push(`${indent}  "${node.name}" [label=<${namespaceLabel}>, shape=plain, margin=0];`);
            }

            const debug = isVisualDebug(machineJson);

            const anchorName = getClusterAnchorName(node.name);
            lines.push(`${indent}  "${anchorName}" [shape=point, width=0.01, height=0.01, label="", style=${debug ? 'filled' : 'invis'}, fixedsize=true];`);
            lines.push('');

            // Recursively generate children
            const childNodes = children.map(childName => hierarchy[childName].node);
            lines.push(generateSemanticHierarchy(
                hierarchy,
                childNodes,
                machineJson,
                level + 1,
                styleNodes,
                validationContext,
                options,
                wrappingConfig,
                notesByParent,
                clusterTargets,
                nodeStates
            ));

            if (noteEntries.length > 0) {
                lines.push('');
                noteEntries.forEach(noteInfo => {
                    const noteLines = generateNoteDefinition(noteInfo, `${indent}  `, wrappingConfig, clusterTargets);
                    noteLines.forEach(line => lines.push(line));
                });
            }

            // Check for grid layout within this cluster
            const clusterGridSize = extractGridSize(node);
            if (clusterGridSize && clusterGridSize > 0) {
                const leafChildren = childNodes.filter(child => {
                    const childHierarchy = hierarchy[child.name];
                    return !childHierarchy || childHierarchy.children.length === 0;
                });
                if (leafChildren.length > 0) {
                    lines.push('');
                    lines.push(`${indent}  // Grid layout for cluster ${node.name}`);
                    const clusterDirection = extractDirection(node);
                    const gridLayoutLines = generateGridLayout(leafChildren, clusterGridSize, `cluster_${node.name}`, clusterDirection, isVisualDebug(machineJson));
                    // Add proper indentation to each line
                    const indentedLines = gridLayoutLines.split('\n').map(line => {
                        if (line.trim()) {
                            return `${indent}${line}`;
                        }
                        return line;
                    }).join('\n');
                    lines.push(indentedLines);
                }
            }

            lines.push(`${indent}}`);
        } else {
            // Leaf node - pass runtime state if available
            const runtimeState = nodeStateMap?.get(node.name);
            lines.push(generateNodeDefinition(node, edges, indent, styleNodes, validationContext, options, wrappingConfig, runtimeState, machineJson));

            if (noteEntries.length > 0) {
                noteEntries.forEach(noteInfo => {
                    const noteLines = generateNoteDefinition(noteInfo, indent, wrappingConfig, clusterTargets);
                    noteLines.forEach(line => lines.push(line));
                });
            }
        }
    });

    return lines.join('\n');
}

/**
 * Generate a node definition in DOT format with HTML-like labels for multi-line formatting
 * Now includes optional runtime state decoration
 */
function generateNodeDefinition(
    node: any,
    edges: any[],
    indent: string,
    styleNodes: any[] = [],
    validationContext?: ValidationContext,
    options?: DiagramOptions,
    wrappingConfig?: TextWrappingConfig,
    runtimeState?: RuntimeNodeState,
    machineJson?: MachineJSON
): string {
    // Build HTML label
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // First row: Type (italic), ID (bold), Annotations (italic), Runtime Status
    htmlLabel += '<tr><td align="left">';

    let firstRowContent = '';

    // Runtime status emoji if available
    if (runtimeState && options?.showRuntimeState !== false) {
        const statusEmoji = getStatusEmoji(runtimeState.status);
        firstRowContent += statusEmoji + ' ';
    }

    // ID (bold) - always present
    firstRowContent += '<b>' + escapeHtml(node.name) + '</b>';

    // Type first (italic)
    if (node.type) {
        firstRowContent += ' <i>&lt;' + escapeHtml(node.type) + '&gt;</i>';
    }

    // Annotations (italic)
    // Filter out @style and @note annotations - @style is applied visually, @note is displayed separately
    if (node.annotations && node.annotations.length > 0) {
        const displayAnnotations = node.annotations.filter((ann: any) =>
            ann.name !== 'note' && ann.name !== 'style'
        );
        if (displayAnnotations.length > 0) {
            firstRowContent += ' <i>';
            displayAnnotations.forEach((ann: any, idx: number) => {
                if (idx > 0) firstRowContent += ' ';
                if (ann.value) {
                    firstRowContent += '@' + escapeHtml(ann.name) + '("' + escapeHtml(ann.value) + '")';
                } else {
                    firstRowContent += '@' + escapeHtml(ann.name);
                }
            });
            firstRowContent += '</i>';
        }
    }

    htmlLabel += firstRowContent;
    htmlLabel += '</td></tr>';

    // Title row (if present and different from ID)
    if (node.title && node.title !== node.name) {
        let titleValue = typeof node.title === 'string'
            ? node.title.replace(/^["']|["']$/g, '')
            : String(node.title);
        titleValue = interpolateValue(titleValue, options?.runtimeContext, machineJson);

        htmlLabel += '<tr><td align="left">';
        const maxTitleLength = wrappingConfig?.maxNodeTitleLength ?? 40;
        const titleLines = breakLongText(titleValue, maxTitleLength);
        htmlLabel += titleLines.map(line => processMarkdown(line)).join('<br/>');
        htmlLabel += '</td></tr>';
    }

    // Description row (from 'desc' attribute, if present)
    const descAttr = node.attributes?.find((a: any) => a.name === 'desc');
    if (descAttr && descAttr.value) {
        let descValue = typeof descAttr.value === 'string'
            ? descAttr.value.replace(/^["']|["']$/g, '')
            : String(descAttr.value);
        descValue = interpolateValue(descValue, options?.runtimeContext, machineJson);

        htmlLabel += '<tr><td align="left">';
        const maxDescLength = wrappingConfig?.maxNodeDescLength ?? 60;
        const descLines = breakLongText(descValue, maxDescLength);
        htmlLabel += '<font point-size="9"><i>' + descLines.map(line => processMarkdown(line)).join('<br/>') + '</i></font>';
        htmlLabel += '</td></tr>';
    }

    // Prompt row (from 'prompt' attribute, if present, with interpolation)
    const promptAttr = node.attributes?.find((a: any) => a.name === 'prompt');
    if (promptAttr && promptAttr.value) {
        let promptValue = typeof promptAttr.value === 'string'
            ? promptAttr.value.replace(/^["']|["']$/g, '')
            : String(promptAttr.value);
        promptValue = interpolateValue(promptValue, options?.runtimeContext, machineJson);

        htmlLabel += '<tr><td align="left">';
        const maxPromptLength = wrappingConfig?.maxNodePromptLength ?? 100;
        const promptLines = breakLongText(promptValue, maxPromptLength);
        htmlLabel += '<font point-size="8" color="#666666">→ ' + promptLines.map(line => processMarkdown(line)).join('<br/>') + '</font>';
        htmlLabel += '</td></tr>';
    }

    // Runtime statistics if available
    if (runtimeState && options?.showRuntimeState !== false && runtimeState.visitCount > 0) {
        htmlLabel += '<tr><td align="left">';
        htmlLabel += `<font point-size="8"><i>visits: ${runtimeState.visitCount}</i></font>`;
        htmlLabel += '</td></tr>';
    }

    // Combine static attributes and runtime values in a single table
    const attributes = getNodeDisplayAttributes(node);
    const hasStaticAttrs = attributes.length > 0;
    
    // For context nodes, update static attribute values with runtime values (no separate section)
    // For other nodes, collect runtime-only values to show separately
    const isContextNode = node.type?.toLowerCase() === 'context';
    const runtimeOnlyValues: any[] = [];
    
    if (isContextNode && runtimeState?.runtimeValues) {
        // Update static attributes with runtime values for context nodes
        const runtimeVals = runtimeState.runtimeValues;
        attributes.forEach(attr => {
            const runtimeKey = `${node.name}.${attr.name}`;
            if (runtimeVals[runtimeKey] !== undefined) {
                // Update the attribute value with runtime value
                attr.value = runtimeVals[runtimeKey];
            }
        });
        // Don't show separate runtime section for context nodes
    } else if (runtimeState?.runtimeValues && Object.keys(runtimeState.runtimeValues).length > 0 && options?.showRuntimeState !== false) {
        // For non-context nodes, collect runtime-only values
        const staticAttrNames = new Set(attributes.map((a: any) => a.name));
        
        Object.entries(runtimeState.runtimeValues).forEach(([key, value]) => {
            // Only show runtime values that aren't already in static attributes
            if (!staticAttrNames.has(key)) {
                runtimeOnlyValues.push({
                    name: key,
                    value: value,
                    type: typeof value
                });
            }
        });
    }

    // Generate unified attributes table (no nesting)
    if (hasStaticAttrs || runtimeOnlyValues.length > 0) {
        htmlLabel += '<tr><td>';
        htmlLabel += '<table border="0" cellborder="1" cellspacing="0" cellpadding="2" align="left">';
        
        // Static attributes first
        if (hasStaticAttrs) {
            const entries = computeAttributePortEntries(attributes);
            entries.forEach(({ attr, keyPort, valuePort }) => {
                let displayValue = attr.value?.value ?? attr.value;
                displayValue = formatAttributeValueForDisplay(displayValue);

                if (typeof displayValue === 'string' && options?.runtimeContext) {
                    displayValue = interpolateValue(displayValue, options.runtimeContext);
                }

                const maxValueLength = wrappingConfig?.maxAttributeValueLength ?? 30;
                const maxKeyLength = wrappingConfig?.maxAttributeKeyLength ?? 25;

                if (typeof displayValue === 'string') {
                    const lines = breakLongText(displayValue, maxValueLength, { preserveLineBreaks: true });
                    displayValue = lines.map(line => processMarkdown(line)).join('<BR/>');
                } else {
                    displayValue = escapeHtml(String(displayValue));
                }

                let attrName = attr.name;
                if (attrName && attrName.length > maxKeyLength) {
                    const lines = breakLongText(attrName, maxKeyLength);
                    attrName = lines.map(line => processMarkdown(line)).join('<BR/>');
                } else {
                    attrName = processMarkdown(attrName);
                }

                const typeStr = attr.type ? ' : ' + escapeHtml(attr.type) : '';
                htmlLabel += '<tr>';
                htmlLabel += `<td port="${keyPort}" align="left" balign="left">${attrName}${typeStr}</td>`;
                htmlLabel += `<td port="${valuePort}" align="left" balign="left">${displayValue}</td>`;
                htmlLabel += '</tr>';
            });
        }
        
        // Runtime values section (if any)
        if (runtimeOnlyValues.length > 0) {
            // Add separator row
            htmlLabel += '<tr><td colspan="2" bgcolor="#F5F5F5"><font point-size="8"><i>Runtime Values:</i></font></td></tr>';
            
            // Add runtime value rows
            const runtimeEntries = computeAttributePortEntries(runtimeOnlyValues);
            runtimeEntries.forEach(({ attr, keyPort, valuePort }) => {
                let displayValue = formatAttributeValueForDisplay(attr.value);
                
                const maxValueLength = wrappingConfig?.maxAttributeValueLength ?? 30;
                const maxKeyLength = wrappingConfig?.maxAttributeKeyLength ?? 25;

                if (typeof displayValue === 'string') {
                    const lines = breakLongText(displayValue, maxValueLength, { preserveLineBreaks: true });
                    displayValue = lines.map(line => processMarkdown(line)).join('<BR/>');
                } else {
                    displayValue = escapeHtml(String(displayValue));
                }

                let attrName = attr.name;
                if (attrName && attrName.length > maxKeyLength) {
                    const lines = breakLongText(attrName, maxKeyLength);
                    attrName = lines.map(line => processMarkdown(line)).join('<BR/>');
                } else {
                    attrName = processMarkdown(attrName);
                }

                const typeStr = attr.type ? ' : ' + escapeHtml(attr.type) : '';
                htmlLabel += '<tr>';
                htmlLabel += `<td port="${keyPort}" align="left" balign="left">${attrName}${typeStr}</td>`;
                htmlLabel += `<td port="${valuePort}" align="left" balign="left">${displayValue}</td>`;
                htmlLabel += '</tr>';
            });
        }
        
        htmlLabel += '</table>';
        htmlLabel += '</td></tr>';
    }

    // Add inline validation warnings if enabled
    const showInline = !options?.warningMode || options.warningMode === 'inline' || options.warningMode === 'both';
    if (validationContext && showInline && options?.showValidationWarnings !== false) {
        const nodeFlag = validationContext.getNodeFlag(node.name);
        if (nodeFlag && nodeFlag.errors.length > 0) {
            // Filter by minimum severity if specified
            const minSeverityOrder: Record<string, number> = {
                'error': 0,
                'warning': 1,
                'info': 2,
                'hint': 3
            };
            const minLevel = minSeverityOrder[options?.minSeverity || 'warning'] ?? 1;

            const filteredErrors = nodeFlag.errors.filter(e => {
                const errorLevel = minSeverityOrder[e.severity] ?? 3;
                return errorLevel <= minLevel;
            });

            if (filteredErrors.length > 0) {
                // Determine background color based on max severity
                const maxSeverity = getMaxSeverity(filteredErrors);
                let bgColor = '#FFF4CC'; // warning default
                if (maxSeverity === ValidationSeverity.ERROR) bgColor = '#FFCCCC';
                else if (maxSeverity === ValidationSeverity.INFO) bgColor = '#E3F2FD';
                else if (maxSeverity === ValidationSeverity.HINT) bgColor = '#F5F5F5';

                htmlLabel += `<tr><td align="left" bgcolor="${bgColor}">`;

                // Show warning count badge
                const icon = getWarningIcon(maxSeverity);
                htmlLabel += `<font point-size="8"><b>${icon} ${filteredErrors.length} issue${filteredErrors.length > 1 ? 's' : ''}</b><br/>`;

                // Show first 2 warnings inline (to avoid clutter)
                filteredErrors.slice(0, 2).forEach((error: any) => {
                    const shortMsg = error.message.length > 50
                        ? error.message.substring(0, 50) + '...'
                        : error.message;
                    htmlLabel += escapeHtml(shortMsg) + '<br/>';
                });

                if (filteredErrors.length > 2) {
                    htmlLabel += `<i>... and ${filteredErrors.length - 2} more</i>`;
                }

                htmlLabel += '</font></td></tr>';
            }
        }
    }

    htmlLabel += '</table>';

    // Get shape and styling
    const shape = getNodeShape(node, edges);
    let style = getNodeStyle(node, edges, styleNodes, validationContext);

    // Apply runtime styling overlay if runtime state is available
    if (runtimeState && options?.showRuntimeState !== false) {
        const runtimeStyle = getRuntimeNodeStyle(runtimeState);
        // Runtime style takes precedence for fill and border colors
        style = runtimeStyle;
    }

    // Add source position metadata for bidirectional highlighting via URL attribute
    let sourceMetadata = '';
    if (node.$sourceRange && typeof node.$sourceRange === 'object' && 
        'start' in node.$sourceRange && 'end' in node.$sourceRange) {
        const sourceRange = node.$sourceRange as any;
        const startLine = sourceRange.start?.line;
        const startChar = sourceRange.start?.character;
        const endLine = sourceRange.end?.line;
        const endChar = sourceRange.end?.character;
        
        if (typeof startLine === 'number' && typeof startChar === 'number' && 
            typeof endLine === 'number' && typeof endChar === 'number') {
            // Use URL attribute with fragment identifier containing position data
            // Format: #L{startLine}:{startChar}-{endLine}:{endChar}
            sourceMetadata = `, URL="#L${startLine}:${startChar}-${endLine}:${endChar}"`;
        }
    }

    return `${indent}"${node.name}" [label=<${htmlLabel}>, pad=0.5, shape=${shape}, ${style}${sourceMetadata}];`;
}

/**
 * Break long text into multiple lines at word boundaries
 * @param text - Text to break into lines
 * @param maxLength - Maximum length per line
 * @param options - Optional configuration
 * @param options.preserveLineBreaks - If true, preserves existing \n line breaks (default: false)
 * @param options.forceBreak - If true, forces breaks in long unbroken strings (default: true)
 */
function breakLongText(text: string, maxLength: number, options?: {
    preserveLineBreaks?: boolean;
    forceBreak?: boolean;
}): string[] {
    if (!text || text.length <= maxLength) {
        return [text || ''];
    }

    const preserveLineBreaks = options?.preserveLineBreaks ?? false;
    const forceBreak = options?.forceBreak ?? true;

    // If preserving line breaks, split on \n first and process each segment
    if (preserveLineBreaks && text.includes('\n')) {
        const segments = text.split('\n');
        const result: string[] = [];
        
        for (const segment of segments) {
            if (segment.length <= maxLength) {
                result.push(segment);
            } else {
                // Process long segments with word wrapping
                result.push(...breakLongText(segment, maxLength, { preserveLineBreaks: false, forceBreak }));
            }
        }
        
        return result.length > 0 ? result : [text];
    }

    // Word-boundary wrapping
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        // Check if word itself is too long
        if (word.length > maxLength && forceBreak) {
            // Flush current line if any
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
            
            // Force-break the long word
            let remaining = word;
            while (remaining.length > maxLength) {
                lines.push(remaining.substring(0, maxLength));
                remaining = remaining.substring(maxLength);
            }
            currentLine = remaining;
        } else if (currentLine.length + word.length + 1 <= maxLength) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) lines.push(currentLine);

    return lines.length > 0 ? lines : [text];
}

/**
 * Helper function to compute the invisible anchor node name for a cluster
 */
function getClusterAnchorName(clusterName: string): string {
    return `${clusterName}__cluster_anchor`;
}

/**
 * Apply custom styles from style nodes to edges based on annotation matching
 */
function applyCustomEdgeStyles(edge: any, styleNodes: any[]): string {
    let customStyles = appendStyleAttributes('', edge.style);
    const edgeAnnotations = edge.annotations || [];

    if (!styleNodes || styleNodes.length === 0) {
        return customStyles;
    }

    // Find matching style nodes
    for (const styleNode of styleNodes) {
        const styleAnnotations = styleNode.annotations || [];
        const hasMatchingAnnotation = styleAnnotations.some((styleAnnotation: any) =>
            edgeAnnotations.some((edgeAnn: any) => edgeAnn.name === styleAnnotation.name)
        );

        if (!hasMatchingAnnotation) {
            continue;
        }

        if (styleNode.style) {
            customStyles = appendStyleAttributes(customStyles, styleNode.style);
            continue;
        }

        if (styleNode.attributes) {
            const inlineStyle: Record<string, unknown> = {};
            for (const attr of styleNode.attributes) {
                let attrValue = attr.value;
                if (typeof attrValue === 'string') {
                    attrValue = attrValue.replace(/^["']|["']$/g, '');
                }
                inlineStyle[attr.name] = attrValue;
            }
            customStyles = appendStyleAttributes(customStyles, inlineStyle);
        }
    }

    return customStyles;
}

/**
 * Get visual styling for edge based on condition evaluation
 * Returns Graphviz style attributes to visually indicate active/inactive status
 */
function getEdgeConditionStyle(evaluation: EdgeEvaluationResult): string {
    // If edge has no condition, use default styling
    if (!evaluation.hasCondition) {
        return '';
    }

    // If evaluation failed with error, use error styling
    if (evaluation.error) {
        return ', style=dashed, color="#D32F2F", penwidth=1';
    }

    // Apply visual indication based on condition evaluation
    if (evaluation.isActive) {
        // Active edges: solid, green, slightly thicker
        return ', style=solid, color="#4CAF50", penwidth=2';
    } else {
        // Inactive edges: dashed, gray, thinner
        return ', style=dashed, color="#9E9E9E", penwidth=1';
    }
}

/**
 * Check if edge annotations should be shown in label
 * Looks for @hideLabel annotation or showAnnotation attribute
 */
function shouldShowEdgeAnnotation(edge: any): boolean {
    const edgeAnnotations = edge.annotations || [];

    // Check for @hideLabel annotation
    for (const ann of edgeAnnotations) {
        if (ann.name === 'hideLabel' || ann.name === 'hideAnnotation') {
            return false;
        }
        // Also check for showAnnotation attribute with explicit false value
        if (ann.name === 'showAnnotation' && ann.value === 'false') {
            return false;
        }
        // Also support direct attribute lookup if it exists
        if (ann.showAnnotation === false || ann.showAnnotation === 'false') {
            return false;
        }
    }

    // Default is to show annotations
    return true;
}

/**
 * Format edge label as HTML table with left alignment
 * This wraps the edge label text in an HTML table to enforce left alignment
 * and uses <br/> for line breaks instead of \n
 * Processes Markdown syntax in the label text
 */
function formatEdgeLabelAsHtml(labelText: string): string {
    if (!labelText || labelText.trim().length === 0) {
        return '';
    }

    // Replace \n with <br/> for HTML rendering, and process Markdown in each line
    const htmlText = labelText.split('\n').map(line => processMarkdown(line)).join('<br/>');

    // Wrap in a single-cell table with left alignment
    return `<table border="0" cellborder="0" cellspacing="0" cellpadding="2" align="left"><tr><td align="left" balign="left">${htmlText}</td></tr></table>`;
}

/**
 * Generate enhanced HTML label for edge showing title, annotations, and attributes in table format
 * Similar to how machine, cluster, and node attributes are displayed
 */
function generateEdgeLabel(
    edge: any,
    edgeValue: any,
    showAnnotation: boolean,
    edgeState?: RuntimeEdgeState,
    options?: DiagramOptions,
    wrappingConfig?: TextWrappingConfig
): string {
    const textValue = edgeValue.text;
    const keys = Object.keys(edgeValue);
    const otherProps = keys.filter(k => k !== 'text' && !EDGE_METADATA_KEYS.has(k));

    // Check if we have anything to display
    const hasText = !!textValue;
    const hasAnnotations = showAnnotation && edge.annotations && edge.annotations.length > 0;
    const hasAttributes = otherProps.length > 0;
    const hasVisitCount = edgeState && options?.showVisitCounts !== false && edgeState.traversalCount > 0;

    // If nothing to display, return empty
    if (!hasText && !hasAnnotations && !hasAttributes && !hasVisitCount) {
        return '';
    }

    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="2" align="left">';

    // Title/text row (if present)
    if (hasText) {
        const maxEdgeLabelLength = wrappingConfig?.maxEdgeLabelLength ?? 40;
        const wrappedLines = breakLongText(textValue, maxEdgeLabelLength);
        const htmlText = wrappedLines.map(line => processMarkdown(line)).join('<br/>');
        htmlLabel += `<tr><td align="left" balign="left"><b>${htmlText}</b></td></tr>`;
    }

    // Annotations row (if present, excluding @style)
    if (hasAnnotations) {
        const displayAnnotations = edge.annotations.filter((ann: any) => ann.name !== 'style');
        if (displayAnnotations.length > 0) {
            const annotationLabels = displayAnnotations.map((ann: any) => {
                if (ann.value) {
                    return '@' + escapeHtml(ann.name) + '("' + escapeHtml(ann.value) + '")';
                } else {
                    return '@' + escapeHtml(ann.name);
                }
            }).join(' ');
            htmlLabel += `<tr><td align="left" balign="left"><i>${annotationLabels}</i></td></tr>`;
        }
    }

    // Attributes table (if present)
    if (hasAttributes) {
        htmlLabel += '<tr><td align="left">';
        htmlLabel += '<table border="0" cellborder="1" cellspacing="0" cellpadding="2" align="left">';

        otherProps.forEach(key => {
            const value = edgeValue[key];
            const displayValue = typeof value === 'string' ? escapeHtml(value) : escapeHtml(String(value));
            htmlLabel += '<tr>';
            htmlLabel += `<td align="left" balign="left">${escapeHtml(key)}</td>`;
            htmlLabel += `<td align="left" balign="left">${displayValue}</td>`;
            htmlLabel += '</tr>';
        });

        htmlLabel += '</table>';
        htmlLabel += '</td></tr>';
    }

    // Visit count (if present)
    if (hasVisitCount) {
        htmlLabel += `<tr><td align="left" balign="left"><i>[${edgeState.traversalCount}x]</i></td></tr>`;
    }

    htmlLabel += '</table>';
    return htmlLabel;
}

/**
 * Generate edges section with support for compound edges between clusters
 * Now includes static evaluation of edge conditions for visual indication
 * and runtime edge state decorations when available
 */
function generateEdges(
    machineJson: MachineJSON,
    styleNodes: any[] = [],
    wrappingConfig?: TextWrappingConfig,
    options?: DiagramOptions,
    edgeStates?: RuntimeEdgeState[]
): string {
    const lines: string[] = [];

    if (!machineJson.edges || machineJson.edges.length === 0) {
        return '';
    }

    const nodeLookup = new Map<string, any>();
    machineJson.nodes.forEach(node => {
        if (node.type?.toLowerCase() === 'note') {
            return;
        }
        nodeLookup.set(node.name, node);
    });

    // Build a set of parent nodes (nodes that have children)
    const parentNodes = new Set<string>();
    machineJson.nodes.forEach(node => {
        if (node.parent) {
            parentNodes.add(node.parent);
        }
    });

    // Build edge state lookup if available
    const edgeStateMap = edgeStates
        ? new Map(edgeStates.map(es => [`${es.source}->${es.target}`, es]))
        : undefined;

    // Evaluate edge conditions
    const edgeEvaluator = new EdgeEvaluator();
    
    // Use runtime context if available, otherwise use static default context
    const evaluationContext = options?.runtimeContext 
        ? edgeEvaluator.createRuntimeContext(options.runtimeContext)
        : edgeEvaluator.createDefaultContext(machineJson.attributes);
    
    const edgeEvaluations = edgeEvaluator.evaluateEdges(machineJson.edges, evaluationContext);

    // Process all edges, including parent-to-parent edges using compound edge features
    machineJson.edges.forEach((edge, edgeIndex) => {
        const edgeValue = edge.attributes || {};
        const showAnnotation = shouldShowEdgeAnnotation(edge);

        // Use wrappingConfig values or defaults
        const maxMultiplicityLength = wrappingConfig?.maxMultiplicityLength ?? 20;

        // Get edge state for runtime information
        const edgeKey = `${edge.source}->${edge.target}`;
        const edgeState = edgeStateMap?.get(edgeKey);

        // Generate enhanced edge label with table format
        const htmlLabel = generateEdgeLabel(edge, edgeValue, showAnnotation, edgeState, options, wrappingConfig);

        // Get arrow style based on arrow type
        const arrowStyle = getArrowStyle(edge.arrowType || '->');

        // Apply custom styles from style nodes
        const customStyles = applyCustomEdgeStyles(edge, styleNodes);

        // Build edge attributes array
        const edgeAttrs: string[] = [];

        if (htmlLabel) {
            edgeAttrs.push(`label=<${htmlLabel}>`);
        }

        // Add multiplicity using taillabel and headlabel (proper UML style) with wrapping
        if (edge.sourceMultiplicity) {
            const wrappedMultiplicity = breakLongText(edge.sourceMultiplicity, maxMultiplicityLength).join('\\n');
            edgeAttrs.push(`taillabel="${escapeDot(wrappedMultiplicity)}"`);
        }

        if (edge.targetMultiplicity) {
            const wrappedMultiplicity = breakLongText(edge.targetMultiplicity, maxMultiplicityLength).join('\\n');
            edgeAttrs.push(`headlabel="${escapeDot(wrappedMultiplicity)}"`);
        }

        if (arrowStyle) {
            edgeAttrs.push(arrowStyle);
        }

        edgeAttrs.push('labelOverlay="75%"');

        // Add source position metadata for bidirectional highlighting via edgeURL attribute
        if (edge.$sourceRange && typeof edge.$sourceRange === 'object' && 
            'start' in edge.$sourceRange && 'end' in edge.$sourceRange) {
            const sourceRange = edge.$sourceRange as any;
            const startLine = sourceRange.start?.line;
            const startChar = sourceRange.start?.character;
            const endLine = sourceRange.end?.line;
            const endChar = sourceRange.end?.character;
            
            if (typeof startLine === 'number' && typeof startChar === 'number' && 
                typeof endLine === 'number' && typeof endChar === 'number') {
                // Use edgeURL attribute with fragment identifier containing position data
                // Format: #L{startLine}:{startChar}-{endLine}:{endChar}
                edgeAttrs.push(`edgeURL="#L${startLine}:${startChar}-${endLine}:${endChar}"`);
            } else {
                edgeAttrs.push('labelhref="#srcLineTBD"');
            }
        } else {
            edgeAttrs.push('labelhref="#srcLineTBD"');
        }

        // Determine edge styling:
        // 1. If runtime edge state is available, use runtime styling
        // 2. Otherwise, apply condition-based visual styling (for static evaluation)
        let edgeStyle = '';
        if (edgeState && options?.runtimeContext) {
            // Runtime styling takes precedence
            edgeStyle = getRuntimeEdgeStyle(edgeState, options.runtimeContext);
        } else {
            // Static condition styling
            const edgeEvaluation = edgeEvaluations.get(edgeIndex);
            edgeStyle = edgeEvaluation ? getEdgeConditionStyle(edgeEvaluation) : '';
        }

        // Apply custom styles if any
        if (customStyles) {
            // Custom styles are already formatted as ", attr1=value1, attr2=value2"
            // So we can just append them to the edge line directly
        }

        // Handle compound edges for parent clusters and resolve explicit ports
        const sourceIsParent = parentNodes.has(edge.source);
        const targetIsParent = parentNodes.has(edge.target);

        const sourcePortHandle = normalizeHandleValue(edge.sourcePort ?? edgeValue.sourcePort);
        const targetPortHandle = normalizeHandleValue(edge.targetPort ?? edgeValue.targetPort);
        const sourceAttributeHandle = normalizeHandleValue(edge.sourceAttribute ?? edgeValue.sourceAttribute);
        const targetAttributeHandle = normalizeHandleValue(edge.targetAttribute ?? edgeValue.targetAttribute);

        const hasExplicitSourcePort = !!(sourcePortHandle && sourcePortHandle !== 'cluster' && sourcePortHandle !== 'header');
        const hasExplicitTargetPort = !!(targetPortHandle && targetPortHandle !== 'cluster' && targetPortHandle !== 'header');
        const wantsSourceAttributePort = !!sourceAttributeHandle;
        const wantsTargetAttributePort = !!targetAttributeHandle;

        let actualSource = edge.source;
        let actualTarget = edge.target;
        let sourcePortName: string | undefined;
        let targetPortName: string | undefined;

        const useSourceClusterAnchor = !hasExplicitSourcePort && !wantsSourceAttributePort && (sourceIsParent || ((sourcePortHandle === 'cluster' || sourcePortHandle === 'header') && parentNodes.has(edge.source)));
        const useTargetClusterAnchor = !hasExplicitTargetPort && !wantsTargetAttributePort && (targetIsParent || ((targetPortHandle === 'cluster' || targetPortHandle === 'header') && parentNodes.has(edge.target)));

        if (useSourceClusterAnchor) {
            actualSource = getClusterAnchorName(edge.source);
            edgeAttrs.push(`ltail="cluster_${edge.source}"`);
        }

        if (useTargetClusterAnchor) {
            actualTarget = getClusterAnchorName(edge.target);
            edgeAttrs.push(`lhead="cluster_${edge.target}"`);
        }

        if (!useSourceClusterAnchor) {
            if (hasExplicitSourcePort) {
                sourcePortName = sourcePortHandle;
            } else if (sourceAttributeHandle) {
                const sourceNode = nodeLookup.get(edge.source);
                const attributes = sourceNode ? getNodeDisplayAttributes(sourceNode) : [];
                const resolvedPort = findAttributePort(attributes, sourceAttributeHandle, 'value');
                if (resolvedPort) {
                    sourcePortName = resolvedPort;
                }
            }
        }

        if (!useTargetClusterAnchor) {
            if (hasExplicitTargetPort) {
                targetPortName = targetPortHandle;
            } else if (targetAttributeHandle) {
                const targetNode = nodeLookup.get(edge.target);
                const attributes = targetNode ? getNodeDisplayAttributes(targetNode) : [];
                const resolvedPort = findAttributePort(attributes, targetAttributeHandle, 'value');
                if (resolvedPort) {
                    targetPortName = resolvedPort;
                }
            }
        }

        // Construct edge line with custom styles and runtime/condition styling appended
        const sourceEndpoint = buildEndpointIdentifier(actualSource, sourcePortName);
        const targetEndpoint = buildEndpointIdentifier(actualTarget, targetPortName);
        const edgeLine = `  ${sourceEndpoint} -> ${targetEndpoint} [${edgeAttrs.join(', ')}${customStyles}${edgeStyle}];`;
        lines.push(edgeLine);
    });

    return lines.join('\n');
}

/**
 * Map arrow types to DOT styles with enhanced arrow heads
 */
function getArrowStyle(arrowType: string): string {
    const styles: Record<string, string> = {
        '->': '',                                           // Association: normal arrow
        '-->': 'style="dashed"',                           // Dependency: dashed arrow
        '=>': 'penwidth=3, color="#D32F2F"',            // Critical path: thick red arrow
        '<-->': 'dir=both, arrowhead=normal, arrowtail=normal',  // Bidirectional: both arrows
        '<|--': 'arrowhead=empty, dir=back',            // Inheritance: empty arrow pointing to parent
        '*-->': 'arrowhead=diamond, arrowtail=diamond, dir=forward',  // Composition: filled diamond
        'o-->': 'arrowhead=odiamond, arrowtail=none',   // Aggregation: open diamond
    };
    return styles[arrowType] || '';
}

/**
 * Generate notes section
 */
function generateNoteDefinition(
    noteInfo: NoteRenderInfo,
    indent: string,
    wrappingConfig?: TextWrappingConfig,
    clusterTargets?: Map<string, string>
): string[] {
    const { note, dotId } = noteInfo;
    const target = note.name;
    if (!target) {
        return [];
    }

    const resolvedTarget = typeof target === 'string'
        ? (clusterTargets?.get(target) ?? target)
        : target;

    let content = note.title;
    if (!content) {
        const descAttr = (note.attributes || []).find((attr: any) => attr.name === 'desc' || attr.name === 'prompt');
        if (descAttr?.value) {
            content = typeof descAttr.value === 'string' ? descAttr.value : JSON.stringify(descAttr.value);
        }
    }

    if (typeof content === 'string') {
        content = content.replace(/^["']|["']$/g, '');
    }

    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    if (note.annotations && note.annotations.length > 0) {
        const annotationStr = note.annotations
            .map((ann: any) => ann.value ? `@${ann.name}(${ann.value})` : `@${ann.name}`)
            .join(' ');
        if (annotationStr) {
            htmlLabel += '<tr><td align="left"><i>' + escapeHtml(annotationStr) + '</i></td></tr>';
        }
    }

    if (content) {
        const contentLines = breakLongText(content, 40);
        htmlLabel += '<tr><td align="left">' + contentLines.map(line => processMarkdown(line)).join('<br/>') + '</td></tr>';
    }

    const displayAttrs = getNoteDisplayAttributes(note);
    if (displayAttrs.length > 0) {
        htmlLabel += '<tr><td>';
        htmlLabel += generateAttributesTable(displayAttrs, undefined, wrappingConfig);
        htmlLabel += '</td></tr>';
    }

    htmlLabel += '</table>';

    const lines: string[] = [];
    lines.push(`${indent}"${dotId}" [label=<${htmlLabel}>, shape=note, fillcolor="#FFFACD", style=filled, fontsize=9];`);
    lines.push(`${indent}"${dotId}" -> "${resolvedTarget}" [style=dashed, color="#999999", arrowhead=none];`);
    return lines;
}

/**
 * Generate warning notes from validation context
 */
function generateWarningNotes(validationContext: ValidationContext, options?: DiagramOptions): string {
    const lines: string[] = [];
    const nodeFlags = validationContext.getAllNodeFlags();

    // Filter by minimum severity if specified
    const minSeverityOrder: Record<string, number> = {
        'error': 0,
        'warning': 1,
        'info': 2,
        'hint': 3
    };
    const minLevel = minSeverityOrder[options?.minSeverity || 'warning'] ?? 1;

    nodeFlags.forEach((flag, nodeName) => {
        const filteredErrors = flag.errors.filter(e => {
            const errorLevel = minSeverityOrder[e.severity] ?? 3;
            return errorLevel <= minLevel;
        });

        filteredErrors.forEach((error, index) => {
            const noteId = `warning_${nodeName}_${index}`;
            const icon = getWarningIcon(error.severity);

            // Build warning content
            let content = `${icon} ${error.message}`;
            if (error.suggestion) {
                content += `\n\nSuggestion: ${error.suggestion}`;
            }

            const contentLines = breakLongText(content, 40);
            const htmlLabel = contentLines.map(line => escapeHtml(line)).join('<br/>');

            // Use different colors based on severity
            let color = '#FFF4CC'; // warning default
            if (error.severity === ValidationSeverity.ERROR) color = '#FFCCCC';
            else if (error.severity === ValidationSeverity.INFO) color = '#E3F2FD';
            else if (error.severity === ValidationSeverity.HINT) color = '#F5F5F5';

            lines.push(`  "${noteId}" [label=<${htmlLabel}>, shape=note, fillcolor="${color}", style=filled, fontsize=9];`);
            lines.push(`  "${noteId}" -> "${nodeName}" [style=dashed, color="#999999", arrowhead=none];`);
        });
    });

    return lines.join('\n');
}

/**
 * Generate inferred dependencies section
 */
function generateInferredDependencies(deps: any[]): string {
    if (deps.length === 0) return '';

    const lines: string[] = [];
    deps.forEach(dep => {
        lines.push(`  "${dep.source}" -> "${dep.target}" [label="${escapeDot(dep.reason)}", style=dashed, color=blue];`);
    });

    return lines.join('\n');
}

/**
 * Build runtime node states
 */
function buildNodeStates(machineJson: MachineJSON, context: RuntimeContext): RuntimeNodeState[] {
    return machineJson.nodes.map(node => {
        const isCurrent = node.name === context.currentNode;
        const isVisited = context.visitedNodes.has(node.name);
        const visitCount = context.history.filter(h => h.from === node.name).length;

        const lastVisit = context.history
            .filter(h => h.from === node.name)
            .pop()?.timestamp;

        const runtimeValues: Record<string, any> = {};

        // Only context nodes show runtime values
        // This keeps the visualization clean and semantically correct
        const isContextNode = node.type?.toLowerCase() === 'context';

        if (isContextNode) {
            // Context nodes show only their own attributes
            context.attributes.forEach((value, key) => {
                // Filter to this context's attributes only
                // Include: "Requirements" and "Requirements.needsCustomTool", etc.
                if (key === node.name || key.startsWith(`${node.name}.`)) {
                    runtimeValues[key] = value;
                }
            });
        }

        return {
            name: node.name,
            type: node.type,
            status: isCurrent ? 'current' : (isVisited ? 'visited' : 'pending'),
            visitCount,
            lastVisited: lastVisit,
            runtimeValues: Object.keys(runtimeValues).length > 0 ? runtimeValues : undefined,
            attributes: node.attributes?.map((attr: any) => ({
                name: attr.name,
                type: attr.type,
                value: attr.value,
                runtimeValue: runtimeValues[attr.name]
            }))
        };
    });
}

/**
 * Build runtime edge states
 */
function buildEdgeStates(machineJson: MachineJSON, context: RuntimeContext): RuntimeEdgeState[] {
    return machineJson.edges.map(edge => {
        const traversalCount = context.history.filter(
            h => h.from === edge.source && h.to === edge.target
        ).length;

        const lastTraversal = context.history
            .filter(h => h.from === edge.source && h.to === edge.target)
            .pop();

        const edgeValue = edge.attributes || {};
        const label = String(edgeValue.text || '');

        return {
            source: edge.source,
            target: edge.target,
            label,
            traversalCount,
            lastTraversed: lastTraversal?.timestamp,
            runtimeData: undefined
        };
    });
}

/**
 * Get status emoji for visual indication
 */
function getStatusEmoji(status: 'current' | 'visited' | 'pending'): string {
    switch (status) {
        case 'current': return '▶️';
        case 'visited': return '✅';
        case 'pending': return '⏸️';
        default: return '◯';
    }
}

/**
 * Get runtime node styling based on status
 */
function getRuntimeNodeStyle(node: RuntimeNodeState): string {
    switch (node.status) {
        case 'current':
            return 'fillcolor="#4CAF5012", style=filled, color="#2E7D32", penwidth=3';
        case 'visited':
            return 'fillcolor="#2196F312", style=filled, color="#1565C0", penwidth=2';
        case 'pending':
            return 'fillcolor="#FFC10712", style=filled, color="#F57F17"';
        default:
            return 'fillcolor="#FFFFFF", style=filled, color="#000000"';
    }
}

/**
 * Get runtime edge styling based on traversal status
 * Shows recently traversed edges (active), previously traversed edges, and untraversed edges
 */
function getRuntimeEdgeStyle(edge: RuntimeEdgeState, context: RuntimeContext): string {
    // Check if this is the most recent transition (active edge)
    const lastTransition = context.history[context.history.length - 1];
    const isActiveEdge = lastTransition &&
                         lastTransition.from === edge.source &&
                         lastTransition.to === edge.target;

    if (isActiveEdge) {
        // Active edge (just transitioned): thick green line
        return 'color="#4CAF50", penwidth=3, style=bold';
    } else if (edge.traversalCount > 0) {
        // Previously traversed edge: blue, thickness based on traversal count
        const width = Math.min(2 + edge.traversalCount * 0.5, 5); // Cap at penwidth 5
        return `color="#2196F3", penwidth=${width}`;
    } else {
        // Never traversed edge: gray, thin
        return 'color="#CCCCCC", penwidth=1, style=dashed';
    }
}

/**
 * Format attribute values for display
 */
function formatAttributeValue(value: any): string {
    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/^["']|["']$/g, '');
        return cleaned.length > 30 ? cleaned.substring(0, 30) + '...' : cleaned;
    }

    if (Array.isArray(value)) {
        return `[${value.join(', ')}]`;
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}
