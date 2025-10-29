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

describe('Qualified Names Completion Provider', () => {
    describe('Simple node completions', () => {
        test('should suggest simple node names with high priority', async () => {
            await completion({
                text: `
                    machine "test"

                    Group {
                        task Child;
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const items = completions.items;
                    const childItem = items.find(item => item.label === 'Child');
                    const groupChildItem = items.find(item => item.label === 'Group.Child');

                    // Both should be present
                    expect(childItem).toBeDefined();
                    expect(groupChildItem).toBeDefined();

                    // Simple name should have higher priority (sortText starts with '0_')
                    expect(childItem?.sortText).toMatch(/^0_/);
                    expect(groupChildItem?.sortText).toMatch(/^1_/);
                }
            });
        });

        test('should suggest qualified paths for nested nodes', async () => {
            await completion({
                text: `
                    machine "test"

                    Workflow {
                        task Step1;
                        task Step2;
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);

                    // Should suggest both simple and qualified names
                    expect(labels).toContain('Step1');
                    expect(labels).toContain('Workflow.Step1');
                    expect(labels).toContain('Step2');
                    expect(labels).toContain('Workflow.Step2');
                }
            });
        });
    });

    describe('Conflict resolution in completions', () => {
        test('should handle simple vs qualified name conflicts', async () => {
            await completion({
                text: `
                    machine "test"

                    Group {
                        task Child "Simple child";
                        note Group.Child "Qualified child";
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const items = completions.items;

                    // Simple node "Child" should appear
                    const simpleChild = items.find(item => item.label === 'Child' && item.detail?.includes('task'));
                    expect(simpleChild).toBeDefined();

                    // Qualified node "Group.Child" should appear with explicit qualifier
                    const qualifiedChild = items.find(item => item.label === 'Group.Child');
                    expect(qualifiedChild).toBeDefined();
                    expect(qualifiedChild?.detail).toContain('explicit qualified');

                    // The qualified node should NOT also appear as just "Child" (conflict)
                    const noteAsChild = items.filter(item => item.label === 'Child');
                    expect(noteAsChild.length).toBe(1); // Only the simple task, not the note
                }
            });
        });

        test('should show shorthand for qualified nodes when no conflict', async () => {
            await completion({
                text: `
                    machine "test"

                    Group {
                        note Group.OnlyQualified "Only qualified node";
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);

                    // Should suggest both the full qualified name and the shorthand
                    expect(labels).toContain('Group.OnlyQualified');
                    expect(labels).toContain('OnlyQualified'); // Shorthand available (no conflict)

                    const shorthand = completions.items.find(item => item.label === 'OnlyQualified');
                    expect(shorthand?.detail).toContain('shorthand');
                }
            });
        });

        test('should not show qualified path when explicitly qualified node exists', async () => {
            await completion({
                text: `
                    machine "test"

                    Group {
                        task Simple "Simple node";
                    }

                    note Group.Simple "Explicit qualified at root";

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const items = completions.items;

                    // Simple task should only register as "Simple" (not "Group.Simple" due to conflict)
                    const simpleTask = items.find(item => item.label === 'Simple' && item.detail?.includes('task'));
                    expect(simpleTask).toBeDefined();

                    // Explicit "Group.Simple" note should appear
                    const explicitQualified = items.find(item => item.label === 'Group.Simple');
                    expect(explicitQualified).toBeDefined();

                    // There should only be one "Group.Simple" (the explicit one, not the implicit path)
                    const groupSimpleItems = items.filter(item => item.label === 'Group.Simple');
                    expect(groupSimpleItems.length).toBe(1);
                }
            });
        });
    });

    describe('Attribute completions with qualified names', () => {
        test('should suggest attributes for simple nodes', async () => {
            await completion({
                text: `
                    machine "test"

                    Group {
                        task Worker { status: "ready"; };
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);

                    // Should suggest node and its attributes
                    expect(labels).toContain('Worker');
                    expect(labels).toContain('Worker.status');
                    expect(labels).toContain('Group.Worker');
                    expect(labels).toContain('Group.Worker.status');
                }
            });
        });

        test('should suggest attributes for qualified nodes', async () => {
            await completion({
                text: `
                    machine "test"

                    Group {
                        note Group.Process { step: "validation"; };
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);

                    // Should suggest the qualified node and its attributes
                    expect(labels).toContain('Group.Process');
                    expect(labels).toContain('Group.Process.step');

                    // Should also suggest shorthand (no conflict in this case)
                    expect(labels).toContain('Process');
                    expect(labels).toContain('Process.step');
                }
            });
        });

        test('should only show non-conflicting attribute paths', async () => {
            await completion({
                text: `
                    machine "test"

                    Group {
                        task Child { value: "a"; };
                        note Group.Child { value: "b"; };
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const items = completions.items;
                    const labels = items.map(item => item.label);

                    // Simple node and its attribute
                    expect(labels).toContain('Child');
                    expect(labels).toContain('Child.value');

                    // Qualified node and its attribute
                    expect(labels).toContain('Group.Child');
                    expect(labels).toContain('Group.Child.value');

                    // Should have exactly 2 nodes named Child and Group.Child
                    const childNodes = items.filter(item => item.label === 'Child' && item.kind !== 4 /* Field */);
                    expect(childNodes.length).toBe(1); // Only the simple task

                    const groupChildNodes = items.filter(item => item.label === 'Group.Child' && item.kind !== 4 /* Field */);
                    expect(groupChildNodes.length).toBe(1); // Only the explicit qualified note
                }
            });
        });
    });

    describe('Deep nesting completions', () => {
        test('should handle deeply nested qualified names', async () => {
            await completion({
                text: `
                    machine "test"

                    Level1 {
                        Level2 {
                            Level3 {
                                task DeepNode;
                            }
                        }
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const labels = completions.items.map(item => item.label);

                    // Should suggest both simple and fully qualified names
                    expect(labels).toContain('DeepNode');
                    expect(labels).toContain('Level1.Level2.Level3.DeepNode');
                }
            });
        });
    });

    describe('Priority and sorting', () => {
        test('should prioritize explicit names over implicit paths', async () => {
            await completion({
                text: `
                    machine "test"

                    task API.Endpoint "Explicit qualified";

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const items = completions.items;

                    const explicitQualified = items.find(item => item.label === 'API.Endpoint');
                    const shorthand = items.find(item => item.label === 'Endpoint');

                    expect(explicitQualified).toBeDefined();
                    expect(shorthand).toBeDefined();

                    // Explicit qualified should have higher priority
                    expect(explicitQualified?.sortText).toMatch(/^0_/);
                    expect(shorthand?.sortText).toMatch(/^1_/);
                }
            });
        });

        test('should prioritize simple names over qualified paths', async () => {
            await completion({
                text: `
                    machine "test"

                    Workflow {
                        task Process;
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const items = completions.items;

                    const simpleName = items.find(item => item.label === 'Process');
                    const qualifiedPath = items.find(item => item.label === 'Workflow.Process');

                    expect(simpleName).toBeDefined();
                    expect(qualifiedPath).toBeDefined();

                    // Simple name should have higher priority
                    expect(simpleName?.sortText).toMatch(/^0_/);
                    expect(qualifiedPath?.sortText).toMatch(/^1_/);
                }
            });
        });
    });

    describe('Detail text for completion items', () => {
        test('should label explicit qualified nodes correctly', async () => {
            await completion({
                text: `
                    machine "test"

                    task API.Handler;

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const explicitQualified = completions.items.find(item => item.label === 'API.Handler');
                    expect(explicitQualified?.detail).toContain('explicit qualified');
                }
            });
        });

        test('should label shorthand completions correctly', async () => {
            await completion({
                text: `
                    machine "test"

                    note Services.Cache;

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const shorthand = completions.items.find(item => item.label === 'Cache');
                    expect(shorthand?.detail).toContain('shorthand');
                }
            });
        });

        test('should label qualified paths correctly', async () => {
            await completion({
                text: `
                    machine "test"

                    Pipeline {
                        task Step;
                    }

                    Start -> <|>
                `,
                index: 0,
                assert: (completions) => {
                    const qualifiedPath = completions.items.find(item => item.label === 'Pipeline.Step');
                    expect(qualifiedPath?.detail).toContain('qualified path');
                }
            });
        });
    });
});
