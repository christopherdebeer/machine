import { describe, test, expect } from 'vitest';
import { createMachineServices } from '../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../src/language/generated/ast.js';

const services = createMachineServices(EmptyFileSystem);
const parse = parseHelper<Machine>(services.Machine);

describe('Edge Auto-Creation Tests', () => {
    test('should auto-create nodes from edges in non-strict mode', async () => {
        const input = `
problem;
solution;
problem -> solution;
one -> two;
        `;

        const document = await parse(input);
        
        // Should parse without errors
        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        
        // Should have no linking errors (nodes auto-created)
        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);
        
        // Should have 4 nodes total (2 explicit + 2 auto-created)
        const machine = document.parseResult.value;
        expect(machine.nodes).toHaveLength(4);
        
        // Check that auto-created nodes exist
        const nodeNames = machine.nodes.map(n => n.name);
        expect(nodeNames).toContain('problem');
        expect(nodeNames).toContain('solution');
        expect(nodeNames).toContain('one');
        expect(nodeNames).toContain('two');
    });

    test('should show errors in strict mode for undefined nodes', async () => {
        const input = `
machine "Test" @StrictMode
problem;
solution;
problem -> solution;
one -> two;
        `;

        const document = await parse(input, { validation: true });
        
        // Should parse without parser errors
        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        
        // Debug: Check what nodes exist
        const machine = document.parseResult.value;
        const nodeNames = machine.nodes.map(n => n.name);
        console.log('Nodes in strict mode:', nodeNames);
        console.log('Annotations:', machine.annotations?.map(a => a.name));
        
        // Check for linking errors in references
        const edge = machine.edges[1]; // one -> two edge
        console.log('Edge source refs:', edge.source.map(s => ({ refText: s.$refText, error: s.error })));
        console.log('Edge target refs:', edge.segments[0].target.map(t => ({ refText: t.$refText, error: t.error })));
        
        // Should have validation errors for undefined nodes OR linking errors
        const diagnostics = document.diagnostics ?? [];
        console.log('All diagnostics:', diagnostics.map(d => ({ severity: d.severity, message: d.message })));
        
        // Check for linking errors in the references themselves
        const hasLinkingErrors = edge.source.some(s => s.error) || 
                                edge.segments[0].target.some(t => t.error);
        
        const errors = diagnostics.filter(d => d.severity === 1); // Error severity
        
        // Should have either validation errors or linking errors
        expect(errors.length > 0 || hasLinkingErrors).toBe(true);
        
        if (errors.length > 0) {
            // Should mention 'one' and 'two' in error messages
            const errorMessages = errors.map(e => e.message).join(' ');
            expect(errorMessages).toContain('one');
            expect(errorMessages).toContain('two');
        }
    });

    test('should not create duplicate nodes', async () => {
        const input = `
problem;
problem -> solution;
solution -> problem;
        `;

        const document = await parse(input);
        
        // Should have no errors
        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);
        
        // Should have exactly 2 nodes (no duplicates)
        const machine = document.parseResult.value;
        expect(machine.nodes).toHaveLength(2);
        
        const nodeNames = machine.nodes.map(n => n.name);
        expect(nodeNames).toContain('problem');
        expect(nodeNames).toContain('solution');
    });

    test('should work with multiple edges referencing same undefined node', async () => {
        const input = `
a -> target;
b -> target;
c -> target;
        `;

        const document = await parse(input);
        
        // Should have no errors
        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);
        
        // Should have 4 nodes (a, b, c, target)
        const machine = document.parseResult.value;
        expect(machine.nodes).toHaveLength(4);
        
        const nodeNames = machine.nodes.map(n => n.name);
        expect(nodeNames).toContain('a');
        expect(nodeNames).toContain('b');
        expect(nodeNames).toContain('c');
        expect(nodeNames).toContain('target');
    });

    test('should handle complex edge patterns', async () => {
        const input = `
start;
start -> middle -> end;
end -> start;
        `;

        const document = await parse(input);
        
        // Should have no errors
        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);
        
        // Should have 3 nodes
        const machine = document.parseResult.value;
        expect(machine.nodes).toHaveLength(3);
        
        const nodeNames = machine.nodes.map(n => n.name);
        expect(nodeNames).toContain('start');
        expect(nodeNames).toContain('middle');
        expect(nodeNames).toContain('end');
    });
});
