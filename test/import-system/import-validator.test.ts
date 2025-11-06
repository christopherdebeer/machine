/**
 * Tests for ImportValidator
 */

import { describe, it, expect } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';

describe('ImportValidator', () => {
    const services = createMachineServices(EmptyFileSystem).Machine;
    const parse = parseHelper<Machine>(services);

    describe('empty path validation', () => {
        it('should error on empty import path', async () => {
            const doc = await parse(`
                import { foo } from ""
                state a
            `);

            expect(doc.diagnostics).toBeDefined();
            const errors = doc.diagnostics?.filter(d => d.severity === 1); // Error severity
            expect(errors?.length).toBeGreaterThan(0);
        });
    });

    describe('empty symbols validation', () => {
        it('should error on import with no symbols', async () => {
            const doc = await parse(`
                import { } from "./lib.dygram"
                state a
            `);

            expect(doc.diagnostics).toBeDefined();
            const errors = doc.diagnostics?.filter(d => d.severity === 1);
            expect(errors?.length).toBeGreaterThan(0);
        });
    });

    describe('symbol collision detection', () => {
        it('should detect collision between imported and local symbols', async () => {
            const doc = await parse(`
                import { foo } from "./lib.dygram"
                state foo
            `);

            expect(doc.diagnostics).toBeDefined();
            const errors = doc.diagnostics?.filter(d =>
                d.message.includes('collides') || d.message.includes('collision')
            );
            expect(errors?.length).toBeGreaterThan(0);
        });

        it('should detect collision between multiple imports', async () => {
            const doc = await parse(`
                import { foo } from "./lib1.dygram"
                import { foo } from "./lib2.dygram"
                state a
            `);

            expect(doc.diagnostics).toBeDefined();
            const errors = doc.diagnostics?.filter(d =>
                d.message.includes('imported from both')
            );
            expect(errors?.length).toBeGreaterThan(0);
        });
    });

    describe('HTTP warning', () => {
        it('should warn on insecure HTTP imports', async () => {
            const doc = await parse(`
                import { foo } from "http://example.com/lib.dygram"
                state a
            `);

            expect(doc.diagnostics).toBeDefined();
            const warnings = doc.diagnostics?.filter(d =>
                d.severity === 2 && d.message.includes('insecure')
            );
            expect(warnings?.length).toBeGreaterThan(0);
        });

        it('should not warn on HTTPS imports', async () => {
            const doc = await parse(`
                import { foo } from "https://example.com/lib.dygram"
                state a
            `);

            expect(doc.diagnostics).toBeDefined();
            const warnings = doc.diagnostics?.filter(d =>
                d.message.includes('insecure')
            );
            expect(warnings?.length).toBe(0);
        });
    });

    describe('valid imports', () => {
        it('should accept valid relative import', async () => {
            const doc = await parse(`
                import { foo, bar } from "./lib.dygram"
                state a
            `);

            expect(doc.parseResult.parserErrors).toHaveLength(0);
            const machine = doc.parseResult.value;
            expect(machine.imports).toHaveLength(1);
            expect(machine.imports[0].symbols).toHaveLength(2);
        });

        it('should accept import with alias', async () => {
            const doc = await parse(`
                import { foo as myFoo } from "./lib.dygram"
                state a
            `);

            expect(doc.parseResult.parserErrors).toHaveLength(0);
            const machine = doc.parseResult.value;
            expect(machine.imports[0].symbols[0].alias).toBe('myFoo');
        });

        it('should accept qualified name import', async () => {
            const doc = await parse(`
                import { workflows.auth, workflows.payment } from "./lib.dygram"
                state a
            `);

            expect(doc.parseResult.parserErrors).toHaveLength(0);
            const machine = doc.parseResult.value;
            expect(machine.imports[0].symbols).toHaveLength(2);
        });
    });
});
