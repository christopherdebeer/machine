/**
 * Mermaid Class Diagram Generator
 *
 * Generates mermaid classDiagram-v2 syntax from MachineJSON.
 * Supports both static and runtime visualizations.
 */

import { MachineJSON, MermaidOptions, RuntimeContext, RuntimeNodeState, RuntimeEdgeState, SemanticHierarchy } from './types.js';
import { NodeTypeChecker } from '../node-type-checker.js';

/**
 * Helper function to wrap text at word boundaries
 */
function wrapText(text: string, maxWidth: number = 60): string {
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
 * Convert generic types from angle brackets to Mermaid tildes
 * e.g., "Promise<Result>" → "Promise~Result~"
 * Handles nested generics: "Promise<Array<Record>>" → "Promise~Array~Record~~"
 */
function convertTypeToMermaid(typeStr: string): string {
    if (!typeStr || typeof typeStr !== 'string') return '';
    // Replace all < and > with ~ for Mermaid generic types
    // This handles nested generics correctly
    return typeStr.replace(/</g, '~').replace(/>/g, '~');
}

/**
 * Maps DyGram arrow types to Mermaid relationship types
 * This preserves semantic meaning in the diagram
 */
function getRelationshipType(arrowType: string): string {
    const mapping: Record<string, string> = {
        '->': '-->',      // Association (default)
        '-->': '..>',     // Dependency (dashed)
        '=>': '-->',      // Association (thick arrow - Mermaid doesn't have distinct thick)
        '<-->': '<-->',   // Bidirectional
        '<|--': '<|--',   // Inheritance
        '*-->': '*--',    // Composition
        'o-->': 'o--',    // Aggregation
    };
    return mapping[arrowType] || '-->';
}

/**
 * Generate a static mermaid class diagram from MachineJSON
 */
export function generateClassDiagram(machineJson: MachineJSON, options: MermaidOptions = {}): string {
    const lines: string[] = [];

    // Header
    lines.push('---');
    lines.push(`title: "${options.title || machineJson.title || 'Machine Diagram'}"`);
    lines.push('config:');
    lines.push('  class:');
    lines.push('    hideEmptyMembersBox: true');
    lines.push('---');
    lines.push('classDiagram-v2');
    lines.push('');

    // Build semantic hierarchy based on parent-child relationships
    const hierarchy = buildSemanticHierarchy(machineJson.nodes);
    const rootNodes = getRootNodes(machineJson.nodes);

    // Track extracted nodes and edges for styling
    const extractedNodes = new Set<string>();
    const parentChildEdges: Array<{ parent: string; child: string }> = [];
    const generationContext = { extractedNodes, parentChildEdges };

    // Generate nodes organized by semantic/lexical nesting
    lines.push(generateSemanticHierarchy(hierarchy, rootNodes, machineJson, 0, generationContext));
    lines.push('');

    // Generate node type styling
    lines.push(generateNodeTypeStyling());
    lines.push('');

    // Apply extracted styling to extracted nodes
    if (extractedNodes.size > 0) {
        lines.push('  %% Apply extracted styling to nested parents');
        extractedNodes.forEach(nodeName => {
            lines.push(`  class ${nodeName} extractedType`);
        });
        lines.push('');
    }

    // Generate edges
    if (machineJson.edges && machineJson.edges.length > 0) {
        lines.push(generateEdges(machineJson));
    }

    // Generate notes
    if (machineJson.notes && machineJson.notes.length > 0) {
        lines.push('');
        lines.push(generateNotes(machineJson.notes));
    }

    // Generate inferred dependencies
    if (machineJson.inferredDependencies && machineJson.inferredDependencies.length > 0) {
        lines.push('');
        lines.push(generateInferredDependencies(machineJson.inferredDependencies));
    }

    return lines.join('\n');
}

/**
 * Generate a runtime mermaid class diagram with execution state
 */
export function generateRuntimeClassDiagram(
    machineJson: MachineJSON,
    context: RuntimeContext,
    options: MermaidOptions = {}
): string {
    const lines: string[] = [];
    const nodeStates = buildNodeStates(machineJson, context);
    const edgeStates = buildEdgeStates(machineJson, context);

    // Header with runtime indicator
    lines.push('---');
    lines.push(`title: "${machineJson.title || 'Machine'} [RUNTIME]"`);
    lines.push('config:');
    lines.push('  class:');
    lines.push('    hideEmptyMembersBox: true');
    lines.push('---');
    lines.push('classDiagram-v2');
    lines.push('');

    // Generate nodes with runtime state
    nodeStates.forEach(node => {
        const statusEmoji = getStatusEmoji(node.status);
        const statusText = node.status.toUpperCase();

        // Build class header with runtime status
        const classHeader = options.showRuntimeState !== false
            ? `class ${node.name}["${statusEmoji} ${node.name}"]`
            : `class ${node.name}`;

        lines.push(`  ${classHeader} {`);

        // Add type annotation
        if (node.type) {
            lines.push(`    <<${node.type}>>`);
        }

        // Add runtime status info
        if (options.showRuntimeState !== false) {
            lines.push(`    +status: ${statusText}`);
            if (node.visitCount > 0) {
                lines.push(`    +visits: ${node.visitCount}`);
            }
        }

        // Add attributes with runtime values
        if (node.attributes && node.attributes.length > 0) {
            node.attributes.forEach(attr => {
                if (attr.name === 'prompt' || attr.name === 'desc') return; // Skip display attributes

                let displayValue = formatAttributeValue(attr.value);

                // Show runtime value if different and available
                if (options.showRuntimeValues && attr.runtimeValue !== undefined &&
                    attr.runtimeValue !== attr.value) {
                    displayValue = `${displayValue} → ${formatAttributeValue(attr.runtimeValue)}`;
                }

                const typeAnnotation = attr.type ? ` : ${attr.type}` : '';
                lines.push(`    +${attr.name}${typeAnnotation} = ${displayValue}`);
            });
        }

        // Add runtime values if any
        if (options.showRuntimeValues && node.runtimeValues) {
            Object.entries(node.runtimeValues).forEach(([key, value]) => {
                lines.push(`    +${key}[runtime] = ${formatAttributeValue(value)}`);
            });
        }

        lines.push('  }');
        lines.push('');
    });

    // Add styling for different states and node types
    lines.push('  %% Runtime State Styling');
    lines.push('  classDef currentNode fill:#4CAF50,stroke:#2E7D32,stroke-width:4px,color:#fff');
    lines.push('  classDef visitedNode fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff');
    lines.push('  classDef pendingNode fill:#FFC107,stroke:#F57F17,stroke-width:1px,color:#000');
    lines.push('');
    lines.push('  %% Node Type Styling (subtle background colors)');
    lines.push('  classDef taskType fill:#E3F2FD,stroke:#1976D2,stroke-width:2px');
    lines.push('  classDef stateType fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px');
    lines.push('  classDef contextType fill:#E8F5E9,stroke:#388E3C,stroke-width:2px');
    lines.push('  classDef initType fill:#FFF3E0,stroke:#F57C00,stroke-width:2px');
    lines.push('');

    // Apply styling to nodes (status takes precedence over type)
    nodeStates.forEach(node => {
        if (node.status === 'current') {
            lines.push(`  class ${node.name} currentNode`);
        } else if (node.status === 'visited') {
            lines.push(`  class ${node.name} visitedNode`);
        } else {
            // Use type-based styling for pending nodes
            const typeClass = getTypeClass(node.type);
            if (typeClass) {
                lines.push(`  class ${node.name} ${typeClass}`);
            } else {
                lines.push(`  class ${node.name} pendingNode`);
            }
        }
    });

    lines.push('');

    // Generate edges with runtime information
    edgeStates.forEach(edge => {
        let label = edge.label || '';

        // Add traversal count if enabled
        if (options.showVisitCounts !== false && edge.traversalCount > 0) {
            label += (label ? ' ' : '') + `[${edge.traversalCount}x]`;
        }

        // Add runtime data if available
        if (options.showRuntimeValues && edge.runtimeData) {
            const runtimeInfo = Object.entries(edge.runtimeData)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ');
            if (runtimeInfo) {
                label += (label ? ', ' : '') + runtimeInfo;
            }
        }

        const edgeLine = `  ${edge.source} --> ${edge.target}${label ? ` : ${label}` : ''}`;
        lines.push(edgeLine);
    });

    // Add execution path information
    if (options.showExecutionPath && context.history.length > 0) {
        lines.push('');
        lines.push('  %% Execution Path:');
        context.history.forEach((step, idx) => {
            const timestamp = new Date(step.timestamp).toLocaleTimeString();
            lines.push(`  %% ${idx + 1}. ${step.from} → ${step.to} (${step.transition}) at ${timestamp}`);
            if (step.output) {
                const truncatedOutput = step.output.length > 50
                    ? step.output.substring(0, 50) + '...'
                    : step.output;
                lines.push(`  %%    Output: ${truncatedOutput}`);
            }
        });
    }

    return lines.join('\n');
}

// Old type hierarchy functions removed - now using semantic hierarchy based on parent-child relationships
// See buildSemanticHierarchy(), getRootNodes(), and generateSemanticHierarchy() below

/**
 * Build semantic hierarchy based on parent-child relationships
 * This preserves the lexical nesting structure from the DSL
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
 * Generation context for tracking extracted nodes and edges
 */
interface GenerationContext {
    extractedNodes: Set<string>;
    parentChildEdges: Array<{ parent: string; child: string }>;
}

/**
 * Generate mermaid diagram with flat namespaces
 * Extracts nested parents to root level to avoid Mermaid's nested namespace limitation
 */
function generateSemanticHierarchy(
    hierarchy: SemanticHierarchy,
    nodes: any[],
    machineJson: MachineJSON,
    level = 0,
    context?: GenerationContext
): string {
    const lines: string[] = [];
    const edges = machineJson.edges;
    const extractedNamespaces: string[] = [];

    nodes.forEach(node => {
        const { children } = hierarchy[node.name];

        // Separate children into leaf nodes and parent nodes
        const leafChildren: string[] = [];
        const parentChildren: string[] = [];

        children.forEach(childName => {
            if (hierarchy[childName].children.length > 0) {
                parentChildren.push(childName);
            } else {
                leafChildren.push(childName);
            }
        });

        // If this node has children
        if (children.length > 0) {
            // Generate namespace containing the children
            lines.push(`namespace ${node.name} {`);
            
            // Generate placeholder class for this namespace (to allow edges to target it)
            lines.push(generatePlaceholderClass(node, edges, '  ', 'namespace'));
            lines.push('');
            
            // Generate placeholder classes for parent children (extracted nodes)
            parentChildren.forEach(childName => {
                const childNode = hierarchy[childName].node;
                lines.push(generatePlaceholderClass(childNode, edges, '  ', 'extracted'));
            });
            
            if (parentChildren.length > 0) {
                lines.push('');
            }
            
            // Generate leaf children class definitions
            leafChildren.forEach(childName => {
                const childNode = hierarchy[childName].node;
                lines.push(generateClassDefinition(childNode, edges, '  '));
            });

            lines.push('}');
            lines.push('');

            // Extract parent children to root level and track connections
            parentChildren.forEach(childName => {
                extractedNamespaces.push(childName);
                // Track extracted nodes for styling
                if (context) {
                    context.extractedNodes.add(childName);
                    // Safety check: don't add self-loops
                    if (node.name !== childName) {
                        context.parentChildEdges.push({ parent: node.name, child: childName });
                    }
                }
            });
        } else {
            // Leaf node - just output the class
            const classDefinition = generateClassDefinition(node, edges, '  ');
            lines.push(classDefinition);
        }
    });

    // Recursively generate extracted namespaces at root level
    if (extractedNamespaces.length > 0) {
        const extractedNodes = extractedNamespaces.map(name => hierarchy[name].node);
        const extractedContent = generateSemanticHierarchy(hierarchy, extractedNodes, machineJson, level + 1, context);
        lines.push(extractedContent);
    }

    // Generate edges connecting parents to extracted children (only at top level)
    if (level === 0 && context && context.parentChildEdges.length > 0) {
        lines.push('');
        lines.push('  %% Parent-Child Connections (extracted namespaces)');
        // Deduplicate edges to avoid cycles
        const uniqueEdges = new Map<string, { parent: string; child: string }>();
        context.parentChildEdges.forEach(edge => {
            const key = `${edge.parent}->${edge.child}`;
            if (!uniqueEdges.has(key) && edge.parent !== edge.child) {
                uniqueEdges.set(key, edge);
            }
        });
        uniqueEdges.forEach(({ parent, child }) => {
            // Use placeholder classes (ext_) to connect namespaces
            lines.push(`  ${parent}.ext_${child} ..> ${child}.ext_${child} : contains`);
        });
    }

    return lines.join('\n');
}

/**
 * Generate a class definition for a single node
 */
function generateClassDefinition(node: any, edges: any[], indent: string): string {
    const desc = node.attributes?.find((a: any) => a.name === 'desc') || node.attributes?.find((a: any) => a.name === 'prompt');
    let displayValue: any = node.title || desc?.value;
    if (displayValue && typeof displayValue === 'string') {
        displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
        displayValue = wrapText(displayValue, 60); // Apply text wrapping
    }

    // Get CSS class for this node using type inference
    const typeClass = getTypeClassName(node, edges);
    const classStyle = typeClass ? `:::${typeClass}` : '';

    const header = `class ${node.name}${displayValue ? `["${displayValue}"]` : ''}${classStyle}`;

    // Format all attributes except desc/prompt for the class body
    const attributes = node.attributes?.filter((a: any) => a.name !== 'desc' && a.name !== 'prompt') || [];
    const attributeLines = attributes.length > 0
        ? attributes.map((a: any) => {
            // Extract the actual value from the attribute
            let displayValue = a.value?.value ?? a.value;
            // Remove quotes from string values for display
            if (typeof displayValue === 'string') {
                displayValue = displayValue.replace(/^["']|["']$/g, '');
                displayValue = wrapText(displayValue, 60); // Apply text wrapping
            }
            // Convert generic types to Mermaid format (< > to ~ ~)
            const typeStr = a.type ? convertTypeToMermaid(String(a.type)) : '';
            return `+${a.name}${typeStr ? ` : ${typeStr}` : ''} = ${displayValue}`;
        }).join('\n')
        : '';

    // Add parent annotation for hierarchical context
    const parentAnnotation = node.parent ? `+parent : ${node.parent}` : '';

    // Generate annotations (filter out @note annotations which are handled separately)
    const annotations = node.annotations?.filter((ann: any) => ann.name !== 'note').map((ann: any) => `<<${ann.name}>>`).join('\n' + indent + '  ') || '';
    const typeAnnotation = node.type ? `<<${node.type}>>` : '';

    const allAnnotations = [typeAnnotation, annotations].filter(Boolean).join('\n' + indent + '  ');

    // Combine parent annotation with attributes
    const allLines = [parentAnnotation, attributeLines].filter(Boolean).join('\n' + indent + '  ');

    return `${indent}${header} {
${indent}  ${allAnnotations}${allLines ? '\n' + indent + '  ' + allLines : ''}
${indent}}`;
}

/**
 * Generate a placeholder class for extracted/namespace nodes
 * This avoids namespace-class name conflicts and allows edges to target classes
 */
function generatePlaceholderClass(node: any, edges: any[], indent: string, placeholderType: 'namespace' | 'extracted'): string {
    const className = `ext_${node.name}`;
    
    // Get CSS class for this node using type inference
    const typeClass = getTypeClassName(node, edges);
    const classStyle = typeClass ? `:::${typeClass}` : '';

    const header = `class ${className}${classStyle}`;

    // Add annotation to indicate this is a placeholder
    const annotation = placeholderType === 'namespace' ? '<<namespace>>' : '<<extracted>>';
    
    // Add parent annotation for hierarchical context
    const parentAnnotation = node.parent ? `+parent : ${node.parent}` : '';

    return `${indent}${header} {
${indent}  ${annotation}${parentAnnotation ? '\n' + indent + '  ' + parentAnnotation : ''}
${indent}}`;
}

/**
 * Get type-based CSS class name for styling using NodeTypeChecker
 */
function getTypeClassName(node: any, edges?: any[]): string | null {
    const nodeType = NodeTypeChecker.getNodeType(node, edges);

    if (!nodeType) return null;

    // Map node types to CSS class names
    switch (nodeType) {
        case 'task': return 'taskType';
        case 'state': return 'stateType';
        case 'context': return 'contextType';
        case 'init': return 'initType';
        case 'tool': return 'toolType';
        default: return null;
    }
}

/**
 * Generate node type styling declarations
 */
function generateNodeTypeStyling(): string {
    const lines: string[] = [];

    lines.push('  %% Node Type Styling');
    lines.push('  classDef taskType fill:#E3F2FD,stroke:#1976D2,stroke-width:2px');
    lines.push('  classDef stateType fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px');
    lines.push('  classDef contextType fill:#E8F5E9,stroke:#388E3C,stroke-width:2px');
    lines.push('  classDef toolType fill:#FFF9C4,stroke:#F57F17,stroke-width:2px');
    lines.push('  classDef initType fill:#FFF3E0,stroke:#F57C00,stroke-width:2px');
    lines.push('  classDef extractedType fill:#FFF,stroke:#999,stroke-width:3px');

    return lines.join('\n');
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

        // Use arrow type mapping to determine relationship type
        const relationshipType = getRelationshipType(edge.arrowType || '->');

        // Build multiplicity strings
        const srcMult = edge.sourceMultiplicity ? ` "${edge.sourceMultiplicity}"` : '';
        const tgtMult = edge.targetMultiplicity ? ` "${edge.targetMultiplicity}"` : '';

        if (keys.length === 0) {
            // No label, but may have multiplicity
            lines.push(`  ${edge.source}${srcMult} ${relationshipType}${tgtMult} ${edge.target}`);
            return;
        }

        // Construct label from JSON properties, prioritizing non-text properties
        const textValue = edgeValue.text;
        const otherProps = keys.filter(k => k !== 'text');

        let labelJSON = '';

        if (otherProps.length > 0) {
            // Use properties instead of text for cleaner labels
            labelJSON = otherProps.map(key => `${key}=${edgeValue[key]}`).join(', ');
        } else if (textValue) {
            // Only use text if no other properties exist
            labelJSON = textValue;
        }

        // Handle special characters in labels
        if (labelJSON) {
            labelJSON = labelJSON.replace(/:/g, '∶');
            labelJSON = labelJSON.replace(/;/g, '；');
            labelJSON = labelJSON.replace(/"/g, "'");
        }

        lines.push(`  ${edge.source}${srcMult} ${relationshipType}${tgtMult} ${edge.target}${labelJSON ? ` : ${labelJSON}` : ''}`);
    });

    return lines.join('\n');
}

/**
 * Generate notes section
 */
function generateNotes(notes: any[]): string {
    if (!notes || notes.length === 0) return '';

    const lines: string[] = [];
    lines.push('  %% Notes');

    notes.forEach(note => {
        let content = note.content.replace(/\\n/g, '<br/>');

        // Add annotations to the content
        if (note.annotations && note.annotations.length > 0) {
            const annotationStr = note.annotations
                .map((ann: any) => ann.value ? `@${ann.name}(${ann.value})` : `@${ann.name}`)
                .join(' ');
            content = `${annotationStr}: ${content}`;
        }

        // Add attributes to the content
        if (note.attributes && note.attributes.length > 0) {
            const attrLines = note.attributes.map((attr: any) => {
                let displayValue = attr.value?.value ?? attr.value;
                if (typeof displayValue === 'string') {
                    displayValue = displayValue.replace(/^["']|["']$/g, '');
                }
                const typeStr = attr.type ? ` <${attr.type}>` : '';
                return `${attr.name}${typeStr}: ${displayValue}`;
            });
            content = `${content}<br/>${attrLines.join('<br/>')}`;
        }

        lines.push(`  note ${note.target} "${content}"`);
    });

    return lines.join('\n');
}

/**
 * Generate inferred dependencies section
 */
function generateInferredDependencies(deps: any[]): string {
    if (deps.length === 0) return '';

    const lines: string[] = [];
    lines.push('  %% Inferred Dependencies (from template variables)');

    deps.forEach(dep => {
        lines.push(`  ${dep.source} ..> ${dep.target} : ${dep.reason}`);
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

        // Get label from edge value
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
 * Get type-based CSS class for styling
 */
function getTypeClass(type?: string): string | null {
    if (!type) return null;

    const typeLower = type.toLowerCase();
    if (typeLower.includes('task')) return 'taskType';
    if (typeLower.includes('state')) return 'stateType';
    if (typeLower.includes('context')) return 'contextType';
    if (typeLower.includes('init')) return 'initType';

    return null;
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
