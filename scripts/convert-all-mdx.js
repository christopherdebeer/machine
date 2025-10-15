#!/usr/bin/env node

import { readdir, readFile, writeFile, unlink } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Convert MDX content to pure markdown
 */
function convertMdxToMarkdown(content, filename) {
    let lines = content.split('\n');
    let pageLayoutTitle = '';
    let result = [];
    let skipNextEmpty = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip import statements
        if (trimmed.startsWith('import ')) {
            continue;
        }

        // Extract title from PageLayout and skip the line
        const pageLayoutMatch = line.match(/<PageLayout title="([^"]+)">/);
        if (pageLayoutMatch) {
            pageLayoutTitle = pageLayoutMatch[1];
            skipNextEmpty = true;
            continue;
        }

        // Skip closing PageLayout
        if (trimmed === '</PageLayout>') {
            continue;
        }

        // Skip empty line after PageLayout opening
        if (skipNextEmpty && trimmed === '') {
            skipNextEmpty = false;
            continue;
        }

        result.push(line);
    }

    // Trim empty lines at start and end
    while (result.length > 0 && result[0].trim() === '') {
        result.shift();
    }
    while (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
    }

    // Add h1 title at the beginning if we found one and there's no h1 already
    if (pageLayoutTitle && !result[0]?.trim().startsWith('# ')) {
        result.unshift('');
        result.unshift(`# ${pageLayoutTitle}`);
    }

    return result.join('\n') + '\n';
}

/**
 * Process a single MDX file
 */
async function processMdxFile(filePath) {
    const fileName = basename(filePath);

    // Skip index.mdx files
    if (fileName === 'index.mdx') {
        console.log(`  Skipping: ${filePath} (index file)`);
        return false;
    }

    console.log(`  Converting: ${filePath}`);

    try {
        // Read MDX content
        const content = await readFile(filePath, 'utf-8');

        // Convert to markdown
        const markdown = convertMdxToMarkdown(content, fileName);

        // Write as .md file
        const mdPath = filePath.replace(/\.mdx$/, '.md');
        await writeFile(mdPath, markdown, 'utf-8');
        console.log(`    Created: ${mdPath}`);

        // Delete original .mdx file
        await unlink(filePath);
        console.log(`    Deleted: ${filePath}`);

        return true;
    } catch (error) {
        console.error(`    Error converting ${filePath}:`, error.message);
        return false;
    }
}

/**
 * Recursively scan directory for MDX files
 */
async function scanDirectory(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    let converted = 0;

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            // Skip certain directories
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'archive' || entry.name === 'src') {
                continue;
            }

            // Recursively process subdirectories
            const subConverted = await scanDirectory(fullPath);
            converted += subConverted;
        } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
            const success = await processMdxFile(fullPath);
            if (success) {
                converted++;
            }
        }
    }

    return converted;
}

/**
 * Main function
 */
async function main() {
    const projectRoot = join(__dirname, '..');
    const docsDir = join(projectRoot, 'docs');

    console.log('Converting MDX files to Markdown...');
    console.log(`Docs directory: ${docsDir}`);

    const converted = await scanDirectory(docsDir);

    console.log('\n✅ Conversion complete!');
    console.log(`   Converted: ${converted} files`);
}

main().catch(error => {
    console.error('\n❌ Error converting files:', error);
    process.exit(1);
});
