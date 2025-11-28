import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import type { MachineExecutor } from '../language/executor';
import type { VisualizationState } from '../language/execution/runtime-types';
import type { MachineJSON } from '../language/json/types';

interface ExecutionStateVisualizerProps {
    executor: MachineExecutor | null;
    mobile?: boolean;
}

export interface ExecutionStateVisualizerRef {
    refresh: () => Promise<void>;
}

// Styled Components
const pulse = keyframes`
    0%, 100% {
        box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2), 0 2px 4px rgba(79, 70, 229, 0.1);
    }
    50% {
        box-shadow: 0 6px 12px rgba(79, 70, 229, 0.3), 0 4px 8px rgba(79, 70, 229, 0.15);
    }
`;

const Container = styled.div<{ $mobile?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: ${props => props.$mobile ? '0.75rem' : '1rem'};
    padding: ${props => props.$mobile ? '0.75rem' : '0.5rem'};
    background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
    border-radius: 0.5rem;
    max-height: 100%;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: #64748b;
    text-align: center;
`;

const EmptyIcon = styled.div`
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.3;
`;

const EmptyText = styled.p`
    margin: 0;
    font-size: 0.875rem;
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #e2e8f0;
`;

const Title = styled.h3`
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1e293b;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const SectionTitle = styled.h4`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
`;

const SectionCount = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.375rem;
    background: #e2e8f0;
    color: #475569;
    border-radius: 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
`;

const SummaryGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.5rem;
`;

const SummaryStat = styled.div<{ $error?: boolean }>`
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    background: white;
    border-radius: 0.375rem;
    border-left: 3px solid ${props => props.$error ? '#ef4444' : '#6366f1'};
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
`;

const StatLabel = styled.span`
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 500;
    margin-bottom: 0.25rem;
`;

const StatValue = styled.span`
    font-size: 1.25rem;
    font-weight: 600;
    color: #1e293b;
`;

const PathsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const PathItem = styled.div<{ $borderColor?: string }>`
    display: flex;
    flex-direction: column;
    background: white;
    border-left: 4px solid ${props => props.$borderColor || '#6366f1'};
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
    overflow: hidden;
`;

const PathHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;

    &:hover {
        background-color: #f8fafc;
    }
`;

const PathStatus = styled.span<{ $status: string }>`
    padding: 0.25rem 0.625rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: capitalize;
    background: ${props => {
        switch (props.$status) {
            case 'active': return 'linear-gradient(135deg, #10b981, #059669)';
            case 'waiting': return 'linear-gradient(135deg, #f59e0b, #d97706)';
            case 'completed': return 'linear-gradient(135deg, #6366f1, #4f46e5)';
            case 'failed': return 'linear-gradient(135deg, #ef4444, #dc2626)';
            default: return '#94a3b8';
        }
    }};
    color: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
`;

const PathNode = styled.span`
    font-weight: 600;
    color: #1e293b;
    flex: 1;
    margin: 0 0.5rem;
`;

const PathSteps = styled.span`
    font-size: 0.875rem;
    color: #64748b;
    margin-right: 0.5rem;
`;

const ExpandIcon = styled.span`
    color: #94a3b8;
    font-size: 0.875rem;
`;

const PathDetails = styled.div`
    padding: 0.75rem 1rem;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
`;

const DetailRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;

    &:last-child {
        margin-bottom: 0;
    }
`;

const DetailLabel = styled.span`
    color: #64748b;
    font-weight: 500;
    min-width: 4rem;
`;

const DetailValue = styled.span`
    color: #1e293b;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.813rem;
`;

const HistorySection = styled.div`
    margin-top: 0.5rem;
`;

const HistoryList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.375rem;
`;

const HistoryItem = styled.div`
    padding: 0.375rem 0.5rem;
    background: white;
    border-radius: 0.25rem;
    font-size: 0.813rem;
    font-family: 'Monaco', 'Menlo', monospace;
    color: #475569;
`;

const TransitionReason = styled.span`
    color: #94a3b8;
    font-size: 0.75rem;
    margin-left: 0.5rem;
`;

const HistoryMore = styled.div`
    color: #94a3b8;
    font-size: 0.75rem;
    font-style: italic;
    padding: 0.25rem 0.5rem;
`;

const PathsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
`;

const PathCard = styled.div<{ $status: string; $borderColor?: string }>`
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    background: white;
    border-left: 3px solid ${props => props.$borderColor || '#6366f1'};
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    ${props => props.$status === 'active' && css`
        animation: ${pulse} 2s ease-in-out infinite;
    `}
`;

const PathCardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
`;

const PathId = styled.span`
    font-size: 0.75rem;
    font-family: 'Monaco', 'Menlo', monospace;
    color: #64748b;
    font-weight: 500;
`;

const PathBadge = styled.span<{ $status: string }>`
    padding: 0.125rem 0.5rem;
    border-radius: 0.75rem;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    background: ${props => {
        switch (props.$status) {
            case 'active': return '#10b981';
            case 'waiting': return '#f59e0b';
            case 'completed': return '#6366f1';
            case 'failed': return '#ef4444';
            default: return '#94a3b8';
        }
    }};
    color: white;
`;

const PathCardBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
`;

const PathCardRow = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 0.813rem;
    color: #64748b;

    .value {
        color: #1e293b;
        font-weight: 500;
    }
`;

const NodesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
`;

const NodeCard = styled.div<{ $active?: boolean }>`
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    background: white;
    border-left: 3px solid ${props => props.$active ? '#10b981' : '#cbd5e1'};
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    ${props => props.$active && css`
        box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);
        animation: ${pulse} 2s ease-in-out infinite;
    `}
`;

const NodeCardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
`;

const NodeName = styled.span`
    font-weight: 600;
    color: #1e293b;
    font-size: 0.938rem;
`;

const ActiveBadge = styled.span`
    padding: 0.125rem 0.5rem;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    border-radius: 0.75rem;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    box-shadow: 0 1px 2px rgba(16, 185, 129, 0.3);
`;

const NodeCardBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
`;

const NodeStat = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 0.813rem;
    color: #64748b;

    .value {
        color: #1e293b;
        font-weight: 500;
    }
`;

const ContextValues = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.375rem;
    padding-top: 0.375rem;
    border-top: 1px solid #e2e8f0;
`;

const ContextValue = styled.div`
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;

    .key {
        color: #64748b;
        font-weight: 500;
    }

    .val {
        color: #1e293b;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 0.688rem;
    }
`;

const TransitionsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const TransitionItem = styled.div`
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    background: white;
    border-radius: 0.5rem;
    border-left: 3px solid #6366f1;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const TransitionPath = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
`;

const PathLabel = styled.span`
    color: #64748b;
    font-weight: 500;
    font-size: 0.75rem;
`;

const FromNode = styled.span`
    color: #1e293b;
    font-weight: 600;
`;

const Arrow = styled.span`
    color: #94a3b8;
`;

const ToNode = styled.span`
    color: #1e293b;
    font-weight: 600;
`;

const TransitionCondition = styled.div`
    padding: 0.375rem 0.5rem;
    background: #f8fafc;
    border-radius: 0.25rem;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.75rem;
    color: #475569;
    margin-bottom: 0.375rem;
`;

const TransitionType = styled.div`
    display: flex;
    align-items: center;
    gap: 0.375rem;
`;

const Badge = styled.span<{ $automatic?: boolean }>`
    padding: 0.125rem 0.5rem;
    border-radius: 0.75rem;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    background: ${props => props.$automatic ? '#10b981' : '#6366f1'};
    color: white;
`;

export const ExecutionStateVisualizer = forwardRef<ExecutionStateVisualizerRef, ExecutionStateVisualizerProps>(({
    executor,
    mobile = true
}, ref) => {
    const [vizState, setVizState] = useState<VisualizationState | null>(null);
    const [machineJSON, setMachineJSON] = useState<MachineJSON | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!executor) {
            setVizState(null);
            setMachineJSON(null);
            return;
        }

        // Initial update
        updateExecutionState();
        
        // Subscribe to state changes for reactive updates
        if (typeof executor.setOnStateChangeCallback === 'function') {
            executor.setOnStateChangeCallback(() => {
                updateExecutionState();
            });
            
            return () => {
                // Clean up callback on unmount
                if (typeof executor.setOnStateChangeCallback === 'function') {
                    executor.setOnStateChangeCallback(undefined);
                }
            };
        }
        
        return () => {};
    }, [executor]);

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

    const getPathStatusClass = (status: string): string => {
        return status; // Used for badge coloring
    };

    const getPathColor = (pathId: string): string => {
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
        const hash = pathId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    if (!executor || !vizState || !machineJSON) {
        return (
            <Container $mobile={mobile}>
                <EmptyState>
                    <EmptyIcon>▶</EmptyIcon>
                    <EmptyText>Click "Execute" to start machine execution</EmptyText>
                </EmptyState>
            </Container>
        );
    }

    return (
        <Container $mobile={mobile}>
            {/* Execution Summary */}
            <Section>
                <SummaryGrid>
                    <SummaryStat>
                        <StatLabel>Steps:</StatLabel>
                        <StatValue>{vizState.stepCount}</StatValue>
                    </SummaryStat>
                    <SummaryStat>
                        <StatLabel>Paths:</StatLabel>
                        <StatValue>
                            {vizState.activePathCount} / {vizState.totalPaths}
                        </StatValue>
                    </SummaryStat>
                    <SummaryStat>
                        <StatLabel>Completed:</StatLabel>
                        <StatValue>{vizState.completedPathCount}</StatValue>
                    </SummaryStat>
                    {vizState.errorCount > 0 && (
                        <SummaryStat $error>
                            <StatLabel>Errors:</StatLabel>
                            <StatValue>{vizState.errorCount}</StatValue>
                        </SummaryStat>
                    )}
                    <SummaryStat>
                        <StatLabel>Time:</StatLabel>
                        <StatValue>{(vizState.elapsedTime / 1000).toFixed(1)}s</StatValue>
                    </SummaryStat>
                </SummaryGrid>
            </Section>

            {/* Active Paths */}
            {vizState.activePaths.length > 0 && (
                <Section>
                    <SectionTitle>
                        Active Paths <SectionCount>{vizState.activePaths.length}</SectionCount>
                    </SectionTitle>
                    <PathsList>
                        {vizState.activePaths.map((path) => (
                            <PathItem key={path.id} $borderColor={getPathColor(path.id)}>
                                <PathHeader onClick={() => togglePathExpanded(path.id)}>
                                    <PathStatus $status={path.status}>
                                        {path.status}
                                    </PathStatus>
                                    <PathNode>{path.currentNode}</PathNode>
                                    <PathSteps>{path.stepCount} steps</PathSteps>
                                    <ExpandIcon>
                                        {expandedPaths.has(path.id) ? '▼' : '▶'}
                                    </ExpandIcon>
                                </PathHeader>
                                {expandedPaths.has(path.id) && (
                                    <PathDetails>
                                        <DetailRow>
                                            <DetailLabel>Path ID:</DetailLabel>
                                            <DetailValue>{path.id}</DetailValue>
                                        </DetailRow>
                                        {path.history.length > 0 && (
                                            <HistorySection>
                                                <DetailLabel>History:</DetailLabel>
                                                <HistoryList>
                                                    {path.history.slice(-5).map((transition, idx) => (
                                                        <HistoryItem key={idx}>
                                                            {transition.from} → {transition.to}
                                                            {transition.transition && (
                                                                <TransitionReason>
                                                                    ({transition.transition})
                                                                </TransitionReason>
                                                            )}
                                                        </HistoryItem>
                                                    ))}
                                                    {path.history.length > 5 && (
                                                        <HistoryMore>
                                                            ...and {path.history.length - 5} more
                                                        </HistoryMore>
                                                    )}
                                                </HistoryList>
                                            </HistorySection>
                                        )}
                                    </PathDetails>
                                )}
                            </PathItem>
                        ))}
                    </PathsList>
                </Section>
            )}

            {/* All Paths Overview */}
            {vizState.allPaths.length > vizState.activePaths.length && (
                <Section>
                    <SectionTitle>
                        All Paths <SectionCount>{vizState.allPaths.length}</SectionCount>
                    </SectionTitle>
                    <PathsGrid>
                        {vizState.allPaths.map((path) => (
                            <PathCard key={path.id} $status={path.status} $borderColor={getPathColor(path.id)}>
                                <PathCardHeader>
                                    <PathId>{path.id}</PathId>
                                    <PathBadge $status={path.status}>
                                        {path.status}
                                    </PathBadge>
                                </PathCardHeader>
                                <PathCardBody>
                                    <PathCardRow>
                                        <span>Node:</span>
                                        <span className="value">{path.currentNode}</span>
                                    </PathCardRow>
                                    <PathCardRow>
                                        <span>Steps:</span>
                                        <span className="value">{path.stepCount}</span>
                                    </PathCardRow>
                                </PathCardBody>
                            </PathCard>
                        ))}
                    </PathsGrid>
                </Section>
            )}

            {/* Node States */}
            <Section>
                <SectionTitle>Node States</SectionTitle>
                <NodesGrid>
                    {Object.entries(vizState.nodeStates).map(([nodeName, nodeState]) => (
                        <NodeCard key={nodeName} $active={nodeState.isActive}>
                            <NodeCardHeader>
                                <NodeName>{nodeName}</NodeName>
                                {nodeState.isActive && (
                                    <ActiveBadge>ACTIVE</ActiveBadge>
                                )}
                            </NodeCardHeader>
                            <NodeCardBody>
                                <NodeStat>
                                    <span>Visits:</span>
                                    <span className="value">{nodeState.visitCount}</span>
                                </NodeStat>
                                {nodeState.activeInPaths.length > 0 && (
                                    <NodeStat>
                                        <span>Active in:</span>
                                        <span className="value">
                                            {nodeState.activeInPaths.join(', ')}
                                        </span>
                                    </NodeStat>
                                )}
                                {nodeState.contextValues && Object.keys(nodeState.contextValues).length > 0 && (
                                    <ContextValues>
                                        {Object.entries(nodeState.contextValues).slice(0, 3).map(([key, value]) => (
                                            <ContextValue key={key}>
                                                <span className="key">{key}:</span>
                                                <span className="val">{String(value).substring(0, 20)}</span>
                                            </ContextValue>
                                        ))}
                                    </ContextValues>
                                )}
                            </NodeCardBody>
                        </NodeCard>
                    ))}
                </NodesGrid>
            </Section>

            {/* Available Transitions */}
            {vizState.availableTransitions.length > 0 && (
                <Section>
                    <SectionTitle>
                        Available Transitions <SectionCount>{vizState.availableTransitions.length}</SectionCount>
                    </SectionTitle>
                    <TransitionsList>
                        {vizState.availableTransitions.map((transition, idx) => (
                            <TransitionItem key={idx}>
                                <TransitionPath>
                                    <PathLabel>{transition.pathId}:</PathLabel>
                                    <FromNode>{transition.fromNode}</FromNode>
                                    <Arrow>→</Arrow>
                                    <ToNode>{transition.toNode}</ToNode>
                                </TransitionPath>
                                {transition.condition && (
                                    <TransitionCondition>
                                        Condition: {transition.condition}
                                    </TransitionCondition>
                                )}
                                <TransitionType>
                                    {transition.isAutomatic ? (
                                        <Badge $automatic>automatic</Badge>
                                    ) : (
                                        <Badge>manual</Badge>
                                    )}
                                </TransitionType>
                            </TransitionItem>
                        ))}
                    </TransitionsList>
                </Section>
            )}
        </Container>
    );
});

ExecutionStateVisualizer.displayName = 'ExecutionStateVisualizer';
