/**
 * Generative Execution Tests - Markdown-Driven Test Cases
 *
 * This test suite automatically discovers and runs test cases from the examples/testing/ directory.
 * Test cases are authored as DyGram code in markdown documentation and automatically extracted.
 *
 * Interactive Mode (local development):
 *   Terminal 1: node scripts/test-agent-responder.js
 *   Terminal 2: npm test test/validating/generative-execution.test.ts
 *
 * Playback Mode (CI):
 *   DYGRAM_TEST_MODE=playback npm test test/validating/generative-execution.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MachineExecutor } from '../../src/language/executor.js';
import { InteractiveTestClient } from '../../src/language/interactive-test-client.js';
import { PlaybackTestClient } from '../../src/language/playback-test-client.js';
import { parseTestMetadata, validateTestExecution, generateTestReport } from '../../src/language/test-metadata.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, basename } from 'path';
import * as fs from 'fs';

// Helper to create appropriate client based on environment
function createTestClient(recordingsDir: string) {
    const mode = process.env.DYGRAM_TEST_MODE || 'interactive';

    if (mode === 'playback') {
        return new PlaybackTestClient({
            recordingsDir,
            simulateDelay: true,
            delay: 100,
            strict: true
        });
    }

    // Default to interactive mode
    return new InteractiveTestClient({
        mode: 'file-queue',
        queueDir: '.dygram-test-queue',
        recordResponses: true,
        recordingsDir,
        timeout: 10000
    });
}

// Parse DyGram file and extract machine data
async function parseDyGramFile(filePath: string) {
    const content = await readFile(filePath, 'utf-8');
    
    // Remove provenance comment
    const cleanContent = content.replace(/^\/\/[^\n]*\n/, '');
    
    // For now, we'll use a simple parser to extract basic machine structure
    // In a full implementation, this would use the actual DyGram parser
    const lines = cleanContent.split('\n');
    const machine: any = {
        title: 'Generated Test Machine',
        nodes: [],
        edges: []
    };

    let currentNode: any = null;
    let inMachine = false;
    let inContext = false;

    for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('machine ')) {
            const titleMatch = trimmed.match(/machine\s+"([^"]+)"/);
            if (titleMatch) {
                machine.title = titleMatch[1];
            }
            inMachine = true;
            continue;
        }

        if (trimmed.startsWith('context ')) {
            inContext = true;
            continue;
        }

        if (trimmed === '}' && inContext) {
            inContext = false;
            continue;
        }

        if (inContext) {
            continue; // Skip context content for now
        }

        // Parse node definitions
        const nodeMatch = trimmed.match(/^(start|task|state|init|end)\s+(\w+)(?:\s+"([^"]+)")?/);
        if (nodeMatch) {
            const [, type, name, description] = nodeMatch;
            currentNode = {
                name,
                type: type === 'start' ? 'task' : type,
                attributes: []
            };
            
            if (description) {
                currentNode.attributes.push({
                    name: 'prompt',
                    type: 'string',
                    value: description
                });
            }
            
            machine.nodes.push(currentNode);
            continue;
        }

        // Parse node attributes
        if (currentNode && trimmed.includes(':') && !trimmed.includes('->')) {
            const attrMatch = trimmed.match(/(\w+):\s*"?([^"]+)"?/);
            if (attrMatch) {
                const [, name, value] = attrMatch;
                currentNode.attributes.push({
                    name,
                    type: 'string',
                    value: value.replace(/"/g, '')
                });
            }
        }

        // Parse edges
        const edgeMatch = trimmed.match(/(\w+)\s*->\s*(\w+)/);
        if (edgeMatch) {
            const [, source, target] = edgeMatch;
            machine.edges.push({
                source,
                target
            });
        }
    }

    return machine;
}

// Extract expected behaviors from markdown documentation
async function extractExpectedBehaviors(testCategory: string, testName: string): Promise<string[]> {
    const docPath = join(process.cwd(), 'docs', 'testing', `${testCategory}.md`);
    
    try {
        const content = await readFile(docPath, 'utf-8');
        const lines = content.split('\n');
        const behaviors: string[] = [];
        let inExpectedSection = false;
        
        for (const line of lines) {
            if (line.includes(`${testName}.dy`) || line.includes(testName.replace(/-/g, ' '))) {
                inExpectedSection = true;
                continue;
            }
            
            if (inExpectedSection && line.startsWith('**Expected Behavior:**')) {
                continue;
            }
            
            if (inExpectedSection && line.startsWith('- Should ')) {
                behaviors.push(line.substring(2)); // Remove "- "
            }
            
            if (inExpectedSection && (line.startsWith('##') || line.startsWith('###'))) {
                break;
            }
        }
        
        return behaviors;
    } catch (error) {
        console.warn(`Could not extract expected behaviors for ${testCategory}/${testName}:`, error);
        return [];
    }
}

// Discover test files in examples/testing directory
async function discoverTestFiles(): Promise<Array<{ category: string; name: string; path: string }>> {
    const testingDir = join(process.cwd(), 'examples', 'testing');
    const testFiles: Array<{ category: string; name: string; path: string }> = [];
    
    try {
        const categories = await readdir(testingDir, { withFileTypes: true });
        
        for (const category of categories) {
            if (category.isDirectory()) {
                const categoryPath = join(testingDir, category.name);
                const files = await readdir(categoryPath);
                
                for (const file of files) {
                    if (file.endsWith('.dy')) {
                        const name = basename(file, '.dy');
                        testFiles.push({
                            category: category.name,
                            name,
                            path: join(categoryPath, file)
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.warn('Could not discover test files:', error);
    }
    
    return testFiles;
}

describe('Generative Execution Tests', () => {
    let client: any;
    const queueDir = '.dygram-test-queue';

    beforeEach(() => {
        // Clean up queue (only needed in interactive mode)
        if (process.env.DYGRAM_TEST_MODE !== 'playback' && fs.existsSync(queueDir)) {
            fs.rmSync(queueDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean up queue
        if (fs.existsSync(queueDir)) {
            fs.rmSync(queueDir, { recursive: true });
        }
    });

    describe('Tool Execution Tests', () => {
        it('should discover and run tool execution tests', async () => {
            const testFiles = await discoverTestFiles();
            const toolExecutionTests = testFiles.filter(f => f.category === 'tool-execution');

            console.log(`Discovered ${testFiles.length} total test files`);
            console.log(`Tool execution tests: ${toolExecutionTests.length}`);
            console.log('All test files:', testFiles.map(f => `${f.category}/${f.name}`));

            expect(toolExecutionTests.length).toBeGreaterThan(0);

            for (const testFile of toolExecutionTests) {
                // Create client for this specific test
                client = createTestClient(`test/fixtures/recordings/generative-tool-execution/${testFile.name}`);

                // Parse the DyGram file
                const machineData = await parseDyGramFile(testFile.path);
                
                // Create executor
                const executor = new MachineExecutor(machineData, { llm: client as any });

                // Extract expected behaviors
                const expectedBehaviors = await extractExpectedBehaviors('tool-execution', testFile.name);

                // Execute the machine with better termination logic
                let stepResult = true;
                let stepCount = 0;
                const maxSteps = 15; // Reduced to prevent infinite loops
                let lastNodeVisitCount = new Map();

                while (stepResult && stepCount < maxSteps) {
                    const contextBefore = executor.getContext();
                    
                    // Check for infinite loops (visiting same node too many times)
                    const visitCount = lastNodeVisitCount.get(contextBefore.currentNode) || 0;
                    if (visitCount > 3) {
                        console.log(`Breaking due to potential infinite loop at node: ${contextBefore.currentNode}`);
                        break;
                    }
                    lastNodeVisitCount.set(contextBefore.currentNode, visitCount + 1);
                    
                    stepResult = await executor.step();
                    stepCount++;
                    
                    const context = executor.getContext();
                    
                    // Break if we reach an end state
                    if (context.currentNode === 'end' || 
                        machineData.nodes.find((n: any) => n.name === context.currentNode)?.type === 'end') {
                        break;
                    }
                    
                    // Break if no progress (stuck in same node)
                    if (contextBefore.currentNode === context.currentNode && stepCount > 5) {
                        console.log(`Breaking due to no progress from node: ${context.currentNode}`);
                        break;
                    }
                }

                const finalContext = executor.getContext();

                // Basic assertions that should apply to all tests
                expect(finalContext.history.length).toBeGreaterThan(0);
                expect(finalContext.visitedNodes.size).toBeGreaterThanOrEqual(1);

                // Validate expected behaviors if available
                for (const behavior of expectedBehaviors) {
                    if (behavior.includes('Should transition from start node')) {
                        expect(finalContext.currentNode).not.toBe('start');
                    }
                    
                    if (behavior.includes('Should reach end state')) {
                        expect(finalContext.currentNode).toBe('end');
                    }
                    
                    if (behavior.includes('Should have at least 2 nodes in visit history')) {
                        expect(finalContext.visitedNodes.size).toBeGreaterThanOrEqual(2);
                    }
                    
                    if (behavior.includes('Should not throw errors')) {
                        // Test passed if we got here without throwing
                        expect(true).toBe(true);
                    }
                    
                    if (behavior.includes('Should handle multiple decision points')) {
                        expect(finalContext.history.length).toBeGreaterThanOrEqual(2);
                    }
                    
                    if (behavior.includes('Should complete execution')) {
                        expect(stepResult).toBe(false); // Should have completed
                    }
                }

                console.log(`✓ ${testFile.name}: Visited ${finalContext.visitedNodes.size} nodes, ${finalContext.history.length} steps`);
            }
        });
    });

    describe('Task Execution Tests', () => {
        it('should discover and run task execution tests', async () => {
            const testFiles = await discoverTestFiles();
            const taskExecutionTests = testFiles.filter(f => f.category === 'task-execution');

            console.log(`Task execution tests: ${taskExecutionTests.length}`);

            expect(taskExecutionTests.length).toBeGreaterThan(0);

            for (const testFile of taskExecutionTests) {
                // Create client for this specific test
                client = createTestClient(`test/fixtures/recordings/generative-task-execution/${testFile.name}`);

                // Parse the DyGram file
                const machineData = await parseDyGramFile(testFile.path);
                
                // Create executor
                const executor = new MachineExecutor(machineData, { llm: client as any });

                // Extract expected behaviors
                const expectedBehaviors = await extractExpectedBehaviors('task-execution', testFile.name);

                // Execute the machine with better termination logic
                let stepResult = true;
                let stepCount = 0;
                const maxSteps = 20; // Reduced to prevent infinite loops
                let lastNodeVisitCount = new Map();

                while (stepResult && stepCount < maxSteps) {
                    const contextBefore = executor.getContext();
                    
                    // Check for infinite loops (visiting same node too many times)
                    const visitCount = lastNodeVisitCount.get(contextBefore.currentNode) || 0;
                    if (visitCount > 4) {
                        console.log(`Breaking due to potential infinite loop at node: ${contextBefore.currentNode}`);
                        break;
                    }
                    lastNodeVisitCount.set(contextBefore.currentNode, visitCount + 1);
                    
                    stepResult = await executor.step();
                    stepCount++;
                    
                    const context = executor.getContext();
                    
                    // Break if we reach an end state
                    if (context.currentNode === 'end' || 
                        machineData.nodes.find((n: any) => n.name === context.currentNode)?.type === 'end') {
                        break;
                    }
                    
                    // Break if no progress (stuck in same node)
                    if (contextBefore.currentNode === context.currentNode && stepCount > 8) {
                        console.log(`Breaking due to no progress from node: ${context.currentNode}`);
                        break;
                    }
                }

                const finalContext = executor.getContext();

                // Basic assertions that should apply to all tests
                expect(finalContext.history.length).toBeGreaterThan(0);
                expect(finalContext.visitedNodes.size).toBeGreaterThanOrEqual(1);

                // Validate expected behaviors if available
                for (const behavior of expectedBehaviors) {
                    if (behavior.includes('Should execute basic task node successfully')) {
                        expect(finalContext.history.length).toBeGreaterThan(0);
                    }
                    
                    if (behavior.includes('Should handle missing attributes gracefully')) {
                        // Test passed if we got here without throwing
                        expect(true).toBe(true);
                    }
                    
                    if (behavior.includes('Should maintain context throughout')) {
                        expect(finalContext.visitedNodes.size).toBeGreaterThan(0);
                    }
                    
                    if (behavior.includes('Should execute tasks in sequence')) {
                        expect(finalContext.history.length).toBeGreaterThanOrEqual(2);
                    }
                    
                    if (behavior.includes('Should handle comprehensive attribute sets')) {
                        expect(finalContext.visitedNodes.size).toBeGreaterThanOrEqual(2);
                    }
                }

                console.log(`✓ ${testFile.name}: Visited ${finalContext.visitedNodes.size} nodes, ${finalContext.history.length} steps`);
            }
        });
    });
});
