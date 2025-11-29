/**
 * Execution Controls Component (React + styled-components)
 *
 * Provides unified execution UI for both Monaco and CodeMirror playgrounds
 * Supports: execute, step-by-step, stop, reset
 */

import React, { useState, useCallback, useRef, useEffect, useImperativeHandle } from 'react';
import styled from 'styled-components';

export type ExecutionStatus = 'idle' | 'running' | 'stepping' | 'complete' | 'error';

export interface ExecutionState {
    status: ExecutionStatus;
    currentNode?: string;
    stepCount: number;
}

export interface ExecutionControlsProps {
    onExecute?: () => Promise<void>;
    onStep?: () => Promise<void>;
    onStop?: () => void;
    onReset?: () => void;
    mobile?: boolean;
    showLog?: boolean;
    executor?: any; // MachineExecutor instance to get logs from
    logLevel?: string; // Current log level
    onLogLevelChange?: (level: string) => void;

    // Playback mode
    playbackMode?: boolean; // Whether playback mode is enabled
    recordingsAvailable?: boolean; // Whether recordings exist for current example
    onTogglePlaybackMode?: () => void; // Handler to toggle playback mode
    playbackClient?: any; // Playback client instance for progress tracking

    // Recording mode
    recordingMode?: boolean; // Whether recording mode is enabled
    onToggleRecordingMode?: () => void; // Handler to toggle recording mode
    recordingClient?: any; // Recording client instance for count tracking
    onExportRecordings?: () => void; // Handler to export/download recordings
    onClearRecordings?: () => void; // Handler to clear recordings
}

interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

// Styled Components
const Container = styled.div<{ $mobile?: boolean }>`
    display: flex;
    flex-direction: column;
    background: #252526;
    border-top: 1px solid #3e3e42;
    ${props => props.$mobile ? 'max-height: 300px;' : ''}
    height: 100%;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.3em 0.6em;
    background: #2d2d30;
    border-bottom: 1px solid #3e3e42;
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 0.3em;
    flex-wrap: wrap;
`;

const Button = styled.button<{ disabled?: boolean }>`
    background: rgb(62, 62, 66);
    color: rgb(212, 212, 212);
    border: none;
    padding: 0.25em 0.6em;
    border-radius: 4px;
    font-size: 12px;
    cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
    transition: background 0.2s;
    white-space: pre-wrap;
    opacity: ${props => props.disabled ? '0.5' : '1'};

    &:hover:not(:disabled) {
        background: rgb(72, 72, 76);
    }
`;

const StatusBar = styled.div`
    display: flex;
    gap: 16px;
    padding: 8px 16px;
    background: #1e1e1e;
    border-bottom: 1px solid #3e3e42;
    font-size: 12px;
`;

const StatusItem = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const StatusLabel = styled.span`
    color: #858585;
`;

const StatusValue = styled.span<{ $color?: string }>`
    color: ${props => props.$color || '#d4d4d4'};
    font-weight: 600;
`;

const LogContainer = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    background: #1e1e1e;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.6;
`;

const LogHeader = styled.div`
    font-weight: 600;
    color: #cccccc;
    margin-bottom: 8px;
`;

const LogContent = styled.div``;

const LogEntry = styled.div<{ $color: string }>`
    margin-bottom: 4px;
    color: ${props => props.$color};
`;

const LogTimestamp = styled.span`
    color: #858585;
`;

const LogLevelSelector = styled.select`
    background: rgb(62, 62, 66);
    color: rgb(212, 212, 212);
    border: 1px solid rgb(80, 80, 83);
    padding: 0.25em 0.6em;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;

    &:focus {
        outline: none;
        border-color: #0e639c;
    }
`;

const PlaybackToggle = styled.button<{ $active?: boolean; $available?: boolean }>`
    background: ${props => props.$active ? '#10b981' : 'rgb(62, 62, 66)'};
    color: rgb(212, 212, 212);
    border: 1px solid ${props => props.$active ? '#10b981' : 'rgb(80, 80, 83)'};
    padding: 0.25em 0.6em;
    border-radius: 4px;
    font-size: 12px;
    cursor: ${props => props.$available ? 'pointer' : 'not-allowed'};
    opacity: ${props => props.$available ? '1' : '0.5'};
    display: flex;
    align-items: center;
    gap: 0.3em;
    transition: all 0.2s;

    &:hover:enabled {
        background: ${props => props.$active ? '#059669' : 'rgb(72, 72, 76)'};
        border-color: ${props => props.$active ? '#059669' : '#0e639c'};
    }

    &:disabled {
        cursor: not-allowed;
    }
`;

const PlaybackProgress = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 12px;
    color: #10b981;
    padding: 0.25em 0.6em;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 4px;
`;

const RecordingToggle = styled.button<{ $active?: boolean }>`
    background: ${props => props.$active ? '#dc2626' : 'rgb(62, 62, 66)'};
    color: rgb(212, 212, 212);
    border: 1px solid ${props => props.$active ? '#dc2626' : 'rgb(80, 80, 83)'};
    padding: 0.25em 0.6em;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3em;
    transition: all 0.2s;

    &:hover {
        background: ${props => props.$active ? '#b91c1c' : 'rgb(72, 72, 76)'};
        border-color: ${props => props.$active ? '#b91c1c' : '#0e639c'};
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
`;

const RecordingIndicator = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 12px;
    color: #dc2626;
    padding: 0.25em 0.6em;
    background: rgba(220, 38, 38, 0.1);
    border-radius: 4px;

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    &::before {
        content: '●';
        animation: pulse 2s ease-in-out infinite;
    }
`;

const RecordingActions = styled.div`
    display: flex;
    gap: 0.3em;
`;

// Main Component
export const ExecutionControls = React.forwardRef<ExecutionControlsRef, ExecutionControlsProps>(({
    onExecute,
    onStep,
    onStop,
    onReset,
    mobile = false,
    showLog = true,
    executor,
    logLevel,
    onLogLevelChange,
    playbackMode = false,
    recordingsAvailable = false,
    onTogglePlaybackMode,
    playbackClient,
    recordingMode = false,
    onToggleRecordingMode,
    recordingClient,
    onExportRecordings,
    onClearRecordings
}, ref) => {
    const [state, setState] = useState<ExecutionState>({
        status: 'idle',
        stepCount: 0
    });

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const logContentRef = useRef<HTMLDivElement>(null);

    // Sync executor logs reactively using onLog callback
    useEffect(() => {
        if (!executor) return;

        // Initial sync of existing logs
        const syncLogs = () => {
            try {
                const executorLogs = executor.getLogs();
                const formatted = executorLogs.map((log: any) => ({
                    timestamp: new Date(log.timestamp).toLocaleTimeString(),
                    message: `[${log.category}] ${log.message}`,
                    type: log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : log.level === 'debug' ? 'info' : 'info'
                }));
                setLogs(formatted);
            } catch (e) {
                // Ignore errors in log sync
            }
        };

        // Sync existing logs immediately
        syncLogs();

        // Set up reactive log callback if executor supports it
        const logger = executor.getLogger?.();
        if (logger && typeof logger.setOnLogCallback === 'function') {
            const handleNewLog = (logEntry: any) => {
                const formatted: LogEntry = {
                    timestamp: new Date(logEntry.timestamp).toLocaleTimeString(),
                    message: `[${logEntry.category}] ${logEntry.message}`,
                    type: logEntry.level === 'error' ? 'error' : logEntry.level === 'warn' ? 'warning' : logEntry.level === 'debug' ? 'info' : 'info'
                };
                setLogs(prev => [...prev, formatted]);
            };

            logger.setOnLogCallback(handleNewLog);

            return () => {
                // Clean up callback
                if (typeof logger.setOnLogCallback === 'function') {
                    logger.setOnLogCallback(undefined);
                }
            };
        }

        // Fallback: if reactive logging not available, do nothing (no polling)
        return () => {};
    }, [executor]);

    // Auto-scroll to bottom when new logs are added
    useEffect(() => {
        if (logContentRef.current) {
            logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
        }
    }, [logs]);

    const addLogEntry = useCallback((message: string, type: LogEntry['type'] = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { timestamp, message, type }]);
    }, []);

    const updateState = useCallback((updates: Partial<ExecutionState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    const clearLog = useCallback(() => {
        setLogs([]);
    }, []);

    useImperativeHandle(ref, () => ({
        updateState,
        addLogEntry,
        clearLog,
        getState: () => state
    }), [updateState, addLogEntry, clearLog, state]);

    const handleExecute = useCallback(async () => {
        if (state.status === 'running' || state.status === 'stepping') {
            addLogEntry('Execution already in progress', 'warning');
            return;
        }

        updateState({
            status: 'running',
            stepCount: 0
        });

        addLogEntry('Starting machine execution...', 'info');

        if (onExecute) {
            try {
                await onExecute();
                updateState({ status: 'complete' });
                addLogEntry('Execution complete', 'success');
            } catch (error) {
                updateState({ status: 'error' });
                addLogEntry(
                    `Execution error: ${error instanceof Error ? error.message : String(error)}`,
                    'error'
                );
            }
        }
    }, [state.status, onExecute, addLogEntry, updateState]);

    const handleStep = useCallback(async () => {
        if (state.status === 'idle') {
            // Enter stepping mode
            updateState({
                status: 'stepping',
                stepCount: 0
            });
            addLogEntry('Entered step-by-step mode', 'info');
            return;
        }

        if (state.status !== 'stepping') {
            addLogEntry('Not in stepping mode', 'warning');
            return;
        }

        addLogEntry(`Executing step ${state.stepCount + 1}...`, 'info');

        if (onStep) {
            try {
                await onStep();
                updateState({
                    stepCount: state.stepCount + 1
                });
            } catch (error) {
                updateState({ status: 'error' });
                addLogEntry(
                    `Step error: ${error instanceof Error ? error.message : String(error)}`,
                    'error'
                );
            }
        }
    }, [state.status, state.stepCount, onStep, addLogEntry, updateState]);

    const handleStop = useCallback(() => {
        if (state.status === 'idle') return;

        const wasRunning = state.status === 'running';
        const wasStepping = state.status === 'stepping';

        updateState({ status: 'idle' });

        if (wasRunning) {
            addLogEntry('Execution stopped by user', 'warning');
        } else if (wasStepping) {
            addLogEntry('Exited step-by-step mode', 'info');
        }

        if (onStop) {
            onStop();
        }
    }, [state.status, onStop, addLogEntry, updateState]);

    const handleReset = useCallback(() => {
        handleStop();

        updateState({
            status: 'idle',
            currentNode: undefined,
            stepCount: 0
        });

        clearLog();
        addLogEntry('Machine reset', 'info');

        if (onReset) {
            onReset();
        }
    }, [handleStop, onReset, addLogEntry, updateState, clearLog]);

    const getStatusText = (): string => {
        switch (state.status) {
            case 'idle': return 'Not Running';
            case 'running': return 'Running';
            case 'stepping': return 'Step Mode';
            case 'complete': return 'Complete';
            case 'error': return 'Error';
            default: return 'Unknown';
        }
    };

    const getStatusColor = (): string => {
        switch (state.status) {
            case 'idle': return '#858585';
            case 'running': return '#4ec9b0';
            case 'stepping': return '#ffa500';
            case 'complete': return '#4ec9b0';
            case 'error': return '#f48771';
            default: return '#858585';
        }
    };

    const getLogColor = (type: LogEntry['type']): string => {
        switch (type) {
            case 'info': return '#d4d4d4';
            case 'success': return '#4ec9b0';
            case 'warning': return '#ffa500';
            case 'error': return '#f48771';
            default: return '#d4d4d4';
        }
    };

    // Get playback progress if in playback mode
    const playbackPosition = playbackClient?.getPlaybackPosition?.() || { current: 0, total: 0 };

    // Get recording count if in recording mode
    const recordingCount = recordingClient?.getRecordingCount?.() || 0;

    return (
        <Container $mobile={mobile} className="execution-panel">
            <Header className="execution-header">
                <ButtonGroup className="execution-buttons">
                    <Button
                        onClick={handleExecute}
                        disabled={state.status === 'running' || state.status === 'stepping'}
                        className="exec-btn"
                    >
                        ▶️ Execute
                    </Button>
                    <Button
                        onClick={handleStep}
                        disabled={state.status === 'running'}
                        className="exec-btn"
                    >
                        ⏭️ Step
                    </Button>
                    <Button
                        onClick={handleStop}
                        disabled={state.status === 'idle'}
                        className="exec-btn"
                    >
                        ⏹️ Stop
                    </Button>
                    <Button
                        onClick={handleReset}
                        className="exec-btn"
                    >
                        🔄 Reset
                    </Button>

                    {recordingsAvailable && onTogglePlaybackMode && (
                        <PlaybackToggle
                            $active={playbackMode}
                            $available={recordingsAvailable}
                            onClick={onTogglePlaybackMode}
                            disabled={!recordingsAvailable}
                            title={playbackMode ? 'Disable playback mode (use live API)' : 'Enable playback mode (use recordings)'}
                        >
                            {playbackMode ? '📼' : '🎬'} {playbackMode ? 'Playback' : 'Live'}
                        </PlaybackToggle>
                    )}

                    {playbackMode && playbackPosition.total > 0 && (
                        <PlaybackProgress title="Playback progress">
                            📊 {playbackPosition.current}/{playbackPosition.total}
                        </PlaybackProgress>
                    )}

                    {onToggleRecordingMode && !playbackMode && (
                        <RecordingToggle
                            $active={recordingMode}
                            onClick={onToggleRecordingMode}
                            title={recordingMode ? 'Stop recording (switch to live mode)' : 'Start recording (capture responses)'}
                        >
                            {recordingMode ? '🔴' : '⚪'} {recordingMode ? 'Recording' : 'Record'}
                        </RecordingToggle>
                    )}

                    {recordingMode && recordingCount > 0 && (
                        <RecordingIndicator title="Recording in progress">
                            {recordingCount} recording{recordingCount !== 1 ? 's' : ''}
                        </RecordingIndicator>
                    )}

                    {recordingMode && recordingCount > 0 && (
                        <RecordingActions>
                            {onExportRecordings && (
                                <Button
                                    onClick={onExportRecordings}
                                    title="Download recordings as JSON"
                                >
                                    💾 Export
                                </Button>
                            )}
                            {onClearRecordings && (
                                <Button
                                    onClick={onClearRecordings}
                                    title="Clear all recordings"
                                >
                                    🗑️ Clear
                                </Button>
                            )}
                        </RecordingActions>
                    )}
                </ButtonGroup>

                {onLogLevelChange && (
                    <LogLevelSelector
                        value={logLevel || 'info'}
                        onChange={(e) => onLogLevelChange(e.target.value)}
                        title="Log level"
                    >
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                        <option value="none">None</option>
                    </LogLevelSelector>
                )}
            </Header>

            <StatusBar className="execution-status">
                <StatusItem>
                    <StatusLabel>Status:</StatusLabel>
                    <StatusValue $color={getStatusColor()}>{getStatusText()}</StatusValue>
                </StatusItem>
                {state.currentNode && (
                    <StatusItem>
                        <StatusLabel>Current Node:</StatusLabel>
                        <StatusValue $color="#4ec9b0">{state.currentNode}</StatusValue>
                    </StatusItem>
                )}
                <StatusItem>
                    <StatusLabel>Steps:</StatusLabel>
                    <StatusValue>{state.stepCount}</StatusValue>
                </StatusItem>
            </StatusBar>

            {showLog && (
                <LogContainer className="execution-log" ref={logContentRef}>
                    <LogHeader>Execution Log</LogHeader>
                    <LogContent id="execution-log-content">
                        {logs.map((log, index) => (
                            <LogEntry key={index} $color={getLogColor(log.type)}>
                                <LogTimestamp>[{log.timestamp}]</LogTimestamp>
                                <span> {log.message}</span>
                            </LogEntry>
                        ))}
                    </LogContent>
                </LogContainer>
            )}
        </Container>
    );
});

ExecutionControls.displayName = 'ExecutionControls';

// Export imperative API for backward compatibility
export interface ExecutionControlsRef {
    updateState: (updates: Partial<ExecutionState>) => void;
    addLogEntry: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    clearLog: () => void;
    getState: () => ExecutionState;
}

export const useExecutionControlsRef = (
    stateRef: React.MutableRefObject<ExecutionState>,
    addLogEntryFn: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    clearLogFn: () => void
): ExecutionControlsRef => {
    return {
        updateState: (updates: Partial<ExecutionState>) => {
            stateRef.current = { ...stateRef.current, ...updates };
        },
        addLogEntry: addLogEntryFn,
        clearLog: clearLogFn,
        getState: () => stateRef.current
    };
};
