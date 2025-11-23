/**
 * Integration test for semantic token provider
 *
 * Verifies that all DyGram syntax elements are correctly classified
 * by the MachineSemanticTokenProvider.
 */

import { describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { SemanticTokenTypes } from 'vscode-languageserver';

const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);
const tokenProvider = services.Machine.lsp.SemanticTokenProvider;

// Langium semantic token type indices (custom mapping, NOT LSP standard!)
// Langium uses a different order than the LSP standard
// See: node_modules/langium/src/lsp/semantic-token-provider.ts AllSemanticTokenTypes
const TOKEN_TYPES = {
    class: 0,
    comment: 1,
    enum: 2,
    enumMember: 3,
    event: 4,
    function: 5,
    interface: 6,
    keyword: 7,
    macro: 8,
    method: 9,
    modifier: 10,
    namespace: 11,
    number: 12,
    operator: 13,
    parameter: 14,
    property: 15,
    regexp: 16,
    string: 17,
    struct: 18,
    type: 19,
    typeParameter: 20,
    variable: 21,
    decorator: 22,
};

// Reverse mapping for debugging
const TOKEN_TYPE_NAMES: Record<number, string> = Object.fromEntries(
    Object.entries(TOKEN_TYPES).map(([name, id]) => [id, name])
);

interface DecodedToken {
    line: number;
    char: number;
    length: number;
    tokenType: string;
    tokenTypeId: number;
    text: string;
}

/**
 * Decode LSP semantic tokens and extract text from document
 */
function decodeTokens(data: number[], code: string): DecodedToken[] {
    const lines = code.split('\n');
    const tokens: DecodedToken[] = [];

    let currentLine = 0;
    let currentChar = 0;

    for (let i = 0; i < data.length; i += 5) {
        const lineDelta = data[i];
        const charDelta = data[i + 1];
        const length = data[i + 2];
        const tokenTypeId = data[i + 3];
        const tokenModifiers = data[i + 4];

        // Calculate absolute position
        currentLine += lineDelta;
        currentChar = (lineDelta === 0) ? currentChar + charDelta : charDelta;

        // Extract text
        const lineText = lines[currentLine] || '';
        const text = lineText.substring(currentChar, currentChar + length);

        tokens.push({
            line: currentLine,
            char: currentChar,
            length,
            tokenType: TOKEN_TYPE_NAMES[tokenTypeId] || `unknown(${tokenTypeId})`,
            tokenTypeId,
            text
        });
    }

    return tokens;
}

describe('Semantic Token Provider - Comprehensive Test', () => {
    const testCode = `machine "Syntax Test" @StrictMode

import { BaseNode } from "lib.dy";

context Config {
    apiKey: #secretKey;
    timeout<number>: 5000;
}

Input request "User Request" {
    query: "Test query with {{ user.input }}";
    count<number>: 42;
}

Task process "Process Data" @Async {
    priority: 1;
    retries: 3;
}

Output result {
    status: "pending";
}

request -> process;
process => result;
request "1" --> "0..1" process;`;

    test('should parse document without errors', async () => {
        const document = await parse(testCode);

        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
    });

    test('should generate semantic tokens', async () => {
        const document = await parse(testCode);

        const params = {
            textDocument: { uri: 'test://semantic-tokens.dygram' }
        };

        const result = await tokenProvider!.semanticHighlight(document, params);

        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(result.data.length).toBeGreaterThan(0);

        console.log(`\n📊 Generated ${result.data.length / 5} semantic tokens\n`);
    });

    test('should classify all syntax elements correctly', async () => {
        const document = await parse(testCode);

        const params = {
            textDocument: { uri: 'test://semantic-tokens.dygram' }
        };

        const result = await tokenProvider!.semanticHighlight(document, params);
        const tokens = decodeTokens(result.data, testCode);

        // Log all tokens for debugging
        console.log('\n🔍 All Semantic Tokens:\n');
        tokens.forEach((token, i) => {
            console.log(
                `${String(i).padStart(3)}. Line ${String(token.line).padStart(2)}:${String(token.char).padStart(3)} ` +
                `[${token.tokenType.padEnd(15)}] "${token.text}"`
            );
        });

        // Helper to find tokens by text
        const findToken = (text: string) => tokens.find(t => t.text === text);
        const findTokens = (text: string) => tokens.filter(t => t.text === text);

        // Machine title (note: string tokens include quotes in the source)
        const machineTitle = findToken('"Syntax Test"');
        expect(machineTitle?.tokenType).toBe('string');

        // Annotations
        const strictMode = findToken('StrictMode');
        expect(strictMode?.tokenType).toBe('decorator');

        const asyncAnnotation = findToken('Async');
        expect(asyncAnnotation?.tokenType).toBe('decorator');

        // Import statement
        const importSymbol = findToken('BaseNode');
        expect(importSymbol?.tokenType).toBe('namespace');

        const importPath = findToken('"lib.dy"');
        expect(importPath?.tokenType).toBe('string');

        // Node types (Input, Task, Output, context)
        const contextType = findToken('context');
        expect(contextType?.tokenType).toBe('class');

        const inputType = findToken('Input');
        expect(inputType?.tokenType).toBe('class');

        const taskType = findToken('Task');
        expect(taskType?.tokenType).toBe('class');

        const outputType = findToken('Output');
        expect(outputType?.tokenType).toBe('class');

        // Node names
        const configName = findToken('Config');
        expect(configName?.tokenType).toBe('variable');

        const requestName = findTokens('request')[0]; // First occurrence
        expect(requestName?.tokenType).toBe('variable');

        const processName = findTokens('process')[0];
        expect(processName?.tokenType).toBe('variable');

        const resultName = findTokens('result')[0];
        expect(resultName?.tokenType).toBe('variable');

        // Node title strings
        const userRequestTitle = findToken('"User Request"');
        expect(userRequestTitle?.tokenType).toBe('string');

        const processDataTitle = findToken('"Process Data"');
        expect(processDataTitle?.tokenType).toBe('string');

        // Attribute names
        const apiKeyAttr = findToken('apiKey');
        expect(apiKeyAttr?.tokenType).toBe('property');

        const timeoutAttr = findToken('timeout');
        expect(timeoutAttr?.tokenType).toBe('property');

        const queryAttr = findToken('query');
        expect(queryAttr?.tokenType).toBe('property');

        const countAttr = findToken('count');
        expect(countAttr?.tokenType).toBe('property');

        const priorityAttr = findToken('priority');
        expect(priorityAttr?.tokenType).toBe('property');

        const retriesAttr = findToken('retries');
        expect(retriesAttr?.tokenType).toBe('property');

        const statusAttr = findToken('status');
        expect(statusAttr?.tokenType).toBe('property');

        // Type annotations
        const numberType = findTokens('number');
        numberType.forEach(token => {
            expect(token.tokenType).toBe('type');
        });

        // External IDs
        const externalId = findToken('#secretKey');
        expect(externalId?.tokenType).toBe('macro');

        // Number literals
        const num5000 = findToken('5000');
        expect(num5000?.tokenType).toBe('number');

        const num42 = findToken('42');
        expect(num42?.tokenType).toBe('number');

        const num1 = findToken('1');
        expect(num1?.tokenType).toBe('number');

        const num3 = findToken('3');
        expect(num3?.tokenType).toBe('number');

        // String values
        const queryString = findToken('"Test query with {{ user.input }}"');
        expect(queryString?.tokenType).toBe('string');

        const pendingString = findToken('"pending"');
        expect(pendingString?.tokenType).toBe('string');

        // Multiplicities (these are string tokens with quotes, classified as parameters)
        const mult1 = findToken('"1"');
        expect(mult1?.tokenType).toBe('parameter');

        const mult0n = findToken('"0..1"');
        expect(mult0n?.tokenType).toBe('parameter');

        // Arrows (operators)
        const singleArrow = findToken('->');
        expect(singleArrow?.tokenType).toBe('operator');

        const fatArrow = findToken('=>');
        expect(fatArrow?.tokenType).toBe('operator');

        const doubleArrow = findToken('-->');
        expect(doubleArrow?.tokenType).toBe('operator');

        console.log('\n✅ All semantic token classifications verified\n');
    });

    test('should not produce unknown token types', async () => {
        const document = await parse(testCode);

        const params = {
            textDocument: { uri: 'test://semantic-tokens.dygram' }
        };

        const result = await tokenProvider!.semanticHighlight(document, params);
        const tokens = decodeTokens(result.data, testCode);

        // Find any unknown tokens
        const unknownTokens = tokens.filter(t => t.tokenType.startsWith('unknown'));

        if (unknownTokens.length > 0) {
            console.log('\n❌ Found unknown token types:\n');
            unknownTokens.forEach(token => {
                console.log(
                    `  Line ${token.line}:${token.char} [${token.tokenType}] "${token.text}"`
                );
            });
        }

        expect(unknownTokens).toHaveLength(0);
    });

    test('should verify token distribution', async () => {
        const document = await parse(testCode);

        const params = {
            textDocument: { uri: 'test://semantic-tokens.dygram' }
        };

        const result = await tokenProvider!.semanticHighlight(document, params);
        const tokens = decodeTokens(result.data, testCode);

        // Count tokens by type
        const tokenCounts: Record<string, number> = {};
        tokens.forEach(token => {
            tokenCounts[token.tokenType] = (tokenCounts[token.tokenType] || 0) + 1;
        });

        console.log('\n📈 Token Distribution:\n');
        Object.entries(tokenCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
                console.log(`  ${type.padEnd(20)}: ${count}`);
            });

        // Verify we have a good distribution
        expect(tokenCounts['string']).toBeGreaterThan(0);
        expect(tokenCounts['property']).toBeGreaterThan(0);
        expect(tokenCounts['variable']).toBeGreaterThan(0);
        expect(tokenCounts['class']).toBeGreaterThan(0);
        expect(tokenCounts['decorator']).toBeGreaterThan(0);
        expect(tokenCounts['number']).toBeGreaterThan(0);
        expect(tokenCounts['type']).toBeGreaterThan(0);
        expect(tokenCounts['namespace']).toBeGreaterThan(0); // import symbols
        expect(tokenCounts['macro']).toBeGreaterThan(0);
        expect(tokenCounts['operator']).toBeGreaterThan(0);
        expect(tokenCounts['parameter']).toBeGreaterThan(0); // multiplicities
    });

    test('should handle imports correctly', async () => {
        const document = await parse(testCode);

        // Check parse result
        expect(document.parseResult.parserErrors).toHaveLength(0);

        // Check AST structure
        const machine = document.parseResult.value;
        expect(machine.imports).toBeDefined();
        expect(machine.imports).toHaveLength(1);

        const importStmt = machine.imports[0];
        expect(importStmt.symbols).toHaveLength(1);
        expect(importStmt.symbols[0].name).toBe('BaseNode');
        expect(importStmt.path).toBe('"lib.dy"');

        console.log('\n✅ Import statement parsed correctly\n');
    });

    test('should handle type annotations correctly', async () => {
        const document = await parse(testCode);

        const machine = document.parseResult.value;

        // Find timeout attribute with type annotation
        const configNode = machine.nodes?.find(n => n.name === 'Config');
        expect(configNode).toBeDefined();

        const timeoutAttr = configNode?.attributes?.find(a => a.name === 'timeout');
        expect(timeoutAttr).toBeDefined();
        expect(timeoutAttr?.type).toBeDefined();

        // Find count attribute with type annotation
        const requestNode = machine.nodes?.find(n => n.name === 'request');
        expect(requestNode).toBeDefined();

        const countAttr = requestNode?.attributes?.find(a => a.name === 'count');
        expect(countAttr).toBeDefined();
        expect(countAttr?.type).toBeDefined();

        console.log('\n✅ Type annotations parsed correctly\n');
    });
});
