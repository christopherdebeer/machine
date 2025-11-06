/**
 * Prompt templates for task node execution
 */

import { CelEvaluator, CelEvaluationContext } from '../cel-evaluator.js';

export interface TaskPromptContext {
    title?: string;
    description?: string;
    prompt?: string;
    attributes?: Record<string, any>;
    // CEL evaluation context for advanced template resolution
    celContext?: CelEvaluationContext;
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

    // If CEL context is provided, use CEL for template resolution
    if (context.celContext) {
        const celEvaluator = new CelEvaluator();

        // Create a combined context for CEL evaluation
        const celContext: CelEvaluationContext = {
            errorCount: context.celContext.errorCount,
            activeState: context.celContext.activeState,
            attributes: {
                ...context.celContext.attributes,
                // Add prompt context as well
                title: context.title || 'Untitled Task',
                description: context.description || 'No description provided',
                prompt: context.prompt || 'No specific prompt provided',
                ...(context.attributes || {})
            }
        };

        // First pass: Handle handlebars-style {{#each}} blocks before CEL resolution
        result = handleHandlebarsBlocks(result, context);

        // Second pass: Use CEL to resolve all {{ }} template variables
        result = celEvaluator.resolveTemplate(result, celContext);
    } else {
        // Fallback to simple string replacement for backward compatibility
        result = result.replace(/\{\{title\}\}/g, context.title || 'Untitled Task');
        result = result.replace(/\{\{description\}\}/g, context.description || 'No description provided');
        result = result.replace(/\{\{prompt\}\}/g, context.prompt || 'No specific prompt provided');

        // Handle attributes section
        result = handleHandlebarsBlocks(result, context);
    }

    return result.trim();
}

/**
 * Handle handlebars-style {{#each}} blocks
 * This is separate from CEL template resolution as CEL doesn't support block helpers
 */
function handleHandlebarsBlocks(template: string, context: TaskPromptContext): string {
    let result = template;

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

    return result;
}
