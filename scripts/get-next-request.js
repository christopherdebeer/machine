#!/usr/bin/env node
/**
 * Get Next Request - Blocking Queue Reader with Lock File Synchronization
 *
 * This script blocks until a test request is available in the queue,
 * then outputs it to stdout as JSON. It uses a lock file to synchronize
 * with the test suite lifecycle and detect crashed/completed test runs.
 *
 * Lock File Synchronization:
 * - Waits for .test-session.lock file to exist (tests starting)
 * - Checks heartbeat timestamp to detect stale/crashed tests
 * - Exits gracefully when lock file removed (tests completed)
 *
 * Usage:
 *   node scripts/get-next-request.js [--queue-dir <path>] [--timeout <ms>] [--lock-timeout <ms>]
 *
 * Output:
 *   Prints JSON request to stdout when available
 *   Exits with code 0 on success, 1 on timeout/error, 2 on tests complete
 *
 * Exit Codes:
 *   0 - Request returned successfully
 *   1 - Error or timeout waiting for request
 *   2 - Tests completed (lock file removed) - graceful exit
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
let timeout = 60000; // 60 seconds default
let lockTimeout = 30000; // 30 seconds to wait for lock file

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--queue-dir' && i + 1 < args.length) {
        queueDir = args[i + 1];
        i++;
    } else if (args[i] === '--timeout' && i + 1 < args.length) {
        timeout = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--lock-timeout' && i + 1 < args.length) {
        lockTimeout = parseInt(args[i + 1]);
        i++;
    }
}

const requestsPath = path.join(queueDir, 'requests');
const responsesPath = path.join(queueDir, 'responses');
const lockFilePath = path.join(queueDir, '.test-session.lock');

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
 * Check if lock file exists and is healthy
 */
function checkLockFile() {
    if (!fs.existsSync(lockFilePath)) {
        return { exists: false, healthy: false, stale: false };
    }

    try {
        const lockData = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
        const lastHeartbeat = new Date(lockData.timestamp);
        const now = new Date();
        const ageMs = now - lastHeartbeat;

        // Consider stale if heartbeat older than 10 seconds
        const stale = ageMs > 10000;

        return {
            exists: true,
            healthy: !stale,
            stale,
            data: lockData
        };
    } catch (error) {
        // Lock file corrupted or unreadable
        return { exists: true, healthy: false, stale: true };
    }
}

/**
 * Wait for lock file to exist (tests starting)
 */
async function waitForLockFile() {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms

    while (Date.now() - startTime < lockTimeout) {
        if (fs.existsSync(lockFilePath)) {
            console.error('✅ Test session lock file detected', { stream: 'stderr' });
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
}

/**
 * Wait for request with lock file monitoring
 */
async function waitForRequest() {
    const startTime = Date.now();
    const pollInterval = 100; // Check every 100ms

    while (Date.now() - startTime < timeout) {
        // Check lock file health
        const lockStatus = checkLockFile();

        if (!lockStatus.exists) {
            // Tests completed normally
            console.error('ℹ️  Test session completed (lock file removed)', { stream: 'stderr' });
            return { completed: true };
        }

        if (lockStatus.stale) {
            // Tests crashed or hung
            console.error('⚠️  Test session appears stale (no heartbeat)', { stream: 'stderr' });
            return { stale: true };
        }

        // Lock file healthy, check for request
        const request = getNextRequest();
        if (request) {
            return { request };
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout reached
    return { timeout: true };
}

// Main execution
(async () => {
    // First, wait for lock file to exist (tests starting)
    console.error('⏳ Waiting for test session to start...', { stream: 'stderr' });
    const lockFileExists = await waitForLockFile();

    if (!lockFileExists) {
        console.error('❌ Timeout: Test session did not start within timeout period', { stream: 'stderr' });
        process.exit(1);
    }

    // Now wait for request
    console.error('⏳ Waiting for test request...', { stream: 'stderr' });
    const result = await waitForRequest();

    if (result.request) {
        // Success - output request as JSON to stdout
        console.log(JSON.stringify(result.request, null, 2));
        process.exit(0);
    } else if (result.completed) {
        // Tests completed gracefully
        console.error('✅ Test session completed', { stream: 'stderr' });
        process.exit(2);
    } else if (result.stale) {
        // Tests crashed or hung
        console.error('❌ Test session stale - tests may have crashed', { stream: 'stderr' });
        process.exit(1);
    } else {
        // Timeout
        console.error('❌ Timeout: No request received within timeout period', { stream: 'stderr' });
        process.exit(1);
    }
})();
