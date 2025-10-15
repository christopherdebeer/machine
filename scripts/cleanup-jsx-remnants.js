#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Remove JSX remnants from markdown files that weren't properly converted from MDX
 */

const filesToFix = [
  'docs/Api.md',
  'docs/Evolution.md'
];

function cleanJSXRemnants(content) {
  let lines = content.split('\n');

  // Remove lines with JSX patterns
  lines = lines.filter(line => {
    // Remove "return <Component />" lines
    if (/^return <\w+Content \/>\s*$/.test(line.trim())) {
      return false;
    }
    // Remove stray semicolons
    if (/^\s*;\s*$/.test(line)) {
      return false;
    }
    // Remove "return (" lines
    if (/^return \(\s*$/.test(line.trim())) {
      return false;
    }
    // Remove closing ");" at the end
    if (/^\s+\);\s*$/.test(line)) {
      return false;
    }
    return true;
  });

  return lines.join('\n');
}

console.log('Cleaning JSX remnants from markdown files...\n');

let totalFixed = 0;

for (const filePath of filesToFix) {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    continue;
  }

  const originalContent = fs.readFileSync(fullPath, 'utf8');
  const cleanedContent = cleanJSXRemnants(originalContent);

  if (originalContent !== cleanedContent) {
    fs.writeFileSync(fullPath, cleanedContent, 'utf8');
    console.log(`✅ Fixed: ${filePath}`);
    totalFixed++;
  } else {
    console.log(`✓  Clean: ${filePath}`);
  }
}

console.log(`\n✅ Cleanup complete! Fixed ${totalFixed} file(s).`);
