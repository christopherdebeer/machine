/**
 * Browser shim for Node.js 'fs' module
 * Provides no-op implementations to prevent import errors in browser builds
 */

export const existsSync = (): boolean => false;
export const mkdirSync = (): void => {};
export const writeFileSync = (): void => {};
export const readFileSync = (): string => '';
export const readdirSync = (): string[] => [];

// Promises API shim
export const promises = {
    readFile: async (): Promise<string> => '',
    writeFile: async (): Promise<void> => {},
    mkdir: async (): Promise<void> => {},
    readdir: async (): Promise<string[]> => [],
    stat: async (): Promise<any> => ({ isDirectory: () => false, isFile: () => false })
};

export default {
    existsSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    readdirSync,
    promises
};
