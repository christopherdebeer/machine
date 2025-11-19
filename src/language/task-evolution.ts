/**
 * Task evolution system - transitions tasks from LLM to code execution
 */

import { MachineData } from './json/types.js';
import {
    GeneratedCodeModule,
    TaskExecutionContext,
    TaskExecutionResult,
    EvolutionStage,
    generateTaskCode,
    CodeGenerationOptions
} from './code-generation.js';
import { StorageBackend, PerformanceMetrics } from './storage.js';

export interface TaskEvolutionMetadata {
    stage: EvolutionStage;
    code_path?: string;
    code_version?: string;
    execution_count: number;
    success_rate: number;
    last_evolution: string;
    performance_metrics: PerformanceMetrics;
}

/**
 * Extended executor with task evolution capabilities
 */
export class EvolutionaryExecutor extends MachineExecutor {
    private codeModuleCache: Map<string, GeneratedCodeModule> = new Map();
    private taskMetrics: Map<string, TaskEvolutionMetadata> = new Map();
    private storage?: StorageBackend;

    // Evolution thresholds
    private static readonly EXECUTION_THRESHOLD = 100;
    private static readonly SUCCESS_RATE_THRESHOLD = 0.90;
    private static readonly HYBRID_CONFIDENCE_THRESHOLD = 0.8;
    private static readonly CODE_FIRST_CONFIDENCE_THRESHOLD = 0.7;

    constructor(machineData: MachineData, config: any = {}, storage?: StorageBackend) {
        super(machineData, config);
        this.storage = storage;
    }

    /**
     * Load a generated code module
     */
    private async loadCodeModule(codePath: string): Promise<GeneratedCodeModule> {
        // Check cache first
        if (this.codeModuleCache.has(codePath)) {
            return this.codeModuleCache.get(codePath)!;
        }

        // Load from storage if available
        if (this.storage) {
            const code = await this.storage.loadCode(codePath);

            if (code) {
                // For browser/testing: evaluate the code
                // In production, you might use a safer eval alternative
                const module = await this.evaluateCode(code);
                this.codeModuleCache.set(codePath, module);
                return module;
            }
        }

        throw new Error(`Code module not found: ${codePath}`);
    }

    /**
     * Safely evaluate TypeScript code to create a module
     * In production, this would use proper compilation/sandboxing
     */
    private async evaluateCode(code: string): Promise<GeneratedCodeModule> {
        try {
            // For Node.js environments or with proper build setup
            // This is a simplified version for demonstration
            // In production, you would:
            // 1. Compile TypeScript to JavaScript
            // 2. Run in a sandboxed environment (VM, Worker, etc.)
            // 3. Validate the module exports

            // Create a function that returns the module exports
            const moduleFactory = new Function('exports', code + '\nreturn exports;');
            const exports: any = {};
            const module = moduleFactory(exports);

            // Validate module structure
            if (typeof module.execute !== 'function') {
                throw new Error('Invalid module: missing execute function');
            }

            return module as GeneratedCodeModule;
        } catch (error) {
            throw new Error(`Failed to evaluate code: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Execute a task with evolution support
     */
    protected async executeTaskWithEvolution(taskName: string, attributes: Record<string, any>): Promise<TaskExecutionResult> {
        const evolutionStage = (attributes.evolution_stage || 'llm_only') as EvolutionStage;
        const startTime = Date.now();

        let result: TaskExecutionResult;

        switch (evolutionStage) {
            case 'llm_only':
                result = await this.executeLLMTask(attributes);
                break;

            case 'hybrid':
                result = await this.executeHybridTask(attributes);
                break;

            case 'code_first':
                result = await this.executeCodeFirstTask(attributes);
                break;

            case 'code_only':
                result = await this.executeCodeOnlyTask(attributes);
                break;

            default:
                result = await this.executeLLMTask(attributes);
        }

        // Update metrics
        const latency = Date.now() - startTime;
        this.updateTaskMetrics(taskName, result, latency);

        // Check if task should evolve
        await this.checkTaskEvolution(taskName);

        return result;
    }

    /**
     * Execute task using only LLM (Stage 1)
     */
    private async executeLLMTask(attributes: Record<string, any>): Promise<TaskExecutionResult> {
        // Use the existing executeTaskNode from parent class
        // This is a simplified version - in reality, we'd call the parent's method
        let output = attributes.prompt || 'LLM execution placeholder';
        
        // Ensure output is a string
        if (typeof output !== 'string') {
            if (output && typeof output === 'object') {
                // Check if it has a 'value' property (common in AST nodes)
                const objOutput = output as any;
                if ('value' in objOutput && typeof objOutput.value === 'string') {
                    output = objOutput.value;
                } else {
                    // Try to safely stringify, handling circular references
                    try {
                        output = JSON.stringify(output);
                    } catch (error) {
                        // Fallback for circular references or other stringify errors
                        output = String(output);
                    }
                }
            } else {
                output = String(output);
            }
        }

        return {
            output,
            confidence: 1.0,
            metadata: {
                execution_time_ms: 0,
                used_llm: true
            }
        };
    }

    /**
     * Execute task using generated code with LLM fallback (Stage 2)
     */
    private async executeHybridTask(attributes: Record<string, any>): Promise<TaskExecutionResult> {
        const codePath = attributes.code_path;

        if (!codePath) {
            return await this.executeLLMTask(attributes);
        }

        try {
            // Try code execution first
            const codeModule = await this.loadCodeModule(codePath);
            const context: TaskExecutionContext = {
                attributes,
                history: this.getContext().history,
                machineState: this.getMachineDefinition()
            };

            const confidence = codeModule.getConfidence
                ? codeModule.getConfidence(attributes)
                : 1.0;

            // Use code if confidence is high enough
            if (confidence >= EvolutionaryExecutor.HYBRID_CONFIDENCE_THRESHOLD) {
                const result = await codeModule.execute(attributes, context);
                return {
                    ...result,
                    metadata: {
                        ...result.metadata,
                        used_llm: false
                    }
                };
            }
        } catch (error) {
            console.warn(`Code execution failed, falling back to LLM:`, error);
        }

        // Fallback to LLM
        return await this.executeLLMTask(attributes);
    }

    /**
     * Execute task using code first, LLM on low confidence (Stage 3)
     */
    private async executeCodeFirstTask(attributes: Record<string, any>): Promise<TaskExecutionResult> {
        const codePath = attributes.code_path;
        const llmThreshold = parseFloat(attributes.llm_threshold || String(EvolutionaryExecutor.CODE_FIRST_CONFIDENCE_THRESHOLD));

        if (!codePath) {
            return await this.executeLLMTask(attributes);
        }

        try {
            const codeModule = await this.loadCodeModule(codePath);
            const context: TaskExecutionContext = {
                attributes,
                history: this.getContext().history,
                machineState: this.getMachineDefinition()
            };

            const result = await codeModule.execute(attributes, context);

            // If confidence is below threshold, use LLM to improve
            if (result.confidence < llmThreshold) {
                const llmResult = await this.executeLLMTask(attributes);
                return {
                    ...llmResult,
                    metadata: {
                        ...llmResult.metadata
                    }
                };
            }

            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    used_llm: false
                }
            };
        } catch (error) {
            console.error('Code execution failed:', error);
            return await this.executeLLMTask(attributes);
        }
    }

    /**
     * Execute task using only generated code (Stage 4)
     */
    private async executeCodeOnlyTask(attributes: Record<string, any>): Promise<TaskExecutionResult> {
        const codePath = attributes.code_path;

        if (!codePath) {
            throw new Error('Code path required for code_only execution');
        }

        const codeModule = await this.loadCodeModule(codePath);
        const context: TaskExecutionContext = {
            attributes,
            history: this.getContext().history,
            machineState: this.getMachineDefinition()
        };

        return await codeModule.execute(attributes, context);
    }

    /**
     * Update task performance metrics
     */
    private updateTaskMetrics(
        taskName: string,
        result: TaskExecutionResult,
        latency: number
    ): void {
        let metrics = this.taskMetrics.get(taskName);

        if (!metrics) {
            metrics = {
                stage: 'llm_only',
                execution_count: 0,
                success_rate: 1.0,
                last_evolution: new Date().toISOString(),
                performance_metrics: {
                    avg_execution_time_ms: 0,
                    success_rate: 1.0,
                    execution_count: 0,
                    cost_per_execution: 0
                }
            };
        }

        // Update metrics
        metrics.execution_count++;
        const alpha = 0.1; // Exponential moving average factor
        metrics.performance_metrics.avg_execution_time_ms =
            alpha * latency + (1 - alpha) * metrics.performance_metrics.avg_execution_time_ms;

        // Update success rate based on confidence
        const success = result.confidence > 0.5 ? 1 : 0;
        metrics.success_rate = alpha * success + (1 - alpha) * metrics.success_rate;
        metrics.performance_metrics.success_rate = metrics.success_rate;
        metrics.performance_metrics.execution_count = metrics.execution_count;

        this.taskMetrics.set(taskName, metrics);
    }

    /**
     * Check if task should evolve to next stage
     */
    private async checkTaskEvolution(taskName: string): Promise<void> {
        const node = this.getMachineDefinition().nodes.find(n => n.name === taskName);
        if (!node) return;

        const metrics = this.taskMetrics.get(taskName);
        if (!metrics) return;

        const attributes = node.attributes?.reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {} as Record<string, string>) || {};

        const currentStage = (attributes.evolution_stage || 'llm_only') as EvolutionStage;

        // Determine if evolution should happen
        if (
            metrics.execution_count >= EvolutionaryExecutor.EXECUTION_THRESHOLD &&
            metrics.success_rate >= EvolutionaryExecutor.SUCCESS_RATE_THRESHOLD
        ) {
            const nextStage = this.getNextEvolutionStage(currentStage);

            if (nextStage !== currentStage) {
                await this.evolveTask(taskName, nextStage);
            }
        }
    }

    /**
     * Get the next evolution stage
     */
    private getNextEvolutionStage(current: EvolutionStage): EvolutionStage {
        const progression: EvolutionStage[] = ['llm_only', 'hybrid', 'code_first', 'code_only'];
        const currentIndex = progression.indexOf(current);

        if (currentIndex === -1 || currentIndex === progression.length - 1) {
            return current;
        }

        return progression[currentIndex + 1];
    }

    /**
     * Evolve a task to the next stage (generate code using LLM)
     */
    private async evolveTask(taskName: string, nextStage: EvolutionStage): Promise<void> {
        const node = this.getMachineDefinition().nodes.find(n => n.name === taskName);
        if (!node) return;

        const attributes = node.attributes?.reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {} as Record<string, string>) || {};

        // Get or create metrics for the task
        let metrics = this.taskMetrics.get(taskName);
        if (!metrics) {
            metrics = {
                stage: 'llm_only',
                execution_count: 0,
                success_rate: 1.0,
                last_evolution: new Date().toISOString(),
                performance_metrics: {
                    avg_execution_time_ms: 0,
                    success_rate: 1.0,
                    execution_count: 0,
                    cost_per_execution: 0
                }
            };
            this.taskMetrics.set(taskName, metrics);
        }

        // Generate code based on execution history
        const options: CodeGenerationOptions = {
            taskName,
            prompt: attributes.prompt || '',
            attributes,
            executionHistory: this.getContext().history.filter(h => h.from === taskName).slice(-10),
            evolutionStage: nextStage
        };

        // Generate the code
        const generatedCode = generateTaskCode(options);

        // Save the code
        const codePath = `generated/${taskName}_${nextStage}_v${Date.now()}.ts`;

        if (this.storage) {
            await this.storage.saveCode(codePath, generatedCode);
        }

        // Update node attributes
        this.modifyNode(taskName, {
            evolution_stage: nextStage,
            code_path: codePath,
            code_version: `v${Date.now()}`
        });

        // Record mutation
        this.recordMutation({
            type: 'task_evolution' as any,
            timestamp: new Date().toISOString(),
            data: {
                task: taskName,
                from_stage: attributes.evolution_stage || 'llm_only',
                to_stage: nextStage,
                code_path: codePath,
                generated_code: generatedCode
            }
        });

        console.log(`Task ${taskName} evolved from ${attributes.evolution_stage || 'llm_only'} to ${nextStage}`);
    }

    /**
     * Get task metrics
     */
    public getTaskMetrics(): Map<string, TaskEvolutionMetadata> {
        return new Map(this.taskMetrics);
    }

    /**
     * Manually trigger task evolution
     */
    public async triggerEvolution(taskName: string): Promise<void> {
        const node = this.getMachineDefinition().nodes.find(n => n.name === taskName);
        if (!node) {
            throw new Error(`Task ${taskName} not found`);
        }

        const attributes = node.attributes?.reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
        }, {} as Record<string, string>) || {};

        const currentStage = (attributes.evolution_stage || 'llm_only') as EvolutionStage;
        const nextStage = this.getNextEvolutionStage(currentStage);

        if (nextStage === currentStage) {
            throw new Error(`Task ${taskName} is already at final evolution stage`);
        }

        await this.evolveTask(taskName, nextStage);
    }
}
