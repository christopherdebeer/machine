/**
 * Tests for task prompt template compilation with CEL support
 */

import { describe, it, expect } from 'vitest';
import { compilePrompt, TaskPromptContext } from '../../src/language/prompts/task-prompts.js';
import { CelEvaluationContext } from '../../src/language/cel-evaluator.js';

describe('Task Prompt Compilation', () => {
    describe('Basic template compilation (backward compatibility)', () => {
        it('should replace simple title placeholder', () => {
            const template = 'Task: {{title}}';
            const context: TaskPromptContext = {
                title: 'Test Task'
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Task: Test Task');
        });

        it('should replace description placeholder', () => {
            const template = 'Description: {{description}}';
            const context: TaskPromptContext = {
                description: 'This is a test'
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Description: This is a test');
        });

        it('should replace prompt placeholder', () => {
            const template = 'Prompt: {{prompt}}';
            const context: TaskPromptContext = {
                prompt: 'Do something'
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Prompt: Do something');
        });

        it('should use default values for missing placeholders', () => {
            const template = 'Task: {{title}}\nDescription: {{description}}';
            const context: TaskPromptContext = {};

            const result = compilePrompt(template, context);
            expect(result).toBe('Task: Untitled Task\nDescription: No description provided');
        });

        it('should handle {{#each attributes}} blocks', () => {
            const template = 'Attributes:\n{{#each attributes}}\n- {{@key}}: {{this}}\n{{/each}}';
            const context: TaskPromptContext = {
                attributes: {
                    priority: 'high',
                    status: 'active'
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toContain('- priority: high');
            expect(result).toContain('- status: active');
        });

        it('should remove empty {{#each attributes}} blocks', () => {
            const template = 'Task: {{title}}\nAdditional Attributes:\n{{#each attributes}}\n- {{@key}}: {{this}}\n{{/each}}';
            const context: TaskPromptContext = {
                title: 'Test',
                attributes: {}
            };

            const result = compilePrompt(template, context);
            expect(result).not.toContain('Additional Attributes:');
        });
    });

    describe('CEL-enhanced template compilation', () => {
        it('should resolve simple variable with CEL', () => {
            const template = 'User: {{ userData.name }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        userData: {
                            name: 'John Doe'
                        }
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('User: John Doe');
        });

        it('should resolve nested object properties', () => {
            const template = 'Connect to {{ config.database.host }}:{{ config.database.port }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        config: {
                            database: {
                                host: 'localhost',
                                port: 5432
                            }
                        }
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Connect to localhost:5432');
        });

        it('should evaluate CEL expressions', () => {
            const template = 'Total items: {{ itemCount * multiplier }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        itemCount: 5,
                        multiplier: 3
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Total items: 15');
        });

        it('should support string concatenation in CEL', () => {
            const template = 'Full name: {{ firstName + " " + lastName }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        firstName: 'John',
                        lastName: 'Doe'
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Full name: John Doe');
        });

        it('should support conditional expressions', () => {
            const template = 'Status: {{ active ? "Online" : "Offline" }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        active: true
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Status: Online');
        });

        it('should handle null/undefined values gracefully', () => {
            const template = 'Value: {{ nullValue }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        nullValue: null
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Value:');
        });

        it('should serialize objects to JSON', () => {
            const template = 'Config: {{ settings }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        settings: {
                            theme: 'dark',
                            notifications: true
                        }
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Config: {"theme":"dark","notifications":true}');
        });

        it('should handle multiple template variables', () => {
            const template = 'Welcome {{ user.name }}! You have {{ messageCount }} messages.';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        user: {
                            name: 'Alice'
                        },
                        messageCount: 5
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Welcome Alice! You have 5 messages.');
        });

        it('should preserve original template on CEL evaluation error', () => {
            const template = 'Value: {{ invalid.path.that.doesnt.exist }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {}
                }
            };

            const result = compilePrompt(template, context);
            // Should preserve original template on error
            expect(result).toContain('{{ invalid.path.that.doesnt.exist }}');
        });

        it('should combine prompt context with CEL attributes', () => {
            const template = 'Title: {{ title }}\nUser: {{ userData.name }}';
            const context: TaskPromptContext = {
                title: 'My Task',
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        userData: {
                            name: 'Bob'
                        }
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Title: My Task\nUser: Bob');
        });

        it('should handle {{#each}} blocks before CEL resolution', () => {
            const template = 'Task: {{ title }}\nAttributes:\n{{#each attributes}}\n- {{@key}}: {{this}}\n{{/each}}\nUser: {{ user.name }}';
            const context: TaskPromptContext = {
                title: 'Test Task',
                attributes: {
                    priority: 'high'
                },
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        user: {
                            name: 'Charlie'
                        }
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toContain('Task: Test Task');
            expect(result).toContain('- priority: high');
            expect(result).toContain('User: Charlie');
        });
    });

    describe('Built-in CEL variables', () => {
        it('should access errorCount in templates', () => {
            const template = 'Errors: {{ errorCount }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 3,
                    activeState: 'idle',
                    attributes: {}
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Errors: 3');
        });

        it('should access activeState in templates', () => {
            const template = 'State: {{ activeState }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 0,
                    activeState: 'processing',
                    attributes: {}
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('State: processing');
        });

        it('should support errors alias for errorCount', () => {
            const template = 'Errors: {{ errors }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 7,
                    activeState: 'idle',
                    attributes: {}
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Errors: 7');
        });

        it('should prioritize built-in variables over attributes', () => {
            const template = 'Errors: {{ errorCount }}';
            const context: TaskPromptContext = {
                celContext: {
                    errorCount: 5,
                    activeState: 'idle',
                    attributes: {
                        // Even if there's a node named errorCount, built-in wins
                        errorCount: {
                            value: 999
                        }
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toBe('Errors: 5');
        });
    });

    describe('Complex real-world scenarios', () => {
        it('should compile a complete task prompt with CEL', () => {
            const template = `You are processing a task for user {{ user.name }}.

Task Details:
- Title: {{ title }}
- Description: {{ description }}
- Priority: {{ config.priority }}
- Status: {{ activeState }}

Progress: {{ user.tasksCompleted }} / {{ user.totalTasks }} tasks completed.

{{ errorCount > 0 ? "Note: There are errors that need attention." : "All systems operational." }}

Please process the following request: {{ prompt }}`;

            const context: TaskPromptContext = {
                title: 'Data Analysis',
                description: 'Analyze user behavior patterns',
                prompt: 'Generate insights from the data',
                celContext: {
                    errorCount: 0,
                    activeState: 'processing',
                    attributes: {
                        user: {
                            name: 'Alice',
                            tasksCompleted: 8,
                            totalTasks: 10
                        },
                        config: {
                            priority: 'high'
                        }
                    }
                }
            };

            const result = compilePrompt(template, context);
            expect(result).toContain('user Alice');
            expect(result).toContain('Title: Data Analysis');
            expect(result).toContain('Priority: high');
            expect(result).toContain('Status: processing');
            expect(result).toContain('8 / 10 tasks completed');
            expect(result).toContain('All systems operational');
            expect(result).toContain('Generate insights from the data');
        });

        it('should handle mixed CEL and non-CEL contexts', () => {
            // Test backward compatibility when celContext is not provided
            const template1 = 'Task: {{title}}';
            const context1: TaskPromptContext = {
                title: 'Legacy Task'
            };
            const result1 = compilePrompt(template1, context1);
            expect(result1).toBe('Task: Legacy Task');

            // Test with CEL context
            const template2 = 'Task: {{ title }}, User: {{ user.name }}';
            const context2: TaskPromptContext = {
                title: 'Modern Task',
                celContext: {
                    errorCount: 0,
                    activeState: 'idle',
                    attributes: {
                        user: { name: 'Bob' }
                    }
                }
            };
            const result2 = compilePrompt(template2, context2);
            expect(result2).toBe('Task: Modern Task, User: Bob');
        });
    });
});
