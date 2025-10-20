#!/usr/bin/env node

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Migrate existing example files into documentation markdown files
 *
 * This script helps consolidate examples from the examples folder
 * into documentation markdown files by:
 * 1. Scanning existing examples
 * 2. Finding or creating appropriate documentation files
 * 3. Embedding examples with proper path metadata
 */

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
                // Skip README files and generated folders
                const subExamples = await scanExamples(fullPath, baseDir);
                examples.push(...subExamples);
            } else if (entry.isFile() && (entry.name.endsWith('.dygram') || entry.name.endsWith('.mach'))) {
                const relativePath = relative(baseDir, fullPath);
                const content = await readFile(fullPath, 'utf-8');

                examples.push({
                    path: relativePath,
                    fullPath: fullPath,
                    filename: entry.name,
                    content: content,
                    category: dirname(relativePath)
                });
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error.message);
    }

    return examples;
}

/**
 * Check if an example is already in documentation
 */
async function isExampleInDocs(examplePath, docsDir) {
    const docsFiles = await scanMarkdownFiles(docsDir);

    for (const docFile of docsFiles) {
        const content = await readFile(docFile, 'utf-8');
        if (content.includes(examplePath)) {
            return { embedded: true, docFile: relative(docsDir, docFile) };
        }
    }

    return { embedded: false };
}

/**
 * Scan for markdown files in docs
 */
async function scanMarkdownFiles(dir) {
    const files = [];

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                    const subFiles = await scanMarkdownFiles(fullPath);
                    files.push(...subFiles);
                }
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        console.error(`Error scanning ${dir}:`, error.message);
    }

    return files;
}

/**
 * Main function
 */
async function main() {
    const projectRoot = join(__dirname, '..');
    const examplesDir = join(projectRoot, 'examples');
    const docsDir = join(projectRoot, 'docs');

    console.log('📋 Analyzing migration status...\n');

    // Scan all examples
    console.log('🔍 Scanning examples directory...');
    const examples = await scanExamples(examplesDir);
    console.log(`   Found ${examples.length} example files\n`);

    // Group by category
    const byCategory = {};
    for (const example of examples) {
        const category = example.category;
        if (!byCategory[category]) {
            byCategory[category] = [];
        }
        byCategory[category].push(example);
    }

    console.log('📁 Examples by category:');
    for (const [category, examples] of Object.entries(byCategory)) {
        console.log(`   ${category}: ${examples.length} file(s)`);
    }
    console.log('');

    // Check which examples are already in docs
    console.log('🔎 Checking which examples are already in documentation...\n');

    let alreadyEmbedded = 0;
    let needsMigration = 0;
    const migrationNeeded = [];

    for (const example of examples) {
        const examplePath = `examples/${example.path}`;
        const status = await isExampleInDocs(examplePath, docsDir);

        if (status.embedded) {
            console.log(`   ✓ ${examplePath} (in ${status.docFile})`);
            alreadyEmbedded++;
        } else {
            console.log(`   ✗ ${examplePath} (needs migration)`);
            needsMigration++;
            migrationNeeded.push(example);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 MIGRATION STATUS SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total examples: ${examples.length}`);
    console.log(`Already embedded in docs: ${alreadyEmbedded}`);
    console.log(`Need migration: ${needsMigration}`);
    console.log('='.repeat(70) + '\n');

    if (migrationNeeded.length > 0) {
        console.log('📝 Examples that need migration:\n');

        // Group migration needed by category
        const migrationByCategory = {};
        for (const example of migrationNeeded) {
            const category = example.category;
            if (!migrationByCategory[category]) {
                migrationByCategory[category] = [];
            }
            migrationByCategory[category].push(example);
        }

        for (const [category, examples] of Object.entries(migrationByCategory)) {
            console.log(`\n${category}/ (${examples.length} files):`);
            console.log('─'.repeat(70));

            // Check if there's a corresponding doc file
            const docPath = join(docsDir, 'examples', `${category}.md`);
            let docExists = false;
            try {
                await stat(docPath);
                docExists = true;
                console.log(`   Documentation: docs/examples/${category}.md (exists)`);
            } catch {
                console.log(`   Documentation: docs/examples/${category}.md (needs creation)`);
            }

            console.log('   Files to migrate:');
            for (const example of examples) {
                console.log(`     - ${example.filename}`);
            }

            if (docExists) {
                console.log(`\n   To migrate, add to docs/examples/${category}.md:`);
                console.log(`   \`\`\`dygram examples/${category}/${examples[0].filename}`);
                console.log(`   (paste example content here)`);
                console.log(`   \`\`\``);
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log('💡 MIGRATION GUIDE');
        console.log('='.repeat(70));
        console.log('To migrate an example to documentation:');
        console.log('');
        console.log('1. Find or create the appropriate documentation file');
        console.log('   (e.g., docs/examples/{category}.md or docs/guides/{topic}.md)');
        console.log('');
        console.log('2. Add a code block with the full path in the fence:');
        console.log('   ```dygram examples/{category}/{filename}.dygram');
        console.log('   (paste the example content here)');
        console.log('   ```');
        console.log('');
        console.log('3. Run extraction to verify:');
        console.log('   npm run extract:examples');
        console.log('');
        console.log('4. Once all examples are migrated, remove old example files');
        console.log('='.repeat(70) + '\n');
    } else {
        console.log('✅ All examples are already embedded in documentation!');
        console.log('   You can safely remove the old example files.\n');
    }
}

main().catch(error => {
    console.error('\n❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
});
