import chalk from 'chalk';

export type LogLevel = 'quiet' | 'normal' | 'verbose';

export class Logger {
    private level: LogLevel;

    constructor(level: LogLevel = 'normal') {
        this.level = level;
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    info(message: string): void {
        if (this.level !== 'quiet') {
            console.log(message);
        }
    }

    success(message: string): void {
        if (this.level !== 'quiet') {
            console.log(chalk.green(message));
        }
    }

    warn(message: string): void {
        if (this.level !== 'quiet') {
            console.log(chalk.yellow(message));
        }
    }

    error(message: string): void {
        // Always show errors, even in quiet mode
        console.error(chalk.red(message));
    }

    debug(message: string): void {
        if (this.level === 'verbose') {
            console.log(chalk.gray(message));
        }
    }

    tip(message: string): void {
        if (this.level !== 'quiet') {
            console.log(chalk.blue(message));
        }
    }

    heading(message: string): void {
        if (this.level !== 'quiet') {
            console.log(chalk.bold(message));
        }
    }

    // Special method for outputting content (when no destination specified)
    output(content: string): void {
        console.log(content);
    }
}

// Global logger instance
export const logger = new Logger();
