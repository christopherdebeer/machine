#!/usr/bin/env node

import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Convert filename to title case
 */
function toTitleCase(str) {
    return str
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]/g, ' ')
        .split(' ')
        .filter(word => word.length > 0)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Extract title from markdown file (first h1)
 */
async function extractTitle(filePath) {
    try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.startsWith('# ')) {
                return line.substring(2).trim();
            }
        }
    } catch (error) {
        // If file doesn't exist or can't be read, return null
    }
    return null;
}

/**
 * Convert file path to HTML filename
 */
function toHtmlFilename(relativePath) {
    // Remove .md extension
    let path = relativePath.replace(/\.md$/, '');

    // Handle README.md → index
    if (basename(path) === 'README') {
        const dir = dirname(path);
        if (dir === '.') {
            return 'documentation.html';
        } else {
            // examples/README → examples-index.html
            return `${basename(dir)}-index.html`;
        }
    }

    // Convert nested paths to flat kebab-case
    // guides/language-overview.md → language-overview.html
    const baseName = basename(path);

    // Convert PascalCase/camelCase to kebab-case
    const kebabName = baseName
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');

    return `${kebabName}.html`;
}

/**
 * Recursively scan directory and build hierarchy
 */
async function scanDirectory(dir, projectRoot, docsDir, basePath = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = join(basePath, entry.name);

        if (entry.isDirectory()) {
            // Skip archive directory
            if (entry.name === 'archive') continue;

            // Read README.md from directory for metadata
            const readmePath = join(fullPath, 'README.md');
            let sectionTitle = toTitleCase(entry.name);
            let sectionDescription = '';

            try {
                const readmeContent = await readFile(readmePath, 'utf-8');
                const lines = readmeContent.split('\n');

                // Extract h1 as title
                for (const line of lines) {
                    if (line.startsWith('# ')) {
                        sectionTitle = line.substring(2).trim();
                        break;
                    }
                }

                // Extract first paragraph as description
                let foundH1 = false;
                for (const line of lines) {
                    if (line.startsWith('# ')) {
                        foundH1 = true;
                        continue;
                    }
                    if (foundH1 && line.trim() && !line.startsWith('#')) {
                        sectionDescription = line.trim();
                        break;
                    }
                }
            } catch (error) {
                // README doesn't exist, use defaults
            }

            // Recursively scan subdirectory
            const children = await scanDirectory(fullPath, projectRoot, docsDir, relativePath);

            items.push({
                type: 'directory',
                name: entry.name,
                title: sectionTitle,
                description: sectionDescription,
                path: relativePath,
                indexUrl: toHtmlFilename(join(relativePath, 'README.md')),
                children
            });
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            // Skip README.md files (they become directory indexes)
            if (entry.name === 'README.md') continue;

            const title = await extractTitle(fullPath) || toTitleCase(basename(entry.name, '.md'));
            const htmlUrl = toHtmlFilename(relativePath);

            items.push({
                type: 'file',
                name: entry.name,
                title,
                path: relativePath,
                url: htmlUrl
            });
        }
    }

    // Sort: directories first, then files, both alphabetically
    items.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    return items;
}

/**
 * Build top-level navigation structure
 */
async function buildNavigation(docsDir, projectRoot) {
    const hierarchy = await scanDirectory(docsDir, projectRoot, docsDir);

    // Add root-level MDX files
    const rootFiles = [
        { name: 'Index.mdx', title: 'Home', url: 'index.html' },
        { name: 'QuickStart.md', title: 'Quick Start', url: 'quick-start.html' },
        { name: 'Api.md', title: 'API Reference', url: 'api.html' },
        { name: 'Evolution.md', title: 'Evolution', url: 'evolution.html' },
        { name: 'RuntimeAndEvolution.md', title: 'Runtime and Evolution', url: 'runtime-and-evolution.html' },
    ];

    for (const file of rootFiles) {
        const filePath = join(docsDir, file.name);
        try {
            await stat(filePath);
            const title = await extractTitle(filePath) || file.title;
            hierarchy.unshift({
                type: 'file',
                name: file.name,
                title,
                path: file.name,
                url: file.url
            });
        } catch (error) {
            // File doesn't exist, skip
        }
    }

    return hierarchy;
}

/**
 * Main function
 */
async function main() {
    const projectRoot = join(__dirname, '..');
    const docsDir = join(projectRoot, 'docs');
    const outputDir = join(projectRoot, 'src', 'data');
    const outputFile = join(outputDir, 'doc-hierarchy.json');

    console.log('Generating documentation hierarchy...');
    console.log(`Docs directory: ${docsDir}`);

    // Check if docs directory exists
    try {
        await stat(docsDir);
    } catch (error) {
        console.error(`Docs directory not found: ${docsDir}`);
        process.exit(1);
    }

    // Build hierarchy
    const hierarchy = await buildNavigation(docsDir, projectRoot);

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Write JSON file
    await writeFile(outputFile, JSON.stringify(hierarchy, null, 2), 'utf-8');

    console.log(`\n✅ Generated hierarchy: ${relative(projectRoot, outputFile)}`);
    console.log(`   Total sections: ${hierarchy.filter(h => h.type === 'directory').length}`);
    console.log(`   Total pages: ${countPages(hierarchy)}`);
}

function countPages(items) {
    let count = 0;
    for (const item of items) {
        if (item.type === 'file') {
            count++;
        } else if (item.type === 'directory' && item.children) {
            count += countPages(item.children);
        }
    }
    return count;
}

main().catch(error => {
    console.error('\n❌ Error generating hierarchy:', error);
    process.exit(1);
});
