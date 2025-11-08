/**
 * Edge Type Resolver
 * Maps arrow syntax to semantic edge types
 */

import { EdgeType } from './types.js';
import { getEdgeSearchText } from '../utils/edge-utils.js';

/**
 * EdgeTypeResolver determines semantic edge types from arrow syntax
 */
export class EdgeTypeResolver {
    /**
     * Resolve semantic edge type from arrow syntax and label
     *
     * Arrow mappings:
     * - '->'  : control (default)
     * - '-->' : data
     * - '=>'  : transform
     * - '<-->' : bidirectional (treated as data)
     */
    static resolveEdgeType(edge: { arrowType?: string; type?: string; label?: string; value?: Record<string, any>; attributes?: Record<string, any> }): EdgeType {
        const arrowType = edge.arrowType || edge.type || '';
        const searchText = getEdgeSearchText(edge as any);

        // Check arrow syntax first
        if (arrowType === '-->' || arrowType.includes('-->')) {
            return 'data';
        }

        if (arrowType === '=>' || arrowType.includes('=>')) {
            return 'transform';
        }

        if (arrowType.includes('<-->') || arrowType.includes('BIDIRECTIONAL')) {
            return 'data'; // Bidirectional edges are typically for data flow
        }

        // Check label for explicit type hints
        const lowerLabel = searchText.toLowerCase();

        if (lowerLabel.includes('depends') || lowerLabel.includes('dependency')) {
            return 'dependency';
        }

        if (lowerLabel.includes('data') || lowerLabel.includes('read') || lowerLabel.includes('write')) {
            return 'data';
        }

        if (lowerLabel.includes('transform') || lowerLabel.includes('map') || lowerLabel.includes('compute')) {
            return 'transform';
        }

        // Default to control flow
        return 'control';
    }

    /**
     * Check if edge is a control flow edge
     */
    static isControlEdge(edgeType: EdgeType): boolean {
        return edgeType === 'control';
    }

    /**
     * Check if edge is a data flow edge
     */
    static isDataEdge(edgeType: EdgeType): boolean {
        return edgeType === 'data';
    }

    /**
     * Check if edge is a dependency edge
     */
    static isDependencyEdge(edgeType: EdgeType): boolean {
        return edgeType === 'dependency';
    }

    /**
     * Check if edge is a transform edge
     */
    static isTransformEdge(edgeType: EdgeType): boolean {
        return edgeType === 'transform';
    }

    /**
     * Get edge type description
     */
    static getEdgeTypeDescription(edgeType: EdgeType): string {
        switch (edgeType) {
            case 'control':
                return 'Control flow transition';
            case 'data':
                return 'Data flow (read/write)';
            case 'dependency':
                return 'Execution order dependency';
            case 'transform':
                return 'Data transformation';
            default:
                return 'Unknown edge type';
        }
    }

    /**
     * Determine execution semantics based on edge type
     */
    static getExecutionSemantics(edgeType: EdgeType): {
        blocksExecution: boolean;
        transfersControl: boolean;
        transfersData: boolean;
    } {
        switch (edgeType) {
            case 'control':
                return {
                    blocksExecution: true,
                    transfersControl: true,
                    transfersData: false
                };

            case 'data':
                return {
                    blocksExecution: false,
                    transfersControl: false,
                    transfersData: true
                };

            case 'dependency':
                return {
                    blocksExecution: true,
                    transfersControl: false,
                    transfersData: false
                };

            case 'transform':
                return {
                    blocksExecution: true,
                    transfersControl: true,
                    transfersData: true
                };

            default:
                return {
                    blocksExecution: true,
                    transfersControl: true,
                    transfersData: false
                };
        }
    }

    /**
     * Sort edges by priority and type
     * Control edges take precedence, then transforms, then data
     */
    static sortEdgesByPriority(
        edges: Array<{ edgeType?: EdgeType; priority?: number }>
    ): Array<{ edgeType?: EdgeType; priority?: number }> {
        return edges.slice().sort((a, b) => {
            // Sort by explicit priority first
            const priorityA = a.priority ?? 0;
            const priorityB = b.priority ?? 0;

            if (priorityA !== priorityB) {
                return priorityB - priorityA; // Higher priority first
            }

            // Then by edge type
            const typeOrderA = this.getTypeOrder(a.edgeType);
            const typeOrderB = this.getTypeOrder(b.edgeType);

            return typeOrderA - typeOrderB;
        });
    }

    /**
     * Get numeric order for edge type (lower = higher precedence)
     */
    private static getTypeOrder(edgeType?: EdgeType): number {
        switch (edgeType) {
            case 'control': return 1;
            case 'transform': return 2;
            case 'dependency': return 3;
            case 'data': return 4;
            default: return 5;
        }
    }

    /**
     * Validate edge type combinations
     */
    static validateEdgeTypes(
        edges: Array<{ source: string; target: string; edgeType?: EdgeType }>
    ): string[] {
        const errors: string[] = [];

        // Group edges by source-target pair
        const edgeMap = new Map<string, EdgeType[]>();

        for (const edge of edges) {
            const key = `${edge.source}->${edge.target}`;
            const types = edgeMap.get(key) || [];
            if (edge.edgeType) {
                types.push(edge.edgeType);
            }
            edgeMap.set(key, types);
        }

        // Check for conflicting edge types between same nodes
        for (const [key, types] of edgeMap.entries()) {
            if (types.length > 1) {
                const hasControl = types.includes('control');
                const hasData = types.includes('data');

                if (hasControl && hasData) {
                    errors.push(
                        `Conflicting edge types for ${key}: control and data edges should be separate`
                    );
                }
            }
        }

        return errors;
    }
}
