/**
 * Browser shim for Node.js 'path' module
 * Provides minimal implementations to prevent import errors in browser builds
 */

export const join = (...args: string[]): string => args.filter(Boolean).join('/');
export const resolve = (...args: string[]): string => args.filter(Boolean).join('/');
export const dirname = (p: string): string => {
    const parts = p.split('/');
    return parts.slice(0, -1).join('/') || '/';
};
export const basename = (p: string, ext?: string): string => {
    const parts = p.split('/');
    let name = parts[parts.length - 1] || '';
    if (ext && name.endsWith(ext)) {
        name = name.slice(0, -ext.length);
    }
    return name;
};

export default {
    join,
    resolve,
    dirname,
    basename
};
