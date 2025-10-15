#!/usr/bin/env node

import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join, dirname, basename, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Convert markdown link to HTML link
 * Examples:
 *   [Text](getting-started/installation.md) → [Text](installation.html)
 *   [Text](../guides/syntax-guide.md) → [Text](syntax-guide.html)
 *   [Text](README.md) → [Text](documentation.html) or [Text](examples-index.html)
 *   [Text](QuickStart.mdx) → [Text](quick-start.html)
 */
function transformMarkdownLink(line, currentFileDir) {
    // Transform both .md and .mdx links
    return line.replace(/\[([^\]]+)\]\(([^)]+\.mdx?)\)/g, (match, text, linkPath) => {
        // Extract just the filename without path and extension
        const ext = extname(linkPath);
        let filename = basename(linkPath, ext);

        // Handle README.md links
        if (filename === 'README') {
            // Determine which directory's README this is
            const linkDir = dirname(linkPath);
            if (linkDir === '.' || linkDir === '') {
                // Root README → documentation.html
                return `[${text}](documentation.html)`;
            } else {
                // Subdirectory README → {dirname}-index.html
                const dirName = basename(linkDir);
                return `[${text}](${dirName}-index.html)`;
            }
        }

        // Convert PascalCase/camelCase to kebab-case
        const kebabName = filename
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '');

        return `[${text}](${kebabName}.html)`;
    });
}

/**
 * Parse markdown and extract codeblocks, converting to MDX
 */
async function transformMarkdown(mdContent, filename, sourcePath, relativeDepth = 0) {
    const lines = mdContent.split('\n');
    const examples = [];
    const mdxLines = [];

    let inCodeblock = false;
    let codeblockLang = '';
    let codeblockName = '';
    let codeblockContent = [];
    let h1Title = '';
    let hasH1 = false;

    // First pass: extract h1
    for (const line of lines) {
        if (line.startsWith('# ')) {
            h1Title = line.substring(2).trim();
            hasH1 = true;
            break;
        }
    }

    // Calculate correct import path based on directory depth
    const importPrefix = relativeDepth > 0 ? '../'.repeat(relativeDepth + 1) : '../';

    // Get directory of current file for link transformation
    const currentFileDir = dirname(sourcePath);

    // Add imports for MDX if we're processing markdown
    if (hasH1) {
        mdxLines.push(`import { PageLayout } from '${importPrefix}src/components/PageLayout';`);
        mdxLines.push(`import { ExampleLoader } from '${importPrefix}src/components/ExampleLoader';`);
        mdxLines.push('');
        mdxLines.push(`<PageLayout title="${h1Title}">`);
        mdxLines.push('');
    }

    // Second pass: process content
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Skip original h1 (we converted it to PageLayout)
        if (line.startsWith('# ') && hasH1) {
            continue;
        }

        // Detect codeblock start: ```lang [name]
        if (line.startsWith('```')) {
            if (!inCodeblock) {
                const match = line.match(/```(\w+)(?:\s+(.+))?/);
                if (match && (match[1] === 'dygram' || match[1] === 'mach')) {
                    inCodeblock = true;
                    codeblockLang = match[1];
                    codeblockName = match[2] || `example-${examples.length + 1}`;
                    codeblockContent = [];
                } else {
                    // Pass through other codeblocks
                    mdxLines.push(line);
                }
            } else {
                // Codeblock end
                inCodeblock = false;

                // Generate filename for example
                const exampleFilename = `${codeblockName}.${codeblockLang}`;
                const examplePath = `examples/generated/${exampleFilename}`;

                // Store example for extraction
                examples.push({
                    filename: exampleFilename,
                    path: examplePath,
                    content: codeblockContent.join('\n')
                });

                // Replace with ExampleLoader component
                mdxLines.push('');
                mdxLines.push(`<ExampleLoader path="${examplePath}" height="400px" />`);
                mdxLines.push('');
            }
        } else if (inCodeblock) {
            codeblockContent.push(line);
        } else {
            // Transform markdown links to HTML links
            line = transformMarkdownLink(line, currentFileDir);
            mdxLines.push(line);
        }
    }

    // Close PageLayout if we added it
    if (hasH1) {
        mdxLines.push('');
        mdxLines.push('</PageLayout>');
    }

    return {
        mdx: mdxLines.join('\n'),
        examples
    };
}

/**
 * Process a single markdown file
 */
async function processMarkdownFile(filePath, projectRoot, docsDir) {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(docsDir, filePath);
    const fileName = basename(filePath);
    const fileDir = dirname(relativePath);

    console.log(`  Processing: ${relativePath}`);

    // Only process .md files (not .mdx)
    if (!fileName.endsWith('.md')) {
        console.log(`    Skipping: Already MDX or not markdown`);
        return { examples: [], processed: false };
    }

    // Calculate directory depth (how many subdirectories deep from docs/)
    const depth = fileDir === '.' ? 0 : fileDir.split('/').length;

    // Transform markdown to MDX and extract examples
    const result = await transformMarkdown(content, fileName, filePath, depth);

    // Determine output path
    let outputPath;
    if (fileName === 'README.md') {
        // README.md → index.mdx
        if (fileDir === '.') {
            // docs/README.md → docs/Documentation.mdx (or keep as index?)
            outputPath = join(docsDir, 'Documentation.mdx');
        } else {
            // docs/subdir/README.md → docs/subdir/index.mdx
            outputPath = join(docsDir, fileDir, 'index.mdx');
        }
    } else {
        // regular.md → regular.mdx
        const baseName = basename(fileName, '.md');
        outputPath = join(docsDir, fileDir, `${baseName}.mdx`);
    }

    // Write MDX file
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, result.mdx, 'utf-8');
    console.log(`    Generated: ${relative(projectRoot, outputPath)}`);

    // Write extracted examples
    const examplesGeneratedDir = join(projectRoot, 'examples', 'generated');
    await mkdir(examplesGeneratedDir, { recursive: true });

    for (const example of result.examples) {
        const exampleFullPath = join(projectRoot, example.path);
        await writeFile(exampleFullPath, example.content, 'utf-8');
        console.log(`    Extracted: ${example.path}`);
    }

    return {
        examples: result.examples,
        processed: true,
        outputPath: relative(projectRoot, outputPath)
    };
}

/**
 * Recursively scan directory for markdown files
 */
async function scanDirectory(dir, projectRoot, docsDir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const results = {
        processed: 0,
        skipped: 0,
        examples: 0
    };

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            // Skip archive directory
            if (entry.name === 'archive') {
                console.log(`  Skipping: ${entry.name}/ (archive)`);
                continue;
            }

            // Recursively process subdirectories
            const subResults = await scanDirectory(fullPath, projectRoot, docsDir);
            results.processed += subResults.processed;
            results.skipped += subResults.skipped;
            results.examples += subResults.examples;
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            const result = await processMarkdownFile(fullPath, projectRoot, docsDir);
            if (result.processed) {
                results.processed++;
                results.examples += result.examples.length;
            } else {
                results.skipped++;
            }
        }
    }

    return results;
}

/**
 * Main function
 */
async function main() {
    const projectRoot = join(__dirname, '..');
    const docsDir = join(projectRoot, 'docs');

    console.log('Generating documentation from markdown...');
    console.log(`Docs directory: ${docsDir}`);

    // Check if docs directory exists
    try {
        await stat(docsDir);
    } catch (error) {
        console.error(`Docs directory not found: ${docsDir}`);
        process.exit(1);
    }

    // Scan and process all markdown files
    const results = await scanDirectory(docsDir, projectRoot, docsDir);

    console.log('\n✅ Documentation generation complete!');
    console.log(`   Processed: ${results.processed} files`);
    console.log(`   Skipped: ${results.skipped} files`);
    console.log(`   Extracted: ${results.examples} examples`);
}

main().catch(error => {
    console.error('\n❌ Error generating documentation:', error);
    process.exit(1);
});
