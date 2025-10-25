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

/**
 * Interpolate template variables in a string value
 * Attempts to resolve {{ variable }} patterns using the provided context
 * Returns original value if interpolation fails or no context is provided
 */
function interpolateValue(value: string, context?: RuntimeContext): string {
    if (!value || typeof value !== 'string') {
        return value;
    }

    // Check if the value contains template syntax
    const hasTemplate = /\{\{[^}]+\}\}/.test(value);
    if (!hasTemplate) {
        return value;
    }

    // If no context provided, mark it as a template
    if (!context) {
        // For static diagrams, show that this is a template
        return value; // Keep original for now, could add [TEMPLATE] indicator
    }

    // For runtime diagrams, interpolate using CEL evaluator
    try {
        const celEvaluator = new CelEvaluator();
        const celContext = {
            errorCount: context.errorCount || 0,
            activeState: context.activeState || '',
            attributes: Object.fromEntries(context.attributes || new Map())
        };

        return celEvaluator.resolveTemplate(value, celContext);
    } catch (error) {
        console.warn('Failed to interpolate template value:', value, error);
        return value; // Return original on error
    }
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
 * Format a DOT attribute value, adding quotes only when required
 */
function formatDotAttributeValue(value: string): string {
    const strValue = String(value);
    if (strValue.length === 0) {
        return '""';
    }
    const needsQuotes = /[^A-Za-z0-9_.-]/.test(strValue);
    const escaped = strValue
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
    return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Convert a Map of DOT attributes to a formatted attribute string
 */
function attributeMapToString(attributes: Map<string, string>): string {
    return Array.from(attributes.entries())
        .map(([key, value]) => `${key}=${formatDotAttributeValue(value)}`)
        .join(', ');
}

/**
 * Parse a @Style annotation payload into Graphviz attribute key/value pairs
 */
function parseStyleAnnotationValue(value?: string): Record<string, string> {
    if (!value) {
        return {};
    }

    const result: Record<string, string> = {};
    const trimmed = value.trim();
    if (!trimmed) {
        return result;
    }

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                if (parsed.length > 0) {
                    result['style'] = parsed.map(item => String(item)).join(',');
                }
            } else if (typeof parsed === 'object' && parsed !== null) {
                Object.entries(parsed).forEach(([key, val]) => {
                    result[key] = String(val);
                });
            }
            return result;
        } catch {
            // Fall back to manual parsing if JSON parsing fails
        }
    }

    const normalized = trimmed.replace(/;/g, ',');
    const segments = normalized
        .split(',')
        .map(segment => segment.trim())
        .filter(segment => segment.length > 0);

    const styleTokens: string[] = [];

    for (const segment of segments) {
        const namedMatch = segment.match(/^([A-Za-z0-9_\-]+)\s*[:=]\s*(.+)$/);
        if (namedMatch) {
            let attrValue = namedMatch[2].trim();
            if ((attrValue.startsWith('"') && attrValue.endsWith('"')) || (attrValue.startsWith('\'') && attrValue.endsWith('\''))) {
                attrValue = attrValue.slice(1, -1);
            }
            result[namedMatch[1]] = attrValue;
            continue;
        }

        const flagMatch = segment.match(/^([A-Za-z0-9_\-]+)$/);
        if (flagMatch) {
            styleTokens.push(flagMatch[1]);
            continue;
        }

        styleTokens.push(segment);
    }

    if (styleTokens.length > 0) {
        const existing = result['style'] ? result['style'].split(',').map(token => token.trim()).filter(Boolean) : [];
        const tokenSet = new Set([...existing, ...styleTokens]);
        result['style'] = Array.from(tokenSet).join(',');
    }

    return result;
}

/**
 * Extract inline style attributes from annotations, supporting multiple @Style entries
 */
function extractInlineStyleAttributes(annotations?: Array<{ name?: string; value?: string }>): Record<string, string> {
    if (!annotations || annotations.length === 0) {
        return {};
    }

    return annotations.reduce<Record<string, string>>((acc, annotation) => {
        if (!annotation?.name || annotation.name.toLowerCase() !== 'style') {
            return acc;
        }

        const parsed = parseStyleAnnotationValue(annotation.value);
        Object.entries(parsed).forEach(([key, val]) => {
            acc[key] = val;
        });
        return acc;
    }, {});
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

    const hasDeprecated = annotations.some((a: any) => a.name === 'Deprecated');
    const hasCritical = annotations.some((a: any) => a.name === 'Critical');
    const hasSingleton = annotations.some((a: any) => a.name === 'Singleton');
    const hasAbstract = annotations.some((a: any) => a.name === 'Abstract');

    const styleAttributes = new Map<string, string>();

    const setAttribute = (name: string, value: string) => {
        styleAttributes.set(name, value);
    };

    const appendStyleToken = (token: string) => {
        if (!token) return;
        const existing = styleAttributes.get('style');
        const tokens = existing ? existing.split(',').map(t => t.trim()).filter(Boolean) : [];
        if (!tokens.includes(token)) {
            tokens.push(token);
        }
        styleAttributes.set('style', tokens.join(','));
    };

    const defaultStyles: Record<string, { fillcolor: string; color: string }> = {
        task: { fillcolor: '#E3F2FD', color: '#1976D2' },
        state: { fillcolor: '#F3E5F5', color: '#7B1FA2' },
        context: { fillcolor: '#E8F5E9', color: '#388E3C' },
        tool: { fillcolor: '#FFF9C4', color: '#F57F17' },
        init: { fillcolor: '#FFF3E0', color: '#F57C00' }
    };

    const defaults = nodeType ? defaultStyles[nodeType] : undefined;
    if (defaults) {
        setAttribute('fillcolor', defaults.fillcolor);
        setAttribute('color', defaults.color);
    } else {
        setAttribute('fillcolor', '#FFFFFF');
        setAttribute('color', '#000000');
    }
    appendStyleToken('filled');

    if (hasDeprecated) {
        appendStyleToken('dashed');
        setAttribute('fontcolor', '#999999');
    }

    if (hasCritical) {
        setAttribute('penwidth', '3');
    }

    if (hasSingleton) {
        setAttribute('peripheries', '2');
    }

    if (hasAbstract) {
        appendStyleToken('dashed');
    }

    if (styleNodes && styleNodes.length > 0) {
        applyCustomStyles(node, styleNodes, styleAttributes);
    }

    const inlineStyles = extractInlineStyleAttributes(annotations);
    Object.entries(inlineStyles).forEach(([key, value]) => {
        styleAttributes.set(key, value);
    });

    if (validationContext) {
        const nodeFlag = validationContext.getNodeFlag(node.name);
        if (nodeFlag && nodeFlag.errors.length > 0) {
            const maxSeverity = getMaxSeverity(nodeFlag.errors);

            switch (maxSeverity) {
                case ValidationSeverity.ERROR:
                    setAttribute('penwidth', '3');
                    setAttribute('color', '#D32F2F');
                    break;
                case ValidationSeverity.WARNING:
                    setAttribute('penwidth', '2');
                    setAttribute('color', '#FFA726');
                    break;
                case ValidationSeverity.INFO:
                    setAttribute('penwidth', '2');
                    setAttribute('color', '#42A5F5');
                    appendStyleToken('dashed');
                    break;
                case ValidationSeverity.HINT:
                    setAttribute('penwidth', '1');
                    setAttribute('color', '#9E9E9E');
                    appendStyleToken('dashed');
                    break;
            }
        }
    }

    return attributeMapToString(styleAttributes);
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
function applyCustomStyles(node: any, styleNodes: any[], attributes: Map<string, string>): void {
    const nodeAnnotations = node.annotations || [];

    for (const styleNode of styleNodes) {
        const styleAnnotations = styleNode.annotations || [];

        for (const styleAnnotation of styleAnnotations) {
            const hasMatchingAnnotation = nodeAnnotations.some(
                (nodeAnn: any) => nodeAnn.name === styleAnnotation.name
            );

            if (!hasMatchingAnnotation) {
                continue;
            }

            const styleAttrs = styleNode.attributes || [];
            for (const attr of styleAttrs) {
                let attrValue = attr.value;

                if (typeof attrValue === 'string') {
                    attrValue = attrValue.replace(/^["']|["']$/g, '');
                }

                if (attrValue === undefined || attrValue === null || attrValue === '') {
                    attributes.set(attr.name, 'true');
                } else {
                    attributes.set(attr.name, String(attrValue));
                }
            }
        }
    }
}

/**
 * Generate HTML label for machine root showing title, description, version, and attributes
 */
function generateMachineLabel(machineJson: MachineJSON, options: DiagramOptions, wrappingConfig: TextWrappingConfig): string {
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // Title (bold, larger font)
    const title = options.title || machineJson.title || '';
    if (title) htmlLabel += '<tr><td align="center"><font point-size="12"><b>' + escapeHtml(title) + '</b></font></td></tr>';

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
        const annText = machineJson.annotations?.map(ann =>
            ann.value ? '@' + ann.name + '("' + ann.value + '")' : '@' + ann.name
        ).join(' ');
        htmlLabel += '<tr><td align="center"><font point-size="10">v' + escapeHtml(versionValue) + ' ' + escapeHtml(annText || '') + '</font></td></tr>';
    }

    // Description (if present in attributes)
    const descAttr = machineJson.attributes?.find(a => a.name === 'description' || a.name === 'desc');
    if (descAttr) {
        let descValue = typeof descAttr.value === 'string'
            ? descAttr.value.replace(/^["']|["']$/g, '')
            : String(descAttr.value);
        // Interpolate templates if runtime context is available
        descValue = interpolateValue(descValue, options.runtimeContext);
        htmlLabel += '<tr><td align="center"><font point-size="10"><i>' + escapeHtml(descValue) + '</i></font></td></tr>';
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
    maxNoteContentLength: number;
}

/**
 * Get text wrapping configuration from machine attributes or use defaults
 */
function getTextWrappingConfig(machineJson: MachineJSON): TextWrappingConfig {
    const attrs = machineJson.attributes || [];
    
    const getAttrValue = (name: string, defaultValue: number): number => {
        const attr = attrs.find(a => a.name === name);
        if (attr?.value !== undefined) {
            const value = typeof attr.value === 'string' 
                ? parseInt(attr.value.replace(/^["']|["']$/g, ''), 10)
                : Number(attr.value);
            return isNaN(value) ? defaultValue : value;
        }
        return defaultValue;
    };

    return {
        maxEdgeLabelLength: getAttrValue('maxEdgeLabelLength', 40),
        maxMultiplicityLength: getAttrValue('maxMultiplicityLength', 20),
        maxAttributeKeyLength: getAttrValue('maxAttributeKeyLength', 25),
        maxAttributeValueLength: getAttrValue('maxAttributeValueLength', 30),
        maxNodeTitleLength: getAttrValue('maxNodeTitleLength', 40),
        maxNoteContentLength: getAttrValue('maxNoteContentLength', 40),
    };
}

/**
 * Generate a static DOT diagram from MachineJSON
 */
export function generateDotDiagram(machineJson: MachineJSON, options: DiagramOptions = {}): string {
    const lines: string[] = [];

    // Get text wrapping configuration from machine attributes
    const wrappingConfig = getTextWrappingConfig(machineJson);

    // Separate style nodes from renderable nodes
    const styleNodes = machineJson.nodes.filter(n => NodeTypeChecker.isStyleNode(n));
    const renderableNodes = machineJson.nodes.filter(n => !NodeTypeChecker.isStyleNode(n));

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
    lines.push('  node [fontname="Arial", fontsize=10];');  // Removed default shape=record to allow per-node shapes
    lines.push('  edge [fontname="Arial", fontsize=9];');
    lines.push('');

    // Build semantic hierarchy based on parent-child relationships (using only renderable nodes)
    const hierarchy = buildSemanticHierarchy(renderableNodes);
    const rootNodes = getRootNodes(renderableNodes);

    // Extract validation context from options
    const validationContext = options.validationContext as ValidationContext | undefined;

    // Generate nodes organized by semantic/lexical nesting
    lines.push('  // Node definitions with nested namespaces');
    lines.push(generateSemanticHierarchy(hierarchy, rootNodes, machineJson, 1, styleNodes, validationContext, options, wrappingConfig));
    lines.push('');

    // Generate edges
    if (machineJson.edges && machineJson.edges.length > 0) {
        lines.push('  // Edges');
        lines.push(generateEdges(machineJson, styleNodes, wrappingConfig));
    }

    // Generate notes as edge labels
    if (machineJson.notes && machineJson.notes.length > 0) {
        lines.push('');
        lines.push('  // Notes');
        lines.push(generateNotes(machineJson.notes));
    }

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

    lines.push('}');

    return lines.join('\n');
}

/**
 * Generate a runtime DOT diagram with execution state
 */
export function generateRuntimeDotDiagram(
    machineJson: MachineJSON,
    context: RuntimeContext,
    options: DiagramOptions = {}
): string {
    const lines: string[] = [];
    const nodeStates = buildNodeStates(machineJson, context);
    const edgeStates = buildEdgeStates(machineJson, context);

    // Header with runtime indicator
    lines.push('digraph {');
    lines.push('  // Graph attributes');
    lines.push('  label="' + escapeDot((machineJson.title || 'Machine') + ' [RUNTIME]') + '";');
    lines.push('  labelloc="t";');
    lines.push('  fontsize=16;');
    lines.push('  fontname="Arial";');
    lines.push('  compound=true;');
    lines.push('  rankdir=TB;');
    lines.push('  pad=0.25;');
    lines.push('  node [fontname="Arial", fontsize=10, shape=record];');  // Restored shape=record for runtime diagrams
    lines.push('  edge [fontname="Arial", fontsize=9];');
    lines.push('');

    // Generate nodes with runtime state
    lines.push('  // Nodes with runtime state');
    nodeStates.forEach(node => {
        const statusEmoji = getStatusEmoji(node.status);
        const statusText = node.status.toUpperCase();

        // Build label
        let label = '';
        if (options.showRuntimeState !== false) {
            label = `${statusEmoji} ${node.name}`;
        } else {
            label = node.name;
        }

        // Build attributes section
        const attrs: string[] = [];

        if (node.type) {
            attrs.push(`&lt;${node.type}&gt;`);
        }

        if (options.showRuntimeState !== false) {
            attrs.push(`status: ${statusText}`);
            if (node.visitCount > 0) {
                attrs.push(`visits: ${node.visitCount}`);
            }
        }

        // Add node attributes with runtime values
        if (node.attributes && node.attributes.length > 0) {
            node.attributes.forEach(attr => {
                if (attr.name === 'prompt' || attr.name === 'desc') return;

                let displayValue = formatAttributeValue(attr.value);

                // Interpolate template values in attributes for runtime diagrams
                if (typeof attr.value === 'string' && context) {
                    const interpolated = interpolateValue(attr.value, context);
                    if (interpolated !== attr.value) {
                        displayValue = formatAttributeValue(interpolated);
                    }
                }

                if (options.showRuntimeValues && attr.runtimeValue !== undefined &&
                    attr.runtimeValue !== attr.value) {
                    displayValue = `${displayValue} → ${formatAttributeValue(attr.runtimeValue)}`;
                }

                const typeAnnotation = attr.type ? ` : ${attr.type}` : '';
                attrs.push(`${attr.name}${typeAnnotation} = ${displayValue}`);
            });
        }

        // Add runtime values if any
        if (options.showRuntimeValues && node.runtimeValues) {
            Object.entries(node.runtimeValues).forEach(([key, value]) => {
                attrs.push(`${key}[runtime] = ${formatAttributeValue(value)}`);
            });
        }

        // Format as DOT record
        const recordLabel = attrs.length > 0
            ? `{${escapeDot(label)}|${attrs.map(a => escapeDot(a)).join('\\n')}}`
            : escapeDot(label);

        // Get styling based on status
        const style = getRuntimeNodeStyle(node);

        lines.push(`  "${node.name}" [label="${recordLabel}", ${style}];`);
    });

    lines.push('');

    // Generate edges with runtime information
    lines.push('  // Edges with runtime state');
    edgeStates.forEach(edge => {
        let label = edge.label || '';

        if (options.showVisitCounts !== false && edge.traversalCount > 0) {
            label += (label ? ' ' : '') + `[${edge.traversalCount}x]`;
        }

        if (options.showRuntimeValues && edge.runtimeData) {
            const runtimeInfo = Object.entries(edge.runtimeData)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ');
            if (runtimeInfo) {
                label += (label ? ', ' : '') + runtimeInfo;
            }
        }

        const edgeLine = label
            ? `  "${edge.source}" -> "${edge.target}" [label="${escapeDot(label)}"];`
            : `  "${edge.source}" -> "${edge.target}";`;
        lines.push(edgeLine);
    });

    // Add execution path information as comments
    if (options.showExecutionPath && context.history.length > 0) {
        lines.push('');
        lines.push('  // Execution Path:');
        context.history.forEach((step, idx) => {
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
 * Build semantic hierarchy based on parent-child relationships
 */
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
function generateAttributesTable(attributes: any[], runtimeContext?: RuntimeContext, wrappingConfig?: TextWrappingConfig): string {
    if (!attributes || attributes.length === 0) {
        return '';
    }

    let html = '<table border="0" cellborder="1" cellspacing="0" cellpadding="2" align="left">';
    attributes.forEach((attr: any) => {
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

        // Break long values into multiple lines - escape BEFORE joining with <br/>
        // Preserve existing line breaks for multiline strings and formatted JSON
        if (typeof displayValue === 'string') {
            const lines = breakLongText(displayValue, maxValueLength, { preserveLineBreaks: true });
            displayValue = lines.map(line => escapeHtml(line)).join('<br align="left"/>');
        } else {
            displayValue = escapeHtml(String(displayValue));
        }

        // Break long attribute names into multiple lines - escape BEFORE joining with <br/>
        let attrName = attr.name;
        if (attrName && attrName.length > maxKeyLength) {
            const lines = breakLongText(attrName, maxKeyLength);
            attrName = lines.map(line => escapeHtml(line)).join('<br align="left"/>');
        } else {
            attrName = escapeHtml(attrName);
        }

        const typeStr = attr.type ? ' : ' + escapeHtml(attr.type) : '';
        html += '<tr>';
        html += '<td align="left" balign="left">' + attrName + typeStr + '</td>';
        html += '<td align="left" balign="left">' + displayValue + '</td>';
        html += '</tr>';
    });
    html += '</table>';
    return html;
}

/**
 * Generate HTML label for namespace (parent node) showing id, type, annotations, title, description, and attributes
 */
function generateNamespaceLabel(node: any, runtimeContext?: RuntimeContext): string {
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // First row: ID (bold), Type (italic), Annotations (italic)
    let firstRow = '<b>' + escapeHtml(node.name) + '</b>';

    if (node.type) {
        firstRow += ' <i>&lt;' + escapeHtml(node.type) + '&gt;</i>';
    }

    // Annotations (excluding @note)
    if (node.annotations && node.annotations.length > 0) {
        const displayAnnotations = node.annotations.filter((ann: any) => ann.name !== 'note' && ann.name?.toLowerCase() !== 'style');
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

    htmlLabel += '<tr><td align="left">' + firstRow + '</td></tr>';

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
            htmlLabel += `<tr><td align="left"><b>${ escapeHtml(titleText) }</b>${node.title && descAttr ? ' — ' : ''}<i>${ escapeHtml(String(descValue || '')) }</i></td></tr>`;
        }
    }

    // Attributes table (excluding description/desc/prompt)
    const displayAttrs = node.attributes?.filter((a: any) =>
        a.name !== 'description' && a.name !== 'desc' && a.name !== 'prompt'
    ) || [];

    if (displayAttrs.length > 0) {
        htmlLabel += '<tr><td>';
        htmlLabel += generateAttributesTable(displayAttrs, runtimeContext);
        htmlLabel += '</td></tr>';
    }

    htmlLabel += '</table>';
    return htmlLabel;
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
    wrappingConfig?: TextWrappingConfig
): string {
    const lines: string[] = [];
    const indent = '  '.repeat(level);
    const edges = machineJson.edges;

    nodes.forEach(node => {
        const { children } = hierarchy[node.name];

        if (children.length > 0) {
            // Node has children - create a cluster subgraph with enhanced label
            lines.push(`${indent}subgraph cluster_${node.name} {`);

            // Generate rich HTML label for namespace showing id, type, annotations, title, description, and attributes
            const namespaceLabel = generateNamespaceLabel(node, options?.runtimeContext);
            lines.push(`${indent}  label=<${namespaceLabel}>;`);

            lines.push(`${indent}  style=filled;`);
            lines.push(`${indent}  fontsize=10;`);
            lines.push(`${indent}  fillcolor="#FFFFFF";`);
            lines.push(`${indent}  color="#999999";`);
            lines.push('');

            // Recursively generate children
            const childNodes = children.map(childName => hierarchy[childName].node);
            lines.push(generateSemanticHierarchy(hierarchy, childNodes, machineJson, level + 1, styleNodes, validationContext, options, wrappingConfig));

            lines.push(`${indent}}`);
        } else {
            // Leaf node
            lines.push(generateNodeDefinition(node, edges, indent, styleNodes, validationContext, options));
        }
    });

    return lines.join('\n');
}

/**
 * Generate a node definition in DOT format with HTML-like labels for multi-line formatting
 */
function generateNodeDefinition(node: any, edges: any[], indent: string, styleNodes: any[] = [], validationContext?: ValidationContext, options?: DiagramOptions): string {
    const desc = node.attributes?.find((a: any) => a.name === 'desc') ||
                 node.attributes?.find((a: any) => a.name === 'prompt');
    let displayValue: any = node.title || desc?.value;
    if (displayValue && typeof displayValue === 'string') {
        displayValue = displayValue.replace(/^["']|["']$/g, '');
        // Interpolate templates if runtime context is available
        displayValue = interpolateValue(displayValue, options?.runtimeContext);
    }

    // Build HTML label
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // First row: Type (italic), ID (bold), Annotations (italic) ONLY
    htmlLabel += '<tr><td align="left">';

    let firstRowContent = '';

    // ID (bold) - always present
    firstRowContent += '<b>' + escapeHtml(node.name) + '</b>';

    // Type first (italic)
    if (node.type) {
        firstRowContent += ' <i>&lt;' + escapeHtml(node.type) + '&gt;</i>';
    }

    // Annotations (italic)
    if (node.annotations && node.annotations.length > 0) {
        const displayAnnotations = node.annotations.filter((ann: any) => ann.name !== 'note' && ann.name?.toLowerCase() !== 'style');
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

    // Second row: Title/Description (if different from ID)
    if (displayValue && displayValue !== node.name) {
        htmlLabel += '<tr><td align="left">';
        const titleLines = breakLongText(displayValue, 40);
        htmlLabel += titleLines.map(line => escapeHtml(line)).join('<br/>');
        htmlLabel += '</td></tr>';
    }

    // Attributes table
    const attributes = node.attributes?.filter((a: any) =>
        a.name !== 'desc' && a.name !== 'prompt'
    ) || [];

    if (attributes.length > 0) {
        htmlLabel += '<tr><td>';
        htmlLabel += generateAttributesTable(attributes, options?.runtimeContext);
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
    const style = getNodeStyle(node, edges, styleNodes, validationContext);

    return `${indent}"${node.name}" [label=<${htmlLabel}>, shape=${shape}, ${style}];`;
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
 * Helper function to find first child node of a parent cluster
 */
function findFirstChild(nodes: any[], parentName: string): string | null {
    for (const node of nodes) {
        if (node.parent === parentName) {
            return node.name;
        }
    }
    return null;
}

/**
 * Apply custom styles from style nodes to edges based on annotation matching
 */
function applyCustomEdgeStyles(edge: any, styleNodes: any[]): Record<string, string> {
    const styles: Record<string, string> = {};
    const edgeAnnotations = edge.annotations || [];

    if (edgeAnnotations.length === 0) {
        return styles;
    }

    for (const styleNode of styleNodes) {
        const styleAnnotations = styleNode.annotations || [];

        for (const styleAnnotation of styleAnnotations) {
            const hasMatchingAnnotation = edgeAnnotations.some(
                (edgeAnn: any) => edgeAnn.name === styleAnnotation.name
            );

            if (!hasMatchingAnnotation) {
                continue;
            }

            const styleAttrs = styleNode.attributes || [];
            for (const attr of styleAttrs) {
                let attrValue = attr.value;

                if (typeof attrValue === 'string') {
                    attrValue = attrValue.replace(/^["']|["']$/g, '');
                }

                if (attrValue === undefined || attrValue === null || attrValue === '') {
                    styles[attr.name] = 'true';
                } else {
                    styles[attr.name] = String(attrValue);
                }
            }
        }
    }

    return styles;
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
 * Generate edges section with support for compound edges between clusters
 */
function generateEdges(machineJson: MachineJSON, styleNodes: any[] = [], wrappingConfig?: TextWrappingConfig): string {
    const lines: string[] = [];

    if (!machineJson.edges || machineJson.edges.length === 0) {
        return '';
    }

    // Build a set of parent nodes (nodes that have children)
    const parentNodes = new Set<string>();
    machineJson.nodes.forEach(node => {
        if (node.parent) {
            parentNodes.add(node.parent);
        }
    });

    // Process all edges, including parent-to-parent edges using compound edge features
    machineJson.edges.forEach(edge => {
        const edgeValue = edge.value || {};
        const keys = Object.keys(edgeValue);
        const showAnnotation = shouldShowEdgeAnnotation(edge);

        // Build label from edge value (without multiplicity)
        let label = '';
        const textValue = edgeValue.text;
        const otherProps = keys.filter(k => k !== 'text');

        if (otherProps.length > 0) {
            label = otherProps.map(key => `${key}=${edgeValue[key]}`).join(', ');
        } else if (textValue) {
            label = textValue;
        }

        // Add annotation names to label if showAnnotation is true
        if (showAnnotation && edge.annotations && edge.annotations.length > 0) {
            const annotationLabels = edge.annotations
                .filter((ann: any) => ann.name?.toLowerCase() !== 'style')
                .map((ann: any) => ann.value ? `@${ann.name}("${ann.value}")` : `@${ann.name}`)
                .join(' ');
            if (annotationLabels) {
                if (label) {
                    label = `${annotationLabels} ${label}`;
                } else {
                    label = annotationLabels;
                }
            }
        }

        // Use wrappingConfig values or defaults
        const maxEdgeLabelLength = wrappingConfig?.maxEdgeLabelLength ?? 40;
        const maxMultiplicityLength = wrappingConfig?.maxMultiplicityLength ?? 20;

        // Apply text wrapping to edge label
        if (label) {
            const wrappedLines = breakLongText(label, maxEdgeLabelLength);
            label = wrappedLines.join('\\n');
        }

        // Get arrow style based on arrow type
        const arrowStyle = getArrowStyle(edge.arrowType || '->');

        // Apply custom styles from style nodes
        const customStyles = applyCustomEdgeStyles(edge, styleNodes);
        const inlineEdgeStyles = extractInlineStyleAttributes(edge.annotations);

        // Build edge attributes array
        const edgeAttrs: string[] = [];

        if (label) {
            edgeAttrs.push(`label="${escapeDot(label)}"`);
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
        edgeAttrs.push('labelhref="#srcLineTBD"');

        const mergedStyles: Record<string, string> = { ...customStyles };
        Object.entries(inlineEdgeStyles).forEach(([key, value]) => {
            mergedStyles[key] = value;
        });

        Object.entries(mergedStyles).forEach(([key, value]) => {
            edgeAttrs.push(`${key}=${formatDotAttributeValue(value)}`);
        });

        // Handle compound edges for parent-to-parent connections
        const sourceIsParent = parentNodes.has(edge.source);
        const targetIsParent = parentNodes.has(edge.target);

        let actualSource = edge.source;
        let actualTarget = edge.target;

        // For compound edges, connect via child nodes but use ltail/lhead
        // to make the edge appear to come from/go to the cluster boundary
        if (sourceIsParent) {
            const sourceChild = findFirstChild(machineJson.nodes, edge.source);
            if (sourceChild) {
                actualSource = sourceChild;
                edgeAttrs.push(`ltail="cluster_${edge.source}"`);
            } else {
                // Skip edges from empty clusters
                return;
            }
        }

        if (targetIsParent) {
            const targetChild = findFirstChild(machineJson.nodes, edge.target);
            if (targetChild) {
                actualTarget = targetChild;
                edgeAttrs.push(`lhead="cluster_${edge.target}"`);
            } else {
                // Skip edges to empty clusters
                return;
            }
        }

        // Construct edge line with custom styles appended
        const edgeLine = `  "${actualSource}" -> "${actualTarget}" [${edgeAttrs.join(', ')}];`;
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
function generateNotes(notes: any[]): string {
    if (!notes || notes.length === 0) return '';

    const lines: string[] = [];
    notes.forEach((note, index) => {
        // Create a visible note node connected to the target
        const noteId = `note_${index}_${note.target}`;

        // Build HTML label similar to nodes
        let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

        // First row: Annotations (if present)
        if (note.annotations && note.annotations.length > 0) {
            const annotationStr = note.annotations
                .map((ann: any) => ann.value ? `@${ann.name}(${ann.value})` : `@${ann.name}`)
                .join(' ');
            htmlLabel += '<tr><td align="left"><i>' + escapeHtml(annotationStr) + '</i></td></tr>';
        }

        // Second row: Main content
        if (note.content) {
            const content = breakLongText(note.content, 40);
            htmlLabel += '<tr><td align="left">' + content.map(line => escapeHtml(line)).join('<br/>') + '</td></tr>';
        }

        // Attributes table (using shared function)
        if (note.attributes && note.attributes.length > 0) {
            htmlLabel += '<tr><td>';
            htmlLabel += generateAttributesTable(note.attributes);
            htmlLabel += '</td></tr>';
        }

        htmlLabel += '</table>';

        lines.push(`  "${noteId}" [label=<${htmlLabel}>, shape=note, fillcolor="#FFFACD", style=filled, fontsize=9];`);
        lines.push(`  "${noteId}" -> "${note.target}" [style=dashed, color="#999999", arrowhead=none];`);
    });

    return lines.join('\n');
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

        if (isCurrent && context.attributes.size > 0) {
            context.attributes.forEach((value, key) => {
                runtimeValues[key] = value;
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

        const edgeValue = edge.value || {};
        const label = edgeValue.text || '';

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
            return 'fillcolor="#4CAF50", style=filled, color="#2E7D32", penwidth=3';
        case 'visited':
            return 'fillcolor="#2196F3", style=filled, color="#1565C0", penwidth=2';
        case 'pending':
            return 'fillcolor="#FFC107", style=filled, color="#F57F17"';
        default:
            return 'fillcolor="#FFFFFF", style=filled, color="#000000"';
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
