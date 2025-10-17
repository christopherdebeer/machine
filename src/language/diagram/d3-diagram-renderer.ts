/**
 * D3.js + Dagre Diagram Renderer
 *
 * Generates interactive diagrams from MachineJSON using D3.js and Dagre-D3.
 * Replaces the Mermaid-based visualization with proper nested namespace support.
 */

import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3-es';
import { MachineJSON, RuntimeContext, RuntimeNodeState, RuntimeEdgeState } from './types.js';
import { NodeTypeChecker } from '../node-type-checker.js';

/**
 * Node colors by type
 */
const NODE_COLORS = {
    task: { fill: '#E3F2FD', stroke: '#1976D2' },
    state: { fill: '#F3E5F5', stroke: '#7B1FA2' },
    context: { fill: '#E8F5E9', stroke: '#388E3C' },
    tool: { fill: '#FFF9C4', stroke: '#F57F17' },
    init: { fill: '#FFF3E0', stroke: '#F57C00' },
    extracted: { fill: '#FFF', stroke: '#999' },
    namespace: { fill: '#F5F5F5', stroke: '#666' },
    default: { fill: '#E0E0E0', stroke: '#424242' }
};

/**
 * Runtime state colors
 */
const RUNTIME_COLORS = {
    current: { fill: '#4CAF50', stroke: '#2E7D32' },
    visited: { fill: '#2196F3', stroke: '#1565C0' },
    pending: { fill: '#FFC107', stroke: '#F57F17' }
};

/**
 * Interface for D3 diagram configuration
 */
export interface D3DiagramConfig {
    width?: number;
    height?: number;
    nodeWidth?: number;
    nodeHeight?: number;
    rankDir?: 'TB' | 'BT' | 'LR' | 'RL';
    marginX?: number;
    marginY?: number;
}

/**
 * Generate an SVG diagram using D3 and Dagre
 */
export function generateD3Diagram(
    machineJson: MachineJSON,
    config: D3DiagramConfig = {}
): string {
    const g = new dagreD3.graphlib.Graph({ compound: true })
        .setGraph({
            rankdir: config.rankDir || 'TB',
            nodesep: 50,
            ranksep: 50,
            marginx: config.marginX || 20,
            marginy: config.marginY || 20
        });

    // Build hierarchy
    const hierarchy = buildHierarchy(machineJson.nodes);

    // Add nodes and clusters
    addNodesToGraph(g, hierarchy, machineJson);

    // Add edges
    if (machineJson.edges) {
        machineJson.edges.forEach(edge => {
            g.setEdge(edge.source, edge.target, {
                label: getEdgeLabel(edge),
                curve: d3.curveBasis,
                arrowhead: getArrowheadType(edge.arrowType)
            });
        });
    }

    // Create SVG string
    return renderGraphToSVG(g, config);
}

/**
 * Generate a runtime D3 diagram with execution state
 */
export function generateRuntimeD3Diagram(
    machineJson: MachineJSON,
    context: RuntimeContext,
    config: D3DiagramConfig = {}
): string {
    const g = new dagreD3.graphlib.Graph({ compound: true })
        .setGraph({
            rankdir: config.rankDir || 'TB',
            nodesep: 50,
            ranksep: 50,
            marginx: config.marginX || 20,
            marginy: config.marginY || 20
        });

    // Build node states
    const nodeStates = buildRuntimeNodeStates(machineJson, context);
    const stateMap = new Map(nodeStates.map(ns => [ns.name, ns]));

    // Build hierarchy
    const hierarchy = buildHierarchy(machineJson.nodes);

    // Add nodes with runtime state
    addRuntimeNodesToGraph(g, hierarchy, machineJson, stateMap);

    // Add edges with runtime state
    if (machineJson.edges) {
        const edgeStates = buildRuntimeEdgeStates(machineJson, context);
        edgeStates.forEach(edge => {
            const label = getRuntimeEdgeLabel(edge);
            g.setEdge(edge.source, edge.target, {
                label,
                curve: d3.curveBasis,
                arrowhead: 'vee',
                style: edge.traversalCount > 0 ? 'stroke-width: 2px' : ''
            });
        });
    }

    return renderGraphToSVG(g, config);
}

/**
 * Build hierarchical structure from nodes
 */
interface NodeHierarchy {
    [nodeName: string]: {
        node: any;
        children: string[];
    };
}

function buildHierarchy(nodes: any[]): NodeHierarchy {
    const hierarchy: NodeHierarchy = {};

    // Initialize hierarchy
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
 * Add nodes to the dagre graph
 */
function addNodesToGraph(
    g: dagreD3.graphlib.Graph,
    hierarchy: NodeHierarchy,
    machineJson: MachineJSON
) {
    const rootNodes = getRootNodes(machineJson.nodes);

    rootNodes.forEach(node => {
        addNodeRecursive(g, hierarchy, node, machineJson.edges);
    });
}

/**
 * Recursively add nodes and create clusters for nested namespaces
 */
function addNodeRecursive(
    g: dagreD3.graphlib.Graph,
    hierarchy: NodeHierarchy,
    node: any,
    edges: any[]
) {
    const { children } = hierarchy[node.name];
    const nodeType = NodeTypeChecker.getNodeType(node, edges);
    const colors = (nodeType && NODE_COLORS[nodeType as keyof typeof NODE_COLORS]) || NODE_COLORS.default;

    if (children.length > 0) {
        // This is a parent node - create a cluster
        g.setNode(node.name, {
            label: getNodeLabel(node),
            labelType: 'html',
            clusterLabelPos: 'top',
            style: `fill: ${colors.fill}; stroke: ${colors.stroke}; stroke-width: 2px;`,
            labelStyle: 'font-weight: bold; font-size: 14px;'
        });

        // Recursively add children
        children.forEach(childName => {
            const childNode = hierarchy[childName].node;
            addNodeRecursive(g, hierarchy, childNode, edges);
            // Set parent relationship
            g.setParent(childName, node.name);
        });
    } else {
        // Leaf node
        g.setNode(node.name, {
            label: getNodeLabel(node),
            labelType: 'html',
            shape: 'rect',
            style: `fill: ${colors.fill}; stroke: ${colors.stroke}; stroke-width: 2px;`,
            labelStyle: 'font-size: 12px;'
        });
    }
}

/**
 * Add nodes with runtime state to the graph
 */
function addRuntimeNodesToGraph(
    g: dagreD3.graphlib.Graph,
    hierarchy: NodeHierarchy,
    machineJson: MachineJSON,
    stateMap: Map<string, RuntimeNodeState>
) {
    const rootNodes = getRootNodes(machineJson.nodes);

    rootNodes.forEach(node => {
        addRuntimeNodeRecursive(g, hierarchy, node, machineJson.edges, stateMap);
    });
}

/**
 * Recursively add runtime nodes
 */
function addRuntimeNodeRecursive(
    g: dagreD3.graphlib.Graph,
    hierarchy: NodeHierarchy,
    node: any,
    edges: any[],
    stateMap: Map<string, RuntimeNodeState>
) {
    const { children } = hierarchy[node.name];
    const state = stateMap.get(node.name);
    const nodeType = NodeTypeChecker.getNodeType(node, edges);
    const colors = state
        ? RUNTIME_COLORS[state.status]
        : ((nodeType && NODE_COLORS[nodeType as keyof typeof NODE_COLORS]) || NODE_COLORS.default);

    const emoji = state ? getStatusEmoji(state.status) : '';
    const label = getNodeLabel(node, state);

    if (children.length > 0) {
        // Parent node - create cluster
        g.setNode(node.name, {
            label: emoji + ' ' + label,
            labelType: 'html',
            clusterLabelPos: 'top',
            style: `fill: ${colors.fill}; stroke: ${colors.stroke}; stroke-width: ${state?.status === 'current' ? 4 : 2}px;`,
            labelStyle: 'font-weight: bold; font-size: 14px;'
        });

        // Recursively add children
        children.forEach(childName => {
            const childNode = hierarchy[childName].node;
            addRuntimeNodeRecursive(g, hierarchy, childNode, edges, stateMap);
            g.setParent(childName, node.name);
        });
    } else {
        // Leaf node
        g.setNode(node.name, {
            label: emoji + ' ' + label,
            labelType: 'html',
            shape: 'rect',
            style: `fill: ${colors.fill}; stroke: ${colors.stroke}; stroke-width: ${state?.status === 'current' ? 4 : 2}px;`,
            labelStyle: 'font-size: 12px;'
        });
    }
}

/**
 * Get node label with attributes
 */
function getNodeLabel(node: any, state?: RuntimeNodeState): string {
    const desc = node.attributes?.find((a: any) => a.name === 'desc') ||
                 node.attributes?.find((a: any) => a.name === 'prompt');

    let displayValue = node.title || desc?.value || node.name;
    if (typeof displayValue === 'string') {
        displayValue = displayValue.replace(/^["']|["']$/g, '');
    }

    let label = `<div style="padding: 8px;">`;
    label += `<div style="font-weight: bold; margin-bottom: 4px;">${displayValue}</div>`;

    // Add type annotation
    if (node.type) {
        label += `<div style="font-size: 10px; color: #666;">&lt;&lt;${node.type}&gt;&gt;</div>`;
    }

    // Add runtime status if available
    if (state) {
        label += `<div style="font-size: 10px; margin-top: 4px;">`;
        label += `Status: ${state.status.toUpperCase()}`;
        if (state.visitCount > 0) {
            label += ` | Visits: ${state.visitCount}`;
        }
        label += `</div>`;
    }

    // Add key attributes
    const attributes = node.attributes?.filter((a: any) =>
        a.name !== 'desc' && a.name !== 'prompt'
    ) || [];

    if (attributes.length > 0) {
        label += `<div style="font-size: 10px; margin-top: 4px; border-top: 1px solid #ccc; padding-top: 4px;">`;
        attributes.slice(0, 3).forEach((attr: any) => {
            let value = attr.value?.value ?? attr.value;
            if (typeof value === 'string') {
                value = value.replace(/^["']|["']$/g, '');
                if (value.length > 20) value = value.substring(0, 20) + '...';
            }
            label += `<div>+${attr.name} = ${value}</div>`;
        });
        if (attributes.length > 3) {
            label += `<div>... ${attributes.length - 3} more</div>`;
        }
        label += `</div>`;
    }

    label += `</div>`;
    return label;
}

/**
 * Get edge label from edge data
 */
function getEdgeLabel(edge: any): string {
    const edgeValue = edge.value || {};
    const keys = Object.keys(edgeValue);

    if (keys.length === 0) return '';

    const textValue = edgeValue.text;
    const otherProps = keys.filter(k => k !== 'text');

    if (otherProps.length > 0) {
        return otherProps.map(key => `${key}=${edgeValue[key]}`).join(', ');
    } else if (textValue) {
        return textValue;
    }

    return '';
}

/**
 * Get runtime edge label
 */
function getRuntimeEdgeLabel(edge: RuntimeEdgeState): string {
    let label = edge.label || '';

    if (edge.traversalCount > 0) {
        label += (label ? ' ' : '') + `[${edge.traversalCount}x]`;
    }

    return label;
}

/**
 * Get arrowhead type from arrow string
 */
function getArrowheadType(arrowType?: string): string {
    const mapping: Record<string, string> = {
        '->': 'vee',
        '-->': 'vee',
        '=>': 'vee',
        '<-->': 'undirected',
        '<|--': 'vee',
        '*-->': 'vee',
        'o-->': 'vee'
    };
    return mapping[arrowType || '->'] || 'vee';
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
 * Build runtime node states
 */
function buildRuntimeNodeStates(
    machineJson: MachineJSON,
    context: RuntimeContext
): RuntimeNodeState[] {
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
function buildRuntimeEdgeStates(
    machineJson: MachineJSON,
    context: RuntimeContext
): RuntimeEdgeState[] {
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
 * Render the dagre graph to an SVG string
 */
function renderGraphToSVG(
    g: dagreD3.graphlib.Graph,
    config: D3DiagramConfig
): string {
    // Check if we're in a browser environment
    const isBrowser = typeof document !== 'undefined';
    let doc: Document;
    let cleanup: () => void;

    if (isBrowser) {
        doc = document;
        cleanup = () => {};
    } else {
        // Use jsdom for Node.js environment
        try {
            const { JSDOM } = require('jsdom');
            const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
            const window = dom.window;
            doc = window.document;

            // Polyfill getBBox for all SVG elements in jsdom
            // jsdom doesn't support getBBox natively, so we need to mock it
            const SVGElement = window.SVGElement;
            if (SVGElement && !SVGElement.prototype.getBBox) {
                SVGElement.prototype.getBBox = function() {
                    const text = this.textContent || this.getAttribute('label') || '';
                    // Rough estimate: 7 pixels per character width, 16 pixels height
                    return {
                        x: 0,
                        y: 0,
                        width: Math.max(text.length * 7, 50),
                        height: 16
                    };
                };
            }

            cleanup = () => window.close();
        } catch (error) {
            // If jsdom is not available, return a simple SVG placeholder
            console.warn('jsdom not available, returning placeholder SVG');
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width || 1200}" height="${config.height || 800}">
                <text x="50" y="50">D3 diagram rendering requires a DOM environment (browser or jsdom)</text>
            </svg>`;
        }
    }

    // Create a temporary container
    const container = doc.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    doc.body.appendChild(container);

    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', config.width || 1200)
        .attr('height', config.height || 800);

    const inner = svg.append('g');

    // Create the renderer
    const render = new (dagreD3.render as any)();

    // Run the renderer
    render(inner as any, g);

    // Center the graph
    const graphWidth = (g.graph() as any).width || 0;
    const graphHeight = (g.graph() as any).height || 0;
    const svgWidth = config.width || 1200;
    const svgHeight = config.height || 800;

    const xCenterOffset = (svgWidth - graphWidth) / 2;
    const yCenterOffset = (svgHeight - graphHeight) / 2;

    inner.attr('transform', `translate(${xCenterOffset}, ${yCenterOffset})`);

    // Add zoom behavior
    const zoom = d3.zoom().on('zoom', (event) => {
        inner.attr('transform', event.transform);
    });
    svg.call(zoom as any);

    // Get SVG string
    const svgElement = container.querySelector('svg');
    const serializer = new (isBrowser ? XMLSerializer : (doc as any).defaultView.XMLSerializer)();
    const svgString = svgElement ? serializer.serializeToString(svgElement) : '';

    // Clean up
    doc.body.removeChild(container);
    cleanup();

    return svgString;
}
