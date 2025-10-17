/**
 * Mermaid State Diagram Generator
 *
 * Generates mermaid state diagram syntax from MachineJSON.
 * State diagrams are perfect for DyGram machines as they natively support:
 * - Composite states (states containing other states)
 * - Hierarchical state structures
 * - State transitions with labels
 *
 * This provides a more semantically accurate representation for state machine visualization.
 */

import { MachineJSON, MermaidOptions, RuntimeContext, SemanticHierarchy } from './types.js';
import { NodeTypeChecker } from '../node-type-checker.js';

/**
 * Helper function to sanitize state IDs for Mermaid
 */
function sanitizeId(name: string): string {
    // Replace dots and special characters with underscores
    return name.replace(/[.\-\s]/g, '_');
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

    return lines.join(' ');
}

/**
 * Get label for a state/node - includes title/description
 */
function getStateLabel(node: any): string {
    // Priority: title > desc attribute > prompt attribute > label > name
    const desc = node.attributes?.find((a: any) => a.name === 'desc') ||
                 node.attributes?.find((a: any) => a.name === 'prompt');
    let displayValue: any = node.title || desc?.value;

    if (displayValue && typeof displayValue === 'string') {
        displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
        displayValue = wrapText(displayValue, 40); // Apply text wrapping
    }

    return displayValue || node.label || node.name;
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
 * Generate state hierarchy recursively (composite states)
 */
function generateStateHierarchy(
    hierarchy: SemanticHierarchy,
    nodes: any[],
    machineJson: MachineJSON,
    level: number = 0
): string[] {
    const lines: string[] = [];
    const indent = '    '.repeat(level);

    nodes.forEach(node => {
        const { children } = hierarchy[node.name];
        const stateId = sanitizeId(node.name);
        const label = getStateLabel(node.node);

        // If node has children, create a composite state
        if (children.length > 0) {
            lines.push(`${indent}state "${label}" as ${stateId} {`);

            // Add attributes and annotations for the composite state itself
            const compositeIndent = '    '.repeat(level + 1);

            // Add type annotation if available
            if (node.node.type) {
                lines.push(`${compositeIndent}${stateId} : <<${node.node.type}>>`);
            }

            // Add parent annotation if available
            if (node.node.parent) {
                lines.push(`${compositeIndent}${stateId} : parent=${node.node.parent}`);
            }

            // Add attributes for composite state
            const attributes = node.node.attributes?.filter((a: any) =>
                a.name !== 'desc' && a.name !== 'prompt'
            ) || [];

            if (attributes.length > 0) {
                attributes.forEach((attr: any) => {
                    let attrValue = attr.value?.value ?? attr.value;
                    if (typeof attrValue === 'string') {
                        attrValue = attrValue.replace(/^["']|["']$/g, '');
                        if (attrValue.length > 40) attrValue = attrValue.substring(0, 40) + '...';
                    }
                    const typeStr = attr.type ? `<${attr.type}>` : '';
                    const attrStr = typeStr ? `${attr.name}${typeStr}=${attrValue}` : `${attr.name}=${attrValue}`;
                    lines.push(`${compositeIndent}${stateId} : ${attrStr}`);
                });
            }

            // Add custom annotations
            const annotations = node.node.annotations?.filter((ann: any) => ann.name !== 'note') || [];
            if (annotations.length > 0) {
                annotations.forEach((ann: any) => {
                    lines.push(`${compositeIndent}${stateId} : @${ann.name}`);
                });
            }

            // Recursively add child states
            const childNodes = children.map(childName => ({
                name: childName,
                node: hierarchy[childName].node
            }));
            const childLines = generateStateHierarchy(hierarchy, childNodes, machineJson, level + 1);
            lines.push(...childLines);

            lines.push(`${indent}}`);
        } else {
            // Leaf state - simple state definition
            lines.push(`${indent}${stateId} : ${label}`);

            // Add type annotation if available
            if (node.node.type) {
                lines.push(`${indent}${stateId} : <<${node.node.type}>>`);
            }

            // Add parent annotation if available
            if (node.node.parent) {
                lines.push(`${indent}${stateId} : parent=${node.node.parent}`);
            }

            // Add ALL attributes (not just first 3)
            const attributes = node.node.attributes?.filter((a: any) =>
                a.name !== 'desc' && a.name !== 'prompt'
            ) || [];

            if (attributes.length > 0) {
                attributes.forEach((attr: any) => {
                    let attrValue = attr.value?.value ?? attr.value;
                    if (typeof attrValue === 'string') {
                        attrValue = attrValue.replace(/^["']|["']$/g, '');
                        if (attrValue.length > 40) attrValue = attrValue.substring(0, 40) + '...';
                    }
                    const typeStr = attr.type ? `<${attr.type}>` : '';
                    const attrStr = typeStr ? `${attr.name}${typeStr}=${attrValue}` : `${attr.name}=${attrValue}`;
                    lines.push(`${indent}${stateId} : ${attrStr}`);
                });
            }

            // Add custom annotations
            const annotations = node.node.annotations?.filter((ann: any) => ann.name !== 'note') || [];
            if (annotations.length > 0) {
                annotations.forEach((ann: any) => {
                    lines.push(`${indent}${stateId} : @${ann.name}`);
                });
            }
        }
    });

    return lines;
}

/**
 * Generate transitions between states
 */
function generateTransitions(machineJson: MachineJSON): string[] {
    const lines: string[] = [];
    const edges = machineJson.edges || [];

    edges.forEach(edge => {
        const sourceId = sanitizeId(edge.source);
        const targetId = sanitizeId(edge.target);
        const label = edge.label || edge.arrowType || '';

        if (label) {
            lines.push(`  ${sourceId} --> ${targetId} : ${label}`);
        } else {
            lines.push(`  ${sourceId} --> ${targetId}`);
        }
    });

    return lines;
}

/**
 * Add notes for specific states
 */
function generateNotes(machineJson: MachineJSON): string[] {
    const lines: string[] = [];
    const notes = machineJson.notes || [];

    notes.forEach(note => {
        if (note.target) {
            const targetId = sanitizeId(note.target);
            const noteText = note.text || note.content || '';
            lines.push(`  note right of ${targetId}`);
            lines.push(`    ${noteText}`);
            lines.push(`  end note`);
        }
    });

    return lines;
}

/**
 * Generate styling based on node types
 */
function generateStateStyling(machineJson: MachineJSON): string[] {
    const lines: string[] = [];

    const statesByType: Record<string, string[]> = {
        task: [],
        state: [],
        context: [],
        init: [],
        tool: []
    };

    machineJson.nodes.forEach(node => {
        const stateId = sanitizeId(node.name);
        const nodeType = NodeTypeChecker.getNodeType(node);

        if (nodeType === 'task') {
            statesByType.task.push(stateId);
        } else if (nodeType === 'state') {
            statesByType.state.push(stateId);
        } else if (nodeType === 'context') {
            statesByType.context.push(stateId);
        } else if (nodeType === 'init') {
            statesByType.init.push(stateId);
        } else if (nodeType === 'tool') {
            statesByType.tool.push(stateId);
        }
    });

    // Apply styling
    lines.push('  %% Node Type Styling');

    if (statesByType.task.length > 0) {
        lines.push(`  classDef taskType fill:#E3F2FD,stroke:#1976D2,stroke-width:2px`);
        lines.push(`  class ${statesByType.task.join(',')} taskType`);
    }

    if (statesByType.state.length > 0) {
        lines.push(`  classDef stateType fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px`);
        lines.push(`  class ${statesByType.state.join(',')} stateType`);
    }

    if (statesByType.context.length > 0) {
        lines.push(`  classDef contextType fill:#E8F5E9,stroke:#388E3C,stroke-width:2px`);
        lines.push(`  class ${statesByType.context.join(',')} contextType`);
    }

    if (statesByType.init.length > 0) {
        lines.push(`  classDef initType fill:#FFF3E0,stroke:#F57C00,stroke-width:2px`);
        lines.push(`  class ${statesByType.init.join(',')} initType`);
    }

    if (statesByType.tool.length > 0) {
        lines.push(`  classDef toolType fill:#FCE4EC,stroke:#C2185B,stroke-width:2px`);
        lines.push(`  class ${statesByType.tool.join(',')} toolType`);
    }

    return lines;
}

/**
 * Generate a static mermaid state diagram from MachineJSON
 */
export function generateStateDiagram(machineJson: MachineJSON, options: MermaidOptions = {}): string {
    const lines: string[] = [];

    // Header with title
    lines.push('---');
    lines.push(`title: "${options.title || machineJson.title || 'Machine Diagram'}"`);
    lines.push('---');
    lines.push('stateDiagram-v2');
    lines.push('');

    // Build semantic hierarchy
    const hierarchy = buildSemanticHierarchy(machineJson.nodes);
    const rootNodes = getRootNodes(machineJson.nodes);

    // Add start state marker - supports both explicit and inferred initial states
    let initialNode = machineJson.nodes.find(n => n.type === 'initial' || n.name === 'start');

    // If no explicit initial node, infer it from graph structure (node with no incoming edges)
    if (!initialNode && machineJson.edges) {
        initialNode = machineJson.nodes.find(node => {
            const hasIncoming = machineJson.edges.some(edge => edge.target === node.name);
            return !hasIncoming;
        });
    }

    if (initialNode) {
        lines.push(`  [*] --> ${sanitizeId(initialNode.name)}`);
    }

    // Generate states with composite state nesting
    const rootNodeData = rootNodes.map(node => ({
        name: node.name,
        node: node
    }));
    const stateLines = generateStateHierarchy(hierarchy, rootNodeData, machineJson, 1);
    lines.push(...stateLines);
    lines.push('');

    // Generate transitions
    const transitionLines = generateTransitions(machineJson);
    lines.push(...transitionLines);
    lines.push('');

    // Add end state marker if there's a terminal state
    const terminalNode = machineJson.nodes.find(n => n.type === 'terminal' || n.name === 'end');
    if (terminalNode) {
        lines.push(`  ${sanitizeId(terminalNode.name)} --> [*]`);
        lines.push('');
    }

    // Generate notes
    const noteLines = generateNotes(machineJson);
    if (noteLines.length > 0) {
        lines.push(...noteLines);
        lines.push('');
    }

    // Generate and apply styling
    const stylingLines = generateStateStyling(machineJson);
    lines.push(...stylingLines);

    return lines.join('\n');
}

/**
 * Generate a runtime mermaid state diagram with execution state
 */
export function generateRuntimeStateDiagram(
    machineJson: MachineJSON,
    context: RuntimeContext,
    options: MermaidOptions = {}
): string {
    const lines: string[] = [];

    // Header with title
    lines.push('---');
    lines.push(`title: "${options.title || machineJson.title || 'Machine Diagram'} (Runtime)"`);
    lines.push('---');
    lines.push('stateDiagram-v2');
    lines.push('');

    // Build semantic hierarchy
    const hierarchy = buildSemanticHierarchy(machineJson.nodes);
    const rootNodes = getRootNodes(machineJson.nodes);

    // Add start state marker - supports both explicit and inferred initial states
    let initialNode = machineJson.nodes.find(n => n.type === 'initial' || n.name === 'start');

    // If no explicit initial node, infer it from graph structure (node with no incoming edges)
    if (!initialNode && machineJson.edges) {
        initialNode = machineJson.nodes.find(node => {
            const hasIncoming = machineJson.edges.some(edge => edge.target === node.name);
            return !hasIncoming;
        });
    }

    if (initialNode) {
        lines.push(`  [*] --> ${sanitizeId(initialNode.name)}`);
    }

    // Generate states with composite state nesting
    const rootNodeData = rootNodes.map(node => ({
        name: node.name,
        node: node
    }));
    const stateLines = generateStateHierarchy(hierarchy, rootNodeData, machineJson, 1);
    lines.push(...stateLines);
    lines.push('');

    // Generate transitions (with visit counts if enabled)
    const edges = machineJson.edges || [];
    edges.forEach(edge => {
        const sourceId = sanitizeId(edge.source);
        const targetId = sanitizeId(edge.target);
        let label = edge.label || edge.arrowType || '';

        // Add visit counts from execution history if available
        if (options.showVisitCounts && context.history) {
            const traversalCount = context.history.filter(
                h => h.from === edge.source && h.to === edge.target
            ).length;
            if (traversalCount > 0) {
                label += ` [${traversalCount}x]`;
            }
        }

        if (label) {
            lines.push(`  ${sourceId} --> ${targetId} : ${label}`);
        } else {
            lines.push(`  ${sourceId} --> ${targetId}`);
        }
    });
    lines.push('');

    // Add end state marker if there's a terminal state
    const terminalNode = machineJson.nodes.find(n => n.type === 'terminal' || n.name === 'end');
    if (terminalNode) {
        lines.push(`  ${sanitizeId(terminalNode.name)} --> [*]`);
        lines.push('');
    }

    // Runtime state styling
    lines.push('  %% Runtime State Styling');
    lines.push('  classDef currentState fill:#4CAF50,stroke:#2E7D32,stroke-width:4px,color:#fff');
    lines.push('  classDef visitedState fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff');
    lines.push('  classDef pendingState fill:#FFC107,stroke:#F57F17,stroke-width:1px,color:#000');
    lines.push('');

    // Node type styling
    const stylingLines = generateStateStyling(machineJson);
    lines.push(...stylingLines);
    lines.push('');

    // Apply runtime state styling (overrides type styling)
    const currentStateId = sanitizeId(context.currentNode);
    lines.push(`  class ${currentStateId} currentState`);

    context.visitedNodes.forEach(nodeName => {
        if (nodeName !== context.currentNode) {
            const stateId = sanitizeId(nodeName);
            lines.push(`  class ${stateId} visitedState`);
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
