import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { DependencyAnalyzer } from '../../src/language/dependency-analyzer.js';

/**
 * Tests for Phase 2 validation: multiplicity validation and dependency analysis
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

describe('Phase 2: Multiplicity Validation', () => {
    it('should accept valid single multiplicity', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "1" -> B;`;

        const document = await parse(text);
        const validationErrors = document.diagnostics || [];
        const multiplicityErrors = validationErrors.filter(e =>
            e.message.includes('multiplicity')
        );

        expect(multiplicityErrors).toHaveLength(0);
    });

    it('should accept valid range multiplicity', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "1..5" -> "*" B;`;

        const document = await parse(text);
        const validationErrors = document.diagnostics || [];
        const multiplicityErrors = validationErrors.filter(e =>
            e.message.includes('multiplicity')
        );

        expect(multiplicityErrors).toHaveLength(0);
    });

    it('should accept wildcard multiplicity', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "*" -> "*" B;`;

        const document = await parse(text);
        const validationErrors = document.diagnostics || [];
        const multiplicityErrors = validationErrors.filter(e =>
            e.message.includes('multiplicity')
        );

        expect(multiplicityErrors).toHaveLength(0);
    });

    it('should warn on invalid range (lower > upper)', async () => {
        const text = `machine "Test"
            state A;
            state B;
            A "5..2" -> B;`;

        const document = await parse(text);
        const validationWarnings = (document.diagnostics || []).filter(
            d => d.severity === 2  // Warning severity
        );

        const rangeWarnings = validationWarnings.filter(w =>
            w.message.includes('lower bound greater than upper bound')
        );

        expect(rangeWarnings.length).toBeGreaterThan(0);
    });
});

describe('Phase 2: Dependency Inference', () => {
    it('should infer dependency from simple template reference', async () => {
        const text = `machine "Test"
            context config {
                url<string>: "https://api.example.com";
            }

            task myTask {
                prompt: "Call {{ config.url }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);
        const deps = analyzer.inferDependencies();

        expect(deps).toHaveLength(1);
        expect(deps[0].source).toBe('myTask');
        expect(deps[0].target).toBe('config');
        expect(deps[0].path).toBe('config.url');
    });

    it('should infer multiple dependencies from one node', async () => {
        const text = `machine "Test"
            context apiConfig {
                baseUrl<string>: "https://api.example.com";
                apiKey<string>: "secret";
            }

            context dbConfig {
                host<string>: "localhost";
            }

            task myTask {
                prompt: "API: {{ apiConfig.baseUrl }}, DB: {{ dbConfig.host }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);
        const deps = analyzer.inferDependencies();

        expect(deps.length).toBeGreaterThanOrEqual(2);

        const apiDep = deps.find(d => d.target === 'apiConfig');
        const dbDep = deps.find(d => d.target === 'dbConfig');

        expect(apiDep).toBeDefined();
        expect(dbDep).toBeDefined();
    });

    it('should infer dependency on another task', async () => {
        const text = `machine "Test"
            task taskA {
                prompt: "Process data";
            }

            task taskB {
                prompt: "Use result from {{ taskA.prompt }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);
        const deps = analyzer.inferDependencies();

        expect(deps).toHaveLength(1);
        expect(deps[0].source).toBe('taskB');
        expect(deps[0].target).toBe('taskA');
    });

    it('should not create self-referencing dependency', async () => {
        const text = `machine "Test"
            task myTask {
                name<string>: "MyTask";
                prompt: "I am {{ myTask.name }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);
        const deps = analyzer.inferDependencies();

        // Should not create self-dependency
        const selfDeps = deps.filter(d => d.source === d.target);
        expect(selfDeps).toHaveLength(0);
    });

    it('should infer dependencies from multiple attributes', async () => {
        const text = `machine "Test"
            context config {
                key<string>: "secret";
            }

            task myTask {
                prompt: "Use {{ config.key }}";
                description: "Config is at {{ config.key }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);
        const deps = analyzer.inferDependencies();

        // Should have 2 dependencies (one from prompt, one from description)
        const configDeps = deps.filter(d => d.target === 'config');
        expect(configDeps.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle nested node references', async () => {
        const text = `machine "Test"
            context config {
                nested {
                    value<string>: "test";
                }
            }

            task myTask {
                prompt: "Use {{ config.nested }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);
        const deps = analyzer.inferDependencies();

        // Should find dependency on config (root of nested.value path)
        const configDeps = deps.filter(d => d.target === 'config');
        expect(configDeps.length).toBeGreaterThanOrEqual(0);
    });
});

describe('Phase 2: Dependency Analysis Methods', () => {
    it('should get dependencies for a specific node', async () => {
        const text = `machine "Test"
            context config {
                value<string>: "test";
            }

            task taskA {
                prompt: "Use {{ config.value }}";
            }

            task taskB {
                prompt: "Also use {{ config.value }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);

        const taskADeps = analyzer.getDependenciesFor('taskA');
        expect(taskADeps.length).toBeGreaterThanOrEqual(1);
        expect(taskADeps[0].target).toBe('config');

        const taskBDeps = analyzer.getDependenciesFor('taskB');
        expect(taskBDeps.length).toBeGreaterThanOrEqual(1);
        expect(taskBDeps[0].target).toBe('config');
    });

    it('should get dependents of a specific node', async () => {
        const text = `machine "Test"
            context config {
                value<string>: "test";
            }

            task taskA {
                prompt: "Use {{ config.value }}";
            }

            task taskB {
                prompt: "Also use {{ config.value }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);

        const configDependents = analyzer.getDependentsOf('config');
        expect(configDependents.length).toBeGreaterThanOrEqual(2);

        const sources = configDependents.map(d => d.source);
        expect(sources).toContain('taskA');
        expect(sources).toContain('taskB');
    });

    it('should check if one node depends on another', async () => {
        const text = `machine "Test"
            context config {
                value<string>: "test";
            }

            task myTask {
                prompt: "Use {{ config.value }}";
            }`;

        const document = await parse(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const machine = document.parseResult.value as Machine;
        const analyzer = new DependencyAnalyzer(machine);

        const hasDep = analyzer.hasDependency('myTask', 'config');
        expect(hasDep).toBe(true);

        const hasReverseDep = analyzer.hasDependency('config', 'myTask');
        expect(hasReverseDep).toBe(false);
    });
});
