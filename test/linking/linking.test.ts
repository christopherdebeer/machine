import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { Machine, isMachine } from "../../src/language/generated/ast.js";

let services: ReturnType<typeof createMachineServices>;
let parse:    ReturnType<typeof parseHelper<Machine>>;
let document: LangiumDocument<Machine> | undefined;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

afterEach(async () => {
    document && clearDocuments(services.shared, [ document ]);
});

describe('Linking tests', () => {

    test('linking of node references in edges', async () => {
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

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(1);

        const edge = machine.edges[0];
        expect(edge.source?.[0].ref?.name).toBe('State1');
        expect(edge.segments[0].target[0].ref?.name).toBe('State2');
    });

    test('linking of non-existent nodes shows errors', async () => {
        document = await parse(`
            machine "Test Machine" @StrictMode

            State1;
            State1 --> NonExistentState;
        `, { validation: true });

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }
        
        // We expect validation errors for the non-existent state
        expect(document.diagnostics).toBeDefined();
        expect(document.diagnostics?.length).toBeGreaterThan(0);
        expect(document.diagnostics?.some(d =>
            d.message.includes('Reference to undefined state: NonExistentState')
        )).toBe(true);
    });

    test('linking of nodes in nested structure', async () => {
        document = await parse(`
            machine "Test Machine"

            Group1 {
                State1;
                State2;
            }

            State1 --> State2;
        `);

        const errors = checkDocumentValid(document);
        if (errors) {
            expect(errors).toBeUndefined();
            return;
        }

        const machine = document.parseResult.value;
        expect(machine.edges).toHaveLength(1);

        const edge = machine.edges[0];
        expect(edge.source[0].ref?.name).toBe('State1');
        expect(edge.segments[0].target[0].ref?.name).toBe('State2');
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
