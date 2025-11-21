#!/usr/bin/env node
/**
 * Submit Response - Queue Response Writer
 *
 * This script takes a response JSON (from stdin or file) and writes it
 * to the response queue. It also cleans up the corresponding request file.
 *
 * Usage:
 *   node scripts/submit-response.js [--queue-dir <path>] [--request-id <id>] [--file <path>]
 *   echo '{"response": {...}}' | node scripts/submit-response.js --request-id req-123
 *
 * Input:
 *   - Response JSON via stdin OR --file argument
 *   - Request ID via --request-id (used for filename)
 *
 * Output:
 *   Writes response to queue and cleans up request file
 *   Exits with code 0 on success, 1 on error
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
let queueDir = '.dygram-test-queue';
let requestId = null;
let responseFile = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--queue-dir' && i + 1 < args.length) {
        queueDir = args[i + 1];
        i++;
    } else if (args[i] === '--request-id' && i + 1 < args.length) {
        requestId = args[i + 1];
        i++;
    } else if (args[i] === '--file' && i + 1 < args.length) {
        responseFile = args[i + 1];
        i++;
    }
}

const requestsPath = path.join(queueDir, 'requests');
const responsesPath = path.join(queueDir, 'responses');

// Ensure response directory exists
if (!fs.existsSync(responsesPath)) {
    fs.mkdirSync(responsesPath, { recursive: true });
}

/**
 * Read response data from stdin or file
 */
async function readResponseData() {
    if (responseFile) {
        // Read from file
        return fs.readFileSync(responseFile, 'utf-8');
    } else {
        // Read from stdin
        return new Promise((resolve, reject) => {
            let data = '';

            process.stdin.setEncoding('utf-8');

            process.stdin.on('data', chunk => {
                data += chunk;
            });

            process.stdin.on('end', () => {
                resolve(data);
            });

            process.stdin.on('error', err => {
                reject(err);
            });
        });
    }
}

/**
 * Submit response to queue
 */
async function submitResponse() {
    try {
        // Read response data
        const responseData = await readResponseData();
        const response = JSON.parse(responseData);

        // Validate response structure
        if (!response.requestId && !requestId) {
            throw new Error('Response must include requestId or use --request-id flag');
        }

        const finalRequestId = response.requestId || requestId;
        const filename = `${finalRequestId}.json`;

        // Ensure response has proper structure
        const finalResponse = {
            type: 'llm_invocation_response',
            requestId: finalRequestId,
            timestamp: new Date().toISOString(),
            ...response
        };

        // Write response to queue
        const responsePath = path.join(responsesPath, filename);
        fs.writeFileSync(responsePath, JSON.stringify(finalResponse, null, 2));

        // Clean up request file if it exists
        const requestPath = path.join(requestsPath, filename);
        if (fs.existsSync(requestPath)) {
            fs.unlinkSync(requestPath);
        }

        console.error(`✅ Response submitted for request: ${finalRequestId}`);
        process.exit(0);
    } catch (error) {
        console.error(`❌ Error submitting response: ${error.message}`);
        process.exit(1);
    }
}

// Main execution
submitResponse();
