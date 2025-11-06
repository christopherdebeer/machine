import { describe, expect, test, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';

describe('Qualified Node ID Validation', () => {
    let parse: ReturnType<typeof parseHelper<Machine>>;

    beforeAll(() => {
        const services = createMachineServices(EmptyFileSystem);
        const doParse = parseHelper<Machine>(services.Machine);
        parse = (input: string) => doParse(input, { validation: true });
    });

    test('should recognize qualified node IDs in strict mode', async () => {
        const document = await parse(`
            machine "Test" @StrictMode

            Process analysis {
                State processing "Processing State";
            };

            Task taskA "Task A";

            // This should not error - analysis.processing is defined
            analysis.processing -> taskA;
        `);

        expect(document).toBeDefined();
        const errors = (document.diagnostics || []).filter(d => d.severity === 1); // 1 = Error

        // Should have NO errors
        expect(errors.length).toBe(0);
    });

    test('should recognize multiple levels of nesting', async () => {
        const document = await parse(`
            machine "Test" @StrictMode

            Process workflow {
                Process analysis {
                    State processing "Processing";
                };
            };

            Task taskA "Task A";

            // Should recognize workflow.analysis.processing
            workflow.analysis.processing -> taskA;
        `);

        expect(document).toBeDefined();
        const errors = (document.diagnostics || []).filter(d => d.severity === 1);

        // Should have NO errors
        expect(errors.length).toBe(0);
    });

    test('should still catch truly undefined qualified references', async () => {
        const document = await parse(`
            machine "Test" @StrictMode

            Process analysis {
                State processing "Processing State";
            };

            Task taskA "Task A";

            // This SHOULD error - analysis.undefined is not defined
            analysis.undefined -> taskA;
        `);

        expect(document).toBeDefined();
        const errors = (document.diagnostics || []).filter(d => d.severity === 1);

        // Should have errors for undefined reference
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.message.includes('undefined'))).toBe(true);
    });

    test('should work with the comprehensive demo from issue #287', async () => {
        const document = await parse(`
            machine "Comprehensive Demo" @StrictMode @Version("1.0")

            // Machine-level configuration
            Context config {
                model: "claude-3-5-sonnet-20241022";
                temperature: 0.7;
                endpoints<Array<string>>: ["api1.com", "api2.com"];
            };

            // Input with schema reference
            Input userRequest {
                query: "Sample query";
                schema: #requestSchema;
            };

            // Nested process with hierarchy
            Process analysis {
                Task preprocess "Clean data" @Async {
                    priority<number>: 10;
                    timeout: "30s";
                };

                Task analyze "Analyze content" {
                    prompt: "Analyze: {{ userRequest.query }}";
                    model: "claude-3-5-sonnet-20241022";
                };

                State processing "Processing State";

                preprocess -> analyze -> processing;
            };

            // Parallel processing
            Task taskA "Path A" @Async;
            Task taskB "Path B" @Async;
            Task merge "Merge Results";

            // Output node
            Output result {
                status: "pending";
                data: #outputData;
            };

            // Complex edges with different arrow types
            userRequest -> analysis;
            analysis.processing -> taskA, taskB;
            taskA -> merge;
            taskB -> merge;
            merge => result;

            // Relationship arrows
            Task parent;
            Task child;
            child <|-- parent;  // Inheritance

            // Documentation
            note analysis "This process handles the main analysis pipeline" @Documentation {
                complexity: "O(n)";
                author: "System";
            };
        `);

        expect(document).toBeDefined();
        const errors = (document.diagnostics || []).filter(d => d.severity === 1);

        // Should have NO errors - analysis.processing is properly defined
        expect(errors.length).toBe(0);
    });
});
