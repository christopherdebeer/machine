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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 3rem;
        }

        h1 {
            color: #667eea;
            margin-bottom: 0.5rem;
            font-size: 2.5rem;
        }

        .subtitle {
            color: #666;
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
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 1.5rem;
            transition: all 0.3s ease;
            background: #fafafa;
        }

        .report-card:hover {
            border-color: #667eea;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
            transform: translateY(-2px);
        }

        .report-card h2 {
            color: #333;
            margin-bottom: 1rem;
            font-size: 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .report-card p {
            color: #666;
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
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.3s ease;
        }

        .report-card a:hover {
            color: #764ba2;
            text-decoration: underline;
        }

        .icon {
            font-size: 1.5rem;
        }

        .info-section {
            background: #f0f4ff;
            border-left: 4px solid #667eea;
            padding: 1.5rem;
            border-radius: 4px;
            margin-bottom: 2rem;
        }

        .info-section h3 {
            color: #667eea;
            margin-bottom: 0.5rem;
        }

        .info-section p {
            color: #555;
        }

        footer {
            text-align: center;
            color: #999;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid #e0e0e0;
        }

        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background: #667eea;
            color: white;
            border-radius: 12px;
            font-size: 0.875rem;
            font-weight: 600;
            margin-left: 0.5rem;
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
                These reports validate the complete transformation pipeline from DyGram source code through to Mermaid diagrams.
            </p>
        </div>

        <div class="report-grid">
            <div class="report-card">
                <h2><span class="icon">📊</span> Generative Tests <span class="badge">Integration</span></h2>
                <p>Complete DyGram transformation pipeline validation with visual artifacts.</p>
                <ul>
                    <li>🌐 <a href="generative/index.html">Interactive HTML Report</a></li>
                    <li>📝 <a href="generative/REPORT.md">Markdown Summary</a></li>
                    <li>📁 <a href="generative/">Individual Test Artifacts</a></li>
                </ul>
            </div>

            <div class="report-card">
                <h2><span class="icon">🎭</span> E2E Rendering Tests <span class="badge">Playwright</span></h2>
                <p>End-to-end browser rendering tests with visual validation.</p>
                <ul>
                    <li>🌐 <a href="e2e-render/index.html">Custom HTML Report</a></li>
                    <li>📄 <a href="playwright-report/index.html">Playwright Native Report</a></li>
                    <li>📝 <a href="e2e-render/RENDER-REPORT.md">Markdown Summary</a></li>
                </ul>
            </div>

            <div class="report-card">
                <h2><span class="icon">📁</span> Test Artifacts</h2>
                <p>Raw test outputs, Mermaid diagrams, and JSON transformations.</p>
                <ul>
                    <li>📂 <a href="generative/">Generative Test Outputs</a></li>
                    <li>📂 <a href="e2e-render/">E2E Render Artifacts</a></li>
                </ul>
            </div>
        </div>

        <div class="info-section">
            <h3>Test Suite Overview</h3>
            <p><strong>Generative Tests:</strong> Validate the complete DyGram → AST → JSON → Mermaid transformation pipeline for all example files.</p>
            <p><strong>E2E Tests:</strong> Render generated Mermaid diagrams in a real browser environment to ensure they are syntactically valid and render correctly.</p>
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
