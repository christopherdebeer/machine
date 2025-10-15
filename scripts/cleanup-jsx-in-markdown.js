#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Specific files we just converted
const filesToClean = [
  'docs/QuickStart.md',
  'docs/Api.md',
  'docs/Evolution.md',
  'docs/RuntimeAndEvolution.md',
  'docs/LangiumQuickstart.md',
  'docs/architecture/index.md',
  'docs/examples/index.md',
  'docs/getting-started/index.md',
  'docs/guides/index.md',
  'docs/integration/index.md',
  'docs/reference/index.md',
  'docs/resources/index.md'
];

/**
 * Remove JSX elements from markdown
 */
function cleanupJSXElements(content) {
  // Remove div, span, section, header tags
  content = content.replace(/<\/?div[^>]*>/g, '');
  content = content.replace(/<\/?span[^>]*>/g, '');
  content = content.replace(/<\/?section[^>]*>/g, '');
  content = content.replace(/<\/?header[^>]*>/g, '');
  content = content.replace(/<\/?article[^>]*>/g, '');

  // Convert JSX pre tags to code blocks if they contain code
  content = content.replace(/<pre[^>]*>([^<]+)<\/pre>/g, (match, code) => {
    return '\n```\n' + code.trim() + '\n```\n';
  });

  // Remove remaining pre/code tags
  content = content.replace(/<\/?pre[^>]*>/g, '');
  content = content.replace(/<\/?code>/g, '`');

  // Convert <p> to just text (add spacing)
  content = content.replace(/<p[^>]*>(.*?)<\/p>/gs, '$1\n\n');

  // Convert <h1>, <h2>, <h3> to markdown headers
  content = content.replace(/<h1[^>]*>(.*?)<\/h1>/gs, '\n# $1\n\n');
  content = content.replace(/<h2[^>]*>(.*?)<\/h2>/gs, '\n## $1\n\n');
  content = content.replace(/<h3[^>]*>(.*?)<\/h3>/gs, '\n### $1\n\n');
  content = content.replace(/<h4[^>]*>(.*?)<\/h4>/gs, '\n#### $1\n\n');

  // Convert <strong> and <b> to markdown bold
  content = content.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  content = content.replace(/<b>(.*?)<\/b>/g, '**$1**');

  // Convert <em> and <i> to markdown italic
  content = content.replace(/<em>(.*?)<\/em>/g, '*$1*');
  content = content.replace(/<i>(.*?)<\/i>/g, '*$1*');

  // Convert <a> tags to markdown links
  content = content.replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gs, '[$2]($1)');

  // Remove HTML comments
  content = content.replace(/<!--.*?-->/gs, '');

  // Clean up excessive newlines (more than 3 consecutive)
  content = content.replace(/\n{4,}/g, '\n\n\n');

  // Trim each line
  content = content.split('\n').map(line => line.trimEnd()).join('\n');

  // Trim overall
  content = content.trim();

  return content;
}

/**
 * Clean up file
 */
function cleanupFile(filePath) {
  const fullPath = path.join(rootDir, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const cleaned = cleanupJSXElements(content);

  if (content !== cleaned) {
    fs.writeFileSync(fullPath, cleaned, 'utf-8');
    console.log(`✅ Cleaned: ${filePath}`);
    return true;
  }

  console.log(`⏭️  No cleanup needed: ${filePath}`);
  return false;
}

/**
 * Main function
 */
function main() {
  console.log('🧹 Cleaning up JSX remnants in markdown files...\n');

  let cleanedCount = 0;

  for (const file of filesToClean) {
    try {
      const cleaned = cleanupFile(file);
      if (cleaned) cleanedCount++;
    } catch (error) {
      console.error(`❌ Error cleaning ${file}:`, error.message);
    }
  }

  console.log(`\n✨ Cleanup complete! Cleaned ${cleanedCount} files.`);
}

main();
