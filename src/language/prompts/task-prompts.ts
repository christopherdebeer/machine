/**
 * Prompt templates for task node execution
 */

export interface TaskPromptContext {
    title?: string;
    description?: string;
    prompt?: string;
    attributes?: Record<string, any>;
}

export const DEFAULT_TASK_PROMPT = `You are a task executor that helps process workflow tasks.
Your goal is to help users accomplish their tasks effectively and provide clear outputs.

Context for this task:
Title: {{title}}
Description: {{description}}

Task Prompt: {{prompt}}

Additional Attributes:
{{#each attributes}}
- {{@key}}: {{this}}
{{/each}}

Please process this task and provide your response below:
`;

export const TASK_PROMPT_TEMPLATES = {
    default: DEFAULT_TASK_PROMPT,
    // Add more specialized templates as needed
    analysis: `You are performing an analysis task.

Title: {{title}}
Description: {{description}}

Analysis Request: {{prompt}}

Relevant Context:
{{#each attributes}}
- {{@key}}: {{this}}
{{/each}}

Please provide a detailed analysis addressing the request:
`,
    summary: `You are creating a concise summary.

Title: {{title}}
Description: {{description}}

Summary Request: {{prompt}}

Key Points to Consider:
{{#each attributes}}
- {{@key}}: {{this}}
{{/each}}

Please provide a clear and concise summary:
`
} as const;

export type TaskType = keyof typeof TASK_PROMPT_TEMPLATES;

/**
 * Compiles a prompt template with the given context
 * @param template The template string to compile
 * @param context The context data to inject into the template
 * @returns The compiled prompt string
 */
export function compilePrompt(template: string, context: TaskPromptContext): string {
    let result = template;

    // Replace simple placeholders with proper escaping
    result = result.replace(/\{\{title\}\}/g, context.title || 'Untitled Task');
    result = result.replace(/\{\{description\}\}/g, context.description || 'No description provided');
    result = result.replace(/\{\{prompt\}\}/g, context.prompt || 'No specific prompt provided');

    // Handle attributes section more carefully
    if (context.attributes && Object.keys(context.attributes).length > 0) {
        const attributesSection = Object.entries(context.attributes)
            .map(([key, value]) => {
                // Properly serialize objects and arrays as JSON
                let serializedValue: string;
                if (typeof value === 'object' && value !== null) {
                    try {
                        serializedValue = JSON.stringify(value);
                    } catch (error) {
                        // Fallback for circular references
                        serializedValue = String(value);
                    }
                } else {
                    serializedValue = String(value);
                }
                return `- ${key}: ${serializedValue}`;
            })
            .join('\n');

        // Replace the handlebars-style each block
        result = result.replace(/\{\{#each attributes\}\}[\s\S]*?\{\{\/each\}\}/g, attributesSection);
    } else {
        // Remove the attributes section if no attributes
        result = result.replace(/Additional Attributes:\s*\{\{#each attributes\}\}[\s\S]*?\{\{\/each\}\}/g, '');
        result = result.replace(/Key Points to Consider:\s*\{\{#each attributes\}\}[\s\S]*?\{\{\/each\}\}/g, '');
        result = result.replace(/Relevant Context:\s*\{\{#each attributes\}\}[\s\S]*?\{\{\/each\}\}/g, '');
    }

    return result.trim();
}
