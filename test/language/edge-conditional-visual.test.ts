import { describe, it, expect } from 'vitest';
import { EdgeEvaluator } from '../../src/language/diagram/edge-evaluator.js';
import { generateDotDiagram } from '../../src/language/diagram/graphviz-dot-diagram.js';

describe('Conditional Edge Visual Indicators', () => {
    describe('EdgeEvaluator with machine context', () => {
        it('should correctly extract errorCount from machine attributes', () => {
            const evaluator = new EdgeEvaluator();

            // Machine attributes as array (as expected by createDefaultContext)
            const machineAttributes = [
                { name: 'status', value: 'valid' },
                { name: 'errorCount', value: 3 }
            ];

            const context = evaluator.createDefaultContext(machineAttributes);

            // Verify errorCount is preserved (this tests the bug fix from commit 7500355)
            expect(context.errorCount).toBe(3);
            expect(context.attributes.status).toBe('valid');
        });

        it('should evaluate when: condition correctly with machine errorCount', () => {
            const evaluator = new EdgeEvaluator();

            const edge = { label: 'when: status == "valid"' };
            const context = { status: 'valid', errorCount: 3 };

            const result = evaluator.evaluateEdge(edge, context);

            expect(result.isActive).toBe(true);
            expect(result.hasCondition).toBe(true);
        });

        it('should evaluate unless: condition correctly with machine errorCount', () => {
            const evaluator = new EdgeEvaluator();

            const edge = { label: 'unless: errorCount > 0' };
            const context = { errorCount: 3 };

            const result = evaluator.evaluateEdge(edge, context);

            // Since errorCount is 3, which is > 0, the unless condition should be false (inactive)
            expect(result.isActive).toBe(false);
            expect(result.hasCondition).toBe(true);
        });
    });

    describe('generateDotDiagram with conditional edges', () => {
        it('should generate DOT output with visual indicators for conditional edges', () => {
            const machineJson = {
                name: 'Conditional Edges Example',
                attributes: [
                    { name: 'status', value: 'valid' },
                    { name: 'errorCount', value: 3 }
                ],
                nodes: [
                    { name: 'Processing', type: 'task', id: 'Processing', attributes: [] },
                    { name: 'Success', type: 'task', id: 'Success', attributes: [] },
                    { name: 'Failure', type: 'task', id: 'Failure', attributes: [] },
                    { name: 'Continue', type: 'task', id: 'Continue', attributes: [] }
                ],
                edges: [
                    {
                        source: 'Processing',
                        target: 'Success',
                        arrowType: '->',
                        label: 'when: status == "valid"',
                        value: { 'when': '(status == "valid")' }
                    },
                    {
                        source: 'Processing',
                        target: 'Failure',
                        arrowType: '->',
                        label: 'when: status == "invalid"',
                        value: { 'when': '(status == "invalid")' }
                    },
                    {
                        source: 'Processing',
                        target: 'Continue',
                        arrowType: '->',
                        label: 'unless: errorCount > 0',
                        value: { 'unless': '(errorCount > 0)' }
                    }
                ]
            };

            const dotOutput = generateDotDiagram(machineJson);

            console.log('\n=== Generated DOT Output ===');
            console.log(dotOutput);
            console.log('============================\n');

            // Check that DOT output contains the edges (use quotes since they're escaped in DOT)
            expect(dotOutput).toContain('"Processing" -> "Success"');
            expect(dotOutput).toContain('"Processing" -> "Failure"');
            expect(dotOutput).toContain('"Processing" -> "Continue"');

            // Check for visual indicators (need to escape quotes in regex)
            // Active edge (when: status == "valid" with status="valid") should be green and solid
            const successEdgeMatch = dotOutput.match(/"Processing" -> "Success" \[([^\]]+)\]/);
            expect(successEdgeMatch).toBeTruthy();
            const successEdgeAttrs = successEdgeMatch ? successEdgeMatch[1] : '';
            console.log('Success edge attributes:', successEdgeAttrs);
            expect(successEdgeAttrs).toContain('color="#4CAF50"'); // Green for active
            expect(successEdgeAttrs).toContain('style=solid');
            expect(successEdgeAttrs).toContain('penwidth=2');

            // Inactive edge (when: status == "invalid" with status="valid") should be gray and dashed
            const failureEdgeMatch = dotOutput.match(/"Processing" -> "Failure" \[([^\]]+)\]/);
            expect(failureEdgeMatch).toBeTruthy();
            const failureEdgeAttrs = failureEdgeMatch ? failureEdgeMatch[1] : '';
            console.log('Failure edge attributes:', failureEdgeAttrs);
            expect(failureEdgeAttrs).toContain('color="#9E9E9E"'); // Gray for inactive
            expect(failureEdgeAttrs).toContain('style=dashed');
            expect(failureEdgeAttrs).toContain('penwidth=1');

            // Inactive edge (unless: errorCount > 0 with errorCount=3) should be gray and dashed
            const continueEdgeMatch = dotOutput.match(/"Processing" -> "Continue" \[([^\]]+)\]/);
            expect(continueEdgeMatch).toBeTruthy();
            const continueEdgeAttrs = continueEdgeMatch ? continueEdgeMatch[1] : '';
            console.log('Continue edge attributes:', continueEdgeAttrs);
            expect(continueEdgeAttrs).toContain('color="#9E9E9E"'); // Gray for inactive
            expect(continueEdgeAttrs).toContain('style=dashed');
            expect(continueEdgeAttrs).toContain('penwidth=1');
        });

        it('should show active edge when errorCount is 0', () => {
            const machineJson = {
                name: 'Test',
                attributes: [
                    { name: 'errorCount', value: 0 }
                ],
                nodes: [
                    { name: 'Start', type: 'task', id: 'Start', attributes: [] },
                    { name: 'End', type: 'task', id: 'End', attributes: [] }
                ],
                edges: [
                    {
                        source: 'Start',
                        target: 'End',
                        arrowType: '->',
                        label: 'unless: errorCount > 0',
                        value: { 'unless': '(errorCount > 0)' }
                    }
                ]
            };

            const dotOutput = generateDotDiagram(machineJson);

            // With errorCount=0, the unless: errorCount > 0 condition should be active (green/solid)
            const edgeMatch = dotOutput.match(/"Start" -> "End" \[([^\]]+)\]/);
            expect(edgeMatch).toBeTruthy();
            const edgeAttrs = edgeMatch ? edgeMatch[1] : '';
            console.log('Edge attributes (errorCount=0):', edgeAttrs);
            expect(edgeAttrs).toContain('color="#4CAF50"'); // Green for active
            expect(edgeAttrs).toContain('style=solid');
            expect(edgeAttrs).toContain('penwidth=2');
        });
    });
});
