/**
 * Edge Conditions Visual Indication Tests
 *
 * These tests validate that conditional edges are visually styled correctly
 * based on static evaluation of their conditions.
 */

import { describe, test, expect } from 'vitest';
import { generateDotDiagram } from '../../src/language/diagram/graphviz-dot-diagram.js';
import { MachineJSON } from '../../src/language/diagram/types.js';

describe('Edge Conditions Visual Indication', () => {
    test('edge with true condition should be styled as active (green, solid, thick)', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'end',
                    label: 'when: count > 0',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'count', value: 5 }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Should contain green color, penwidth=2 (active styling)
        expect(dot).toContain('color="#4CAF50"');
        expect(dot).toContain('penwidth=2');
        // Should NOT contain dashed style (active edges are solid)
        expect(dot).not.toContain('style=dashed');
    });

    test('edge with false condition should be styled as inactive (gray, dashed, thin)', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'end',
                    label: 'when: count > 10',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'count', value: 5 }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Should contain gray color, dashed style, penwidth=1 (inactive styling)
        expect(dot).toContain('color="#9E9E9E"');
        expect(dot).toContain('style=dashed');
        expect(dot).toContain('penwidth=1');
    });

    test('edge without condition should have default styling', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'end',
                    label: 'normal edge',
                    arrowType: '->'
                }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Should NOT contain condition styling colors
        expect(dot).not.toContain('color="#4CAF50"'); // Not green
        expect(dot).not.toContain('color="#9E9E9E"'); // Not gray
        expect(dot).not.toContain('color="#D32F2F"'); // Not red
    });

    test('unless condition should be negated correctly', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'error', type: 'state' },
                { name: 'success', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'error',
                    label: 'unless: status == "ok"',
                    arrowType: '->'
                },
                {
                    source: 'start',
                    target: 'success',
                    label: 'when: status == "ok"',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'status', value: 'ok' }
            ]
        };

        const dot = generateDotDiagram(machine);
        const lines = dot.split('\n');

        // Find edge lines
        const errorEdgeLine = lines.find(line => line.includes('start') && line.includes('error'));
        const successEdgeLine = lines.find(line => line.includes('start') && line.includes('success'));

        // unless: status == "ok" should be inactive when status is "ok"
        expect(errorEdgeLine).toContain('color="#9E9E9E"');
        expect(errorEdgeLine).toContain('style=dashed');

        // when: status == "ok" should be active when status is "ok"
        expect(successEdgeLine).toContain('color="#4CAF50"');
        expect(successEdgeLine).toContain('penwidth=2');
    });

    test('if condition syntax should work', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'end',
                    label: 'if: enabled == true',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'enabled', value: true }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Should be styled as active
        expect(dot).toContain('color="#4CAF50"');
        expect(dot).toContain('penwidth=2');
    });

    test('complex condition with multiple attributes', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'process', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'process',
                    label: 'when: retryCount < maxRetries && errorCount > 0',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'retryCount', value: 2 },
                { name: 'maxRetries', value: 3 },
                { name: 'errorCount', value: 1 }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Condition should evaluate to true (2 < 3 && 1 > 0)
        expect(dot).toContain('color="#4CAF50"');
        expect(dot).toContain('penwidth=2');
    });

    test('string comparison in condition', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'production', type: 'state' },
                { name: 'development', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'production',
                    label: 'when: environment == "production"',
                    arrowType: '->'
                },
                {
                    source: 'start',
                    target: 'development',
                    label: 'when: environment == "development"',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'environment', value: 'production' }
            ]
        };

        const dot = generateDotDiagram(machine);
        const lines = dot.split('\n');

        // Find edge lines
        const prodEdgeLine = lines.find(line => line.includes('start') && line.includes('production'));
        const devEdgeLine = lines.find(line => line.includes('start') && line.includes('development'));

        // Production edge should be active
        expect(prodEdgeLine).toContain('color="#4CAF50"');

        // Development edge should be inactive
        expect(devEdgeLine).toContain('color="#9E9E9E"');
        expect(devEdgeLine).toContain('style=dashed');
    });

    test('boolean attribute condition', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'enabled', type: 'state' },
                { name: 'disabled', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'enabled',
                    label: 'when: featureEnabled',
                    arrowType: '->'
                },
                {
                    source: 'start',
                    target: 'disabled',
                    label: 'when: !featureEnabled',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'featureEnabled', value: true }
            ]
        };

        const dot = generateDotDiagram(machine);
        const lines = dot.split('\n');

        const enabledEdgeLine = lines.find(line => line.includes('start') && line.includes('enabled') && !line.includes('disabled'));
        const disabledEdgeLine = lines.find(line => line.includes('start') && line.includes('disabled'));

        // Enabled edge should be active
        expect(enabledEdgeLine).toContain('color="#4CAF50"');

        // Disabled edge should be inactive
        expect(disabledEdgeLine).toContain('color="#9E9E9E"');
    });

    test('multiple edges with different conditions', () => {
        const machine: MachineJSON = {
            title: 'Retry Logic',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'retry', type: 'state' },
                { name: 'success', type: 'state' },
                { name: 'failed', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'retry',
                    label: 'when: errorCount > 0 && retryCount < maxRetries',
                    arrowType: '->'
                },
                {
                    source: 'start',
                    target: 'success',
                    label: 'when: errorCount == 0',
                    arrowType: '->'
                },
                {
                    source: 'start',
                    target: 'failed',
                    label: 'when: retryCount >= maxRetries',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'errorCount', value: 0 },
                { name: 'retryCount', value: 0 },
                { name: 'maxRetries', value: 3 }
            ]
        };

        const dot = generateDotDiagram(machine);
        const lines = dot.split('\n');

        const retryEdgeLine = lines.find(line => line.includes('start') && line.includes('retry'));
        const successEdgeLine = lines.find(line => line.includes('start') && line.includes('success'));
        const failedEdgeLine = lines.find(line => line.includes('start') && line.includes('failed'));

        // Retry edge should be inactive (errorCount is 0)
        expect(retryEdgeLine).toContain('color="#9E9E9E"');

        // Success edge should be active (errorCount == 0)
        expect(successEdgeLine).toContain('color="#4CAF50"');

        // Failed edge should be inactive (retryCount is 0, not >= maxRetries)
        expect(failedEdgeLine).toContain('color="#9E9E9E"');
    });

    test('edge condition with equality check', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'complete', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'complete',
                    label: 'when: progress == 100',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'progress', value: 100 }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Should be styled as active
        expect(dot).toContain('color="#4CAF50"');
        expect(dot).toContain('penwidth=2');
    });

    test('edge with parenthesized complex condition', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'end',
                    label: 'when: (status == "ready" || status == "active") && enabled',
                    arrowType: '->'
                }
            ],
            attributes: [
                { name: 'status', value: 'ready' },
                { name: 'enabled', value: true }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Should be styled as active
        expect(dot).toContain('color="#4CAF50"');
        expect(dot).toContain('penwidth=2');
    });

    test('condition styling should not interfere with arrow type styling', () => {
        const machine: MachineJSON = {
            title: 'Test Machine',
            nodes: [
                { name: 'start', type: 'state' },
                { name: 'end', type: 'state' }
            ],
            edges: [
                {
                    source: 'start',
                    target: 'end',
                    label: 'when: count > 0',
                    arrowType: '-->' // dashed arrow type
                }
            ],
            attributes: [
                { name: 'count', value: 5 }
            ]
        };

        const dot = generateDotDiagram(machine);

        // Should have both arrow type styling (dashed from -->) and condition styling (green from true condition)
        // The condition color should override arrow styling
        expect(dot).toContain('color="#4CAF50"');
        expect(dot).toContain('penwidth=2');
    });
});
