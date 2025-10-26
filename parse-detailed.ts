import { createMachineServices } from './src/language/machine-module.js';
import { generateJSON, generateGraphviz } from './src/language/generator/generator.js';
import { NodeFileSystem } from 'langium/node';
import { extractAstNode } from './src/cli/cli-util.js';
import * as fs from 'node:fs/promises';
import type { Machine } from './src/language/generated/ast.js';

async function main() {
    const services = createMachineServices(NodeFileSystem).Machine;
    const fileName = 'test-meta.dygram';

    console.log('Parsing file:', fileName);

    try {
        const model = await extractAstNode<Machine>(fileName, services);

        console.log('\n=== AST Structure ===');
        console.log('Machine name:', model.name);
        console.log('Nodes count:', model.nodes.length);
        console.log('Edges count:', model.edges?.length || 0);

        console.log('\n=== All Diagnostics ===');
        const allDiagnostics = model.$document?.diagnostics || [];
        console.log('Total diagnostics:', allDiagnostics.length);

        allDiagnostics.forEach((diag, i) => {
            const severityStr = diag.severity === 1 ? 'ERROR' : diag.severity === 2 ? 'WARNING' : 'INFO';
            console.log(`\n${i + 1}. [${severityStr}] ${diag.message}`);
            console.log(`   Line ${diag.range.start.line + 1}:${diag.range.start.character} to ${diag.range.end.line + 1}:${diag.range.end.character}`);
            if (diag.data) {
                console.log(`   Data:`, diag.data);
            }
            if (diag.code) {
                console.log(`   Code:`, diag.code);
            }
        });

        // Look at specific attributes with array types
        console.log('\n=== Investigating Array Type Attributes ===');
        model.nodes.forEach(node => {
            if (node.attributes) {
                node.attributes.forEach(attr => {
                    if (attr.typeDef && attr.typeDef.$cstNode) {
                        const typeText = attr.typeDef.$cstNode.text;
                        if (typeText.includes('Array')) {
                            console.log(`\nNode: ${node.name}, Attribute: ${attr.name}`);
                            console.log(`  Type: ${typeText}`);
                            console.log(`  Value CST text:`, attr.value?.$cstNode?.text || 'N/A');
                            console.log(`  Value object:`, JSON.stringify(attr.value, null, 2).substring(0, 200));
                        }
                    }
                });
            }
        });

        console.log('\n=== Generating JSON (with errors) ===');
        try {
            const jsonResult = generateJSON(model, fileName, 'test-output');
            if (jsonResult.success && jsonResult.content) {
                await fs.mkdir('test-output', { recursive: true });
                await fs.writeFile(jsonResult.fileName, jsonResult.content, 'utf-8');
                console.log('✓ JSON generated despite errors:', jsonResult.fileName);
            } else {
                console.log('✗ JSON generation failed');
            }
        } catch (e: any) {
            console.log('✗ JSON generation threw error:', e.message);
        }

        console.log('\n=== Generating DOT (with errors) ===');
        try {
            const dotResult = generateGraphviz(model, fileName, 'test-output');
            if (dotResult.success && dotResult.content) {
                await fs.mkdir('test-output', { recursive: true });
                await fs.writeFile(dotResult.fileName, dotResult.content, 'utf-8');
                console.log('✓ DOT generated despite errors:', dotResult.fileName);

                // Show first 500 chars of DOT file
                console.log('\nFirst 500 chars of DOT file:');
                console.log(dotResult.content.substring(0, 500));
            } else {
                console.log('✗ DOT generation failed');
            }
        } catch (e: any) {
            console.log('✗ DOT generation threw error:', e.message);
        }

    } catch (error: any) {
        console.error('Fatal error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}

main();
