/**
 * Graphviz DOT Diagram Generator
 *
 * Generates DOT syntax from MachineJSON for rendering with Graphviz.
 * Supports both static and runtime visualizations with full nested namespace support.
 */

import { MachineJSON, DiagramOptions, RuntimeContext, RuntimeNodeState, RuntimeEdgeState, SemanticHierarchy } from './types.js';
import { NodeTypeChecker } from '../node-type-checker.js';

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
 */
function getNodeStyle(node: any, edges?: any[]): string {
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

    return baseStyle;
}

/**
 * Generate HTML label for machine root showing title, description, version, and attributes
 */
function generateMachineLabel(machineJson: MachineJSON, options: DiagramOptions): string {
    let htmlLabel = '<table border="0" cellborder="0" cellspacing="0" cellpadding="4">';

    // Title (bold, larger font)
    const title = options.title || machineJson.title || 'Machine Diagram';
    htmlLabel += '<tr><td align="center"><font point-size="12"><b>' + escapeHtml(title) + '</b></font></td></tr>';

    // Version (if present in attributes)
    const versionAttr = machineJson.attributes?.find(a => a.name === 'version');
    if (versionAttr || machineJson.annotations && machineJson.annotations.length > 0) {
        const versionValue = typeof versionAttr.value === 'string'
            ? versionAttr.value.replace(/^["']|["']$/g, '')
            : String(versionAttr.value);
            // Annotations (if present)
        const annText = machineJson.annotations?.map(ann =>
            ann.value ? '@' + ann.name + '("' + ann.value + '")' : '@' + ann.name
        ).join(' ');
        htmlLabel += '<tr><td align="center"><font point-size="10">v' + escapeHtml(versionValue || '') + ' ' + escapeHtml(annText || '') + '</font></td></tr>';
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

    // Build semantic hierarchy based on parent-child relationships
    const hierarchy = buildSemanticHierarchy(machineJson.nodes);
    const rootNodes = getRootNodes(machineJson.nodes);

    // Generate nodes organized by semantic/lexical nesting
    lines.push('  // Node definitions with nested namespaces');
    lines.push(generateSemanticHierarchy(hierarchy, rootNodes, machineJson, 1));
    lines.push('');

    // Generate edges
    if (machineJson.edges && machineJson.edges.length > 0) {
        lines.push('  // Edges');
        lines.push(generateEdges(machineJson));
    }

    // Generate notes as edge labels
    if (machineJson.notes && machineJson.notes.length > 0) {
        lines.push('');
        lines.push('  // Notes');
        lines.push(generateNotes(machineJson.notes));
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
        const titleText = node.title.replace(/^"|"$/g, '');
        let descValue = descAttr.value;
        if (typeof descValue === 'string') {
            descValue = descValue.replace(/^["']|["']$/g, '');
        }
        if (titleText !== node.name) {
            htmlLabel += `<tr><td align="left"><b>${ escapeHtml(titleText) }</b>${node.title && descAttr ? ' — ' : ''}<i>${ escapeHtml(String(descValue)) }</i></td></tr>`;
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
    level = 0
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
            lines.push(generateSemanticHierarchy(hierarchy, childNodes, machineJson, level + 1));

            lines.push(`${indent}}`);
        } else {
            // Leaf node
            lines.push(generateNodeDefinition(node, edges, indent));
        }
    });

    return lines.join('\n');
}

/**
 * Generate a node definition in DOT format with HTML-like labels for multi-line formatting
 */
function generateNodeDefinition(node: any, edges: any[], indent: string): string {
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

    htmlLabel += '</table>';

    // Get shape and styling
    const shape = getNodeShape(node, edges);
    const style = getNodeStyle(node, edges);

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
 * Generate edges section
 */
function generateEdges(machineJson: MachineJSON): string {
    const lines: string[] = [];

    if (!machineJson.edges || machineJson.edges.length === 0) {
        return '';
    }

    machineJson.edges.forEach(edge => {
        const edgeValue = edge.value || {};
        const keys = Object.keys(edgeValue);

        // Build label from edge value (without multiplicity)
        let label = '';
        const textValue = edgeValue.text;
        const otherProps = keys.filter(k => k !== 'text');

        if (otherProps.length > 0) {
            label = otherProps.map(key => `${key}=${edgeValue[key]}`).join(', ');
        } else if (textValue) {
            label = textValue;
        }

        // Get arrow style based on arrow type
        const arrowStyle = getArrowStyle(edge.arrowType || '->');

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

        const edgeLine = `  "${edge.source}" -> "${edge.target}" [${edgeAttrs.join(', ')}];`;
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
        const content = breakLongText(note.content, 40);
        const htmlLabel = content.map(line => escapeHtml(line)).join('<br/>');
        lines.push(`  "${noteId}" [label=<${htmlLabel}>, shape=note, fillcolor="#FFFACD", style=filled, fontsize=9];`);
        lines.push(`  "${noteId}" -> "${note.target}" [style=dashed, color="#999999", arrowhead=none];`);
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
