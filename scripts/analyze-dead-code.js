#!/usr/bin/env node
/**
 * Dead Code Analyzer for DyGram
 *
 * Identifies:
 * - Unused exports
 * - Files with no imports (except entry points)
 * - Deprecated code still in use
 * - Orphaned files
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname, basename, relative, extname, sep, normalize } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENTRY_POINTS = [
  'src/extension/main.ts',
  'src/language/main.ts',
  'src/language/main-browser.ts',
  'src/cli/main.ts',
  'src/web/index.ts',
  'src/playground-monaco.tsx',
  'src/playground-codemirror.tsx',
  'src/pages/index.tsx',
  'bin/dygram.js',
];

const IGNORE_DIRS = [
  'node_modules',
  'dist',
  'out',
  '__snapshots__',
  'test',
];

class DeadCodeAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.files = new Map();
  }

  async analyze() {
    console.log('🔍 Scanning TypeScript files...');
    await this.scanDirectory('src');
    await this.scanDirectory('api');

    console.log(`📊 Found ${this.files.size} files`);
    console.log('🔗 Analyzing imports and exports...');
    this.analyzeImportsExports();

    console.log('🧮 Computing dead code metrics...');
    return this.generateReport();
  }

  async scanDirectory(dirPath, relativePath = '') {
    const fullPath = join(this.projectRoot, dirPath, relativePath);

    try {
      const entries = await readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryRelativePath = join(relativePath, entry.name);
        const entryFullPath = join(fullPath, entry.name);

        if (entry.isDirectory()) {
          // Skip ignored directories
          if (IGNORE_DIRS.includes(entry.name)) {
            continue;
          }
          await this.scanDirectory(dirPath, entryRelativePath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          // Skip test files
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
            continue;
          }

          const content = await readFile(entryFullPath, 'utf-8');
          const filePath = join(dirPath, entryRelativePath);

          this.files.set(filePath, {
            path: filePath,
            exports: this.extractExports(content),
            imports: this.extractImports(content, filePath),
            isEntryPoint: ENTRY_POINTS.some(ep => filePath.endsWith(ep) || filePath.includes(ep)),
            isDeprecated: this.isDeprecated(content),
            importedBy: new Set(),
          });
        }
      }
    } catch (error) {
      // Directory might not exist, skip it
    }
  }

  extractExports(content) {
    const exports = [];

    // export function/class/interface/type/const
    const namedExportRegex = /export\s+(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+(\w+)/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // export { ... }
    const exportListRegex = /export\s+{([^}]+)}/g;
    while ((match = exportListRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]);
      exports.push(...names);
    }

    // export default
    if (content.includes('export default')) {
      exports.push('default');
    }

    return exports;
  }

  extractImports(content, currentFile) {
    const imports = new Map();

    // import ... from '...'
    const importRegex = /import\s+(?:{([^}]+)}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const namedImports = match[1];
      const defaultImport = match[2];
      const namespaceImport = match[3];
      const from = match[4];

      // Resolve relative imports to file paths
      const resolvedPath = this.resolveImportPath(from, currentFile);
      if (!resolvedPath) continue;

      const symbols = [];
      if (namedImports) {
        symbols.push(...namedImports.split(',').map(s => s.trim().split(/\s+as\s+/)[0]));
      }
      if (defaultImport) {
        symbols.push('default');
      }
      if (namespaceImport) {
        symbols.push('*');
      }

      imports.set(resolvedPath, symbols);
    }

    return imports;
  }

  resolveImportPath(importPath, currentFile) {
    // Skip external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    const currentDir = dirname(currentFile);
    let resolved = normalize(join(currentDir, importPath));

    // Try adding extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (this.files.has(candidate)) {
        return candidate;
      }
    }

    // Try without extension if already has one
    if (this.files.has(resolved)) {
      return resolved;
    }

    return null;
  }

  isDeprecated(content) {
    return content.includes('@deprecated') ||
           content.includes('DEPRECATED') ||
           content.includes('@deprecated-component');
  }

  analyzeImportsExports() {
    // Build importedBy relationships
    for (const [filePath, analysis] of this.files) {
      for (const [importedFile] of analysis.imports) {
        const imported = this.files.get(importedFile);
        if (imported) {
          imported.importedBy.add(filePath);
        }
      }
    }
  }

  generateReport() {
    const unusedFiles = [];
    const unusedExports = new Map();
    const deprecatedUsages = new Map();
    const orphanedFiles = [];

    for (const [filePath, analysis] of this.files) {
      // Files with no imports (excluding entry points)
      if (analysis.importedBy.size === 0 && !analysis.isEntryPoint) {
        unusedFiles.push(filePath);
      }

      // Truly orphaned files (no imports and no exports)
      if (analysis.importedBy.size === 0 &&
          analysis.exports.length === 0 &&
          !analysis.isEntryPoint) {
        orphanedFiles.push(filePath);
      }

      // Deprecated code still being used
      if (analysis.isDeprecated && analysis.importedBy.size > 0) {
        deprecatedUsages.set(filePath, Array.from(analysis.importedBy));
      }

      // Unused exports (approximation - checking if specific exports are used)
      const unusedInFile = [];
      for (const exportName of analysis.exports) {
        let isUsed = false;

        // Check if this export is imported anywhere
        for (const importer of analysis.importedBy) {
          const importerAnalysis = this.files.get(importer);
          if (importerAnalysis) {
            const importedSymbols = importerAnalysis.imports.get(filePath);
            if (importedSymbols &&
                (importedSymbols.includes(exportName) ||
                 importedSymbols.includes('*'))) {
              isUsed = true;
              break;
            }
          }
        }

        if (!isUsed && exportName !== 'default') {
          unusedInFile.push(exportName);
        }
      }

      if (unusedInFile.length > 0) {
        unusedExports.set(filePath, unusedInFile);
      }
    }

    return {
      unusedFiles,
      unusedExports,
      deprecatedUsages,
      orphanedFiles,
      statistics: {
        totalFiles: this.files.size,
        filesWithNoImports: unusedFiles.length,
        deprecatedFiles: Array.from(this.files.values()).filter(f => f.isDeprecated).length,
        potentialDeadCode: unusedFiles.length + Array.from(unusedExports.values()).reduce((sum, arr) => sum + arr.length, 0),
      },
    };
  }

  printReport(report) {
    console.log('\n' + '='.repeat(80));
    console.log('📋 DEAD CODE ANALYSIS REPORT');
    console.log('='.repeat(80));

    console.log('\n📊 Statistics:');
    console.log(`  Total files analyzed: ${report.statistics.totalFiles}`);
    console.log(`  Files with no imports: ${report.statistics.filesWithNoImports}`);
    console.log(`  Deprecated files: ${report.statistics.deprecatedFiles}`);
    console.log(`  Potential dead code items: ${report.statistics.potentialDeadCode}`);

    if (report.orphanedFiles.length > 0) {
      console.log('\n🗑️  ORPHANED FILES (no imports, no exports):');
      report.orphanedFiles.sort().forEach(file => {
        console.log(`  - ${file}`);
      });
    }

    if (report.unusedFiles.length > 0) {
      console.log('\n⚠️  FILES WITH NO IMPORTS (excluding entry points):');
      report.unusedFiles.sort().forEach(file => {
        const analysis = this.files.get(file);
        const exports = analysis?.exports.length || 0;
        console.log(`  - ${file} (${exports} exports)`);
      });
    }

    if (report.unusedExports.size > 0) {
      console.log('\n📦 UNUSED EXPORTS:');
      const sortedExports = Array.from(report.unusedExports.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));

      for (const [file, exports] of sortedExports) {
        console.log(`  ${file}:`);
        exports.forEach(exp => console.log(`    - ${exp}`));
      }
    }

    if (report.deprecatedUsages.size > 0) {
      console.log('\n⚠️  DEPRECATED CODE STILL IN USE:');
      const sortedDeprecated = Array.from(report.deprecatedUsages.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));

      for (const [file, usages] of sortedDeprecated) {
        console.log(`  ${file} is used by:`);
        usages.forEach(usage => console.log(`    - ${usage}`));
      }
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Main execution
async function main() {
  const projectRoot = join(__dirname, '..');
  const analyzer = new DeadCodeAnalyzer(projectRoot);

  try {
    const report = await analyzer.analyze();
    analyzer.printReport(report);

    // Write JSON report
    const reportPath = join(projectRoot, 'dead-code-report.json');
    await writeFile(reportPath, JSON.stringify(report, (key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  }
}

main();
