#!/usr/bin/env node

/**
 * Dedicated Example Extraction Script
 * 
 * Extracts code examples from markdown documentation and organizes them
 * into a clean, logical folder structure without the double "examples" issue.
 */

import { readdir, readFile, writeFile, stat, mkdir, rm } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, level = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = {
        info: `${colors.blue}ℹ${colors.reset}`,
        success: `${colors.green}✓${colors.reset}`,
        warn: `${colors.yellow}⚠${colors.reset}`,
        error: `${colors.red}✗${colors.reset}`,
        step: `${colors.magenta}▶${colors.reset}`
    }[level] || '';

    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${prefix} ${message}`);
}

/**
 * Load file extensions from langium-config.json (source of truth)
 */
async function getFileExtensions(projectRoot) {
    const langiumConfigPath = join(projectRoot, 'langium-config.json');
    const langiumConfig = JSON.parse(await readFile(langiumConfigPath, 'utf-8'));
    return langiumConfig.languages[0].fileExtensions;
}

/**
 * Get the primary/preferred file extension
 */
function getPrimaryExtension(extensions) {
    return extensions[0];
}

/**
 * Maps source file paths to appropriate example categories
 */
function getCategoryFromPath(sourcePath) {
    const parts = sourcePath.replace(/^docs\//, '').split('/');
    const fileName = parts[parts.length - 1].replace(/\.(md|mdx)$/, '');

    // Handle different documentation structures
    if (parts.length === 1) {
        // docs/README.md → "basic"
        // docs/styling.md → "styling"
        if (fileName === 'README') return 'basic';
        return fileName;
    }

    if (parts[0] === 'examples') {
        // docs/examples/advanced-features.md → "advanced-features"
        // docs/examples/README.md → "basic" (overview examples should go to basic)
        if (parts.length === 2 && fileName !== 'README') {
            return fileName;
        }
        return 'basic'; // For docs/examples/README.md - these are basic examples
    }

    if (parts[0] === 'syntax') {
        // docs/syntax/ has many files - create subfolders based on filename
        // docs/syntax/machines.md → "syntax/machines"
        // docs/syntax/states.md → "syntax/states"
        if (fileName === 'README') return 'syntax';
        return `syntax/${fileName}`;
    }

    // For other multi-level paths, preserve directory structure
    // docs/getting-started/installation.md → "getting-started/installation"
    if (parts.length >= 2) {
        if (fileName === 'README') {
            return parts[0]; // docs/getting-started/README.md → "getting-started"
        }
        return parts.slice(0, -1).join('/') + '/' + fileName;
    }

    // Fallback: use first part as category
    return parts[0];
}

/**
 * Extracts a meaningful filename from code block content or generates one
 */
function extractFilename(content, sourceFile, blockIndex, primaryExt) {
    // Try to extract machine name from content
    const machineMatch = content.match(/^machine\s+"([^"]+)"/m);
    if (machineMatch) {
        const machineName = machineMatch[1]
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 50); // Limit length
        return `${machineName}${primaryExt}`;
    }

    // Generate from source file and block index
    const sourceParts = sourceFile.replace(/^docs\//, '').replace(/\.(md|mdx)$/, '').split('/');
    const baseName = sourceParts[sourceParts.length - 1].toLowerCase().replace(/readme$/i, 'example');

    return `${baseName}-${blockIndex}${primaryExt}`;
}

/**
 * Extracts examples from a single markdown file
 */
function extractFromMarkdown(content, sourceFile, primaryExt) {
    const lines = content.split('\n');
    const examples = [];
    const unnamedBlocks = [];
    let inCodeblock = false;
    let codeblockPath = null;
    let codeblockContent = [];
    let lineNumber = 0;
    let blockIndex = 0;

    for (const line of lines) {
        lineNumber++;
        
        if (line.startsWith('```')) {
            if (!inCodeblock) {
                const matchWithPath = line.match(/^```(dygram|mach|machine)\s+(.+\.(dygram|mach))$/);
                const matchWithoutPath = line.match(/^```(dygram|mach|machine)\s*(.*)$/);

                // Check for !no-extract marker
                const hasNoExtractMarker = matchWithoutPath && matchWithoutPath[2].includes('!no-extract');

                if (matchWithPath) {
                    // Explicit path provided
                    inCodeblock = true;
                    codeblockPath = matchWithPath[2].trim();
                    codeblockContent = [];
                } else if (matchWithoutPath && !hasNoExtractMarker) {
                    // Generate path automatically
                    inCodeblock = true;
                    blockIndex++;
                    
                    const category = getCategoryFromPath(sourceFile);
                    const filename = extractFilename('', sourceFile, blockIndex, primaryExt); // We'll update this after getting content
                    codeblockPath = `examples/${category}/${filename}`;
                    codeblockContent = [];
                    
                    unnamedBlocks.push({
                        sourceFile,
                        sourceLine: lineNumber,
                        generatedPath: codeblockPath
                    });
                } else if (hasNoExtractMarker) {
                    // Skip extraction but mark as in codeblock
                    inCodeblock = true;
                    codeblockPath = null;
                    codeblockContent = [];
                }
            } else {
                // End of code block
                if (codeblockPath) {
                    const content = codeblockContent.join('\n');
                    
                    // If this was an unnamed block, try to get a better filename from content
                    if (unnamedBlocks.some(b => b.generatedPath === codeblockPath)) {
                        const category = getCategoryFromPath(sourceFile);
                        const betterFilename = extractFilename(content, sourceFile, blockIndex, primaryExt);
                        codeblockPath = `examples/${category}/${betterFilename}`;

                        // Update the unnamed block record
                        const blockRecord = unnamedBlocks.find(b => b.generatedPath.endsWith(betterFilename));
                        if (blockRecord) {
                            blockRecord.generatedPath = codeblockPath;
                        }
                    }
                    
                    examples.push({
                        path: codeblockPath,
                        content,
                        sourceFile: sourceFile,
                        sourceLine: lineNumber - codeblockContent.length - 1,
                        isUnnamed: unnamedBlocks.some(b => b.generatedPath === codeblockPath)
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
    
    return { examples, unnamedBlocks };
}

/**
 * Recursively scans for markdown files
 */
async function scanMarkdownFiles(dir) {
    const files = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'archived') {
                files.push(...await scanMarkdownFiles(fullPath));
            }
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Main extraction function
 */
export async function extractExamples(projectRoot) {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}EXAMPLE EXTRACTION${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);

    const docsDir = join(projectRoot, 'docs');
    const examplesDir = join(projectRoot, 'examples');

    // Load file extensions from langium-config.json
    const fileExtensions = await getFileExtensions(projectRoot);
    const primaryExt = getPrimaryExtension(fileExtensions);
    log(`Using file extensions: ${fileExtensions.join(', ')} (primary: ${primaryExt})`);

    log(`Scanning docs directory: ${relative(projectRoot, docsDir)}`);

    // Clean existing examples directory
    try {
        await rm(examplesDir, { recursive: true, force: true });
        log('Cleaned existing examples directory');
    } catch (error) {
        // Directory might not exist, that's fine
    }

    // Scan for markdown files
    const markdownFiles = await scanMarkdownFiles(docsDir);
    log(`Found ${markdownFiles.length} markdown files`, 'info');

    // Extract examples from all files
    const allExamples = [];
    const allUnnamedBlocks = [];

    for (const mdFile of markdownFiles) {
        const content = await readFile(mdFile, 'utf-8');
        const { examples, unnamedBlocks } = extractFromMarkdown(content, relative(projectRoot, mdFile), primaryExt);
        allExamples.push(...examples);
        allUnnamedBlocks.push(...unnamedBlocks);
    }

    log(`Extracted ${allExamples.length} examples from documentation`, 'success');

    // Report unnamed blocks
    if (allUnnamedBlocks.length > 0) {
        log(`Found ${allUnnamedBlocks.length} unnamed code block(s)`, 'warn');
        console.log(`\n${colors.dim}Unnamed code blocks (consider adding explicit filenames):${colors.reset}`);
        for (const block of allUnnamedBlocks) {
            log(`  ${block.sourceFile}:${block.sourceLine} → ${block.generatedPath}`, 'warn');
        }
        console.log(`\n${colors.dim}To fix: Add filename after language identifier, e.g.:${colors.reset}`);
        log(`  \`\`\`dygram examples/category/filename.dygram`, 'info');
        console.log('');
    }

    // Write examples to disk
    console.log(`\n${colors.dim}Writing example files:${colors.reset}`);
    let writeCount = 0;
    const byDirectory = {};

    for (const example of allExamples) {
        const fullPath = join(projectRoot, example.path);
        const dir = dirname(fullPath);
        await mkdir(dir, { recursive: true });

        // Calculate end line number
        const contentLines = example.content.split('\n').length;
        const endLine = example.sourceLine + contentLines + 1;

        // Add provenance comment
        const provenanceComment = `// do not edit, automatically extracted from ${example.sourceFile} lines ${example.sourceLine}-${endLine}.\n`;
        const contentWithProvenance = provenanceComment + example.content;

        await writeFile(fullPath, contentWithProvenance, 'utf-8');

        const dirName = relative(examplesDir, dir);
        byDirectory[dirName] = (byDirectory[dirName] || 0) + 1;
        writeCount++;
    }

    // Report results by directory
    for (const [dir, count] of Object.entries(byDirectory)) {
        log(`  ${dir}: ${count} file(s)`);
    }

    log(`Successfully wrote ${writeCount} example files`, 'success');

    return { count: writeCount, examples: allExamples };
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
    const projectRoot = join(__dirname, '..');
    
    try {
        await extractExamples(projectRoot);
        console.log(`\n${colors.bright}${colors.green}✓ Example extraction completed successfully${colors.reset}\n`);
    } catch (error) {
        console.error(`\n${colors.bright}${colors.red}✗ Example extraction failed${colors.reset}`);
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
}
