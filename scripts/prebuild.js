#!/usr/bin/env node

/**
 * Unified Prebuild Script
 *
 * This script consolidates all documentation build steps into a single
 * coordinated process with informative logging and error handling.
 *
 * Steps:
 * 1. Extract examples from markdown docs
 * 2. Generate examples list JSON
 * 3. Generate documentation hierarchy
 * 4. Generate MDX wrappers and HTML entries
 * 5. Validate links
 */

import { readdir, readFile, writeFile, stat, mkdir, rm } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';
import { extractExamples } from './extract-examples.js';
import { preprocessMarkdownForMdx } from './mdx-preprocessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get base URL from environment (Vercel sets VERCEL_BASE_URL, or use VITE_BASE_URL)
// Default to '/' for production deployment on custom domain (dygram.parc.land)
const BASE_URL = process.env.VITE_BASE_URL || process.env.VERCEL_BASE_URL || '/';
// Ensure base URL starts and ends with /
const normalizedBaseUrl = BASE_URL.startsWith('/') ? BASE_URL : `/${BASE_URL}`;
const baseUrl = normalizedBaseUrl.endsWith('/') ? normalizedBaseUrl : `${normalizedBaseUrl}/`;

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

// Logging utilities
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

function logSection(title) {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

function logSubsection(title) {
    console.log(`\n${colors.bright}${title}${colors.reset}`);
    console.log(`${colors.dim}${'-'.repeat(title.length)}${colors.reset}`);
}

// ============================================================================
// Centralized File Extension Configuration
// ============================================================================

/**
 * Load file extensions from langium-config.json (source of truth)
 */
async function getFileExtensions(projectRoot) {
    const langiumConfigPath = join(projectRoot, 'langium-config.json');
    const langiumConfig = JSON.parse(await readFile(langiumConfigPath, 'utf-8'));
    return langiumConfig.languages[0].fileExtensions;
}

/**
 * Check if a filename has a valid DyGram extension
 */
function hasValidExtension(filename, extensions) {
    return extensions.some(ext => filename.endsWith(ext));
}

/**
 * Get the file extension from a filename
 */
function getExtension(filename, extensions) {
    for (const ext of extensions) {
        if (filename.endsWith(ext)) {
            return ext;
        }
    }
    return null;
}

// ============================================================================
// STEP 1: Extract Examples from Markdown Documentation
// ============================================================================

async function extractExamplesStep(projectRoot) {
    // Use the new dedicated extraction script
    return await extractExamples(projectRoot);
}

// ============================================================================
// STEP 2: Generate Examples List
// ============================================================================

async function generateExamplesList(projectRoot) {
    logSection('STEP 2: Generate Examples List');

    const examplesDir = join(projectRoot, 'examples');
    const outputFile = join(projectRoot, 'src', 'generated', 'examples-list.json');

    // Load file extensions from langium-config.json
    const fileExtensions = await getFileExtensions(projectRoot);
    log(`Using file extensions: ${fileExtensions.join(', ')}`);

    log(`Scanning examples directory: ${relative(projectRoot, examplesDir)}`);

    // Recursively scan for example files
    async function scanExamples(dir, baseDir = dir) {
        const examples = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                examples.push(...await scanExamples(fullPath, baseDir));
            } else if (hasValidExtension(entry.name, fileExtensions)) {
                const relativePath = relative(baseDir, fullPath);
                const pathParts = relativePath.split('/');
                const category = pathParts.length > 1 ? pathParts[0] : 'root';
                const ext = getExtension(entry.name, fileExtensions);
                const nameWithoutExt = basename(entry.name, ext);
                const readableName = nameWithoutExt.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                let title = readableName;
                const content = await readFile(fullPath, 'utf-8');
                const titleMatch = content.match(/^machine\s+"([^"]+)"/m);
                if (titleMatch) title = titleMatch[1];

                examples.push({
                    path: `examples/${relativePath.replace(/\\/g, '/')}`,
                    name: readableName,
                    title,
                    category,
                    filename: entry.name,
                    content
                });
            }
        }
        return examples;
    }

    const examples = await scanExamples(examplesDir);

    // Sort examples
    const categoryOrder = ['basic', 'workflows', 'meta-programming', 'attributes', 'edges', 'nesting', 'complex', 'advanced', 'documentation', 'validation', 'context', 'edge-cases', 'stress', 'root'];
    examples.sort((a, b) => {
        const catIndexA = categoryOrder.indexOf(a.category);
        const catIndexB = categoryOrder.indexOf(b.category);
        const catA = catIndexA === -1 ? categoryOrder.length : catIndexA;
        const catB = catIndexB === -1 ? categoryOrder.length : catIndexB;
        if (catA !== catB) return catA - catB;
        return a.name.localeCompare(b.name);
    });

    log(`Found ${examples.length} example files`, 'info');

    // Group by category for logging
    const byCategory = {};
    for (const example of examples) {
        byCategory[example.category] = (byCategory[example.category] || 0) + 1;
    }

    logSubsection('Examples by category');
    for (const [category, count] of Object.entries(byCategory)) {
        log(`  ${category}: ${count} examples`);
    }

    // Write output
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, JSON.stringify(examples, null, 2), 'utf-8');

    log(`Generated examples list: ${relative(projectRoot, outputFile)}`, 'success');

    return { count: examples.length, categories: Object.keys(byCategory).length };
}

// ============================================================================
// STEP 3: Generate Documentation Hierarchy
// ============================================================================

async function generateHierarchy(projectRoot) {
    logSection('STEP 3: Generate Documentation Hierarchy');

    const docsDir = join(projectRoot, 'docs');
    const outputJsonFile = join(projectRoot, 'src', 'data', 'doc-hierarchy.json');
    const outputTsFile = join(projectRoot, 'src', 'data', 'doc-hierarchy.ts');

    log(`Scanning docs directory: ${relative(projectRoot, docsDir)}`);

    function toTitleCase(str) {
        return str.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').split(' ').filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    async function extractTitle(filePath) {
        try {
            const content = await readFile(filePath, 'utf-8');
            for (const line of content.split('\n')) {
                if (line.startsWith('# ')) return line.substring(2).trim();
            }
        } catch (error) {
            // ignore
        }
        return null;
    }

    function toHtmlFilename(relativePath) {
        let path = relativePath.replace(/\.(md|mdx)$/, '');
        if (basename(path) === 'README' || basename(path) === 'index') {
            const dir = dirname(path);
            if (dir === '.') return baseUrl; // Root index with base URL
            return `${baseUrl}${basename(dir)}/`; // Folder-based URL with base URL
        }
        const baseName = basename(path);
        return `${baseUrl}${baseName}/`; // Folder-based URL with base URL

    }

    async function scanDirectory(dir, basePath = '') {
        const entries = await readdir(dir, { withFileTypes: true });
        const items = [];

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = join(basePath, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === 'archived') continue;

                const readmePath = join(fullPath, 'README.md');
                const indexPath = join(fullPath, 'index.mdx');
                let sectionTitle = toTitleCase(entry.name);
                let sectionDescription = '';

                // Try README.md first, then index.mdx
                for (const path of [readmePath, indexPath]) {
                    try {
                        const content = await readFile(path, 'utf-8');
                        const lines = content.split('\n');
                        let foundH1 = false;
                        for (const line of lines) {
                            if (line.startsWith('# ')) {
                                sectionTitle = line.substring(2).trim();
                                foundH1 = true;
                                continue;
                            }
                            if (foundH1 && line.trim() && !line.startsWith('#')) {
                                sectionDescription = line.trim();
                                break;
                            }
                        }
                        break;
                    } catch (error) {
                        // try next file
                    }
                }

                const children = await scanDirectory(fullPath, relativePath);
                items.push({
                    type: 'directory',
                    name: entry.name,
                    title: sectionTitle,
                    description: sectionDescription,
                    path: relativePath,
                    indexUrl: toHtmlFilename(join(relativePath, 'index.mdx')),
                    children
                });
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                if (entry.name === 'README.md' || entry.name === 'index.mdx') continue;

                const title = await extractTitle(fullPath) || toTitleCase(basename(entry.name, entry.name.endsWith('.md') ? '.md' : '.mdx'));
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

        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return items;
    }

    const hierarchy = await scanDirectory(docsDir);

    // Count pages
    function countPages(items) {
        let count = 0;
        for (const item of items) {
            if (item.type === 'file') count++;
            else if (item.children) count += countPages(item.children);
        }
        return count;
    }

    const sectionCount = hierarchy.filter(h => h.type === 'directory').length;
    const pageCount = countPages(hierarchy);

    log(`Found ${sectionCount} sections and ${pageCount} pages`, 'info');

    // Write outputs
    await mkdir(dirname(outputJsonFile), { recursive: true });
    await writeFile(outputJsonFile, JSON.stringify(hierarchy, null, 2), 'utf-8');

    const tsContent = `// Auto-generated - do not edit manually

export interface DocItem {
    type: 'file' | 'directory';
    name: string;
    title: string;
    path: string;
    url?: string;
    indexUrl?: string;
    description?: string;
    children?: DocItem[];
}

const hierarchy: DocItem[] = ${JSON.stringify(hierarchy, null, 2)};

export default hierarchy;
`;
    await writeFile(outputTsFile, tsContent, 'utf-8');

    log(`Generated JSON: ${relative(projectRoot, outputJsonFile)}`, 'success');
    log(`Generated TypeScript: ${relative(projectRoot, outputTsFile)}`, 'success');

    return { sections: sectionCount, pages: pageCount };
}

// ============================================================================
// STEP 4: Generate Documentation Index
// ============================================================================

async function generateDocumentationIndex(projectRoot) {
    logSection('STEP 4: Generate Documentation Index');

    const docsDir = join(projectRoot, 'docs');
    const outputFile = join(docsDir, 'docs.md');

    log(`Scanning docs directory: ${relative(projectRoot, docsDir)}`);

    function toTitleCase(str) {
        return str.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').split(' ').filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    async function extractTitle(filePath) {
        try {
            const content = await readFile(filePath, 'utf-8');
            for (const line of content.split('\n')) {
                if (line.startsWith('# ')) return line.substring(2).trim();
            }
        } catch (error) {
            // ignore
        }
        return null;
    }

    async function scanDirectory(dir, basePath = '', level = 0) {
        const entries = await readdir(dir, { withFileTypes: true });
        const sections = [];

        // Sort: directories first, then files, alphabetically
        entries.sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) {
                return a.isDirectory() ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = join(basePath, entry.name);

            if (entry.isDirectory()) {
                // Skip archived directory at root level
                if (entry.name === 'archived' && level === 0) continue;

                const sectionTitle = toTitleCase(entry.name);
                const indent = '  '.repeat(level);

                // Add section header
                sections.push(`${indent}### ${sectionTitle}`);
                sections.push('');

                // Recursively scan subdirectory
                const subSections = await scanDirectory(fullPath, relativePath, level + 1);
                sections.push(...subSections);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {

                const title = await extractTitle(fullPath) || toTitleCase(basename(entry.name, '.md'));
                const indent = '  '.repeat(level);
                const linkPath = relativePath.replace(/\\/g, '/');

                sections.push(`${indent}- [${title}](${linkPath})`);
            }
        }

        // Add blank line after each directory section
        if (sections.length > 0 && level > 0) {
            sections.push('');
        }

        return sections;
    }

    const sections = await scanDirectory(docsDir);

    // Build the complete documentation index
    const indexContent = [
        '# Documentation Index',
        '',
        'Complete reference to all DyGram documentation organized by topic.',
        '',
        ...sections
    ].join('\n');

    await writeFile(outputFile, indexContent, 'utf-8');

    // Count total documents
    const docCount = (indexContent.match(/\]\(/g) || []).length;

    log(`Generated documentation index: ${relative(projectRoot, outputFile)}`, 'success');
    log(`Indexed ${docCount} documentation files`, 'info');

    return { count: docCount };
}

// ============================================================================
// STEP 5: Transform Markdown to MDX with CodeEditor Components
// ============================================================================

async function transformMarkdownToMdx(projectRoot) {
    logSection('STEP 5: Transform Markdown to MDX');

    const docsDir = join(projectRoot, 'docs');

    log(`Scanning for markdown files: ${relative(projectRoot, docsDir)}`);

    // Transform a single markdown file to MDX
    async function transformFile(mdPath, relativePath) {
        const rawContent = await readFile(mdPath, 'utf-8');
        
        // Apply preprocessing to fix MDX compilation issues
        const content = preprocessMarkdownForMdx(rawContent);
        const lines = content.split('\n');
        const output = [];
        let inCodeBlock = false;
        let codeBlockLang = null;
        let codeBlockContent = [];
        let codeBlockId = 0;
        let codeBlockMetadata = {};

        // Check if file needs CodeEditor imports
        const hasDygramBlocks = /```(dy|dygram|mach|machine)/m.test(content);

        if (hasDygramBlocks) {
            // Calculate relative path from this MDX file to src/components/CodeEditor
            // relativePath is like "README.mdx" or "examples/README.mdx" or "api/README.mdx"
            const pathParts = relativePath.split('/');
            const depth = pathParts.length - 1; // Number of directories deep (excluding filename)

            // From docs/README.mdx: ../src/components/CodeEditor
            // From docs/examples/README.mdx: ../../src/components/CodeEditor
            const levelsUp = depth + 1; // +1 to go from docs to project root
            const relativePrefix = Array(levelsUp).fill('..').join('/');
            output.push(`import { CodeEditor } from '${relativePrefix}/src/components/CodeEditor';`);
            output.push('');
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    // Starting a code block
                    const match = line.match(/^```(dy|dygram|mach|machine)(?:\s+(.+))?$/);
                    if (match) {
                        inCodeBlock = true;
                        codeBlockLang = match[1];
                        codeBlockContent = [];

                        // Extract metadata from the optional part after language
                        let codeBlockFilename = null;
                        let codeBlockMode = null;
                        let codeBlockEnableImports = false;

                        if (match[2]) {
                            const metadataStr = match[2].trim();

                            // Check for !no-extract marker
                            const hasNoExtract = metadataStr.includes('!no-extract');
                            if (hasNoExtract) {
                                // Don't transform to CodeEditor, just display as syntax-highlighted code
                                codeBlockLang = null;
                                output.push('```' + match[1]);
                            } else {
                                // Extract filename (e.g., filename="examples/state-machine.dygram")
                                const filenameMatch = metadataStr.match(/filename=["']([^"']+)["']/);
                                if (filenameMatch) {
                                    codeBlockFilename = filenameMatch[1];
                                    // If filename is provided, enable imports by default
                                    codeBlockEnableImports = true;
                                } else if (!metadataStr.includes('=')) {
                                    // Backward compatibility: plain path without attributes
                                    // e.g., ```dy examples/imports/simple-library.dygram
                                    codeBlockFilename = metadataStr;
                                    codeBlockEnableImports = true;
                                }

                                // Extract mode (e.g., mode="split")
                                const modeMatch = metadataStr.match(/mode=["']([^"']+)["']/);
                                if (modeMatch) {
                                    codeBlockMode = modeMatch[1];
                                } else {
                                    // Backward compatibility: if filename provided without explicit mode,
                                    // default to 'split' to show both code and visual
                                    codeBlockMode = 'split';
                                }

                                // Check for explicit enableImports flag
                                if (metadataStr.includes('enableImports=true')) {
                                    codeBlockEnableImports = true;
                                } else if (metadataStr.includes('enableImports=false')) {
                                    codeBlockEnableImports = false;
                                }
                            }
                        } else {
                           // Default: no metadata provided, use split mode
                           codeBlockMode = "split";
                        }

                        // Store metadata for use when closing the block
                        codeBlockMetadata = { filename: codeBlockFilename, mode: codeBlockMode, enableImports: codeBlockEnableImports };
                    } else {
                        // Non-dygram code block, pass through
                        output.push(line);
                    }
                } else {
                    // Ending a code block
                    if (codeBlockLang) {
                        // Transform to CodeEditor component
                        const code = codeBlockContent.join('\\n').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                        codeBlockId++;
                        output.push('');
                        output.push(`<CodeEditor`);
                        output.push(`  initialCode={\`${code}\`}`);
                        output.push(`  language="${codeBlockLang}"`);
                        output.push(`  id="code-editor-${codeBlockId}"`);

                        // Add filename if provided
                        if (codeBlockMetadata.filename) {
                            output.push(`  filename="${codeBlockMetadata.filename}"`);
                        }

                        // Add mode if provided
                        if (codeBlockMetadata.mode) {
                            output.push(`  mode="${codeBlockMetadata.mode}"`);
                        }

                        // Add enableImports if true
                        if (codeBlockMetadata.enableImports) {
                            output.push(`  enableImports={true}`);
                        }

                        output.push(`/>`);
                        output.push('');
                    } else {
                        output.push(line);
                    }
                    inCodeBlock = false;
                    codeBlockLang = null;
                    codeBlockContent = [];
                    codeBlockMetadata = {};
                }
            } else if (inCodeBlock && codeBlockLang) {
                // Accumulate code block content
                codeBlockContent.push(line);
            } else if (inCodeBlock) {
                // Non-dygram code block content, pass through
                output.push(line);
            } else {
                // Regular content - rewrite all markdown links to match output URL structure
                let processedLine = line;

                // Rewrite markdown/MDX links to their final URL structure
                processedLine = processedLine.replace(/\]\(([^):#]+\.(md|mdx)(?:#[^)]+)?)\)/g, (match, fullPath) => {
                    // Extract path and hash separately
                    const [linkPath, hash] = fullPath.split('#');
                    const hashPart = hash ? `#${hash}` : '';

                    // Skip external links (http://, https://, //)
                    if (linkPath.match(/^(https?:)?\/\//)) {
                        return match;
                    }

                    // Determine if this is an absolute or relative path
                    const isAbsolute = linkPath.startsWith('/');

                    // Calculate the base path for this file
                    // relativePath is like "syntax/machines.mdx" or "README.mdx"
                    const currentDir = dirname(relativePath);

                    // Resolve the target path
                    let targetPath;
                    if (isAbsolute) {
                        // Absolute path from docs root
                        targetPath = linkPath.substring(1); // Remove leading /
                    } else {
                        // Relative path - resolve against current directory
                        targetPath = join(currentDir, linkPath).replace(/\\/g, '/');
                    }

                    // Normalize the path (remove ..)
                    const pathParts = targetPath.split('/').filter(p => p && p !== '.');
                    const normalizedParts = [];
                    for (const part of pathParts) {
                        if (part === '..') {
                            normalizedParts.pop();
                        } else {
                            normalizedParts.push(part);
                        }
                    }
                    targetPath = normalizedParts.join('/');

                    // Convert to URL structure matching what generateEntries creates
                    // Remove .md/.mdx extension
                    let urlPath = targetPath.replace(/\.(md|mdx)$/, '');

                    // Handle README files -> parent directory
                    if (urlPath.endsWith('/README') || urlPath === 'README') {
                        urlPath = urlPath.replace(/\/README$/, '').replace(/^README$/, '');
                    }

                    // Convert to folder-based URL with trailing slash
                    // docs/syntax/annotations.md -> /syntax/annotations/
                    // docs/README.md -> /
                    // docs/examples/README.md -> /examples/
                    if (urlPath === '') {
                        urlPath = baseUrl;
                    } else {
                        urlPath = `${baseUrl}${urlPath}/`;
                    }

                    return `](${urlPath}${hashPart})`;
                });

                output.push(processedLine);
            }
        }

        return output.join('\n');
    }

    // Scan for markdown files recursively
    async function scanMarkdownFiles(dir, basePath = '') {
        const files = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = join(basePath, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === 'archived') continue;
                files.push(...await scanMarkdownFiles(fullPath, relativePath));
            } else if (entry.name.endsWith('.md')) {
                // Skip Index.md as it's replaced by README.md
                if (entry.name === 'Index.md') continue;

                // All .md files become .mdx (keeping their names)
                const outputName = entry.name.replace(/\.md$/, '.mdx');
                files.push({
                    fullPath,
                    relativePath: join(dirname(relativePath), outputName).replace(/\\/g, '/'),
                    isConversion: true
                });
            }
        }
        return files;
    }

    const markdownFiles = await scanMarkdownFiles(docsDir);
    log(`Found ${markdownFiles.length} markdown files to transform`, 'info');

    // Transform each markdown file
    let transformCount = 0;
    for (const { fullPath, relativePath } of markdownFiles) {
        const mdxContent = await transformFile(fullPath, relativePath);

        // Output path is already determined in relativePath
        const outputPath = join(docsDir, relativePath);

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, mdxContent, 'utf-8');

        log(`  ${relative(docsDir, fullPath)} → ${relative(docsDir, outputPath)}`);
        transformCount++;
    }

    log(`Transformed ${transformCount} markdown files to MDX`, 'success');

    return { count: transformCount };
}

// ============================================================================
// STEP 6: Generate Page Entries (HTML + TSX)
// ============================================================================

async function generateEntries(projectRoot) {
    logSection('STEP 6: Generate Page Entries');

    const docsDir = join(projectRoot, 'docs');
    const pagesDir = join(projectRoot, 'src', 'pages');

    log(`Scanning for MDX files: ${relative(projectRoot, docsDir)}`);

    function toTitleCase(str) {
        return str.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').split(' ').filter(w => w.length > 0).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    async function scanForPages(dir, basePath = '') {
        const pages = new Map();
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = join(basePath, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === 'archived') continue;
                const subPages = await scanForPages(fullPath, relativePath);
                // Merge subPages into pages
                for (const [key, value] of subPages.entries()) {
                    pages.set(key, value);
                }
            } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
                const baseName = basename(entry.name, '.mdx');
                let pageName, title;

                // README.mdx becomes index.html for its directory
                if (baseName === 'README') {
                    const parentDir = basename(dirname(fullPath));
                    if (parentDir === 'docs') {
                        pageName = 'index';
                        title = 'DyGram';
                    } else {
                        // Preserve directory path for README files
                        // examples/README.mdx → examples-index
                        const dirPath = dirname(relativePath);
                        const pathWithoutDocs = dirPath.replace(/\\/g, '/');
                        pageName = `${pathWithoutDocs.replace(/\//g, '-')}-index`;
                        title = toTitleCase(parentDir);
                    }
                } else {
                    // Preserve directory path for regular files
                    // examples/basic.mdx → examples-basic (pageName) + examples/ (dirPath)
                    const dirPath = dirname(relativePath);
                    if (dirPath && dirPath !== '.') {
                        const pathPrefix = dirPath.replace(/\\/g, '/').replace(/\//g, '-');
                        pageName = `${pathPrefix}-${baseName}`;
                    } else {
                        pageName = baseName;
                    }
                    title = toTitleCase(baseName);
                }

                const dirPath = dirname(relativePath).replace(/\\/g, '/');
                pages.set(pageName, {
                    htmlFile: `${pageName}.html`,
                    tsxFile: `${pageName}.tsx`,
                    mdxPath: relative(projectRoot, fullPath),
                    title,
                    dirPath: dirPath === '.' ? '' : dirPath
                });
            }
        }
        return pages;
    }

    const pages = await scanForPages(docsDir);
    log(`Found ${pages.size} MDX pages`, 'info');

    logSubsection('Generating page files');

    for (const [pageName, page] of pages.entries()) {
        // Determine HTML file path - create folder structure
        let htmlFilePath;
        if (pageName === 'index') {
            // Root index.html
            htmlFilePath = join(projectRoot, 'index.html');
        } else if (pageName.endsWith('-index')) {
            // Section index: getting-started-index → getting-started/index.html
            // or examples-index → examples/index.html
            // Use stored dirPath to avoid parsing issues
            if (page.dirPath) {
                htmlFilePath = join(projectRoot, page.dirPath, 'index.html');
            } else {
                const sectionPath = pageName.replace(/-index$/, '').replace(/-/g, '/');
                htmlFilePath = join(projectRoot, sectionPath, 'index.html');
            }
        } else {
            // Regular page: some-page → some-page/index.html
            // or examples-basic → examples/basic/index.html
            // Extract just the filename part (after the last hyphen that's part of dir path)
            const fileName = page.dirPath
                ? pageName.substring(page.dirPath.replace(/\//g, '-').length + 1)
                : pageName;

            if (page.dirPath) {
                htmlFilePath = join(projectRoot, page.dirPath, fileName, 'index.html');
            } else {
                htmlFilePath = join(projectRoot, fileName, 'index.html');
            }
        }

        // Use absolute paths with base URL for all resources to ensure they work at any nesting level
        // This prevents 404 errors on child pages like /examples/basic/
        // Base URL is used in production (e.g., /machine/) and defaults to / in development

        // Generate HTML entry
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DyGram | ${page.title}</title>
    <link rel="stylesheet" href="${baseUrl}static/styles/main.css">
    <link rel="stylesheet" href="${baseUrl}static/styles/carousel.css">
    <link rel="icon" type="image/jpeg" href="${baseUrl}icon.jpg">
</head>
<body>
    <div id="root"></div>
    <script type="module" src="${baseUrl}src/pages/${pageName}.tsx"></script>
</body>
</html>
`;
        await mkdir(dirname(htmlFilePath), { recursive: true });
        await writeFile(htmlFilePath, htmlContent, 'utf-8');

        // Generate TSX entry
        const importName = basename(page.mdxPath, '.mdx');
        const relativeMdxPath = relative(pagesDir, join(projectRoot, page.mdxPath)).replace(/\\/g, '/');
        const tsxContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { PageLayout } from '../components/PageLayout';
import Content from '${relativeMdxPath}';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <PageLayout title="${importName}" backLink={${pageName !== 'index'}}>
            <Content />
        </PageLayout>
    </React.StrictMode>
);
`;
        await writeFile(join(pagesDir, page.tsxFile), tsxContent, 'utf-8');

        const relativeHtmlPath = relative(projectRoot, htmlFilePath);
        log(`  ${pageName}: ${relativeHtmlPath} + ${page.tsxFile}`);
    }

    log(`Generated ${pages.size} HTML files and ${pages.size} TSX files`, 'success');

    return { count: pages.size, pages: Array.from(pages.keys()) };
}

// ============================================================================
// STEP 7: Validate Links
// ============================================================================

async function validateLinks(projectRoot) {
    logSection('STEP 7: Validate Links');

    const docsDir = join(projectRoot, 'docs');

    log('Scanning markdown files for links...');

    // Collect all markdown files (excluding archived)
    async function collectMarkdownFiles(dir, basePath = '') {
        const files = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = join(basePath, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === 'archived') continue;
                files.push(...await collectMarkdownFiles(fullPath, relativePath));
            } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
                files.push({ fullPath, relativePath });
            }
        }
        return files;
    }

    const markdownFiles = await collectMarkdownFiles(docsDir);

    // Extract links from markdown
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    const allLinks = [];
    const brokenLinks = [];

    for (const { fullPath, relativePath } of markdownFiles) {
        const content = await readFile(fullPath, 'utf-8');
        const matches = [...content.matchAll(linkPattern)];

        for (const match of matches) {
            const linkText = match[1];
            const linkUrl = match[2];

            // Skip external links and anchors
            if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://') || linkUrl.startsWith('#')) {
                continue;
            }

            allLinks.push({ file: relativePath, linkText, linkUrl });

            // Check if relative link target exists
            const targetPath = join(dirname(fullPath), linkUrl.split('#')[0]);
            try {
                await stat(targetPath);
            } catch (error) {
                brokenLinks.push({ file: relativePath, linkText, linkUrl });
            }
        }
    }

    log(`Scanned ${markdownFiles.length} files`, 'info');
    log(`Found ${allLinks.length} internal links`, 'info');

    if (brokenLinks.length > 0) {
        log(`Found ${brokenLinks.length} potentially broken links`, 'warn');
        logSubsection('Broken links');
        for (const link of brokenLinks.slice(0, 10)) {
            log(`  ${link.file}: [${link.linkText}](${link.linkUrl})`, 'warn');
        }
        if (brokenLinks.length > 10) {
            log(`  ... and ${brokenLinks.length - 10} more`, 'warn');
        }
    } else {
        log('All internal links are valid', 'success');
    }

    return { total: allLinks.length, broken: brokenLinks.length };
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
    const projectRoot = join(__dirname, '..');
    const startTime = Date.now();

    console.log(`\n${colors.bright}${colors.magenta}╔${'═'.repeat(68)}╗${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}║${' '.repeat(20)}UNIFIED PREBUILD SCRIPT${' '.repeat(25)}║${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}╚${'═'.repeat(68)}╝${colors.reset}\n`);

    log(`Project root: ${projectRoot}`, 'info');
    log(`Node version: ${process.version}`, 'info');
    log(`Base URL: ${baseUrl}`, 'info');

    try {
        // Step 1: Extract examples
        const examples = await extractExamplesStep(projectRoot);

        // Step 2: Generate examples list
        const examplesList = await generateExamplesList(projectRoot);

        // Step 3: Generate hierarchy
        const hierarchy = await generateHierarchy(projectRoot);

        // Step 4: Generate documentation index
        const docIndex = await generateDocumentationIndex(projectRoot);

        // Step 5: Transform markdown to MDX
        const transform = await transformMarkdownToMdx(projectRoot);

        // Step 6: Generate entries
        const entries = await generateEntries(projectRoot);

        // Step 7: Validate links
        const validation = await validateLinks(projectRoot);

        // Summary
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        logSection('BUILD SUMMARY');
        log(`Examples extracted: ${examples.count}`, 'success');
        log(`Examples cataloged: ${examplesList.count} (${examplesList.categories} categories)`, 'success');
        log(`Documentation hierarchy: ${hierarchy.sections} sections, ${hierarchy.pages} pages`, 'success');
        log(`Documentation index: ${docIndex.count} files indexed`, 'success');
        log(`Markdown transformed: ${transform.count} files to MDX`, 'success');
        log(`Generated entries: ${entries.count} pages`, 'success');
        log(`Link validation: ${validation.total} links (${validation.broken} broken)`, validation.broken > 0 ? 'warn' : 'success');
        log(`Total duration: ${duration}s`, 'info');
        log('Note: Sitemap will be generated after vite build', 'info');

        console.log(`\n${colors.bright}${colors.green}✓ Prebuild completed successfully${colors.reset}\n`);

        if (validation.broken > 0) {
            log('Warning: Some broken links were detected. Please review and fix them.', 'warn');
            process.exit(0); // Don't fail the build, just warn
        }
    } catch (error) {
        logSection('BUILD FAILED');
        log(error.message, 'error');
        console.error(error.stack);
        process.exit(1);
    }
}

main();
