#!/usr/bin/env node

/**
 * Selective Snapshot Update Tool
 *
 * This script allows selective updating of test snapshots instead of all-or-nothing.
 *
 * Usage:
 *   node scripts/update-snapshots.js                    # Interactive mode
 *   node scripts/update-snapshots.js --list             # List all snapshots with status
 *   node scripts/update-snapshots.js --pattern "styling*" # Update snapshots matching pattern
 *   node scripts/update-snapshots.js --file examples_advanced_features_3 # Update specific snapshot
 *   node scripts/update-snapshots.js --all              # Update all snapshots (same as UPDATE_SNAPSHOTS=true)
 *   node scripts/update-snapshots.js --review           # Interactive review mode
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const snapshotDir = path.join(projectRoot, 'test', 'integration', '__snapshots__');
const testOutputDir = path.join(projectRoot, 'test-output', 'comprehensive-generative');

// Parse command line arguments
const args = process.argv.slice(2);

// Helper function to get flag value (supports both --flag=value and --flag value)
function getFlagValue(flagName) {
    const eqIndex = args.findIndex(a => a.startsWith(`--${flagName}=`));
    if (eqIndex !== -1) {
        return args[eqIndex].split('=')[1];
    }

    const flagIndex = args.findIndex(a => a === `--${flagName}`);
    if (flagIndex !== -1 && flagIndex + 1 < args.length && !args[flagIndex + 1].startsWith('--')) {
        return args[flagIndex + 1];
    }

    return null;
}

const flags = {
    list: args.includes('--list'),
    all: args.includes('--all'),
    review: args.includes('--review'),
    pattern: getFlagValue('pattern'),
    file: getFlagValue('file'),
    help: args.includes('--help') || args.includes('-h')
};

// Extract pattern from positional argument if provided
if (!flags.pattern && args.length > 0 && !args[0].startsWith('--')) {
    flags.pattern = args[0];
}

function printHelp() {
    console.log(`
Selective Snapshot Update Tool

Usage:
  node scripts/update-snapshots.js [options] [pattern]

Options:
  --list                  List all snapshots and their status
  --pattern <pattern>     Update snapshots matching glob pattern (e.g., "styling*", "*advanced*")
  --file <name>           Update specific snapshot file (without .json extension)
  --all                   Update ALL snapshots (equivalent to UPDATE_SNAPSHOTS=true)
  --review                Interactive review mode - review each mismatch and decide
  --help, -h              Show this help message

Examples:
  # Interactive review mode (recommended)
  node scripts/update-snapshots.js --review

  # List all snapshots with status
  node scripts/update-snapshots.js --list

  # Update all styling-related snapshots
  node scripts/update-snapshots.js --pattern "styling*"

  # Update all snapshots containing "advanced"
  node scripts/update-snapshots.js --pattern "*advanced*"

  # Update specific snapshot
  node scripts/update-snapshots.js --file examples_advanced_features_3

  # Update all snapshots
  node scripts/update-snapshots.js --all
`);
}

function matchesPattern(filename, pattern) {
    if (!pattern) return true;

    // Convert glob pattern to regex
    const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}`, 'i');
    return regex.test(filename);
}

function getSnapshotStatus() {
    if (!fs.existsSync(snapshotDir)) {
        return [];
    }

    const snapshots = fs.readdirSync(snapshotDir)
        .filter(f => f.endsWith('.json') && f !== 'README.md')
        .map(filename => {
            const baseName = filename.replace('.json', '');
            const snapshotPath = path.join(snapshotDir, filename);
            const testOutputPath = path.join(testOutputDir, baseName + '.md');

            let status = 'unknown';
            let hasTestOutput = false;

            if (fs.existsSync(testOutputPath)) {
                hasTestOutput = true;
                const testContent = fs.readFileSync(testOutputPath, 'utf-8');

                if (testContent.includes('✅ PASSED')) {
                    status = 'passing';
                } else if (testContent.includes('❌ FAILED')) {
                    // Check if it's a snapshot mismatch
                    if (testContent.includes('Snapshot Mismatches:') ||
                        testContent.includes('differs from snapshot')) {
                        status = 'mismatch';
                    } else {
                        status = 'failing';
                    }
                }
            }

            return {
                filename,
                baseName,
                snapshotPath,
                testOutputPath,
                status,
                hasTestOutput
            };
        });

    return snapshots;
}

function listSnapshots() {
    console.log('\n📸 Snapshot Status Report\n');
    console.log('Status Legend:');
    console.log('  ✅ passing   - Test passes with current snapshot');
    console.log('  ⚠️  mismatch  - Test fails due to snapshot mismatch (safe to update if intentional)');
    console.log('  ❌ failing   - Test fails for other reasons (review before updating)');
    console.log('  ❓ unknown   - No recent test output available\n');

    const snapshots = getSnapshotStatus();

    const byStatus = {
        passing: [],
        mismatch: [],
        failing: [],
        unknown: []
    };

    snapshots.forEach(s => byStatus[s.status].push(s));

    Object.entries(byStatus).forEach(([status, items]) => {
        if (items.length === 0) return;

        const icon = {
            passing: '✅',
            mismatch: '⚠️ ',
            failing: '❌',
            unknown: '❓'
        }[status];

        console.log(`\n${icon} ${status.toUpperCase()} (${items.length}):`);
        items.forEach(s => {
            console.log(`   ${s.baseName}`);
        });
    });

    console.log(`\n📊 Total: ${snapshots.length} snapshots`);
    console.log(`   ✅ ${byStatus.passing.length} passing`);
    console.log(`   ⚠️  ${byStatus.mismatch.length} mismatches`);
    console.log(`   ❌ ${byStatus.failing.length} other failures`);
    console.log(`   ❓ ${byStatus.unknown.length} unknown\n`);

    return snapshots;
}

async function runTestsAndGetMismatches() {
    console.log('🧪 Running tests to identify mismatches...\n');

    return new Promise((resolve, reject) => {
        const testProcess = spawn('npm', ['run', 'prebuild'], {
            cwd: projectRoot,
            stdio: 'inherit',
            shell: true
        });

        testProcess.on('close', (code) => {
            // Prebuild should always succeed
            if (code !== 0) {
                reject(new Error(`Prebuild failed with code ${code}`));
                return;
            }

            // Now run tests
            const testProcess2 = spawn('npm', ['test', '--', '--run'], {
                cwd: projectRoot,
                stdio: 'inherit',
                shell: true,
                env: { ...process.env, UPDATE_SNAPSHOTS: 'false' }
            });

            testProcess2.on('close', () => {
                // Tests might fail, that's okay
                resolve();
            });
        });
    });
}

async function interactiveReview() {
    console.log('\n🔍 Interactive Review Mode\n');

    // First, run tests to get latest results
    await runTestsAndGetMismatches();

    const snapshots = getSnapshotStatus();
    const mismatches = snapshots.filter(s => s.status === 'mismatch');

    if (mismatches.length === 0) {
        console.log('✅ No snapshot mismatches found! All tests passing.\n');
        return;
    }

    console.log(`\nFound ${mismatches.length} snapshot mismatches.\n`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const toUpdate = [];

    for (const snapshot of mismatches) {
        console.log(`\n📄 ${snapshot.baseName}`);
        console.log(`   Test output: ${snapshot.testOutputPath}`);

        const answer = await new Promise(resolve => {
            rl.question('   Update this snapshot? (y/n/q to quit): ', resolve);
        });

        if (answer.toLowerCase() === 'q') {
            console.log('\nQuitting review...');
            break;
        }

        if (answer.toLowerCase() === 'y') {
            toUpdate.push(snapshot);
        }
    }

    rl.close();

    if (toUpdate.length > 0) {
        console.log(`\n🔄 Updating ${toUpdate.length} snapshots...\n`);
        await updateSnapshots(toUpdate.map(s => s.baseName));
        console.log('\n✅ Snapshots updated!\n');
    } else {
        console.log('\n No snapshots updated.\n');
    }
}

async function updateSnapshots(fileList) {
    // Create a temporary environment variable approach
    // We'll run tests with UPDATE_SNAPSHOTS=true but only for specific files

    console.log(`\n🔄 Updating snapshots for ${fileList.length} file(s)...\n`);

    // For now, we'll use the environment variable approach
    // A more sophisticated approach would modify the SnapshotManager to read a file list

    // Write a temporary config file
    const configPath = path.join(projectRoot, '.snapshot-update-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ files: fileList }, null, 2));

    return new Promise((resolve, reject) => {
        const testProcess = spawn('npm', ['test', '--', '--run'], {
            cwd: projectRoot,
            stdio: 'inherit',
            shell: true,
            env: {
                ...process.env,
                UPDATE_SNAPSHOTS: 'true',
                SELECTIVE_SNAPSHOT_UPDATE: 'true',
                SNAPSHOT_UPDATE_CONFIG: configPath
            }
        });

        testProcess.on('close', (code) => {
            // Clean up config file
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }

            // Tests might fail, that's okay
            resolve();
        });
    });
}

async function main() {
    if (flags.help) {
        printHelp();
        return;
    }

    if (flags.list) {
        listSnapshots();
        return;
    }

    if (flags.review) {
        await interactiveReview();
        return;
    }

    if (flags.all) {
        console.log('🔄 Updating ALL snapshots...\n');
        return new Promise((resolve) => {
            const testProcess = spawn('npm', ['test', '--', '--run'], {
                cwd: projectRoot,
                stdio: 'inherit',
                shell: true,
                env: { ...process.env, UPDATE_SNAPSHOTS: 'true' }
            });

            testProcess.on('close', () => {
                console.log('\n✅ All snapshots updated!\n');
                resolve();
            });
        });
    }

    if (flags.file) {
        const snapshots = getSnapshotStatus();
        const snapshot = snapshots.find(s => s.baseName === flags.file);

        if (!snapshot) {
            console.error(`\n❌ Snapshot "${flags.file}" not found.\n`);
            console.log('Available snapshots:');
            snapshots.forEach(s => console.log(`   ${s.baseName}`));
            return;
        }

        await updateSnapshots([flags.file]);
        return;
    }

    if (flags.pattern) {
        const snapshots = getSnapshotStatus();
        const matching = snapshots.filter(s => matchesPattern(s.baseName, flags.pattern));

        if (matching.length === 0) {
            console.log(`\n❌ No snapshots match pattern "${flags.pattern}"\n`);
            return;
        }

        console.log(`\nFound ${matching.length} snapshots matching "${flags.pattern}":`);
        matching.forEach(s => console.log(`   ${s.baseName} [${s.status}]`));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise(resolve => {
            rl.question(`\nUpdate these ${matching.length} snapshots? (y/n): `, resolve);
        });

        rl.close();

        if (answer.toLowerCase() === 'y') {
            await updateSnapshots(matching.map(s => s.baseName));
            console.log('\n✅ Snapshots updated!\n');
        } else {
            console.log('\nCancelled.\n');
        }

        return;
    }

    // Default: show help
    printHelp();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
