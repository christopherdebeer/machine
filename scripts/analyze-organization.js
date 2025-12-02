#!/usr/bin/env node
/**
 * Codebase Organization Analyzer for DyGram
 *
 * Analyzes:
 * - Directory structure and depth
 * - File distribution and clustering
 * - Naming patterns and consistency
 * - Module cohesion
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname, basename, extname, sep } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IGNORE_DIRS = [
  'node_modules',
  'dist',
  'out',
  '__snapshots__',
  'test-output',
];

class OrganizationAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.files = [];
  }

  async analyze() {
    console.log('🔍 Scanning project structure...');
    await this.scanDirectory('src');

    console.log(`📊 Found ${this.files.length} files`);
    console.log('🧮 Analyzing organization...');
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
          const stats = await stat(entryFullPath);
          const content = await readFile(entryFullPath, 'utf-8');
          const lines = content.split('\n').length;
          const filePath = join(dirPath, entryRelativePath);

          this.files.push({
            path: filePath,
            size: stats.size,
            lines,
            depth: filePath.split(sep).length,
            extension: extname(entry.name),
          });
        }
      }
    } catch (error) {
      // Directory might not exist, skip it
    }
  }

  generateReport() {
    const directoryStats = this.calculateDirectoryStats();
    const deeplyNestedFiles = this.findDeeplyNestedFiles();
    const largeFiles = this.findLargeFiles();
    const suspiciousPaths = this.findSuspiciousPaths();
    const namingInconsistencies = this.findNamingInconsistencies();
    const recommendations = this.generateRecommendations(
      directoryStats,
      deeplyNestedFiles,
      largeFiles,
      suspiciousPaths,
      namingInconsistencies
    );

    return {
      directoryStats,
      deeplyNestedFiles,
      largeFiles,
      suspiciousPaths,
      namingInconsistencies,
      recommendations,
    };
  }

  calculateDirectoryStats() {
    const stats = new Map();

    // Group files by directory
    const dirFiles = new Map();

    for (const file of this.files) {
      const dir = dirname(file.path);
      if (!dirFiles.has(dir)) {
        dirFiles.set(dir, []);
      }
      dirFiles.get(dir).push(file);
    }

    // Calculate stats for each directory
    for (const [dir, files] of dirFiles) {
      const tsFiles = files.filter(f => f.extension === '.ts').length;
      const tsxFiles = files.filter(f => f.extension === '.tsx').length;
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const avgFileSize = totalSize / files.length;

      // Find subdirectories
      const subdirectories = Array.from(dirFiles.keys())
        .filter(d => d.startsWith(dir + sep) && d !== dir)
        .filter(d => dirname(d) === dir);

      stats.set(dir, {
        path: dir,
        fileCount: files.length,
        depth: dir.split(sep).length,
        tsFiles,
        tsxFiles,
        avgFileSize,
        totalSize,
        subdirectories,
      });
    }

    return stats;
  }

  findDeeplyNestedFiles() {
    // Files nested more than 5 levels deep
    return this.files
      .filter(f => f.depth > 5)
      .sort((a, b) => b.depth - a.depth);
  }

  findLargeFiles() {
    // Files larger than 500 lines
    return this.files
      .filter(f => f.lines > 500)
      .sort((a, b) => b.lines - a.lines);
  }

  findSuspiciousPaths() {
    const suspicious = [];

    for (const file of this.files) {
      // Files with confusing names
      if (file.path.includes('old-') || file.path.includes('temp-')) {
        suspicious.push({
          path: file.path,
          reason: 'Temporary or old file naming',
        });
      }

      // Duplicate/similar names
      const base = basename(file.path, file.extension);
      if (base.includes('2') || base.includes('Copy')) {
        suspicious.push({
          path: file.path,
          reason: 'Duplicate naming pattern',
        });
      }

      // Generic names in specific directories
      if ((base === 'index' || base === 'utils' || base === 'helpers') &&
          file.depth > 4) {
        suspicious.push({
          path: file.path,
          reason: 'Generic name in nested directory',
        });
      }
    }

    return suspicious;
  }

  findNamingInconsistencies() {
    const inconsistencies = [];

    // Group files by directory to check consistency
    const dirFiles = new Map();

    for (const file of this.files) {
      const dir = dirname(file.path);
      if (!dirFiles.has(dir)) {
        dirFiles.set(dir, []);
      }
      dirFiles.get(dir).push(basename(file.path));
    }

    for (const [dir, files] of dirFiles) {
      if (files.length < 3) continue;

      // Check for mixed naming conventions (kebab-case vs camelCase)
      const hasKebab = files.some(f => f.includes('-'));
      const hasCamel = files.some(f => /[a-z][A-Z]/.test(f));

      if (hasKebab && hasCamel) {
        inconsistencies.push({
          pattern: `Mixed naming in ${dir}`,
          files: files,
        });
      }
    }

    // Find similar file names across different directories
    const basenames = new Map();
    for (const file of this.files) {
      const base = basename(file.path, file.extension).toLowerCase();
      if (!basenames.has(base)) {
        basenames.set(base, []);
      }
      basenames.get(base).push(file.path);
    }

    for (const [base, paths] of basenames) {
      if (paths.length > 2 && base !== 'index') {
        inconsistencies.push({
          pattern: `Multiple files named "${base}"`,
          files: paths,
        });
      }
    }

    return inconsistencies;
  }

  generateRecommendations(
    directoryStats,
    deeplyNested,
    largeFiles,
    suspicious,
    namingIssues
  ) {
    const recommendations = [];

    // Check for directories with too many files
    for (const [dir, stats] of directoryStats) {
      if (stats.fileCount > 15 && stats.subdirectories.length === 0) {
        recommendations.push(
          `Consider splitting ${dir} (${stats.fileCount} files) into subdirectories`
        );
      }
    }

    // Check for deeply nested structures
    if (deeplyNested.length > 0) {
      const maxDepth = Math.max(...deeplyNested.map(f => f.depth));
      if (maxDepth > 6) {
        recommendations.push(
          `Consider flattening directory structure (max depth: ${maxDepth})`
        );
      }
    }

    // Check for large files
    if (largeFiles.length > 0) {
      const veryLarge = largeFiles.filter(f => f.lines > 1000);
      if (veryLarge.length > 0) {
        recommendations.push(
          `Consider splitting ${veryLarge.length} files with more than 1000 lines`
        );
      }
    }

    // Suspicious files
    if (suspicious.length > 0) {
      recommendations.push(
        `Review ${suspicious.length} files with suspicious naming patterns`
      );
    }

    // Naming inconsistencies
    if (namingIssues.length > 0) {
      recommendations.push(
        `Standardize naming conventions (${namingIssues.length} inconsistencies found)`
      );
    }

    // Check for deprecated code organization
    const deprecatedDirs = Array.from(directoryStats.keys())
      .filter(d => d.includes('deprecated') || d.includes('old') || d.includes('legacy'));

    if (deprecatedDirs.length === 0) {
      const deprecatedFiles = this.files.filter(f => {
        try {
          const content = require('fs').readFileSync(join(this.projectRoot, f.path), 'utf-8');
          return content.includes('@deprecated') || content.includes('DEPRECATED');
        } catch {
          return false;
        }
      });

      if (deprecatedFiles.length > 3) {
        recommendations.push(
          `Create a 'deprecated/' directory to organize ${deprecatedFiles.length} deprecated files`
        );
      }
    }

    return recommendations;
  }

  printReport(report) {
    console.log('\n' + '='.repeat(80));
    console.log('📋 ORGANIZATION ANALYSIS REPORT');
    console.log('='.repeat(80));

    // Directory statistics
    console.log('\n📁 DIRECTORY STATISTICS:');
    const sortedDirs = Array.from(report.directoryStats.values())
      .sort((a, b) => b.fileCount - a.fileCount)
      .slice(0, 15);

    console.log('\nTop directories by file count:');
    for (const dir of sortedDirs) {
      console.log(`  ${dir.path}`);
      console.log(`    Files: ${dir.fileCount} (${dir.tsFiles} .ts, ${dir.tsxFiles} .tsx)`);
      console.log(`    Avg size: ${Math.round(dir.avgFileSize / 1024)}KB`);
      console.log(`    Subdirectories: ${dir.subdirectories.length}`);
    }

    // Deeply nested files
    if (report.deeplyNestedFiles.length > 0) {
      console.log('\n📊 DEEPLY NESTED FILES (depth > 5):');
      report.deeplyNestedFiles.slice(0, 10).forEach(file => {
        console.log(`  [depth ${file.depth}] ${file.path}`);
      });
      if (report.deeplyNestedFiles.length > 10) {
        console.log(`  ... and ${report.deeplyNestedFiles.length - 10} more`);
      }
    }

    // Large files
    if (report.largeFiles.length > 0) {
      console.log('\n📦 LARGE FILES (> 500 lines):');
      report.largeFiles.slice(0, 10).forEach(file => {
        console.log(`  [${file.lines} lines] ${file.path}`);
      });
      if (report.largeFiles.length > 10) {
        console.log(`  ... and ${report.largeFiles.length - 10} more`);
      }
    }

    // Suspicious paths
    if (report.suspiciousPaths.length > 0) {
      console.log('\n⚠️  SUSPICIOUS FILE PATHS:');
      report.suspiciousPaths.forEach(({ path, reason }) => {
        console.log(`  ${path}`);
        console.log(`    Reason: ${reason}`);
      });
    }

    // Naming inconsistencies
    if (report.namingInconsistencies.length > 0) {
      console.log('\n📝 NAMING INCONSISTENCIES:');
      report.namingInconsistencies.slice(0, 5).forEach(({ pattern, files }) => {
        console.log(`  ${pattern}:`);
        files.slice(0, 5).forEach(file => console.log(`    - ${file}`));
        if (files.length > 5) {
          console.log(`    ... and ${files.length - 5} more`);
        }
      });
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      report.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Main execution
async function main() {
  const projectRoot = join(__dirname, '..');
  const analyzer = new OrganizationAnalyzer(projectRoot);

  try {
    const report = await analyzer.analyze();
    analyzer.printReport(report);

    // Write JSON report
    const reportPath = join(projectRoot, 'organization-report.json');
    await writeFile(reportPath, JSON.stringify(report, (key, value) => {
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
