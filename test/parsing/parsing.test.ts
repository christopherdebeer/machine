import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine, isMachine } from "../../src/language/generated/ast.js";
import { MachineValidator } from "../../src/language/machine-validator.js";

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;
let document: LangiumDocument<Machine> | undefined;
let validator: MachineValidator;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
    validator = new MachineValidator();
});

describe('Basic syntax tests', () => {
    test('parse simple machine', async () => {
        document = await parse(`
            machine "test machine"
            main;
            init;
            main --> init;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with multiple states and transitions', async () => {
        document = await parse(`
            machine "multi state"
            start;
            middle;
            end;
            start --> middle;
            middle --> end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });
});

describe('Complex feature tests', () => {
    test('parse machine with node attributes', async () => {
        document = await parse(`
            machine "attribute test"
            start {
                initial: true;
                timeout: 1000;
            };
            end {
                final: true;
            };
            start --> end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with labeled transitions', async () => {
        document = await parse(`
            machine "labeled test"
            start;
            success;
            error;
            start -- valid --> success;
            start -- invalid --> error;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });
});

describe('Edge case tests', () => {
    test('parse empty machine', async () => {
        document = await parse('machine "empty"');
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse single state machine', async () => {
        document = await parse(`
            machine "singleton"
            alone;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse self-referential machine', async () => {
        document = await parse(`
            machine "self ref"
            loop;
            loop --> loop;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with whitespace variations', async () => {
        document = await parse(`
            machine    "whitespace"
                state1    ;
                state2;
                state1    -->     state2;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });
});

describe('Error case tests', () => {
    test('detect missing machine name', async () => {
        document = await parse('machine;');
        expect(checkDocumentValid(document)).toBeDefined();
    });

    test('detect invalid state reference', async () => {
        document = await parse(`
            machine "invalid ref"
            start;
            start --> nonexistent;
        `);
        const errors: any[] = [];
        const accept = (severity: string, message: string, options: any) => {
            errors.push({ severity, message, options });
        };
        validator.checkInvalidStateReferences(
            document.parseResult.value as Machine,
            accept
        );
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.message.includes('undefined state'))).toBe(true);
    });

    test('detect duplicate state definitions', async () => {
        document = await parse(`
            machine "duplicates"
            state;
            state;
        `);
        const errors: any[] = [];
        const  accept = (severity: string, message: string, options: any) => {
            errors.push({ severity, message, options });
        };
        validator.checkDuplicateStates(
            document.parseResult.value as Machine,
            accept
        );
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.message.includes('Duplicate state'))).toBe(true);
    });

    test('detect invalid transition syntax', async () => {
        document = await parse(`
            machine "bad syntax"
            start;
            end;
            start ->-> end;
        `);
        expect(checkDocumentValid(document)).toBeDefined();
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isMachine(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a 'Machine'.`
        || undefined;
}
