#!/usr/bin/env node
/**
 * Agent Request Listener - Intelligent Test Responder
 *
 * This script watches the test queue and delegates decision-making to
 * Claude Code sub-agents for intelligent tool selection. Unlike the heuristic
 * responder, this actually uses Claude's reasoning capabilities.
 *
 * Architecture:
 * 1. Watch queue for requests
 * 2. For each request, spawn Claude Code sub-agent via SDK
 * 3. Sub-agent analyzes context and makes intelligent decision
 * 4. Write response back to queue
 *
 * Usage:
 *   node scripts/agent-request-listener.js [--queue-dir <path>]
 *
 * Note: This requires the @anthropic/sdk to be installed.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

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

console.log('🤖 Agent Request Listener Starting...');
console.log('📁 Queue directory:', queueDir);
console.log('🧠 Using Claude Code sub-agents for intelligent decisions\n');
console.log('⏳ Waiting for test requests...\n');

// Ensure directories exist
if (!fs.existsSync(requestsPath)) {
    console.log('❌ Queue directory not found. Creating...');
    fs.mkdirSync(requestsPath, { recursive: true });
    fs.mkdirSync(responsesPath, { recursive: true });
}

// Initialize Anthropic client
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY environment variable not set');
    console.error('   Please set your API key to enable intelligent agent responses');
    process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

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
 * Process a single request using Claude Code sub-agent
 */
async function processRequest(filename) {
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

        // Use Claude Code to make intelligent decision
        console.log('\n🧠 Invoking Claude Code sub-agent for decision...');
        const decision = await makeIntelligentDecisionWithClaude(request);

        console.log('\n✅ Agent decision received:');
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

        console.log('✅ Sent response\n');
    } catch (error) {
        console.error(`❌ Error processing request ${filename}:`, error.message);

        // Write error response so test doesn't hang
        const errorResponse = {
            type: 'llm_invocation_response',
            requestId: filename.replace('.json', ''),
            timestamp: new Date().toISOString(),
            reasoning: `Error: ${error.message}`,
            response: {
                content: [{ type: 'text', text: `Error processing request: ${error.message}` }],
                stop_reason: 'end_turn'
            }
        };

        const responsePath = path.join(responsesPath, filename);
        fs.writeFileSync(responsePath, JSON.stringify(errorResponse, null, 2));
    }
}

/**
 * Make intelligent decision using Claude API
 *
 * This uses actual Claude reasoning instead of heuristics!
 */
async function makeIntelligentDecisionWithClaude(request) {
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

    // Build a prompt for Claude to analyze
    const analysisPrompt = buildAnalysisPrompt(request);

    // Call Claude API
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [
            {
                role: 'user',
                content: analysisPrompt
            }
        ],
        tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
        }))
    });

    // Extract decision from response
    const textContent = response.content.find(c => c.type === 'text');
    const toolUse = response.content.find(c => c.type === 'tool_use');

    const reasoning = textContent ? textContent.text : 'Agent decision based on context analysis';

    if (toolUse) {
        return {
            reasoning,
            content: [
                { type: 'text', text: reasoning },
                {
                    type: 'tool_use',
                    id: toolUse.id,
                    name: toolUse.name,
                    input: toolUse.input
                }
            ],
            toolUse: {
                name: toolUse.name,
                input: toolUse.input
            }
        };
    } else {
        return {
            reasoning,
            content: [
                { type: 'text', text: reasoning }
            ]
        };
    }
}

/**
 * Build analysis prompt for Claude
 */
function buildAnalysisPrompt(request) {
    const { systemPrompt, tools, context } = request;

    let prompt = `You are helping with DyGram state machine testing. You need to analyze a test scenario and choose the most appropriate tool to use.

**Test Context:**
- Test: ${context.testName || 'unknown'}
- Machine: ${context.machineTitle || 'unknown'}
- Current Node: ${context.currentNode || 'unknown'}

**System Prompt:**
${systemPrompt}

**Available Tools:**
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

**Your Task:**
Analyze the system prompt and available tools. Choose the most appropriate tool to use based on:
1. Keywords and intent in the system prompt
2. Tool descriptions and their purposes
3. The test context (machine state, current node, etc.)
4. Semantic meaning of the request

Use your best judgment to select the right tool. If the prompt mentions specific states or actions, choose tools that align with those. For state transitions, select the transition that makes the most logical sense given the context.

Provide brief reasoning for your choice, then use the selected tool.`;

    return prompt;
}

// Start watching
watchForRequests();

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.log('\n\n👋 Agent Request Listener shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Agent Request Listener shutting down...');
    process.exit(0);
});
