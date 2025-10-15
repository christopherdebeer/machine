#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Comprehensive scan for JSX/React components in markdown files
 * This catches all JSX patterns, not just specific remnants
 */

function findJSXInMarkdown(content) {
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

    // Skip lines inside code blocks
    if (inCodeBlock) {
      return;
    }

    // Check for JSX opening tags: <ComponentName> or <ComponentName ...>
    // Look for tags that start with uppercase letter (React convention)
    const jsxOpeningTag = /<([A-Z][a-zA-Z0-9]*)[^>]*>/g;
    let match;
    while ((match = jsxOpeningTag.exec(line)) !== null) {
      issues.push({
        line: lineNum,
        pattern: 'JSX opening tag',
        component: match[1],
        text: line.trim()
      });
    }

    // Check for self-closing JSX tags: <ComponentName />
    const jsxSelfClosing = /<([A-Z][a-zA-Z0-9]*)[^>]*\/>/g;
    while ((match = jsxSelfClosing.exec(line)) !== null) {
      issues.push({
        line: lineNum,
        pattern: 'JSX self-closing tag',
        component: match[1],
        text: line.trim()
      });
    }

    // Check for JSX closing tags: </ComponentName>
    const jsxClosingTag = /<\/([A-Z][a-zA-Z0-9]*)>/g;
    while ((match = jsxClosingTag.exec(line)) !== null) {
      issues.push({
        line: lineNum,
        pattern: 'JSX closing tag',
        component: match[1],
        text: line.trim()
      });
    }

    // Check for JSX attribute syntax: prop={value}
    if (/{[^}]+}/.test(line) && /<[A-Z]/.test(line)) {
      const attributeMatch = /([a-zA-Z]+)=\{/.exec(line);
      if (attributeMatch) {
        issues.push({
          line: lineNum,
          pattern: 'JSX attribute syntax',
          text: line.trim()
        });
      }
    }

    // Check for "return <Component />" patterns
    if (/return\s+<\w+/.test(line)) {
      issues.push({
        line: lineNum,
        pattern: 'return statement with JSX',
        text: line.trim()
      });
    }
  });

  return issues;
}

function scanDirectory(dirPath, results = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, hidden directories, and archive
      if (!entry.name.startsWith('.') &&
          entry.name !== 'node_modules' &&
          entry.name !== 'archive') {
        scanDirectory(fullPath, results);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const issues = findJSXInMarkdown(content);

      if (issues.length > 0) {
        const relativePath = path.relative(process.cwd(), fullPath);
        results.push({ file: relativePath, issues });
      }
    }
  }

  return results;
}

console.log('🔍 Scanning for JSX/React components in markdown files...\n');

const docsPath = path.join(process.cwd(), 'docs');
const problematicFiles = scanDirectory(docsPath);

if (problematicFiles.length === 0) {
  console.log('✅ No JSX components found in any .md files!');
  process.exit(0);
} else {
  console.log(`❌ Found JSX components in ${problematicFiles.length} file(s):\n`);

  // Group by component type for summary
  const componentCounts = {};

  for (const { file, issues } of problematicFiles) {
    console.log(`📄 ${file}`);
    for (const issue of issues) {
      if (issue.component) {
        componentCounts[issue.component] = (componentCounts[issue.component] || 0) + 1;
      }
      console.log(`   Line ${issue.line}: ${issue.pattern}${issue.component ? ` (${issue.component})` : ''}`);
      if (issue.text.length < 80) {
        console.log(`   → "${issue.text}"`);
      } else {
        console.log(`   → "${issue.text.substring(0, 77)}..."`);
      }
    }
    console.log();
  }

  console.log('\n📊 Summary of JSX components found:');
  for (const [component, count] of Object.entries(componentCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${component}: ${count} occurrences`);
  }

  console.log('\n⚠️  These files need JSX components removed and converted to plain markdown.');
  console.log('💡 Tip: Replace <CodeEditor> with markdown code blocks, remove <Layout> wrappers, etc.');

  process.exit(1);
}
