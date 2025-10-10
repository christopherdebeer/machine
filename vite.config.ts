/* eslint-disable header/header */
import { defineConfig } from 'vite';
import * as path from 'path';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(() => {
    const config = {
        base: '/machine/',
        build: {
            target: 'esnext',
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'index.html'),
                    playground: path.resolve(__dirname, 'playground.html'),
                    'playground-mobile': path.resolve(__dirname, 'playground-mobile.html'),
                    'quick-start': path.resolve(__dirname, 'quick-start.html'),
                    'grammar-reference': path.resolve(__dirname, 'grammar-reference.html'),
                    examples: path.resolve(__dirname, 'examples.html'),
                    integration: path.resolve(__dirname, 'integration.html'),
                    'vscode-extension': path.resolve(__dirname, 'vscode-extension.html'),
                    evolution: path.resolve(__dirname, 'evolution.html'),
                    api: path.resolve(__dirname, 'api.html'),
                    libraries: path.resolve(__dirname, 'libraries.html'),
                    blog: path.resolve(__dirname, 'blog.html'),
                    events: path.resolve(__dirname, 'events.html'),
                },
            },
            outDir: 'dist'
        },

        plugins: [
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
                        src: 'examples/phase2',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/phase3',
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
                        src: 'examples/*.mach',
                        dest: 'examples'
                    },
                    {
                        src: 'examples/README.md',
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
