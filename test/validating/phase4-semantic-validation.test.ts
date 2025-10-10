import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';

/**
 * Tests for Phase 4.15: Semantic Validation
 */

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Phase 4: Init Node Semantics', () => {
    it('should warn when init node has no outgoing edges', async () => {
        const text = `machine "Test"
            init start;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        const initWarnings = warnings.filter(w =>
            w.message.toLowerCase().includes('init') && w.message.toLowerCase().includes('outgoing')
        );
        expect(initWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn when init node has outgoing edges', async () => {
        const text = `machine "Test"
            init start;
            task taskA;
            start -> taskA;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        const initWarnings = warnings.filter(w =>
            w.message.includes('init') && w.message.includes('no outgoing')
        );
        expect(initWarnings.length).toBe(0);
    });
});

describe('Phase 4: Context Node Semantics', () => {
    it('should warn when context node has incoming edges', async () => {
        const text = `machine "Test"
            context config {
                value: 42;
            }
            task taskA;
            taskA -> config;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        const contextWarnings = warnings.filter(w =>
            w.message.includes('context') || w.message.includes('Context')
        );
        expect(contextWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn when context has no incoming edges', async () => {
        const text = `machine "Test"
            context config {
                value: 42;
            }
            task taskA;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        const contextWarnings = warnings.filter(w =>
            w.message.includes('context') && w.message.includes('incoming')
        );
        expect(contextWarnings.length).toBe(0);
    });
});

describe('Phase 4: Annotation Semantics - @Async', () => {
    it('should allow @Async on task nodes', async () => {
        const text = `machine "Test"
            task myTask @Async;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d =>
            d.message.includes('@Async') || d.message.includes('Async')
        ) || [];

        expect(warnings.length).toBe(0);
    });

    it('should warn @Async on non-task nodes', async () => {
        const text = `machine "Test"
            state myState @Async;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        const asyncWarnings = warnings.filter(w =>
            w.message.includes('@Async') || w.message.includes('Async')
        );
        expect(asyncWarnings.length).toBeGreaterThan(0);
    });
});

describe('Phase 4: Annotation Semantics - @Singleton', () => {
    it('should allow @Singleton on task nodes', async () => {
        const text = `machine "Test"
            task myTask @Singleton;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d =>
            d.message.includes('@Singleton') && d.severity === 2
        ) || [];

        expect(warnings.length).toBe(0);
    });

    it('should allow @Singleton on context nodes', async () => {
        const text = `machine "Test"
            context config @Singleton {
                value: 42;
            }`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d =>
            d.message.includes('@Singleton') && d.severity === 2
        ) || [];

        expect(warnings.length).toBe(0);
    });

    it('should warn @Singleton on state nodes', async () => {
        const text = `machine "Test"
            state myState @Singleton;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        const singletonWarnings = warnings.filter(w =>
            w.message.includes('@Singleton') || w.message.includes('Singleton')
        );
        expect(singletonWarnings.length).toBeGreaterThan(0);
    });
});

describe('Phase 4: Annotation Semantics - @Abstract', () => {
    it('should allow @Abstract on task nodes', async () => {
        const text = `machine "Test"
            task BaseTask @Abstract;`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d =>
            d.severity === 1 && d.message.includes('@Abstract')
        ) || [];

        expect(errors.length).toBe(0);
    });

    it('should error @Abstract on init nodes', async () => {
        const text = `machine "Test"
            init start @Abstract;`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        const abstractErrors = errors.filter(e =>
            e.message.includes('@Abstract') || e.message.includes('Abstract')
        );
        expect(abstractErrors.length).toBeGreaterThan(0);
    });
});

describe('Phase 4: Relationship Semantics - Inheritance', () => {
    it('should allow inheritance between same node types', async () => {
        const text = `machine "Test"
            task BaseTask;
            task SpecificTask;
            BaseTask <|-- SpecificTask;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d =>
            d.severity === 2 && d.message.includes('Inheritance')
        ) || [];

        expect(warnings.length).toBe(0);
    });

    it('should warn inheritance between different node types', async () => {
        const text = `machine "Test"
            task BaseTask;
            state SpecificState;
            BaseTask <|-- SpecificState;`;

        const document = await parse(text);
        const warnings = document.diagnostics?.filter(d => d.severity === 2) || [];

        const inheritanceWarnings = warnings.filter(w =>
            w.message.includes('Inheritance') || w.message.includes('inheritance')
        );
        expect(inheritanceWarnings.length).toBeGreaterThan(0);
    });
});

describe('Phase 4: Complete Semantic Validation', () => {
    it('should pass validation for semantically correct machine', async () => {
        const text = `machine "Test"
            context config @Singleton {
                value: 42;
            }

            task BaseTask @Abstract {
                version: "1.0";
            }

            task SpecificTask @Async {
                data: "test";
            }

            init start;
            state success;

            BaseTask <|-- SpecificTask;
            start -> SpecificTask;
            SpecificTask -> success;`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Should have no semantic errors
        expect(errors.length).toBe(0);
    });

    it('should report multiple semantic issues', async () => {
        const text = `machine "Test"
            init start @Abstract;
            state myState @Async;
            context config {
                value: 42;
            }

            myState -> config;`;

        const document = await parse(text);
        const issues = document.diagnostics || [];

        // Should have multiple semantic issues
        expect(issues.length).toBeGreaterThan(0);

        // Check for specific issues
        const abstractError = issues.find(i => i.message.includes('@Abstract'));
        expect(abstractError).toBeDefined();

        const asyncWarning = issues.find(i => i.message.includes('@Async'));
        expect(asyncWarning).toBeDefined();

        const contextWarning = issues.find(i => i.message.includes('context') || i.message.includes('Context'));
        expect(contextWarning).toBeDefined();
    });
});

describe('Phase 4: Annotation Combinations', () => {
    it('should allow multiple compatible annotations', async () => {
        const text = `machine "Test"
            task myTask @Async @Critical;`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        expect(errors.length).toBe(0);
    });

    it('should validate each annotation independently', async () => {
        const text = `machine "Test"
            task myTask @Abstract @Singleton;`;

        const document = await parse(text);
        const errors = document.diagnostics?.filter(d => d.severity === 1) || [];

        // Both annotations should be valid on task
        expect(errors.length).toBe(0);
    });
});
