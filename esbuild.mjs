//@ts-check
import * as esbuild from 'esbuild';

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

const plugins = [{
    name: 'watch-plugin',
    setup(build) {
        build.onEnd(result => {
            if (result.errors.length === 0) {
                console.log(getTime() + success);
            }
        });
    },
}];

// Build VSCode extension and language server
const ctx = await esbuild.context({
    // Entry points for the vscode extension and the language server
    entryPoints: ['src/extension/main.ts', 'src/language/main.ts', 'src/cli/main.ts'],
    outdir: 'out',
    bundle: true,
    target: "ES2017",
    // VSCode's extension host is still using cjs, so we need to transform the code
    format: 'cjs',
    // To prevent confusing node, we explicitly use the `.cjs` extension
    outExtension: {
        '.js': '.cjs'
    },
    loader: { '.ts': 'ts' },
    external: ['vscode'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

// Build web-compatible executor
const webExecCtx = await esbuild.context({
    entryPoints: ['src/language/machine-executor-web.ts'],
    outdir: 'out/extension/web',
    bundle: true,
    target: "ES2017",
    format: 'esm',
    loader: { '.ts': 'ts' },
    platform: 'browser',
    sourcemap: !minify,
    minify,
    plugins,
    define: {
        'process.env.NODE_ENV': '"production"'
    }
});
// Build web-compatible executor
const webCtx = await esbuild.context({
    entryPoints: ['src/wev/index.ts'],
    outdir: 'out/web',
    bundle: true,
    target: "ES2017",
    format: 'esm',
    loader: { '.ts': 'ts' },
    platform: 'browser',
    sourcemap: !minify,
    minify,
    plugins,
    define: {
        'process.env.NODE_ENV': '"production"'
    }
});

if (watch) {
    await ctx.watch();
    await webCtx.watch();
    await webExecCtx.watch();
} else {
    await ctx.rebuild();
    await webCtx.rebuild();
    await webExecCtx.rebuild();
    ctx.dispose();
    webCtx.dispose();
    webExecCtx.dispose();
}
