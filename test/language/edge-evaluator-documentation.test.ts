import { describe, it, expect, beforeAll } from 'vitest';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { EdgeEvaluator } from '../../src/language/diagram/edge-evaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

/**
 * Documentation-Driven Tests for Edge Evaluation
 *
 * These tests validate that examples extracted from documentation:
 * 1. Exist and are properly extracted
 * 2. Contain valid DyGram syntax (basic validation)
 * 3. Include conditional edges with proper syntax
 * 4. Match expected naming patterns
 */
describe('Edge Evaluator - Documentation Examples', () => {
    let exampleFiles: Array<{ path: string; relativePath: string; content: string }> = [];
    const evaluator = new EdgeEvaluator();

    beforeAll(async () => {
        // Scan for all extracted example files
        const examplesDir = join(projectRoot, 'examples');

        async function scanExamples(dir: string, basePath = ''): Promise<Array<{ path: string; relativePath: string; content: string }>> {
            const files: Array<{ path: string; relativePath: string; content: string }> = [];

            try {
                const entries = await readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    const relPath = join(basePath, entry.name);

                    if (entry.isDirectory()) {
                        files.push(...await scanExamples(fullPath, relPath));
                    } else if (entry.name.endsWith('.dygram') || entry.name.endsWith('.mach')) {
                        const content = await readFile(fullPath, 'utf-8');
                        files.push({
                            path: fullPath,
                            relativePath: relPath,
                            content
                        });
                    }
                }
            } catch (error) {
                // Directory might not exist yet (before extraction)
                console.warn(`Could not scan examples directory: ${dir}`);
            }

            return files;
        }

        exampleFiles = await scanExamples(examplesDir);

        if (exampleFiles.length === 0) {
            console.warn('No example files found. Run `npm run prebuild` to extract examples from documentation.');
        }
    });

    describe('Example File Extraction', () => {
        it('should find extracted example files', () => {
            expect(exampleFiles.length).toBeGreaterThan(0);
        });

        it('should have valid syntax for edge condition examples', () => {
            // Focus on the edge condition examples we added
            const edgeConditionExamples = exampleFiles.filter(f =>
                f.relativePath.includes('edge-conditional') ||
                f.relativePath.includes('edge-condition-context')
            );

            expect(edgeConditionExamples.length).toBeGreaterThan(0);

            const errors: Array<{ file: string; error: string }> = [];

            for (const example of edgeConditionExamples) {
                // Skip provenance comment line
                const lines = example.content.split('\n').filter(line => !line.startsWith('// do not edit'));
                const content = lines.join('\n');

                // These examples should have machine definitions
                if (!content.includes('machine')) {
                    errors.push({
                        file: example.relativePath,
                        error: 'Missing machine definition'
                    });
                }

                // These examples should have conditional edges
                if (!content.includes('-when:') && !content.includes('-unless:') && !content.includes('-if:')) {
                    errors.push({
                        file: example.relativePath,
                        error: 'Missing conditional edge syntax'
                    });
                }

                // Check for valid edge syntax
                if (content.includes('->') || content.includes('-->') || content.includes('=>')) {
                    const hasValidEdge = /[A-Za-z0-9_"'`]+\s*(-[^>]*)?-+>/.test(content);
                    if (!hasValidEdge) {
                        errors.push({
                            file: example.relativePath,
                            error: 'Invalid edge syntax'
                        });
                    }
                }
            }

            if (errors.length > 0) {
                console.error('Syntax errors found in edge condition examples:');
                errors.forEach(e => console.error(`  ${e.file}: ${e.error}`));
            }

            expect(errors).toEqual([]);
        });
    });

    describe('Conditional Edge Validation', () => {
        it('should have examples with conditional edges', () => {
            // Focus on files that contain edge conditions
            const conditionalExamples = exampleFiles.filter(f =>
                f.content.includes('-when:') ||
                f.content.includes('-unless:') ||
                f.content.includes('-if:')
            );

            expect(conditionalExamples.length).toBeGreaterThan(0);
            console.log(`Found ${conditionalExamples.length} examples with conditional edges`);
        });

        it('should have valid conditional edge syntax', () => {
            const conditionalExamples = exampleFiles.filter(f =>
                f.content.includes('-when:') ||
                f.content.includes('-unless:') ||
                f.content.includes('-if:')
            );

            const errors: Array<{ file: string; line: string }> = [];

            for (const example of conditionalExamples) {
                const lines = example.content.split('\n');
                for (const line of lines) {
                    if (line.includes('-when:') || line.includes('-unless:') || line.includes('-if:')) {
                        // Check for valid edge syntax: should have -> or --> or =>
                        if (!line.includes('->') && !line.includes('-->') && !line.includes('=>')) {
                            errors.push({
                                file: example.relativePath,
                                line: line.trim()
                            });
                        }
                    }
                }
            }

            if (errors.length > 0) {
                console.error('Invalid conditional edge syntax found:');
                errors.forEach(e => console.error(`  ${e.file}: ${e.line}`));
            }

            expect(errors).toEqual([]);
        });
    });

    describe('Specific Example Validations', () => {
        it('should have conditional edge examples from documentation', () => {
            const expectedExamples = [
                'edge-conditional',
                'edge-condition-context'
            ];

            const foundExamples = expectedExamples.filter(name =>
                exampleFiles.some(f => f.relativePath.includes(name))
            );

            console.log(`Found ${foundExamples.length}/${expectedExamples.length} expected examples`);
            expect(foundExamples.length).toBeGreaterThan(0);
        });

        it('should have machine attributes in conditional examples', () => {
            const example = exampleFiles.find(f => f.relativePath.includes('edge-condition-context'));

            if (!example) {
                console.warn('Skipping: edge-condition-context example not found');
                return;
            }

            // Should have machine block with attributes
            expect(example.content).toContain('machine');
            expect(example.content).toContain('maxRetries');
            expect(example.content).toContain('errorCount');
        });

        it('should have when: conditions in conditional examples', () => {
            const example = exampleFiles.find(f => f.relativePath.includes('edge-conditional'));

            if (!example) {
                console.warn('Skipping: edge-conditional example not found');
                return;
            }

            // Should have conditional edges
            expect(example.content).toMatch(/-when:/);
            expect(example.content).toMatch(/-unless:/);
        });
    });

    describe('Example Coverage', () => {
        it('should have examples with unconditional edges', () => {
            const unconditionalExamples = exampleFiles.filter(f =>
                !f.content.includes('-when:') &&
                !f.content.includes('-unless:') &&
                !f.content.includes('-if:') &&
                (f.content.includes('->') || f.content.includes('-->') || f.content.includes('=>'))
            );

            expect(unconditionalExamples.length).toBeGreaterThan(0);
            console.log(`Found ${unconditionalExamples.length} examples with unconditional edges`);
        });

        it('should have examples with machine attributes', () => {
            const examplesWithAttributes = exampleFiles.filter(f =>
                f.content.match(/machine\s+[^{]*\{[^}]*:/s)
            );

            expect(examplesWithAttributes.length).toBeGreaterThan(0);
            console.log(`Found ${examplesWithAttributes.length} examples with machine attributes`);
        });
    });

    describe('Documentation Consistency', () => {
        it('should have examples for core edge condition features', () => {
            const requiredExamples = [
                'edge-conditional',
                'edge-condition-context'
            ];

            const foundExamples = requiredExamples.filter(name =>
                exampleFiles.some(f => f.relativePath.includes(name))
            );

            const missingExamples = requiredExamples.filter(name =>
                !exampleFiles.some(f => f.relativePath.includes(name))
            );

            if (missingExamples.length > 0) {
                console.warn('Missing examples:', missingExamples);
                console.warn('Note: Examples from archived docs are not extracted');
            }

            console.log(`Found ${foundExamples.length}/${requiredExamples.length} required examples`);

            // At least some examples should be found
            expect(foundExamples.length).toBeGreaterThan(0);
        });

        it('should have sufficient examples for testing', () => {
            // Should have a good coverage of examples
            expect(exampleFiles.length).toBeGreaterThan(50);

            console.log(`Total examples extracted: ${exampleFiles.length}`);

            const syntaxExamples = exampleFiles.filter(f => f.relativePath.includes('syntax'));
            console.log(`Syntax examples: ${syntaxExamples.length}`);

            const conditionalExamples = exampleFiles.filter(f =>
                f.content.includes('-when:') || f.content.includes('-unless:') || f.content.includes('-if:')
            );
            console.log(`Conditional edge examples: ${conditionalExamples.length}`);
        });
    });
});
