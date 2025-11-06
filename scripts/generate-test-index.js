#!/usr/bin/env node
/**
 * Generate an index.html for test reports
 * This creates a landing page to navigate all test reports and artifacts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const outputDir = path.join(rootDir, 'test-output');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Check which reports exist
const playwrightReportExists = fs.existsSync(path.join(outputDir, 'reports', 'playwright', 'index.html'));
const coverageReportExists = fs.existsSync(path.join(outputDir, 'coverage', 'index.html'));
const e2eArtifactsExist = fs.existsSync(path.join(outputDir, 'e2e-artifacts'));
const vitestReportExists = fs.existsSync(path.join(outputDir, 'vitest', 'junit.xml'));
const vitestHtmlReportExists = fs.existsSync(path.join(outputDir, 'vitest', 'index.html'));
const generativeReportExists = fs.existsSync(path.join(outputDir, 'generative', 'index.html'));
const comprehensiveGenerativeReportExists = fs.existsSync(path.join(outputDir, 'comprehensive-generative', 'index.html'));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DyGram Test Reports</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Space Mono', monospace, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #0F0F0F;
            background: #F7F7F7;
            min-height: 100vh;
            padding: 2rem;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            padding: 3rem;
        }

        h1 {
            color: #0F0F0F;
            margin-bottom: 0.5rem;
            font-size: 2.5rem;
            font-weight: 700;
        }

        .subtitle {
            color: #303030;
            margin-bottom: 3rem;
            font-size: 1.1rem;
        }

        .report-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }

        .report-card {
            border: 2px solid #0F0F0F;
            border-left: 8px solid #FF5E5B;
            border-radius: 4px;
            padding: 1.5rem;
            transition: all 0.2s;
            background: #F7F7F7;
        }

        .report-card:hover {
            background: #303030;
            color: white;
            transform: translateY(-2px);
        }

        .report-card:hover h2,
        .report-card:hover p,
        .report-card:hover .icon {
            color: white;
        }

        .report-card:hover a {
            color: #FF5E5B;
        }

        .report-card:hover a.unavailable {
            color: #999;
        }

        .report-card:hover .status {
            background: #FF5E5B;
            color: white;
        }

        .report-card h2 {
            color: #0F0F0F;
            margin-bottom: 1rem;
            font-size: 1.5rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .report-card p {
            color: #303030;
            margin-bottom: 1rem;
        }

        .report-card ul {
            list-style: none;
            margin-bottom: 1rem;
        }

        .report-card li {
            margin-bottom: 0.5rem;
        }

        .report-card a {
            color: #FF5E5B;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.2s;
        }

        .report-card a:hover {
            text-decoration: underline;
        }

        .report-card a.unavailable {
            color: #999;
            cursor: not-allowed;
            text-decoration: line-through;
        }

        .icon {
            font-size: 1.5rem;
        }

        .info-section {
            background: #F7F7F7;
            border-left: 8px solid #FF5E5B;
            padding: 1.5rem;
            border-radius: 4px;
            margin-bottom: 2rem;
        }

        .info-section h3 {
            color: #0F0F0F;
            margin-bottom: 0.5rem;
            font-weight: 600;
        }

        .info-section p {
            color: #303030;
            margin-bottom: 0.5rem;
        }

        .info-section code {
            background: #1A1A1A;
            color: #F7F7F7;
            padding: 0.25rem 0.5rem;
            border-radius: 3px;
            font-family: 'Courier New', 'Fira Code', monospace;
            font-size: 0.9rem;
        }

        footer {
            text-align: center;
            color: #303030;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 2px solid #0F0F0F;
        }

        footer a {
            color: #FF5E5B;
            text-decoration: none;
            font-weight: 600;
        }

        footer a:hover {
            text-decoration: underline;
        }

        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background: #0F0F0F;
            color: white;
            border-radius: 4px;
            font-size: 0.875rem;
            font-weight: 600;
            margin-left: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-left: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status.available {
            background: #4caf50;
            color: white;
        }

        .status.unavailable {
            background: #FF5E5B;
            color: white;
        }

        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
            body {
                padding: 1rem;
            }

            .container {
                padding: 1.5rem;
            }

            h1 {
                font-size: 2rem;
            }

            .subtitle {
                font-size: 1rem;
            }

            .report-grid {
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }

            .report-card {
                padding: 1rem;
            }

            .report-card h2 {
                font-size: 1.25rem;
            }

            .info-section {
                padding: 1rem;
            }
        }

        @media (max-width: 480px) {
            h1 {
                font-size: 1.75rem;
            }

            .subtitle {
                font-size: 0.9rem;
            }

            .report-card h2 {
                font-size: 1.1rem;
                flex-direction: column;
                align-items: flex-start;
            }

            .badge {
                margin-left: 0;
                margin-top: 0.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 DyGram Test Reports</h1>
        <p class="subtitle">Comprehensive test reports and artifacts for the DyGram language</p>

        <div class="info-section">
            <h3>About These Reports</h3>
            <p>
                This page provides access to all test reports and artifacts generated during the DyGram test suite execution.
                These reports include unit tests, integration tests, E2E browser tests, and code coverage analysis.
            </p>
        </div>

        <div class="report-grid">
            <div class="report-card">
                <h2><span class="icon">🎭</span> E2E Playground Tests <span class="badge">Playwright</span></h2>
                <p>End-to-end browser tests validating the DyGram playground interface with video and screenshot capture.</p>
                <ul>
                    <li>🌐 ${playwrightReportExists ? '<a href="reports/playwright/index.html">Playwright HTML Report</a>' : '<span class="unavailable">Playwright HTML Report</span>'} ${playwrightReportExists ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                    <li>📂 ${e2eArtifactsExist ? '<a href="e2e-artifacts/">Test Videos & Screenshots</a>' : '<span class="unavailable">Test Videos & Screenshots</span>'} ${e2eArtifactsExist ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                </ul>
            </div>

            <div class="report-card">
                <h2><span class="icon">📊</span> Code Coverage <span class="badge">Vitest</span></h2>
                <p>Code coverage analysis for unit and integration tests showing tested and untested code paths.</p>
                <ul>
                    <li>🌐 ${coverageReportExists ? '<a href="coverage/index.html">Coverage HTML Report</a>' : '<span class="unavailable">Coverage HTML Report</span>'} ${coverageReportExists ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                    <li>📄 ${coverageReportExists ? '<a href="coverage/coverage-summary.json">Coverage JSON Summary</a>' : '<span class="unavailable">Coverage JSON Summary</span>'} ${coverageReportExists ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                </ul>
            </div>

            <div class="report-card">
                <h2><span class="icon">✅</span> Unit Test Results <span class="badge">Vitest</span></h2>
                <p>Unit and integration test results in HTML and JUnit XML format for CI/CD integration.</p>
                <ul>
                    <li>🌐 ${vitestHtmlReportExists ? '<a href="vitest/index.html">HTML Test Report</a>' : '<span class="unavailable">HTML Test Report</span>'} ${vitestHtmlReportExists ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                    <li>📄 ${vitestReportExists ? '<a href="vitest/junit.xml">JUnit XML Report</a>' : '<span class="unavailable">JUnit XML Report</span>'} ${vitestReportExists ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                </ul>
            </div>

            <div class="report-card">
                <h2><span class="icon">🔄</span> Generative Tests <span class="badge">Vitest</span></h2>
                <p>Transformation pipeline validation tests ensuring DyGram source code correctly transforms to AST, JSON, and Graphviz formats.</p>
                <ul>
                    <li>🌐 ${generativeReportExists ? '<a href="generative/index.html">Generative Test Report (27 tests)</a>' : '<span class="unavailable">Generative Test Report</span>'} ${generativeReportExists ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                    <li>🌐 ${comprehensiveGenerativeReportExists ? '<a href="comprehensive-generative/index.html">Comprehensive Report (97 tests)</a>' : '<span class="unavailable">Comprehensive Report</span>'} ${comprehensiveGenerativeReportExists ? '<span class="status available">✓</span>' : '<span class="status unavailable">Not Generated</span>'}</li>
                </ul>
            </div>
        </div>

        <div class="info-section">
            <h3>Test Suite Overview</h3>
            <p><strong>Unit & Integration Tests (Vitest):</strong> Validate core functionality including the DyGram language parser, AST generation, transformation pipeline, and runtime visualization.</p>
            <p><strong>Generative Tests (Vitest):</strong> Comprehensive validation of the DyGram transformation pipeline, testing parsing, AST generation, JSON serialization, and Graphviz diagram generation across all documentation examples.</p>
            <p><strong>E2E Tests (Playwright):</strong> Test the playground interface in a real browser environment, including Monaco editor integration, theme switching, examples loading, and responsive behavior.</p>
            <p><strong>Coverage Reports:</strong> Analyze code coverage to identify tested and untested code paths, helping maintain high test quality.</p>
        </div>

        <div class="info-section">
            <h3>Running Tests Locally</h3>
            <p><code>npm test</code> - Run unit and integration tests</p>
            <p><code>npm run test:coverage</code> - Run tests with coverage reporting</p>
            <p><code>npm run test:e2e</code> - Run Playwright E2E tests</p>
            <p><code>npm run test:reports</code> - Generate all reports including this index page</p>
        </div>

        <footer>
            <p>Generated by DyGram Test Suite | <a href="https://github.com/christopherdebeer/machine" target="_blank">GitHub Repository</a></p>
        </footer>
    </div>
</body>
</html>
`;

// Write the index.html file
const indexPath = path.join(outputDir, 'index.html');
fs.writeFileSync(indexPath, html);

console.log(`✅ Generated test reports index at: ${indexPath}`);
