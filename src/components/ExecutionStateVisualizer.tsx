import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { RailsExecutor } from '../language/rails-executor';
import type { ExecutionPath } from '../language/execution/types';
import '../styles/execution-state-visualizer.css';

interface ExecutionStateVisualizerProps {
    executor: RailsExecutor | null;
    mobile?: boolean;
}

export interface ExecutionStateVisualizerRef {
    refresh: () => Promise<void>;
}

interface NodeState {
    name: string;
    type?: string;
    attributes?: Record<string, any>;
    isActive: boolean;
    pathId?: string;
}

interface EdgeInfo {
    target: string;
    label?: string;
    condition?: string;
    type?: string;
    annotations?: string[];
    canTransition: boolean;
}

interface ContextInfo {
    name: string;
    value: any;
    canRead: boolean;
    canWrite: boolean;
    interpolated?: string;
}

export const ExecutionStateVisualizer = forwardRef<ExecutionStateVisualizerRef, ExecutionStateVisualizerProps>(({
    executor,
    mobile = true
}, ref) => {
    const [currentNodes, setCurrentNodes] = useState<NodeState[]>([]);
    const [activeStates, setActiveStates] = useState<string[]>([]);
    const [contexts, setContexts] = useState<ContextInfo[]>([]);
    const [possibleEdges, setPossibleEdges] = useState<EdgeInfo[]>([]);
    const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [executionPaths, setExecutionPaths] = useState<ExecutionPath[]>([]);

    useEffect(() => {
        if (!executor) {
            setCurrentNodes([]);
            setActiveStates([]);
            setContexts([]);
            setPossibleEdges([]);
            setExecutionPaths([]);
            return;
        }

        updateExecutionState();
    }, [executor]);

    // Expose refresh method via ref
    useImperativeHandle(ref, () => ({
        refresh: async () => {
            await updateExecutionState();
        }
    }));

    const updateExecutionState = async () => {
        if (!executor) return;

        try {
            // Get current execution context
            const context = executor.getContext();
            const machineData = executor.getMachineData();
            const managers = executor.getManagers();

            // Get all active paths (if PathManager is available and being used)
            let paths: ExecutionPath[] = [];
            if (managers?.path) {
                paths = managers.path.getActivePaths();
            }
            setExecutionPaths(paths);

            // Get current nodes from all paths or single context
            const nodes: NodeState[] = [];
            if (paths.length > 0) {
                // Multi-path execution
                paths.forEach(path => {
                    const node = machineData.nodes.find(n => n.name === path.currentNode);
                    if (node) {
                        nodes.push({
                            name: node.name,
                            type: node.type,
                            attributes: convertAttributes(node.attributes || []),
                            isActive: path.status === 'active',
                            pathId: path.id
                        });
                    }
                });
            } else {
                // Single path execution
                if (context.currentNode) {
                    const node = machineData.nodes.find(n => n.name === context.currentNode);
                    if (node) {
                        nodes.push({
                            name: node.name,
                            type: node.type,
                            attributes: convertAttributes(node.attributes || []),
                            isActive: true
                        });
                    }
                }
            }
            setCurrentNodes(nodes);

            // Get active state(s)
            const states: string[] = [];
            if (context.activeState) {
                states.push(context.activeState);
            }
            // Add states from transitions
            if (context.stateTransitions && context.stateTransitions.length > 0) {
                const lastState = context.stateTransitions[context.stateTransitions.length - 1];
                if (lastState && !states.includes(lastState.state)) {
                    states.push(lastState.state);
                }
            }
            setActiveStates(states);

            // Get possible next edges
            const edges: EdgeInfo[] = [];
            if (context.currentNode) {
                const outgoingEdges = machineData.edges.filter(e => e.source === context.currentNode);

                for (const edge of outgoingEdges) {
                    // Check if this edge can be traversed
                    const canTransition = await checkEdgeCondition(executor, edge, managers);

                    edges.push({
                        target: edge.target,
                        label: edge.label,
                        condition: extractCondition(edge.label),
                        type: edge.type,
                        annotations: extractAnnotations(edge.label),
                        canTransition
                    });
                }
            }
            setPossibleEdges(edges);

            // Get context information from execution context attributes
            const contextInfos: ContextInfo[] = [];
            const sharedContext = context.attributes;

            if (sharedContext) {
                for (const [name, value] of sharedContext.entries()) {
                    const permissions = await getContextPermissions(executor, name, managers);
                    const interpolated = await interpolateValue(executor, value);

                    contextInfos.push({
                        name,
                        value,
                        canRead: permissions.canRead,
                        canWrite: permissions.canWrite,
                        interpolated
                    });
                }
            }
            setContexts(contextInfos);

        } catch (error) {
            console.error('Error updating execution state:', error);
        }
    };

    const convertAttributes = (attrs: Array<{ name: string; value: string; type?: string }>): Record<string, any> => {
        const result: Record<string, any> = {};
        attrs.forEach(attr => {
            try {
                // Try to parse as JSON if it looks like an object/array
                if (attr.value.startsWith('{') || attr.value.startsWith('[')) {
                    result[attr.name] = JSON.parse(attr.value);
                } else {
                    result[attr.name] = attr.value;
                }
            } catch {
                result[attr.name] = attr.value;
            }
        });
        return result;
    };

    const checkEdgeCondition = async (exec: RailsExecutor, edge: any, managers: any): Promise<boolean> => {
        // Check if this edge has @auto annotation (automatic transition)
        if (edge.label && edge.label.includes('@auto')) return true;

        // If TransitionManager is available, use it to evaluate
        if (managers?.transition) {
            try {
                // TransitionManager can evaluate if a transition is valid
                // For now, we'll use a simplified check
                const condition = extractCondition(edge.label);
                if (!condition) return true; // No condition means it's available

                // Would need to evaluate condition here using evaluator
                // For now, assume all transitions are possible
                return true;
            } catch (error) {
                console.error('Error checking edge condition:', error);
                return false;
            }
        }

        // Default: assume all edges are possible
        return true;
    };

    const extractCondition = (label?: string): string | undefined => {
        if (!label) return undefined;
        // Extract condition from label like "when: value > 10" or "if value > 10"
        const match = label.match(/(?:when|if|condition):\s*(.+?)(?:\s*@|$)/i);
        return match ? match[1].trim() : undefined;
    };

    const extractAnnotations = (label?: string): string[] => {
        if (!label) return [];
        const annotations = label.match(/@\w+/g);
        return annotations || [];
    };

    const getContextPermissions = async (exec: RailsExecutor, contextName: string, managers: any) => {
        // If ContextManager is available, get permissions
        if (managers?.context) {
            try {
                const context = exec.getContext();
                const permissions = managers.context.getPermissions(context.currentNode, contextName);
                return {
                    canRead: permissions.canRead,
                    canWrite: permissions.canWrite
                };
            } catch (error) {
                console.error('Error getting context permissions:', error);
            }
        }

        // Default to read-only if we can't determine
        return {
            canRead: true,
            canWrite: false
        };
    };

    const interpolateValue = async (exec: RailsExecutor, value: any): Promise<string> => {
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    };

    const toggleContext = (name: string) => {
        const newExpanded = new Set(expandedContexts);
        if (newExpanded.has(name)) {
            newExpanded.delete(name);
        } else {
            newExpanded.add(name);
        }
        setExpandedContexts(newExpanded);
    };

    const togglePath = (pathId: string) => {
        const newExpanded = new Set(expandedPaths);
        if (newExpanded.has(pathId)) {
            newExpanded.delete(pathId);
        } else {
            newExpanded.add(pathId);
        }
        setExpandedPaths(newExpanded);
    };

    const formatValue = (value: any): string => {
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    };

    const getPathColor = (pathId?: string): string => {
        if (!pathId) return '#4f46e5'; // default indigo
        const colors = ['#4f46e5', '#059669', '#dc2626', '#d97706', '#7c3aed', '#db2777'];
        const hash = pathId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    if (!executor) {
        return (
            <div className={`execution-state-visualizer ${mobile ? 'mobile' : ''}`}>
                <div className="empty-state">
                    <div className="empty-icon">▶</div>
                    <p>Start execution to see state visualization</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`execution-state-visualizer ${mobile ? 'mobile' : ''}`}>
            {/* Header with status */}
            <div className="visualizer-header">
                <h3>Execution State</h3>
                {activeStates.length > 0 && (
                    <div className="active-states">
                        {activeStates.map(state => (
                            <span key={state} className="state-badge">
                                {state}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Current Nodes */}
            {currentNodes.length > 0 && (
                <div className="section current-nodes">
                    <h4 className="section-title">
                        Current Node{currentNodes.length > 1 ? 's' : ''}
                        <span className="section-count">{currentNodes.length}</span>
                    </h4>
                    {currentNodes.map((node, idx) => (
                        <div
                            key={`${node.name}-${node.pathId || idx}`}
                            className={`node-card ${node.isActive ? 'active' : 'inactive'}`}
                            style={{ borderLeftColor: getPathColor(node.pathId) }}
                        >
                            <div className="node-header">
                                <span className="node-name">{node.name}</span>
                                {node.type && (
                                    <span className="node-type">{node.type}</span>
                                )}
                            </div>
                            {node.pathId && (
                                <div className="node-path">
                                    <span
                                        className="path-badge"
                                        style={{ backgroundColor: getPathColor(node.pathId) }}
                                    >
                                        Path: {node.pathId.substring(0, 8)}
                                    </span>
                                </div>
                            )}
                            {node.attributes && Object.keys(node.attributes).length > 0 && (
                                <div className="node-attributes">
                                    {Object.entries(node.attributes).map(([key, value]) => (
                                        <div key={key} className="attribute">
                                            <span className="attr-key">{key}:</span>
                                            <span className="attr-value">{formatValue(value)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Possible Next Edges */}
            {possibleEdges.length > 0 && (
                <div className="section next-edges">
                    <h4 className="section-title">
                        Possible Transitions
                        <span className="section-count">{possibleEdges.length}</span>
                    </h4>
                    {possibleEdges.map((edge, idx) => (
                        <div
                            key={`${edge.target}-${idx}`}
                            className={`edge-card ${edge.canTransition ? 'available' : 'blocked'}`}
                        >
                            <div className="edge-header">
                                <span className="edge-arrow">→</span>
                                <span className="edge-target">{edge.target}</span>
                                {edge.canTransition ? (
                                    <span className="edge-status available">✓</span>
                                ) : (
                                    <span className="edge-status blocked">✗</span>
                                )}
                            </div>
                            {edge.label && (
                                <div className="edge-label">{edge.label}</div>
                            )}
                            {edge.condition && (
                                <div className="edge-condition">
                                    <code>{edge.condition}</code>
                                </div>
                            )}
                            {edge.annotations && edge.annotations.length > 0 && (
                                <div className="edge-annotations">
                                    {edge.annotations.map(ann => (
                                        <span key={ann} className="annotation-badge">
                                            {ann}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Contexts */}
            {contexts.length > 0 && (
                <div className="section contexts">
                    <h4 className="section-title">
                        Contexts
                        <span className="section-count">{contexts.length}</span>
                    </h4>
                    {contexts.map(ctx => (
                        <div key={ctx.name} className="context-card">
                            <div
                                className="context-header"
                                onClick={() => toggleContext(ctx.name)}
                            >
                                <span className="context-name">{ctx.name}</span>
                                <div className="context-permissions">
                                    {ctx.canRead && (
                                        <span className="permission read" title="Can Read">R</span>
                                    )}
                                    {ctx.canWrite && (
                                        <span className="permission write" title="Can Write">W</span>
                                    )}
                                    <span className="expand-icon">
                                        {expandedContexts.has(ctx.name) ? '▼' : '▶'}
                                    </span>
                                </div>
                            </div>
                            {expandedContexts.has(ctx.name) && (
                                <div className="context-value">
                                    <pre>{ctx.interpolated || formatValue(ctx.value)}</pre>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Execution Paths Summary (when multi-path) */}
            {executionPaths.length > 1 && (
                <div className="section execution-paths">
                    <h4 className="section-title">
                        Execution Paths
                        <span className="section-count">{executionPaths.length}</span>
                    </h4>
                    {executionPaths.map(path => (
                        <div
                            key={path.id}
                            className={`path-card ${path.status}`}
                            style={{ borderLeftColor: getPathColor(path.id) }}
                        >
                            <div
                                className="path-header"
                                onClick={() => togglePath(path.id)}
                            >
                                <span
                                    className="path-id"
                                    style={{ color: getPathColor(path.id) }}
                                >
                                    {path.id.substring(0, 8)}
                                </span>
                                <span className={`path-status ${path.status}`}>
                                    {path.status}
                                </span>
                                <span className="expand-icon">
                                    {expandedPaths.has(path.id) ? '▼' : '▶'}
                                </span>
                            </div>
                            {expandedPaths.has(path.id) && (
                                <div className="path-details">
                                    <div className="path-detail">
                                        <span className="detail-label">Node:</span>
                                        <span className="detail-value">{path.currentNode}</span>
                                    </div>
                                    <div className="path-detail">
                                        <span className="detail-label">Steps:</span>
                                        <span className="detail-value">{path.stepCount}</span>
                                    </div>
                                    {path.history && path.history.length > 0 && (
                                        <div className="path-history">
                                            <span className="detail-label">Recent History:</span>
                                            <div className="history-list">
                                                {path.history.slice(-3).map((h, idx) => (
                                                    <div key={idx} className="history-item">
                                                        {h.from} → {h.to}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

ExecutionStateVisualizer.displayName = 'ExecutionStateVisualizer';

export default ExecutionStateVisualizer;
