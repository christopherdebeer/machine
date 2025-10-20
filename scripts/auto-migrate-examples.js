#!/usr/bin/env node

import { readdir, readFile, writeFile, appendFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Auto-migrate remaining examples to documentation
 *
 * Strategy:
 * - For examples that have a corresponding docs/examples/{category}.md, append them
 * - For examples without a corresponding doc, list them for manual review
 */

const EXAMPLES_TO_MIGRATE = [
    'advanced/cel-conditions.dygram',
    'advanced/complete-example.dygram',
    'advanced/optional-types.dygram',
    'attributes/deep-attributes.dygram',
    'basic/empty-and-minimal.dygram',
    'context/nested-access.dygram',
    'documentation/complete-phase3.dygram',
    'edges/quoted-labels.dygram',
    'model-configuration/machine-level-model.dygram',
    'nesting/nested-2-levels.dygram',
    'nesting/nested-3-levels.dygram',
    'nesting/optional-types-example.dygram',
    'nesting/semantic-nesting-example.dygram',
    'nesting/state-modules-example.dygram',
    'stress/large-50-nodes.dygram',
    'workflows/data-pipeline.dygram'
];

async function main() {
    const projectRoot = join(__dirname, '..');
    const examplesDir = join(projectRoot, 'examples');
    const docsExamplesDir = join(projectRoot, 'docs', 'examples');

    console.log('🔄 Auto-migrating remaining examples...\n');

    for (const examplePath of EXAMPLES_TO_MIGRATE) {
        const category = dirname(examplePath);
        const filename = basename(examplePath);
        const fullExamplePath = join(examplesDir, examplePath);
        const docPath = join(docsExamplesDir, `${category}.md`);

        console.log(`📄 Processing: ${examplePath}`);

        try {
            // Read example content
            const exampleContent = await readFile(fullExamplePath, 'utf-8');

            // Generate a readable name from filename
            const nameWithoutExt = basename(filename, filename.endsWith('.dygram') ? '.dygram' : '.mach');
            const readableName = nameWithoutExt
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            // Try to get machine title from content
            let machineTitle = readableName;
            const titleMatch = exampleContent.match(/^machine\s+"([^"]+)"/m);
            if (titleMatch) {
                machineTitle = titleMatch[1];
            }

            // Check if doc file exists
            let docContent = '';
            let docExists = false;
            try {
                docContent = await readFile(docPath, 'utf-8');
                docExists = true;
            } catch (error) {
                // Doc doesn't exist
            }

            if (docExists) {
                // Append to existing doc
                const newSection = `\n### \`${filename}\`\n${machineTitle}\n\n\`\`\`dygram examples/${examplePath}\n${exampleContent}\n\`\`\`\n`;

                await appendFile(docPath, newSection, 'utf-8');
                console.log(`   ✓ Added to docs/examples/${category}.md\n`);
            } else {
                console.log(`   ⚠️  No doc file: docs/examples/${category}.md`);
                console.log(`   Manual migration needed\n`);
            }

        } catch (error) {
            console.error(`   ✗ Error: ${error.message}\n`);
        }
    }

    console.log('✅ Auto-migration complete!\n');
    console.log('Run: node scripts/extract-examples-from-docs.js');
    console.log('To verify all examples extract correctly.\n');
}

main().catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
});
