import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine, isMachine } from "../../src/language/generated/ast.js";

let services: ReturnType<typeof createMachineServices>;
let parse:    ReturnType<typeof parseHelper<Machine>>;
let document: LangiumDocument<Machine> | undefined;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    const doParse = parseHelper<Machine>(services.Machine);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Validating', () => {
  
    test('check valid machine has no errors', async () => {
        document = await parse(`
            machine "Test Machine"

            State1;
            State2;

            State1 --> State2;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        expect(document.diagnostics?.length || 0).toBe(0);
    });

    test('check machine title is required', async () => {
        document = await parse(`
            machine ""

            State1;
            State2;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        expect(document.diagnostics?.some(d =>
            d.message.includes('Machine must have a title')
        )).toBe(true);
    });

    test('check duplicate state names are detected', async () => {
        document = await parse(`
            machine "Test Machine"

            State1;
            State1;  // Duplicate
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        expect(document.diagnostics?.some(d =>
            d.message.includes('Duplicate state name: State1')
        )).toBe(true);
    });

    test('check invalid state references in edges', async () => {
        document = await parse(`
            machine "Test Machine"

            State1;
            State1 --> NonExistentState;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        expect(document.diagnostics?.some(d =>
            d.message.includes('Reference to undefined state: NonExistentState')
        )).toBe(true);
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    if (document.parseResult.parserErrors.length > 0) {
        return s`
            Parser errors:
              ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
        `;
    }
    if (document.parseResult.value === undefined) {
        return `ParseResult is 'undefined'.`;
    }
    if (!isMachine(document.parseResult.value)) {
        return `Root AST object is a ${document.parseResult.value.$type}, expected a 'Machine'.`;
    }
    return undefined;
}

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
