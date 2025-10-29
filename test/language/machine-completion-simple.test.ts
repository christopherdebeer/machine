import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { createMachineServices } from "../../src/language/machine-module.js";
import { CompletionParams, Position } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseDocument } from "langium/test";

let services: ReturnType<typeof createMachineServices>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
});

describe('Simple completion provider test', () => {
    test('can get completions directly from provider', async () => {
        const text = `machine "test"
state myState {

}`;

        // Parse the document first
        const doc = await parseDocument(services.Machine, text);

        // Create a text document
        const textDoc = TextDocument.create('test://test.dygram', 'machine', 0, text);

        // Position inside the state block
        const position = Position.create(2, 4); // Line 2, character 4

        // Create completion params
        const params: CompletionParams = {
            textDocument: { uri: textDoc.uri },
            position: position
        };

        // Get the completion provider
        const completionProvider = services.Machine.lsp.CompletionProvider;

        // Get completions
        const result = await completionProvider?.getCompletion(doc, params);

        console.log('Completion items:', result?.items?.map(item => ({
            label: item.label,
            kind: item.kind,
            detail: item.detail
        })).slice(0, 10));

        expect(result).toBeDefined();
        expect(result?.items).toBeDefined();
    });
});
