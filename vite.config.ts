/* eslint-disable header/header */
import { defineConfig } from 'vite';
import * as path from 'path';
import * as fs from 'fs';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkLinkRewrite from './scripts/remark-link-rewrite.js';

/**
 * Dynamically scan for HTML entry files
 */
function getHtmlEntries() {
    const entries: Record<string, string> = {};
    const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

    for (const file of htmlFiles) {
        const name = path.basename(file, '.html');
        // Convert kebab-case to camelCase for entry key
        const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        entries[key] = path.resolve(__dirname, file);
    }

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
                    remarkPlugins: [remarkLinkRewrite]
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
