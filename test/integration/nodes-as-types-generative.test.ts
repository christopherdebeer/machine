import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { TypeChecker } from '../../src/language/type-checker.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Generative Tests for Nodes as Types Feature
 *
 * This test suite generates various combinations of node types, union types,
 * and validates them programmatically to ensure comprehensive coverage.
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

// Test data generators
const primitiveTypes = ['string', 'number', 'boolean'];
const specializedTypes = ['Date', 'UUID', 'URL', 'Duration', 'Integer', 'Float'];
const nodeKeywords = ['Type', 'Context', 'State', 'Task', 'Process', 'Input', 'Output'];

// Sample values for primitive types
const sampleValues: Record<string, string> = {
    'string': '"sample"',
    'number': '42',
    'boolean': 'true',
    'Date': '"2025-10-31T12:00:00Z"',
    'UUID': '"550e8400-e29b-41d4-a716-446655440000"',
    'URL': '"https://example.com"',
    'Duration': '"PT30S"',
    'Integer': '42',
    'Float': '3.14',
};

interface TestResult {
    name: string;
    source: string;
    passed: boolean;
    parseErrors: string[];
    validationErrors: string[];
    typeCheckPassed: boolean;
    notes: string[];
}

const results: TestResult[] = [];

function recordResult(result: TestResult): void {
    results.push(result);
}

describe('Generative: Basic Node Types', () => {
    for (const keyword of nodeKeywords) {
        for (const primitiveType of primitiveTypes) {
            it(`should support ${keyword} with ${primitiveType} attribute`, async () => {
                const text = `machine "Test"
                    ${keyword} TestType {
                        value<${primitiveType}>;
                    }

                    Task consumer {
                        item<TestType>: { value: ${sampleValues[primitiveType]}; };
                    }`;

                const document = await parse(text);
                const parseErrors = document.parseResult.parserErrors.map(e => e.message);
                const machine = document.parseResult.value as Machine;
                const typeChecker = new TypeChecker(machine);

                const typeCheckPassed = typeChecker.isNodeType('TestType');

                recordResult({
                    name: `${keyword} with ${primitiveType}`,
                    source: text,
                    passed: parseErrors.length === 0 && typeCheckPassed,
                    parseErrors,
                    validationErrors: [],
                    typeCheckPassed,
                    notes: typeCheckPassed ? ['TestType registered successfully'] : ['TestType not registered']
                });

                expect(parseErrors).toHaveLength(0);
                expect(typeCheckPassed).toBe(true);
            });
        }
    }
});

describe('Generative: Union Types', () => {
    const literalSets = [
        ['idle', 'running', 'done'],
        ['low', 'medium', 'high'],
        ['pending', 'approved', 'rejected'],
        ['draft', 'published', 'archived'],
    ];

    for (const literals of literalSets) {
        it(`should support union type: ${literals.join(' | ')}`, async () => {
            const unionType = literals.map(l => `'${l}'`).join(' | ');
            const text = `machine "Test"
                Task processor {
                    status<${unionType}>: "${literals[0]}";
                }`;

            const document = await parse(text);
            const parseErrors = document.parseResult.parserErrors.map(e => e.message);
            const machine = document.parseResult.value as Machine;
            const typeChecker = new TypeChecker(machine);

            const task = machine.nodes.find(n => n.name === 'processor');
            const statusAttr = task?.attributes.find(a => a.name === 'status');

            let validationPassed = false;
            if (statusAttr) {
                const result = typeChecker.validateAttributeType(statusAttr);
                validationPassed = result.valid;
            }

            recordResult({
                name: `Union type: ${literals.join(' | ')}`,
                source: text,
                passed: parseErrors.length === 0 && validationPassed,
                parseErrors,
                validationErrors: [],
                typeCheckPassed: validationPassed,
                notes: validationPassed ? ['Union type validated'] : ['Union type validation failed']
            });

            expect(parseErrors).toHaveLength(0);
            expect(validationPassed).toBe(true);
        });

        it(`should reject invalid value for union type: ${literals.join(' | ')}`, async () => {
            const unionType = literals.map(l => `'${l}'`).join(' | ');
            const text = `machine "Test"
                Task processor {
                    status<${unionType}>: "invalid";
                }`;

            const document = await parse(text);
            const machine = document.parseResult.value as Machine;
            const typeChecker = new TypeChecker(machine);

            const task = machine.nodes.find(n => n.name === 'processor');
            const statusAttr = task?.attributes.find(a => a.name === 'status');

            let validationFailed = false;
            if (statusAttr) {
                const result = typeChecker.validateAttributeType(statusAttr);
                validationFailed = !result.valid;
            }

            recordResult({
                name: `Union type rejection: ${literals.join(' | ')}`,
                source: text,
                passed: validationFailed,
                parseErrors: [],
                validationErrors: validationFailed ? ['Invalid union value correctly rejected'] : [],
                typeCheckPassed: validationFailed,
                notes: ['Testing validation rejection']
            });

            expect(validationFailed).toBe(true);
        });
    }
});

describe('Generative: Node Types with Generics', () => {
    const genericTypes = ['Array', 'List'];

    for (const genericType of genericTypes) {
        it(`should support ${genericType}<NodeType>`, async () => {
            const text = `machine "Test"
                Type Item {
                    id<string>;
                    value<number>;
                }

                Task processor {
                    items<${genericType}<Item>>: [];
                }`;

            const document = await parse(text);
            const parseErrors = document.parseResult.parserErrors.map(e => e.message);
            const machine = document.parseResult.value as Machine;
            const typeChecker = new TypeChecker(machine);

            const itemRegistered = typeChecker.isNodeType('Item');

            recordResult({
                name: `${genericType}<NodeType>`,
                source: text,
                passed: parseErrors.length === 0 && itemRegistered,
                parseErrors,
                validationErrors: [],
                typeCheckPassed: itemRegistered,
                notes: itemRegistered ? ['Item type registered'] : ['Item type not registered']
            });

            expect(parseErrors).toHaveLength(0);
            expect(itemRegistered).toBe(true);
        });
    }
});

describe('Generative: Nested Node Types', () => {
    const nestingDepths = [2, 3];

    for (const depth of nestingDepths) {
        it(`should support ${depth}-level nested node types`, async () => {
            // Generate nested types
            let typeDefinitions = '';
            for (let i = depth; i >= 1; i--) {
                const typeName = `Level${i}`;
                const childType = i < depth ? `Level${i + 1}` : 'string';
                typeDefinitions += `
                Type ${typeName} {
                    value<${childType}>;
                }
                `;
            }

            // Generate nested value
            let nestedValue = '"leaf"';
            for (let i = 2; i <= depth; i++) {
                nestedValue = `{ value: ${nestedValue}; }`;
            }

            const text = `machine "Test"
                ${typeDefinitions}

                Task consumer {
                    data<Level1>: { value: ${nestedValue}; };
                }`;

            const document = await parse(text);
            const parseErrors = document.parseResult.parserErrors.map(e => e.message);
            const machine = document.parseResult.value as Machine;
            const typeChecker = new TypeChecker(machine);

            const allRegistered = Array.from({ length: depth }, (_, i) =>
                typeChecker.isNodeType(`Level${i + 1}`)
            ).every(r => r);

            recordResult({
                name: `${depth}-level nesting`,
                source: text,
                passed: parseErrors.length === 0 && allRegistered,
                parseErrors,
                validationErrors: [],
                typeCheckPassed: allRegistered,
                notes: [`All ${depth} levels registered: ${allRegistered}`]
            });

            expect(parseErrors).toHaveLength(0);
            expect(allRegistered).toBe(true);
        });
    }
});

describe('Generative: Complex Combinations', () => {
    it('should support node type with multiple attributes including unions', async () => {
        const text = `machine "Test"
            Type ComplexType {
                id<UUID>;
                name<string>;
                status<'active' | 'inactive' | 'pending'>;
                count<Integer>;
                tags<Array<string>>;
                metadata<any>;
            }

            Task processor {
                item<ComplexType>: {
                    id: "550e8400-e29b-41d4-a716-446655440000";
                    name: "Test Item";
                    status: "active";
                    count: 42;
                    tags: ["tag1", "tag2"];
                    metadata: { key: "value"; };
                };
            }`;

        const document = await parse(text);
        const parseErrors = document.parseResult.parserErrors.map(e => e.message);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        const typeRegistered = typeChecker.isNodeType('ComplexType');

        recordResult({
            name: 'Complex type with multiple attribute types',
            source: text,
            passed: parseErrors.length === 0 && typeRegistered,
            parseErrors,
            validationErrors: [],
            typeCheckPassed: typeRegistered,
            notes: ['Complex type with UUID, union, Integer, Array']
        });

        expect(parseErrors).toHaveLength(0);
        expect(typeRegistered).toBe(true);
    });

    it('should support array of node types with union types', async () => {
        const text = `machine "Test"
            Type Status {
                code<'success' | 'error' | 'warning'>;
                message<string>;
            }

            Task logger {
                statuses<Array<Status>>: [
                    { code: "success"; message: "OK"; },
                    { code: "error"; message: "Failed"; }
                ];
            }`;

        const document = await parse(text);
        const parseErrors = document.parseResult.parserErrors.map(e => e.message);
        const machine = document.parseResult.value as Machine;
        const typeChecker = new TypeChecker(machine);

        const typeRegistered = typeChecker.isNodeType('Status');

        recordResult({
            name: 'Array of node types with unions',
            source: text,
            passed: parseErrors.length === 0 && typeRegistered,
            parseErrors,
            validationErrors: [],
            typeCheckPassed: typeRegistered,
            notes: ['Array<NodeType> with union attributes']
        });

        expect(parseErrors).toHaveLength(0);
        expect(typeRegistered).toBe(true);
    });
});

// Write report after all tests
afterAll(() => {
    const reportDir = path.join(process.cwd(), 'test-output', 'nodes-as-types-generative');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, 'REPORT.md');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    let report = `# Nodes as Types - Generative Test Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += `## Summary\n\n`;
    report += `- **Total Tests**: ${total}\n`;
    report += `- **Passed**: ${passed} (${((passed/total) * 100).toFixed(1)}%)\n`;
    report += `- **Failed**: ${failed} (${((failed/total) * 100).toFixed(1)}%)\n\n`;

    if (failed > 0) {
        report += `## Failed Tests\n\n`;
        results.filter(r => !r.passed).forEach(result => {
            report += `### ${result.name}\n\n`;
            if (result.parseErrors.length > 0) {
                report += `**Parse Errors:**\n`;
                result.parseErrors.forEach(err => report += `- ${err}\n`);
                report += `\n`;
            }
            if (result.validationErrors.length > 0) {
                report += `**Validation Errors:**\n`;
                result.validationErrors.forEach(err => report += `- ${err}\n`);
                report += `\n`;
            }
            report += `**Source:**\n\`\`\`dygram\n${result.source}\n\`\`\`\n\n`;
        });
    }

    report += `## Passed Tests\n\n`;
    results.filter(r => r.passed).forEach(result => {
        report += `- ✅ ${result.name}\n`;
        if (result.notes.length > 0) {
            result.notes.forEach(note => report += `  - ${note}\n`);
        }
    });

    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`\n📊 Generative test report written to: ${reportPath}`);
    console.log(`✅ Passed: ${passed}/${total}`);
    if (failed > 0) {
        console.log(`❌ Failed: ${failed}/${total}`);
    }
});
