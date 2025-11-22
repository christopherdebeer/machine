#!/usr/bin/env node
/**
 * Auto-respond to test requests with intelligent responses
 */

import fs from 'fs';
import { execSync } from 'child_process';

let requestCount = 0;
const maxRequests = 100; // Safety limit

async function processRequest(request) {
    requestCount++;

    const nodeType = request.messages[0].content.match(/- \*\*Node\*\*: (\w+)/)?.[1] || 'unknown';
    const objective = request.messages[0].content.match(/- \*\*Objective\*\*: (.+)/)?.[1] || 'Execute task';
    const visitedNodes = request.messages[0].content.match(/- \*\*Visited Nodes\*\*: (\d+)/)?.[1] || '0';

    // Get the transition tool (should be exactly one, or none for isolated machines)
    const transitionTool = request.tools.find(t => t.name.startsWith('transition_to_'));

    if (!transitionTool) {
        // Isolated machine - no transitions
        console.error(`No transition tool - isolated machine`);
        return {
            requestId: request.requestId,
            reasoning: `Isolated machine with no outgoing transitions at ${nodeType}`,
            response: {
                content: [
                    {
                        type: "text",
                        text: `Task completed at ${nodeType}. This machine has no outgoing transitions.`
                    }
                ],
                stop_reason: "end_turn"
            }
        };
    }

    const targetNode = transitionTool.name.replace('transition_to_', '');

    // Generate intelligent response based on context
    let textResponse = `Completed task at ${nodeType}: ${objective}. Moving to ${targetNode}.`;
    let reason = `Task completed at ${nodeType}, proceeding to ${targetNode}`;

    // Special handling for specific node types
    if (nodeType.toLowerCase().includes('data')) {
        reason = `Data ${nodeType.toLowerCase()} complete, ready for next stage`;
    } else if (nodeType.toLowerCase().includes('validate')) {
        reason = `Validation successful, proceeding to ${targetNode}`;
    } else if (nodeType.toLowerCase().includes('generate') || nodeType.toLowerCase().includes('compile')) {
        reason = `Generation/compilation complete, moving forward`;
    }

    const response = {
        requestId: request.requestId,
        reasoning: `At ${nodeType}, visited ${visitedNodes} nodes. ${reason}`,
        response: {
            content: [
                {
                    type: "text",
                    text: textResponse
                },
                {
                    type: "tool_use",
                    id: `tool-auto-${Date.now()}`,
                    name: transitionTool.name,
                    input: {
                        reason: reason
                    }
                }
            ],
            stop_reason: "tool_use"
        }
    };

    return response;
}

async function main() {
    console.error(`🤖 Auto-responder started (max ${maxRequests} requests)`);

    while (requestCount < maxRequests) {
        try {
            // Get next request
            const result = execSync('node scripts/get-next-request.js --timeout 10000', {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const request = JSON.parse(result);
            console.error(`\n📨 Request ${requestCount + 1}: ${request.requestId}`);

            // Generate response
            const response = await processRequest(request);

            if (!response) {
                console.error(`❌ Failed to generate response`);
                continue;
            }

            // Write response to temp file
            const tempFile = `/tmp/auto-response-${Date.now()}.json`;
            fs.writeFileSync(tempFile, JSON.stringify(response, null, 2));

            // Submit response
            execSync(`node scripts/submit-response.js --request-id ${request.requestId} --file ${tempFile}`, {
                encoding: 'utf-8',
                stdio: 'inherit'
            });

            // Clean up
            fs.unlinkSync(tempFile);

        } catch (error) {
            if (error.message.includes('No pending requests')) {
                console.error(`\n✅ No more requests. Processed ${requestCount} total.`);
                break;
            }
            console.error(`\n⚠️  Error: ${error.message}`);
            break;
        }
    }

    console.error(`\n🏁 Auto-responder finished. Processed ${requestCount} requests.`);
}

main();
