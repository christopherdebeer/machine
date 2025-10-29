import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { expectCompletion } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { MachineCompletionProvider } from "../../src/language/machine-completion-provider.js";

let services: ReturnType<typeof createMachineServices>;
let completion: ReturnType<typeof expectCompletion>;
let provider: MachineCompletionProvider;

// Spy on completionFor to see what's being called
let completionForCalls: any[] = [];

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    provider = services.Machine.lsp.CompletionProvider as MachineCompletionProvider;

    // Wrap the completionFor method to log calls
    const originalCompletionFor = provider['completionFor'].bind(provider);
    provider['completionFor'] = function(context: any, next: any, acceptor: any) {
        completionForCalls.push({ context, next, acceptor });
        console.log('completionFor called with:');
        console.log('  context.node.$type:', context.node?.$type);
        console.log('  next.type:', next.type);
        console.log('  next.property:', next.property);
        console.log('  next.feature:', next.feature);
        return originalCompletionFor(context, next, acceptor);
    };

    completion = expectCompletion(services.Machine);
});

describe('Debug: Completion Context', () => {
    test('what contexts are passed at machine level', async () => {
        completionForCalls = [];

        await completion({
            text: `machine "test"
<|>`,
            index: 0,
            assert: (completions) => {
                console.log('Number of completionFor calls:', completionForCalls.length);
                console.log('Number of completions returned:', completions.items.length);
                console.log('Completion items:', completions.items.map(c => c.label));
            }
        });
    });

    test('what contexts are passed inside node body', async () => {
        completionForCalls = [];

        await completion({
            text: `machine "test"
task myTask {
<|>
}`,
            index: 0,
            assert: (completions) => {
                console.log('Number of completionFor calls:', completionForCalls.length);
                console.log('Number of completions returned:', completions.items.length);
                console.log('Completion items:', completions.items.map(c => c.label));
            }
        });
    });
});
