/**
 * Browser shim for Node.js 'fs' module
 * Provides no-op implementations to prevent import errors in browser builds
 */

export const existsSync = (): boolean => false;
export const mkdirSync = (): void => {};
export const writeFileSync = (): void => {};
export const readFileSync = (): string => '';
export const readdirSync = (): string[] => [];

export default {
    existsSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    readdirSync
};
