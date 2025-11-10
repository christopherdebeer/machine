import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { GraphValidator } from '../../src/language/graph-validator.js';

/**
 * Tests for Validation.14: Graph Validation
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Entry Point Detection', () => {
    it('should find init nodes as entry points', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            start -> taskA;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const entryPoints = graphValidator.findEntryPoints();

        expect(entryPoints).toContain('start');
        expect(entryPoints.length).toBe(1);
    });

    it('should find nodes with no incoming edges as entry points', async () => {
        const text = `machine "Test"
            task taskA;
            task taskB;
            taskA -> taskB;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const entryPoints = graphValidator.findEntryPoints();

        expect(entryPoints).toContain('taskA');
    });

    it('should detect missing entry points', async () => {
        const text = `machine "Test"
            task taskA;
            task taskB;
            taskA -> taskB;
            taskB -> taskA;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const result = graphValidator.validate();

        expect(result.missingEntryPoints).toBe(true);
    });

    it('should treat nodes with only context inbound edges as entry points', async () => {
        const text = `machine "Test"
            context userRequest {
                value: "example";
            }
            task startTask;
            task followUp;
            userRequest -> startTask;
            startTask -> followUp;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const entryPoints = graphValidator.findEntryPoints();
        const unreachable = graphValidator.findUnreachableNodes();

        expect(entryPoints).toContain('startTask');
        expect(unreachable).not.toContain('startTask');
    });
});

describe('Nested graph structures', () => {
    it('should include nested nodes in reachability analysis', async () => {
        const text = `machine "Test"
            Context userRequest {
                query: "hello";
            }

            Process analysis {
                Task preprocess;
                Task analyze;
                State processing;

                preprocess -> analyze -> processing;
            };

            Task taskA;
            Task taskB;
            Task merge;

            userRequest -> analysis;
            analysis.processing -> taskA, taskB;
            taskA -> merge;
            taskB -> merge;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const unreachable = graphValidator.findUnreachableNodes();

        expect(unreachable).not.toContain('preprocess');
        expect(unreachable).not.toContain('analyze');
        expect(unreachable).not.toContain('processing');
        expect(unreachable).not.toContain('taskA');
        expect(unreachable).not.toContain('taskB');
        expect(unreachable).not.toContain('merge');
    });
});

describe('Exit Point Detection', () => {
    it('should find nodes with no outgoing edges as exit points', async () => {
        const text = `machine "Test"
            init start;
            state success;
            start -> success;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const exitPoints = graphValidator.findExitPoints();

        expect(exitPoints).toContain('success');
    });

    it('should exclude context nodes from exit points', async () => {
        const text = `machine "Test"
            context config {
                value: 42;
            }
            init start;
            start -> config;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const exitPoints = graphValidator.findExitPoints();

        // config should not be considered an exit point
        expect(exitPoints).not.toContain('config');
    });
});

describe('Unreachable Node Detection', () => {
    it('should detect nodes in components without entry points as unreachable', async () => {
        const text = `machine "Test"
            task lone;
            task taskA;
            task taskB;
            taskA -> taskB;
            taskB -> taskA;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const unreachable = graphValidator.findUnreachableNodes();

        expect(unreachable).toContain('taskA');
        expect(unreachable).toContain('taskB');
    });

    it('should not flag reachable nodes', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            task taskB;
            start -> taskA;
            taskA -> taskB;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const unreachable = graphValidator.findUnreachableNodes();

        expect(unreachable).not.toContain('taskA');
        expect(unreachable).not.toContain('taskB');
    });

    it('should exclude context nodes from unreachability check', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            context config {
                value: 42;
            }
            start -> taskA;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const unreachable = graphValidator.findUnreachableNodes();

        // context nodes are excluded from reachability
        expect(unreachable).not.toContain('config');
    });
});

describe('Orphaned Node Detection', () => {
    it('should detect orphaned nodes', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            task orphaned;
            start -> taskA;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const orphaned = graphValidator.findOrphanedNodes();

        expect(orphaned).toContain('orphaned');
    });

    it('should not flag init nodes as orphaned', async () => {
        const text = `machine "Test"
            init start;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const orphaned = graphValidator.findOrphanedNodes();

        // init nodes can have no edges and are not orphaned
        expect(orphaned).not.toContain('start');
    });

    it('should not flag context nodes as orphaned', async () => {
        const text = `machine "Test"
            context config {
                value: 42;
            }`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const orphaned = graphValidator.findOrphanedNodes();

        // context nodes are expected to have no edges
        expect(orphaned).not.toContain('config');
    });
});

describe('Cycle Detection', () => {
    it('should detect simple cycles', async () => {
        const text = `machine "Test"
            task taskA;
            task taskB;
            taskA -> taskB;
            taskB -> taskA;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const cycles = graphValidator.detectCycles();

        expect(cycles.length).toBeGreaterThan(0);
        expect(cycles[0]).toContain('taskA');
        expect(cycles[0]).toContain('taskB');
    });

    it('should detect self-loops', async () => {
        const text = `machine "Test"
            task taskA;
            taskA -> taskA;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const cycles = graphValidator.detectCycles();

        expect(cycles.length).toBeGreaterThan(0);
    });

    it('should handle acyclic graphs', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            task taskB;
            start -> taskA;
            taskA -> taskB;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const cycles = graphValidator.detectCycles();

        expect(cycles.length).toBe(0);
    });
});

describe('Path Finding', () => {
    it('should find path between connected nodes', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            task taskB;
            start -> taskA;
            taskA -> taskB;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const path = graphValidator.findPath('start', 'taskB');

        expect(path).toEqual(['start', 'taskA', 'taskB']);
    });

    it('should return empty array for disconnected nodes', async () => {
        const text = `machine "Test"
            task taskA;
            task taskB;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const path = graphValidator.findPath('taskA', 'taskB');

        expect(path).toEqual([]);
    });
});

describe('Graph Validation Integration', () => {
    it('should validate valid graph', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            state success;
            start -> taskA;
            taskA -> success;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const result = graphValidator.validate();

        expect(result.valid).toBe(true);
        expect(result.unreachableNodes).toBeUndefined();
        expect(result.orphanedNodes).toBeUndefined();
    });

    it('should report warnings for graph issues', async () => {
        const text = `machine "Test"
            init start;
            task taskA;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        // Should have warning about init node with no outgoing edges
        const initWarnings = warnings.filter(w =>
            w.message.includes('init') || w.message.includes('outgoing')
        );
        expect(initWarnings.length).toBeGreaterThan(0);
    });

    it('should report cycle warnings', async () => {
        const text = `machine "Test"
            task taskA;
            task taskB;
            taskA -> taskB;
            taskB -> taskA;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        // Should have warning about cycle
        const cycleWarnings = warnings.filter(w => w.message.includes('Cycle'));
        expect(cycleWarnings.length).toBeGreaterThan(0);
    });
});

describe('Graph Statistics', () => {
    it('should compute graph statistics', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            task taskB;
            state success;
            start -> taskA;
            taskA -> taskB;
            taskB -> success;`;

        const document = await parse(text);
        const machine = document.parseResult.value as Machine;

        const graphValidator = new GraphValidator(machine);
        const stats = graphValidator.getStatistics();

        expect(stats.nodeCount).toBe(4);
        expect(stats.edgeCount).toBe(3);
        expect(stats.entryPointCount).toBe(1);
        expect(stats.exitPointCount).toBe(1);
        expect(stats.cycleCount).toBe(0);
    });
});
