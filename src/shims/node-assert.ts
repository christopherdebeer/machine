/**
 * Browser shim for Node.js 'assert' module
 * Provides no-op implementations to prevent import errors in browser builds
 */

export function strict(value: any, message?: string): void {
    if (!value) {
        console.error('Assertion failed:', message);
    }
}

export function deepStrictEqual(actual: any, expected: any, message?: string): void {
    // Simple no-op for browser - the real assertions are for Node.js tests only
    console.debug('deepStrictEqual called in browser (no-op)', { actual, expected, message });
}

export function fail(message?: string): never {
    throw new Error(message || 'Assertion failed');
}

export function ok(value: any, message?: string): void {
    if (!value) {
        console.error('Assertion failed:', message);
    }
}

export default {
    strict,
    deepStrictEqual,
    fail,
    ok
};
