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

        console.log('\n=== Validation Errors ===');
        const validationErrors = model.$document?.diagnostics?.filter(d => d.severity === 1) || [];
        if (validationErrors.length > 0) {
            console.log('Found', validationErrors.length, 'validation errors:');
            validationErrors.forEach((error, i) => {
                console.log(`\n${i + 1}. ${error.message}`);
                console.log(`   Range: line ${error.range.start.line + 1}, col ${error.range.start.character} to line ${error.range.end.line + 1}, col ${error.range.end.character}`);
                if (error.data) {
                    console.log(`   Data:`, JSON.stringify(error.data, null, 2));
                }
            });
        } else {
            console.log('No validation errors found!');
        }

        console.log('\n=== Parser Errors ===');
        const parserErrors = model.$document?.parseResult?.parserErrors || [];
        if (parserErrors.length > 0) {
            console.log('Found', parserErrors.length, 'parser errors:');
            parserErrors.forEach((error, i) => {
                console.log(`\n${i + 1}. ${error.message}`);
            });
        } else {
            console.log('No parser errors found!');
        }

        console.log('\n=== Generating JSON ===');
        const jsonResult = generateJSON(model, fileName, 'test-output');
        if (jsonResult.success && jsonResult.content) {
            await fs.mkdir('test-output', { recursive: true });
            await fs.writeFile(jsonResult.fileName, jsonResult.content, 'utf-8');
            console.log('✓ JSON generated:', jsonResult.fileName);
        } else {
            console.log('✗ JSON generation failed');
        }

        console.log('\n=== Generating DOT ===');
        const dotResult = generateGraphviz(model, fileName, 'test-output');
        if (dotResult.success && dotResult.content) {
            await fs.mkdir('test-output', { recursive: true });
            await fs.writeFile(dotResult.fileName, dotResult.content, 'utf-8');
            console.log('✓ DOT generated:', dotResult.fileName);
        } else {
            console.log('✗ DOT generation failed');
        }

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}

main();
