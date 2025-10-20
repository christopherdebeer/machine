#!/usr/bin/env node

import { readdir, readFile, writeFile, appendFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Embed ALL remaining examples into docs/examples/*.md files
 *
 * For examples that are currently referenced but not embedded,
 * read them and append to the appropriate docs/examples/{category}.md file
 */

async function embedExamplesInCategory(category, exampleFiles, projectRoot) {
    const docsPath = join(projectRoot, 'docs', 'examples', `${category}.md`);

    console.log(`\n📂 Processing category: ${category}`);
    console.log(`   Doc file: docs/examples/${category}.md`);
    console.log(`   Examples to embed: ${exampleFiles.length}`);

    for (const exampleFile of exampleFiles) {
        const examplePath = join(projectRoot, 'examples', category, exampleFile);
        const content = await readFile(examplePath, 'utf-8');

        // Generate a readable name
        const nameWithoutExt = basename(exampleFile, exampleFile.endsWith('.dygram') ? '.dygram' : '.mach');
        const readableName = nameWithoutExt
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        // Get machine title if available
        let machineTitle = readableName;
        const titleMatch = content.match(/^machine\s+"([^"]+)"/m);
        if (titleMatch) {
            machineTitle = titleMatch[1];
        }

        // Append to doc file
        const section = `\n### \`${exampleFile}\`\n\n${machineTitle}\n\n\`\`\`dygram examples/${category}/${exampleFile}\n${content}\n\`\`\`\n`;

        await appendFile(docsPath, section, 'utf-8');
        console.log(`   ✓ Embedded: ${exampleFile}`);
    }
}

async function main() {
    const projectRoot = join(__dirname, '..');

    // Categories and their remaining examples to embed
    // These are examples currently in docs that only have reference links, not embedded code
    const REMAINING_EXAMPLES = {
        'meta-programming': [
            'tool-creation.dygram',
            'self-healing.dygram',
            'self-modifying-pipeline.dygram',
            'conditional-evolution.dygram',
            'rails-meta-example.dygram'
        ],
        'rails': [
            'auto-transitions.mach',
            'dynamic-tool-construction.mach',
            'phase-specific-context.mach',
            'self-improving-pipeline.mach',
            'tool-review-improvement.mach'
        ],
        'validation': [
            'complete-validated.dygram',
            'type-checking.dygram',
            'graph-validation.dygram',
            'semantic-validation.dygram'
        ],
        'complex': [
            'complex-machine.dygram',
            'context-heavy.dygram',
            'unicode-machine.dygram'
        ],
        'advanced': [
            'annotations.dygram',
            'dependency-inference.dygram',
            'error-handling.dygram',
            'multiplicity.dygram'
        ],
        'documentation': [
            'notes-and-generics.dygram'
        ],
        'edge-cases': [
            'edge-cases-collection.dygram',
            'special-characters.dygram'
        ],
        'edges': [
            'basic-edges.dygram',
            'relationship-types.dygram'
        ],
        'context': [
            'context-management.mach',
            'template-variables.mach'
        ],
        'nesting': [
            'deep-nested-5-levels.dygram'
        ],
        'workflows': [
            'ci-cd-pipeline.dygram',
            'code-generation-demo.dygram',
            'order-processing.dygram',
            'smart-task-prioritizer.dygram',
            'user-onboarding.dygram'
        ],
        'model-configuration': [
            'task-specific-models.dygram'
        ]
    };

    console.log('📝 Embedding remaining examples into documentation...\n');

    let totalEmbedded = 0;

    for (const [category, examples] of Object.entries(REMAINING_EXAMPLES)) {
        await embedExamplesInCategory(category, examples, projectRoot);
        totalEmbedded += examples.length;
    }

    console.log('\n' + '='.repeat(70));
    console.log(`✅ Successfully embedded ${totalEmbedded} examples`);
    console.log('='.repeat(70));
    console.log('\nNext steps:');
    console.log('1. Run: npm run extract:examples');
    console.log('2. Verify all examples extract correctly');
    console.log('3. Delete old example files: rm -rf examples/');
    console.log('4. Re-run extraction to regenerate from docs');
    console.log('='.repeat(70) + '\n');
}

main().catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
});
