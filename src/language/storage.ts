/**
 * Browser-compatible storage facade for machine persistence
 * Supports IndexedDB, localStorage, and in-memory storage
 */

import type { MachineJSON as MachineData, MachineMutation } from './json/types.js';

export interface MachineVersion {
    version: string;
    timestamp: string;
    machine_data: MachineData;
    mutations_since_last: MachineMutation[];
    performance_metrics: PerformanceMetrics;
    parent_version?: string;
}

export interface PerformanceMetrics {
    avg_execution_time_ms: number;
    success_rate: number;
    cost_per_execution: number;
    execution_count: number;
}

export interface LearnedPattern {
    name: string;
    description: string;
    version: string;
    code: string;
    input_schema?: any;
    output_schema?: any;
    performance_metrics: PerformanceMetrics;
    trained_on: {
        machine_id: string;
        task_name: string;
        training_samples: number;
    };
}

/**
 * Storage backend interface
 */
export interface StorageBackend {
    // Machine versioning
    saveMachineVersion(key: string, version: MachineVersion): Promise<void>;
    loadMachineVersion(key: string): Promise<MachineVersion | null>;
    listMachineVersions(machineId: string): Promise<string[]>;

    // Generated code
    saveCode(path: string, code: string): Promise<void>;
    loadCode(path: string): Promise<string | null>;

    // Learned patterns
    savePattern(pattern: LearnedPattern): Promise<void>;
    loadPattern(name: string, version?: string): Promise<LearnedPattern | null>;
    listPatterns(): Promise<LearnedPattern[]>;

    // General storage
    save(key: string, data: any): Promise<void>;
    load(key: string): Promise<any>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}

/**
 * IndexedDB storage backend (browser)
 */
export class IndexedDBStorage implements StorageBackend {
    private dbName: string;
    private dbVersion: number;
    private db: IDBDatabase | null = null;

    constructor(dbName: string = 'machine-storage', dbVersion: number = 1) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
    }

    private async getDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object stores
                if (!db.objectStoreNames.contains('versions')) {
                    db.createObjectStore('versions', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('code')) {
                    db.createObjectStore('code', { keyPath: 'path' });
                }
                if (!db.objectStoreNames.contains('patterns')) {
                    const patternStore = db.createObjectStore('patterns', { keyPath: 'id' });
                    patternStore.createIndex('name', 'name', { unique: false });
                }
                if (!db.objectStoreNames.contains('general')) {
                    db.createObjectStore('general', { keyPath: 'key' });
                }
            };
        });
    }

    async saveMachineVersion(key: string, version: MachineVersion): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['versions'], 'readwrite');
            const store = transaction.objectStore('versions');
            const request = store.put({ key, ...version });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async loadMachineVersion(key: string): Promise<MachineVersion | null> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['versions'], 'readonly');
            const store = transaction.objectStore('versions');
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const result = request.result;
                if (!result) {
                    resolve(null);
                } else {
                    const { key: _, ...version } = result;
                    resolve(version as MachineVersion);
                }
            };
        });
    }

    async listMachineVersions(machineId: string): Promise<string[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['versions'], 'readonly');
            const store = transaction.objectStore('versions');
            const request = store.getAllKeys();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const keys = request.result as string[];
                resolve(keys.filter(k => k.startsWith(`machine_${machineId}_`)));
            };
        });
    }

    async saveCode(path: string, code: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['code'], 'readwrite');
            const store = transaction.objectStore('code');
            const request = store.put({ path, code });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async loadCode(path: string): Promise<string | null> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['code'], 'readonly');
            const store = transaction.objectStore('code');
            const request = store.get(path);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result?.code || null);
        });
    }

    async savePattern(pattern: LearnedPattern): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['patterns'], 'readwrite');
            const store = transaction.objectStore('patterns');
            const id = `${pattern.name}_${pattern.version}`;
            const request = store.put({ id, ...pattern });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async loadPattern(name: string, version?: string): Promise<LearnedPattern | null> {
        const db = await this.getDB();

        if (version) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['patterns'], 'readonly');
                const store = transaction.objectStore('patterns');
                const id = `${name}_${version}`;
                const request = store.get(id);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const result = request.result;
                    if (!result) {
                        resolve(null);
                    } else {
                        const { id: _, ...pattern } = result;
                        resolve(pattern as LearnedPattern);
                    }
                };
            });
        } else {
            // Get latest version
            const patterns = await this.listPatterns();
            const matching = patterns.filter(p => p.name === name);
            if (matching.length === 0) return null;

            // Return pattern with highest success rate
            return matching.reduce((best, current) =>
                current.performance_metrics.success_rate > best.performance_metrics.success_rate
                    ? current
                    : best
            );
        }
    }

    async listPatterns(): Promise<LearnedPattern[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['patterns'], 'readonly');
            const store = transaction.objectStore('patterns');
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const results = request.result;
                const patterns = results.map((r: any) => {
                    const { id, ...pattern } = r;
                    return pattern as LearnedPattern;
                });
                resolve(patterns);
            };
        });
    }

    async save(key: string, data: any): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['general'], 'readwrite');
            const store = transaction.objectStore('general');
            const request = store.put({ key, data });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async load(key: string): Promise<any> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['general'], 'readonly');
            const store = transaction.objectStore('general');
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result?.data || null);
        });
    }

    async delete(key: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['general'], 'readwrite');
            const store = transaction.objectStore('general');
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async clear(): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['versions', 'code', 'patterns', 'general'], 'readwrite');

            let completed = 0;
            const stores = ['versions', 'code', 'patterns', 'general'];

            stores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    completed++;
                    if (completed === stores.length) resolve();
                };
            });
        });
    }
}

/**
 * localStorage storage backend (browser fallback)
 */
export class LocalStorageBackend implements StorageBackend {
    private prefix: string;

    constructor(prefix: string = 'machine:') {
        this.prefix = prefix;
    }

    private getKey(key: string): string {
        return `${this.prefix}${key}`;
    }

    async saveMachineVersion(key: string, version: MachineVersion): Promise<void> {
        localStorage.setItem(this.getKey(`version:${key}`), JSON.stringify(version));
    }

    async loadMachineVersion(key: string): Promise<MachineVersion | null> {
        const data = localStorage.getItem(this.getKey(`version:${key}`));
        return data ? JSON.parse(data) : null;
    }

    async listMachineVersions(machineId: string): Promise<string[]> {
        const keys: string[] = [];
        const searchPrefix = this.getKey(`version:machine_${machineId}_`);

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(searchPrefix)) {
                keys.push(key.replace(this.getKey('version:'), ''));
            }
        }

        return keys;
    }

    async saveCode(path: string, code: string): Promise<void> {
        localStorage.setItem(this.getKey(`code:${path}`), code);
    }

    async loadCode(path: string): Promise<string | null> {
        return localStorage.getItem(this.getKey(`code:${path}`));
    }

    async savePattern(pattern: LearnedPattern): Promise<void> {
        const id = `${pattern.name}_${pattern.version}`;
        localStorage.setItem(this.getKey(`pattern:${id}`), JSON.stringify(pattern));
    }

    async loadPattern(name: string, version?: string): Promise<LearnedPattern | null> {
        if (version) {
            const id = `${name}_${version}`;
            const data = localStorage.getItem(this.getKey(`pattern:${id}`));
            return data ? JSON.parse(data) : null;
        } else {
            const patterns = await this.listPatterns();
            const matching = patterns.filter(p => p.name === name);
            if (matching.length === 0) return null;

            return matching.reduce((best, current) =>
                current.performance_metrics.success_rate > best.performance_metrics.success_rate
                    ? current
                    : best
            );
        }
    }

    async listPatterns(): Promise<LearnedPattern[]> {
        const patterns: LearnedPattern[] = [];
        const searchPrefix = this.getKey('pattern:');

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(searchPrefix)) {
                const data = localStorage.getItem(key);
                if (data) {
                    patterns.push(JSON.parse(data));
                }
            }
        }

        return patterns;
    }

    async save(key: string, data: any): Promise<void> {
        localStorage.setItem(this.getKey(key), JSON.stringify(data));
    }

    async load(key: string): Promise<any> {
        const data = localStorage.getItem(this.getKey(key));
        return data ? JSON.parse(data) : null;
    }

    async delete(key: string): Promise<void> {
        localStorage.removeItem(this.getKey(key));
    }

    async clear(): Promise<void> {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.prefix)) {
                keys.push(key);
            }
        }
        keys.forEach(key => localStorage.removeItem(key));
    }
}

/**
 * In-memory storage backend (for Node.js or testing)
 */
export class MemoryStorage implements StorageBackend {
    private storage: Map<string, any> = new Map();

    async saveMachineVersion(key: string, version: MachineVersion): Promise<void> {
        this.storage.set(`version:${key}`, version);
    }

    async loadMachineVersion(key: string): Promise<MachineVersion | null> {
        return this.storage.get(`version:${key}`) || null;
    }

    async listMachineVersions(machineId: string): Promise<string[]> {
        const keys: string[] = [];
        const searchPrefix = `version:machine_${machineId}_`;

        for (const [key] of this.storage.entries()) {
            if (key.startsWith(searchPrefix)) {
                // Return the full machine version key without the "version:" prefix
                keys.push(key.substring('version:'.length));
            }
        }

        return keys;
    }

    async saveCode(path: string, code: string): Promise<void> {
        this.storage.set(`code:${path}`, code);
    }

    async loadCode(path: string): Promise<string | null> {
        return this.storage.get(`code:${path}`) || null;
    }

    async savePattern(pattern: LearnedPattern): Promise<void> {
        const id = `${pattern.name}_${pattern.version}`;
        this.storage.set(`pattern:${id}`, pattern);
    }

    async loadPattern(name: string, version?: string): Promise<LearnedPattern | null> {
        if (version) {
            const id = `${name}_${version}`;
            return this.storage.get(`pattern:${id}`) || null;
        } else {
            const patterns = await this.listPatterns();
            const matching = patterns.filter(p => p.name === name);
            if (matching.length === 0) return null;

            return matching.reduce((best, current) =>
                current.performance_metrics.success_rate > best.performance_metrics.success_rate
                    ? current
                    : best
            );
        }
    }

    async listPatterns(): Promise<LearnedPattern[]> {
        const patterns: LearnedPattern[] = [];

        for (const [key, value] of this.storage.entries()) {
            if (key.startsWith('pattern:')) {
                patterns.push(value);
            }
        }

        return patterns;
    }

    async save(key: string, data: any): Promise<void> {
        this.storage.set(key, data);
    }

    async load(key: string): Promise<any> {
        return this.storage.get(key) || null;
    }

    async delete(key: string): Promise<void> {
        this.storage.delete(key);
    }

    async clear(): Promise<void> {
        this.storage.clear();
    }
}

/**
 * Storage factory - automatically selects the best storage backend
 */
export function createStorage(preferredBackend?: 'indexeddb' | 'localstorage' | 'memory'): StorageBackend {
    // Check if we're in a browser environment
    const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

    if (preferredBackend === 'memory' || !isBrowser) {
        return new MemoryStorage();
    }

    if (preferredBackend === 'localstorage' || typeof indexedDB === 'undefined') {
        return new LocalStorageBackend();
    }

    return new IndexedDBStorage();
}
