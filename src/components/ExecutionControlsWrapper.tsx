/**
 * Wrapper for rendering ExecutionControls React component into DOM
 * Provides backward compatibility for non-React playgrounds
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ExecutionControls, ExecutionControlsProps, ExecutionControlsRef, ExecutionState } from './ExecutionControls';

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
    private root: ReactDOM.Root;
    private props: ExecutionControlsProps;
    private ref: React.RefObject<ExecutionControlsRef>;
    private lastKnownState: ExecutionState = { status: 'idle', stepCount: 0 };
    private pendingStateUpdates: Array<Partial<ExecutionState>> = [];
    private pendingLogEntries: Array<{ message: string; type: 'info' | 'success' | 'warning' | 'error' }>;
    private pendingClearLog = false;
    private flushScheduled = false;

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

        this.ref = React.createRef<ExecutionControlsRef>();
        this.pendingLogEntries = [];

        this.root = ReactDOM.createRoot(this.container);
        this.root.render(
            <ExecutionControls
                ref={this.ref}
                onExecute={this.props.onExecute}
                onStep={this.props.onStep}
                onStop={this.props.onStop}
                onReset={this.props.onReset}
                mobile={this.props.mobile}
                showLog={this.props.showLog}
            />
        );

        this.scheduleFlush();
    }

    private scheduleFlush(): void {
        if (this.flushScheduled) {
            return;
        }
        this.flushScheduled = true;
        Promise.resolve().then(() => {
            this.flushScheduled = false;
            this.flushPendingOperations();
        });
    }

    private flushPendingOperations(): void {
        const api = this.ref.current;

        if (!api) {
            this.scheduleFlush();
            return;
        }

        if (this.pendingStateUpdates.length > 0) {
            for (const update of this.pendingStateUpdates) {
                api.updateState(update);
            }
            this.pendingStateUpdates = [];
            this.lastKnownState = api.getState();
        }

        if (this.pendingClearLog) {
            api.clearLog();
            this.pendingClearLog = false;
        }

        if (this.pendingLogEntries.length > 0) {
            for (const entry of this.pendingLogEntries) {
                api.addLogEntry(entry.message, entry.type);
            }
            this.pendingLogEntries = [];
        }
    }

    /**
     * Update execution state (for backward compatibility)
     */
    updateState(updates: Partial<ExecutionState>): void {
        this.lastKnownState = { ...this.lastKnownState, ...updates };

        const api = this.ref.current;
        if (api) {
            api.updateState(updates);
            this.lastKnownState = api.getState();
        } else {
            this.pendingStateUpdates.push(updates);
            this.scheduleFlush();
        }
    }

    /**
     * Add log entry (for backward compatibility)
     */
    addLogEntry(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        const api = this.ref.current;
        if (api) {
            api.addLogEntry(message, type);
        } else {
            this.pendingLogEntries.push({ message, type });
            this.scheduleFlush();
        }
    }

    /**
     * Get current state (for backward compatibility)
     */
    getState(): ExecutionState {
        const api = this.ref.current;
        return api ? api.getState() : { ...this.lastKnownState };
    }

    /**
     * Clear log (for backward compatibility)
     */
    clearLog(): void {
        const api = this.ref.current;
        if (api) {
            api.clearLog();
        } else {
            this.pendingClearLog = true;
            this.pendingLogEntries = [];
            this.scheduleFlush();
        }
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
