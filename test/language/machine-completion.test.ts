import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { expectCompletion } from "langium/test";
import { createMachineServices } from "../../src/language/machine-module.js";
import { CompletionItemKind } from "vscode-languageserver-protocol";

let services: ReturnType<typeof createMachineServices>;
let completion: ReturnType<typeof expectCompletion>;

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    completion = expectCompletion(services.Machine);
});

describe('Machine Completion Provider', () => {
    describe('Node type completions', () => {
        test('should suggest node types at machine level', async () => {
            await completion({
                text: `
                    machine "test"
                    <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    const nodeTypes = ['state', 'task', 'context', 'init', 'tool', 'note'];

                    for (const nodeType of nodeTypes) {
                        expect(labels).toContain(nodeType);
                    }
                }
            });
        });

        test('should complete partial node type', async () => {
            await completion({
                text: `
                    machine "test"
                    sta<|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('state');
                }
            });
        });

        test('should complete task keyword', async () => {
            await completion({
                text: `
                    machine "test"
                    tas<|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('task');
                }
            });
        });
    });

    describe('Attribute completions for state nodes', () => {
        test('should suggest common attributes for state', async () => {
            await completion({
                text: `
                    machine "test"
                    state myState {
                        <|>
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Common attributes
                    expect(labels).toContain('title');
                    expect(labels).toContain('description');
                }
            });
        });
    });

    describe('Attribute completions for task nodes', () => {
        test('should suggest task-specific attributes', async () => {
            await completion({
                text: `
                    machine "test"
                    task myTask {
                        <|>
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Task-specific attributes
                    expect(labels).toContain('prompt');
                    expect(labels).toContain('model');
                    expect(labels).toContain('temperature');
                    expect(labels).toContain('maxTokens');
                    expect(labels).toContain('timeout');
                    // Common attributes should also be present
                    expect(labels).toContain('title');
                    expect(labels).toContain('description');
                }
            });
        });
    });

    describe('Attribute completions for context nodes', () => {
        test('should suggest context-specific attributes', async () => {
            await completion({
                text: `
                    machine "test"
                    context myContext {
                        <|>
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Context-specific attributes
                    expect(labels).toContain('schema');
                    expect(labels).toContain('default');
                    // Common attributes
                    expect(labels).toContain('title');
                    expect(labels).toContain('description');
                }
            });
        });
    });

    describe('Attribute completions for tool nodes', () => {
        test('should suggest tool-specific attributes', async () => {
            await completion({
                text: `
                    machine "test"
                    tool myTool {
                        <|>
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Tool-specific attributes
                    expect(labels).toContain('endpoint');
                    expect(labels).toContain('method');
                    expect(labels).toContain('parameters');
                    // Common attributes
                    expect(labels).toContain('title');
                    expect(labels).toContain('description');
                }
            });
        });
    });

    describe('Attribute completions for note nodes', () => {
        test('should suggest note-specific attributes', async () => {
            await completion({
                text: `
                    machine "test"
                    note myNote {
                        <|>
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Note-specific attributes
                    expect(labels).toContain('target');
                    expect(labels).toContain('content');
                    // Common attributes
                    expect(labels).toContain('title');
                    expect(labels).toContain('description');
                }
            });
        });
    });

    describe('Graphviz style completions', () => {
        test('should suggest style attributes in @style annotation', async () => {
            await completion({
                text: `
                    machine "test"
                    state s1 @style(<|>)
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Graphviz style attributes
                    expect(labels).toContain('color');
                    expect(labels).toContain('fillcolor');
                    expect(labels).toContain('shape');
                    expect(labels).toContain('style');
                    expect(labels).toContain('penwidth');
                    expect(labels).toContain('fontsize');
                    expect(labels).toContain('fontname');
                }
            });
        });

        test('should suggest color values', async () => {
            await completion({
                text: `
                    machine "test"
                    state s1 @style(color: <|>)
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Some color values should be suggested
                    const hasColorValues = labels.some(label =>
                        ['red', 'blue', 'green', 'black', 'gray'].includes(label)
                    );
                    expect(hasColorValues).toBe(true);
                }
            });
        });
    });

    describe('Annotation completions', () => {
        test('should suggest annotations after @ symbol', async () => {
            await completion({
                text: `
                    machine "test"
                    state s1 @<|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('Async');
                    expect(labels).toContain('Singleton');
                    expect(labels).toContain('Abstract');
                    expect(labels).toContain('Deprecated');
                    expect(labels).toContain('style');
                }
            });
        });

        test('should suggest machine-level annotations', async () => {
            await completion({
                text: `
                    machine "test" @<|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('StrictMode');
                }
            });
        });
    });

    describe('Arrow type completions', () => {
        test('should suggest arrow types between nodes', async () => {
            await completion({
                text: `
                    machine "test"
                    state s1;
                    state s2;
                    s1 <|> s2;
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Arrow types
                    const arrowTypes = ['->', '-->', '=>', '<|--', '*-->', 'o-->', '<-->'];
                    const hasArrows = arrowTypes.some(arrow => labels.includes(arrow));
                    expect(hasArrows).toBe(true);
                }
            });
        });

        test('should suggest arrows with documentation', async () => {
            await completion({
                text: `
                    machine "test"
                    state s1;
                    state s2;
                    s1 -<|>
                `,
                index: 0,
                assert: (completions) => {
                    const arrowItem = completions.items.find(item => item.label === '->');
                    if (arrowItem) {
                        expect(arrowItem.kind).toBe(CompletionItemKind.Operator);
                        expect(arrowItem.documentation).toBeDefined();
                    }
                }
            });
        });
    });

    describe('Template variable completions', () => {
        test('should suggest CEL variables in template strings', async () => {
            await completion({
                text: `
                    machine "test"
                    task t1 {
                        prompt: "Use {{<|>}}";
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Built-in CEL variables
                    expect(labels).toContain('errorCount');
                    expect(labels).toContain('errors');
                    expect(labels).toContain('activeState');
                }
            });
        });

        test('should suggest node names in template strings', async () => {
            await completion({
                text: `
                    machine "test"
                    context userData {
                        name: "test";
                    }
                    task t1 {
                        prompt: "User: {{<|>}}";
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('userData');
                }
            });
        });

        test('should suggest node.attribute in template strings', async () => {
            await completion({
                text: `
                    machine "test"
                    context userData {
                        name: "test";
                        email: "test@example.com";
                    }
                    task t1 {
                        prompt: "User: {{userData.<|>}}";
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Should suggest qualified references
                    const hasQualifiedRefs = labels.some(label =>
                        label.includes('userData.name') || label.includes('userData.email')
                    );
                    expect(hasQualifiedRefs).toBe(true);
                }
            });
        });
    });

    describe('Node reference completions', () => {
        test('should suggest existing node names for edge source', async () => {
            await completion({
                text: `
                    machine "test"
                    state start;
                    state end;
                    task process;

                    <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('start');
                    expect(labels).toContain('end');
                    expect(labels).toContain('process');
                }
            });
        });

        test('should suggest existing node names for edge target', async () => {
            await completion({
                text: `
                    machine "test"
                    state start;
                    state end;
                    task process;

                    start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('end');
                    expect(labels).toContain('process');
                }
            });
        });

        test('should suggest qualified node names', async () => {
            await completion({
                text: `
                    machine "test"
                    state parent {
                        state child;
                    }
                    state s1;

                    s1 -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Should suggest the qualified name for nested nodes
                    expect(labels).toContain('parent');
                    expect(labels).toContain('child');
                }
            });
        });

        test('should suggest node.attribute references', async () => {
            await completion({
                text: `
                    machine "test"
                    context data {
                        value: 42;
                        name: "test";
                    }

                    data.<|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Should suggest attribute references
                    const hasAttributeRefs = labels.some(label =>
                        label.includes('data.value') || label.includes('data.name')
                    );
                    expect(hasAttributeRefs).toBe(true);
                }
            });
        });
    });

    describe('Type completions', () => {
        test('should suggest generic types', async () => {
            await completion({
                text: `
                    machine "test"
                    context data {
                        items<<|>>: [];
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('Promise');
                    expect(labels).toContain('List');
                    expect(labels).toContain('Map');
                    expect(labels).toContain('Set');
                }
            });
        });

        test('should suggest basic types', async () => {
            await completion({
                text: `
                    machine "test"
                    context data {
                        value<<|>>: 0;
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    expect(labels).toContain('string');
                    expect(labels).toContain('number');
                    expect(labels).toContain('boolean');
                    expect(labels).toContain('object');
                    expect(labels).toContain('array');
                }
            });
        });
    });

    describe('Edge label completions', () => {
        test('should suggest common edge labels', async () => {
            await completion({
                text: `
                    machine "test"
                    state s1;
                    state s2;
                    s1 -<|>-> s2;
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Common edge labels
                    const commonLabels = ['reads', 'writes', 'stores', 'uses', 'calls', 'triggers'];
                    const hasLabels = commonLabels.some(label => labels.includes(label));
                    expect(hasLabels).toBe(true);
                }
            });
        });
    });

    describe('Completion metadata validation', () => {
        test('should provide completions with correct metadata for node types', async () => {
            await completion({
                text: `
                    machine "test"
                    <|>
                `,
                index: 0,
                assert: (completions) => {
                    expect(completions.items.length).toBeGreaterThan(0);

                    const stateCompletion = completions.items.find(
                        item => item.label === 'state'
                    );
                    expect(stateCompletion).toBeDefined();
                    if (stateCompletion) {
                        expect(stateCompletion.kind).toBe(CompletionItemKind.Keyword);
                        expect(stateCompletion.documentation).toBeDefined();
                        expect(stateCompletion.detail).toBe('Node type');
                    }
                }
            });
        });

        test('should provide completions with correct metadata for attributes', async () => {
            await completion({
                text: `
                    machine "test"
                    task myTask {
                        <|>
                    }
                `,
                index: 0,
                assert: (completions) => {
                    const promptCompletion = completions.items.find(
                        item => item.label === 'prompt'
                    );
                    if (promptCompletion) {
                        expect(promptCompletion.kind).toBe(CompletionItemKind.Property);
                        expect(promptCompletion.documentation).toBeDefined();
                    }
                }
            });
        });
    });

    describe('Context-aware completions', () => {
        test('should prioritize context nodes in edge completions', async () => {
            await completion({
                text: `
                    machine "test"
                    context userData;
                    state s1;
                    task t1;

                    s1 -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // All nodes should be suggested
                    expect(labels).toContain('userData');
                    expect(labels).toContain('t1');
                }
            });
        });
    });

    describe('Edge cases', () => {
        test('should handle empty machine', async () => {
            await completion({
                text: `
                    machine "empty"
                    <|>
                `,
                index: 0,
                assert: (completions) => {
                    // Should still suggest node types
                    expect(completions.items.length).toBeGreaterThan(0);
                }
            });
        });

        test('should handle cursor at beginning of file', async () => {
            await completion({
                text: `<|>machine "test"`,
                index: 0,
                assert: (completions) => {
                    // Should have some completions available
                    expect(completions.items).toBeDefined();
                }
            });
        });

        test('should handle cursor after semicolon', async () => {
            await completion({
                text: `
                    machine "test"
                    state s1;
                    <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);
                    // Should suggest node types
                    expect(labels).toContain('state');
                }
            });
        });
    });
});
