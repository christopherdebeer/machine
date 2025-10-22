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

    test('should create nested nodes from qualified edge names', async () => {
        const input = `
workflow.start -> workflow.process;
        `;

        const document = await parse(input);

        // Should have no errors
        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);

        // Should have 1 parent node (workflow)
        const machine = document.parseResult.value;
        expect(machine.nodes).toHaveLength(1);

        const workflowNode = machine.nodes[0];
        expect(workflowNode.name).toBe('workflow');

        // workflow should have 2 children (start and process)
        expect(workflowNode.nodes).toHaveLength(2);
        const childNames = workflowNode.nodes.map(n => n.name);
        expect(childNames).toContain('start');
        expect(childNames).toContain('process');
    });

    test('should create deeply nested nodes from qualified names', async () => {
        const input = `
app.module.service.init -> app.module.service.run;
        `;

        const document = await parse(input);

        // Should have no errors
        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);

        // Should have 1 top-level node (app)
        const machine = document.parseResult.value;
        expect(machine.nodes).toHaveLength(1);

        const appNode = machine.nodes[0];
        expect(appNode.name).toBe('app');

        // app should have 1 child (module)
        expect(appNode.nodes).toHaveLength(1);
        const moduleNode = appNode.nodes[0];
        expect(moduleNode.name).toBe('module');

        // module should have 1 child (service)
        expect(moduleNode.nodes).toHaveLength(1);
        const serviceNode = moduleNode.nodes[0];
        expect(serviceNode.name).toBe('service');

        // service should have 2 children (init and run)
        expect(serviceNode.nodes).toHaveLength(2);
        const leafNames = serviceNode.nodes.map(n => n.name);
        expect(leafNames).toContain('init');
        expect(leafNames).toContain('run');
    });

    test('should mix flat and nested nodes correctly', async () => {
        const input = `
start;
start -> workflow.process;
workflow.process -> end;
        `;

        const document = await parse(input);

        // Should have no errors
        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);

        // Should have 3 top-level nodes (start, workflow, end)
        const machine = document.parseResult.value;
        expect(machine.nodes).toHaveLength(3);

        const nodeNames = machine.nodes.map(n => n.name);
        expect(nodeNames).toContain('start');
        expect(nodeNames).toContain('workflow');
        expect(nodeNames).toContain('end');

        // workflow should have 1 child (process)
        const workflowNode = machine.nodes.find(n => n.name === 'workflow');
        expect(workflowNode?.nodes).toHaveLength(1);
        expect(workflowNode?.nodes[0].name).toBe('process');
    });
});
