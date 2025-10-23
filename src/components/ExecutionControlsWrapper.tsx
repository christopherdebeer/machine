/**
 * Wrapper for rendering ExecutionControls React component into DOM
 * Provides backward compatibility for non-React playgrounds
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ExecutionControls, ExecutionControlsProps, ExecutionState } from './ExecutionControls';

export interface ExecutionControlsWrapperConfig {
    container: HTMLElement;
    onExecute?: () => Promise<void>;
    onStep?: () => Promise<void>;
    onStop?: () => void;
    onReset?: () => void;
    mobile?: boolean;
    showLog?: boolean;
}

/**
 * Wrapper class that provides the same API as the old ExecutionControls
 * but uses the React component internally
 */
export class ExecutionControlsWrapper {
    private container: HTMLElement;
    private root!: ReactDOM.Root;
    private stateRef: React.MutableRefObject<ExecutionState>;
    private addLogEntryFn: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    private clearLogFn: () => void;
    private props: ExecutionControlsProps;

    constructor(config: ExecutionControlsWrapperConfig) {
        this.container = config.container;
        this.props = {
            onExecute: config.onExecute,
            onStep: config.onStep,
            onStop: config.onStop,
            onReset: config.onReset,
            mobile: config.mobile,
            showLog: config.showLog
        };

        // Create refs for imperative API
        this.stateRef = { current: { status: 'idle', stepCount: 0 } };
        this.addLogEntryFn = () => {};
        this.clearLogFn = () => {};

        this.render();
    }

    private render(): void {
        // Create a wrapper component that exposes imperative methods
        const WrapperComponent = () => {
            const [state, setState] = React.useState<ExecutionState>({
                status: 'idle',
                stepCount: 0
            });
            const [logs, setLogs] = React.useState<Array<{
                timestamp: string;
                message: string;
                type: 'info' | 'success' | 'warning' | 'error';
            }>>([]);

            // Update refs when state changes
            React.useEffect(() => {
                this.stateRef.current = state;
            }, [state]);

            // Expose methods through refs
            React.useEffect(() => {
                this.addLogEntryFn = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
                    const timestamp = new Date().toLocaleTimeString();
                    setLogs(prev => [...prev, { timestamp, message, type }]);
                };

                this.clearLogFn = () => {
                    setLogs([]);
                };
            }, []);

            // Create wrapped handlers that update state
            const wrappedOnExecute = React.useCallback(async () => {
                setState((prev: ExecutionState) => ({ ...prev, status: 'running', stepCount: 0 }));
                if (this.props.onExecute) {
                    try {
                        await this.props.onExecute();
                        setState(prev => ({ ...prev, status: 'complete' }));
                    } catch (error) {
                        setState(prev => ({ ...prev, status: 'error' }));
                        throw error;
                    }
                }
            }, []);

            const wrappedOnStep = React.useCallback(async () => {
                if (state.status === 'idle') {
                    setState(prev => ({ ...prev, status: 'stepping', stepCount: 0 }));
                    return;
                }
                if (this.props.onStep) {
                    try {
                        await this.props.onStep();
                        setState((prev: ExecutionState) => ({ ...prev, stepCount: prev.stepCount + 1 }));
                    } catch (error) {
                        setState((prev: ExecutionState) => ({ ...prev, status: 'error' }));
                        throw error;
                    }
                }
            }, [state.status]);

            const wrappedOnStop = React.useCallback(() => {
                setState((prev: ExecutionState) => ({ ...prev, status: 'idle' }));
                if (this.props.onStop) {
                    this.props.onStop();
                }
            }, []);

            const wrappedOnReset = React.useCallback(() => {
                setState({ status: 'idle', stepCount: 0, currentNode: undefined });
                setLogs([]);
                if (this.props.onReset) {
                    this.props.onReset();
                }
            }, []);

            return (
                <ExecutionControls
                    onExecute={wrappedOnExecute}
                    onStep={wrappedOnStep}
                    onStop={wrappedOnStop}
                    onReset={wrappedOnReset}
                    mobile={this.props.mobile}
                    showLog={this.props.showLog}
                />
            );
        };

        // Render the component
        this.root = ReactDOM.createRoot(this.container);
        this.root.render(<WrapperComponent />);
    }

    /**
     * Update execution state (for backward compatibility)
     */
    updateState(updates: Partial<ExecutionState>): void {
        this.stateRef.current = { ...this.stateRef.current, ...updates };
        // Force re-render by updating the component
        this.render();
    }

    /**
     * Add log entry (for backward compatibility)
     */
    addLogEntry(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        this.addLogEntryFn(message, type);
    }

    /**
     * Get current state (for backward compatibility)
     */
    getState(): ExecutionState {
        return { ...this.stateRef.current };
    }

    /**
     * Clear log (for backward compatibility)
     */
    clearLog(): void {
        this.clearLogFn();
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.root.unmount();
    }
}

/**
 * Factory function for creating ExecutionControls wrapper
 * Provides the same API as the old class-based implementation
 */
export function createExecutionControls(config: ExecutionControlsWrapperConfig): ExecutionControlsWrapper {
    return new ExecutionControlsWrapper(config);
}
