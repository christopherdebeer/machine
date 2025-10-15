#!/usr/bin/env node

import { readdir, writeFile, stat } from 'fs/promises';
import { join, basename, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Convert filename to title case
 */
function toTitleCase(str) {
    return str
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
        .split(' ')
        .filter(word => word.length > 0)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Generate HTML entry file
 */
function generateHTML(pageName, title) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DyGram | ${title}</title>
    <link rel="stylesheet" href="static/styles/main.css">
    <link rel="icon" type="image/jpeg" href="icon.jpg">
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/pages/${pageName}.tsx"></script>
</body>
</html>
`;
}

/**
 * Generate TypeScript entry file
 */
function generateTSX(pageName, mdxPath, projectRoot) {
    const importName = basename(mdxPath, '.mdx');
    // Calculate relative path from src/pages/ to the MDX file
    const srcPagesDir = join(projectRoot, 'src', 'pages');
    const absoluteMdxPath = join(projectRoot, mdxPath);
    const relativeMdxPath = relative(srcPagesDir, absoluteMdxPath).replace(/\\/g, '/');

    return `import React from 'react';
import ReactDOM from 'react-dom/client';
import Content from '${relativeMdxPath}';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <Content />
    </React.StrictMode>
);
`;
}

/**
 * Scan for MDX files and generate entries
 */
async function scanForPages(docsDir, projectRoot) {
    const pages = new Map();

    // Recursively scan docs directory
    async function scan(dir, basePath = '') {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = join(basePath, entry.name);

            if (entry.isDirectory()) {
                // Skip archive
                if (entry.name === 'archive') continue;
                await scan(fullPath, relativePath);
            } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
                const baseName = basename(entry.name, '.mdx');
                let pageName, title;

                if (baseName === 'index') {
                    // index.mdx in subdirectory
                    const parentDir = basename(dirname(fullPath));
                    if (parentDir === 'docs') {
                        // docs/index.mdx → documentation.html
                        pageName = 'documentation';
                        title = 'Documentation';
                    } else {
                        // docs/examples/index.mdx → examples-index.html
                        pageName = `${parentDir}-index`;
                        title = toTitleCase(parentDir) + ' Index';
                    }
                } else {
                    // Convert PascalCase/camelCase to kebab-case for HTML filename
                    pageName = baseName
                        .replace(/([A-Z])/g, '-$1')
                        .toLowerCase()
                        .replace(/^-/, '');
                    title = toTitleCase(baseName);
                }

                pages.set(pageName, {
                    htmlFile: `${pageName}.html`,
                    tsxFile: `${pageName}.tsx`,
                    mdxPath: relative(projectRoot, fullPath),
                    title
                });
            }
        }
    }

    await scan(docsDir);
    return pages;
}

/**
 * Generate all HTML and TSX entry files
 */
async function generateEntries(pages, projectRoot) {
    console.log('Generating HTML entry files...');

    const pagesDir = join(projectRoot, 'src', 'pages');

    for (const [pageName, page] of pages.entries()) {
        // Generate HTML file
        const htmlPath = join(projectRoot, page.htmlFile);
        const htmlContent = generateHTML(pageName, page.title);
        await writeFile(htmlPath, htmlContent, 'utf-8');
        console.log(`  Generated: ${page.htmlFile}`);

        // Generate TSX entry file
        const tsxPath = join(pagesDir, page.tsxFile);
        const tsxContent = generateTSX(pageName, page.mdxPath, projectRoot);
        await writeFile(tsxPath, tsxContent, 'utf-8');
        console.log(`  Generated: src/pages/${page.tsxFile}`);
    }

    return pages;
}

/**
 * Generate vite config entries
 */
function generateViteConfigSnippet(pages) {
    console.log('\nVite config input entries (add to vite.config.ts):');
    console.log('```typescript');
    console.log('rollupOptions: {');
    console.log('  input: {');

    const sortedPages = Array.from(pages.entries()).sort(([a], [b]) => a.localeCompare(b));

    for (const [pageName, page] of sortedPages) {
        const key = pageName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        console.log(`    ${key}: path.resolve(__dirname, '${page.htmlFile}'),`);
    }

    console.log('  },');
    console.log('}');
    console.log('```');
}

/**
 * Main function
 */
async function main() {
    const projectRoot = join(__dirname, '..');
    const docsDir = join(projectRoot, 'docs');

    console.log('Scanning for documentation pages...');
    console.log(`Docs directory: ${docsDir}`);

    // Check if docs directory exists
    try {
        await stat(docsDir);
    } catch (error) {
        console.error(`Docs directory not found: ${docsDir}`);
        process.exit(1);
    }

    // Scan for MDX files
    const pages = await scanForPages(docsDir, projectRoot);
    console.log(`Found ${pages.size} documentation pages\n`);

    // Generate HTML and TSX entry files
    await generateEntries(pages, projectRoot);

    console.log(`\n✅ Generated ${pages.size} HTML entry files and ${pages.size} TSX entry files`);

    // Show vite config snippet
    generateViteConfigSnippet(pages);
}

main().catch(error => {
    console.error('\n❌ Error generating HTML entries:', error);
    process.exit(1);
});
