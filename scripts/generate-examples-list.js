#!/usr/bin/env node

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Recursively scan directory for example files
 */
async function scanExamples(dir, baseDir = dir) {
    const examples = [];

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subExamples = await scanExamples(fullPath, baseDir);
                examples.push(...subExamples);
            } else if (entry.isFile() && (entry.name.endsWith('.dygram') || entry.name.endsWith('.mach'))) {
                // Get relative path from examples directory
                const relativePath = relative(baseDir, fullPath);

                // Get category from directory structure
                const pathParts = relativePath.split('/');
                const category = pathParts.length > 1 ? pathParts[0] : 'root';

                // Generate a readable name from filename
                const nameWithoutExt = basename(entry.name, entry.name.endsWith('.dygram') ? '.dygram' : '.mach');
                const readableName = nameWithoutExt
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');

                // Try to read first few lines to get machine title
                let title = readableName;
                try {
                    const content = await readFile(fullPath, 'utf-8');
                    const titleMatch = content.match(/^machine\s+"([^"]+)"/m);
                    if (titleMatch) {
                        title = titleMatch[1];
                    }
                } catch (readError) {
                    console.warn(`Could not read content of ${relativePath}:`, readError.message);
                }

                examples.push({
                    path: `examples/${relativePath.replace(/\\/g, '/')}`,
                    name: readableName,
                    title: title,
                    category: category,
                    filename: entry.name
                });
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
    }

    return examples;
}

/**
 * Sort examples by category and name
 */
function sortExamples(examples) {
    const categoryOrder = ['basic', 'workflows', 'attributes', 'edges', 'nesting', 'complex', 'phase2', 'phase3', 'edge-cases', 'stress', 'root'];

    return examples.sort((a, b) => {
        // First sort by category
        const categoryIndexA = categoryOrder.indexOf(a.category);
        const categoryIndexB = categoryOrder.indexOf(b.category);
        const catA = categoryIndexA === -1 ? categoryOrder.length : categoryIndexA;
        const catB = categoryIndexB === -1 ? categoryOrder.length : categoryIndexB;

        if (catA !== catB) {
            return catA - catB;
        }

        // Then sort by name
        return a.name.localeCompare(b.name);
    });
}

/**
 * Main function
 */
async function main() {
    const projectRoot = join(__dirname, '..');
    const examplesDir = join(projectRoot, 'examples');
    const outputFile = join(projectRoot, 'src', 'generated', 'examples-list.json');

    console.log('Scanning examples directory...');
    console.log(`Examples directory: ${examplesDir}`);

    // Check if examples directory exists
    try {
        await stat(examplesDir);
    } catch (error) {
        console.error(`Examples directory not found: ${examplesDir}`);
        process.exit(1);
    }

    // Scan for examples
    const examples = await scanExamples(examplesDir);
    const sortedExamples = sortExamples(examples);

    console.log(`Found ${sortedExamples.length} examples:`);

    // Group by category for display
    const byCategory = {};
    for (const example of sortedExamples) {
        if (!byCategory[example.category]) {
            byCategory[example.category] = [];
        }
        byCategory[example.category].push(example);
    }

    for (const [category, items] of Object.entries(byCategory)) {
        console.log(`  ${category}: ${items.length} examples`);
    }

    // Ensure output directory exists
    const outputDir = dirname(outputFile);
    try {
        await stat(outputDir);
    } catch (error) {
        // Directory doesn't exist, create it
        const { mkdir } = await import('fs/promises');
        await mkdir(outputDir, { recursive: true });
        console.log(`Created directory: ${outputDir}`);
    }

    // Write to output file
    const outputContent = JSON.stringify(sortedExamples, null, 2);
    await writeFile(outputFile, outputContent, 'utf-8');

    console.log(`\nGenerated examples list: ${outputFile}`);
    console.log(`Total examples: ${sortedExamples.length}`);
}

main().catch(error => {
    console.error('Error generating examples list:', error);
    process.exit(1);
});
