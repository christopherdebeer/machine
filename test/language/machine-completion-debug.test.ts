import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { expectCompletion } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";

let services: ReturnType<typeof createMachineServices>;
let completion: ReturnType<typeof expectCompletion>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    completion = expectCompletion(services.Machine);
});

describe('Debug completion tests', () => {
    test('debug - what completions are available at machine level', async () => {
        await completion({
            text: `machine "test"
<|>`,
            index: 0,
            assert: (completions) => {
                console.log('Number of completions:', completions.items.length);
                console.log('Completion labels:', completions.items.map(c => c.label).slice(0, 20));
                console.log('First 5 completions:', completions.items.slice(0, 5));
                expect(completions.items.length).toBeGreaterThan(0);
            }
        });
    });

    test('debug - completions after state keyword', async () => {
        await completion({
            text: `machine "test"
state myState {
<|>
}`,
            index: 0,
            assert: (completions) => {
                console.log('Number of completions:', completions.items.length);
                console.log('Completion labels:', completions.items.map(c => c.label).slice(0, 20));
                expect(completions.items.length).toBeGreaterThan(0);
            }
        });
    });

    test('debug - completions after task keyword', async () => {
        await completion({
            text: `machine "test"
task myTask {
<|>
}`,
            index: 0,
            assert: (completions) => {
                console.log('Number of completions:', completions.items.length);
                console.log('Completion labels:', completions.items.map(c => c.label).slice(0, 20));
                console.log('First 5 completions:', completions.items.slice(0, 5));
                expect(completions.items.length).toBeGreaterThan(0);
            }
        });
    });
});
