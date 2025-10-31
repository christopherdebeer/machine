/* eslint-disable header/header */
import { defineConfig } from 'vite';
import * as path from 'path';
import * as fs from 'fs';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkLinkRewrite from './scripts/remark-link-rewrite.js';
import remarkEscapeAngleBrackets from './scripts/remark-escape-angle-brackets.js';
import remarkSlug from 'remark-slug';
import remarkToc from 'remark-toc';
import { apiPlugin } from './vite-plugin-api';

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
                // Skip node_modules, dist, test-output, and hidden directories
                if (item.name === 'node_modules' || item.name === 'dist' || item.name === 'test-output' || item.name.startsWith('.')) {
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
    ];

    // Dynamically scan examples directory and include all subdirectories
    const examplesDir = path.join(__dirname, 'examples');
    if (fs.existsSync(examplesDir)) {
        const exampleContents = fs.readdirSync(examplesDir, { withFileTypes: true });
        for (const item of exampleContents) {
            // Only include directories, not files like index.html
            if (item.isDirectory()) {
                targets.push({ src: `examples/${item.name}`, dest: 'examples' });
            }
        }
    }

    // Only include test-output if it exists
    const testOutputDir = path.join(__dirname, 'test-output');
    if (fs.existsSync(testOutputDir)) {
        // Copy the index.html file specifically if it exists
        const indexPath = path.join(testOutputDir, 'index.html');
        if (fs.existsSync(indexPath)) {
            targets.push({ src: 'test-output/index.html', dest: 'test-output' });
        }

        // Copy subdirectories individually to maintain structure
        const testOutputContents = fs.readdirSync(testOutputDir, { withFileTypes: true });
        for (const item of testOutputContents) {
            if (item.isDirectory()) {
                targets.push({ src: `test-output/${item.name}`, dest: `test-output` });
            }
        }
    }

    console.log(targets)

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
            apiPlugin(),
            {
                enforce: 'pre',
                ...mdx({
                    remarkPlugins: [
                        // remarkEscapeAngleBrackets,
                        remarkLinkRewrite,
                        remarkSlug,
                        [remarkToc, { maxDepth: 3, tight: true }]
                    ]
                })
            },
            react({
                babel: {
                    plugins: [
                        [
                            'babel-plugin-styled-components',
                            {
                                displayName: true,
                                fileName: true,
                                ssr: false,
                                meaninglessFileNames: ['index', 'styles'],
                            }
                        ]
                    ]
                }
            }),
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
