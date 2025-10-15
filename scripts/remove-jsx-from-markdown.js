#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Remove JSX/React components from markdown files and convert to plain markdown
 */

function removeJSXFromMarkdown(content) {
  let modified = content;

  // Remove standalone <Layout> and </Layout> tags
  modified = modified.replace(/^<Layout>\s*$/gm, '');
  modified = modified.replace(/^<\/Layout>\s*$/gm, '');

  // Remove <PageLayout ...> opening tags (keep the content)
  modified = modified.replace(/<PageLayout[^>]*>\s*/g, '');

  // Remove <ExampleLoader> components - these should use markdown code blocks instead
  // But since they're loading generated examples, just remove them
  modified = modified.replace(/<ExampleLoader[^>]*\/>\s*/g, '');

  // Remove <Example> components
  modified = modified.replace(/<Example[^>]*\/>\s*/g, '');

  // Remove <CodeEditor> components - replace with indication that code block should be there
  // Match multi-line CodeEditor components
  modified = modified.replace(/<CodeEditor[\s\S]*?\/>/g, (match) => {
    // Try to extract the code from initialCode prop
    const codeMatch = match.match(/initialCode=\{`([\s\S]*?)`\}/);
    if (codeMatch) {
      const code = codeMatch[1];
      // Determine language from the language prop, default to dygram
      const langMatch = match.match(/language="([^"]+)"/);
      const lang = langMatch ? langMatch[1] : 'dygram';
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    return ''; // Remove if we can't extract code
  });

  // Remove any remaining JSX-like tags with capital letters (but not TypeScript generics)
  // Only remove if it's a standalone tag line (not part of inline code)
  modified = modified.split('\n').map(line => {
    // Don't touch lines that are in code blocks or inline code
    if (line.trim().startsWith('```') || line.includes('`<') || line.includes('<T>') || line.includes('<Promise') || line.includes('<Array') || line.includes('<Map')) {
      return line;
    }
    // Remove lines that are just opening/closing JSX tags
    if (/^\s*<[A-Z][a-zA-Z0-9]*[^>]*>\s*$/.test(line) || /^\s*<\/[A-Z][a-zA-Z0-9]*>\s*$/.test(line)) {
      return '';
    }
    return line;
  }).join('\n');

  // Clean up excessive newlines (more than 3 in a row)
  modified = modified.replace(/\n{4,}/g, '\n\n\n');

  return modified;
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const modified = removeJSXFromMarkdown(content);

  if (content !== modified) {
    fs.writeFileSync(filePath, modified, 'utf8');
    return true;
  }
  return false;
}

function scanAndFixDirectory(dirPath, stats = { fixed: 0, total: 0 }) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') &&
          entry.name !== 'node_modules' &&
          entry.name !== 'archive') {
        scanAndFixDirectory(fullPath, stats);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      stats.total++;
      const relativePath = path.relative(process.cwd(), fullPath);

      if (processFile(fullPath)) {
        stats.fixed++;
        console.log(`✅ Fixed: ${relativePath}`);
      }
    }
  }

  return stats;
}

console.log('🔧 Removing JSX components from markdown files...\n');

const docsPath = path.join(process.cwd(), 'docs');
const stats = scanAndFixDirectory(docsPath);

console.log(`\n📊 Summary:`);
console.log(`   Total markdown files: ${stats.total}`);
console.log(`   Files modified: ${stats.fixed}`);
console.log(`   Files unchanged: ${stats.total - stats.fixed}`);

if (stats.fixed > 0) {
  console.log('\n✅ JSX components removed from markdown files.');
  console.log('💡 Run the build again to verify all pages render correctly.');
} else {
  console.log('\n✅ No files needed modification.');
}
