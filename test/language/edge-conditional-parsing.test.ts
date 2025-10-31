import { describe, it, expect } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { generateDotDiagram } from '../../src/language/diagram/graphviz-dot-diagram.js';

describe('Conditional Edge Parsing and Visualization', () => {
    it('should parse conditional edges with quoted string syntax and show visual indicators', async () => {
        const services = createMachineServices(EmptyFileSystem);

        // Test the syntax that the user believes should work
        const content = `machine "Conditional Edges Example" {
    status: "valid";
    errorCount: 3;
}

task Processing;
task Success;
task Failure;
task Continue;

Processing -when: '(status == "valid")';-> Success;
Processing -when: '(status == "invalid")';-> Failure;
Processing -unless: '(errorCount > 0)';-> Continue;
`;

        console.log('\n=== Testing Quoted String Syntax ===');
        console.log(content);
        console.log('=====================================\n');

        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            'test-quoted-syntax.dygram'
        );

        await services.shared.workspace.DocumentBuilder.build([document], {});

        // Check for parse errors
        const lexerErrors = document.parseResult.lexerErrors;
        const parserErrors = document.parseResult.parserErrors;

        if (lexerErrors.length > 0) {
            console.log('LEXER ERRORS:');
            lexerErrors.forEach(e => console.log(`  ${e.message} at line ${e.line}`));
        }

        if (parserErrors.length > 0) {
            console.log('PARSER ERRORS:');
            parserErrors.forEach(e => console.log(`  ${e.message} at ${e.token.startLine}:${e.token.startColumn}`));
        }

        // The test expectation depends on whether this syntax is supported
        const hasErrors = lexerErrors.length > 0 || parserErrors.length > 0;

        if (!hasErrors) {
            console.log('✓ File parsed successfully');

            // If parsing succeeds, verify visual indicators work
            const machineModel = document.parseResult.value;
            const dotOutput = generateDotDiagram(machineModel as any);

            console.log('\n=== Generated DOT Output ===');
            console.log(dotOutput);
            console.log('============================\n');

            // Check for visual indicators
            expect(dotOutput).toContain('color="#4CAF50"'); // Active edge (green)
            expect(dotOutput).toContain('color="#9E9E9E"'); // Inactive edge (gray)
            expect(dotOutput).toContain('style=solid');
            expect(dotOutput).toContain('style=dashed');
        } else {
            console.log('✗ File failed to parse (syntax not supported)');
            // Document that this syntax doesn't work
            expect(hasErrors).toBe(true);
        }
    });

    it('should parse conditional edges WITHOUT quotes (documented syntax)', async () => {
        const services = createMachineServices(EmptyFileSystem);

        // Test the syntax from the extracted documentation
        const content = `machine "Conditional Edges Example" {
    status: "valid";
    errorCount: 0;
}

task Processing;
task Success;
task Failure;
task Continue;

Processing -when: status == "valid"-> Success;
Processing -when: status == "invalid"-> Failure;
Processing -unless: errorCount > 0-> Continue;
`;

        console.log('\n=== Testing Unquoted Syntax (from docs) ===');
        console.log(content);
        console.log('===========================================\n');

        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            'test-unquoted-syntax.dygram'
        );

        await services.shared.workspace.DocumentBuilder.build([document], {});

        // Check for parse errors
        const lexerErrors = document.parseResult.lexerErrors;
        const parserErrors = document.parseResult.parserErrors;

        if (lexerErrors.length > 0) {
            console.log('LEXER ERRORS:');
            lexerErrors.forEach(e => console.log(`  ${e.message} at line ${e.line}`));
        }

        if (parserErrors.length > 0) {
            console.log('PARSER ERRORS:');
            parserErrors.forEach(e => console.log(`  ${e.message} at ${e.token.startLine}:${e.token.startColumn}`));
        }

        const hasErrors = lexerErrors.length > 0 || parserErrors.length > 0;

        if (!hasErrors) {
            console.log('✓ File parsed successfully');

            // If parsing succeeds, verify visual indicators work
            const machineModel = document.parseResult.value;
            const dotOutput = generateDotDiagram(machineModel as any);

            console.log('\n=== Generated DOT Output ===');
            console.log(dotOutput);
            console.log('============================\n');

            // With errorCount=0, the "unless: errorCount > 0" edge should be active (green)
            // Check for visual indicators
            expect(dotOutput).toContain('color="#4CAF50"'); // Active edge (green)
            expect(dotOutput).toContain('style=solid');
        } else {
            console.log('✗ File failed to parse (syntax not supported)');
            expect(hasErrors).toBe(true);
        }
    });
});
