/**
 * Code Executor - Executes generated TypeScript code for @code tasks
 *
 * Handles:
 * - Detection of @code annotation
 * - Code generation on first execution
 * - Loading and executing generated code
 * - Schema validation
 * - Regeneration on errors
 */

import { CodeGenerator, resolveCodePath, hasGeneratedCode, loadGeneratedCode } from './code-generation.js';
import type { LLMClient } from './llm-client.js';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

// File system interface for browser compatibility
interface FileSystem {
    writeFile(path: string, content: string): Promise<void> | void;
    readFile(path: string): Promise<string> | string | undefined;
    exists(path: string): Promise<boolean> | boolean;
}

// VFS adapter for browser compatibility
class VFSAdapter implements FileSystem {
    constructor(private vfs?: { 
        writeFile(path: string, content: string): void;
        readFile(path: string): string | undefined;
        exists(path: string): boolean;
    }) {}

    writeFile(path: string, content: string): void {
        if (this.vfs) {
            this.vfs.writeFile(path, content);
        }
    }

    readFile(path: string): string | undefined {
        return this.vfs?.readFile(path);
    }

    exists(path: string): boolean {
        return this.vfs?.exists(path) ?? false;
    }
}

export interface CodeExecutionResult {
    output: any;
    usedGeneratedCode: boolean;
    error?: Error;
}

export interface TaskNode {
    name: string;
    type?: string;
    annotations?: Array<{ name: string; value?: string }>;
    attributes?: Array<{ name: string; value: any }>;
}

/**
 * Code Executor - manages execution of generated code
 */
export class CodeExecutor {
    private codeGenerator: CodeGenerator;
    private fileSystem?: FileSystem;
    private ajv: Ajv.default;
    private validatorCache: Map<string, ValidateFunction> = new Map();

    constructor(
        private llmClient: LLMClient,
        vfs?: { 
            writeFile(path: string, content: string): void;
            readFile(path: string): string | undefined;
            exists(path: string): boolean;
        }
    ) {
        this.fileSystem = vfs ? new VFSAdapter(vfs) : undefined;
        this.codeGenerator = new CodeGenerator(llmClient, this.fileSystem);
        this.ajv = new Ajv.default({ allErrors: true });
        addFormats.default(this.ajv);
    }

    /**
     * Check if task has @code annotation
     */
    hasCodeAnnotation(task: TaskNode): boolean {
        return task.annotations?.some(a => a.name === 'code') ?? false;
    }

    /**
     * Get code attribute value (external reference)
     */
    getCodeReference(task: TaskNode): string | undefined {
        const codeAttr = task.attributes?.find(a => a.name === 'code');
        if (!codeAttr || !codeAttr.value) {
            return undefined;
        }

        // Handle different value formats
        if (typeof codeAttr.value === 'string') {
            return codeAttr.value;
        }

        // Handle AST node format
        if (typeof codeAttr.value === 'object' && 'value' in codeAttr.value) {
            return String(codeAttr.value.value);
        }

        return undefined;
    }

    /**
     * Get task schema
     */
    getTaskSchema(task: TaskNode): { input?: any; output?: any } | undefined {
        const schemaAttr = task.attributes?.find(a => a.name === 'schema');
        if (!schemaAttr) {
            return undefined;
        }

        return schemaAttr.value;
    }

    /**
     * Get task prompt
     */
    getTaskPrompt(task: TaskNode): string {
        const promptAttr = task.attributes?.find(a => a.name === 'prompt');
        if (!promptAttr) {
            return `Task: ${task.name}`;
        }

        // Handle different value formats
        if (typeof promptAttr.value === 'string') {
            return promptAttr.value;
        }

        if (typeof promptAttr.value === 'object' && 'value' in promptAttr.value) {
            return String(promptAttr.value.value);
        }

        return String(promptAttr.value);
    }

    /**
     * Execute task with @code annotation support
     *
     * Flow:
     * 1. Check for @code annotation
     * 2. If has code reference, try to execute generated code
     * 3. If no code reference, generate code and fall back to LLM
     * 4. On error, regenerate code and fall back to LLM
     */
    async executeCodeTask(
        task: TaskNode,
        input: any,
        dygramFilePath: string,
        llmFallback: () => Promise<any>
    ): Promise<CodeExecutionResult> {
        // Check for @code annotation
        if (!this.hasCodeAnnotation(task)) {
            // Not a @code task, use normal LLM execution
            const output = await llmFallback();
            return { output, usedGeneratedCode: false };
        }

        const codeRef = this.getCodeReference(task);
        const schema = this.getTaskSchema(task);

        // If no code reference, generate code first
        if (!codeRef || !(await hasGeneratedCode(codeRef, dygramFilePath, this.fileSystem))) {
            console.log(`📝 Task ${task.name} has @code but no generated code yet, generating...`);

            try {
                await this.generateCodeForTask(task, dygramFilePath);
            } catch (error) {
                console.error(`Failed to generate code for ${task.name}:`, error);
                // Fall back to LLM on generation failure
                const output = await llmFallback();
                return { output, usedGeneratedCode: false };
            }

            // After generation, fall back to LLM for this execution
            // Next execution will use the generated code
            const output = await llmFallback();
            return { output, usedGeneratedCode: false };
        }

        // Try to execute generated code
        try {
            const output = await this.executeGeneratedCode(task, input, dygramFilePath, schema);
            return { output, usedGeneratedCode: true };
        } catch (error) {
            console.warn(`⚠️  Generated code failed for ${task.name}, regenerating...`, error);

            // Regenerate code
            try {
                await this.regenerateCodeForTask(task, dygramFilePath, error as Error, input);
            } catch (regenError) {
                console.error(`Failed to regenerate code for ${task.name}:`, regenError);
            }

            // Fall back to LLM
            const output = await llmFallback();
            return { output, usedGeneratedCode: false, error: error as Error };
        }
    }

    /**
     * Generate code for a task (initial generation)
     */
    private async generateCodeForTask(task: TaskNode, dygramFilePath: string): Promise<void> {
        const prompt = this.getTaskPrompt(task);
        const schema = this.getTaskSchema(task);

        const result = await this.codeGenerator.generateCode({
            taskName: task.name,
            prompt,
            schema,
            dygramFilePath
        });

        // TODO: Auto-add external reference to .dygram file
        // For now, user must manually add: code: #taskname;
        console.log(`✅ Generated code saved to: ${result.filePath}`);
        console.log(`📝 Add to .dygram file: code: ${result.externalRef};`);
    }

    /**
     * Regenerate code after error
     */
    private async regenerateCodeForTask(
        task: TaskNode,
        dygramFilePath: string,
        error: Error,
        failedInput?: any
    ): Promise<void> {
        const prompt = this.getTaskPrompt(task);
        const schema = this.getTaskSchema(task);
        const codeRef = this.getCodeReference(task);

        if (!codeRef) {
            throw new Error(`Cannot regenerate: no code reference found for ${task.name}`);
        }

        // Load previous code
        const previousCode = await loadGeneratedCode(codeRef, dygramFilePath, this.fileSystem);

        // Regenerate
        const result = await this.codeGenerator.regenerateCode({
            taskName: task.name,
            prompt,
            schema,
            dygramFilePath,
            previousCode,
            error,
            failedInput
        });

        console.log(`✅ Regenerated code saved to: ${result.filePath}`);
    }

    /**
     * Execute generated code with schema validation
     */
    private async executeGeneratedCode(
        task: TaskNode,
        input: any,
        dygramFilePath: string,
        schema?: { input?: any; output?: any }
    ): Promise<any> {
        const codeRef = this.getCodeReference(task);
        if (!codeRef) {
            throw new Error(`No code reference found for ${task.name}`);
        }

        // Validate input schema
        if (schema?.input) {
            const validation = this.validateSchema(input, schema.input, 'input');
            if (!validation.valid) {
                throw new Error(`Input schema validation failed: ${validation.errors?.join(', ')}`);
            }
        }

        // Load and execute code
        const codePath = resolveCodePath(codeRef, dygramFilePath);
        const module = await this.loadTypeScriptModule(codePath);

        if (typeof module.execute !== 'function') {
            throw new Error(`Generated code missing execute function: ${codePath}`);
        }

        // Execute
        const output = await module.execute(input);

        // Validate output schema
        if (schema?.output) {
            const validation = this.validateSchema(output, schema.output, 'output');
            if (!validation.valid) {
                throw new Error(`Output schema validation failed: ${validation.errors?.join(', ')}`);
            }
        }

        return output;
    }

    /**
     * Load TypeScript module (requires ts-node or pre-compilation)
     */
    private async loadTypeScriptModule(modulePath: string): Promise<any> {
        // For now, assume .ts files can be imported directly
        // In production, you might need:
        // 1. ts-node registration
        // 2. Pre-compilation to .js
        // 3. Dynamic compilation with TypeScript API

        try {
            // Try direct import (works with ts-node or if pre-compiled)
            const module = await import(modulePath);
            return module;
        } catch (error) {
            // If direct import fails, try with .js extension
            // (in case code was compiled)
            const jsPath = modulePath.replace(/\.ts$/, '.js');
            try {
                const module = await import(jsPath);
                return module;
            } catch (jsError) {
                throw new Error(
                    `Failed to load generated code: ${modulePath}\n` +
                    `Ensure TypeScript files can be imported (use ts-node or compile to .js)\n` +
                    `Original error: ${error}\n` +
                    `JS import error: ${jsError}`
                );
            }
        }
    }

    /**
     * Validate data against JSON schema
     */
    private validateSchema(
        data: any,
        schema: any,
        label: string
    ): { valid: boolean; errors?: string[] } {
        // Check cache
        const cacheKey = `${label}:${JSON.stringify(schema)}`;
        let validate = this.validatorCache.get(cacheKey);

        if (!validate) {
            validate = this.ajv.compile(schema);
            this.validatorCache.set(cacheKey, validate);
        }

        const valid = validate(data);

        if (!valid && validate.errors) {
            const errors = validate.errors.map(err =>
                `${err.instancePath || '/'} ${err.message}`
            );
            return { valid: false, errors };
        }

        return { valid: true };
    }
}
