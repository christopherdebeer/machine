#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Files to convert
const filesToConvert = [
  'docs/QuickStart.mdx',
  'docs/Api.mdx',
  'docs/Evolution.mdx',
  'docs/ReactMdxSetup.md', // Already markdown, just rename if needed
  'docs/RuntimeAndEvolution.mdx',
  'docs/LangiumQuickstart.mdx',
  // Index files in subdirectories
  'docs/architecture/index.mdx',
  'docs/examples/index.mdx',
  'docs/getting-started/index.mdx',
  'docs/guides/index.mdx',
  'docs/integration/index.mdx',
  'docs/reference/index.mdx',
  'docs/resources/index.mdx'
];

/**
 * Extract title from MDX/MD content
 */
function extractTitle(content) {
  // Try PageLayout title attribute
  const pageLayoutMatch = content.match(/<PageLayout\s+title="([^"]+)"/);
  if (pageLayoutMatch) return pageLayoutMatch[1];

  // Try function component pattern: <PageLayout title="...">
  const funcMatch = content.match(/title:\s*"([^"]+)"/);
  if (funcMatch) return funcMatch[1];

  // Try first h1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1];

  return null;
}

/**
 * Convert Carousel component to markdown codeblocks
 */
function convertCarousel(content) {
  const carouselRegex = /<Carousel\s+slides=\{(\[[^\]]+\])\}\s*\/>/gs;

  return content.replace(carouselRegex, (match, slidesArray) => {
    try {
      // Parse the slides array (simplified - assumes clean JSON-like structure)
      const slides = eval(slidesArray); // Using eval for simplicity since this is build-time

      let markdown = '\n';
      slides.forEach((slide, idx) => {
        markdown += `### Example ${idx + 1}\n\n`;
        markdown += '```dygram ' + (slide.id || `example-${idx}`) + '\n';
        markdown += slide.code + '\n';
        markdown += '```\n\n';
      });

      return markdown;
    } catch (e) {
      console.warn('Failed to parse Carousel:', e.message);
      return match;
    }
  });
}

/**
 * Convert CodeEditor components to markdown codeblocks
 */
function convertCodeEditor(content) {
  // Pattern: <CodeEditor initialCode={`...`} language="..." ... />
  const codeEditorRegex = /<CodeEditor\s+initialCode=\{`([^`]*)`\}[^>]*language="([^"]*)"[^>]*\/>/gs;

  return content.replace(codeEditorRegex, (match, code, language) => {
    return '\n```' + language + '\n' + code + '\n```\n';
  });
}

/**
 * Convert inline JSX div/pre/code blocks to markdown codeblocks
 */
function convertInlineCodeBlocks(content) {
  // Pattern: <pre ...>{`code here`}</pre>
  const preRegex = /<pre[^>]*>\{`([^`]*)`\}<\/pre>/gs;

  return content.replace(preRegex, (match, code) => {
    return '\n```\n' + code + '\n```\n';
  });
}

/**
 * Remove React imports
 */
function removeReactImports(content) {
  return content
    .replace(/^import\s+.*from\s+['"]react['"];?\s*$/gm, '')
    .replace(/^import\s+.*from\s+['"]react-dom\/client['"];?\s*$/gm, '')
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"]\.\.\/src\/components\/[^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"]\.\.\/components\/[^'"]+['"];?\s*$/gm, '');
}

/**
 * Convert functional component to markdown
 */
function convertFunctionalComponent(content, title) {
  // Remove export default function wrapper
  content = content.replace(/^export\s+default\s+function\s+\w+\(\)\s*\{?\s*$/gm, '');
  content = content.replace(/^export\s+function\s+\w+\(\)\s*\{?\s*$/gm, '');

  // Remove return <PageLayout>...</PageLayout>
  content = content.replace(/return\s+<PageLayout[^>]*>/gs, '');
  content = content.replace(/<\/PageLayout>\s*;?\s*\}?\s*$/gs, '');

  // Remove JSX fragments
  content = content.replace(/<>\s*/g, '');
  content = content.replace(/<\/>\s*/g, '');

  // Remove standalone closing braces
  content = content.replace(/^\s*\}\s*$/gm, '');

  return content;
}

/**
 * Remove PageLayout wrapper
 */
function removePageLayout(content) {
  content = content.replace(/<PageLayout[^>]*>\s*/gs, '');
  content = content.replace(/<\/PageLayout>\s*/gs, '');
  return content;
}

/**
 * Convert inline JSX styling to markdown
 */
function convertJSXStyling(content) {
  // Remove inline style attributes
  content = content.replace(/\s+style=\{[^}]+\}/g, '');
  content = content.replace(/\s+className="[^"]*"/g, '');

  // Convert <div> with content to just content (keep structure)
  // This is simplistic - a more robust solution would parse the JSX tree

  return content;
}

/**
 * Clean up JSX remnants
 */
function cleanupJSX(content) {
  // Remove empty imports
  content = content.replace(/^import\s*;\s*$/gm, '');

  // Remove extra blank lines (more than 2 consecutive)
  content = content.replace(/\n{4,}/g, '\n\n\n');

  // Trim
  content = content.trim();

  return content;
}

/**
 * Main conversion function
 */
function convertMDXToMarkdown(filePath) {
  const fullPath = path.join(rootDir, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const originalContent = content;

  // Extract title before conversion
  const title = extractTitle(content);

  // Step 1: Convert React components to markdown equivalents
  content = convertCarousel(content);
  content = convertCodeEditor(content);
  content = convertInlineCodeBlocks(content);

  // Step 2: Remove React imports
  content = removeReactImports(content);

  // Step 3: Remove PageLayout wrapper
  content = removePageLayout(content);

  // Step 4: Convert functional components
  if (content.includes('export default function') || content.includes('export function')) {
    content = convertFunctionalComponent(content, title);
  }

  // Step 5: Convert JSX styling
  content = convertJSXStyling(content);

  // Step 6: Clean up JSX remnants
  content = cleanupJSX(content);

  // Step 7: Add title as h1 if we have one and content doesn't start with h1
  if (title && !content.match(/^#\s+/)) {
    content = `# ${title}\n\n${content}`;
  }

  // Step 8: Escape problematic patterns for MDX parser
  content = content.replace(/<-->/g, '`<-->`');
  content = content.replace(/<T>/g, '`<T>`');
  content = content.replace(/<([A-Z]\w*)>/g, '`<$1>`');

  // Only write if content changed significantly
  if (content === originalContent) {
    console.log(`⏭️  No changes needed: ${filePath}`);
    return false;
  }

  // Write to .md file (keep .mdx for now, we'll rename after)
  const mdPath = fullPath.replace(/\.mdx?$/, '.md');
  fs.writeFileSync(mdPath, content, 'utf-8');

  console.log(`✅ Converted: ${filePath} -> ${path.basename(mdPath)}`);
  return true;
}

/**
 * Convert all files
 */
function main() {
  console.log('🔄 Converting remaining MDX files to markdown...\n');

  let convertedCount = 0;
  let errorCount = 0;

  for (const file of filesToConvert) {
    try {
      const converted = convertMDXToMarkdown(file);
      if (converted) convertedCount++;
    } catch (error) {
      console.error(`❌ Error converting ${file}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n✨ Conversion complete!`);
  console.log(`   Converted: ${convertedCount} files`);
  console.log(`   Errors: ${errorCount} files`);

  // List what should remain as MDX
  console.log('\n📋 Files that should remain as MDX:');
  console.log('   - docs/Index.mdx (root homepage)');
  console.log('   - src/pages/index.tsx (React entry)');
  console.log('   - src/pages/playground.tsx (React entry)');
}

main();
