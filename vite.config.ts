/* eslint-disable header/header */
import { defineConfig } from 'vite';
import * as path from 'path';
import * as fs from 'fs';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkLinkRewrite from './scripts/remark-link-rewrite.js';
import remarkTOC from './scripts/remark-toc.js';

/**
 * Dynamically scan for HTML entry files (including subdirectories)
 */
function getHtmlEntries() {
    const entries: Record<string, string> = {};

    function scanDirectory(dir: string, basePath: string = '') {
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
                // Skip node_modules, dist, and hidden directories
                if (item.name === 'node_modules' || item.name === 'dist' || item.name.startsWith('.')) {
                    continue;
                }
                scanDirectory(fullPath, path.join(basePath, item.name));
            } else if (item.isFile() && item.name.endsWith('.html')) {
                // Create entry key from path
                const relativePath = path.join(basePath, item.name);
                const name = path.basename(item.name, '.html');
                const dirPrefix = basePath ? basePath.replace(/[\/\\]/g, '-') + '-' : '';
                const entryName = dirPrefix + name;

                // Convert kebab-case to camelCase for entry key
                const key = entryName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                entries[key] = path.resolve(dir, item.name);
            }
        }
    }

    scanDirectory(__dirname);
    return entries;
}

/**
 * Get static copy targets, including test-output if it exists
 */
function getStaticCopyTargets() {
    const targets = [
        { src: 'static/styles.css', dest: 'static' },
        { src: 'static/styles/*', dest: 'static/styles' },
        { src: 'examples/attributes', dest: 'examples' },
        { src: 'examples/basic', dest: 'examples' },
        { src: 'examples/complex', dest: 'examples' },
        { src: 'examples/edge-cases', dest: 'examples' },
        { src: 'examples/edges', dest: 'examples' },
        { src: 'examples/nesting', dest: 'examples' },
        { src: 'examples/advanced', dest: 'examples' },
        { src: 'examples/documentation', dest: 'examples' },
        { src: 'examples/validation', dest: 'examples' },
        { src: 'examples/context', dest: 'examples' },
        { src: 'examples/stress', dest: 'examples' },
        { src: 'examples/workflows', dest: 'examples' },
        { src: 'examples/meta-programming', dest: 'examples' },
        { src: 'examples/rails', dest: 'examples' },
        { src: 'examples/model-configuration', dest: 'examples' },
    ];

    // Only include test-output if it exists
    const testOutputDir = path.join(__dirname, 'test-output');
    if (fs.existsSync(testOutputDir)) {
        targets.push({ src: 'test-output/**/*', dest: 'test-output' });
    }

    return targets;
}

export default defineConfig(() => {
    const config = {
        base: process.env.VITE_BASE_URL || '/machine/',
        build: {
            target: 'esnext',
            minify: 'esbuild',
            cssMinify: true,
            rollupOptions: {
                input: getHtmlEntries(),
                output: {
                    // Use 'es' format for workers to support code-splitting
                    format: 'es'
                }
            },
            outDir: 'dist'
        },
        worker: {
            format: 'es',
            rollupOptions: {
                output: {
                    format: 'es'
                }
            }
        },
        plugins: [
            {
                enforce: 'pre',
                ...mdx({
                    remarkPlugins: [remarkLinkRewrite, remarkTOC]
                })
            },
            react(),
            viteStaticCopy({
                targets: getStaticCopyTargets()
            })
        ],
        resolve: {
            dedupe: ['vscode'],
            alias: {
                'node:fs/promises': path.resolve(__dirname, 'src/shims/node-fs-promises.ts'),
                'node:fs': path.resolve(__dirname, 'src/shims/node-fs.ts'),
                'node:path': path.resolve(__dirname, 'src/shims/node-path.ts'),
                'fs/promises': path.resolve(__dirname, 'src/shims/node-fs-promises.ts'),
                'fs': path.resolve(__dirname, 'src/shims/node-fs.ts'),
                'path': path.resolve(__dirname, 'src/shims/node-path.ts')
            }
        },
        optimizeDeps: {
            esbuildOptions: {
                plugins: [
                    importMetaUrlPlugin
                ]
            }
        },
        server: {
            port: 5173
        }
    };
    return config;
});
