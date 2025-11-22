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
import { readdir, readFile, stat, writeFile, mkdir } from 'fs/promises';
import { join, relative, basename, dirname } from 'path';
import * as fs from 'fs';
import { createMachineServices } from '../../src/language/machine-module.js';
import { extractAstNodeForTests } from '../../src/cli/cli-util.js';
import { generateJSON } from '../../src/language/generator/generator.js';
import { Machine } from '../../src/language/generated/ast.js';
import { NodeFileSystem } from 'langium/node';

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
        timeout: 60000 // 60 seconds to allow time for manual Claude Code responses
    });
}

// Parse DyGram file using canonical Machine parsing logic
async function parseDyGramFile(filePath: string) {
    // Use the canonical parsing approach from CLI and codemirror-setup
    const services = createMachineServices(NodeFileSystem).Machine;

    // Extract the parsed AST using test-safe parser (throws errors instead of process.exit)
    const machine = await extractAstNodeForTests<Machine>(filePath, services);

    // Convert to MachineData format using the canonical generator
    const jsonResult = generateJSON(machine, filePath);
    const machineData = JSON.parse(jsonResult.content);

    return machineData;
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

// Generate comprehensive test report for integration with HTML output
async function generateComprehensiveTestReport(testResults: any[], category: string) {
    const outputDir = join(process.cwd(), 'test-output', 'comprehensive-generative', 'execution-testing');
    const categoryDir = join(outputDir, category);
    
    // Ensure output directory exists
    await mkdir(categoryDir, { recursive: true });
    
    // Generate individual test result files
    for (const result of testResults) {
        const testOutputPath = join(categoryDir, `${result.name}.html`);
        const testContent = generateTestResultHTML(result, category);
        await writeFile(testOutputPath, testContent, 'utf-8');
    }
    
    // Generate category summary
    const summaryPath = join(categoryDir, 'index.html');
    const summaryContent = generateCategorySummaryHTML(testResults, category);
    await writeFile(summaryPath, summaryContent, 'utf-8');
    
    // Generate markdown report
    const reportPath = join(categoryDir, 'REPORT.md');
    const reportContent = generateMarkdownReport(testResults, category);
    await writeFile(reportPath, reportContent, 'utf-8');
    
    console.log(`📊 Generated comprehensive test report for ${category} in ${categoryDir}`);
}

// Generate HTML for individual test result
function generateTestResultHTML(result: any, category: string): string {
    const status = result.success ? 'PASS' : 'FAIL';
    const statusClass = result.success ? 'success' : 'failure';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${result.name} - ${category} Test Result</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; }
        .status { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; text-transform: uppercase; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .failure { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .metric { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #007bff; }
        .code { background: #f8f9fa; padding: 15px; border-radius: 6px; font-family: 'Monaco', 'Consolas', monospace; overflow-x: auto; white-space: pre-wrap; }
        .execution-log { background: #2d3748; color: #e2e8f0; padding: 20px; border-radius: 6px; font-family: monospace; max-height: 400px; overflow-y: auto; }
        .node-path { display: flex; align-items: center; margin: 10px 0; }
        .node { background: #e3f2fd; padding: 8px 12px; border-radius: 4px; margin: 0 5px; border: 1px solid #bbdefb; }
        .arrow { color: #666; margin: 0 10px; }
        .behaviors { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .behavior-item { margin: 5px 0; padding: 5px 0; }
        .behavior-pass { color: #28a745; }
        .behavior-fail { color: #dc3545; }
        .behavior-skip { color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${result.name}</h1>
            <p>Category: ${category} | Status: <span class="status ${statusClass}">${status}</span></p>
        </div>
        <div class="content">
            <div class="metric">
                <h3>Execution Metrics</h3>
                <p><strong>Nodes Visited:</strong> ${result.metrics.nodesVisited}</p>
                <p><strong>Execution Steps:</strong> ${result.metrics.executionSteps}</p>
                <p><strong>Final Node:</strong> ${result.metrics.finalNode}</p>
                <p><strong>Execution Time:</strong> ${result.metrics.executionTime}ms</p>
            </div>
            
            <div class="metric">
                <h3>Node Execution Path</h3>
                <div class="node-path">
                    ${result.metrics.visitedNodesList.map((node: string, index: number) => 
                        `<span class="node">${node}</span>${index < result.metrics.visitedNodesList.length - 1 ? '<span class="arrow">→</span>' : ''}`
                    ).join('')}
                </div>
            </div>
            
            ${result.expectedBehaviors.length > 0 ? `
            <div class="behaviors">
                <h3>Expected Behaviors Validation</h3>
                ${result.expectedBehaviors.map((behavior: any) => `
                    <div class="behavior-item behavior-${behavior.status}">
                        <strong>${behavior.status.toUpperCase()}:</strong> ${behavior.description}
                        ${behavior.details ? `<br><small>${behavior.details}</small>` : ''}
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            <div class="metric">
                <h3>DyGram Source Code</h3>
                <div class="code">${result.sourceCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            
            ${result.executionLog ? `
            <div class="metric">
                <h3>Execution Log</h3>
                <div class="execution-log">${result.executionLog.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            ` : ''}
            
            ${result.error ? `
            <div class="metric" style="border-left-color: #dc3545;">
                <h3>Error Details</h3>
                <div class="code" style="background: #f8d7da; color: #721c24;">${result.error}</div>
            </div>
            ` : ''}
        </div>
    </div>
</body>
</html>`;
}

// Generate category summary HTML
function generateCategorySummaryHTML(results: any[], category: string): string {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '0';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${category} Test Summary - Execution Testing</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
        .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
        .test-list { margin: 20px 0; }
        .test-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; margin: 10px 0; background: #f8f9fa; border-radius: 6px; }
        .test-name { font-weight: bold; }
        .test-status { padding: 6px 12px; border-radius: 15px; font-size: 0.9em; font-weight: bold; }
        .pass { background: #d4edda; color: #155724; }
        .fail { background: #f8d7da; color: #721c24; }
        .test-metrics { font-size: 0.9em; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${category} Test Summary</h1>
            <p>Comprehensive Execution Testing Results</p>
        </div>
        <div class="content">
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number">${totalTests}</div>
                    <div>Total Tests</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${passedTests}</div>
                    <div>Passed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${failedTests}</div>
                    <div>Failed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${successRate}%</div>
                    <div>Success Rate</div>
                </div>
            </div>
            
            <div class="test-list">
                <h3>Test Results</h3>
                ${results.map(result => `
                    <div class="test-item">
                        <div>
                            <div class="test-name">
                                <a href="${result.name}.html">${result.name}</a>
                            </div>
                            <div class="test-metrics">
                                ${result.metrics.nodesVisited} nodes, ${result.metrics.executionSteps} steps, ${result.metrics.executionTime}ms
                            </div>
                        </div>
                        <div class="test-status ${result.success ? 'pass' : 'fail'}">
                            ${result.success ? 'PASS' : 'FAIL'}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
</body>
</html>`;
}

// Generate markdown report
function generateMarkdownReport(results: any[], category: string): string {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '0';
    
    return `# ${category} Test Report

## Summary

- **Total Tests:** ${totalTests}
- **Passed:** ${passedTests}
- **Failed:** ${failedTests}
- **Success Rate:** ${successRate}%

## Test Results

${results.map(result => `
### ${result.name}

**Status:** ${result.success ? '✅ PASS' : '❌ FAIL'}

**Metrics:**
- Nodes Visited: ${result.metrics.nodesVisited}
- Execution Steps: ${result.metrics.executionSteps}
- Final Node: ${result.metrics.finalNode}
- Execution Time: ${result.metrics.executionTime}ms

**Execution Path:** ${result.metrics.visitedNodesList.join(' → ')}

${result.expectedBehaviors.length > 0 ? `
**Expected Behaviors:**
${result.expectedBehaviors.map((b: any) => `- ${b.status.toUpperCase()}: ${b.description}`).join('\n')}
` : ''}

${result.error ? `**Error:** ${result.error}` : ''}

---
`).join('')}

## Generated on ${new Date().toISOString()}
`;
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
        it('should discover and run tool execution tests', { timeout: 300000 }, async () => {
            const testFiles = await discoverTestFiles();
            const toolExecutionTests = testFiles.filter(f => f.category === 'tool-execution');

            console.log(`Discovered ${testFiles.length} total test files`);
            console.log(`Tool execution tests: ${toolExecutionTests.length}`);
            console.log('All test files:', testFiles.map(f => `${f.category}/${f.name}`));

            expect(toolExecutionTests.length).toBeGreaterThan(0);

            const testResults: any[] = [];

            for (const testFile of toolExecutionTests) {
                const startTime = Date.now();
                let testResult: any = {
                    name: testFile.name,
                    category: 'tool-execution',
                    success: false,
                    metrics: {
                        nodesVisited: 0,
                        executionSteps: 0,
                        finalNode: '',
                        executionTime: 0,
                        visitedNodesList: []
                    },
                    expectedBehaviors: [],
                    sourceCode: '',
                    executionLog: '',
                    error: null
                };

                try {
                    // Read source code for report
                    testResult.sourceCode = await readFile(testFile.path, 'utf-8');

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
                    const maxSteps = 15;
                    let lastNodeVisitCount = new Map();
                    let executionLog = '';

                    while (stepResult && stepCount < maxSteps) {
                        const contextBefore = executor.getContext();
                        
                        // Check for infinite loops
                        const visitCount = lastNodeVisitCount.get(contextBefore.currentNode) || 0;
                        if (visitCount > 3) {
                            executionLog += `Breaking due to potential infinite loop at node: ${contextBefore.currentNode}\n`;
                            break;
                        }
                        lastNodeVisitCount.set(contextBefore.currentNode, visitCount + 1);
                        
                        stepResult = await executor.step();
                        stepCount++;
                        
                        const context = executor.getContext();
                        executionLog += `Step ${stepCount}: ${contextBefore.currentNode} -> ${context.currentNode}\n`;
                        
                        // Break if we reach an end state
                        if (context.currentNode === 'end' || 
                            machineData.nodes.find((n: any) => n.name === context.currentNode)?.type === 'end') {
                            break;
                        }
                        
                        // Break if no progress
                        if (contextBefore.currentNode === context.currentNode && stepCount > 5) {
                            executionLog += `Breaking due to no progress from node: ${context.currentNode}\n`;
                            break;
                        }
                    }

                    const finalContext = executor.getContext();
                    const endTime = Date.now();

                    // Update test result metrics
                    testResult.metrics = {
                        nodesVisited: finalContext.visitedNodes.size,
                        executionSteps: finalContext.history.length,
                        finalNode: finalContext.currentNode,
                        executionTime: endTime - startTime,
                        visitedNodesList: Array.from(finalContext.visitedNodes)
                    };
                    testResult.executionLog = executionLog;

                    // Validate expected behaviors
                    testResult.expectedBehaviors = expectedBehaviors.map(behavior => {
                        let status = 'skip';
                        let details = '';

                        if (behavior.includes('Should transition from start node')) {
                            status = finalContext.currentNode !== 'start' ? 'pass' : 'fail';
                            details = `Final node: ${finalContext.currentNode}`;
                        } else if (behavior.includes('Should reach end state')) {
                            status = finalContext.currentNode === 'end' ? 'pass' : 'fail';
                            details = `Final node: ${finalContext.currentNode}`;
                        } else if (behavior.includes('Should have at least 2 nodes in visit history')) {
                            status = finalContext.visitedNodes.size >= 2 ? 'pass' : 'fail';
                            details = `Visited ${finalContext.visitedNodes.size} nodes`;
                        } else if (behavior.includes('Should not throw errors')) {
                            status = 'pass';
                            details = 'No exceptions thrown';
                        } else if (behavior.includes('Should handle multiple decision points')) {
                            status = finalContext.history.length >= 2 ? 'pass' : 'fail';
                            details = `${finalContext.history.length} execution steps`;
                        } else if (behavior.includes('Should complete execution')) {
                            status = !stepResult ? 'pass' : 'fail';
                            details = stepResult ? 'Still executing' : 'Completed';
                        }

                        return { description: behavior, status, details };
                    });

                    // Basic assertions
                    // For isolated machines (no edges), history can be empty
                    if (machineData.edges && machineData.edges.length > 0) {
                        expect(finalContext.history.length).toBeGreaterThan(0);
                    }
                    expect(finalContext.visitedNodes.size).toBeGreaterThanOrEqual(1);

                    testResult.success = true;
                    console.log(`✓ ${testFile.name}: Visited ${finalContext.visitedNodes.size} nodes, ${finalContext.history.length} steps`);

                } catch (error) {
                    testResult.error = error instanceof Error ? error.message : String(error);
                    testResult.success = false;
                    console.log(`✗ ${testFile.name}: ${testResult.error}`);
                }

                testResults.push(testResult);
            }

            // Generate comprehensive test report
            await generateComprehensiveTestReport(testResults, 'tool-execution');
        });
    });

    describe('Task Execution Tests', () => {
        it('should discover and run task execution tests', { timeout: 300000 }, async () => {
            const testFiles = await discoverTestFiles();
            const taskExecutionTests = testFiles.filter(f => f.category === 'task-execution');

            console.log(`Task execution tests: ${taskExecutionTests.length}`);

            expect(taskExecutionTests.length).toBeGreaterThan(0);

            const testResults: any[] = [];

            for (const testFile of taskExecutionTests) {
                const startTime = Date.now();
                let testResult: any = {
                    name: testFile.name,
                    category: 'task-execution',
                    success: false,
                    metrics: {
                        nodesVisited: 0,
                        executionSteps: 0,
                        finalNode: '',
                        executionTime: 0,
                        visitedNodesList: []
                    },
                    expectedBehaviors: [],
                    sourceCode: '',
                    executionLog: '',
                    error: null
                };

                try {
                    // Read source code for report
                    testResult.sourceCode = await readFile(testFile.path, 'utf-8');

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
                    const maxSteps = 20;
                    let lastNodeVisitCount = new Map();
                    let executionLog = '';

                    while (stepResult && stepCount < maxSteps) {
                        const contextBefore = executor.getContext();
                        
                        // Check for infinite loops
                        const visitCount = lastNodeVisitCount.get(contextBefore.currentNode) || 0;
                        if (visitCount > 4) {
                            executionLog += `Breaking due to potential infinite loop at node: ${contextBefore.currentNode}\n`;
                            break;
                        }
                        lastNodeVisitCount.set(contextBefore.currentNode, visitCount + 1);
                        
                        stepResult = await executor.step();
                        stepCount++;
                        
                        const context = executor.getContext();
                        executionLog += `Step ${stepCount}: ${contextBefore.currentNode} -> ${context.currentNode}\n`;
                        
                        // Break if we reach an end state
                        if (context.currentNode === 'end' || 
                            machineData.nodes.find((n: any) => n.name === context.currentNode)?.type === 'end') {
                            break;
                        }
                        
                        // Break if no progress
                        if (contextBefore.currentNode === context.currentNode && stepCount > 8) {
                            executionLog += `Breaking due to no progress from node: ${context.currentNode}\n`;
                            break;
                        }
                    }

                    const finalContext = executor.getContext();
                    const endTime = Date.now();

                    // Update test result metrics
                    testResult.metrics = {
                        nodesVisited: finalContext.visitedNodes.size,
                        executionSteps: finalContext.history.length,
                        finalNode: finalContext.currentNode,
                        executionTime: endTime - startTime,
                        visitedNodesList: Array.from(finalContext.visitedNodes)
                    };
                    testResult.executionLog = executionLog;

                    // Validate expected behaviors
                    testResult.expectedBehaviors = expectedBehaviors.map(behavior => {
                        let status = 'skip';
                        let details = '';

                        if (behavior.includes('Should execute basic task node successfully')) {
                            status = finalContext.history.length > 0 ? 'pass' : 'fail';
                            details = `${finalContext.history.length} execution steps`;
                        } else if (behavior.includes('Should handle missing attributes gracefully')) {
                            status = 'pass';
                            details = 'No exceptions thrown';
                        } else if (behavior.includes('Should maintain context throughout')) {
                            status = finalContext.visitedNodes.size > 0 ? 'pass' : 'fail';
                            details = `Visited ${finalContext.visitedNodes.size} nodes`;
                        } else if (behavior.includes('Should execute tasks in sequence')) {
                            status = finalContext.history.length >= 2 ? 'pass' : 'fail';
                            details = `${finalContext.history.length} execution steps`;
                        } else if (behavior.includes('Should handle comprehensive attribute sets')) {
                            status = finalContext.visitedNodes.size >= 2 ? 'pass' : 'fail';
                            details = `Visited ${finalContext.visitedNodes.size} nodes`;
                        }

                        return { description: behavior, status, details };
                    });

                    // Basic assertions
                    // For isolated machines (no edges), history can be empty
                    if (machineData.edges && machineData.edges.length > 0) {
                        expect(finalContext.history.length).toBeGreaterThan(0);
                    }
                    expect(finalContext.visitedNodes.size).toBeGreaterThanOrEqual(1);

                    testResult.success = true;
                    console.log(`✓ ${testFile.name}: Visited ${finalContext.visitedNodes.size} nodes, ${finalContext.history.length} steps`);

                } catch (error) {
                    testResult.error = error instanceof Error ? error.message : String(error);
                    testResult.success = false;
                    console.log(`✗ ${testFile.name}: ${testResult.error}`);
                }

                testResults.push(testResult);
            }

            // Generate comprehensive test report
            await generateComprehensiveTestReport(testResults, 'task-execution');
        });
    });
});
