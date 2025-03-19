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

describe('Arrow syntax tests', () => {
    test('parse machine with single dash arrow', async () => {
        document = await parse(`
            machine "test machine"
            main;
            init;
            main -> init;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with double dash arrow', async () => {
        document = await parse(`
            machine "test machine"
            main;
            init;
            main --> init;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with fat arrow', async () => {
        document = await parse(`
            machine "fat arrow test"
            start;
            end;
            start => end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with bidirectional arrow', async () => {
        document = await parse(`
            machine "bidirectional test"
            state1;
            state2;
            state1 <--> state2;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with mixed arrow styles', async () => {
        document = await parse(`
            machine "mixed arrows"
            s1;
            s2;
            s3;
            s4;
            s1 -> s2;
            s2 --> s3;
            s3 => s4;
            s4 <--> s1;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });
});

describe('Labeled arrow tests', () => {
    test('parse machine with labeled single dash arrow', async () => {
        document = await parse(`
            machine "labeled single"
            start;
            end;
            start -next-> end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with labeled double dash arrow', async () => {
        document = await parse(`
            machine "labeled double"
            start;
            end;
            start --next--> end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with labeled fat arrow', async () => {
        document = await parse(`
            machine "labeled fat"
            start;
            end;
            start =next=> end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with labeled bidirectional arrow', async () => {
        document = await parse(`
            machine "labeled bidirectional"
            state1;
            state2;
            state1 <--sync--> state2;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with mixed labeled arrows', async () => {
        document = await parse(`
            machine "mixed labeled arrows"
            s1;
            s2;
            s3;
            s4;
            s1 -next-> s2;
            s2 --process--> s3;
            s3 =compute=> s4;
            s4 <--sync--> s1;
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
            start => end;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with all arrow types and attributes', async () => {
        document = await parse(`
            machine "complete test"
            start {
                initial: true;
            };
            process {
                timeout: 500;
            };
            sync {
                type: "async";
            };
            end {
                final: true;
            };
            start -begin-> process;
            process --work--> sync;
            sync =compute=> end;
            start <--reset--> end;
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

    test('parse self-referential machine with different arrows', async () => {
        document = await parse(`
            machine "self ref variations"
            loop;
            loop -> loop;
            loop --> loop;
            loop => loop;
            loop <--> loop;
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse machine with whitespace variations', async () => {
        document = await parse(`
            machine    "whitespace"
                state1    ;
                state2;
                state1    =>     state2;
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
            start => nonexistent;
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
        const accept = (severity: string, message: string, options: any) => {
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
            start ==> end;
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
