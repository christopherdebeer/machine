/* eslint-disable header/header */
import { defineConfig } from 'vite';
import * as path from 'path';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

export default defineConfig(() => {
    const config = {
        base: '/machine/',
        build: {
            target: 'esnext',
            minify: 'esbuild',
            cssMinify: true,
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
                    'language-overview': path.resolve(__dirname, 'language-overview.html'),
                    'syntax-guide': path.resolve(__dirname, 'syntax-guide.html'),
                    'advanced-features': path.resolve(__dirname, 'advanced-features.html'),
                    'runtime-and-evolution': path.resolve(__dirname, 'runtime-and-evolution.html'),
                    'context-and-schema-guide': path.resolve(__dirname, 'context-and-schema-guide.html'),
                    'testing-approach': path.resolve(__dirname, 'testing-approach.html'),
                    'examples-index': path.resolve(__dirname, 'examples-index.html'),
                    'meta-programming': path.resolve(__dirname, 'meta-programming.html'),
                    'documentation': path.resolve(__dirname, 'documentation.html'),
                    'faq': path.resolve(__dirname, 'faq.html'),
                    'troubleshooting': path.resolve(__dirname, 'troubleshooting.html'),
                    'support': path.resolve(__dirname, 'support.html'),
                    'installation': path.resolve(__dirname, 'installation.html'),
                    'cli-reference': path.resolve(__dirname, 'cli-reference.html'),
                },
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
