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

describe('Debug Completion Tests', () => {
    test('Debug: type completions', async () => {
        await completion({
            text: `
                machine "test"
                context data {
                    items<<|>>: [];
                }
            `,
            index: 0,
            assert: (completions) => {
                console.log('Type completion items:', completions.items.map(i => i.label));
                console.log('Total items:', completions.items.length);
            }
        });
    });

    test('Debug: edge label completions', async () => {
        await completion({
            text: `
                machine "test"
                state s1;
                state s2;
                s1 -<|>-> s2;
            `,
            index: 0,
            assert: (completions) => {
                console.log('Edge label completion items:', completions.items.map(i => i.label));
                console.log('Total items:', completions.items.length);
            }
        });
    });

    test('Debug: template variable completions', async () => {
        const text = `
                machine "test"
                task t1 {
                    prompt: "Use {{<|>}}";
                }
            `;
        const cursorPos = text.indexOf('<|>');
        const textBefore = text.substring(0, cursorPos);
        console.log('Text before cursor:', JSON.stringify(textBefore.slice(-30)));
        console.log('Has {{?', textBefore.includes('{{'));
        console.log('Has }}?', textBefore.includes('}}'));

        await completion({
            text,
            index: 0,
            assert: (completions) => {
                console.log('Template completion items:', completions.items.map(i => i.label));
                console.log('Total items:', completions.items.length);
            }
        });
    });
});
