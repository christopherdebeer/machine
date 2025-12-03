import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import type { MachineExecutor } from '../language/executor.js'
import type { VisualizationState } from '../language/execution/runtime-types.js'
import type { MachineJSON } from '../language/json/types.js'
import type { RuntimeSnapshot } from '../language/runtime-visualizer.js'

interface ExecutionStateVisualizerProps {
    executor: MachineExecutor | null;
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

const Container = styled.div`
    /* Default (Desktop > 1024px) values */
    --container-padding: 0.5rem;
    --section-gap: 1rem;
    --card-padding: 0.75em;
    --grid-min-width-paths: 200px;
    --grid-min-width-nodes: 220px;
    --grid-min-width-tools: 200px;
    --summary-grid-columns: repeat(auto-fit, minmax(120px, 1fr));
    --turn-grid-columns: repeat(4, 1fr);
    --font-scale: 1;
    
    /* Tablet (768px - 1024px) */
    @media (max-width: 1024px) {
        --container-padding: 0.625rem;
        --grid-min-width-paths: 200px;
        --grid-min-width-nodes: 220px;
    }
    
    /* Phone/Small Tablet (480px - 768px) */
    @media (max-width: 768px) {
        --container-padding: 0.625rem;
        --section-gap: 0.75rem;
        --card-padding: 0.625em;
        --grid-min-width-paths: 180px;
        --grid-min-width-nodes: 200px;
        --grid-min-width-tools: 180px;
        --summary-grid-columns: repeat(3, 1fr);
        --turn-grid-columns: repeat(2, 1fr);
        --font-scale: 0.95;
    }
    
    /* Small Phone (< 480px) */
    @media (max-width: 480px) {
        --container-padding: 0.5rem;
        --section-gap: 0.5rem;
        --card-padding: 0.5em;
        --grid-min-width-paths: 100%;
        --grid-min-width-nodes: 100%;
        --grid-min-width-tools: 100%;
        --summary-grid-columns: repeat(2, 1fr);
        --turn-grid-columns: repeat(2, 1fr);
        --font-scale: 0.9;
    }
    
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
    padding: var(--container-padding);
    background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
    max-height: 100%;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: calc(1rem * var(--font-scale));
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1em;
    color: #64748b;
    text-align: center;
`;

const EmptyIcon = styled.div`
    font-size: 3em;
    margin-bottom: 1em;
    opacity: 0.3;
`;

const EmptyText = styled.p`
    margin: 0;
    font-size: 0.875em;
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    padding-bottom: 0.5em;
    border-bottom: 2px solid #e2e8f0;
`;

const Title = styled.h3`
    margin: 0;
    font-size: 1.125em;
    font-weight: 600;
    color: #1e293b;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5em;
`;

const SectionTitle = styled.h4<{ $clickable?: boolean }>`
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin: 0;
    padding: 0.5rem 0;
    font-size: 0.875em;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: ${props => props.$clickable ? 'pointer' : 'default'};
    user-select: ${props => props.$clickable ? 'none' : 'auto'};
    
    &:hover {
        ${props => props.$clickable && 'opacity: 0.8;'}
    }
`;

const SectionCount = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5em;
    height: 1.5em;
    padding: 0 0.375em;
    background: #e2e8f0;
    color: #475569;
    border-radius: 0.75em;
    font-size: 0.75em;
    font-weight: 600;
`;

const CollapseIcon = styled.span<{ $collapsed: boolean }>`
    transition: transform 0.2s ease;
    transform: ${props => props.$collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};
    color: #94a3b8;
    font-size: 0.75em;
    margin-left: auto;
`;

const CollapsibleContent = styled.div<{ $collapsed: boolean }>`
    display: ${props => props.$collapsed ? 'none' : 'block'};
`;

const SummaryGrid = styled.div`
    display: grid;
    grid-template-columns: var(--summary-grid-columns);
    gap: 0.5em;
`;

const SummaryStat = styled.div<{ $error?: boolean }>`
    display: flex;
    flex-direction: column;
    padding: 0.75em;
    background: white;
    border-radius: 0.375em;
    border-left: 3px solid ${props => props.$error ? '#ef4444' : '#6366f1'};
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
`;

const StatLabel = styled.span`
    font-size: 0.75em;
    color: #64748b;
    font-weight: 500;
    margin-bottom: 0.25em;
`;

const StatValue = styled.span`
    font-size: 1.25em;
    font-weight: 600;
    color: #1e293b;
`;

const PathsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5em;
`;

const PathItem = styled.div<{ $borderColor?: string }>`
    display: flex;
    flex-direction: column;
    background: white;
    border-left: 4px solid ${props => props.$borderColor || '#6366f1'};
    border-radius: 0.5em;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
    overflow: hidden;
`;

const PathHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1em;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;

    &:hover {
        background-color: #f8fafc;
    }
`;

const PathStatus = styled.span<{ $status: string }>`
    padding: 0.25rem 0.625em;
    border-radius: 1em;
    font-size: 0.75em;
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
    margin: 0 0.5em;
`;

const PathSteps = styled.span`
    font-size: 0.875em;
    color: #64748b;
    margin-right: 0.5em;
`;

const ExpandIcon = styled.span`
    color: #94a3b8;
    font-size: 0.875em;
`;

const PathDetails = styled.div`
    padding: 0.75rem 1em;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
`;

const DetailRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.5em;
    font-size: 0.875em;

    &:last-child {
        margin-bottom: 0;
    }
`;

const DetailLabel = styled.span`
    color: #64748b;
    font-weight: 500;
    min-width: 4em;
`;

const DetailValue = styled.span`
    color: #1e293b;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.813em;
`;

const HistorySection = styled.div`
    margin-top: 0.5em;
`;

const HistoryList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    margin-top: 0.375em;
`;

const HistoryItem = styled.div`
    padding: 0.375rem 0.5em;
    background: white;
    border-radius: 0.25em;
    font-size: 0.813em;
    font-family: 'Monaco', 'Menlo', monospace;
    color: #475569;
`;

const TransitionReason = styled.span`
    color: #94a3b8;
    font-size: 0.75em;
    margin-left: 0.5em;
`;

const HistoryMore = styled.div`
    color: #94a3b8;
    font-size: 0.75em;
    font-style: italic;
    padding: 0.25rem 0.5em;
`;

const PathsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--grid-min-width-paths), 1fr));
    gap: 0.75em;
`;

const PathCard = styled.div<{ $status: string; $borderColor?: string }>`
    display: flex;
    flex-direction: column;
    padding: var(--card-padding);
    background: white;
    border-left: 3px solid ${props => props.$borderColor || '#6366f1'};
    border-radius: 0.5em;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    ${props => props.$status === 'active' && css`
        animation: ${pulse} 2s ease-in-out infinite;
    `}
`;

const PathCardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5em;
`;

const PathId = styled.span`
    font-size: 0.75em;
    font-family: 'Monaco', 'Menlo', monospace;
    color: #64748b;
    font-weight: 500;
`;

const PathBadge = styled.span<{ $status: string }>`
    padding: 0.125rem 0.5em;
    border-radius: 0.75em;
    font-size: 0.625em;
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
    gap: 0.375em;
`;

const PathCardRow = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 0.813em;
    color: #64748b;

    .value {
        color: #1e293b;
        font-weight: 500;
    }
`;

const NodesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--grid-min-width-nodes), 1fr));
    gap: 0.75em;
`;

const NodeCard = styled.div<{ $active?: boolean }>`
    display: flex;
    flex-direction: column;
    padding: var(--card-padding);
    background: white;
    border-left: 3px solid ${props => props.$active ? '#10b981' : '#cbd5e1'};
    border-radius: 0.5em;
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
    margin-bottom: 0.5em;
`;

const NodeName = styled.span`
    font-weight: 600;
    color: #1e293b;
    font-size: 0.938em;
`;

const ActiveBadge = styled.span`
    padding: 0.125rem 0.5em;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    border-radius: 0.75em;
    font-size: 0.625em;
    font-weight: 600;
    text-transform: uppercase;
    box-shadow: 0 1px 2px rgba(16, 185, 129, 0.3);
`;

const NodeCardBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.375em;
`;

const NodeStat = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 0.813em;
    color: #64748b;

    .value {
        color: #1e293b;
        font-weight: 500;
    }
`;

const ContextValues = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    margin-top: 0.375em;
    padding-top: 0.375em;
    border-top: 1px solid #e2e8f0;
`;

const ContextValue = styled.div`
    display: flex;
    align-items: center;
    gap: 0.375em;
    font-size: 0.75em;

    .key {
        color: #64748b;
        font-weight: 500;
    }

    .val {
        color: #1e293b;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 0.688em;
    }
`;

const TransitionsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5em;
`;

const TransitionItem = styled.div`
    display: flex;
    flex-direction: column;
    padding: var(--card-padding);
    background: white;
    border-radius: 0.5em;
    border-left: 3px solid #6366f1;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const TransitionPath = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.375em;
    font-size: 0.875em;
`;

const PathLabel = styled.span`
    color: #64748b;
    font-weight: 500;
    font-size: 0.75em;
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
    padding: 0.375rem 0.5em;
    background: #f8fafc;
    border-radius: 0.25em;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.75em;
    color: #475569;
    margin-bottom: 0.375em;
`;

const TransitionType = styled.div`
    display: flex;
    align-items: center;
    gap: 0.375em;
`;

const Badge = styled.span<{ $automatic?: boolean }>`
    padding: 0.125rem 0.5em;
    border-radius: 0.75em;
    font-size: 0.625em;
    font-weight: 600;
    text-transform: uppercase;
    background: ${props => props.$automatic ? '#10b981' : '#6366f1'};
    color: white;
`;

// Tool affordances display
const ToolsList = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--grid-min-width-tools), 1fr));
    gap: 0.75em;
`;

const ToolCard = styled.div`
    display: flex;
    flex-direction: column;
    padding: var(--card-padding);
    background: white;
    border-left: 3px solid #8b5cf6;
    border-radius: 0.375em;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
`;

const ToolName = styled.div`
    font-size: 0.813em;
    font-weight: 600;
    color: #1e293b;
    font-family: 'Monaco', 'Menlo', monospace;
    margin-bottom: 0.25em;
`;

const ToolDescription = styled.div`
    font-size: 0.75em;
    color: #64748b;
`;

const ToolSource = styled.span`
    display: inline-block;
    padding: 0.125rem 0.375em;
    background: #f1f5f9;
    color: #64748b;
    border-radius: 0.25em;
    font-size: 0.625em;
    font-weight: 500;
    text-transform: uppercase;
    margin-top: 0.25em;
`;

// Turn state indicator
const TurnStateCard = styled.div`
    display: flex;
    flex-direction: column;
    padding: var(--card-padding);
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    border-radius: 0.5em;
    box-shadow: 0 2px 4px rgba(139, 92, 246, 0.2);
    color: white;
`;

const TurnStateHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5em;
`;

const TurnStateTitle = styled.div`
    font-size: 0.875em;
    font-weight: 600;
    opacity: 0.9;
`;

const TurnStateValue = styled.div`
    font-size: 1.125em;
    font-weight: 700;
`;

const TurnStateGrid = styled.div`
    display: grid;
    grid-template-columns: var(--turn-grid-columns);
    gap: 0.5em;
    margin-top: 0.5em;
`;

const TurnStatItem = styled.div`
    display: flex;
    flex-direction: column;
    padding: 0.5em;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 0.375em;
`;

const TurnStatLabel = styled.div`
    font-size: 0.625em;
    opacity: 0.8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25em;
`;

const TurnStatValue = styled.div`
    font-size: 0.938em;
    font-weight: 600;
`;

export const ExecutionStateVisualizer = forwardRef<ExecutionStateVisualizerRef, ExecutionStateVisualizerProps>(({
    executor
}, ref) => {
    const [vizState, setVizState] = useState<VisualizationState | null>(null);
    const [machineJSON, setMachineJSON] = useState<MachineJSON | null>(null);
    const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!executor) {
            setVizState(null);
            setMachineJSON(null);
            setSnapshot(null);
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

            // Get runtime snapshot for enhanced features (tools, turn state)
            let runtimeSnapshot: RuntimeSnapshot | null = null;
            if (typeof (executor as any).getRuntimeSnapshot === 'function') {
                try {
                    runtimeSnapshot = (executor as any).getRuntimeSnapshot();
                } catch (err) {
                    // Fallback gracefully if snapshot generation fails
                    console.warn('Failed to get runtime snapshot:', err);
                }
            }

            setVizState(state);
            setMachineJSON(machine);
            setSnapshot(runtimeSnapshot);
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

    const toggleSection = (sectionId: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionId)) {
                next.delete(sectionId);
            } else {
                next.add(sectionId);
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
            <Container>
                <EmptyState>
                    <EmptyIcon>▶</EmptyIcon>
                    <EmptyText>Click "Execute" to start machine execution</EmptyText>
                </EmptyState>
            </Container>
        );
    }
    console.log({vizState})

    return (
        <Container>
            {/* Execution Summary */}
            <Section>
                <SectionTitle $clickable onClick={() => toggleSection('summary')}>
                    Execution Summary
                    <CollapseIcon $collapsed={collapsedSections.has('summary')}>▼</CollapseIcon>
                </SectionTitle>
                <CollapsibleContent $collapsed={collapsedSections.has('summary')}>
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
                </CollapsibleContent>
            </Section>

            {/* Active Paths */}
            {vizState.activePaths.length > 0 && (
                <Section>
                    <SectionTitle $clickable onClick={() => toggleSection('activePaths')}>
                        Active Paths <SectionCount>{vizState.activePaths.length}</SectionCount>
                        <CollapseIcon $collapsed={collapsedSections.has('activePaths')}>▼</CollapseIcon>
                    </SectionTitle>
                    <CollapsibleContent $collapsed={collapsedSections.has('activePaths')}>
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
                    </CollapsibleContent>
                </Section>
            )}

            {/* All Paths Overview */}
            {vizState.allPaths.length > vizState.activePaths.length && (
                <Section>
                    <SectionTitle $clickable onClick={() => toggleSection('allPaths')}>
                        All Paths <SectionCount>{vizState.allPaths.length}</SectionCount>
                        <CollapseIcon $collapsed={collapsedSections.has('allPaths')}>▼</CollapseIcon>
                    </SectionTitle>
                    <CollapsibleContent $collapsed={collapsedSections.has('allPaths')}>
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
                    </CollapsibleContent>
                </Section>
            )}

            {/* Node States */}
            <Section>
                <SectionTitle $clickable onClick={() => toggleSection('nodeStates')}>
                    Node States
                    <CollapseIcon $collapsed={collapsedSections.has('nodeStates')}>▼</CollapseIcon>
                </SectionTitle>
                <CollapsibleContent $collapsed={collapsedSections.has('nodeStates')}>
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
                </CollapsibleContent>
            </Section>

            {/* Available Transitions */}
            {vizState.availableTransitions.length > 0 && (
                <Section>
                    <SectionTitle $clickable onClick={() => toggleSection('transitions')}>
                        Available Transitions <SectionCount>{vizState.availableTransitions.length}</SectionCount>
                        <CollapseIcon $collapsed={collapsedSections.has('transitions')}>▼</CollapseIcon>
                    </SectionTitle>
                    <CollapsibleContent $collapsed={collapsedSections.has('transitions')}>
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
                    </CollapsibleContent>
                </Section>
            )}

            {/* Turn State Indicator */}
            {snapshot?.turnState && (
                <Section>
                    <SectionTitle $clickable onClick={() => toggleSection('turnState')}>
                        Turn Execution
                        <CollapseIcon $collapsed={collapsedSections.has('turnState')}>▼</CollapseIcon>
                    </SectionTitle>
                    <CollapsibleContent $collapsed={collapsedSections.has('turnState')}>
                        <TurnStateCard>
                            <TurnStateHeader>
                                <TurnStateTitle>🔄 In Turn</TurnStateTitle>
                                <TurnStateValue>Turn {snapshot.turnState.turnCount}</TurnStateValue>
                            </TurnStateHeader>
                            <TurnStateGrid>
                                <TurnStatItem>
                                    <TurnStatLabel>Node</TurnStatLabel>
                                    <TurnStatValue>{snapshot.turnState.nodeName}</TurnStatValue>
                                </TurnStatItem>
                                <TurnStatItem>
                                    <TurnStatLabel>Messages</TurnStatLabel>
                                    <TurnStatValue>{snapshot.turnState.conversationLength}</TurnStatValue>
                                </TurnStatItem>
                                <TurnStatItem>
                                    <TurnStatLabel>Tools</TurnStatLabel>
                                    <TurnStatValue>{snapshot.turnState.availableTools.length}</TurnStatValue>
                                </TurnStatItem>
                                <TurnStatItem>
                                    <TurnStatLabel>Status</TurnStatLabel>
                                    <TurnStatValue>{snapshot.turnState.isWaitingForTurn ? 'Waiting' : 'Active'}</TurnStatValue>
                                </TurnStatItem>
                            </TurnStateGrid>
                        </TurnStateCard>
                    </CollapsibleContent>
                </Section>
            )}

            {/* Tool Affordances */}
            {snapshot?.affordances.tools && snapshot.affordances.tools.length > 0 && (
                <Section>
                    <SectionTitle $clickable onClick={() => toggleSection('tools')}>
                        Available Tools <SectionCount>{snapshot.affordances.tools.length}</SectionCount>
                        <CollapseIcon $collapsed={collapsedSections.has('tools')}>▼</CollapseIcon>
                    </SectionTitle>
                    <CollapsibleContent $collapsed={collapsedSections.has('tools')}>
                        <ToolsList>
                            {snapshot.affordances.tools.map((tool, idx) => (
                                <ToolCard key={idx}>
                                    <ToolName>{tool.toolName}</ToolName>
                                    <ToolDescription>{tool.description}</ToolDescription>
                                    <ToolSource>{tool.source}</ToolSource>
                                </ToolCard>
                            ))}
                        </ToolsList>
                    </CollapsibleContent>
                </Section>
            )}
        </Container>
    );
});

ExecutionStateVisualizer.displayName = 'ExecutionStateVisualizer';
