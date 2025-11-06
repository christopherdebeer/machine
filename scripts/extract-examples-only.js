#!/usr/bin/env node

/**
 * Standalone Example Extraction
 * 
 * Runs only the example extraction step for quick testing and debugging.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractExamples } from './extract-examples.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    const projectRoot = join(__dirname, '..');
    
    try {
        const result = await extractExamples(projectRoot);
        console.log(`\n✓ Extracted ${result.count} examples successfully\n`);
    } catch (error) {
        console.error(`\n✗ Example extraction failed:`);
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
