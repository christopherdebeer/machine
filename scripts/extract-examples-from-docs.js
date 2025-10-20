#!/usr/bin/env node

import { readdir, readFile, writeFile, stat, mkdir, rm } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Extract examples from markdown documentation files
 *
 * Code blocks with format: ```dygram examples/path/to/file.dygram
 * Will be extracted to: examples/path/to/file.dygram
 *
 * This maintains the existing folder structure without a "generated" folder
 */

/**
 * Parse a markdown file and extract code blocks with file paths
 */
function extractExamples(mdContent, sourceFile) {
    const lines = mdContent.split('\n');
    const examples = [];

    let inCodeblock = false;
    let codeblockPath = null;
    let codeblockContent = [];
    let lineNumber = 0;

    for (const line of lines) {
        lineNumber++;

        if (line.startsWith('```')) {
            if (!inCodeblock) {
                // Starting a code block
                // Match patterns like:
                // ```dygram examples/workflows/file.dygram
                // ```mach examples/basic/file.mach
                const match = line.match(/^```(dygram|mach|machine)\s+(.+\.(dygram|mach))$/);
                if (match) {
                    inCodeblock = true;
                    codeblockPath = match[2].trim();
                    codeblockContent = [];
                }
            } else {
                // Ending a code block
                if (codeblockPath) {
                    examples.push({
                        path: codeblockPath,
                        content: codeblockContent.join('\n'),
                        sourceFile: sourceFile,
                        sourceLine: lineNumber - codeblockContent.length - 1
                    });
                }
                inCodeblock = false;
                codeblockPath = null;
                codeblockContent = [];
            }
        } else if (inCodeblock && codeblockPath) {
            codeblockContent.push(line);
        }
    }

    return examples;
}

/**
 * Recursively scan directory for markdown files
 */
async function scanDirectory(dir) {
    const files = [];

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                // Skip certain directories
                if (entry.name === 'node_modules' || entry.name === '.git') {
                    continue;
                }
                // Recursively scan subdirectories
                const subFiles = await scanDirectory(fullPath);
                files.push(...subFiles);
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error.message);
    }

    return files;
}

/**
 * Write an example file to disk
 */
async function writeExample(projectRoot, example) {
    const fullPath = join(projectRoot, example.path);
    const dir = dirname(fullPath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Write file
    await writeFile(fullPath, example.content, 'utf-8');

    return fullPath;
}

/**
 * Main function
 */
async function main() {
    const projectRoot = join(__dirname, '..');
    const docsDir = join(projectRoot, 'docs');
    const examplesDir = join(projectRoot, 'examples');

    console.log('🔍 Extracting examples from documentation...\n');
    console.log(`   Docs directory: ${docsDir}`);
    console.log(`   Examples directory: ${examplesDir}\n`);

    // Check if docs directory exists
    try {
        await stat(docsDir);
    } catch (error) {
        console.error(`❌ Docs directory not found: ${docsDir}`);
        process.exit(1);
    }

    // Scan for all markdown files
    console.log('📄 Scanning documentation files...');
    const markdownFiles = await scanDirectory(docsDir);
    console.log(`   Found ${markdownFiles.length} markdown files\n`);

    // Extract examples from all files
    const allExamples = [];
    const fileStats = [];

    for (const mdFile of markdownFiles) {
        const relativePath = relative(projectRoot, mdFile);
        const content = await readFile(mdFile, 'utf-8');
        const examples = extractExamples(content, relativePath);

        if (examples.length > 0) {
            console.log(`   ${relativePath}: ${examples.length} example(s)`);
            allExamples.push(...examples);
            fileStats.push({
                file: relativePath,
                count: examples.length
            });
        }
    }

    console.log(`\n✅ Found ${allExamples.length} total examples to extract\n`);

    if (allExamples.length === 0) {
        console.log('⚠️  No examples found in documentation.');
        console.log('   Examples should be marked with: ```dygram examples/path/to/file.dygram');
        return;
    }

    // Group examples by directory
    const byDirectory = {};
    for (const example of allExamples) {
        const dir = dirname(example.path);
        if (!byDirectory[dir]) {
            byDirectory[dir] = [];
        }
        byDirectory[dir].push(example);
    }

    console.log('📁 Examples by directory:');
    for (const [dir, examples] of Object.entries(byDirectory)) {
        console.log(`   ${dir}: ${examples.length} file(s)`);
    }
    console.log('');

    // Write all examples
    console.log('💾 Writing example files...\n');
    let writeCount = 0;
    const errors = [];

    for (const example of allExamples) {
        try {
            const fullPath = await writeExample(projectRoot, example);
            const relPath = relative(projectRoot, fullPath);
            console.log(`   ✓ ${relPath}`);
            writeCount++;
        } catch (error) {
            console.error(`   ✗ ${example.path}: ${error.message}`);
            errors.push({ example, error });
        }
    }

    console.log(`\n✅ Successfully extracted ${writeCount} example file(s)`);

    if (errors.length > 0) {
        console.log(`\n⚠️  ${errors.length} error(s) occurred:`);
        for (const { example, error } of errors) {
            console.log(`   ${example.path}: ${error.message}`);
        }
    }

    // Generate summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 EXTRACTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total markdown files scanned: ${markdownFiles.length}`);
    console.log(`Files with examples: ${fileStats.length}`);
    console.log(`Total examples extracted: ${writeCount}`);
    console.log(`Directories created/updated: ${Object.keys(byDirectory).length}`);
    console.log('='.repeat(60) + '\n');
}

main().catch(error => {
    console.error('\n❌ Error extracting examples:', error);
    console.error(error.stack);
    process.exit(1);
});
