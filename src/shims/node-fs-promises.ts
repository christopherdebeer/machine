/**
 * Browser shim for Node.js 'fs/promises' module
 * Provides no-op implementations to prevent import errors in browser builds
 */

export const readFile = async (): Promise<string> => '';
export const writeFile = async (): Promise<void> => {};
export const mkdir = async (): Promise<void> => {};
export const readdir = async (): Promise<string[]> => [];
export const stat = async (): Promise<any> => ({
    isFile: () => false,
    isDirectory: () => false
});
export const access = async (): Promise<void> => {};

export default {
    readFile,
    writeFile,
    mkdir,
    readdir,
    stat,
    access
};
