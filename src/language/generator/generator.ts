import type { Annotation, EdgeAttribute, EdgeType, Machine, Node } from '../generated/ast.js';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from '../../cli/cli-util.js';
import { Edge, MachineJSON } from '../machine-module.js';
import { DependencyAnalyzer } from '../dependency-analyzer.js';
import { generateGraphvizFromJSON } from '../diagram/index.js';
import { TypeHierarchy } from '../diagram/types.js';
import { TypeChecker } from '../type-checker.js';
import { GraphValidator } from '../graph-validator.js';
import { ValidationContext, ValidationSeverity, ValidationCategory, createValidationError } from '../validation-errors.js';
import { extractValueFromAST } from '../utils/ast-helpers.js';

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
    const checkNodeHierarchy = (currentNodeName: string): boolean | undefined => {
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
                        `Node cannot be reached from entry points`,
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
                            context.addError(createValidationError(
                                result.message,
                                {
                                    severity: ValidationSeverity.ERROR,
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
        // Analyze dependencies from template variables
        const dependencyAnalyzer = new DependencyAnalyzer(this.machine);
        const inferredDeps = dependencyAnalyzer.inferDependencies();

        // Create a serializable object representation of the machine
        const machineObject : MachineJSON = {
            title: this.machine.title,
            attributes: this.machine.attributes ? this.serializeMachineAttributes(this.machine.attributes) : undefined,
            annotations: this.machine.annotations && this.machine.annotations.length > 0
                ? this.machine.annotations.map(ann => this.serializeAnnotation(ann))
                : undefined,
            nodes: this.serializeNodes(),
            edges: this.serializeEdges(),
            notes: this.serializeNotes(),
            inferredDependencies: inferredDeps.map(dep => ({
                source: dep.source,
                target: dep.target,
                reason: dep.reason,
                path: dep.path
            }))
        };

        return {
            filePath: this.filePath,
            content: JSON.stringify(machineObject, null, 2)
        };
    }

    private serializeNodes(): any[] {
        // Flatten and transform nodes recursively
        const flattenNode = (node: Node, parentName?: string): any[] => {
            const baseNode: any = {
                name: node.name,
                type: node.type?.toLowerCase(),  // Normalize type to lowercase
                attributes: this.serializeAttributes(node)
            };

            // Add parent field for hierarchy tracking (used by context inheritance)
            if (parentName) {
                baseNode.parent = parentName;
            }

            // Add annotations if present
            if (node.annotations && node.annotations.length > 0) {
                baseNode.annotations = node.annotations.map(ann => this.serializeAnnotation(ann));
            }

            // Add title if present
            if (node.title) {
                baseNode.title = node.title.replace(/^"|"$/g, '');
            }

            // Recursively flatten child nodes
            const childNodes = node.nodes.flatMap(child =>
                flattenNode(child, node.name)
            );

            return [baseNode, ...childNodes];
        };

        return this.machine.nodes.flatMap(node => flattenNode(node));
    }

    /**
     * Recursively extract primitive value from AST nodes
     */
    private extractPrimitiveValue(value: any): any {
        // Handle null/undefined
        if (value === null || value === undefined) {
            return value;
        }

        // If it's already a primitive, return it
        if (typeof value !== 'object') {
            return value;
        }

        // If it has a 'value' property that's an array, process it first
        // (This handles AttributeValue with array syntax: [item1, item2])
        if ('value' in value && Array.isArray(value.value)) {
            if (value.value.length === 1) {
                return this.extractPrimitiveValue(value.value[0]);
            }
            return value.value.map((v: any) => this.extractPrimitiveValue(v));
        }

        // If it's an AST node with $cstNode, extract text
        if (value.$cstNode && value.$cstNode.text !== undefined) {
            let text = value.$cstNode.text;
            // Remove quotes if present
            if (typeof text === 'string') {
                const hasQuotes = /^["']/.test(text);
                text = text.replace(/^["']|["']$/g, '');

                // If the original didn't have quotes, try to parse as number or boolean
                if (!hasQuotes) {
                    // Try to parse as number
                    const numValue = Number(text);
                    if (!isNaN(numValue) && text.trim() !== '') {
                        return numValue;
                    }
                    // Try to parse as boolean
                    if (text === 'true') return true;
                    if (text === 'false') return false;
                }
            }
            return text;
        }

        // If it has a 'value' property, recurse
        if ('value' in value) {
            return this.extractPrimitiveValue(value.value);
        }

        // If it's an array, process each element
        if (Array.isArray(value)) {
            if (value.length === 1) {
                return this.extractPrimitiveValue(value[0]);
            }
            return value.map(v => this.extractPrimitiveValue(v));
        }

        // Last resort: convert to string (might give [object Object])
        return String(value);
    }

    private serializeAttributes(node: Node): any[] {
        return node.attributes?.map(attr => {
            // Extract the actual value from the AttributeValue using recursive extraction
            // Use the shared extractValueFromAST helper which handles nested objects/arrays
            let value: any = extractValueFromAST(attr.value);

            // Serialize type (including generic types)
            const typeStr = attr.type ? this.serializeType(attr.type) : undefined;

            return {
                name: attr.name,
                type: typeStr,
                value: value
            };
        }) || [];
    }

    private serializeMachineAttributes(attributes: any[]): any[] {
        return attributes?.map(attr => {
            // Extract the actual value from the AttributeValue using recursive extraction
            // Use the shared extractValueFromAST helper which handles nested objects/arrays
            let value: any = extractValueFromAST(attr.value);

            // Serialize type (including generic types)
            const typeStr = attr.type ? this.serializeType(attr.type) : undefined;

            return {
                name: attr.name,
                type: typeStr,
                value: value
            };
        }) || [];
    }

    private serializeAnnotation(annotation: Annotation): any {
        const serialized: any = {
            name: annotation.name
        };

        if (annotation.value !== undefined && annotation.value !== null) {
            serialized.value = annotation.value.replace(/^"|"$/g, '');
        }

        const attributes = this.serializeAnnotationArguments(annotation.arguments);
        if (attributes.length > 0) {
            serialized.attributes = attributes;
        }

        return serialized;
    }

    private serializeAnnotationArguments(args: EdgeAttribute[] | undefined): any[] {
        if (!args || args.length === 0) {
            return [];
        }

        return args.map(attr => {
            const result: any = {};

            if (attr.name) {
                result.name = attr.name;
            }

            if (attr.value !== undefined && attr.value !== null) {
                result.value = this.normalizeAnnotationValue(attr.value);
            } else if (attr.text !== undefined && attr.text !== null) {
                result.value = this.normalizeAnnotationValue(attr.text);
            }

            if (attr.params && attr.params.length > 0) {
                result.params = attr.params
                    .map(param => this.normalizeAnnotationValue(param))
                    .filter((param): param is string | number => param !== undefined && param !== null && param !== '');
            }

            return result;
        }).filter(item => Object.keys(item).length > 0);
    }

    private normalizeAnnotationValue(value: any): any {
        let resolved = value;

        if (resolved && typeof resolved === 'object') {
            if ('$cstNode' in resolved && resolved.$cstNode?.text !== undefined) {
                resolved = resolved.$cstNode.text;
            } else if ('value' in resolved) {
                resolved = (resolved as any).value;
            }
        }

        if (typeof resolved === 'string') {
            return resolved.replace(/^["']|["']$/g, '');
        }

        return resolved;
    }

    /**
     * Serialize a TypeDef to string format, handling generic types
     * e.g., Promise<Result> → "Promise<Result>"
     */
    private serializeType(typeDef: any): string {
        if (!typeDef) return '';

        let result = typeDef.base || typeDef;

        // If it's just a string (backwards compatibility)
        if (typeof typeDef === 'string') {
            return typeDef;
        }

        // Handle generic types
        if (typeDef.generics && typeDef.generics.length > 0) {
            const genericTypes = typeDef.generics.map((g: any) => this.serializeType(g)).join(', ');
            result += `<${genericTypes}>`;
        }

        return result;
    }

    /**
     * Serialize notes attached to nodes
     * Notes now have target reference, optional title, annotations, and attributes
     */
    private serializeNotes(): any[] {
        if (!this.machine.notes || this.machine.notes.length === 0) {
            return [];
        }

        return this.machine.notes.map(note => ({
            target: note.target.ref?.name || '',
            content: note.title?.replace(/^"|"$/g, '') || '',
            annotations: note.annotations?.map((ann: Annotation) => this.serializeAnnotation(ann)) || [],
            attributes: note.attributes?.map((attr: any) => ({
                name: attr.name,
                type: attr.type,
                value: this.extractPrimitiveValue(attr.value)
            })) || []
        })).filter(n => n.target); // Filter out notes with invalid targets
    }

    private serializeEdges(): any[] {
        // Recursively collect edges from all nodes
        const collectEdges = (edges: any[], nodes: Node[]): any[] => {
            // Add edges at current level
            const currentEdges = edges.flatMap((edge: any) => {
                const sources = edge.source.map((s: any) => s.ref?.name);
                let currentSources = sources;

                return edge.segments.flatMap((segment: any) => {
                    const targets = segment.target.map((t: any) => t.ref?.name);
                    const edgeValue = this.serializeEdgeValue(segment.label);
                    const edgeAnnotations = this.serializeEdgeAnnotations(segment.label);
                    const edges = currentSources.flatMap((source: any) =>
                        targets.map((target: any) => ({
                            source,
                            target,
                            value: edgeValue,
                            attributes: edgeValue,  // Keep for backward compatibility
                            annotations: edgeAnnotations,  // Add edge annotations
                            arrowType: segment.endType,  // Preserve arrow type
                            sourceMultiplicity: segment.sourceMultiplicity?.replace(/"/g, ''),  // Remove quotes
                            targetMultiplicity: segment.targetMultiplicity?.replace(/"/g, '')   // Remove quotes
                        })).filter((e: any) => e.source && e.target)
                    );
                    currentSources = targets; // Update sources for next segment
                    return edges;
                });
            });

            // Recursively collect edges from child nodes
            const childEdges = nodes.flatMap(node => {
                if (node.edges && node.edges.length > 0) {
                    return collectEdges(node.edges, node.nodes || []);
                }
                // Still recurse into child nodes even if current node has no edges
                if (node.nodes && node.nodes.length > 0) {
                    return collectEdges([], node.nodes);
                }
                return [];
            });

            return [...currentEdges, ...childEdges];
        };

        return collectEdges(this.machine.edges, this.machine.nodes);
    }

    /**
     * Serialize edge annotations from EdgeType labels
     */
    private serializeEdgeAnnotations(labels?: EdgeType[]): any[] | undefined {
        if (!labels || labels.length === 0) {
            return undefined;
        }

        const annotations: any[] = [];
        labels.forEach((label) => {
            if (label.annotations && label.annotations.length > 0) {
                label.annotations.forEach(ann => {
                    annotations.push(this.serializeAnnotation(ann));
                });
            }
        });

        return annotations.length > 0 ? annotations : undefined;
    }

    private serializeEdgeValue(labels?: EdgeType[]): Record<string, any> | undefined {
        if (!labels || labels.length === 0) {
            return undefined;
        }

        const value: Record<string, any> = {};
        labels.forEach((label) => {
            // Check if the label itself has text content in its CST node
            if (label.$cstNode && 'text' in label.$cstNode) {
                const labelText = label.$cstNode.text;

                // For simple labels, the CST text is just the label name (e.g., "feeds", "stores")
                // For complex patterns, try to extract from full syntax
                if (labelText && labelText.trim()) {
                    // Check if it's a simple label (just the text)
                    if (!labelText.includes('-') && !labelText.includes('=') && !labelText.includes('>')) {
                        value['text'] = labelText.trim();
                    } else {
                        // Try to extract from complex patterns like "-feeds->" or "--compute-->" or "=finalize=>"
                        const match = labelText.match(/^-+([^-]+)-+>?$|^=+([^=]+)=+>?$/);
                        if (match) {
                            const extractedLabel = match[1] || match[2];
                            value['text'] = extractedLabel;
                        }
                    }
                }
            }

            // Also process the value array as before
            label.value.forEach((attr) => {
                if (!attr.name && attr.text) {
                    // Extract the actual string value, removing quotes if present
                    let textValue = attr.text;

                    // Handle AST objects for text values
                    if (textValue && typeof textValue === 'object' && '$cstNode' in textValue) {
                        const astNode = textValue as any;
                        if (astNode.$cstNode && 'text' in astNode.$cstNode) {
                            textValue = astNode.$cstNode.text;
                        }
                    }

                    if (typeof textValue === 'string') {
                        textValue = textValue.replace(/^["']|["']$/g, '');
                    }

                    value['text'] = textValue;
                } else if (attr.name && attr.value) {
                    // Extract the actual value, handling nested value property
                    let attrValue = attr.value;

                    // Handle AST objects for attribute values
                    if (attrValue && typeof attrValue === 'object' && '$cstNode' in attrValue) {
                        const astNode = attrValue as any;
                        if (astNode.$cstNode && 'text' in astNode.$cstNode) {
                            attrValue = astNode.$cstNode.text;
                        } else if ('value' in astNode) {
                            attrValue = astNode.value;
                        }
                    } else if (typeof attrValue === 'object' && attrValue !== null && 'value' in attrValue) {
                        attrValue = (attrValue as any).value;
                    }

                    if (typeof attrValue === 'string') {
                        attrValue = attrValue.replace(/^["']|["']$/g, '');
                    }

                    value[attr.name] = attrValue;
                }
            });
        });

        // If we have named attributes (other than 'text'), remove the CST-derived 'text' field
        // The 'text' field from CST includes the entire label content including all attributes
        // which would cause round-trip issues when regenerating DSL
        const hasNamedAttributes = Object.keys(value).some(key => key !== 'text');
        if (hasNamedAttributes && value['text']) {
            delete value['text'];
        }

        return Object.keys(value).length > 0 ? value : undefined;
    }
}

// Helper function to wrap text at word boundaries (kept for MarkdownGenerator)
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

class GraphvizGenerator extends BaseGenerator {
    protected fileExtension = 'dot';

    protected generateContent(): FileGenerationResult {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson: MachineJSON = JSON.parse(jsonContent.content);

        // Build validation context from the machine AST
        const validationContext = buildValidationContext(this.machine);

        // Use the Graphviz DOT generator with validation context
        const dotContent = generateGraphvizFromJSON(machineJson, {
            title: this.machine.title,
            validationContext: validationContext,
            showValidationWarnings: true,
            warningMode: 'both', // Show both inline badges and warning notes
            minSeverity: 'warning' // Show warnings and errors (not info/hint)
        });

        return {
            filePath: this.filePath,
            content: dotContent
        };
    }

    public getDotDefinition(): string {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson: MachineJSON = JSON.parse(jsonContent.content);

        // Build validation context from the machine AST
        const validationContext = buildValidationContext(this.machine);

        // Use the Graphviz DOT generator with validation context
        return generateGraphvizFromJSON(machineJson, {
            title: this.machine.title,
            validationContext: validationContext,
            showValidationWarnings: true,
            warningMode: 'both', // Show both inline badges and warning notes
            minSeverity: 'warning' // Show warnings and errors (not info/hint)
        });
    }
}

class MarkdownGenerator extends BaseGenerator {
    protected fileExtension = 'md';

    /**
     * Maps DyGram arrow types to Mermaid relationship types
     * This preserves semantic meaning in the diagram
     */
    private getRelationshipType(arrowType: string): string {
        const mapping: Record<string, string> = {
            '->': '-->',      // Association (default)
            '-->': '..>',     // Dependency (dashed)
            '=>': '-->',      // Association (thick arrow - Mermaid doesn't have distinct thick)
            '<-->': '<-->',   // Bidirectional
        };
        return mapping[arrowType] || '-->';
    }

    protected generateContent(): FileGenerationResult {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson: MachineJSON = JSON.parse(jsonContent.content);

        // Build type hierarchy
        const hierarchy = this.buildTypeHierarchy(machineJson.nodes);
        const rootTypes = this.getRootTypes(hierarchy);

        const fileNode = expandToNode`\`\`\`machine
${this.machine.$document?.textDocument.getText()}
\`\`\`

\`\`\`mermaid
---
"title": "${this.machine.title}"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}
  ${machineJson.inferredDependencies && machineJson.inferredDependencies.length > 0 ? toString(this.generateInferredDependencies(machineJson.inferredDependencies)) : ''}
\`\`\`

\`\`\`raw
---
"title": "${this.machine.title}"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}
\`\`\`

\`\`\`raw
${JSON.stringify(machineJson, null, 2)}
\`\`\`
`.appendNewLineIfNotEmpty();

        return {
            filePath: this.filePath,
            content: toString(fileNode)
        };
    }

    public getMermaidDefinition(): string {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson: MachineJSON = JSON.parse(jsonContent.content);

        // Build type hierarchy
        const hierarchy = this.buildTypeHierarchy(machineJson.nodes);
        const rootTypes = this.getRootTypes(hierarchy);

        return toString(expandToNode`---
title: "${this.machine.title}"
config:
  class:
    hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}`);
    }

    private buildTypeHierarchy(nodes: Node[]): TypeHierarchy {
        const hierarchy: TypeHierarchy = {};

        // Initialize hierarchy with all nodes
        nodes.forEach(node => {
            const type = node.type || 'undefined';
            if (!hierarchy[type]) {
                hierarchy[type] = { nodes: [], subtypes: [] };
            }
            hierarchy[type].nodes.push(node);
        });

        // Build subtype relationships
        nodes.forEach(node => {
            if (node.type && hierarchy[node.name]) {
                hierarchy[node.type].subtypes.push(node.name);
            }
        });

        return hierarchy;
    }

    private getRootTypes(hierarchy: TypeHierarchy): string[] {
        const allTypes = new Set(Object.keys(hierarchy));
        const subTypes = new Set(
            Object.values(hierarchy)
                .flatMap(h => h.subtypes)
        );
        return Array.from(allTypes)
            .filter(type => !subTypes.has(type))
            .filter(type => type !== 'undefined');
    }

    private generateTypeHierarchy(hierarchy: TypeHierarchy, types: string[], level = 0): string {
        const result = joinToNode(types, type => {
            const { nodes, subtypes } = hierarchy[type];
            const indent = '  '.repeat(level);

            // Generate namespace content
            const content = joinToNode(nodes, node => {
                // Prefer node title over desc/prompt attributes for display
                const desc = node.attributes?.find((a: any) => a.name === 'desc') || node.attributes?.find((a: any) => a.name === 'prompt');
                let displayValue: any = node.title || desc?.value;
                if (displayValue && typeof displayValue === 'string') {
                    displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
                    displayValue = wrapText(displayValue, 60); // Apply text wrapping
                }
                const header = `class ${node.name}${displayValue ? `["${displayValue}"]` : ''}`;

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
                        return `+${a.name}${a.type ? ` : ${a.type}` : ''} = ${displayValue}`;
                    }).join('\n')
                    : '';

                // Generate annotations
                const annotations = node.annotations?.map((ann: any) => `<<${ann.name}>>`).join('\n' + indent + '    ') || '';
                const typeAnnotation = node.type ? `<<${node.type}>>` : '';
                const allAnnotations = [typeAnnotation, annotations].filter(Boolean).join('\n' + indent + '    ');

                return `${indent}  ${header} {
${indent}    ${allAnnotations}${attributeLines ? '\n' + indent + '    ' + attributeLines : ''}
${indent}  }`;
            }, {
                separator: '\n',
                appendNewLineIfNotEmpty: true,
                skipNewLineAfterLastItem: true,
            });

            // Generate subtype hierarchy
            // Note: Mermaid doesn't support nested namespaces, so we only create namespaces at level 0
            // At deeper levels, we just output the classes without wrapping them in namespaces
            const subtypeContent = subtypes.length > 0 ?
                this.generateTypeHierarchy(hierarchy, subtypes, level + 1) : '';

            // Only create namespace at the top level (level 0)
            // At deeper levels, just output classes with their subtype content
            if (level === 0) {
                return toString(expandToNode`${indent}namespace ${type} {
${toString(content)}${subtypeContent ? '\n' + toString(subtypeContent) : ''}
${indent}}`);
            } else {
                // At nested levels, don't create a namespace - just output the classes
                return toString(expandToNode`${toString(content)}${subtypeContent ? "\n" + toString(subtypeContent) : ''}`);
            }
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });

        return toString(result);
    }

    private generateEdges(edges: Edge[]): string {
        // Return empty string if no edges
        if (!edges || edges.length === 0) return '';

        const result = joinToNode(edges, edge => {
            const edgeValue = edge.value || {};
            const keys = Object.keys(edgeValue);

            // Use arrow type mapping to determine relationship type
            const relationshipType = this.getRelationshipType(edge.arrowType || '->');

            // Build multiplicity strings
            const srcMult = edge.sourceMultiplicity ? ` "${edge.sourceMultiplicity}"` : '';
            const tgtMult = edge.targetMultiplicity ? ` "${edge.targetMultiplicity}"` : '';

            if (keys.length === 0) {
                // No label, but may have multiplicity
                return `  ${edge.source}${srcMult} ${relationshipType}${tgtMult} ${edge.target}`;
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

            // Handle special characters in labels that could confuse Mermaid parser
            // Mermaid classDiagram doesn't properly support colons in labels even when quoted
            // Replace problematic characters with safe Unicode alternatives
            if (labelJSON) {
                // Replace colons with similar Unicode character (ratio symbol ∶ U+2236)
                labelJSON = labelJSON.replace(/:/g, '∶');
                // Replace semicolons with similar Unicode character (fullwidth semicolon ； U+FF1B)
                labelJSON = labelJSON.replace(/;/g, '；');
                // Replace double quotes with single quotes
                labelJSON = labelJSON.replace(/"/g, "'");
            }

            return `  ${edge.source}${srcMult} ${relationshipType}${tgtMult} ${edge.target}${labelJSON ? ` : ${labelJSON}` : ''}`
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });
        return toString(result);
    }

    private generateInferredDependencies(deps: any[]): string {
        if (deps.length === 0) return '';

        const lines: string[] = [];
        lines.push('  %% Inferred Dependencies (from template variables)');

        deps.forEach(dep => {
            // Use dashed arrow for inferred dependencies
            lines.push(`  ${dep.source} ..> ${dep.target} : ${dep.reason}`);
        });

        return lines.join('\n');
    }
}

const escapeHTML = (str : string) : string => str.replace(/[&<>'"]/g, 
    tag => {
        const tags : {[key: string]: string} = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
          };
        return tags[tag];
    });

// HTML Generator
class HTMLGenerator extends BaseGenerator {
    protected fileExtension = 'html';

    protected generateContent(): FileGenerationResult {
        const graphvizGen = new GraphvizGenerator(this.machine, this.filePath, this.options);
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson = jsonContent.content;
        const dotDefinition = escapeHTML(graphvizGen.getDotDefinition());

        // Note: In browser/web builds, the executor script is loaded from CDN or bundled separately
        // In Node.js builds (CLI), we embed the script directly when possible
        let executorScript = '';

        // Only attempt to read the file in Node.js environment
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            try {
                // Find the project root by looking for package.json
                const absoluteFilePath = this.filePath ? path.resolve(this.filePath) : process.cwd();
                let currentDir = path.dirname(absoluteFilePath);
                let projectRoot = currentDir;

                // Walk up the directory tree to find package.json
                while (projectRoot !== path.dirname(projectRoot)) {
                    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                        break;
                    }
                    projectRoot = path.dirname(projectRoot);
                }

                // Try multiple possible locations for the enhanced web executor
                const possiblePaths = [
                    path.join(projectRoot, 'out', 'extension', 'web', 'machine-executor-web-enhanced.js'),
                    path.join(projectRoot, 'out', 'language', 'machine-executor-web-enhanced.js'),
                    path.join(projectRoot, 'dist', 'extension', 'web', 'machine-executor-web-enhanced.js'),
                    path.join(projectRoot, 'dist', 'language', 'machine-executor-web-enhanced.js'),
                    // Fallback to basic version
                    path.join(projectRoot, 'out', 'extension', 'web', 'machine-executor-web.js'),
                    path.join(projectRoot, 'out', 'language', 'machine-executor-web.js'),
                    path.join(projectRoot, 'dist', 'extension', 'web', 'machine-executor-web.js'),
                    path.join(projectRoot, 'dist', 'language', 'machine-executor-web.js')
                ];

                const webExecutorPath = possiblePaths.find(p => fs.existsSync(p));

                if (webExecutorPath) {
                    executorScript = fs.readFileSync(webExecutorPath, 'utf-8');
                }
            } catch (error) {
                // Silently fail in browser environments or when file is not found
                console.warn('Could not load executor script:', error);
            }
        }

        const fileNode = expandToNode`<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="system" content="dygram">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Bundled machine executor -->
    ${executorScript ? `<script type="module">${executorScript}</script>` : '<!-- Executor script not embedded -->'}
    <script type="module">
        console.log('[Graphviz] Starting module initialization...');

        // Comprehensive error logging
        window.addEventListener('error', (e) => {
            console.error('[Global Error]', e.error || e.message);
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('[Unhandled Promise Rejection]', e.reason);
        });

        let graphviz = null;

        // Try to load Graphviz with detailed error handling
        async function initGraphviz() {
            if (!graphviz) {
                try {
                    console.log('[Graphviz] Loading from CDN...');
                    const { Graphviz } = await import('https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@2.26.3/dist/index.js');
                    console.log('[Graphviz] Module loaded, initializing WASM...');
                    graphviz = await Graphviz.load();
                    console.log('[Graphviz] WASM initialized successfully');
                } catch (error) {
                    console.error('[Graphviz] Failed to load:', error);
                    console.error('[Graphviz] Error details:', {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    });
                    throw error;
                }
            }
            return graphviz;
        }

        // Function to toggle dark/light mode
        window.toggleTheme = function() {
            const isDark = document.body.classList.toggle('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            location.reload(); // Refresh to update the diagram
        }

        // Function to download the diagram as SVG
        window.downloadSVG = function() {
            const svg = document.querySelector('#diagram svg');
            const serializer = new XMLSerializer();
            const source = serializer.serializeToString(svg);
            const blob = new Blob([source], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '${this.machine.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_diagram.svg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // Enhanced execution function with full system
        window.executeMachineProgram = async function() {
            const machineData = ${machineJson};
            const resultDiv = document.getElementById('executionResult');
            const diagramContainer = document.getElementById('diagram');

            resultDiv.innerHTML = '<div style="color: #858585;">Executing machine...</div>';
            document.getElementById('results').style.display = 'block';

            try {
                // Check if enhanced executor is available
                if (typeof window.executeWithVisualization === 'function') {
                    // Use enhanced execution with visualization
                    const result = await window.executeWithVisualization(machineData);

                    // Update diagram with runtime visualization
                    if (result.mobileVisualization) {
                        const gv = await initGraphviz();
                        const svg = gv.dot(result.mobileVisualization);
                        diagramContainer.innerHTML = svg;
                    }
                    
                    // Display execution results
                    let html = '<h3>Execution Results</h3>';
                    html += \`<div style="color: #4ec9b0; margin-bottom: 12px;">✓ Executed \${result.steps} steps</div>\`;
                    
                    if (result.context && result.context.history) {
                        html += '<h4>Execution Path:</h4><ul>';
                        result.context.history.forEach(step => {
                            html += \`<li>\${step.from} --(\${step.transition})--> \${step.to}\`;
                            if (step.output) {
                                const output = typeof step.output === 'object' ? 
                                    JSON.stringify(step.output).substring(0, 100) : 
                                    String(step.output).substring(0, 100);
                                html += \`<br><small style="color: #858585;">Output: \${output}...</small>\`;
                            }
                            html += '</li>';
                        });
                        html += '</ul>';
                    }
                    
                    if (result.summary) {
                        html += '<h4>Summary:</h4>';
                        html += \`<div style="font-size: 12px; color: #d4d4d4;">\`;
                        html += \`Current: \${result.summary.currentNode}<br>\`;
                        html += \`Visited: \${result.summary.visitedCount} nodes<br>\`;
                        html += \`Pending: \${result.summary.pendingCount} nodes\`;
                        html += '</div>';
                    }
                    
                    resultDiv.innerHTML = html;
                } else {
                    // Fallback to basic execution
                    const executor = new window.MachineExecutor(machineData);
                    const result = await executor.execute();
                    
                    let html = '<h3>Execution Path:</h3><ul>';
                    result.history?.forEach(step => {
                        html += \`<li>\${step.from} --(\${step.transition})--> \${step.to}</li>\`;
                    });
                    html += '</ul>';
                    resultDiv.innerHTML = html;
                }
            } catch (error) {
                resultDiv.innerHTML = \`<div style="color: #f48771;">Error: \${error.message}</div>\`;
            }
        }

        // Function to download the diagram as PNG
        window.downloadPNG = function() {
            const svg = document.querySelector('#diagram svg');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const loader = new Image();

            loader.onload = function() {
                canvas.width = loader.width;
                canvas.height = loader.height;
                ctx.drawImage(loader, 0, 0);
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = '${this.machine.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_diagram.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

            const serializer = new XMLSerializer();
            const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serializer.serializeToString(svg));
            loader.src = source;
        }

        // Set initial theme
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('[DOM] DOMContentLoaded event fired');

            try {
                const savedTheme = localStorage.getItem('theme') || 'light';
                console.log('[Theme] Applying theme:', savedTheme);
                if (savedTheme === 'dark') {
                    document.body.classList.add('dark-theme');
                }

                // Render initial DOT diagram
                const dotElement = document.querySelector('.graphviz-dot');
                console.log('[DOT] Element found:', !!dotElement);

                if (!dotElement) {
                    throw new Error('DOT code element not found');
                }

                const dotCode = dotElement.textContent.trim();
                console.log('[DOT] Code length:', dotCode.length);
                console.log('[DOT] First 200 chars:', dotCode.substring(0, 200));

                console.log('[Render] Initializing Graphviz...');
                const gv = await initGraphviz();
                console.log('[Render] Graphviz initialized, rendering DOT...');

                const svg = gv.dot(dotCode);
                console.log('[Render] SVG generated, length:', svg.length);
                console.log('[Render] First 200 chars of SVG:', svg.substring(0, 200));

                const container = document.querySelector('#diagram');
                console.log('[Render] Diagram container found:', !!container);

                container.innerHTML = svg;
                console.log('[Render] ✓ Diagram rendered successfully');
            } catch (error) {
                console.error('[Render] ✗ Error rendering diagram:', error);
                console.error('[Render] Error details:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });

                const container = document.querySelector('#diagram');
                if (container) {
                    container.innerHTML = \`
                        <div style="padding: 20px; background: #ffebee; border: 2px solid #f44336; border-radius: 4px; color: #c62828;">
                            <h3 style="margin-top: 0;">⚠️ Diagram Rendering Error</h3>
                            <p><strong>Error:</strong> \${error.message}</p>
                            <p><strong>Check the browser console for detailed logs.</strong></p>
                            <details style="margin-top: 10px;">
                                <summary style="cursor: pointer;">Technical Details</summary>
                                <pre style="background: white; padding: 10px; overflow: auto;">\${error.stack || 'No stack trace available'}</pre>
                            </details>
                        </div>
                    \`;
                }
            }
        });

    </script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            margin: 0;
            padding: 20px;
            transition: background-color 0.3s, color 0.3s;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        body.dark-theme {
            background-color: #1a1a1a;
            color: #ffffff;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 1000;
            flex-wrap: wrap;
        }

        .settings-panel {
            background: #252526;
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            align-items: center;
        }

        body.dark-theme .settings-panel {
            background: #2d2d2d;
        }

        .settings-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .settings-group label {
            font-size: 12px;
            color: #cccccc;
            white-space: nowrap;
        }

        .settings-input {
            background: #3e3e42;
            color: #d4d4d4;
            border: 1px solid #505053;
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 13px;
            font-family: inherit;
        }

        body.dark-theme .settings-input {
            background: #1e1e1e;
            border-color: #3e3e42;
        }

        .settings-input:focus {
            outline: none;
            border-color: #0e639c;
        }

        select.settings-input {
            cursor: pointer;
        }

        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s;
        }

        body:not(.dark-theme) button {
            background-color: #f0f0f0;
            color: #333;
        }

        body:not(.dark-theme) button:hover {
            background-color: #e0e0e0;
        }

        body.dark-theme button {
            background-color: #333;
            color: #fff;
        }

        body.dark-theme button:hover {
            background-color: #444;
        }

        .title {
            margin-bottom: 20px;
            font-size: 24px;
            font-weight: bold;
        }

        #diagram {
            flex-grow: 1;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .dark-theme #diagram {
            filter: invert(1) hue-rotate(180deg);
        }

        .dark-theme #diagram [fill="white"] {
            fill: black;
        }

        #results {
            display: none;
            margin-top: 20px;
            padding: 20px;
            border-radius: 4px;
        }

        body:not(.dark-theme) #results {
            background-color: #f5f5f5;
        }

        body.dark-theme #results {
            background-color: #2d2d2d;
        }
    </style>
</head>
<body>
    <div class="controls">
        <button onclick="toggleTheme()">Toggle Theme</button>
        <button onclick="downloadSVG()">Download SVG</button>
        <button onclick="downloadPNG()">Download PNG</button>
        <button onclick=\"executeMachineProgram()\">Execute Machine</button>
    </div>
    
    <div class="settings-panel">
        <div class="settings-group">
            <label for="model-select">Model:</label>
            <select id="model-select" class="settings-input" onchange="window.saveSettings?.(this.value, document.getElementById('api-key-input').value)">
                <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022</option>
                <option value="claude-3-5-haiku-20241022">claude-3-5-haiku-20241022</option>
                <option value="claude-3-opus-20240229">claude-3-opus-20240229</option>
            </select>
        </div>
        <div class="settings-group">
            <label for="api-key-input">API Key:</label>
            <input type="password" id="api-key-input" class="settings-input" placeholder="Anthropic API key (optional)" 
                   oninput="window.saveSettings?.(document.getElementById('model-select').value, this.value)">
        </div>
        <small style="color: #858585; font-size: 11px;">
            💡 Add API key to enable Task node execution with LLM
        </small>
    </div>
    
    <div class="title">${this.machine.title}</div>
    <div id="diagram">
        <code class="graphviz-dot" style="display:none;">${dotDefinition}</code>
    </div>
    <div id=\"results\">
        <h2>Execution Results</h2>
        <div id=\"executionResult\"></div>
    </div>
</body>
</html>`.appendNewLineIfNotEmpty();

        return {
            filePath: this.filePath,
            content: toString(fileNode)
        };
    }
}

// Generator Factory
class GeneratorFactory {
    static createGenerator(format: string, machine: Machine, filePath?: string, options: GeneratorOptions = {}): BaseGenerator {
        switch (format.toLowerCase()) {
            case 'json':
                return new JSONGenerator(machine, filePath, options);
            case 'graphviz':
            case 'dot':
                return new GraphvizGenerator(machine, filePath, options);
            case 'markdown':
                return new MarkdownGenerator(machine, filePath, options);
            case 'html':
                return new HTMLGenerator(machine, filePath, options);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
}

// Public API
export function generateJSON(machine: Machine, filePath?: string, destination?: string): FileGenerationResult {
    return GeneratorFactory.createGenerator('json', machine, filePath, { destination }).generate();
}

export function generateMarkdown(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('markdown', machine, filePath, { destination }).generate();
}

export function generateHTML(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('html', machine, filePath, { destination }).generate();
}

export function generateGraphviz(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('graphviz', machine, filePath, { destination }).generate();
}

// Backward compiler: JSON -> DyGram DSL
export function generateDSL(machineJson: MachineJSON): string {
    const lines: string[] = [];

    // Add machine title
    lines.push(`machine ${quoteString(machineJson.title || "")}`);
    lines.push('');

    // Track which nodes have been added to avoid duplicates
    const addedNodes = new Set<string>();

    // Group nodes by type for better organization
    const nodesByType = new Map<string, any[]>();
    machineJson.nodes.forEach(node => {
        const type = node.type || 'undefined';
        if (!nodesByType.has(type)) {
            nodesByType.set(type, []);
        }
        nodesByType.get(type)!.push(node);
    });

    // Generate nodes organized by type
    nodesByType.forEach((nodes, type) => {
        nodes.forEach(node => {
            if (!addedNodes.has(node.name)) {
                lines.push(generateNodeDSL(node));
                addedNodes.add(node.name);
            }
        });
        if (nodes.length > 0) {
            lines.push(''); // Add blank line between type groups
        }
    });

    // Generate edges
    if (machineJson.edges && machineJson.edges.length > 0) {
        machineJson.edges.forEach(edge => {
            lines.push(generateEdgeDSL(edge));
        });
        lines.push('');
    }

    // Generate notes
    if (machineJson.notes && machineJson.notes.length > 0) {
        machineJson.notes.forEach(note => {
            lines.push(`note ${note.target} ${quoteString(note.content)};`);
        });
    }

    return lines.join('\n').trim() + '\n';
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

function generateEdgeDSL(edge: Edge): string {
    const parts: string[] = [];

    // Source
    parts.push(edge.source);

    // Add source multiplicity if present
    if (edge.sourceMultiplicity) {
        parts.push(quoteString(edge.sourceMultiplicity));
    }

    // Determine arrow type and label
    const arrowType = edge.arrowType || '->';
    const edgeValue = edge.value || {};

    // Extract label if present
    let label = '';
    let isPlainText = false;
    if (Object.keys(edgeValue).length > 0) {
        // Check for 'text' property first
        if (edgeValue.text) {
            label = edgeValue.text;
            isPlainText = true;
        } else {
            // Build label from properties
            const props = Object.keys(edgeValue)
                .map(key => `${key}: ${formatValue(edgeValue[key])}`)
                .join('; ');
            if (props) {
                label = props;
            }
        }
    }

    // Build arrow with label
    if (label) {
        // Format label (quote if necessary)
        // Only format plain text labels, not attribute maps (which are already formatted)
        const formattedLabel = isPlainText ? formatValue(label) : label;
        // Labeled arrow
        if (arrowType === '->') {
            parts.push(`-${formattedLabel}->`);
        } else if (arrowType === '-->') {
            parts.push(`--${formattedLabel}-->`);
        } else if (arrowType === '=>') {
            parts.push(`=${formattedLabel}=>`);
        } else {
            // For other arrow types, just use the arrow as-is
            parts.push(arrowType);
        }
    } else {
        // Simple arrow without label
        parts.push(arrowType);
    }

    // Add target multiplicity if present
    if (edge.targetMultiplicity) {
        parts.push(quoteString(edge.targetMultiplicity));
    }

    // Target
    parts.push(edge.target);

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

        // Simple identifier-like strings don't need quotes
        return value;
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
