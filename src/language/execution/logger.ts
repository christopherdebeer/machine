/**
 * Execution Logger
 * Provides structured logging for execution flow and state changes
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';
export type LogCategory = 'execution' | 'transition' | 'context' | 'path' | 'safety' | 'annotation' | 'sync' | 'error';

export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    category: LogCategory;
    message: string;
    data?: Record<string, any>;
}

export interface LoggerOptions {
    level?: LogLevel;
    maxEntries?: number;
    onLog?: (entry: LogEntry) => void;
}

/**
 * Logger for execution flow with configurable log levels
 */
export class ExecutionLogger {
    private level: LogLevel;
    private entries: LogEntry[] = [];
    private maxEntries: number;
    private onLog?: (entry: LogEntry) => void;
    private externalOnLog?: (entry: LogEntry) => void;

    // Log level hierarchy for filtering
    private static readonly LEVELS: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
        none: 4
    };

    constructor(options: LoggerOptions = {}) {
        this.level = options.level || 'info';
        this.maxEntries = options.maxEntries || 1000;
        this.onLog = options.onLog;
    }

    /**
     * Set the log level
     */
    setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * Get current log level
     */
    getLevel(): LogLevel {
        return this.level;
    }

    /**
     * Check if a log level should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        return ExecutionLogger.LEVELS[level] >= ExecutionLogger.LEVELS[this.level];
    }

    /**
     * Set external log callback for reactive updates
     */
    setOnLogCallback(callback?: (entry: LogEntry) => void): void {
        this.externalOnLog = callback;
    }

    /**
     * Log a message at the specified level
     */
    private log(level: LogLevel, category: LogCategory, message: string, data?: Record<string, any>): void {
        console.log(`[ExecutionLogger] ${level} [${category}] ${message}`, data)
        if (!this.shouldLog(level)) {
            return;
        }

        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            category,
            message,
            data
        };

        // Add to entries (with size limit)
        this.entries.push(entry);
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }

        // Call external handlers if provided
        if (this.onLog) {
            this.onLog(entry);
        }
        
        if (this.externalOnLog) {
            this.externalOnLog(entry);
        }
    }

    /**
     * Log debug message
     */
    debug(category: LogCategory, message: string, data?: Record<string, any>): void {
        this.log('debug', category, message, data);
    }

    /**
     * Log info message
     */
    info(category: LogCategory, message: string, data?: Record<string, any>): void {
        this.log('info', category, message, data);
    }

    /**
     * Log warning message
     */
    warn(category: LogCategory, message: string, data?: Record<string, any>): void {
        this.log('warn', category, message, data);
    }

    /**
     * Log error message
     */
    error(category: LogCategory, message: string, data?: Record<string, any>): void {
        this.log('error', category, message, data);
    }

    /**
     * Get all log entries
     */
    getEntries(): LogEntry[] {
        return [...this.entries];
    }

    /**
     * Get entries filtered by level and/or category
     */
    getFilteredEntries(filters?: { level?: LogLevel; category?: LogCategory }): LogEntry[] {
        let filtered = this.entries;

        if (filters?.level) {
            const minLevel = ExecutionLogger.LEVELS[filters.level];
            filtered = filtered.filter(e => ExecutionLogger.LEVELS[e.level] >= minLevel);
        }

        if (filters?.category) {
            filtered = filtered.filter(e => e.category === filters.category);
        }

        return filtered;
    }

    /**
     * Clear all log entries
     */
    clear(): void {
        this.entries = [];
    }

    /**
     * Format log entry for display
     */
    static formatEntry(entry: LogEntry): string {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const level = entry.level.toUpperCase().padEnd(5);
        const category = entry.category.padEnd(10);
        let result = `[${time}] ${level} [${category}] ${entry.message}`;

        if (entry.data && Object.keys(entry.data).length > 0) {
            result += ` ${JSON.stringify(entry.data)}`;
        }

        return result;
    }

    /**
     * Export logs as JSON
     */
    export(): string {
        return JSON.stringify(this.entries, null, 2);
    }

    /**
     * Import logs from JSON
     */
    import(json: string): void {
        try {
            const entries = JSON.parse(json);
            if (Array.isArray(entries)) {
                this.entries = entries;
            }
        } catch (e) {
            this.error('error', 'Failed to import logs', { error: String(e) });
        }
    }
}
