#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { join, basename } from 'path';

/**
 * Convert MDX file to Markdown by:
 * 1. Removing import statements
 * 2. Removing PageLayout wrapper
 * 3. Extracting content from JSX functions if present
 * 4. Converting the h1 title to # markdown
 */
async function convertMdxToMd(mdxPath, mdPath) {
    const content = await readFile(mdxPath, 'utf-8');
    const lines = content.split('\n');

    let inImports = true;
    let inPageLayout = false;
    let inFunction = false;
    let inJsx = false;
    let braceCount = 0;
    let parenCount = 0;
    let title = '';
    const outputLines = [];

    // Extract title from PageLayout
    const titleMatch = content.match(/title="([^"]+)"/);
    if (titleMatch) {
        title = titleMatch[1];
    }

    // Check if this is a function-based component
    const isFunctionBased = content.includes('export default function') || content.includes('export function');

    if (isFunctionBased) {
        // Extract content from JSX return statement
        let inReturn = false;
        let foundFirstJsx = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip imports
            if (trimmed.startsWith('import ')) continue;
            if (trimmed === '') && !foundFirstJsx continue;

            // Detect function start
            if (trimmed.includes('export default function') || trimmed.includes('export function')) {
                inFunction = true;
                continue;
            }

            // Detect return statement
            if (inFunction && (trimmed.startsWith('return') || trimmed === 'return (')) {
                inReturn = true;
                if (trimmed.includes('<>')) {
                    foundFirstJsx = true;
                }
                continue;
            }

            // Skip opening fragment or PageLayout
            if (inReturn && !foundFirstJsx) {
                if (trimmed === '<>' || trimmed.startsWith('<PageLayout')) {
                    foundFirstJsx = true;
                    continue;
                }
            }

            // Detect end of JSX content
            if (foundFirstJsx) {
                if (trimmed === '</>' || trimmed === '</PageLayout>' || trimmed === '</PageLayout>;') {
                    break;
                }
                if (trimmed === '}' || trimmed === '};') {
                    break;
                }

                // Process JSX line - convert to markdown
                let processedLine = line;

                // Remove JSX className, style props
                processedLine = processedLine.replace(/\s+className="[^"]*"/g, '');
                processedLine = processedLine.replace(/\s+style=\{[^}]*\}/g, '');

                // Convert JSX tags to markdown (simple cases)
                if (trimmed.startsWith('<header>') || trimmed.startsWith('<section')) {
                    continue;
                }
                if (trimmed === '</header>' || trimmed === '</section>') {
                    continue;
                }
                if (trimmed === '<div className="container">') {
                    continue;
                }
                if (trimmed === '</div>') {
                    continue;
                }

                // Keep most content as-is for now (markdown should be preserved)
                outputLines.push(processedLine);
            }
        }
    } else {
        // Simple MDX - just remove imports and PageLayout wrapper
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip import statements
            if (trimmed.startsWith('import ')) {
                continue;
            }

            // Skip empty lines at the start
            if (trimmed === '' && outputLines.length === 0) {
                continue;
            }

            // Skip PageLayout opening
            if (trimmed.startsWith('<PageLayout')) {
                inPageLayout = true;
                continue;
            }

            // Skip PageLayout closing
            if (trimmed === '</PageLayout>') {
                inPageLayout = false;
                continue;
            }

            // Add content
            outputLines.push(line);
        }
    }

    // Trim empty lines at start and end
    while (outputLines.length > 0 && outputLines[0].trim() === '') {
        outputLines.shift();
    }
    while (outputLines.length > 0 && outputLines[outputLines.length - 1].trim() === '') {
        outputLines.pop();
    }

    // Add title as h1 if we extracted one
    let finalContent = '';
    if (title && !outputLines[0]?.startsWith('#')) {
        finalContent = `# ${title}\n\n${outputLines.join('\n')}`;
    } else {
        finalContent = outputLines.join('\n');
    }

    // Write markdown file
    await writeFile(mdPath, finalContent + '\n', 'utf-8');
    console.log(`✓ Converted: ${basename(mdxPath)} → ${basename(mdPath)}`);
}

// Main execution
const mdxPath = process.argv[2];
const mdPath = process.argv[3];

if (!mdxPath || !mdPath) {
    console.error('Usage: node convert-mdx-to-md.js <input.mdx> <output.md>');
    process.exit(1);
}

convertMdxToMd(mdxPath, mdPath).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
