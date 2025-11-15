/**
 * Pragmatic Code Generation for DyGram
 *
 * Simple @code annotation triggers immediate TypeScript generation.
 * Code lives alongside .dygram files, uses external references.
 * Regenerates on errors or schema mismatches.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { LLMClient } from './llm-client.js';

export interface CodeGenerationInput {
    taskName: string;
    prompt: string;
    schema?: {
        input?: any;
        output?: any;
    };
    dygramFilePath: string;
}

export interface CodeRegenerationInput extends CodeGenerationInput {
    previousCode: string;
    error?: Error;
    schemaErrors?: string[];
    failedInput?: any;
}

export interface GeneratedCode {
    code: string;
    filePath: string;
    externalRef: string;
}

/**
 * Code Generator - handles TypeScript code generation for tasks
 */
export class CodeGenerator {
    constructor(private llmClient: LLMClient) {}

    /**
     * Generate TypeScript code for a task (initial generation)
     */
    async generateCode(input: CodeGenerationInput): Promise<GeneratedCode> {
        const prompt = this.buildInitialGenerationPrompt(input);
        const code = await this.llmClient.generateCode(prompt);

        // Determine file path: <dygramfile>.<taskname>.ts
        const baseName = path.basename(input.dygramFilePath, '.dygram');
        const dirName = path.dirname(input.dygramFilePath);
        const filePath = path.join(dirName, `${baseName}.${input.taskName}.ts`);

        // Add metadata header
        const codeWithMetadata = this.addMetadataHeader(code, {
            generated: new Date().toISOString(),
            taskName: input.taskName,
            prompt: input.prompt
        });

        // Save code file
        await fs.writeFile(filePath, codeWithMetadata, 'utf-8');

        // External reference (for use in .dygram file)
        const externalRef = `#${input.taskName}`;

        console.log(`✨ Generated code: ${filePath}`);

        return {
            code: codeWithMetadata,
            filePath,
            externalRef
        };
    }

    /**
     * Regenerate code after error or schema mismatch
     */
    async regenerateCode(input: CodeRegenerationInput): Promise<GeneratedCode> {
        const prompt = this.buildRegenerationPrompt(input);
        const code = await this.llmClient.generateCode(prompt);

        // Determine file path (same as original)
        const baseName = path.basename(input.dygramFilePath, '.dygram');
        const dirName = path.dirname(input.dygramFilePath);
        const filePath = path.join(dirName, `${baseName}.${input.taskName}.ts`);

        // Add metadata header with regeneration info
        const codeWithMetadata = this.addMetadataHeader(code, {
            regenerated: new Date().toISOString(),
            taskName: input.taskName,
            reason: input.error?.message || input.schemaErrors?.join(', ') || 'Manual regeneration',
            prompt: input.prompt
        });

        // Save code file
        await fs.writeFile(filePath, codeWithMetadata, 'utf-8');

        const externalRef = `#${input.taskName}`;

        console.log(`🔄 Regenerated code: ${filePath}`);

        return {
            code: codeWithMetadata,
            filePath,
            externalRef
        };
    }

    /**
     * Build prompt for initial code generation
     */
    private buildInitialGenerationPrompt(input: CodeGenerationInput): string {
        const { taskName, prompt, schema } = input;

        let schemaSection = '';
        if (schema) {
            schemaSection = `
Input Schema:
${JSON.stringify(schema.input, null, 2)}

Output Schema:
${JSON.stringify(schema.output, null, 2)}
`;
        }

        return `Generate TypeScript code for a task.

Task name: ${taskName}
Description: ${prompt}
${schemaSection}

Generate a TypeScript module with:

1. Type interfaces matching the schemas (if provided)
2. An exported async function: execute(input): Promise<output>
3. Proper error handling
4. Defensive input validation
5. Clear, maintainable code
6. JSDoc comments

Example structure:

\`\`\`typescript
${schema ? `export interface Input {
    // Generated from input schema
}

export interface Output {
    // Generated from output schema
}
` : ''}
/**
 * ${prompt}
 */
export async function execute(input${schema?.input ? ': Input' : ': any'})${schema?.output ? ': Promise<Output>' : ': Promise<any>'} {
    // Implementation here

    return result;
}
\`\`\`

Return ONLY the TypeScript code, no markdown formatting or explanations.`;
    }

    /**
     * Build prompt for code regeneration
     */
    private buildRegenerationPrompt(input: CodeRegenerationInput): string {
        const { taskName, prompt, schema, previousCode, error, schemaErrors, failedInput } = input;

        let schemaSection = '';
        if (schema) {
            schemaSection = `
Schemas:
Input: ${JSON.stringify(schema.input, null, 2)}
Output: ${JSON.stringify(schema.output, null, 2)}
`;
        }

        let errorSection = '';
        if (error) {
            errorSection = `
Runtime error encountered:
${error.message}
${error.stack || ''}
`;
        }

        if (schemaErrors && schemaErrors.length > 0) {
            errorSection += `
Schema validation errors:
${schemaErrors.join('\n')}
`;
        }

        let inputSection = '';
        if (failedInput) {
            inputSection = `
Input that triggered the error:
${JSON.stringify(failedInput, null, 2)}
`;
        }

        return `Improve TypeScript code that encountered an error.

Task: ${taskName}
Original prompt: ${prompt}
${schemaSection}
Current code:
\`\`\`typescript
${previousCode}
\`\`\`
${errorSection}${inputSection}

Generate improved code that:
1. Fixes the identified issue
2. Maintains existing functionality
3. Handles edge cases better
4. Still matches the schemas (if provided)
5. Uses TypeScript types from schemas

Return ONLY the improved TypeScript code, no markdown formatting or explanations.`;
    }

    /**
     * Add metadata header to generated code
     */
    private addMetadataHeader(code: string, metadata: Record<string, any>): string {
        const lines = [
            '/**',
            ...Object.entries(metadata).map(([key, value]) => ` * ${key}: ${value}`),
            ' * ',
            ' * DO NOT EDIT - This file is auto-generated',
            ' * To make changes, update the prompt in the .dygram file',
            ' */'
        ];

        return lines.join('\n') + '\n\n' + code;
    }
}

/**
 * Resolve code file path from external reference
 */
export function resolveCodePath(externalRef: string, dygramFilePath: string): string {
    // #taskname → <dygramfile>.taskname.ts
    const taskName = externalRef.startsWith('#') ? externalRef.substring(1) : externalRef;
    const baseName = path.basename(dygramFilePath, '.dygram');
    const dirName = path.dirname(dygramFilePath);

    // Try <filename>.<taskname>.ts
    const codePath = path.join(dirName, `${baseName}.${taskName}.ts`);
    return codePath;
}

/**
 * Check if generated code file exists
 */
export async function hasGeneratedCode(externalRef: string, dygramFilePath: string): Promise<boolean> {
    const codePath = resolveCodePath(externalRef, dygramFilePath);
    try {
        await fs.access(codePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Load generated code
 */
export async function loadGeneratedCode(externalRef: string, dygramFilePath: string): Promise<string> {
    const codePath = resolveCodePath(externalRef, dygramFilePath);
    return await fs.readFile(codePath, 'utf-8');
}
