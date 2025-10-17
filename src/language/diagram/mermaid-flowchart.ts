/**
 * Mermaid Flowchart Generator
 *
 * Generates mermaid flowchart syntax from MachineJSON.
 * Flowcharts support native subgraphs which perfectly handle semantic nesting
 * without the limitations of class diagram namespaces.
 *
 * Benefits over class diagrams:
 * - Native nested subgraph support (no namespace mixing issues)
 * - Multiple node shapes for different types
 * - Better visual representation of workflows and hierarchies
 * - Cleaner syntax for parent-child relationships
 */

import { MachineJSON, MermaidOptions, RuntimeContext, SemanticHierarchy } from './types.js';
import { NodeTypeChecker } from '../node-type-checker.js';

/**
 * Helper function to sanitize node IDs for Mermaid
 */
function sanitizeId(name: string): string {
    // Replace dots and special characters with underscores
    return name.replace(/[.\-\s]/g, '_');
}

/**
 * Get node shape based on type
 */
function getNodeShape(node: any): { start: string; end: string } {
    const nodeType = NodeTypeChecker.getNodeType(node);

    if (nodeType === 'task') {
        return { start: '[', end: ']' }; // Rectangle
    } else if (nodeType === 'state') {
        return { start: '([', end: '])' }; // Stadium (pill shape)
    } else if (nodeType === 'context') {
        return { start: '[[', end: ']]' }; // Subroutine (rectangle with bars)
    } else if (nodeType === 'init') {
        return { start: '([', end: '])' }; // Stadium (pill shape)
    } else if (nodeType === 'tool') {
        return { start: '{{', end: '}}' }; // Hexagon
    } else {
        return { start: '(', end: ')' }; // Circle (default)
    }
}

/**
 * Helper function to wrap text at word boundaries
 */
function wrapText(text: string, maxWidth: number = 40): string {
    if (text.length <= maxWidth) return text;

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (testLine.length <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);

    return lines.join('<br/>');
}

/**
 * Get label for a node - includes title/description and key attributes
 */
function getNodeLabel(node: any): string {
    // Priority: title > desc attribute > prompt attribute > label > name
    const desc = node.attributes?.find((a: any) => a.name === 'desc') ||
                 node.attributes?.find((a: any) => a.name === 'prompt');
    let displayValue: any = node.title || desc?.value;

    if (displayValue && typeof displayValue === 'string') {
        displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
        displayValue = wrapText(displayValue, 40); // Apply text wrapping
    }

    const primaryLabel = displayValue || node.label || node.name;
    const sanitizedLabel = primaryLabel.replace(/"/g, '#quot;');

    // Add key attributes as additional lines (limit to 2 most important)
    const attributes = node.attributes?.filter((a: any) =>
        a.name !== 'desc' && a.name !== 'prompt'
    ) || [];

    if (attributes.length > 0) {
        const attrLines: string[] = [];
        attributes.slice(0, 2).forEach((attr: any) => {
            let attrValue = attr.value?.value ?? attr.value;
            if (typeof attrValue === 'string') {
                attrValue = attrValue.replace(/^["']|["']$/g, '');
                if (attrValue.length > 20) attrValue = attrValue.substring(0, 20) + '...';
            }
            const typeStr = attr.type ? `<${attr.type}>` : '';
            attrLines.push(`${attr.name}${typeStr}: ${attrValue}`.replace(/"/g, '#quot;'));
        });

        if (attrLines.length > 0) {
            return sanitizedLabel + '<br/>' + attrLines.join('<br/>');
        }
    }

    return sanitizedLabel;
}

/**
 * Maps DyGram arrow types to Mermaid flowchart arrow types
 */
function getFlowchartArrow(arrowType: string): string {
    const mapping: Record<string, string> = {
        '->': '-->',      // Solid arrow
        '-->': '-.->',    // Dotted arrow (dependency)
        '=>': '==>',      // Thick arrow (emphasis)
        '<-->': '<-->',   // Bidirectional
        '-reads->': '-.->',   // Dotted (data dependency)
        '-writes->': '==>',   // Thick (data flow)
        '-error->': '-.->',   // Dotted (error path)
        '@auto': '-->',       // Solid (automatic transition)
    };
    return mapping[arrowType] || '-->';
}

/**
 * Build semantic hierarchy based on parent-child relationships
 */
function buildSemanticHierarchy(nodes: any[]): SemanticHierarchy {
    const hierarchy: SemanticHierarchy = {};

    // Initialize hierarchy with all nodes
    nodes.forEach(node => {
        hierarchy[node.name] = {
            node: node,
            children: []
        };
    });

    // Build parent-child relationships
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
 * Generate flowchart nodes and subgraphs recursively
 */
function generateHierarchy(
    hierarchy: SemanticHierarchy,
    nodes: any[],
    level: number = 0
): string[] {
    const lines: string[] = [];
    const indent = '    '.repeat(level);

    nodes.forEach(node => {
        const { children } = hierarchy[node.name];
        const nodeId = sanitizeId(node.name);
        const shape = getNodeShape(node.node);
        const label = getNodeLabel(node.node);

        // If node has children, create a subgraph
        if (children.length > 0) {
            const subgraphLabel = label.replace(/#quot;/g, '"');
            lines.push(`${indent}subgraph ${nodeId}["${subgraphLabel}"]`);

            // Add the parent node itself inside its subgraph
            lines.push(`${indent}    ${nodeId}_self${shape.start}"${label}"${shape.end}`);

            // Recursively add children
            const childNodes = children.map(childName => ({
                name: childName,
                node: hierarchy[childName].node
            }));
            const childLines = generateHierarchy(hierarchy, childNodes, level + 1);
            lines.push(...childLines);

            lines.push(`${indent}end`);
        } else {
            // Leaf node - just add the node definition
            lines.push(`${indent}${nodeId}${shape.start}"${label}"${shape.end}`);
        }
    });

    return lines;
}

/**
 * Generate node type styling for flowcharts
 */
function generateNodeTypeStyling(): string[] {
    const lines: string[] = [];

    lines.push('  %% Node Type Styling');
    lines.push('  classDef taskType fill:#E3F2FD,stroke:#1976D2,stroke-width:2px');
    lines.push('  classDef stateType fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px');
    lines.push('  classDef contextType fill:#E8F5E9,stroke:#388E3C,stroke-width:2px');
    lines.push('  classDef inputType fill:#FFF3E0,stroke:#F57C00,stroke-width:2px');
    lines.push('  classDef resultType fill:#FFF3E0,stroke:#F57C00,stroke-width:2px');
    lines.push('  classDef conceptType fill:#FCE4EC,stroke:#C2185B,stroke-width:2px');

    return lines;
}

/**
 * Apply styling to nodes based on their type
 */
function applyNodeStyling(nodes: any[]): string[] {
    const lines: string[] = [];

    nodes.forEach(node => {
        const nodeId = sanitizeId(node.name);
        const nodeType = NodeTypeChecker.getNodeType(node);
        let styleClass = '';

        if (nodeType === 'task') {
            styleClass = 'taskType';
        } else if (nodeType === 'state') {
            styleClass = 'stateType';
        } else if (nodeType === 'context') {
            styleClass = 'contextType';
        } else if (nodeType === 'init') {
            styleClass = 'inputType';
        } else if (nodeType === 'tool') {
            styleClass = 'conceptType';
        }

        if (styleClass) {
            lines.push(`  class ${nodeId} ${styleClass}`);
            // Also style the _self variant for parent nodes with children
            const hasChildren = nodes.some(n => n.parent === node.name);
            if (hasChildren) {
                lines.push(`  class ${nodeId}_self ${styleClass}`);
            }
        }
    });

    return lines;
}

/**
 * Generate edges between nodes
 */
function generateEdges(machineJson: MachineJSON): string[] {
    const lines: string[] = [];
    const edges = machineJson.edges || [];

    edges.forEach(edge => {
        const sourceId = sanitizeId(edge.source);
        const targetId = sanitizeId(edge.target);
        const arrowType = getFlowchartArrow(edge.arrowType || edge.label || '->');

        // Check if source or target have children (use _self variant)
        const sourceHasChildren = machineJson.nodes.some(n => n.parent === edge.source);
        const targetHasChildren = machineJson.nodes.some(n => n.parent === edge.target);

        const actualSource = sourceHasChildren ? `${sourceId}_self` : sourceId;
        const actualTarget = targetHasChildren ? `${targetId}_self` : targetId;

        let label = edge.label || '';
        if (label && label !== edge.arrowType) {
            lines.push(`  ${actualSource} ${arrowType} ${actualTarget} |"${label}"|`);
        } else {
            lines.push(`  ${actualSource} ${arrowType} ${actualTarget}`);
        }
    });

    return lines;
}

/**
 * Generate comments showing additional attributes and annotations
 * (Flowcharts don't support notes, so we use comments for documentation)
 */
function generateAttributeComments(machineJson: MachineJSON): string[] {
    const lines: string[] = [];
    let hasComments = false;

    machineJson.nodes.forEach(node => {
        const attributes = node.attributes?.filter((a: any) =>
            a.name !== 'desc' && a.name !== 'prompt'
        ) || [];
        const annotations = node.annotations?.filter((ann: any) => ann.name !== 'note') || [];

        if (attributes.length > 2 || annotations.length > 0) {
            if (!hasComments) {
                lines.push('');
                lines.push('  %% Additional Node Details:');
                hasComments = true;
            }

            lines.push(`  %% ${node.name}:`);

            // Show type if available
            if (node.type) {
                lines.push(`  %%   Type: ${node.type}`);
            }

            // Show parent if available
            if (node.parent) {
                lines.push(`  %%   Parent: ${node.parent}`);
            }

            // Show remaining attributes
            if (attributes.length > 2) {
                const remainingAttrs = attributes.slice(2);
                remainingAttrs.forEach((attr: any) => {
                    let attrValue = attr.value?.value ?? attr.value;
                    if (typeof attrValue === 'string') {
                        attrValue = attrValue.replace(/^["']|["']$/g, '');
                    }
                    const typeStr = attr.type ? `<${attr.type}>` : '';
                    lines.push(`  %%   ${attr.name}${typeStr}: ${attrValue}`);
                });
            }

            // Show annotations
            if (annotations.length > 0) {
                annotations.forEach((ann: any) => {
                    lines.push(`  %%   @${ann.name}`);
                });
            }
        }
    });

    return lines;
}

/**
 * Generate a static mermaid flowchart from MachineJSON
 */
export function generateFlowchart(machineJson: MachineJSON, options: MermaidOptions = {}): string {
    const lines: string[] = [];

    // Header with title
    lines.push('---');
    lines.push(`title: "${options.title || machineJson.title || 'Machine Diagram'}"`);
    lines.push('---');
    lines.push('flowchart TB');
    lines.push('');

    // Build semantic hierarchy
    const hierarchy = buildSemanticHierarchy(machineJson.nodes);
    const rootNodes = getRootNodes(machineJson.nodes);

    // Generate nodes with nested subgraphs
    const rootNodeData = rootNodes.map(node => ({
        name: node.name,
        node: node
    }));
    const nodeLines = generateHierarchy(hierarchy, rootNodeData, 1);
    lines.push(...nodeLines);
    lines.push('');

    // Generate edges
    const edgeLines = generateEdges(machineJson);
    lines.push(...edgeLines);
    lines.push('');

    // Generate and apply styling
    const stylingLines = generateNodeTypeStyling();
    lines.push(...stylingLines);
    lines.push('');

    const nodeStyleLines = applyNodeStyling(machineJson.nodes);
    lines.push(...nodeStyleLines);

    // Add attribute comments for additional details
    const commentLines = generateAttributeComments(machineJson);
    lines.push(...commentLines);

    return lines.join('\n');
}

/**
 * Generate a runtime mermaid flowchart with execution state
 */
export function generateRuntimeFlowchart(
    machineJson: MachineJSON,
    context: RuntimeContext,
    options: MermaidOptions = {}
): string {
    const lines: string[] = [];

    // Header with title
    lines.push('---');
    lines.push(`title: "${options.title || machineJson.title || 'Machine Diagram'} (Runtime)"`);
    lines.push('---');
    lines.push('flowchart TB');
    lines.push('');

    // Build semantic hierarchy
    const hierarchy = buildSemanticHierarchy(machineJson.nodes);
    const rootNodes = getRootNodes(machineJson.nodes);

    // Generate nodes with nested subgraphs
    const rootNodeData = rootNodes.map(node => ({
        name: node.name,
        node: node
    }));
    const nodeLines = generateHierarchy(hierarchy, rootNodeData, 1);
    lines.push(...nodeLines);
    lines.push('');

    // Generate edges
    const edgeLines = generateEdges(machineJson);
    lines.push(...edgeLines);
    lines.push('');

    // Runtime state styling
    lines.push('  %% Runtime State Styling');
    lines.push('  classDef currentNode fill:#4CAF50,stroke:#2E7D32,stroke-width:4px,color:#fff');
    lines.push('  classDef visitedNode fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff');
    lines.push('  classDef pendingNode fill:#FFC107,stroke:#F57F17,stroke-width:1px,color:#000');
    lines.push('');

    // Node type styling
    const stylingLines = generateNodeTypeStyling();
    lines.push(...stylingLines);
    lines.push('');

    // Apply runtime state styling
    machineJson.nodes.forEach(node => {
        const nodeId = sanitizeId(node.name);
        const hasChildren = machineJson.nodes.some(n => n.parent === node.name);
        const actualNodeId = hasChildren ? `${nodeId}_self` : nodeId;

        if (node.name === context.currentNode) {
            lines.push(`  class ${actualNodeId} currentNode`);
        } else if (context.visitedNodes.has(node.name)) {
            lines.push(`  class ${actualNodeId} visitedNode`);
        } else {
            // Apply type-based styling for pending nodes
            const nodeStyleLines = applyNodeStyling([node]);
            lines.push(...nodeStyleLines);
        }
    });

    // Add execution history as comments
    if (options.showExecutionPath && context.history.length > 0) {
        lines.push('');
        lines.push('  %% Execution Path:');
        context.history.forEach((step, idx) => {
            const timestamp = new Date(step.timestamp).toLocaleTimeString();
            lines.push(`  %% ${idx + 1}. ${step.from} → ${step.to} (${step.transition}) at ${timestamp}`);
        });
    }

    return lines.join('\n');
}
