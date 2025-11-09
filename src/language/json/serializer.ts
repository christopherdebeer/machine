import type { AttributeValue, EdgeType, Machine, Node, TypeDef } from '../generated/ast.js';
import { DependencyAnalyzer } from '../dependency-analyzer.js';
import { extractValueFromAST } from '../utils/ast-helpers.js';
import type {
    MachineJSON,
    MachineNodeJSON,
    MachineEdgeJSON,
    MachineAnnotationJSON,
    MachineAttributeJSON
} from './types.js';

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

        return {
            title: this.machine.title,
            attributes: this.serializeMachineAttributes(this.machine.attributes ?? []),
            annotations: this.machine.annotations?.map(serializeAnnotation),
            nodes: this.serializeNodes(),
            edges: this.serializeEdges(),
            inferredDependencies: inferredDeps.map(dep => ({
                source: dep.source,
                target: dep.target,
                reason: dep.reason,
                path: dep.path
            }))
        };
    }

    private serializeNodes(): MachineNodeJSON[] {
        const flattenNode = (node: Node, parentName?: string): MachineNodeJSON[] => {
            const baseNode: MachineNodeJSON = {
                name: node.name,
                type: node.type?.toLowerCase(),
                attributes: this.serializeAttributes(node)
            };

            if (parentName) {
                baseNode.parent = parentName;
            }

            if (node.annotations && node.annotations.length > 0) {
                baseNode.annotations = node.annotations.map(serializeAnnotation);
            }

            if (node.title) {
                baseNode.title = node.title.replace(/^"|"$/g, '');
            }

            const childNodes = (node.nodes ?? []).flatMap(child =>
                flattenNode(child, node.name)
            );

            return [baseNode, ...childNodes];
        };

        return this.machine.nodes.flatMap(node => flattenNode(node));
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

                    const edgeValue = this.serializeEdgeValue(segment.label);
                    const edgeAnnotations = this.serializeEdgeAnnotations(segment.label);
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

                            if (valueWithMetadata && Object.keys(valueWithMetadata).length > 0) {
                                record.value = valueWithMetadata;
                                record.attributes = valueWithMetadata;
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
            if ((node.type ?? '').toLowerCase() === 'style') {
                node.nodes?.forEach(visitNode);
                return;
            }

            const nodeAttributes = node.attributes ?? [];
            nodeAttributes.forEach(attr => {
                const attrType = attr.type ? this.serializeType(attr.type) : undefined;

                if (!attrType || primitiveTypes.has(attrType.toLowerCase())) {
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

                    const edge: MachineEdgeJSON = {
                        source: node.name,
                        target: ref.nodeName,
                        annotations: undefined,
                        arrowType: undefined,
                        value: {
                            attribute: attr.name,
                            type: attrType
                        }
                    };

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
        return {
            node,
            nodeName: node.name
        };
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

    private serializeEdgeValue(labels?: EdgeType[]): Record<string, unknown> | undefined {
        if (!labels || labels.length === 0) {
            return undefined;
        }

        const value: Record<string, unknown> = {};
        labels.forEach(label => {
            if (label.$cstNode && 'text' in label.$cstNode) {
                const labelText = label.$cstNode.text;
                if (labelText && labelText.trim()) {
                    if (!labelText.includes('-') && !labelText.includes('=') && !labelText.includes('>')) {
                        value['text'] = labelText.trim();
                    } else {
                        const match = labelText.match(/^-+([^-]+)-+>?$|^=+([^=]+)=+>?$/);
                        if (match) {
                            const extractedLabel = match[1] || match[2];
                            value['text'] = extractedLabel;
                        }
                    }
                }
            }

            label.value.forEach(attr => {
                if (!attr.name && (attr as any).text) {
                    const textValue = (attr as any).text.replace(/^["']|["']$/g, '');
                    value['text'] = textValue;
                } else if (attr.name) {
                    const attrValue = (attr.value ?? '').replace?.(/^["']|["']$/g, '') ?? attr.value;
                    value[attr.name] = attrValue;
                }
            });
        });

        return Object.keys(value).length > 0 ? value : undefined;
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
