#!/usr/bin/env node

import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse markdown content and extract structure
 */
function parseMarkdown(content) {
    const lines = content.split('\n');
    const structure = {
        title: '',
        sections: [],
        currentSection: null
    };

    for (const line of lines) {
        // Extract title from # heading
        if (line.startsWith('# ')) {
            structure.title = line.substring(2).trim();
        }
        // Extract section from ## heading
        else if (line.startsWith('## ')) {
            if (structure.currentSection) {
                structure.sections.push(structure.currentSection);
            }
            structure.currentSection = {
                heading: line.substring(3).trim(),
                content: []
            };
        }
        // Add content to current section
        else if (structure.currentSection) {
            structure.currentSection.content.push(line);
        }
    }

    // Push the last section
    if (structure.currentSection) {
        structure.sections.push(structure.currentSection);
    }

    return structure;
}

/**
 * Convert markdown README to MDX with ExampleLoader components
 */
function convertToMDX(readmeContent, exampleFiles, categoryPath) {
    const structure = parseMarkdown(readmeContent);

    // Start with imports
    let mdx = `import { Layout } from '../components/Layout';\n`;
    mdx += `import { ExampleLoader } from '../components/ExampleLoader';\n\n`;
    mdx += `<Layout>\n\n`;

    // Add title
    if (structure.title) {
        mdx += `# ${structure.title}\n\n`;
    }

    // Add sections
    for (const section of structure.sections) {
        mdx += `## ${section.heading}\n\n`;

        let sectionContent = section.content.join('\n');

        // Replace example file references with ExampleLoader components
        for (const file of exampleFiles) {
            const fileName = basename(file);
            const examplePath = `examples/${categoryPath}/${fileName}`;

            // Look for mentions of the filename in the content
            const filePattern = new RegExp(`\`${fileName}\``, 'g');
            if (sectionContent.match(filePattern)) {
                // Add ExampleLoader after the first mention
                sectionContent = sectionContent.replace(
                    filePattern,
                    `\`${fileName}\`\n\n<ExampleLoader path="${examplePath}" height="300px" />`
                );
            }
        }

        mdx += sectionContent + '\n\n';
    }

    mdx += `</Layout>\n`;

    return mdx;
}

/**
 * Generate example pages from README files
 */
async function generateExamplePages() {
    const projectRoot = join(__dirname, '..');
    const examplesDir = join(projectRoot, 'examples');
    const outputDir = join(projectRoot, 'src', 'pages', 'examples');

    console.log('Generating example documentation pages...');
    console.log(`Examples directory: ${examplesDir}`);
    console.log(`Output directory: ${outputDir}`);

    // Ensure output directory exists
    try {
        await stat(outputDir);
    } catch (error) {
        await mkdir(outputDir, { recursive: true });
        console.log(`Created output directory: ${outputDir}`);
    }

    // Scan for subdirectories with README files
    const entries = await readdir(examplesDir, { withFileTypes: true });
    const categories = entries.filter(e => e.isDirectory());

    let generatedCount = 0;

    for (const category of categories) {
        const categoryPath = join(examplesDir, category.name);
        const readmePath = join(categoryPath, 'README.md');

        // Check if README exists
        try {
            await stat(readmePath);
        } catch (error) {
            console.log(`  Skipping ${category.name}: No README.md found`);
            continue;
        }

        console.log(`\n  Processing ${category.name}/...`);

        // Read README content
        const readmeContent = await readFile(readmePath, 'utf-8');

        // Get list of example files in this category
        const categoryFiles = await readdir(categoryPath);
        const exampleFiles = categoryFiles.filter(f =>
            f.endsWith('.dygram') || f.endsWith('.mach')
        );

        console.log(`    Found ${exampleFiles.length} example files`);

        // Convert to MDX
        const mdxContent = convertToMDX(
            readmeContent,
            exampleFiles,
            category.name
        );

        // Write MDX file
        const outputPath = join(outputDir, `${category.name}.mdx`);
        await writeFile(outputPath, mdxContent, 'utf-8');

        console.log(`    Generated: ${relative(projectRoot, outputPath)}`);
        generatedCount++;
    }

    console.log(`\n✅ Generated ${generatedCount} example documentation pages`);

    // Generate index file
    await generateExamplesIndex(categories, outputDir, projectRoot);
}

/**
 * Generate an index file listing all example categories
 */
async function generateExamplesIndex(categories, outputDir, projectRoot) {
    console.log('\n  Generating examples index...');

    let indexContent = `import { Layout } from '../components/Layout';\n\n`;
    indexContent += `<Layout>\n\n`;
    indexContent += `# Example Categories\n\n`;
    indexContent += `Browse DyGram examples organized by feature category:\n\n`;

    for (const category of categories) {
        const categoryPath = join(projectRoot, 'examples', category.name);
        const readmePath = join(categoryPath, 'README.md');

        try {
            await stat(readmePath);
            const readmeContent = await readFile(readmePath, 'utf-8');
            const structure = parseMarkdown(readmeContent);

            // Create a title-cased name
            const displayName = category.name
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            indexContent += `## [${displayName}](${category.name}.html)\n\n`;

            if (structure.title) {
                indexContent += `${structure.title}\n\n`;
            }
        } catch (error) {
            // Skip if no README
        }
    }

    indexContent += `</Layout>\n`;

    const indexPath = join(outputDir, 'index.mdx');
    await writeFile(indexPath, indexContent, 'utf-8');

    console.log(`    Generated: ${relative(projectRoot, indexPath)}`);
}

/**
 * Main function
 */
async function main() {
    try {
        await generateExamplePages();
        console.log('\n✅ Example page generation complete!');
    } catch (error) {
        console.error('\n❌ Error generating example pages:', error);
        process.exit(1);
    }
}

main();
