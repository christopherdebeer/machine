/* eslint-disable header/header */
import { defineConfig } from 'vite';
import * as path from 'path';
import * as fs from 'fs';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

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

export default defineConfig(() => {
    const config = {
        base: process.env.VITE_BASE_URL || '/machine/',
        build: {
            target: 'esnext',
            minify: 'esbuild',
            cssMinify: true,
            rollupOptions: {
                input: getHtmlEntries(),
            },
            outDir: 'dist'
        },

        plugins: [
            { enforce: 'pre', ...mdx() },
            react(),
            viteStaticCopy({
                targets: [
                    {
                        src: 'static/styles.css',
                        dest: 'static'
                    },
                    {
                        src: 'static/styles/*',
                        dest: 'static/styles'
                    },
                    {
                        src: 'examples/attributes',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/basic',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/complex',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/edge-cases',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/edges',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/nesting',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/advanced',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/documentation',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/validation',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/context',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/stress',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/workflows',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/meta-programming',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/rails',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/model-configuration',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/README.md',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/generated',
                        dest: 'examples'
                    }
                ]
            })
        ],
        resolve: {
            dedupe: ['vscode']
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
