#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Scan all .md files for JSX remnants that need to be cleaned up
 */

function hasJSXRemnants(content) {
  const lines = content.split('\n');
  const issues = [];
  let inCodeBlock = false;

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Track code block boundaries
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return;
    }

    // Skip lines inside code blocks (these are example code, not JSX remnants)
    if (inCodeBlock) {
      return;
    }

    // Check for "return <Component />" patterns (outside code blocks)
    if (/return <\w+Content \/>\s*/.test(line.trim())) {
      issues.push({ line: lineNum, pattern: 'return <Component />', text: line.trim() });
    }
    // Check for stray semicolons on their own line (outside code blocks)
    if (/^\s*;\s*$/.test(line)) {
      issues.push({ line: lineNum, pattern: 'stray semicolon', text: line });
    }
    // Check for "return (" patterns (outside code blocks)
    if (/^return \(\s*$/.test(line.trim())) {
      issues.push({ line: lineNum, pattern: 'return (', text: line.trim() });
    }
    // Check for closing ");" at the start of a line (outside code blocks)
    // This pattern specifically catches JSX remnants, not normal code indented closing parens
    if (/^\s*\);\s*$/.test(line) && !/^\s{4,}\);/.test(line)) {
      issues.push({ line: lineNum, pattern: 'closing );', text: line });
    }
  });

  return issues;
}

function scanDirectory(dirPath, results = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath, results);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const issues = hasJSXRemnants(content);

      if (issues.length > 0) {
        const relativePath = path.relative(process.cwd(), fullPath);
        results.push({ file: relativePath, issues });
      }
    }
  }

  return results;
}

console.log('Scanning for markdown files with JSX remnants...\n');

const docsPath = path.join(process.cwd(), 'docs');
const problematicFiles = scanDirectory(docsPath);

if (problematicFiles.length === 0) {
  console.log('✅ No JSX remnants found in any .md files!');
} else {
  console.log(`Found ${problematicFiles.length} file(s) with JSX remnants:\n`);

  for (const { file, issues } of problematicFiles) {
    console.log(`📄 ${file}`);
    for (const issue of issues) {
      console.log(`   Line ${issue.line}: ${issue.pattern}`);
      console.log(`   → "${issue.text}"`);
    }
    console.log();
  }

  console.log('\n⚠️  These files need to be cleaned up in source.');
}

// Exit with error code if issues found (useful for CI)
process.exit(problematicFiles.length > 0 ? 1 : 0);
