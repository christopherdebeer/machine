import type { EdgeType, Machine, Node } from '../generated/ast.js';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from '../../cli/cli-util.js';
import { Edge, MachineJSON } from '../machine-module.js';
import { DependencyAnalyzer } from '../dependency-analyzer.js';

// Common interfaces
interface GeneratorOptions {
    destination?: string;
    format?: string;
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
                type: node.type,
                attributes: this.serializeAttributes(node)
            };

            // Add parent field for hierarchy tracking (used by context inheritance)
            if (parentName) {
                baseNode.parent = parentName;
            }

            // Add annotations if present
            if (node.annotations && node.annotations.length > 0) {
                baseNode.annotations = node.annotations.map(ann => ({
                    name: ann.name,
                    value: ann.value?.replace(/^"|"$/g, '')  // Remove quotes from string values
                }));
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
            let value: any = this.extractPrimitiveValue(attr.value);

            // Serialize type (including generic types)
            const typeStr = attr.type ? this.serializeType(attr.type) : undefined;

            return {
                name: attr.name,
                type: typeStr,
                value: value
            };
        }) || [];
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
     */
    private serializeNotes(): any[] {
        if (!this.machine.notes || this.machine.notes.length === 0) {
            return [];
        }

        return this.machine.notes.map(note => ({
            target: note.target.ref?.name || '',
            content: note.content?.replace(/^"|"$/g, '') || ''
        })).filter(n => n.target); // Filter out notes with invalid targets
    }

    private serializeEdges(): any[] {
        return this.machine.edges.flatMap(edge => {
            const sources = edge.source.map(s => s.ref?.name);
            let currentSources = sources;

            return edge.segments.flatMap(segment => {
                const targets = segment.target.map(t => t.ref?.name);
                const edgeValue = this.serializeEdgeValue(segment.label);
                const edges = currentSources.flatMap(source =>
                    targets.map(target => ({
                        source,
                        target,
                        value: edgeValue,
                        attributes: edgeValue,  // Keep for backward compatibility
                        arrowType: segment.endType,  // Preserve arrow type
                        sourceMultiplicity: segment.sourceMultiplicity?.replace(/"/g, ''),  // Remove quotes
                        targetMultiplicity: segment.targetMultiplicity?.replace(/"/g, '')   // Remove quotes
                    })).filter(e => e.source && e.target)
                );
                currentSources = targets; // Update sources for next segment
                return edges;
            });
        });
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


interface TypeHierarchy {
    [key: string]: {
        nodes: Node[];
        subtypes: string[];
    };
}

// Helper function to wrap text at word boundaries
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

class MermaidGenerator extends BaseGenerator {
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
            '<|--': '<|--',   // Inheritance
            '*-->': '*--',    // Composition
            'o-->': 'o--',    // Aggregation
        };
        return mapping[arrowType] || '-->';
    }

    /**
     * Convert generic types from angle brackets to Mermaid tildes
     * e.g., "Promise<Result>" → "Promise~Result~"
     * Handles nested generics: "Promise<Array<Record>>" → "Promise~Array~Record~~"
     */
    private convertTypeToMermaid(typeStr: string): string {
        if (!typeStr || typeof typeStr !== 'string') return '';
        // Replace all < and > with ~ for Mermaid generic types
        // This handles nested generics correctly
        return typeStr.replace(/</g, '~').replace(/>/g, '~');
    }

    protected generateContent(): FileGenerationResult {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson: MachineJSON = JSON.parse(jsonContent.content);

        // Build type hierarchy
        const hierarchy = this.buildTypeHierarchy(machineJson.nodes);
        const rootTypes = this.getRootTypes(hierarchy);

        const fileNode = expandToNode`---
"title": "${this.machine.title}"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}
  ${machineJson.notes && machineJson.notes.length > 0 ? toString(this.generateNotes(machineJson.notes)) : ''}
  ${machineJson.inferredDependencies && machineJson.inferredDependencies.length > 0 ? toString(this.generateInferredDependencies(machineJson.inferredDependencies)) : ''}
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
            .filter(type => !subTypes.has(type));
    }

    private generateTypeHierarchy(hierarchy: TypeHierarchy, types: string[], level = 0): string {
        const result = joinToNode(types, type => {
            const { nodes, subtypes } = hierarchy[type];
            const indent = '  '.repeat(level);

            // Generate namespace content
            const content = joinToNode(nodes, node => {
                // Prefer node title over desc/prompt attributes for display
                const desc = node.attributes?.find(a => a.name === 'desc') || node.attributes?.find(a => a.name === 'prompt');
                let displayValue: any = node.title || desc?.value;
                if (displayValue && typeof displayValue === 'string') {
                    displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
                    displayValue = wrapText(displayValue, 60); // Apply text wrapping
                }
                const header = `class ${node.name}${displayValue ? `["${displayValue}"]` : ''}`;

                // Format all attributes except desc/prompt for the class body
                const attributes = node.attributes?.filter(a => a.name !== 'desc' && a.name !== 'prompt') || [];
                const attributeLines = attributes.length > 0
                    ? attributes.map(a => {
                        // Extract the actual value from the attribute
                        let displayValue = a.value?.value ?? a.value;
                        // Remove quotes from string values for display
                        if (typeof displayValue === 'string') {
                            displayValue = displayValue.replace(/^["']|["']$/g, '');
                            displayValue = wrapText(displayValue, 60); // Apply text wrapping
                        }
                        // Convert generic types to Mermaid format (< > to ~ ~)
                        // Note: a.type is already serialized as a string in JSON
                        const typeStr = a.type ? this.convertTypeToMermaid(String(a.type)) : '';
                        return `+${a.name}${typeStr ? ` : ${typeStr}` : ''} = ${displayValue}`;
                    }).join('\n')
                    : '';

                // Generate annotations (filter out @note annotations which are handled separately)
                const annotations = node.annotations?.filter(ann => ann.name !== 'note').map(ann => `<<${ann.name}>>`).join('\n' + indent + '    ') || '';
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

            if (type === 'undefined' || nodes.length === 1) {
                return toString(expandToNode`${toString(content)}${subtypeContent ? "\n" + toString(subtypeContent) : ''}`)
            }

            // Only create namespace at the top level (level 0)
            // At deeper levels, just output classes with their subtype content
            if (level === 0) {
                return toString(expandToNode`${indent}namespace ${type}s {
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

    /**
     * Generate notes for nodes
     */
    private generateNotes(notes: any[]): string {
        if (!notes || notes.length === 0) return '';

        const lines: string[] = [];
        lines.push('  %% Notes');

        notes.forEach(note => {
            const content = note.content.replace(/\\n/g, '<br/>'); // Convert \n to Mermaid line breaks
            lines.push(`  note for ${note.target} "${content}"`);
        });

        return lines.join('\n');
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
                const desc = node.attributes?.find(a => a.name === 'desc') || node.attributes?.find(a => a.name === 'prompt');
                let displayValue: any = node.title || desc?.value;
                if (displayValue && typeof displayValue === 'string') {
                    displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
                    displayValue = wrapText(displayValue, 60); // Apply text wrapping
                }
                const header = `class ${node.name}${displayValue ? `["${displayValue}"]` : ''}`;

                // Format all attributes except desc/prompt for the class body
                const attributes = node.attributes?.filter(a => a.name !== 'desc' && a.name !== 'prompt') || [];
                const attributeLines = attributes.length > 0
                    ? attributes.map(a => {
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
                const annotations = node.annotations?.map(ann => `<<${ann.name}>>`).join('\n' + indent + '    ') || '';
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
        // Find the project root by looking for package.json
        // Resolve to absolute path first
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
        
        let webExecutorPath = possiblePaths.find(p => fs.existsSync(p));
        
        if (!webExecutorPath) {
            throw new Error(`Could not find machine-executor-web-enhanced.js or machine-executor-web.js. Tried:\n${possiblePaths.join('\n')}`);
        }
        
        const mermaidGen = new MermaidGenerator(this.machine, this.filePath, this.options);
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson = jsonContent.content;
        const mermaidDefinition = escapeHTML(mermaidGen.getMermaidDefinition());

        const fileNode = expandToNode`<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="system" content="dygram">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Bundled machine executor -->
    <script type="module">${fs.readFileSync(webExecutorPath, 'utf-8')}</script>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

        // Initialize mermaid with custom settings
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            logLevel: 0,
            htmlLabels: true
        });

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
            a.download = '${this.machine.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_diagram.svg';
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
                        const uniqueId = "mermaid-runtime-" + Date.now();
                        const render = await mermaid.render(uniqueId, result.mobileVisualization);
                        diagramContainer.innerHTML = render.svg;
                        render.bindFunctions?.(diagramContainer);
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
                a.download = '${this.machine.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_diagram.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

            const serializer = new XMLSerializer();
            const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serializer.serializeToString(svg));
            loader.src = source;
        }

        // Set initial theme
        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-theme');
            }
        });
        const uniqueId = "mermaid-svg-" + Date.now();
        const content = document.querySelector('.mermaid');
        const code = content.textContent.trim();
        console.log(code);
        let Diagram = window.Diagram = await mermaid.mermaidAPI.getDiagramFromText(code);
        console.log(Diagram)
        const svg = document.createElement('svg')
        const render = await mermaid.render(uniqueId, code);
        console.log("Render", render);
        const container = document.querySelector('#diagram');
        container.innerHTML = "";
        container.appendChild(svg)
        svg.outerHTML = render.svg
        render.bindFunctions?.(container);

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
        <code class="mermaid">${mermaidDefinition}</code>
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
            case 'mermaid':
                return new MermaidGenerator(machine, filePath, options);
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

export function generateMermaid(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('mermaid', machine, filePath, { destination }).generate();
}

export function generateMarkdown(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('markdown', machine, filePath, { destination }).generate();
}

export function generateHTML(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('html', machine, filePath, { destination }).generate();
}

// Backward compiler: JSON -> DyGram DSL
export function generateDSL(machineJson: MachineJSON): string {
    const lines: string[] = [];

    // Add machine title
    lines.push(`machine ${quoteString(machineJson.title)}`);
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
            lines.push(`note for ${note.target} ${quoteString(note.content)}`);
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
