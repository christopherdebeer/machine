/**
 * Graphviz DOT Diagram Generator
 *
 * Generates DOT syntax from MachineJSON for rendering with Graphviz.
 * Supports both static and runtime visualizations with full nested namespace support.
 */

import { MachineJSON, DiagramOptions, RuntimeContext, RuntimeNodeState, RuntimeEdgeState, SemanticHierarchy } from './types.js';
import { NodeTypeChecker } from '../node-type-checker.js';
import { ValidationContext, ValidationSeverity } from '../validation-errors.js';

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

    return (nodeType && shapeMap[nodeType]) || 'box';
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

                    // Append to style string
                    finalStyle += `, ${attr.name}="${attrValue}"`;
                }
            }
        }
    }

    return finalStyle;
}

/**
 * Generate HTML label for machine root showing title, description, version, and attributes
 */
function generateMachineLabel(machineJson: MachineJSON, options: DiagramOptions): string {
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
        const descValue = typeof descAttr.value === 'string'
            ? descAttr.value.replace(/^["']|["']$/g, '')
            : String(descAttr.value);
        htmlLabel += '<tr><td align="center"><font point-size="10"><i>' + escapeHtml(descValue) + '</i></font></td></tr>';
    }

    // Attributes table (excluding description and version which are shown above)
    const displayAttrs = machineJson.attributes?.filter(a =>
        a.name !== 'description' && a.name !== 'desc' && a.name !== 'version'
    ) || [];

    if (displayAttrs.length > 0) {
        htmlLabel += '<tr><td>';
        htmlLabel += '<table border="0" cellborder="1" cellspacing="0" cellpadding="2">';
        displayAttrs.forEach(attr => {
            let displayValue = attr.value;
            if (typeof displayValue === 'string') {
                displayValue = displayValue.replace(/^["']|["']$/g, '');
            }
            const typeStr = attr.type ? ' : ' + escapeHtml(attr.type) : '';
            htmlLabel += '<tr>';
            htmlLabel += '<td align="left">' + escapeHtml(attr.name) + typeStr + '</td>';
            htmlLabel += '<td align="left">' + escapeHtml(String(displayValue)) + '</td>';
            htmlLabel += '</tr>';
        });
        htmlLabel += '</table>';
        htmlLabel += '</td></tr>';
    }

    htmlLabel += '</table>';
    return htmlLabel;
}

/**
 * Generate a static DOT diagram from MachineJSON
 */
export function generateDotDiagram(machineJson: MachineJSON, options: DiagramOptions = {}): string {
    const lines: string[] = [];

    // Separate style nodes from renderable nodes
    const styleNodes = machineJson.nodes.filter(n => NodeTypeChecker.isStyleNode(n));
    const renderableNodes = machineJson.nodes.filter(n => !NodeTypeChecker.isStyleNode(n));

    // Header
    lines.push('digraph {');
    lines.push('  // Graph attributes');

    // Generate machine label with title, description, version, and attributes
    const machineLabel = generateMachineLabel(machineJson, options);
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
    lines.push(generateSemanticHierarchy(hierarchy, rootNodes, machineJson, 1, styleNodes, validationContext, options));
    lines.push('');

    // Generate edges
    if (machineJson.edges && machineJson.edges.length > 0) {
        lines.push('  // Edges');
        lines.push(generateEdges(machineJson, styleNodes));
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
 * Generate HTML label for namespace (parent node) showing id, type, annotations, title, description, and attributes
 */
function generateNamespaceLabel(node: any): string {
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // First row: ID (bold), Type (italic), Annotations (italic)
    let firstRow = '<b>' + escapeHtml(node.name) + '</b>';

    if (node.type) {
        firstRow += ' <i>&lt;' + escapeHtml(node.type) + '&gt;</i>';
    }

    // Annotations (excluding @note)
    if (node.annotations && node.annotations.length > 0) {
        const displayAnnotations = node.annotations.filter((ann: any) => ann.name !== 'note');
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
        htmlLabel += '<table border="0" cellborder="1" cellspacing="0" cellpadding="2">';
        displayAttrs.forEach((attr: any) => {
            let displayValue = attr.value;
            if (typeof displayValue === 'string') {
                displayValue = displayValue.replace(/^["']|["']$/g, '');
            }
            const typeStr = attr.type ? ' : ' + escapeHtml(attr.type) : '';
            htmlLabel += '<tr>';
            htmlLabel += '<td align="left">' + escapeHtml(attr.name) + typeStr + '</td>';
            htmlLabel += '<td align="left">' + escapeHtml(String(displayValue)) + '</td>';
            htmlLabel += '</tr>';
        });
        htmlLabel += '</table>';
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
    options?: DiagramOptions
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
            const namespaceLabel = generateNamespaceLabel(node);
            lines.push(`${indent}  label=<${namespaceLabel}>;`);

            lines.push(`${indent}  style=filled;`);
            lines.push(`${indent}  fontsize=10;`);
            lines.push(`${indent}  fillcolor="#FFFFFF";`);
            lines.push(`${indent}  color="#999999";`);
            lines.push('');

            // Recursively generate children
            const childNodes = children.map(childName => hierarchy[childName].node);
            lines.push(generateSemanticHierarchy(hierarchy, childNodes, machineJson, level + 1, styleNodes, validationContext, options));

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
        const displayAnnotations = node.annotations.filter((ann: any) => ann.name !== 'note');
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
        htmlLabel += '<table border="0" cellborder="1" cellspacing="0" cellpadding="2">';

        attributes.forEach((a: any) => {
            let displayValue = a.value?.value ?? a.value;
            if (typeof displayValue === 'string') {
                displayValue = displayValue.replace(/^["']|["']$/g, '');
                // Break long values into multiple lines
                displayValue = breakLongText(displayValue, 30).join('<br/>');
            }
            const typeStr = a.type ? ' : ' + escapeHtml(a.type) : '';

            htmlLabel += '<tr>';
            htmlLabel += '<td align="left">' + escapeHtml(a.name) + typeStr + '</td>';
            htmlLabel += '<td align="left">' + escapeHtml(String(displayValue)) + '</td>';
            htmlLabel += '</tr>';
        });

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
    const style = getNodeStyle(node, edges, styleNodes, validationContext);

    return `${indent}"${node.name}" [label=<${htmlLabel}>, shape=${shape}, ${style}];`;
}

/**
 * Break long text into multiple lines at word boundaries
 */
function breakLongText(text: string, maxLength: number): string[] {
    if (!text || text.length <= maxLength) {
        return [text || ''];
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxLength) {
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
function applyCustomEdgeStyles(edge: any, styleNodes: any[]): string {
    let customStyles = '';
    const edgeAnnotations = edge.annotations || [];

    if (edgeAnnotations.length === 0) {
        return customStyles;
    }

    // Find matching style nodes
    for (const styleNode of styleNodes) {
        const styleAnnotations = styleNode.annotations || [];

        // Check if any of the edge's annotations match the style node's selector annotation
        for (const styleAnnotation of styleAnnotations) {
            const hasMatchingAnnotation = edgeAnnotations.some(
                (edgeAnn: any) => edgeAnn.name === styleAnnotation.name
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

                    // Append to custom styles
                    customStyles += `, ${attr.name}="${attrValue}"`;
                }
            }
        }
    }

    return customStyles;
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
function generateEdges(machineJson: MachineJSON, styleNodes: any[] = []): string {
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
            const annotationLabels = edge.annotations.map((ann: any) =>
                ann.value ? `@${ann.name}("${ann.value}")` : `@${ann.name}`
            ).join(' ');
            if (label) {
                label = `${annotationLabels} ${label}`;
            } else {
                label = annotationLabels;
            }
        }

        // Get arrow style based on arrow type
        const arrowStyle = getArrowStyle(edge.arrowType || '->');

        // Apply custom styles from style nodes
        const customStyles = applyCustomEdgeStyles(edge, styleNodes);

        // Build edge attributes array
        const edgeAttrs: string[] = [];

        if (label) {
            edgeAttrs.push(`label="${escapeDot(label)}"`);
        }

        // Add multiplicity using taillabel and headlabel (proper UML style)
        if (edge.sourceMultiplicity) {
            edgeAttrs.push(`taillabel="${escapeDot(edge.sourceMultiplicity)}"`);
        }

        if (edge.targetMultiplicity) {
            edgeAttrs.push(`headlabel="${escapeDot(edge.targetMultiplicity)}"`);
        }

        if (arrowStyle) {
            edgeAttrs.push(arrowStyle);
        }

        edgeAttrs.push('labelOverlay="75%"');
        edgeAttrs.push('labelhref="#srcLineTBD"');

        // Apply custom styles if any
        if (customStyles) {
            // Custom styles are already formatted as ", attr1=value1, attr2=value2"
            // So we can just append them to the edge line directly
        }

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
        const edgeLine = `  "${actualSource}" -> "${actualTarget}" [${edgeAttrs.join(', ')}${customStyles}];`;
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

        // Build the note content
        let contentParts: string[] = [];

        // Add annotations if present
        if (note.annotations && note.annotations.length > 0) {
            const annotationStr = note.annotations
                .map((ann: any) => ann.value ? `@${ann.name}(${ann.value})` : `@${ann.name}`)
                .join(' ');
            contentParts.push(annotationStr);
        }

        // Add main content
        if (note.content) {
            contentParts.push(note.content);
        }

        // Add attributes if present
        if (note.attributes && note.attributes.length > 0) {
            const attrLines = note.attributes.map((attr: any) => {
                let displayValue = attr.value?.value ?? attr.value;
                if (typeof displayValue === 'string') {
                    displayValue = displayValue.replace(/^["']|["']$/g, '');
                }
                const typeStr = attr.type ? ` <${attr.type}>` : '';
                return `${attr.name}${typeStr}: ${displayValue}`;
            });
            contentParts.push('---');
            contentParts.push(...attrLines);
        }

        const fullContent = contentParts.join('\n');
        const content = breakLongText(fullContent, 40);
        const htmlLabel = content.map(line => escapeHtml(line)).join('<br/>');
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
