/**
 * State Modules Tests - Phase 2
 *
 * Tests for state nodes with children acting as workflow modules:
 * - Module entry at first child
 * - Module exit from terminal nodes
 * - Module composition
 * - Nested modules
 */

import { describe, it, expect } from 'vitest';
import { MachineExecutor, type MachineJSON } from '../../src/language/executor.js';
import { AgentContextBuilder } from '../../src/language/agent-context-builder.js';

describe('State Modules', () => {
    describe('Module Entry', () => {
        it('should enter state module at first child task', async () => {
            const machineData: MachineJSON = {
                title: 'State Module Entry Test',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'Validation', type: 'state' }, // State module
                    { name: 'check', type: 'task', parent: 'Validation' }, // First child
                    { name: 'sanitize', type: 'task', parent: 'Validation' },
                    { name: 'end', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Validation' }, // Transition to module
                    { source: 'check', target: 'sanitize' }, // Within module
                    { source: 'sanitize', target: 'end' } // Exit module
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            // Transition to module should route to first child
            await executor.step();

            // Should be at 'check' (first child of Validation)
            expect(executor.context.currentNode).toBe('check');
            expect(executor.context.activeState).toBe('Validation');

            // History should show module entry
            const history = executor.context.history;
            expect(history.some(h => h.to === 'Validation')).toBe(true);
            expect(history.some(h => h.from === 'Validation' && h.to === 'check')).toBe(true);
        });

        it('should prefer task nodes as entry points', async () => {
            const machineData: MachineJSON = {
                title: 'State Module Entry Preference Test',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'Module', type: 'state' },
                    { name: 'config', type: 'context', parent: 'Module' }, // First child (context)
                    { name: 'process', type: 'task', parent: 'Module' }, // Second child (task)
                    { name: 'end', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Module' },
                    { source: 'process', target: 'end' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            await executor.step();

            // Should enter at 'process' (task node), not 'config' (context node)
            expect(executor.context.currentNode).toBe('process');
        });

        it('should handle simple state nodes without children normally', async () => {
            const machineData: MachineJSON = {
                title: 'Simple State Node Test',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'ready', type: 'state' }, // Simple state (no children)
                    { name: 'process', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'ready' },
                    { source: 'ready', target: 'process' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            await executor.step();

            // Should be at 'ready' (not auto-routed anywhere)
            expect(executor.context.currentNode).toBe('ready');

            // Next step should auto-transition to 'process'
            await executor.step();
            expect(executor.context.currentNode).toBe('process');
        });
    });

    describe('Module Exit', () => {
        it('should inherit module-level exit edges from terminal nodes', async () => {
            const machineData: MachineJSON = {
                title: 'State Module Exit Test',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'Processing', type: 'state' },
                    { name: 'task1', type: 'state', parent: 'Processing' }, // State node auto-transitions
                    { name: 'task2', type: 'state', parent: 'Processing' }, // Terminal state node
                    { name: 'complete', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Processing' },
                    { source: 'task1', target: 'task2' }, // Within module
                    { source: 'Processing', target: 'complete' } // Module-level exit
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            // Execute through the module
            await executor.step(); // start -> Processing -> task1
            expect(executor.context.currentNode).toBe('task1');

            await executor.step(); // task1 -> task2
            expect(executor.context.currentNode).toBe('task2');

            // task2 is terminal within module, should inherit module exit
            await executor.step(); // task2 -> complete (via module exit)
            expect(executor.context.currentNode).toBe('complete');
        });

        it('should prioritize explicit edges over module-level exits', async () => {
            const machineData: MachineJSON = {
                title: 'Explicit Edge Priority Test',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'Module', type: 'state' },
                    { name: 'task1', type: 'state', parent: 'Module' }, // State nodes auto-transition
                    { name: 'task2', type: 'state', parent: 'Module' },
                    { name: 'explicitTarget', type: 'task' },
                    { name: 'moduleTarget', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Module' },
                    { source: 'task1', target: 'task2' },
                    { source: 'task2', target: 'explicitTarget' }, // Explicit edge from child
                    { source: 'Module', target: 'moduleTarget' } // Module-level exit (ignored)
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            await executor.step(); // start -> Module -> task1
            await executor.step(); // task1 -> task2
            await executor.step(); // task2 -> explicitTarget (not moduleTarget)

            expect(executor.context.currentNode).toBe('explicitTarget');
        });
    });

    describe('Module Composition', () => {
        it('should support sequential module composition', async () => {
            const machineData: MachineJSON = {
                title: 'Sequential Module Composition',
                nodes: [
                    { name: 'start', type: 'init' },
                    // Module 1
                    { name: 'Validation', type: 'state' },
                    { name: 'validate', type: 'state', parent: 'Validation' }, // State nodes auto-transition
                    // Module 2
                    { name: 'Processing', type: 'state' },
                    { name: 'process', type: 'state', parent: 'Processing' },
                    // Module 3
                    { name: 'Storage', type: 'state' },
                    { name: 'store', type: 'state', parent: 'Storage' },
                    { name: 'end', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Validation' },
                    { source: 'Validation', target: 'Processing' },
                    { source: 'Processing', target: 'Storage' },
                    { source: 'Storage', target: 'end' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            await executor.step(); // start -> Validation -> validate
            expect(executor.context.currentNode).toBe('validate');
            expect(executor.context.activeState).toBe('Validation');

            await executor.step(); // validate -> Processing -> process
            expect(executor.context.currentNode).toBe('process');
            expect(executor.context.activeState).toBe('Processing');

            await executor.step(); // process -> Storage -> store
            expect(executor.context.currentNode).toBe('store');
            expect(executor.context.activeState).toBe('Storage');

            await executor.step(); // store -> end
            expect(executor.context.currentNode).toBe('end');
        });

        it('should support conditional module transitions', async () => {
            const machineData: MachineJSON = {
                title: 'Conditional Module Transitions',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'Validation', type: 'state' },
                    { name: 'validate', type: 'task', parent: 'Validation' },
                    { name: 'SuccessPath', type: 'state' },
                    { name: 'success', type: 'task', parent: 'SuccessPath' },
                    { name: 'ErrorPath', type: 'state' },
                    { name: 'error', type: 'task', parent: 'ErrorPath' },
                    { name: 'end', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Validation' },
                    { source: 'Validation', target: 'SuccessPath', label: 'success' },
                    { source: 'Validation', target: 'ErrorPath', label: 'error' },
                    { source: 'SuccessPath', target: 'end' },
                    { source: 'ErrorPath', target: 'end' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            await executor.step(); // start -> Validation -> validate
            expect(executor.context.currentNode).toBe('validate');

            // validate is terminal in Validation module
            // Should have two available transitions (success/error paths)
            const transitions = executor['getNonAutomatedTransitions']('validate');
            expect(transitions.length).toBe(2);
            expect(transitions.map(t => t.target)).toContain('SuccessPath');
            expect(transitions.map(t => t.target)).toContain('ErrorPath');
        });
    });

    describe('Nested Modules', () => {
        it('should support nested state modules', async () => {
            const machineData: MachineJSON = {
                title: 'Nested State Modules',
                nodes: [
                    { name: 'start', type: 'init' },
                    // Outer module
                    { name: 'Pipeline', type: 'state' },
                    // Inner module (nested within Pipeline)
                    { name: 'Validation', type: 'state', parent: 'Pipeline' },
                    { name: 'validate', type: 'state', parent: 'Validation' }, // State nodes auto-transition
                    { name: 'process', type: 'state', parent: 'Pipeline' },
                    { name: 'end', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Pipeline' },
                    { source: 'Validation', target: 'process' },
                    { source: 'Pipeline', target: 'end' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            // Transition to outer module should enter inner module (first child)
            await executor.step(); // start -> Pipeline -> Validation (enters at Validation since it's first child)

            // Since getFirstChild prefers task nodes, and Validation is a state module,
            // it will enter Validation module, which then enters at validate
            // This test demonstrates nested module entry
            expect(executor.context.currentNode).toBe('validate');
            expect(executor.context.activeState).toBe('Validation');

            // Exit inner module
            await executor.step(); // validate -> process (via Validation module exit)
            expect(executor.context.currentNode).toBe('process');

            // Exit outer module
            await executor.step(); // process -> end (via Pipeline module exit)
            expect(executor.context.currentNode).toBe('end');
        });
    });

    describe('Module Context Inheritance', () => {
        it('should inherit context from parent state module', async () => {
            const machineData: MachineJSON = {
                title: 'Module Context Inheritance',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'config', type: 'context', attributes: [{ name: 'apiUrl', type: 'string', value: '"https://api.example.com"' }] },
                    { name: 'Pipeline', type: 'state' },
                    { name: 'pipelineState', type: 'context', parent: 'Pipeline', attributes: [{ name: 'status', type: 'string', value: '"running"' }] },
                    { name: 'task1', type: 'task', parent: 'Pipeline', attributes: [{ name: 'prompt', type: 'string', value: '"Process data"' }] },
                    { name: 'end', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'Pipeline' },
                    { source: 'Pipeline', target: 'config', label: 'reads' }, // Module reads config
                    { source: 'task1', target: 'pipelineState', label: 'reads' }, // Task reads pipeline state
                    { source: 'Pipeline', target: 'end' }
                ]
            };

            const executor = new MachineExecutor(machineData);

            // Use AgentContextBuilder directly
            const builder = new AgentContextBuilder(machineData, executor.context);

            // task1 should inherit read access to config from Pipeline
            const contexts = builder.getAccessibleContextNodes('task1');

            expect(contexts.has('config')).toBe(true);
            expect(contexts.get('config')?.canRead).toBe(true);

            // task1 should also have explicit access to pipelineState
            expect(contexts.has('pipelineState')).toBe(true);
            expect(contexts.get('pipelineState')?.canRead).toBe(true);
        });
    });

    describe('Backward Compatibility', () => {
        it('should maintain backward compatibility with non-module state nodes', async () => {
            const machineData: MachineJSON = {
                title: 'Backward Compatibility Test',
                nodes: [
                    { name: 'start', type: 'init' },
                    { name: 'ready', type: 'state' },
                    { name: 'processing', type: 'state' },
                    { name: 'complete', type: 'state' },
                    { name: 'task1', type: 'task' }
                ],
                edges: [
                    { source: 'start', target: 'ready' },
                    { source: 'ready', target: 'processing' },
                    { source: 'processing', target: 'task1' },
                    { source: 'task1', target: 'complete' }
                ]
            };

            const executor = new MachineExecutor(machineData);
            executor.context.currentNode = 'start';

            // Should auto-transition through simple states as before
            await executor.step(); // start -> ready
            expect(executor.context.currentNode).toBe('ready');

            await executor.step(); // ready -> processing (auto-transition)
            expect(executor.context.currentNode).toBe('processing');

            await executor.step(); // processing -> task1 (auto-transition)
            expect(executor.context.currentNode).toBe('task1');
        });
    });
});
