#!/usr/bin/env node
/**
 * Get Next Request - Blocking Queue Reader
 *
 * This script blocks until a test request is available in the queue,
 * then outputs it to stdout as JSON. This allows Claude Code to process
 * requests synchronously in the skill workflow.
 *
 * Usage:
 *   node scripts/get-next-request.js [--queue-dir <path>] [--timeout <ms>]
 *
 * Output:
 *   Prints JSON request to stdout when available
 *   Exits with code 0 on success, 1 on timeout/error
 *
 * Example:
 *   REQUEST=$(node scripts/get-next-request.js)
 *   echo "$REQUEST" | jq '.tools[].name'
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
let queueDir = '.dygram-test-queue';
let timeout = 30000; // 30 seconds default

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--queue-dir' && i + 1 < args.length) {
        queueDir = args[i + 1];
        i++;
    } else if (args[i] === '--timeout' && i + 1 < args.length) {
        timeout = parseInt(args[i + 1]);
        i++;
    }
}

const requestsPath = path.join(queueDir, 'requests');
const responsesPath = path.join(queueDir, 'responses');

// Ensure directories exist
if (!fs.existsSync(requestsPath)) {
    fs.mkdirSync(requestsPath, { recursive: true });
}
if (!fs.existsSync(responsesPath)) {
    fs.mkdirSync(responsesPath, { recursive: true });
}

/**
 * Get next available request from queue
 */
function getNextRequest() {
    try {
        const files = fs.readdirSync(requestsPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            return null;
        }

        // Get oldest request (by filename, which includes timestamp)
        const oldestFile = jsonFiles.sort()[0];
        const requestPath = path.join(requestsPath, oldestFile);

        // Read and parse request
        const requestData = fs.readFileSync(requestPath, 'utf-8');
        const request = JSON.parse(requestData);

        // Store filename for cleanup later
        request._queueFilename = oldestFile;

        return request;
    } catch (error) {
        console.error(`Error reading queue: ${error.message}`, { stream: 'stderr' });
        return null;
    }
}

/**
 * Wait for request with timeout
 */
async function waitForRequest() {
    const startTime = Date.now();
    const pollInterval = 100; // Check every 100ms

    while (Date.now() - startTime < timeout) {
        const request = getNextRequest();
        if (request) {
            return request;
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null;
}

// Main execution
(async () => {
    const request = await waitForRequest();

    if (request) {
        // Output request as JSON to stdout
        console.log(JSON.stringify(request, null, 2));
        process.exit(0);
    } else {
        console.error('Timeout: No request received within timeout period', { stream: 'stderr' });
        process.exit(1);
    }
})();
