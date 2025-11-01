/**
 * Tests for DependencyGraph
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { URI } from 'langium';
import { DependencyGraph } from '../../src/language/import-system/dependency-graph.js';

describe('DependencyGraph', () => {
    let graph: DependencyGraph;

    beforeEach(() => {
        graph = new DependencyGraph();
    });

    describe('addModule', () => {
        it('should add a module to the graph', () => {
            const uri = URI.file('/test/module.dygram');
            graph.addModule(uri);
            expect(graph.hasModule(uri)).toBe(true);
            expect(graph.size).toBe(1);
        });

        it('should not add duplicate modules', () => {
            const uri = URI.file('/test/module.dygram');
            graph.addModule(uri);
            graph.addModule(uri);
            expect(graph.size).toBe(1);
        });
    });

    describe('addDependency', () => {
        it('should add a dependency between two modules', () => {
            const moduleA = URI.file('/test/a.dygram');
            const moduleB = URI.file('/test/b.dygram');

            graph.addDependency(moduleA, moduleB);

            const deps = graph.getDependencies(moduleA);
            expect(deps).toHaveLength(1);
            expect(deps[0].toString()).toBe(moduleB.toString());
        });

        it('should track dependents', () => {
            const moduleA = URI.file('/test/a.dygram');
            const moduleB = URI.file('/test/b.dygram');

            graph.addDependency(moduleA, moduleB);

            const dependents = graph.getDependents(moduleB);
            expect(dependents).toHaveLength(1);
            expect(dependents[0].toString()).toBe(moduleA.toString());
        });
    });

    describe('detectCycles', () => {
        it('should detect no cycles in acyclic graph', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');
            const c = URI.file('/test/c.dygram');

            graph.addDependency(a, b);
            graph.addDependency(b, c);

            const cycles = graph.detectCycles();
            expect(cycles).toHaveLength(0);
        });

        it('should detect simple cycle', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');

            graph.addDependency(a, b);
            graph.addDependency(b, a);

            const cycles = graph.detectCycles();
            expect(cycles.length).toBeGreaterThan(0);
        });

        it('should detect complex cycle', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');
            const c = URI.file('/test/c.dygram');

            graph.addDependency(a, b);
            graph.addDependency(b, c);
            graph.addDependency(c, a);

            const cycles = graph.detectCycles();
            expect(cycles.length).toBeGreaterThan(0);
        });
    });

    describe('topologicalSort', () => {
        it('should return modules in dependency order', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');
            const c = URI.file('/test/c.dygram');

            // a depends on b, b depends on c
            graph.addDependency(a, b);
            graph.addDependency(b, c);

            const sorted = graph.topologicalSort();
            expect(sorted).not.toBeNull();

            if (sorted) {
                // c should come before b, b should come before a
                const cIndex = sorted.findIndex(uri => uri.toString() === c.toString());
                const bIndex = sorted.findIndex(uri => uri.toString() === b.toString());
                const aIndex = sorted.findIndex(uri => uri.toString() === a.toString());

                expect(cIndex).toBeLessThan(bIndex);
                expect(bIndex).toBeLessThan(aIndex);
            }
        });

        it('should return null for cyclic graph', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');

            graph.addDependency(a, b);
            graph.addDependency(b, a);

            const sorted = graph.topologicalSort();
            expect(sorted).toBeNull();
        });
    });

    describe('removeModule', () => {
        it('should remove a module and its relationships', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');

            graph.addDependency(a, b);
            graph.removeModule(a);

            expect(graph.hasModule(a)).toBe(false);
            expect(graph.getDependents(b)).toHaveLength(0);
        });
    });

    describe('hasPath', () => {
        it('should detect direct path', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');

            graph.addDependency(a, b);
            expect(graph.hasPath(a, b)).toBe(true);
        });

        it('should detect transitive path', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');
            const c = URI.file('/test/c.dygram');

            graph.addDependency(a, b);
            graph.addDependency(b, c);

            expect(graph.hasPath(a, c)).toBe(true);
        });

        it('should return false for no path', () => {
            const a = URI.file('/test/a.dygram');
            const b = URI.file('/test/b.dygram');
            const c = URI.file('/test/c.dygram');

            graph.addDependency(a, b);

            expect(graph.hasPath(a, c)).toBe(false);
        });
    });
});
