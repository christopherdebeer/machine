/**
 * Pragmatic Code Generation for DyGram
 *
 * Simple @code annotation triggers immediate TypeScript generation.
 * Code lives alongside .dygram files, uses external references.
 * Regenerates on errors or schema mismatches.
 */

import type { LLMClient } from './llm-client.js';

// Browser-compatible path utilities
const pathUtils = {
    basename(path: string, ext?: string): string {
        const name = path.split('/').pop() || '';
        if (ext && name.endsWith(ext)) {
            return name.slice(0, -ext.length);
        }
        return name;
    },
    
    dirname(path: string): string {
        const parts = path.split('/');
        parts.pop();
        return parts.join('/') || '/';
    },
    
    join(...parts: string[]): string {
        return parts
            .filter(part => part.length > 0)
            .join('/')
            .replace(/\/+/g, '/');
    }
};

// File system interface for browser compatibility
interface FileSystem {
    writeFile(path: string, content: string): Promise<void> | void;
    readFile(path: string): Promise<string> | string | undefined;
    exists(path: string): Promise<boolean> | boolean;
}

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
    constructor(
        private llmClient: LLMClient,
        private fileSystem?: FileSystem
    ) {}

    /**
     * Generate TypeScript code for a task (initial generation)
     */
    async generateCode(input: CodeGenerationInput): Promise<GeneratedCode> {
        const prompt = this.buildInitialGenerationPrompt(input);
        const code = await this.llmClient.invokeModel(prompt);

        // Determine file path: <dygramfile>.<taskname>.ts
        const baseName = pathUtils.basename(input.dygramFilePath, '.dygram');
        const dirName = pathUtils.dirname(input.dygramFilePath);
        const filePath = pathUtils.join(dirName, `${baseName}.${input.taskName}.ts`);

        // Add metadata header
        const codeWithMetadata = this.addMetadataHeader(code, {
            generated: new Date().toISOString(),
            taskName: input.taskName,
            prompt: input.prompt
        });

        // Save code file (use VFS if available, otherwise skip file writing in browser)
        if (this.fileSystem) {
            await this.fileSystem.writeFile(filePath, codeWithMetadata);
        } else {
            console.log(`📝 Generated code (not saved - no file system): ${filePath}`);
        }

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
        const code = await this.llmClient.invokeModel(prompt);

        // Determine file path (same as original)
        const baseName = pathUtils.basename(input.dygramFilePath, '.dygram');
        const dirName = pathUtils.dirname(input.dygramFilePath);
        const filePath = pathUtils.join(dirName, `${baseName}.${input.taskName}.ts`);

        // Add metadata header with regeneration info
        const codeWithMetadata = this.addMetadataHeader(code, {
            regenerated: new Date().toISOString(),
            taskName: input.taskName,
            reason: input.error?.message || input.schemaErrors?.join(', ') || 'Manual regeneration',
            prompt: input.prompt
        });

        // Save code file (use VFS if available, otherwise skip file writing in browser)
        if (this.fileSystem) {
            await this.fileSystem.writeFile(filePath, codeWithMetadata);
        } else {
            console.log(`📝 Regenerated code (not saved - no file system): ${filePath}`);
        }

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
    const baseName = pathUtils.basename(dygramFilePath, '.dygram');
    const dirName = pathUtils.dirname(dygramFilePath);

    // Try <filename>.<taskname>.ts
    const codePath = pathUtils.join(dirName, `${baseName}.${taskName}.ts`);
    return codePath;
}

/**
 * Check if generated code file exists
 */
export async function hasGeneratedCode(
    externalRef: string, 
    dygramFilePath: string, 
    fileSystem?: FileSystem
): Promise<boolean> {
    if (!fileSystem) {
        // In browser without file system, assume code doesn't exist
        return false;
    }
    
    const codePath = resolveCodePath(externalRef, dygramFilePath);
    try {
        const exists = await fileSystem.exists(codePath);
        return Boolean(exists);
    } catch {
        return false;
    }
}

/**
 * Load generated code
 */
export async function loadGeneratedCode(
    externalRef: string, 
    dygramFilePath: string, 
    fileSystem?: FileSystem
): Promise<string> {
    if (!fileSystem) {
        throw new Error('No file system available to load generated code');
    }
    
    const codePath = resolveCodePath(externalRef, dygramFilePath);
    const content = await fileSystem.readFile(codePath);
    
    if (typeof content === 'string') {
        return content;
    } else if (content === undefined) {
        throw new Error(`Generated code file not found: ${codePath}`);
    } else {
        return content;
    }
}
