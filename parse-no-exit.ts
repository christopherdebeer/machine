import { createMachineServices } from './src/language/machine-module.js';
import { generateJSON, generateGraphviz } from './src/language/generator/generator.js';
import { NodeFileSystem } from 'langium/node';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { URI } from 'langium';
import type { Machine } from './src/language/generated/ast.js';

async function main() {
    const services = createMachineServices(NodeFileSystem).Machine;
    const fileName = 'test-meta.dygram';

    console.log('========================================');
    console.log('Parsing file:', fileName);
    console.log('========================================\n');

    try {
        // Load document without exiting on errors
        const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
            URI.file(path.resolve(fileName))
        );
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const model = document.parseResult?.value as Machine;

        console.log('=== AST Structure ===');
        console.log('Machine name:', model.name);
        console.log('Nodes count:', model.nodes.length);
        console.log('Edges count:', model.edges?.length || 0);

        console.log('\n=== All Diagnostics ===');
        const allDiagnostics = document.diagnostics || [];
        console.log('Total diagnostics:', allDiagnostics.length);

        const errors = allDiagnostics.filter(d => d.severity === 1);
        const warnings = allDiagnostics.filter(d => d.severity === 2);

        console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}\n`);

        errors.forEach((diag, i) => {
            console.log(`ERROR ${i + 1}: ${diag.message}`);
            console.log(`   Location: line ${diag.range.start.line + 1}:${diag.range.start.character}`);
            const text = document.textDocument.getText(diag.range);
            console.log(`   Text: [${text}]`);
            if (diag.data) {
                console.log(`   Data:`, diag.data);
            }
            console.log('');
        });

        // Look at array type issues in detail
        console.log('\n=== Investigating Array Type Attributes ===');
        const investigateNode = (node: any, depth = 0) => {
            const indent = '  '.repeat(depth);
            if (node.attributes) {
                node.attributes.forEach((attr: any) => {
                    if (attr.typeDef && attr.typeDef.$cstNode) {
                        const typeText = attr.typeDef.$cstNode.text;
                        if (typeText.includes('Array')) {
                            console.log(`${indent}Node: ${node.name}, Attribute: ${attr.name}`);
                            console.log(`${indent}  Type declared: ${typeText}`);
                            if (attr.value && attr.value.$cstNode) {
                                console.log(`${indent}  Value CST: ${attr.value.$cstNode.text}`);
                            }
                            if (attr.value && attr.value.value) {
                                console.log(`${indent}  Value.value type: ${typeof attr.value.value}`);
                                console.log(`${indent}  Value.value: ${JSON.stringify(attr.value.value)}`);
                            }
                        }
                    }
                });
            }
            if (node.nodes) {
                node.nodes.forEach((child: any) => investigateNode(child, depth + 1));
            }
        };

        model.nodes.forEach(node => investigateNode(node));

        console.log('\n=== Generating JSON ===');
        try {
            const jsonResult = generateJSON(model, fileName, 'test-output');
            if (jsonResult.success && jsonResult.content) {
                await fs.mkdir('test-output', { recursive: true });
                await fs.writeFile(jsonResult.fileName, jsonResult.content, 'utf-8');
                console.log('✓ JSON generated:', jsonResult.fileName);
                console.log(`  Size: ${jsonResult.content.length} bytes`);
            } else {
                console.log('✗ JSON generation failed');
            }
        } catch (e: any) {
            console.log('✗ JSON generation threw error:', e.message);
        }

        console.log('\n=== Generating DOT ===');
        try {
            const dotResult = generateGraphviz(model, fileName, 'test-output');
            if (dotResult.success && dotResult.content) {
                await fs.mkdir('test-output', { recursive: true });
                await fs.writeFile(dotResult.fileName, dotResult.content, 'utf-8');
                console.log('✓ DOT generated:', dotResult.fileName);
                console.log(`  Size: ${dotResult.content.length} bytes`);

                // Check for namespace/group constructs
                const hasSubgraph = dotResult.content.includes('subgraph');
                const hasCluster = dotResult.content.includes('cluster_');
                console.log(`  Contains subgraphs: ${hasSubgraph}`);
                console.log(`  Contains clusters: ${hasCluster}`);

                // Show first 1000 chars
                console.log('\n  First 1000 chars of DOT file:');
                console.log('  ---');
                console.log(dotResult.content.substring(0, 1000));
                console.log('  ---');
            } else {
                console.log('✗ DOT generation failed');
            }
        } catch (e: any) {
            console.log('✗ DOT generation threw error:', e.message);
            console.log(e.stack);
        }

    } catch (error: any) {
        console.error('Fatal error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}

main();
