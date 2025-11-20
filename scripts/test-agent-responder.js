#!/usr/bin/env node
/**
 * Test Agent Responder - Simulates Claude Code responding to test requests
 *
 * This script watches the test queue and responds to LLM invocation requests
 * with intelligent tool selections. It demonstrates how Claude Code would
 * participate in interactive testing.
 *
 * Usage:
 *   node scripts/test-agent-responder.js [--queue-dir <path>]
 *
 * Run in parallel with tests:
 *   # Terminal 1:
 *   node scripts/test-agent-responder.js
 *
 *   # Terminal 2:
 *   DYGRAM_TEST_MODE=interactive npm test
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
let queueDir = '.dygram-test-queue';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--queue-dir' && i + 1 < args.length) {
        queueDir = args[i + 1];
        i++;
    }
}

const requestsPath = path.join(queueDir, 'requests');
const responsesPath = path.join(queueDir, 'responses');

console.log('🤖 Test Agent Responder Starting...');
console.log(`📁 Queue directory: ${queueDir}`);
console.log(`⏳ Waiting for test requests...\n`);

// Ensure directories exist
if (!fs.existsSync(requestsPath)) {
    console.log('❌ Queue directory not found. Creating...');
    fs.mkdirSync(requestsPath, { recursive: true });
    fs.mkdirSync(responsesPath, { recursive: true });
}

let processedRequests = new Set();

/**
 * Watch for new requests
 */
function watchForRequests() {
    setInterval(() => {
        try {
            const files = fs.readdirSync(requestsPath);

            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                if (processedRequests.has(file)) continue;

                processedRequests.add(file);
                processRequest(file);
            }
        } catch (error) {
            // Queue might not exist yet
        }
    }, 100);
}

/**
 * Process a single request
 */
function processRequest(filename) {
    const requestPath = path.join(requestsPath, filename);

    try {
        const requestData = fs.readFileSync(requestPath, 'utf-8');
        const request = JSON.parse(requestData);

        console.log(`\n📨 Received request: ${request.requestId}`);
        console.log(`   Test: ${request.context.testName || 'unknown'}`);
        console.log(`   Machine: ${request.context.machineTitle || 'unknown'}`);
        console.log(`   Tools available: ${request.tools.length}`);

        if (request.tools.length > 0) {
            console.log(`   Tool names: ${request.tools.map(t => t.name).join(', ')}`);
        }

        // Make intelligent decision
        const decision = makeIntelligentDecision(request);

        console.log(`\n🧠 Agent Decision:`);
        console.log(`   ${decision.reasoning}`);

        if (decision.toolUse) {
            console.log(`   Selected tool: ${decision.toolUse.name}`);
        }

        // Create response
        const response = {
            type: 'llm_invocation_response',
            requestId: request.requestId,
            timestamp: new Date().toISOString(),
            reasoning: decision.reasoning,
            response: {
                content: decision.content,
                stop_reason: decision.toolUse ? 'tool_use' : 'end_turn'
            }
        };

        // Write response
        const responsePath = path.join(responsesPath, filename);
        fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));

        console.log(`✅ Sent response\n`);
    } catch (error) {
        console.error(`❌ Error processing request ${filename}:`, error.message);
    }
}

/**
 * Make intelligent decision based on request context
 *
 * This simulates what Claude Code would do when analyzing the request.
 */
function makeIntelligentDecision(request) {
    const { systemPrompt, tools, context } = request;

    // No tools available - just respond with text
    if (tools.length === 0) {
        return {
            reasoning: 'No tools available, providing text response',
            content: [
                {
                    type: 'text',
                    text: 'Task completed successfully.'
                }
            ]
        };
    }

    // Analyze prompt for intent
    const prompt = systemPrompt.toLowerCase();

    // Strategy 1: Transition tools (most common in state machines)
    const transitionTools = tools.filter(t => t.name.startsWith('transition_to_'));

    if (transitionTools.length > 0) {
        // Try to match tool name with prompt keywords
        for (const tool of transitionTools) {
            const targetNode = tool.name.replace('transition_to_', '');

            // Check if prompt mentions this node
            if (prompt.includes(targetNode.toLowerCase())) {
                return {
                    reasoning: `Prompt mentions "${targetNode}", selecting corresponding transition`,
                    content: [
                        { type: 'text', text: `Transitioning to ${targetNode}` },
                        {
                            type: 'tool_use',
                            id: `tool-${Date.now()}`,
                            name: tool.name,
                            input: { reason: 'keyword match in prompt' }
                        }
                    ],
                    toolUse: tool
                };
            }
        }

        // Check for semantic hints
        if (prompt.includes('error') || prompt.includes('fail')) {
            const errorTool = transitionTools.find(t =>
                t.name.includes('error') || t.name.includes('fail')
            );
            if (errorTool) {
                return {
                    reasoning: 'Prompt suggests error path, selecting error transition',
                    content: [
                        { type: 'text', text: 'Detected error condition' },
                        {
                            type: 'tool_use',
                            id: `tool-${Date.now()}`,
                            name: errorTool.name,
                            input: { reason: 'error handling' }
                        }
                    ],
                    toolUse: errorTool
                };
            }
        }

        if (prompt.includes('success') || prompt.includes('complete')) {
            const successTool = transitionTools.find(t =>
                t.name.includes('success') || t.name.includes('complete')
            );
            if (successTool) {
                return {
                    reasoning: 'Prompt suggests success path',
                    content: [
                        { type: 'text', text: 'Task completed successfully' },
                        {
                            type: 'tool_use',
                            id: `tool-${Date.now()}`,
                            name: successTool.name,
                            input: { reason: 'successful completion' }
                        }
                    ],
                    toolUse: successTool
                };
            }
        }

        // Default: first transition tool
        const defaultTool = transitionTools[0];
        return {
            reasoning: 'No specific match, selecting first available transition',
            content: [
                { type: 'text', text: 'Proceeding with transition' },
                {
                    type: 'tool_use',
                    id: `tool-${Date.now()}`,
                    name: defaultTool.name,
                    input: { reason: 'default transition' }
                }
            ],
            toolUse: defaultTool
        };
    }

    // Strategy 2: Meta tools
    const metaTools = tools.filter(t =>
        t.name.startsWith('add_') ||
        t.name.startsWith('remove_') ||
        t.name.startsWith('modify_') ||
        t.name.startsWith('get_')
    );

    if (metaTools.length > 0) {
        // Match meta tool by prompt keywords
        if (prompt.includes('add')) {
            const addTool = metaTools.find(t => t.name.startsWith('add_'));
            if (addTool) {
                const input = generateSmartInput(addTool, prompt);
                return {
                    reasoning: 'Prompt requests adding something, using add tool',
                    content: [
                        { type: 'text', text: 'Adding new element' },
                        {
                            type: 'tool_use',
                            id: `tool-${Date.now()}`,
                            name: addTool.name,
                            input
                        }
                    ],
                    toolUse: addTool
                };
            }
        }

        if (prompt.includes('get') || prompt.includes('retrieve') || prompt.includes('show')) {
            const getTool = metaTools.find(t => t.name.startsWith('get_'));
            if (getTool) {
                return {
                    reasoning: 'Prompt requests information, using get tool',
                    content: [
                        { type: 'text', text: 'Retrieving information' },
                        {
                            type: 'tool_use',
                            id: `tool-${Date.now()}`,
                            name: getTool.name,
                            input: {}
                        }
                    ],
                    toolUse: getTool
                };
            }
        }
    }

    // Strategy 3: Keyword matching on any tool
    for (const tool of tools) {
        const toolWords = tool.description.toLowerCase().split(/\s+/);
        const promptWords = prompt.split(/\s+/);

        const matchCount = toolWords.filter(w => promptWords.includes(w)).length;

        if (matchCount > 2) {
            const input = generateSmartInput(tool, prompt);
            return {
                reasoning: `Tool "${tool.name}" description matches prompt keywords`,
                content: [
                    { type: 'text', text: `Using ${tool.name}` },
                    {
                        type: 'tool_use',
                        id: `tool-${Date.now()}`,
                        name: tool.name,
                        input
                    }
                ],
                toolUse: tool
            };
        }
    }

    // Fallback: first tool
    const fallbackTool = tools[0];
    const input = generateSmartInput(fallbackTool, prompt);

    return {
        reasoning: 'No specific match, using first available tool',
        content: [
            { type: 'text', text: `Using ${fallbackTool.name}` },
            {
                type: 'tool_use',
                id: `tool-${Date.now()}`,
                name: fallbackTool.name,
                input
            }
        ],
        toolUse: fallbackTool
    };
}

/**
 * Generate smart input for a tool based on its schema and prompt
 */
function generateSmartInput(tool, prompt) {
    const input = {};

    if (!tool.input_schema || !tool.input_schema.properties) {
        return input;
    }

    for (const [propName, propSchema] of Object.entries(tool.input_schema.properties)) {
        // Special handling for common fields
        if (propName === 'reason') {
            input[propName] = 'agent decision based on context';
        } else if (propName === 'name' && prompt.includes('node')) {
            input[propName] = 'newNode';
        } else if (propSchema.type === 'string') {
            input[propName] = `value_for_${propName}`;
        } else if (propSchema.type === 'number') {
            input[propName] = 42;
        } else if (propSchema.type === 'boolean') {
            input[propName] = true;
        } else if (propSchema.type === 'array') {
            input[propName] = [];
        } else if (propSchema.type === 'object') {
            input[propName] = {};
        }
    }

    return input;
}

// Start watching
watchForRequests();

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.log('\n\n👋 Test Agent Responder shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Test Agent Responder shutting down...');
    process.exit(0);
});
