/**
 * Browser shim for Node.js 'worker_threads' module
 * Provides no-op implementations to prevent import errors in browser builds
 */

export class Worker {
    constructor(filename: string | URL, options?: any) {
        console.warn('Worker threads are not supported in browser environment');
    }

    postMessage(value: any): void {
        console.warn('Worker.postMessage called in browser (no-op)');
    }

    terminate(): void {
        console.warn('Worker.terminate called in browser (no-op)');
    }

    on(event: string, listener: (...args: any[]) => void): this {
        console.warn('Worker.on called in browser (no-op)');
        return this;
    }

    once(event: string, listener: (...args: any[]) => void): this {
        console.warn('Worker.once called in browser (no-op)');
        return this;
    }
}

export const isMainThread = true;
export const parentPort = null;
export const threadId = 0;

export default {
    Worker,
    isMainThread,
    parentPort,
    threadId
};
