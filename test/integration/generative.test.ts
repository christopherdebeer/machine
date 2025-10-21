import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine, isMachine } from "../../src/language/generated/ast.js";
import { generateJSON, generateGraphviz } from "../../src/language/generator/generator.js";
import * as fs from "node:fs";
import * as path from "node:path";

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

/**
 * Generative Integration Test Suite
 *
 * This suite validates the complete DyGram transformation pipeline:
 * 1. Loads examples from the examples/ directory
 * 2. Transforms through full pipeline: DyGram → AST → JSON → Graphviz
 * 3. Validates completeness and losslessness
 * 4. Outputs visual inspection data
 *
 * See docs/testing-approach.md for methodology details.
 */

interface ValidationResult {
    testName: string;
    source: string;
    passed: boolean;
    parseErrors: string[];
    transformErrors: string[];
    completenessIssues: string[];
    losslessnessIssues: string[];
    graphvizParseErrors: string[];
    graphvizOutput?: string;
    jsonOutput?: any;
}

class ValidationReporter {
    private results: ValidationResult[] = [];
    private outputDir = path.join(process.cwd(), 'test-output', 'generative');

    constructor() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    addResult(result: ValidationResult): void {
        this.results.push(result);

        // Write individual outputs for manual inspection
        if (result.graphvizOutput) {
            const fileName = result.testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            fs.writeFileSync(
                path.join(this.outputDir, `${fileName}.md`),
                `# ${result.testName}\n\n## Source\n\`\`\`machine\n${result.source}\n\`\`\`\n\n## Graphviz Output\n\`\`\`dot\n${result.graphvizOutput}\n\`\`\`\n\n## JSON Output\n\`\`\`json\n${JSON.stringify(result.jsonOutput, null, 2)}\n\`\`\`\n\n## Validation Status\n- Passed: ${result.passed}\n- Parse Errors: ${result.parseErrors.length}\n- Transform Errors: ${result.transformErrors.length}\n- Completeness Issues: ${result.completenessIssues.length}\n- Losslessness Issues: ${result.losslessnessIssues.length}\n- Graphviz Parse Errors: ${result.graphvizParseErrors.length}${result.graphvizParseErrors.length > 0 ? '\n  - ' + result.graphvizParseErrors.join('\n  - ') : ''}\n`
            );
        }
    }

    generateReport(): string {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;

        let report = `# Generative Test Report\n\n`;
        report += `## Summary\n`;
        report += `- Total Tests: ${total}\n`;
        report += `- Passed: ${passed}\n`;
        report += `- Failed: ${failed}\n`;
        report += `- Success Rate: ${((passed / total) * 100).toFixed(2)}%\n\n`;

        // Group issues by type
        const allParseErrors = this.results.flatMap(r => r.parseErrors);
        const allTransformErrors = this.results.flatMap(r => r.transformErrors);
        const allCompletenessIssues = this.results.flatMap(r => r.completenessIssues);
        const allLosslessnessIssues = this.results.flatMap(r => r.losslessnessIssues);
        const allGraphvizParseErrors = this.results.flatMap(r => r.graphvizParseErrors);

        report += `## Issue Summary\n`;
        report += `- Parse Errors: ${allParseErrors.length}\n`;
        report += `- Transform Errors: ${allTransformErrors.length}\n`;
        report += `- Completeness Issues: ${allCompletenessIssues.length}\n`;
        report += `- Losslessness Issues: ${allLosslessnessIssues.length}\n`;
        report += `- Graphviz Parse Errors: ${allGraphvizParseErrors.length}\n\n`;

        // Failed tests details
        const failedResults = this.results.filter(r => !r.passed);
        if (failedResults.length > 0) {
            report += `## Failed Tests\n\n`;
            failedResults.forEach(r => {
                report += `### ${r.testName}\n`;
                if (r.parseErrors.length > 0) {
                    report += `**Parse Errors:**\n${r.parseErrors.map(e => `- ${e}`).join('\n')}\n\n`;
                }
                if (r.transformErrors.length > 0) {
                    report += `**Transform Errors:**\n${r.transformErrors.map(e => `- ${e}`).join('\n')}\n\n`;
                }
                if (r.completenessIssues.length > 0) {
                    report += `**Completeness Issues:**\n${r.completenessIssues.map(e => `- ${e}`).join('\n')}\n\n`;
                }
                if (r.losslessnessIssues.length > 0) {
                    report += `**Losslessness Issues:**\n${r.losslessnessIssues.map(e => `- ${e}`).join('\n')}\n\n`;
                }
                if (r.graphvizParseErrors.length > 0) {
                    report += `**Graphviz Parse Errors:**\n${r.graphvizParseErrors.map(e => `- ${e}`).join('\n')}\n\n`;
                }
            });
        }

        return report;
    }

    generateHtmlReport(): string {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;
        const successRate = ((passed / total) * 100).toFixed(2);

        const allParseErrors = this.results.flatMap(r => r.parseErrors);
        const allTransformErrors = this.results.flatMap(r => r.transformErrors);
        const allCompletenessIssues = this.results.flatMap(r => r.completenessIssues);
        const allLosslessnessIssues = this.results.flatMap(r => r.losslessnessIssues);
        const allGraphvizParseErrors = this.results.flatMap(r => r.graphvizParseErrors);

        const failedResults = this.results.filter(r => !r.passed);

        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generative Test Report - DyGram</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 2rem; }
        .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 2rem; }
        h1 { color: #667eea; margin-bottom: 0.5rem; }
        .subtitle { color: #666; margin-bottom: 2rem; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { padding: 1.5rem; border-radius: 6px; text-align: center; }
        .stat-card.total { background: #e3f2fd; }
        .stat-card.passed { background: #e8f5e9; }
        .stat-card.failed { background: #ffebee; }
        .stat-value { font-size: 2.5rem; font-weight: bold; }
        .stat-label { color: #666; font-size: 0.875rem; margin-top: 0.5rem; }
        .issues { margin-bottom: 2rem; }
        .issue-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
        .issue-card { padding: 1rem; border-radius: 4px; background: #f9f9f9; border-left: 4px solid #667eea; }
        .issue-count { font-size: 1.5rem; font-weight: bold; color: #667eea; }
        .issue-label { font-size: 0.875rem; color: #666; }
        .test-list { margin-top: 2rem; }
        .test-item { border: 1px solid #e0e0e0; border-radius: 4px; margin-bottom: 1rem; overflow: hidden; }
        .test-header { padding: 1rem; background: #fafafa; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .test-header:hover { background: #f5f5f5; }
        .test-name { font-weight: 600; }
        .test-status { padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.875rem; font-weight: 600; }
        .test-status.passed { background: #4caf50; color: white; }
        .test-status.failed { background: #f44336; color: white; }
        .test-details { padding: 1rem; display: none; background: white; border-top: 1px solid #e0e0e0; }
        .test-details.active { display: block; }
        .error-section { margin-top: 1rem; }
        .error-section h4 { color: #d32f2f; margin-bottom: 0.5rem; }
        .error-list { list-style: none; padding-left: 1rem; }
        .error-list li { padding: 0.25rem 0; color: #666; }
        .error-list li:before { content: "⚠ "; color: #d32f2f; }
        .artifact-link { display: inline-block; margin-top: 0.5rem; padding: 0.5rem 1rem; background: #667eea; color: white; text-decoration: none; border-radius: 4px; font-size: 0.875rem; }
        .artifact-link:hover { background: #5568d3; }
    </style>
    <script>
        function toggleDetails(id) {
            const details = document.getElementById(id);
            details.classList.toggle('active');
        }
    </script>
</head>
<body>
    <div class="container">
        <h1>📊 Generative Test Report</h1>
        <p class="subtitle">Complete DyGram transformation pipeline validation</p>

        <div class="summary">
            <div class="stat-card total">
                <div class="stat-value">${total}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card passed">
                <div class="stat-value">${passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card failed">
                <div class="stat-value">${failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card total">
                <div class="stat-value">${successRate}%</div>
                <div class="stat-label">Success Rate</div>
            </div>
        </div>

        <div class="issues">
            <h2>Issue Summary</h2>
            <div class="issue-grid">
                <div class="issue-card">
                    <div class="issue-count">${allParseErrors.length}</div>
                    <div class="issue-label">Parse Errors</div>
                </div>
                <div class="issue-card">
                    <div class="issue-count">${allTransformErrors.length}</div>
                    <div class="issue-label">Transform Errors</div>
                </div>
                <div class="issue-card">
                    <div class="issue-count">${allCompletenessIssues.length}</div>
                    <div class="issue-label">Completeness Issues</div>
                </div>
                <div class="issue-card">
                    <div class="issue-count">${allLosslessnessIssues.length}</div>
                    <div class="issue-label">Losslessness Issues</div>
                </div>
                <div class="issue-card">
                    <div class="issue-count">${allGraphvizParseErrors.length}</div>
                    <div class="issue-label">Graphviz Errors</div>
                </div>
            </div>
        </div>

        <div class="test-list">
            <h2>Test Results</h2>`;

        this.results.forEach((result, index) => {
            const fileName = result.testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const detailsId = `details-${index}`;
            html += `
            <div class="test-item">
                <div class="test-header" onclick="toggleDetails('${detailsId}')">
                    <span class="test-name">${result.testName}</span>
                    <span class="test-status ${result.passed ? 'passed' : 'failed'}">${result.passed ? 'PASSED' : 'FAILED'}</span>
                </div>
                <div class="test-details" id="${detailsId}">
                    <a href="${fileName}.md" class="artifact-link" target="_blank">View Full Artifacts →</a>`;

            if (!result.passed) {
                if (result.parseErrors.length > 0) {
                    html += `<div class="error-section">
                        <h4>Parse Errors</h4>
                        <ul class="error-list">${result.parseErrors.map(e => `<li>${e}</li>`).join('')}</ul>
                    </div>`;
                }
                if (result.transformErrors.length > 0) {
                    html += `<div class="error-section">
                        <h4>Transform Errors</h4>
                        <ul class="error-list">${result.transformErrors.map(e => `<li>${e}</li>`).join('')}</ul>
                    </div>`;
                }
                if (result.completenessIssues.length > 0) {
                    html += `<div class="error-section">
                        <h4>Completeness Issues</h4>
                        <ul class="error-list">${result.completenessIssues.map(e => `<li>${e}</li>`).join('')}</ul>
                    </div>`;
                }
                if (result.losslessnessIssues.length > 0) {
                    html += `<div class="error-section">
                        <h4>Losslessness Issues</h4>
                        <ul class="error-list">${result.losslessnessIssues.map(e => `<li>${e}</li>`).join('')}</ul>
                    </div>`;
                }
                if (result.graphvizParseErrors.length > 0) {
                    html += `<div class="error-section">
                        <h4>Graphviz Parse Errors</h4>
                        <ul class="error-list">${result.graphvizParseErrors.map(e => `<li>${e}</li>`).join('')}</ul>
                    </div>`;
                }
            }

            html += `
                </div>
            </div>`;
        });

        html += `
        </div>
    </div>
</body>
</html>`;

        return html;
    }

    writeReport(): void {
        const report = this.generateReport();
        const htmlReport = this.generateHtmlReport();

        fs.writeFileSync(path.join(this.outputDir, 'REPORT.md'), report);
        fs.writeFileSync(path.join(this.outputDir, 'index.html'), htmlReport);

        console.log(`\n📊 Generative test report written to: ${path.join(this.outputDir, 'REPORT.md')}`);
        console.log(`🌐 HTML report available at: ${path.join(this.outputDir, 'index.html')}`);
        console.log(`📁 Individual test outputs: ${this.outputDir}\n`);
    }
}

describe('Generative Integration Tests', () => {
    const reporter = new ValidationReporter();
    const examplesDir = path.join(process.cwd(), 'examples');

    const runGenerativeTest = async (testName: string, source: string) => {
        const result: ValidationResult = {
            testName,
            source,
            passed: true,
            parseErrors: [],
            transformErrors: [],
            completenessIssues: [],
            losslessnessIssues: [],
            graphvizParseErrors: []
        };

        try {
            // Parse
            const document = await parse(source);

            // Check for parse errors
            if (document.parseResult.parserErrors.length > 0) {
                result.parseErrors = document.parseResult.parserErrors.map(e => e.message);
                result.passed = false;
            }

            if (document.parseResult.lexerErrors.length > 0) {
                result.parseErrors.push(...document.parseResult.lexerErrors.map(e => e.message));
                result.passed = false;
            }

            if (!isMachine(document.parseResult.value)) {
                result.parseErrors.push('Parsed value is not a Machine');
                result.passed = false;
                reporter.addResult(result);
                return result;
            }

            const machine = document.parseResult.value as Machine;

            // Transform to JSON
            try {
                const jsonResult = generateJSON(machine, 'test.mach', undefined);
                result.jsonOutput = JSON.parse(jsonResult.content);

                // Validate completeness: all nodes should be in JSON
                const sourceNodeNames = extractNodeNamesFromSource(source);
                const jsonNodeNames = result.jsonOutput.nodes.map((n: any) => n.name);

                for (const nodeName of sourceNodeNames) {
                    if (!jsonNodeNames.includes(nodeName)) {
                        result.completenessIssues.push(`Node "${nodeName}" from source not found in JSON output`);
                        result.passed = false;
                    }
                }

                // Check edge preservation
                const sourceEdgeCount = (source.match(/->/g) || []).length +
                                      (source.match(/-->/g) || []).length +
                                      (source.match(/=>/g) || []).length +
                                      (source.match(/<-->/g) || []).length;

                if (sourceEdgeCount > 0 && result.jsonOutput.edges.length === 0) {
                    result.completenessIssues.push(`Source has ${sourceEdgeCount} edges, but JSON has none`);
                    result.passed = false;
                }

            } catch (e) {
                result.transformErrors.push(`JSON generation failed: ${e}`);
                result.passed = false;
            }

            // Transform to Graphviz
            try {
                const graphvizResult = generateGraphviz(machine, 'test.mach', undefined);
                result.graphvizOutput = graphvizResult.content;

                // Validate Graphviz contains key elements
                if (!result.graphvizOutput.includes('digraph')) {
                    result.losslessnessIssues.push('Graphviz output missing digraph declaration');
                    result.passed = false;
                }

                if (!result.graphvizOutput.includes(machine.title)) {
                    result.losslessnessIssues.push(`Graphviz output missing machine title: "${machine.title}"`);
                    result.passed = false;
                }

                // Check that nodes appear in Graphviz
                const sourceNodeNames = extractNodeNamesFromSource(source);
                for (const nodeName of sourceNodeNames) {
                    if (!result.graphvizOutput.includes(nodeName)) {
                        result.losslessnessIssues.push(`Node "${nodeName}" not found in Graphviz output`);
                        result.passed = false;
                    }
                }

                // Basic DOT syntax validation
                // Check for balanced braces
                const openBraces = (result.graphvizOutput.match(/\{/g) || []).length;
                const closeBraces = (result.graphvizOutput.match(/\}/g) || []).length;
                if (openBraces !== closeBraces) {
                    result.graphvizParseErrors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
                    result.passed = false;
                }

            } catch (e) {
                result.transformErrors.push(`Graphviz generation failed: ${e}`);
                result.passed = false;
            }

        } catch (e) {
            result.transformErrors.push(`Unexpected error: ${e}`);
            result.passed = false;
        }

        reporter.addResult(result);
        return result;
    };

    // Helper to extract node names from source
    const extractNodeNamesFromSource = (source: string): string[] => {
        const names: string[] = [];
        const excludedKeywords = ['machine', 'note', 'workflow'];

        // Match simple node declarations: nodeName;
        const simpleMatches = source.matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*;/gm);
        for (const match of simpleMatches) {
            if (!excludedKeywords.includes(match[1])) {
                names.push(match[1]);
            }
        }

        // Match typed nodes: type nodeName;
        const typedMatches = source.matchAll(/^\s*(?:task|state|init|context|workflow)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm);
        for (const match of typedMatches) {
            names.push(match[1]);
        }

        // Match nodes with attributes: nodeName { ... }
        const attrMatches = source.matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/gm);
        for (const match of attrMatches) {
            if (!excludedKeywords.includes(match[1])) {
                names.push(match[1]);
            }
        }

        return [...new Set(names)]; // Remove duplicates
    };

    // Helper to load example file
    const loadExample = (category: string, filename: string): string => {
        const filePath = path.join(examplesDir, category, filename);
        return fs.readFileSync(filePath, 'utf-8');
    };

    // Basic Examples
    test('Basic: Minimal Machine', async () => {
        const source = loadExample('basic', 'minimal.dygram');
        const result = await runGenerativeTest('Minimal Machine', source);
        expect(result.passed).toBe(true);
    });

    test('Basic: Empty and Minimal', async () => {
        const source = loadExample('basic', 'empty-and-minimal.dygram');
        const result = await runGenerativeTest('Empty and Minimal', source);
        expect(result.passed).toBe(true);
    });

    test('Basic: Simple Nodes (3)', async () => {
        const source = loadExample('basic', 'simple-nodes-3.dygram');
        const result = await runGenerativeTest('Simple Nodes (3)', source);
        expect(result.passed).toBe(true);
    });

    test('Basic: Typed Nodes', async () => {
        const source = loadExample('basic', 'typed-nodes.dygram');
        const result = await runGenerativeTest('Typed Nodes', source);
        expect(result.passed).toBe(true);
    });

    test('Basic: All Node Types', async () => {
        const source = loadExample('basic', 'all-node-types.dygram');
        const result = await runGenerativeTest('All Node Types', source);
        expect(result.passed).toBe(true);
    });

    // Attribute Examples
    test('Attributes: Basic Attributes', async () => {
        const source = loadExample('attributes', 'basic-attributes.dygram');
        const result = await runGenerativeTest('Basic Attributes', source);
        expect(result.passed).toBe(true);
    });

    test('Attributes: Deep Attributes', async () => {
        const source = loadExample('attributes', 'deep-attributes.dygram');
        const result = await runGenerativeTest('Deep Attributes', source);
        expect(result.passed).toBe(true);
    });

    // Edge Examples
    test('Edges: Basic Edges', async () => {
        const source = loadExample('edges', 'basic-edges.dygram');
        const result = await runGenerativeTest('Basic Edges', source);
        expect(result.passed).toBe(true);
    });

    test('Edges: Labeled Edges', async () => {
        const source = loadExample('edges', 'labeled-edges.dygram');
        const result = await runGenerativeTest('Labeled Edges', source);
        expect(result.passed).toBe(true);
    });

    test('Edges: Mixed Arrow Types', async () => {
        const source = loadExample('edges', 'mixed-arrow-types.dygram');
        const result = await runGenerativeTest('Mixed Arrow Types', source);
        expect(result.passed).toBe(true);
    });

    test('Edges: Quoted Labels', async () => {
        const source = loadExample('edges', 'quoted-labels.dygram');
        const result = await runGenerativeTest('Quoted Labels', source);
        expect(result.passed).toBe(true);
    });

    // Nesting Examples
    test('Nesting: Nested (2 levels)', async () => {
        const source = loadExample('nesting', 'nested-2-levels.dygram');
        const result = await runGenerativeTest('Nested (2 levels)', source);
        expect(result.passed).toBe(true);
    });

    test('Nesting: Nested (3 levels)', async () => {
        const source = loadExample('nesting', 'nested-3-levels.dygram');
        const result = await runGenerativeTest('Nested (3 levels)', source);
        expect(result.passed).toBe(true);
    });

    test('Nesting: Complex Nesting', async () => {
        const source = loadExample('nesting', 'complex-nesting.dygram');
        const result = await runGenerativeTest('Complex Nesting', source);
        expect(result.passed).toBe(true);
    });

    test('Nesting: Deep Nested (5 levels)', async () => {
        const source = loadExample('nesting', 'deep-nested-5-levels.dygram');
        const result = await runGenerativeTest('Deep Nested (5 levels)', source);
        expect(result.passed).toBe(true);
    });

    test('Nesting: Semantic Nesting Example', async () => {
        const source = loadExample('nesting', 'semantic-nesting-example.dygram');
        const result = await runGenerativeTest('Semantic Nesting Example', source);
        expect(result.passed).toBe(true);
    });

    // Complex Examples
    test('Complex: Complex Machine', async () => {
        const source = loadExample('complex', 'complex-machine.dygram');
        const result = await runGenerativeTest('Complex Machine', source);
        expect(result.passed).toBe(true);
    });

    test('Complex: Unicode Machine', async () => {
        const source = loadExample('complex', 'unicode-machine.dygram');
        const result = await runGenerativeTest('Unicode Machine', source);
        expect(result.passed).toBe(true);
    });

    test('Complex: Context Heavy', async () => {
        const source = loadExample('complex', 'context-heavy.dygram');
        const result = await runGenerativeTest('Context Heavy', source);
        expect(result.passed).toBe(true);
    });

    // Stress Test Examples
    test('Stress: Large Machine (50 nodes)', async () => {
        const source = loadExample('stress', 'large-50-nodes.dygram');
        const result = await runGenerativeTest('Large Machine (50 nodes)', source);
        expect(result.passed).toBe(true);
    });

    // Edge Case Examples
    test('Edge Cases: Special Characters', async () => {
        const source = loadExample('edge-cases', 'special-characters.dygram');
        const result = await runGenerativeTest('Special Characters', source);
        expect(result.passed).toBe(true);
    });

    test('Edge Cases: Edge Cases Collection', async () => {
        const source = loadExample('edge-cases', 'edge-cases-collection.dygram');
        const result = await runGenerativeTest('Edge Cases Collection', source);
        expect(result.passed).toBe(true);
    });

    // Workflow Examples
    test('Workflows: User Onboarding', async () => {
        const source = loadExample('workflows', 'user-onboarding.dygram');
        const result = await runGenerativeTest('User Onboarding', source);
        expect(result.passed).toBe(true);
    });

    test('Workflows: Order Processing', async () => {
        const source = loadExample('workflows', 'order-processing.dygram');
        const result = await runGenerativeTest('Order Processing', source);
        expect(result.passed).toBe(true);
    });

    test('Workflows: CI/CD Pipeline', async () => {
        const source = loadExample('workflows', 'ci-cd-pipeline.dygram');
        const result = await runGenerativeTest('CI/CD Pipeline', source);
        expect(result.passed).toBe(true);
    });

    test('Workflows: Smart Task Prioritizer (Context Management)', async () => {
        const source = loadExample('workflows', 'smart-task-prioritizer.dygram');
        const result = await runGenerativeTest('Smart Task Prioritizer (Context Management)', source);
        expect(result.passed).toBe(true);
    });

    test('Workflows: Code Generation Demo (Advanced Context Management)', async () => {
        const source = loadExample('workflows', 'code-generation-demo.dygram');
        const result = await runGenerativeTest('Code Generation Demo (Advanced Context Management)', source);
        expect(result.passed).toBe(true);
    });

    // Write report after all tests
    test('Generate Report', () => {
        reporter.writeReport();
        expect(true).toBe(true);
    });
});
