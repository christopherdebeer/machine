/**
 * Shared Execution Controls Component (DEPRECATED)
 *
 * @deprecated This class-based implementation is deprecated.
 * Please use the React component from src/components/ExecutionControls.tsx instead.
 * This file is kept for backward compatibility only.
 *
 * Provides unified execution UI for both Monaco and CodeMirror playgrounds
 * Supports: execute, step-by-step, stop, reset
 */

export type ExecutionStatus = 'idle' | 'running' | 'stepping' | 'complete' | 'error';

const styles = `
button {
    background: rgb(62, 62, 66);
    color: rgb(212, 212, 212);
    border: none;
    padding: 0.25em 0.6em;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
    white-space: pre-wrap;
}

`

export interface ExecutionControlsConfig {
    container: HTMLElement;
    onExecute?: () => Promise<void>;
    onStep?: () => Promise<void>;
    onStop?: () => void;
    onReset?: () => void;
    mobile?: boolean; // Mobile-optimized layout
    showLog?: boolean; // Show execution log
}

export interface ExecutionState {
    status: ExecutionStatus;
    currentNode?: string;
    stepCount: number;
}

/**
 * Execution Controls Manager
 */
export class ExecutionControls {
    private container: HTMLElement;
    private onExecute?: () => Promise<void>;
    private onStep?: () => Promise<void>;
    private onStop?: () => void;
    private onReset?: () => void;
    private mobile: boolean;
    private showLog: boolean;

    private state: ExecutionState = {
        status: 'idle',
        stepCount: 0
    };

    private stylesEl?: HTMLElement;
    private headerEl?: HTMLElement;
    private buttonsEl?: HTMLElement;
    private statusEl?: HTMLElement;
    private logEl?: HTMLElement;

    private btnExecute?: HTMLButtonElement;
    private btnStep?: HTMLButtonElement;
    private btnStop?: HTMLButtonElement;
    private btnReset?: HTMLButtonElement;

    constructor(config: ExecutionControlsConfig) {
        this.container = config.container;
        this.onExecute = config.onExecute;
        this.onStep = config.onStep;
        this.onStop = config.onStop;
        this.onReset = config.onReset;
        this.mobile = config.mobile || false;
        this.showLog = config.showLog !== false; // Default true

        this.initialize();
    }

    /**
     * Initialize the execution controls UI
     */
    private initialize(): void {

        this.stylesEl = document.createElement('style')
        this.stylesEl.innerHTML = styles;
        this.container.className = 'execution-panel';
        this.container.style.cssText = `
            display: flex;
            flex-direction: column;
            background: #252526;
            border-top: 1px solid #3e3e42;
            ${this.mobile ? 'max-height: 300px;' : ''}
        `;

        // Header with buttons
        this.headerEl = document.createElement('div');
        this.headerEl.className = 'execution-header';
        this.headerEl.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #2d2d30;
            border-bottom: 1px solid #3e3e42;
        `;

        this.buttonsEl = document.createElement('div');
        this.buttonsEl.className = 'execution-buttons';
        this.buttonsEl.style.cssText = `
            display: flex;
            gap: 8px;
        `;

        // Create buttons
        this.btnExecute = this.createButton('▶️ Execute', () => this.handleExecute());
        this.btnStep = this.createButton('⏭️ Step', () => this.handleStep());
        this.btnStop = this.createButton('⏹️ Stop', () => this.handleStop());
        this.btnReset = this.createButton('🔄 Reset', () => this.handleReset());

        this.buttonsEl.appendChild(this.btnExecute);
        this.buttonsEl.appendChild(this.btnStep);
        this.buttonsEl.appendChild(this.btnStop);
        this.buttonsEl.appendChild(this.btnReset);

        this.headerEl.appendChild(this.buttonsEl);

        // Status display
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'execution-status';
        this.statusEl.style.cssText = `
            display: flex;
            gap: 16px;
            padding: 8px 16px;
            background: #1e1e1e;
            border-bottom: 1px solid #3e3e42;
            font-size: 12px;
        `;

        this.updateStatusDisplay();

        // Execution log
        if (this.showLog) {
            this.logEl = document.createElement('div');
            this.logEl.className = 'execution-log';
            this.logEl.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 12px 16px;
                background: #1e1e1e;
                font-family: 'Monaco', 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.6;
            `;

            const logHeader = document.createElement('div');
            logHeader.textContent = 'Execution Log';
            logHeader.style.cssText = `
                font-weight: 600;
                color: #cccccc;
                margin-bottom: 8px;
            `;

            const logContent = document.createElement('div');
            logContent.id = 'execution-log-content';

            this.logEl.appendChild(logHeader);
            this.logEl.appendChild(logContent);
        }

        // Assemble UI
        this.container.appendChild(this.headerEl);
        this.container.appendChild(this.statusEl);
        this.container.appendChild(this.stylesEl);
        if (this.logEl) {
            this.container.appendChild(this.logEl);
        }

        this.updateButtonStates();
    }

    /**
     * Create a button
     */
    private createButton(label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = label;
        button.className = 'exec-btn';

        button.addEventListener('click', onClick);

        // button.addEventListener('mouseenter', () => {
        //     if (!button.disabled) {
        //         button.style.background = '#1177bb';
        //     }
        // });

        // button.addEventListener('mouseleave', () => {
        //     if (!button.disabled) {
        //         button.style.background = '#0e639c';
        //     }
        // });

        return button;
    }

    /**
     * Handle execute button
     */
    private async handleExecute(): Promise<void> {
        if (this.state.status === 'running' || this.state.status === 'stepping') {
            this.addLogEntry('Execution already in progress', 'warning');
            return;
        }

        this.updateState({
            status: 'running',
            stepCount: 0
        });

        this.addLogEntry('Starting machine execution...', 'info');

        if (this.onExecute) {
            try {
                await this.onExecute();
                this.updateState({ status: 'complete' });
                this.addLogEntry('Execution complete', 'success');
            } catch (error) {
                this.updateState({ status: 'error' });
                this.addLogEntry(
                    `Execution error: ${error instanceof Error ? error.message : String(error)}`,
                    'error'
                );
            }
        }
    }

    /**
     * Handle step button
     */
    private async handleStep(): Promise<void> {
        if (this.state.status === 'idle') {
            // Enter stepping mode
            this.updateState({
                status: 'stepping',
                stepCount: 0
            });
            this.addLogEntry('Entered step-by-step mode', 'info');
            return;
        }

        if (this.state.status !== 'stepping') {
            this.addLogEntry('Not in stepping mode', 'warning');
            return;
        }

        this.addLogEntry(`Executing step ${this.state.stepCount + 1}...`, 'info');

        if (this.onStep) {
            try {
                await this.onStep();
                this.updateState({
                    stepCount: this.state.stepCount + 1
                });
            } catch (error) {
                this.updateState({ status: 'error' });
                this.addLogEntry(
                    `Step error: ${error instanceof Error ? error.message : String(error)}`,
                    'error'
                );
            }
        }
    }

    /**
     * Handle stop button
     */
    private handleStop(): void {
        if (this.state.status === 'idle') return;

        const wasRunning = this.state.status === 'running';
        const wasStepping = this.state.status === 'stepping';

        this.updateState({ status: 'idle' });

        if (wasRunning) {
            this.addLogEntry('Execution stopped by user', 'warning');
        } else if (wasStepping) {
            this.addLogEntry('Exited step-by-step mode', 'info');
        }

        if (this.onStop) {
            this.onStop();
        }
    }

    /**
     * Handle reset button
     */
    private handleReset(): void {
        this.handleStop();

        this.updateState({
            status: 'idle',
            currentNode: undefined,
            stepCount: 0
        });

        // Clear log
        if (this.logEl) {
            const logContent = this.logEl.querySelector('#execution-log-content');
            if (logContent) {
                logContent.innerHTML = '';
            }
        }

        this.addLogEntry('Machine reset', 'info');

        if (this.onReset) {
            this.onReset();
        }
    }

    /**
     * Update execution state
     */
    updateState(updates: Partial<ExecutionState>): void {
        this.state = { ...this.state, ...updates };
        this.updateStatusDisplay();
        this.updateButtonStates();
    }

    /**
     * Update status display
     */
    private updateStatusDisplay(): void {
        if (!this.statusEl) return;

        const statusText = this.getStatusText();
        const statusColor = this.getStatusColor();

        this.statusEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #858585;">Status:</span>
                <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span>
            </div>
            ${this.state.currentNode ? `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: #858585;">Current Node:</span>
                    <span style="color: #4ec9b0;">${this.state.currentNode}</span>
                </div>
            ` : ''}
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #858585;">Steps:</span>
                <span style="color: #d4d4d4;">${this.state.stepCount}</span>
            </div>
        `;
    }

    /**
     * Get status text
     */
    private getStatusText(): string {
        switch (this.state.status) {
            case 'idle': return 'Not Running';
            case 'running': return 'Running';
            case 'stepping': return 'Step Mode';
            case 'complete': return 'Complete';
            case 'error': return 'Error';
            default: return 'Unknown';
        }
    }

    /**
     * Get status color
     */
    private getStatusColor(): string {
        switch (this.state.status) {
            case 'idle': return '#858585';
            case 'running': return '#4ec9b0';
            case 'stepping': return '#ffa500';
            case 'complete': return '#4ec9b0';
            case 'error': return '#f48771';
            default: return '#858585';
        }
    }

    /**
     * Update button states
     */
    private updateButtonStates(): void {
        if (!this.btnExecute || !this.btnStep || !this.btnStop || !this.btnReset) return;

        const { status } = this.state;

        this.btnExecute.disabled = status === 'running' || status === 'stepping';
        this.btnStep.disabled = status === 'running';
        this.btnStop.disabled = status === 'idle';
        this.btnReset.disabled = false;

        // Update disabled button styles
        [this.btnExecute, this.btnStep, this.btnStop, this.btnReset].forEach(btn => {
            if (btn.disabled) {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
    }

    /**
     * Add log entry
     */
    addLogEntry(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        if (!this.logEl) return;

        const logContent = this.logEl.querySelector('#execution-log-content');
        if (!logContent) return;

        const entry = document.createElement('div');
        entry.style.cssText = `
            margin-bottom: 4px;
            color: ${this.getLogColor(type)};
        `;

        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `
            <span style="color: #858585;">[${timestamp}]</span>
            <span>${message}</span>
        `;

        logContent.appendChild(entry);

        // Auto-scroll to bottom
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    /**
     * Get log color
     */
    private getLogColor(type: 'info' | 'success' | 'warning' | 'error'): string {
        switch (type) {
            case 'info': return '#d4d4d4';
            case 'success': return '#4ec9b0';
            case 'warning': return '#ffa500';
            case 'error': return '#f48771';
            default: return '#d4d4d4';
        }
    }

    /**
     * Get current state
     */
    getState(): ExecutionState {
        return { ...this.state };
    }

    /**
     * Clear log
     */
    clearLog(): void {
        if (!this.logEl) return;

        const logContent = this.logEl.querySelector('#execution-log-content');
        if (logContent) {
            logContent.innerHTML = '';
        }
    }
}
