import type { AttributeValue, EdgeType, Machine, Node, TypeDef } from '../generated/ast.js';
import { DependencyAnalyzer } from '../dependency-analyzer.js';
import { extractValueFromAST } from '../utils/ast-helpers.js';
import type {
    MachineJSON,
    MachineNodeJSON,
    MachineEdgeJSON,
    MachineAnnotationJSON,
    MachineAttributeJSON,
    StyleAttributesJSON
} from './types.js';
import { normalizeStyleKey } from '../utils/style-normalizer.js';

interface NodeAliasInfo {
    node: Node;
    qualifiedName: string;
}

interface ResolvedReference {
    node?: Node;
    nodeName: string;
    attributePath?: string;
}

/**
 * Serialize a Machine AST into the canonical MachineJSON structure.
 */
export function serializeMachineToJSON(machine: Machine): MachineJSON {
    const serializer = new MachineAstSerializer(machine);
    return serializer.serialize();
}

class MachineAstSerializer {
    constructor(private readonly machine: Machine) {}

    serialize(): MachineJSON {
        const dependencyAnalyzer = new DependencyAnalyzer(this.machine);
        const inferredDeps = dependencyAnalyzer.inferDependencies();
        let machineAttributes = this.serializeMachineAttributes(this.machine.attributes ?? []);
        const machineAnnotations = this.machine.annotations?.map(serializeAnnotation);
        
        // Handle @meta annotation - convert to meta: true attribute
        if (machineAnnotations?.some(a => a.name === 'meta')) {
            const hasMetaAttr = machineAttributes.some(a => a.name === 'meta');
            if (!hasMetaAttr) {
                machineAttributes = [...machineAttributes, { name: 'meta', value: true }];
            }
        }
        
        const machineStyle = this.computeMachineStyle(machineAttributes, machineAnnotations);

        return {
            title: this.machine.title,
            attributes: machineAttributes,
            annotations: machineAnnotations,
            nodes: this.serializeNodes(),
            edges: this.serializeEdges(),
            inferredDependencies: inferredDeps.map(dep => ({
                source: dep.source,
                target: dep.target,
                reason: dep.reason,
                path: dep.path
            })),
            style: machineStyle
        };
    }

    private serializeNodes(): MachineNodeJSON[] {
        const flattenNode = (node: Node, parentName?: string): MachineNodeJSON[] => {
            let serializedAttributes = this.serializeAttributes(node);
            const serializedAnnotations = node.annotations?.map(serializeAnnotation);
            
            // Handle @meta annotation - convert to meta: true attribute
            if (serializedAnnotations?.some(a => a.name === 'meta')) {
                const hasMetaAttr = serializedAttributes.some(a => a.name === 'meta');
                if (!hasMetaAttr) {
                    serializedAttributes = [...serializedAttributes, { name: 'meta', value: true }];
                }
            }
            
            const nodeStyle = this.computeNodeStyle(node, serializedAttributes, serializedAnnotations);

            const baseNode: MachineNodeJSON = {
                name: node.name,
                type: node.type?.toLowerCase(),
                attributes: serializedAttributes
            };

            if (parentName) {
                baseNode.parent = parentName;
            }

            if (serializedAnnotations && serializedAnnotations.length > 0) {
                baseNode.annotations = serializedAnnotations;
            }

            if (node.title) {
                baseNode.title = node.title.replace(/^"|"$/g, '');
            }

            if (nodeStyle && Object.keys(nodeStyle).length > 0) {
                baseNode.style = nodeStyle;
            }

            // Add source position metadata for bidirectional highlighting
            if (node.$cstNode) {
                const range = node.$cstNode.range;
                baseNode.$sourceRange = {
                    start: {
                        line: range.start.line,
                        character: range.start.character,
                        offset: range.start.offset
                    },
                    end: {
                        line: range.end.line,
                        character: range.end.character,
                        offset: range.end.offset
                    }
                };
            }

            const childNodes = (node.nodes ?? []).flatMap(child =>
                flattenNode(child, node.name)
            );

            return [baseNode, ...childNodes];
        };

        return this.machine.nodes.flatMap(node => flattenNode(node));
    }

    private computeMachineStyle(
        attributes: MachineAttributeJSON[],
        annotations?: MachineAnnotationJSON[]
    ): StyleAttributesJSON | undefined {
        const styles: Array<StyleAttributesJSON | undefined> = [];

        styles.push(this.extractStyleFromAnnotations(annotations));

        const styleAttribute = attributes.find(attr => attr.name === 'style');
        if (styleAttribute) {
            styles.push(this.normalizeStyleRecord(styleAttribute.value));
        }

        const wrappingKeys = [
            'maxEdgeLabelLength',
            'maxMultiplicityLength',
            'maxAttributeKeyLength',
            'maxAttributeValueLength',
            'maxNodeTitleLength',
            'maxNoteContentLength'
        ];

        const wrappingStyle: StyleAttributesJSON = {};
        wrappingKeys.forEach(key => {
            const attr = attributes.find(a => a.name === key);
            if (attr && attr.value !== undefined) {
                const normalized = this.normalizeWrappingValue(attr.value);
                if (normalized !== undefined) {
                    wrappingStyle[key] = normalized;
                }
            }
        });

        if (Object.keys(wrappingStyle).length > 0) {
            styles.push(wrappingStyle);
        }

        return this.mergeStyles(...styles);
    }

    private computeNodeStyle(
        node: Node,
        attributes: MachineAttributeJSON[],
        annotations?: MachineAnnotationJSON[]
    ): StyleAttributesJSON | undefined {
        const styles: Array<StyleAttributesJSON | undefined> = [];

        styles.push(this.extractStyleFromAnnotations(annotations));

        const styleAttribute = attributes.find(attr => attr.name === 'style');
        if (styleAttribute) {
            styles.push(this.normalizeStyleRecord(styleAttribute.value));
        }

        if ((node.type ?? '').toLowerCase() === 'style') {
            const styleNodeAttributes: StyleAttributesJSON = {};
            attributes.forEach(attr => {
                if (attr.name === 'style') {
                    return;
                }
                this.assignStyleValue(styleNodeAttributes, attr.name, attr.value);
            });

            if (Object.keys(styleNodeAttributes).length > 0) {
                styles.push(styleNodeAttributes);
            }
        }

        return this.mergeStyles(...styles);
    }

    private serializeAttributes(node: Node): MachineAttributeJSON[] {
        return node.attributes?.map(attr => {
            const value = extractValueFromAST(attr.value);
            const typeStr = attr.type ? this.serializeType(attr.type) : undefined;
            return {
                name: attr.name,
                type: typeStr,
                value
            };
        }) ?? [];
    }

    private serializeMachineAttributes(attributes: any[]): MachineAttributeJSON[] {
        return attributes?.map(attr => {
            const value = extractValueFromAST(attr.value);
            const typeStr = attr.type ? this.serializeType(attr.type) : undefined;
            return {
                name: attr.name,
                type: typeStr,
                value
            };
        }) ?? [];
    }

    private extractStyleFromAnnotations(annotations?: MachineAnnotationJSON[]): StyleAttributesJSON | undefined {
        if (!annotations || annotations.length === 0) {
            return undefined;
        }

        const style: StyleAttributesJSON = {};

        annotations.forEach(annotation => {
            if (annotation.name?.toLowerCase() !== 'style') {
                return;
            }

            if (annotation.attributes) {
                Object.entries(annotation.attributes).forEach(([key, value]) => {
                    this.assignStyleValue(style, key, value);
                });
            }

            if (annotation.value) {
                const parsed = this.parseStyleString(annotation.value);
                if (parsed) {
                    Object.entries(parsed).forEach(([key, value]) => {
                        style[key] = value;
                    });
                }
            }
        });

        return Object.keys(style).length > 0 ? style : undefined;
    }

    private normalizeStyleRecord(value: unknown): StyleAttributesJSON | undefined {
        if (value === undefined || value === null) {
            return undefined;
        }

        if (typeof value === 'string') {
            return this.parseStyleString(value);
        }

        if (Array.isArray(value)) {
            return undefined;
        }

        if (typeof value === 'object') {
            const record: StyleAttributesJSON = {};
            Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
                this.assignStyleValue(record, key, nestedValue);
            });
            return Object.keys(record).length > 0 ? record : undefined;
        }

        return undefined;
    }

    private parseStyleString(styleText: string): StyleAttributesJSON | undefined {
        if (!styleText) {
            return undefined;
        }

        const parts = styleText
            .split(';')
            .map(part => part.trim())
            .filter(part => part.length > 0);

        if (parts.length === 0) {
            return undefined;
        }

        const style: StyleAttributesJSON = {};
        parts.forEach(part => {
            const [rawKey, ...valueParts] = part.split(':');
            if (!rawKey || valueParts.length === 0) {
                return;
            }
            const rawValue = valueParts.join(':').trim();
            this.assignStyleValue(style, rawKey, rawValue);
        });

        return Object.keys(style).length > 0 ? style : undefined;
    }

    private assignStyleValue(target: StyleAttributesJSON, key: string, value: unknown): void {
        if (!key) {
            return;
        }

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value as Record<string, unknown>).forEach(([nestedKey, nestedValue]) => {
                this.assignStyleValue(target, nestedKey, nestedValue);
            });
            return;
        }

        const normalizedValue = this.normalizeStylePrimitive(value);
        if (normalizedValue === undefined) {
            return;
        }

        const normalizedKey = normalizeStyleKey(key);
        target[normalizedKey] = normalizedValue;
    }

    private normalizeStylePrimitive(value: unknown): unknown {
        if (value === undefined || value === null) {
            return undefined;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
                return undefined;
            }

            const unquoted = trimmed.replace(/^["']|["']$/g, '');
            const lower = unquoted.toLowerCase();
            if (lower === 'true') {
                return true;
            }
            if (lower === 'false') {
                return false;
            }

            const numeric = Number(unquoted);
            if (!isNaN(numeric) && unquoted !== '') {
                return numeric;
            }

            return unquoted;
        }

        return value;
    }

    private normalizeWrappingValue(value: unknown): number | undefined {
        if (typeof value === 'number') {
            return value;
        }

        if (typeof value === 'string') {
            const cleaned = value.replace(/^["']|["']$/g, '').trim();
            if (cleaned.length === 0) {
                return undefined;
            }
            const parsed = Number(cleaned);
            return isNaN(parsed) ? undefined : parsed;
        }

        return undefined;
    }

    private mergeStyles(...styles: Array<StyleAttributesJSON | undefined>): StyleAttributesJSON | undefined {
        const merged: StyleAttributesJSON = {};

        styles.forEach(style => {
            if (!style) {
                return;
            }

            Object.entries(style).forEach(([key, value]) => {
                if (value !== undefined) {
                    merged[key] = value;
                }
            });
        });

        return Object.keys(merged).length > 0 ? merged : undefined;
    }

    private serializeType(typeDef: TypeDef | string): string {
        if (!typeDef) {
            return '';
        }

        if (typeof typeDef === 'string') {
            return typeDef;
        }

        let result = typeDef.base || '';

        if (typeDef.generics && typeDef.generics.length > 0) {
            const genericTypes = typeDef.generics.map(g => this.serializeType(g)).join(', ');
            result += `<${genericTypes}>`;
        }

        return typeDef.optional ? `${result}?` : result;
    }

    private serializeEdges(): MachineEdgeJSON[] {
        const aliasMap = this.buildNodeAliasMap();
        const explicitEdges = this.collectExplicitEdges(aliasMap);
        const attributeEdges = this.generateAttributeEdges(aliasMap, explicitEdges);
        return [...explicitEdges, ...attributeEdges];
    }

    private collectExplicitEdges(aliasMap: Map<string, NodeAliasInfo>): MachineEdgeJSON[] {
        const traverse = (edges: any[] = [], nodes: Node[] = []): MachineEdgeJSON[] => {
            const currentEdges = edges.flatMap(edge => {
                const sourceRefs = edge.source.map((ref: any) => this.resolveEdgeReference(ref, aliasMap));
                if (sourceRefs.length === 0) {
                    return [];
                }

                let activeSources = sourceRefs;
                const segmentEdges: MachineEdgeJSON[] = [];

                edge.segments.forEach((segment: any) => {
                    const targetRefs = segment.target.map((ref: any) => this.resolveEdgeReference(ref, aliasMap));
                    if (targetRefs.length === 0) {
                        activeSources = targetRefs;
                        return;
                    }

                    const edgeAnnotations = this.serializeEdgeAnnotations(segment.label);
                    const { value: edgeValue, style: edgeStyle } = this.serializeEdgePayload(segment.label, edgeAnnotations);
                    const arrowType = segment.endType;
                    const sourceMultiplicity = segment.sourceMultiplicity?.replace(/"/g, '');
                    const targetMultiplicity = segment.targetMultiplicity?.replace(/"/g, '');

                    activeSources.forEach((sourceRef: ResolvedReference) => {
                        targetRefs.forEach((targetRef: ResolvedReference) => {
                            const baseValue = edgeValue ? { ...edgeValue } : undefined;
                            let valueWithMetadata = baseValue;

                            if (sourceRef.attributePath) {
                                valueWithMetadata = { ...(valueWithMetadata ?? {}), sourceAttribute: sourceRef.attributePath };
                            }

                            if (targetRef.attributePath) {
                                valueWithMetadata = { ...(valueWithMetadata ?? {}), targetAttribute: targetRef.attributePath };
                            }

                            const record: MachineEdgeJSON = {
                                source: sourceRef.nodeName,
                                target: targetRef.nodeName,
                                annotations: edgeAnnotations,
                                arrowType,
                                sourceMultiplicity,
                                targetMultiplicity
                            };

                            if (sourceRef.attributePath) {
                                record.sourceAttribute = sourceRef.attributePath;
                            }

                            if (targetRef.attributePath) {
                                record.targetAttribute = targetRef.attributePath;
                            }

                            // Initialize attributes with inline edge attributes
                            let finalAttributes: Record<string, unknown> = {};
                            if (valueWithMetadata && Object.keys(valueWithMetadata).length > 0) {
                                finalAttributes = { ...valueWithMetadata };
                            }

                            // Serialize edge block attributes (new block syntax)
                            // Convert structured attributes to Record format and merge with inline attributes
                            if (edge.attributes && edge.attributes.length > 0) {
                                const edgeAttrs = this.serializeMachineAttributes(edge.attributes);
                                if (edgeAttrs.length > 0) {
                                    // Convert array of structured attributes to Record format
                                    const blockAttrsRecord: Record<string, unknown> = {};
                                    edgeAttrs.forEach(attr => {
                                        blockAttrsRecord[attr.name] = attr.value;
                                    });

                                    // Merge with existing inline attributes, block attributes take precedence
                                    finalAttributes = {
                                        ...finalAttributes,
                                        ...blockAttrsRecord
                                    };
                                }
                            }

                            // Set attributes as the single source of truth
                            if (Object.keys(finalAttributes).length > 0) {
                                record.attributes = finalAttributes;
                            }

                            // Keep value for backward compatibility and DSL round-trip
                            // Include ALL edge label/attribute content, not just metadata
                            // This ensures backward compatibility with code expecting value field
                            if (valueWithMetadata && Object.keys(valueWithMetadata).length > 0) {
                                record.value = valueWithMetadata;
                            }

                            if (edgeStyle && Object.keys(edgeStyle).length > 0) {
                                record.style = edgeStyle;
                            }
                            
                            // Detect semantic edge type from label/attributes
                            const semanticType = this.detectSemanticEdgeType(edgeValue, segment.label);
                            if (semanticType) {
                                record.type = semanticType;
                            }

                            // Add source position metadata for bidirectional highlighting
                            if (segment.$cstNode) {
                                const range = segment.$cstNode.range;
                                record.$sourceRange = {
                                    start: {
                                        line: range.start.line,
                                        character: range.start.character,
                                        offset: range.start.offset
                                    },
                                    end: {
                                        line: range.end.line,
                                        character: range.end.character,
                                        offset: range.end.offset
                                    }
                                };
                            }

                            segmentEdges.push(record);
                        });
                    });

                    activeSources = targetRefs;
                });

                return segmentEdges;
            });

            const childEdges = nodes.flatMap(node => traverse(node.edges ?? [], node.nodes ?? []));
            return [...currentEdges, ...childEdges];
        };

        return traverse(this.machine.edges ?? [], this.machine.nodes ?? []);
    }

    private generateAttributeEdges(aliasMap: Map<string, NodeAliasInfo>, explicitEdges: MachineEdgeJSON[]): MachineEdgeJSON[] {
        const attributeEdges: MachineEdgeJSON[] = [];
        const explicitKeys = new Set(explicitEdges.map(edge => this.buildEdgeKey(edge)));

        const primitiveTypes = new Set(['string', 'number', 'boolean', 'float', 'double', 'integer', 'int', 'decimal']);

        const visitNode = (node: Node) => {
            const nodeType = (node.type ?? '').toLowerCase();

            // Skip style and note nodes - they have special meaning and shouldn't generate attribute edges
            if (nodeType === 'style' || nodeType === 'note') {
                node.nodes?.forEach(visitNode);
                return;
            }

            const nodeAttributes = node.attributes ?? [];
            nodeAttributes.forEach(attr => {
                const attrType = attr.type ? this.serializeType(attr.type) : undefined;

                // Skip if type is explicitly a primitive type
                // BUT allow attributes with no type annotation - they might reference nodes
                if (attrType && primitiveTypes.has(attrType.toLowerCase())) {
                    return;
                }

                const references = this.extractNodeReferencesFromValue(attr.value, aliasMap);
                references.forEach(ref => {
                    if (!ref.nodeName) {
                        return;
                    }

                    const key = `${node.name}->${ref.nodeName}:${attr.name}`;
                    if (explicitKeys.has(key)) {
                        return;
                    }

                    const edgeValue: Record<string, unknown> = {
                        attribute: attr.name,
                        text: attr.name, // Add text field for backward compatibility
                        type: attrType
                    };

                    const edge: MachineEdgeJSON = {
                        source: node.name,
                        target: ref.nodeName,
                        annotations: undefined,
                        arrowType: undefined,
                        value: edgeValue,
                        attributes: { ...edgeValue }, // Copy value to attributes for renderer/runtime access
                        type: 'inferred' // Mark as inferred to skip during DSL generation
                    };

                    edge.sourceAttribute = attr.name;
                    edgeValue.sourceAttribute = attr.name;
                    edge.attributes.sourceAttribute = attr.name;

                    if (ref.attributePath) {
                        edge.targetAttribute = ref.attributePath;
                        edgeValue.targetAttribute = ref.attributePath;
                        edge.attributes.targetAttribute = ref.attributePath;
                    }

                    // Add source position metadata for bidirectional highlighting
                    if (attr.$cstNode) {
                        const range = attr.$cstNode.range;
                        edge.$sourceRange = {
                            start: {
                                line: range.start.line,
                                character: range.start.character,
                                offset: range.start.offset
                            },
                            end: {
                                line: range.end.line,
                                character: range.end.character,
                                offset: range.end.offset
                            }
                        };
                    }

                    attributeEdges.push(edge);
                });
            });

            node.nodes?.forEach(visitNode);
        };

        this.machine.nodes.forEach(visitNode);
        return attributeEdges;
    }

    private extractNodeReferencesFromValue(value: AttributeValue | undefined, aliasMap: Map<string, NodeAliasInfo>): ResolvedReference[] {
        if (!value) {
            return [];
        }

        const references: ResolvedReference[] = [];

        const traverseValue = (val: AttributeValue | undefined) => {
            if (!val) return;

            if (Array.isArray((val as any).value)) {
                (val as any).value.forEach((item: any) => traverseValue(item));
                return;
            }

            if ((val as any).attributes) {
                (val as any).attributes.forEach((attr: any) => traverseValue(attr.value));
                return;
            }

            const primitive = (val as any).value;
            if (typeof primitive === 'string') {
                const reference = this.resolveReferencePath(primitive, aliasMap);
                if (reference) {
                    references.push(reference);
                }
            }
        };

        traverseValue(value);
        return references;
    }

    private resolveEdgeReference(reference: any, aliasMap: Map<string, NodeAliasInfo>): ResolvedReference {
        if (!reference?.ref) {
            if (reference?.$cstNode?.text) {
                const refText = reference.$cstNode.text.replace(/["']/g, '');
                const resolved = this.resolveReferencePath(refText, aliasMap);
                if (resolved) {
                    return resolved;
                }
            }
            return {
                nodeName: reference?.$cstNode?.text ?? '',
                node: undefined
            };
        }

        const node = reference.ref as Node;

        // Check if the reference text contains a qualified path (e.g., "parent.spouse")
        // Even if the ref resolves to a node, we need to extract the attribute path
        if (reference.$refText && reference.$refText.includes('.')) {
            const resolved = this.resolveEdgeQualifiedPath(reference.$refText, aliasMap);
            if (resolved) {
                return resolved;
            }
        }

        return {
            node,
            nodeName: node.name
        };
    }

    /**
     * Resolve a qualified path specifically for edge references
     * For "parent.spouse", we want node=parent and attributePath="spouse"
     * We only match against NODE entries, not attribute entries in the aliasMap
     */
    private resolveEdgeQualifiedPath(refText: string, aliasMap: Map<string, NodeAliasInfo>): ResolvedReference | undefined {
        if (!refText) {
            return undefined;
        }

        const sanitized = refText.trim().replace(/;$/, '');
        if (!sanitized) {
            return undefined;
        }

        const parts = sanitized.split('.');

        // Try to find a node match (not an attribute match)
        // Start from full path and work backwards
        for (let i = parts.length; i > 0; i--) {
            const candidateNode = parts.slice(0, i).join('.');
            const info = aliasMap.get(candidateNode);

            // Check if this entry represents an actual node (not just an attribute path)
            if (info) {
                // An entry is a node if the info.node.name matches the last part of the qualified name
                // For "parent.child1", node.name should be "child1"
                // For "parent.spouse" (attribute), node.name would be "parent" (the parent node)
                const lastPart = candidateNode.split('.').pop();
                const isActualNode = info.node.name === lastPart;

                if (isActualNode) {
                    const attributePath = parts.slice(i).join('.');
                    return {
                        node: info.node,
                        nodeName: info.node.name,
                        attributePath: attributePath.length > 0 ? attributePath : undefined
                    };
                }
            }
        }

        // If no qualified match, try just the first part
        const firstPart = parts[0];
        const info = aliasMap.get(firstPart);
        if (info && parts.length > 1) {
            const attributePath = parts.slice(1).join('.');
            return {
                node: info.node,
                nodeName: info.node.name,
                attributePath: attributePath
            };
        }

        return undefined;
    }

    private buildNodeAliasMap(): Map<string, NodeAliasInfo> {
        const aliasMap = new Map<string, NodeAliasInfo>();

        const processNode = (node: Node, parentQualifiedName?: string) => {
            const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${node.name}` : node.name;
            aliasMap.set(node.name, { node, qualifiedName });
            aliasMap.set(qualifiedName, { node, qualifiedName });

            if (node.attributes) {
                node.attributes.forEach(attr => {
                    aliasMap.set(`${qualifiedName}.${attr.name}`, {
                        node,
                        qualifiedName: `${qualifiedName}.${attr.name}`
                    });
                });
            }

            node.nodes?.forEach(child => processNode(child, qualifiedName));
        };

        this.machine.nodes.forEach(node => processNode(node));
        return aliasMap;
    }

    private buildEdgeKey(edge: MachineEdgeJSON): string {
        const valueKey = edge.value?.attribute ?? edge.value?.text ?? '';
        return `${edge.source}->${edge.target}:${valueKey}`;
    }

    private serializeEdgeAnnotations(labels?: EdgeType[]): MachineAnnotationJSON[] | undefined {
        if (!labels || labels.length === 0) {
            return undefined;
        }

        const annotations: MachineAnnotationJSON[] = [];
        labels.forEach(label => {
            if (label.annotations && label.annotations.length > 0) {
                label.annotations.forEach(ann => {
                    annotations.push(serializeAnnotation(ann));
                });
            }
        });

        return annotations.length > 0 ? annotations : undefined;
    }

    private serializeEdgePayload(
        labels: EdgeType[] | undefined,
        annotations?: MachineAnnotationJSON[]
    ): { value?: Record<string, unknown>; style?: StyleAttributesJSON } {
        if (!labels || labels.length === 0) {
            return {};
        }

        const value: Record<string, unknown> = {};
        const inlineStyle: StyleAttributesJSON = {};

        labels.forEach(label => {
            label.value.forEach(attr => {
                if (!attr.name && (attr as any).text) {
                    const textValue = (attr as any).text.replace(/^["']|["']$/g, '');
                    value['text'] = textValue;
                } else if (attr.name) {
                    let attrValue: unknown = attr.value;
                    if (typeof attrValue === 'string') {
                        // Only strip quotes if the string starts AND ends with matching quotes
                        // Langium parser already strips outer quotes from STRING terminals,
                        // so this handles any edge cases where quotes remain
                        attrValue = attrValue.replace(/^(["'])(.*)\1$/, '$2');
                    }

                    if (attrValue !== undefined) {
                        value[attr.name] = attrValue;
                        this.assignStyleValue(inlineStyle, attr.name, attrValue);
                    }
                }
            });
        });

        // If no explicit text was found in attributes, check for annotation text as fallback
        if (!value['text'] && annotations && annotations.length > 0) {
            const styleAnnotation = annotations.find(ann => ann.name?.toLowerCase() === 'style');
            if (styleAnnotation && styleAnnotation.value) {
                value['text'] = styleAnnotation.value;
            }
        }

        const annotationStyle = this.extractStyleFromAnnotations(annotations);
        const combinedStyle = this.mergeStyles(
            Object.keys(inlineStyle).length > 0 ? inlineStyle : undefined,
            annotationStyle
        );

        return {
            value: Object.keys(value).length > 0 ? value : undefined,
            style: combinedStyle
        };
    }

    private resolveReferencePath(refText: string, aliasMap: Map<string, NodeAliasInfo>): ResolvedReference | undefined {
        if (!refText) {
            return undefined;
        }

        const sanitized = refText.trim().replace(/;$/, '');
        if (!sanitized) {
            return undefined;
        }

        const parts = sanitized.split('.');
        for (let i = parts.length; i > 0; i--) {
            const candidate = parts.slice(0, i).join('.');
            const info = aliasMap.get(candidate);
            if (info) {
                const attributePath = parts.slice(i).join('.');
                return {
                    node: info.node,
                    nodeName: info.node.name,
                    attributePath: attributePath.length > 0 ? attributePath : undefined
                };
            }
        }

        return undefined;
    }
    
    /**
     * Detect semantic edge type from edge label/attributes
     * Recognizes: writes, stores, reads as semantic types for context access
     */
    private detectSemanticEdgeType(edgeValue: Record<string, unknown> | undefined, labels?: EdgeType[]): string | undefined {
        // Check edge value/attributes for semantic keywords
        if (edgeValue) {
            const text = edgeValue.text as string | undefined;
            if (text) {
                const lower = text.toLowerCase().trim();
                if (lower === 'writes' || lower === 'stores') return 'writes';
                if (lower === 'reads') return 'reads';
            }
        }
        
        // Check edge labels for semantic keywords
        if (labels && labels.length > 0) {
            for (const label of labels) {
                for (const attr of label.value) {
                    if (!attr.name && (attr as any).text) {
                        const text = ((attr as any).text as string).toLowerCase().trim();
                        if (text === 'writes' || text === 'stores') return 'writes';
                        if (text === 'reads') return 'reads';
                    }
                }
            }
        }
        
        return undefined;
    }
}

function serializeAnnotation(ann: any): MachineAnnotationJSON {
    const result: MachineAnnotationJSON = {
        name: ann.name
    };

    if (ann.value) {
        result.value = ann.value.replace(/^"|"$/g, '');
    }

    if (ann.attributes && ann.attributes.params) {
        result.attributes = {};
        ann.attributes.params.forEach((param: any) => {
            if (param.value !== undefined && param.value !== null) {
                let paramValue = param.value;
                if (typeof paramValue === 'object' && paramValue.$cstNode) {
                    paramValue = paramValue.$cstNode.text;
                }
                if (typeof paramValue === 'string') {
                    paramValue = paramValue.replace(/^["']|["']$/g, '');
                }
                result.attributes![param.name] = paramValue;
            } else {
                result.attributes![param.name] = true;
            }
        });
    }

    return result;
}

export { serializeAnnotation };
