import type { Machine, Node } from '../generated/ast.js';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from '../../cli/cli-util.js';
import type { MachineJSON, MachineEdgeJSON } from '../json/types.js';
import { serializeMachineToJSON, serializeAnnotation } from '../json/serializer.js';
import { generateGraphvizFromJSON } from '../diagram/index.js';
import { TypeHierarchy } from '../diagram/types.js';
import { TypeChecker } from '../type-checker.js';
import { GraphValidator } from '../graph-validator.js';
import { ValidationContext, ValidationSeverity, ValidationCategory, createValidationError } from '../validation-errors.js';

// Common interfaces
interface GeneratorOptions {
    destination?: string;
    format?: string;
}

/**
 * Check if a node has a specific annotation
 */
function hasAnnotation(annotations: any[] | undefined, name: string): boolean {
    return annotations?.some((a: any) => a.name === name) ?? false;
}

/**
 * Determine if warnings should be shown for a specific node
 * Uses hierarchical checking: node → parent → machine
 *
 * Rules (in order):
 * 1. If node has @HideWarnings → hide
 * 2. If node has @ShowWarnings → show
 * 3. Check parent recursively for @HideWarnings or @ShowWarnings
 * 4. If machine has @StrictMode → show (strict mode enables warnings by default)
 * 5. If machine has @ShowWarnings → show
 * 6. Default: hide (opt-in behavior)
 */
function shouldShowWarningsForNode(
    nodeName: string,
    nodes: Node[],
    machine: Machine
): boolean {
    // Build a map of node names to nodes for quick lookup
    const nodeMap = new Map<string, Node>();
    const buildNodeMap = (nodeList: Node[]) => {
        nodeList.forEach(node => {
            nodeMap.set(node.name, node);
            if (node.nodes && node.nodes.length > 0) {
                buildNodeMap(node.nodes);
            }
        });
    };
    buildNodeMap(nodes);

    // Helper to get parent node name from the node's parent field
    const getParentNodeName = (node: Node): string | undefined => {
        // In the AST, parent relationships are tracked via the $container property
        const container = (node as any).$container;
        if (container && container.name) {
            return container.name;
        }
        return undefined;
    };

    // Check the node and its parents recursively
    const visited = new Set<string>();
    const checkNodeHierarchy = (currentNodeName: string): boolean | undefined => {
        // Prevent infinite recursion from circular parent relationships
        if (visited.has(currentNodeName)) {
            return undefined;
        }
        visited.add(currentNodeName);

        const currentNode = nodeMap.get(currentNodeName);
        if (!currentNode) return undefined;

        // Check node's own annotations
        if (hasAnnotation(currentNode.annotations, 'HideWarnings')) {
            return false;  // Explicitly hidden
        }
        if (hasAnnotation(currentNode.annotations, 'ShowWarnings')) {
            return true;  // Explicitly shown
        }

        // Check parent recursively
        const parentName = getParentNodeName(currentNode);
        if (parentName) {
            const parentDecision = checkNodeHierarchy(parentName);
            if (parentDecision !== undefined) {
                return parentDecision;
            }
        }

        return undefined;  // No decision at this level
    };

    // Check node hierarchy first
    const nodeDecision = checkNodeHierarchy(nodeName);
    if (nodeDecision !== undefined) {
        return nodeDecision;
    }

    // Check machine-level annotations
    if (hasAnnotation(machine.annotations, 'StrictMode')) {
        // In strict mode, warnings are shown by default
        // But can still be disabled with @HideWarnings
        if (hasAnnotation(machine.annotations, 'HideWarnings')) {
            return false;
        }
        return true;
    }

    if (hasAnnotation(machine.annotations, 'ShowWarnings')) {
        return true;
    }

    // Default: warnings are hidden (opt-in behavior)
    return false;
}

/**
 * Build a ValidationContext from a Machine AST
 * This runs all validation checks and collects errors into a ValidationContext
 * that can be passed to diagram generators for visualization
 *
 * Warnings are filtered based on @ShowWarnings/@HideWarnings annotations
 */
function buildValidationContext(machine: Machine): ValidationContext {
    const context = new ValidationContext();

    // Run graph validation
    try {
        const graphValidator = new GraphValidator(machine);
        const graphResult = graphValidator.validate();

        // Add unreachable node warnings (filtered by annotations)
        if (graphResult.unreachableNodes && graphResult.unreachableNodes.length > 0) {
            graphResult.unreachableNodes.forEach(nodeName => {
                // Check if warnings should be shown for this node
                if (shouldShowWarningsForNode(nodeName, machine.nodes, machine)) {
                    context.addError(createValidationError(
                        `Node cannot be reached from entry points. `,
                        {
                            severity: ValidationSeverity.WARNING,
                            category: ValidationCategory.GRAPH,
                            code: 'UNREACHABLE_NODE',
                            location: { node: nodeName },
                            suggestion: 'Add an edge from an entry point or init node to this node'
                        }
                    ));
                }
            });
        }

        // Add orphaned node warnings (filtered by annotations)
        if (graphResult.orphanedNodes && graphResult.orphanedNodes.length > 0) {
            graphResult.orphanedNodes.forEach(nodeName => {
                // Check if warnings should be shown for this node
                if (shouldShowWarningsForNode(nodeName, machine.nodes, machine)) {
                    context.addError(createValidationError(
                        `Node has no incoming or outgoing edges`,
                        {
                            severity: ValidationSeverity.WARNING,
                            category: ValidationCategory.GRAPH,
                            code: 'ORPHANED_NODE',
                            location: { node: nodeName },
                            suggestion: 'Connect this node to the graph or remove it if unused'
                        }
                    ));
                }
            });
        }

        // Add cycle warnings (filtered by annotations)
        if (graphResult.cycles && graphResult.cycles.length > 0) {
            graphResult.cycles.forEach((cycle, index) => {
                const nodesInCycle = cycle.join(' → ');
                // Add warning to each node in the cycle
                cycle.forEach(nodeName => {
                    // Check if warnings should be shown for this node
                    if (shouldShowWarningsForNode(nodeName, machine.nodes, machine)) {
                        context.addError(createValidationError(
                            `Part of cycle: ${nodesInCycle}`,
                            {
                                severity: ValidationSeverity.WARNING,
                                category: ValidationCategory.GRAPH,
                                code: 'CYCLE_DETECTED',
                                location: { node: nodeName },
                                suggestion: 'Review cycle logic to prevent infinite loops'
                            }
                        ));
                    }
                });
            });
        }
    } catch (error) {
        console.warn('Error running graph validation:', error);
    }

    // Run type checking on all attributes
    try {
        const typeChecker = new TypeChecker(machine);
        const processNode = (node: Node) => {
            if (node.attributes) {
                node.attributes.forEach(attr => {
                    if (attr.type) {
                        const result = typeChecker.validateAttributeType(attr);
                        if (!result.valid && result.message) {

                            if (!typeChecker.isStrictMode) return;
                            context.addError(createValidationError(
                                result.message,
                                {
                                    severity: ValidationSeverity.WARNING,
                                    category: ValidationCategory.TYPE,
                                    code: 'TYPE_MISMATCH',
                                    location: {
                                        node: node.name,
                                        property: attr.name
                                    },
                                    expected: result.expectedType,
                                    actual: result.actualType
                                }
                            ));
                        }
                    }
                });
            }

            // Recursively process child nodes
            node.nodes.forEach(child => processNode(child));
        };

        machine.nodes.forEach(node => processNode(node));
    } catch (error) {
        console.warn('Error running type checking:', error);
    }

    return context;
}

export interface FileGenerationResult {
    filePath?: string;
    content: string;
}

// Base generator class
abstract class BaseGenerator {
    protected abstract fileExtension: string;

    constructor(protected machine: Machine, protected filePath?: string, protected options: GeneratorOptions = {}) {}

    public generate(): FileGenerationResult {
        const result = this.generateContent();
        // Only write to file if destination is explicitly provided as a string
        if (typeof this.options.destination === 'string') {
            this.writeToFile(result);
        }
        return result;
    }

    protected abstract generateContent(): FileGenerationResult;

    protected writeToFile(result: FileGenerationResult): string {
        const data = extractDestinationAndName(this.filePath, this.options.destination);
        
        // Ensure we have valid string values for path.join
        if (typeof data.destination !== 'string' || typeof data.name !== 'string') {
            throw new Error(`Invalid file path data: destination=${data.destination}, name=${data.name}`);
        }
        
        const generatedFilePath = `${path.join(data.destination, data.name)}.${this.fileExtension}`;

        if (!fs.existsSync(data.destination)) {
            fs.mkdirSync(data.destination, { recursive: true });
        }
        fs.writeFileSync(generatedFilePath, result.content);
        return generatedFilePath;
    }
}

// JSON Generator
class JSONGenerator extends BaseGenerator {
    protected fileExtension = 'json';

    protected generateContent(): FileGenerationResult {
        const machineObject: MachineJSON = serializeMachineToJSON(this.machine);

        return {
            filePath: this.filePath,
            content: JSON.stringify(machineObject, null, 2)
        };
    }
}

// Graphviz Generator
class GraphvizGenerator extends BaseGenerator {
    protected fileExtension = 'dot';

    protected generateContent(): FileGenerationResult {
        // Convert Machine AST to JSON and generate Graphviz DOT
        const machineJson = serializeMachineToJSON(this.machine);
        const dotCode = generateGraphvizFromJSON(machineJson);

        return {
            filePath: this.filePath,
            content: dotCode
        };
    }
}

// Public API
export function generateJSON(machine: Machine, filePath?: string, destination?: string): FileGenerationResult {
    const generator = new JSONGenerator(machine, filePath, { destination });
    return generator.generate();
}

export function generateMarkdown(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    // TODO: Implement MarkdownGenerator when needed
    throw new Error('Markdown generation not yet implemented');
}

export function generateHTML(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    // TODO: Implement HTMLGenerator when needed
    throw new Error('HTML generation not yet implemented');
}

export function generateGraphviz(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    const generator = new GraphvizGenerator(machine, filePath, { destination });
    return generator.generate();
}

// Backward compiler: JSON -> DyGram DSL
export function generateDSL(machineJson: MachineJSON): string {
    const lines: string[] = [];

    // Add machine title with annotations (if present)
    if (machineJson.title) {
        let machineLine = `machine ${quoteString(machineJson.title)}`;

        // Add machine-level annotations
        if (machineJson.annotations && machineJson.annotations.length > 0) {
            const annotationsStr = machineJson.annotations.map((ann: any) => {
                if (ann.value) {
                    return ` @${ann.name}(${quoteString(ann.value)})`;
                } else if (ann.attributes) {
                    // Annotation with attribute-style parameters
                    const attrs = Object.entries(ann.attributes)
                        .map(([key, val]) => {
                            if (typeof val === 'string' && (val.includes(':') || val.includes(' '))) {
                                return `${key}: ${quoteString(val as string)}`;
                            }
                            return `${key}: ${val}`;
                        })
                        .join('; ');
                    return ` @${ann.name}(${attrs})`;
                }
                return ` @${ann.name}`;
            }).join('');
            machineLine += annotationsStr;
        }

        // Check if machine has attributes
        const hasMachineAttributes = machineJson.attributes && machineJson.attributes.length > 0;

        if (hasMachineAttributes) {
            // Machine with attributes - use block syntax
            machineLine += ' {';
            lines.push(machineLine);
            machineJson.attributes.forEach((attr: any) => {
                lines.push('    ' + generateAttributeDSL(attr));
            });
            lines.push('};');
        } else {
            // Machine without attributes - simple declaration
            lines.push(machineLine);
        }

        lines.push('');
    }

    // Build a tree structure from flat nodes list
    // Key nodeMap by qualified path to handle nodes with duplicate simple names
    const nodeMap = new Map<string, any>();
    const simpleNameToQualified = new Map<string, string[]>();
    const childrenMap = new Map<string, any[]>();
    const rootNodes: any[] = [];

    // First pass: Build a temporary map by simple name to resolve parent chains
    // Notes are excluded as their "name" is actually the target they document, not a unique node ID
    const tempNodesByName = new Map<string, any>();
    machineJson.nodes.forEach(node => {
        const isNote = node.type && node.type.toLowerCase() === 'note';
        if (!isNote) {
            tempNodesByName.set(node.name, node);
        }
    });

    // Helper to build fully qualified path for a node by walking up parent chain
    const buildQualifiedPath = (node: any): string => {
        if (!node.parent) return node.name;

        const pathParts: string[] = [node.name];
        let currentParent = node.parent;
        const visited = new Set<string>();
        visited.add(node.name);

        while (currentParent) {
            // Prevent infinite loops from circular parent references
            if (visited.has(currentParent)) {
                console.warn(`Circular parent reference detected for node: ${node.name}`);
                break;
            }
            visited.add(currentParent);

            pathParts.unshift(currentParent);
            const parentNode = tempNodesByName.get(currentParent);
            if (!parentNode) break;
            currentParent = parentNode.parent;
        }

        return pathParts.join('.');
    };

    // Second pass: Create node map and identify children using qualified paths
    // Notes are excluded from nodeMap as they don't participate in edge relationships
    machineJson.nodes.forEach(node => {
        const isNote = node.type && node.type.toLowerCase() === 'note';

        if (!isNote) {
            const qualifiedPath = buildQualifiedPath(node);
            nodeMap.set(qualifiedPath, node);

            // Store all qualified paths for this simple name (handles duplicates)
            if (!simpleNameToQualified.has(node.name)) {
                simpleNameToQualified.set(node.name, []);
            }
            simpleNameToQualified.get(node.name)!.push(qualifiedPath);
        }

        if (node.parent) {
            // This node has a parent - add to children map
            if (!childrenMap.has(node.parent)) {
                childrenMap.set(node.parent, []);
            }
            childrenMap.get(node.parent)!.push(node);
        } else {
            // This is a root node (no parent)
            rootNodes.push(node);
        }
    });

    // Group root nodes by type for better organization
    const rootNodesByType = new Map<string, any[]>();
    rootNodes.forEach(node => {
        const type = node.type || 'undefined';
        if (!rootNodesByType.has(type)) {
            rootNodesByType.set(type, []);
        }
        rootNodesByType.get(type)!.push(node);
    });

    // Generate root nodes with their children recursively
    rootNodesByType.forEach((nodes, type) => {
        nodes.forEach(node => {
            lines.push(generateNodeDSLWithChildren(node, childrenMap, machineJson.edges || [], 0));
        });
        if (nodes.length > 0) {
            lines.push(''); // Add blank line between type groups
        }
    });

    // Generate edges that are at the root level (not within any node scope)
    const rootEdges = getRootLevelEdges(machineJson.edges || [], rootNodes, childrenMap);
    if (rootEdges.length > 0) {
        rootEdges.forEach(edge => {
            lines.push(generateEdgeDSL(edge, nodeMap, simpleNameToQualified));
        });
        lines.push('');
    }

    return lines.join('\n').trim() + '\n';
}

/**
 * Determine which edges belong at the root level vs. inside node scopes
 */
function getRootLevelEdges(edges: MachineEdgeJSON[], rootNodes: any[], childrenMap: Map<string, any[]>): MachineEdgeJSON[] {
    const rootNodeNames = new Set(rootNodes.map(n => n.name));
    const allDescendantNames = new Set<string>();

    // Collect all descendant node names
    const collectDescendants = (nodeName: string) => {
        const children = childrenMap.get(nodeName) || [];
        children.forEach(child => {
            allDescendantNames.add(child.name);
            collectDescendants(child.name);
        });
    };

    rootNodes.forEach(node => collectDescendants(node.name));

    // An edge belongs at root level if:
    // - Both source and target are root nodes, OR
    // - Source or target is in different parent scopes
    return edges.filter(edge => {
        const sourceIsRoot = rootNodeNames.has(edge.source);
        const targetIsRoot = rootNodeNames.has(edge.target);

        // If both are root nodes, it's a root-level edge
        if (sourceIsRoot && targetIsRoot) {
            return true;
        }

        // If one is root and one is nested, it's a root-level edge
        if (sourceIsRoot || targetIsRoot) {
            return true;
        }

        // Both are nested - need to check if they share the same parent
        // For now, we'll include cross-scope edges at root level
        // A more sophisticated implementation would determine the common ancestor
        return true;
    });
}

/**
 * Generate DSL for a node and its children recursively
 */
function generateNodeDSLWithChildren(
    node: any,
    childrenMap: Map<string, any[]>,
    allEdges: MachineEdgeJSON[],
    indentLevel: number
): string {
    const indent = '    '.repeat(indentLevel);
    const childIndent = '    '.repeat(indentLevel + 1);

    // Notes should never have children - they only have attributes
    const isNote = node.type && node.type.toLowerCase() === 'note';
    const children = isNote ? [] : (childrenMap.get(node.name) || []);
    const hasChildren = children.length > 0;

    // Find edges that belong to this node's scope (between its children)
    const scopeEdges = allEdges.filter(edge => {
        const childNames = new Set(children.map(c => c.name));
        return childNames.has(edge.source) && childNames.has(edge.target);
    });

    const parts: string[] = [];

    // Add type if present and not 'undefined'
    if (node.type && node.type !== 'undefined') {
        parts.push(node.type);
    }

    // Add node name
    parts.push(node.name);

    // Add title if present
    if (node.title) {
        parts.push(quoteString(node.title));
    }

    // Add annotations if present
    let annotationsStr = '';
    if (node.annotations && node.annotations.length > 0) {
        annotationsStr = node.annotations.map((ann: any) => {
            if (ann.value) {
                return ` @${ann.name}(${quoteString(ann.value)})`;
            }
            return ` @${ann.name}`;
        }).join('');
    }

    // Check if node has attributes
    const hasAttributes = node.attributes && node.attributes.length > 0;

    if (hasChildren || hasAttributes || scopeEdges.length > 0) {
        // Node with children, attributes, or scoped edges - use block syntax
        let result = indent + parts.join(' ') + annotationsStr + ' {\n';

        // Add attributes
        if (hasAttributes) {
            node.attributes.forEach((attr: any) => {
                result += childIndent + generateAttributeDSL(attr) + '\n';
            });
            if (hasChildren || scopeEdges.length > 0) {
                result += '\n'; // Blank line after attributes
            }
        }

        // Add children recursively
        if (hasChildren) {
            children.forEach((child, idx) => {
                result += generateNodeDSLWithChildren(child, childrenMap, allEdges, indentLevel + 1);
                if (idx < children.length - 1 || scopeEdges.length > 0) {
                    result += '\n';
                }
            });
        }

        // Add scoped edges
        if (scopeEdges.length > 0) {
            if (hasChildren) {
                result += '\n'; // Blank line before edges
            }
            scopeEdges.forEach(edge => {
                result += childIndent + generateEdgeDSL(edge) + '\n';
            });
        }

        result += indent + '};\n';
        return result;
    } else if (hasAttributes) {
        // Node with only attributes - use block syntax
        let result = indent + parts.join(' ') + annotationsStr + ' {\n';
        node.attributes.forEach((attr: any) => {
            result += childIndent + generateAttributeDSL(attr) + '\n';
        });
        result += indent + '};\n';
        return result;
    } else {
        // Simple node - use inline syntax
        return indent + parts.join(' ') + annotationsStr + ';\n';
    }
}

function generateNodeDSL(node: any): string {
    const parts: string[] = [];

    // Add type if present and not 'undefined'
    if (node.type && node.type !== 'undefined') {
        parts.push(node.type);
    }

    // Add node name
    parts.push(node.name);

    // Add title if present
    if (node.title) {
        parts.push(quoteString(node.title));
    }

    // Add annotations if present
    let annotationsStr = '';
    if (node.annotations && node.annotations.length > 0) {
        annotationsStr = node.annotations.map((ann: any) => {
            if (ann.value) {
                return ` @${ann.name}(${quoteString(ann.value)})`;
            }
            return ` @${ann.name}`;
        }).join('');
    }

    // Check if node has attributes
    const hasAttributes = node.attributes && node.attributes.length > 0;

    if (hasAttributes) {
        // Node with attributes - use block syntax
        let result = parts.join(' ') + annotationsStr + ' {\n';
        node.attributes.forEach((attr: any) => {
            result += '    ' + generateAttributeDSL(attr) + '\n';
        });
        result += '}';
        return result;
    } else {
        // Simple node - use inline syntax
        return parts.join(' ') + annotationsStr + ';';
    }
}

function generateAttributeDSL(attr: any): string {
    let result = attr.name;

    // Add type if present
    if (attr.type) {
        result += `<${attr.type}>`;
    }

    // Add value if present
    if (attr.value !== undefined && attr.value !== null) {
        result += ': ';
        if (Array.isArray(attr.value)) {
            // Array value - each element needs proper formatting
            const arrayValues = attr.value.map((v: any) => {
                // For array elements, always quote strings
                if (typeof v === 'string') {
                    return quoteString(v);
                } else {
                    return formatValue(v);
                }
            });
            result += '[' + arrayValues.join(', ') + ']';
        } else {
            result += formatValue(attr.value);
        }
    }

    result += ';';
    return result;
}

function generateEdgeDSL(edge: MachineEdgeJSON, nodeMap?: Map<string, any>, simpleNameMap?: Map<string, string[]>): string {
    const parts: string[] = [];

    // Helper function to get qualified name for a node
    const getQualifiedName = (nodeName: string): string => {
        if (!nodeMap || !simpleNameMap) return nodeName;

        // First check if this is already a qualified name (contains a dot)
        if (nodeName.includes('.')) {
            const node = nodeMap.get(nodeName);
            return node ? nodeName : nodeName; // Return as-is if qualified
        }

        // Look up the qualified path(s) for this simple name
        const qualifiedPaths = simpleNameMap.get(nodeName);
        if (!qualifiedPaths || qualifiedPaths.length === 0) {
            return nodeName; // No mapping found, return simple name
        }

        // If there's only one node with this simple name, check if it needs qualification
        if (qualifiedPaths.length === 1) {
            const qualifiedPath = qualifiedPaths[0];
            const node = nodeMap.get(qualifiedPath);

            if (!node || !node.parent) {
                return nodeName; // Root-level node, use simple name
            }

            // Nested node, return qualified path
            return qualifiedPath;
        }

        // Multiple nodes with the same simple name exist - ambiguous!
        // We need to pick the right one, but we don't have enough context.
        // For now, use the first one (this case shouldn't happen in well-formed edges)
        const qualifiedPath = qualifiedPaths[0];
        return qualifiedPath;
    };

    // Source (use qualified name if node has parent)
    parts.push(getQualifiedName(edge.source));

    // Add source multiplicity if present
    if (edge.sourceMultiplicity) {
        parts.push(quoteString(edge.sourceMultiplicity));
    }

    // Build edge annotations string (goes between source and arrow)
    let edgeAnnotationsStr = '';
    let skipEdgeText = false;  // Flag to skip edge text if it was used as annotation value

    if (edge.annotations && edge.annotations.length > 0) {
        // Check if we have a single annotation without a value and edge has only text property
        // This handles the case where @priority(1) is parsed as @priority + text:"1"
        const edgeValue = edge.value || {};
        const onlyHasText = Object.keys(edgeValue).length === 1 && edgeValue.text !== undefined;
        const singleAnnWithoutValue = edge.annotations.length === 1 &&
                                      !edge.annotations[0].value &&
                                      !edge.annotations[0].attributes;

        if (singleAnnWithoutValue && onlyHasText) {
            // Use the text as the annotation value
            const ann = edge.annotations[0];
            edgeAnnotationsStr = `@${ann.name}(${quoteString(String(edgeValue.text))})`;
            skipEdgeText = true;  // Don't include text in the label
        } else {
            edgeAnnotationsStr = edge.annotations.map((ann: any) => {
                if (ann.value) {
                    return `@${ann.name}(${quoteString(ann.value)})`;
                } else if (ann.attributes) {
                    // Annotation with attribute-style parameters
                    const attrs = Object.entries(ann.attributes)
                        .map(([key, val]) => {
                            if (typeof val === 'string' && (val.includes(':') || val.includes(' '))) {
                                return `${key}: ${quoteString(val as string)}`;
                            }
                            return `${key}: ${val}`;
                        })
                        .join('; ');
                    return `@${ann.name}(${attrs})`;
                }
                return `@${ann.name}`;
            }).join(' ');
        }
    }

    // Determine arrow type and label
    const arrowType = edge.arrowType || '->';
    const edgeValue = edge.value || {};

    // Extract label or edge attributes
    let label = '';
    let isPlainText = false;
    let isEdgeAttributes = false;

    if (Object.keys(edgeValue).length > 0 && !skipEdgeText) {
        // Check if this looks like edge attributes (has properties besides just 'text')
        const valueKeys = Object.keys(edgeValue);
        const hasNonTextProps = valueKeys.some(k => k !== 'text');

        if (hasNonTextProps) {
            // This looks like edge attributes: timeout: 1000, priority: high
            // Format as comma-separated attributes, excluding 'text' if present
            const props = valueKeys
                .filter(key => key !== 'text')  // Skip 'text' property
                .map(key => `${key}: ${formatValue(edgeValue[key])}`)
                .join(', ');
            if (props) {
                label = props;
                isEdgeAttributes = true;
            }
        } else if (edgeValue.text) {
            // Only has 'text' property - treat as plain text label
            label = edgeValue.text;
            isPlainText = true;
        }
    }

    // Build arrow with label, annotations, and attributes
    // Syntax patterns:
    // - Simple: A -> B
    // - With annotation: A -@annotation-> B
    // - With label: A -"label"-> B
    // - With attributes: A -attr: value-> B
    // - Combined: A -@annotation, attr: value-> B

    if (label) {
        if (isEdgeAttributes) {
            // Edge attributes: -@annotation, attr: value->
            if (edgeAnnotationsStr) {
                // Annotations + attributes: -@annotation, attributes->
                if (arrowType === '->') {
                    parts.push(`-${edgeAnnotationsStr}, ${label}->`);
                } else if (arrowType === '-->') {
                    parts.push(`-${edgeAnnotationsStr}, ${label}-->`);
                } else if (arrowType === '=>') {
                    parts.push(`-${edgeAnnotationsStr}, ${label}=>`);
                } else {
                    parts.push(`-${edgeAnnotationsStr}, ${label}${arrowType.substring(1)}`);
                }
            } else {
                // Just attributes: -attr: value->
                if (arrowType === '->') {
                    parts.push(`-${label}->`);
                } else if (arrowType === '-->') {
                    parts.push(`-${label}-->`);
                } else if (arrowType === '=>') {
                    parts.push(`-${label}=>`);
                } else {
                    parts.push(`-${label}${arrowType.substring(1)}`);
                }
            }
        } else {
            // Plain text label: -@annotation-"label"-> or just -"label"->
            const formattedLabel = isPlainText ? formatValue(label) : label;
            const arrowPrefix = edgeAnnotationsStr ? ` -${edgeAnnotationsStr}` : '';

            if (arrowType === '->') {
                parts.push(`${arrowPrefix}-${formattedLabel}->`);
            } else if (arrowType === '-->') {
                parts.push(`${arrowPrefix}--${formattedLabel}-->`);
            } else if (arrowType === '=>') {
                parts.push(`${arrowPrefix}=${formattedLabel}=>`);
            } else {
                parts.push(edgeAnnotationsStr ? `${arrowPrefix}${arrowType.substring(1)}` : arrowType);
            }
        }
    } else {
        // Simple arrow without label
        if (edgeAnnotationsStr) {
            // Arrow with annotations but no label: -@Critical->
            if (arrowType === '->') {
                parts.push(`-${edgeAnnotationsStr}->`);
            } else if (arrowType === '-->') {
                parts.push(`-${edgeAnnotationsStr}-->`);
            } else if (arrowType === '=>') {
                parts.push(`-${edgeAnnotationsStr}=>`);
            } else {
                // For other arrow types
                parts.push(`-${edgeAnnotationsStr}${arrowType.substring(1)}`);
            }
        } else {
            parts.push(arrowType);
        }
    }

    // Add target multiplicity if present
    if (edge.targetMultiplicity) {
        parts.push(quoteString(edge.targetMultiplicity));
    }

    // Target (use qualified name if node has parent)
    parts.push(getQualifiedName(edge.target));

    return parts.join(' ') + ';';
}

function formatValue(value: any): string {
    if (typeof value === 'string') {
        // Check if it looks like a reference (starts with #)
        if (value.startsWith('#')) {
            return value;
        }

        // Check if it's a boolean string
        if (value === 'true' || value === 'false') {
            return value;
        }

        // Try to parse as number to preserve numeric types
        // But be careful with version strings like "1.0.0"
        const numValue = Number(value);
        if (!isNaN(numValue) && value.trim() !== '') {
            // Only treat as number if string representation exactly matches
            // This avoids "1.0.0" -> 1 or "042" -> 42
            const numStr = String(numValue);
            if (numStr === value || numStr === value.trim()) {
                // Extra check: if it has leading zeros or multiple dots, quote it
                if (!/^0\d|\..*\./.test(value)) {
                    return numStr;
                }
            }
        }

        // Check if it needs quoting (contains spaces, special characters, or looks like a path/URL)
        if (/[\s;,{}()\[\]]/.test(value) || value.length === 0 || value.includes('/') || value.includes(':') && !value.startsWith('#')) {
            return quoteString(value);
        }

        // Quote if it contains dots (likely a version number, domain, etc.)
        if (value.includes('.')) {
            return quoteString(value);
        }

        // By default, quote all string values to ensure they are treated as literals
        // Only unquoted values should be: references (#foo), booleans (true/false), and numbers
        return quoteString(value);
    } else if (typeof value === 'number') {
        return String(value);
    } else if (typeof value === 'boolean') {
        return String(value);
    } else if (value === null || value === undefined) {
        return '""';
    } else {
        // Fallback for complex types
        return quoteString(JSON.stringify(value));
    }
}

function quoteString(str: string): string {
    // Escape internal quotes and return quoted string
    const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}
