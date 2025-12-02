//@ts-check
import * as esbuild from 'esbuild';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const success = watch ? 'Watch build succeeded' : 'Build succeeded';

function getTime() {
    const date = new Date();
    return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
    return i.toString().padStart(2, '0');
}

const plugins = [
    importMetaUrlPlugin,
    {
        name: 'watch-plugin',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length === 0) {
                    console.log(getTime() + success);
                }
            });
        },
    }
];

// Build CLI only
const ctx = await esbuild.context({
    entryPoints: ['src/cli/main.ts'],
    outdir: 'out/cli',
    bundle: true,
    target: "ES2017",
    format: 'cjs',
    outExtension: {
        '.js': '.cjs'
    },
    loader: { '.ts': 'ts' },
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

if (watch) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    ctx.dispose();
    console.log('✓ CLI built successfully to out/cli/main.cjs');
}
