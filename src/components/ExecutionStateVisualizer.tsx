import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { MachineExecutor } from '../language/executor';
import type { VisualizationState, ExecutionState } from '../language/execution/runtime-types';
import type { MachineJSON } from '../language/json/types';

interface ExecutionStateVisualizerProps {
    executor: MachineExecutor | null;
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
    pathIds: string[];
    visitCount: number;
}

interface EdgeInfo {
    pathId: string;
    fromNode: string;
    toNode: string;
    isAutomatic: boolean;
    condition?: string;
}

interface ContextInfo {
    name: string;
    value: any;
}

interface PathDisplay {
    id: string;
    currentNode: string;
    status: string;
    stepCount: number;
    historyLength: number;
}

export const ExecutionStateVisualizer = forwardRef<ExecutionStateVisualizerRef, ExecutionStateVisualizerProps>(({
    executor,
    mobile = true
}, ref) => {
    const [vizState, setVizState] = useState<VisualizationState | null>(null);
    const [machineJSON, setMachineJSON] = useState<MachineJSON | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!executor) {
            setVizState(null);
            setMachineJSON(null);
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
            const state = executor.getVisualizationState();
            const machine = executor.getMachineDefinition();
            setVizState(state);
            setMachineJSON(machine);
        } catch (error) {
            console.error('Failed to update execution state:', error);
        }
    };

    const togglePathExpanded = (pathId: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(pathId)) {
                next.delete(pathId);
            } else {
                next.add(pathId);
            }
            return next;
        });
    };

    const toggleContextExpanded = (contextName: string) => {
        setExpandedContexts(prev => {
            const next = new Set(prev);
            if (next.has(contextName)) {
                next.delete(contextName);
            } else {
                next.add(contextName);
            }
            return next;
        });
    };

    const formatValue = (value: any): string => {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return String(value);
            }
        }
        return String(value);
    };

    const getPathStatusClass = (status: string): string => {
        switch (status) {
            case 'active': return 'status-active';
            case 'waiting': return 'status-waiting';
            case 'completed': return 'status-completed';
            case 'failed': return 'status-failed';
            default: return '';
        }
    };

    if (!executor || !vizState || !machineJSON) {
        return (
            <div className={`execution-state-visualizer ${mobile ? 'mobile' : ''}`}>
                <div className="empty-state">
                    <p>No execution in progress</p>
                    <p className="hint">Click "Execute" to start machine execution</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`execution-state-visualizer ${mobile ? 'mobile' : ''}`}>
            {/* Execution Summary */}
            <div className="execution-summary">
                <div className="summary-stat">
                    <span className="stat-label">Steps:</span>
                    <span className="stat-value">{vizState.stepCount}</span>
                </div>
                <div className="summary-stat">
                    <span className="stat-label">Paths:</span>
                    <span className="stat-value">
                        {vizState.activePathCount} / {vizState.totalPaths}
                    </span>
                </div>
                <div className="summary-stat">
                    <span className="stat-label">Completed:</span>
                    <span className="stat-value">{vizState.completedPathCount}</span>
                </div>
                {vizState.errorCount > 0 && (
                    <div className="summary-stat error">
                        <span className="stat-label">Errors:</span>
                        <span className="stat-value">{vizState.errorCount}</span>
                    </div>
                )}
                <div className="summary-stat">
                    <span className="stat-label">Time:</span>
                    <span className="stat-value">{(vizState.elapsedTime / 1000).toFixed(1)}s</span>
                </div>
            </div>

            {/* Active Paths */}
            {vizState.activePaths.length > 0 && (
                <div className="section">
                    <h3 className="section-title">
                        Active Paths ({vizState.activePaths.length})
                    </h3>
                    <div className="paths-list">
                        {vizState.activePaths.map((path) => (
                            <div key={path.id} className="path-item">
                                <div
                                    className="path-header"
                                    onClick={() => togglePathExpanded(path.id)}
                                >
                                    <span className={`path-status ${getPathStatusClass(path.status)}`}>
                                        {path.status}
                                    </span>
                                    <span className="path-node">{path.currentNode}</span>
                                    <span className="path-steps">{path.stepCount} steps</span>
                                    <span className="expand-icon">
                                        {expandedPaths.has(path.id) ? '▼' : '▶'}
                                    </span>
                                </div>
                                {expandedPaths.has(path.id) && (
                                    <div className="path-details">
                                        <div className="detail-row">
                                            <span className="detail-label">Path ID:</span>
                                            <span className="detail-value">{path.id}</span>
                                        </div>
                                        {path.history.length > 0 && (
                                            <div className="history-section">
                                                <div className="detail-label">History:</div>
                                                <div className="history-list">
                                                    {path.history.slice(-5).map((transition, idx) => (
                                                        <div key={idx} className="history-item">
                                                            {transition.from} → {transition.to}
                                                            {transition.transition && (
                                                                <span className="transition-reason">
                                                                    ({transition.transition})
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {path.history.length > 5 && (
                                                        <div className="history-more">
                                                            ...and {path.history.length - 5} more
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* All Paths Overview */}
            {vizState.allPaths.length > vizState.activePaths.length && (
                <div className="section">
                    <h3 className="section-title">
                        All Paths ({vizState.allPaths.length})
                    </h3>
                    <div className="paths-grid">
                        {vizState.allPaths.map((path) => (
                            <div key={path.id} className={`path-card ${getPathStatusClass(path.status)}`}>
                                <div className="path-card-header">
                                    <span className="path-id">{path.id}</span>
                                    <span className={`path-badge ${getPathStatusClass(path.status)}`}>
                                        {path.status}
                                    </span>
                                </div>
                                <div className="path-card-body">
                                    <div className="path-card-row">
                                        <span>Node:</span>
                                        <span className="value">{path.currentNode}</span>
                                    </div>
                                    <div className="path-card-row">
                                        <span>Steps:</span>
                                        <span className="value">{path.stepCount}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Node States */}
            <div className="section">
                <h3 className="section-title">Node States</h3>
                <div className="nodes-grid">
                    {Object.entries(vizState.nodeStates).map(([nodeName, nodeState]) => (
                        <div
                            key={nodeName}
                            className={`node-card ${nodeState.isActive ? 'active' : ''}`}
                        >
                            <div className="node-card-header">
                                <span className="node-name">{nodeName}</span>
                                {nodeState.isActive && (
                                    <span className="active-badge">ACTIVE</span>
                                )}
                            </div>
                            <div className="node-card-body">
                                <div className="node-stat">
                                    <span>Visits:</span>
                                    <span className="value">{nodeState.visitCount}</span>
                                </div>
                                {nodeState.activeInPaths.length > 0 && (
                                    <div className="node-stat">
                                        <span>Active in:</span>
                                        <span className="value">
                                            {nodeState.activeInPaths.join(', ')}
                                        </span>
                                    </div>
                                )}
                                {nodeState.contextValues && Object.keys(nodeState.contextValues).length > 0 && (
                                    <div className="context-values">
                                        {Object.entries(nodeState.contextValues).slice(0, 3).map(([key, value]) => (
                                            <div key={key} className="context-value">
                                                <span className="key">{key}:</span>
                                                <span className="val">{String(value).substring(0, 20)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Available Transitions */}
            {vizState.availableTransitions.length > 0 && (
                <div className="section">
                    <h3 className="section-title">
                        Available Transitions ({vizState.availableTransitions.length})
                    </h3>
                    <div className="transitions-list">
                        {vizState.availableTransitions.map((transition, idx) => (
                            <div key={idx} className="transition-item">
                                <div className="transition-path">
                                    <span className="path-label">{transition.pathId}:</span>
                                    <span className="from-node">{transition.fromNode}</span>
                                    <span className="arrow">→</span>
                                    <span className="to-node">{transition.toNode}</span>
                                </div>
                                {transition.condition && (
                                    <div className="transition-condition">
                                        Condition: {transition.condition}
                                    </div>
                                )}
                                <div className="transition-type">
                                    {transition.isAutomatic ? (
                                        <span className="badge automatic">automatic</span>
                                    ) : (
                                        <span className="badge manual">manual</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

ExecutionStateVisualizer.displayName = 'ExecutionStateVisualizer';
