/**
 * TypeScript code generation for evolved tasks
 */

import { MachineData } from './machine-executor.js';

export interface GeneratedCodeModule {
    execute(input: any, context: TaskExecutionContext): Promise<TaskExecutionResult>;
    getConfidence?(input: any): number;
}

export interface TaskExecutionContext {
    attributes: Record<string, any>;
    history: Array<any>;
    machineState: MachineData;
}

export interface TaskExecutionResult {
    output: any;
    confidence: number;
    metadata: {
        execution_time_ms: number;
        code_version?: string;
        used_llm: boolean;
    };
}

export interface CodeGenerationOptions {
    taskName: string;
    prompt: string;
    attributes: Record<string, any>;
    executionHistory: Array<any>;
    evolutionStage: EvolutionStage;
}

export type EvolutionStage = 'llm_only' | 'hybrid' | 'code_first' | 'code_only';

/**
 * Generate TypeScript code for a task based on its execution history
 */
export function generateTaskCode(options: CodeGenerationOptions): string {
    const { taskName, prompt, attributes, executionHistory, evolutionStage } = options;

    // Analyze execution history to extract patterns
    const patterns = analyzeExecutionPatterns(executionHistory);

    // Generate TypeScript code
    const code = `/**
 * Generated code for ${taskName}
 * Evolution stage: ${evolutionStage}
 * Generated at: ${new Date().toISOString()}
 */

${generateTypeDefinitions(attributes)}

${generateConfidenceFunction(patterns, evolutionStage)}

export async function execute(
    input: any,
    context: TaskExecutionContext
): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    try {
        ${generateExecutionLogic(patterns, prompt, attributes)}

        const confidence = getConfidence(input);

        return {
            output: result,
            confidence: confidence,
            metadata: {
                execution_time_ms: Date.now() - startTime,
                code_version: 'v${Date.now()}',
                used_llm: false
            }
        };
    } catch (error) {
        // On error, return low confidence to trigger LLM fallback
        return {
            output: null,
            confidence: 0.0,
            metadata: {
                execution_time_ms: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error),
                used_llm: false
            }
        };
    }
}

export default { execute, getConfidence };
`;

    return code;
}

/**
 * Analyze execution history to extract common patterns
 */
function analyzeExecutionPatterns(history: Array<any>): any {
    if (!history || history.length === 0) {
        return {
            inputPatterns: [],
            outputPatterns: [],
            commonLogic: ''
        };
    }

    // Simple pattern analysis
    // In a real implementation, this would use ML or more sophisticated analysis
    return {
        inputPatterns: ['string', 'object'],
        outputPatterns: ['string'],
        commonLogic: 'Basic text processing'
    };
}

/**
 * Generate TypeScript type definitions based on attributes
 */
function generateTypeDefinitions(attributes: Record<string, any>): string {
    return `interface TaskExecutionContext {
    attributes: Record<string, any>;
    history: Array<any>;
    machineState: any;
}

interface TaskExecutionResult {
    output: any;
    confidence: number;
    metadata: {
        execution_time_ms: number;
        code_version?: string;
        used_llm: boolean;
        error?: string;
    };
}`;
}

/**
 * Generate confidence calculation function
 */
function generateConfidenceFunction(patterns: any, stage: EvolutionStage): string {
    const baseConfidence = stage === 'hybrid' ? 0.8 : stage === 'code_first' ? 0.9 : 1.0;

    return `export function getConfidence(input: any): number {
    // Heuristic-based confidence calculation
    if (!input) return 0.0;

    // Higher confidence for known patterns
    const hasExpectedStructure = typeof input === 'object' || typeof input === 'string';
    if (!hasExpectedStructure) return 0.5;

    return ${baseConfidence};
}`;
}

/**
 * Generate execution logic based on patterns
 */
function generateExecutionLogic(patterns: any, prompt: string, attributes: Record<string, any>): string {
    return `        // Extract input data
        const inputData = input.content || input.text || input;

        // Process based on learned patterns
        // This is a simplified implementation - in production,
        // this would be generated based on actual execution patterns
        let result: any;

        if (typeof inputData === 'string') {
            // Simple string processing
            result = inputData.trim();

            // Apply any transformations based on attributes
            ${Object.entries(attributes).map(([key, value]) => {
                if (key !== 'prompt' && key !== 'meta') {
                    return `// Consider attribute: ${key} = ${value}`;
                }
                return '';
            }).filter(Boolean).join('\n            ')}
        } else {
            result = inputData;
        }`;
}

/**
 * Generate LLM prompt for code generation
 */
export function generateCodeGenerationPrompt(options: CodeGenerationOptions): string {
    const { taskName, prompt, executionHistory } = options;

    const historySnippet = executionHistory
        .slice(-10)
        .map((h, i) => `${i + 1}. ${JSON.stringify(h, null, 2)}`)
        .join('\n\n');

    return `You are generating optimized TypeScript code to replace an LLM task.

Task: ${taskName}
Original prompt: ${prompt}

Based on ${executionHistory.length} executions, the most recent being:

${historySnippet}

Generate a TypeScript module that implements this task efficiently.

Requirements:
- Export a default object with execute() and getConfidence() functions
- execute(input, context) should process the input and return a TaskExecutionResult
- getConfidence(input) should return a confidence score between 0 and 1
- Handle errors gracefully by returning confidence 0.0
- Be type-safe and follow TypeScript best practices

Return ONLY the TypeScript code, no markdown formatting or explanations.`;
}
