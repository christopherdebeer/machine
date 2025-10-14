/**
 * Base Executor
 * Abstract base class containing shared functionality between executors
 */

import {
    LLMClientConfig
} from './llm-client.js';
import { ClaudeClient } from './claude-client.js';
import { extractValueFromAST, parseAttributeValue, serializeValue, validateValueType } from './utils/ast-helpers.js';
import { NodeTypeChecker } from './node-type-checker.js';
import { EdgeConditionParser } from './utils/edge-conditions.js';
import { CelEvaluator } from './cel-evaluator.js';

// Shared interfaces
export interface MachineExecutionContext {
    currentNode: string;
    currentTaskNode?: string;
    activeState?: string;
    errorCount: number;
    visitedNodes: Set<string>;
    attributes: Map<string, any>;
    history: Array<{
        from: string;
        to: string;
        transition: string;
        timestamp: string;
        output?: string;
    }>;
    // Invocation tracking for cycle detection and max step limits per node
    nodeInvocationCounts: Map<string, number>;
    // State transition tracking for detecting cycles
    stateTransitions: Array<{ state: string; timestamp: string }>;
}

export interface MachineData {
    title: string;
    nodes: Array<{
        name: string;
        type?: string;
        parent?: string; // Name of parent node for hierarchy tracking (optional)
        attributes?: Array<{
            name: string;
            type: string;
            value: string;
        }>;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type?: string;
        label?: string;
    }>;
}

export interface ExecutionLimits {
    maxSteps?: number;              // Maximum total steps (default: 1000)
    maxNodeInvocations?: number;    // Maximum invocations per node (default: 100)
    timeout?: number;               // Maximum execution time in milliseconds (default: 5 minutes)
    cycleDetectionWindow?: number;  // Number of recent transitions to check for cycles (default: 20)
}

export interface MachineMutation {
    type: 'add_node' | 'add_edge' | 'modify_node' | 'remove_node';
    timestamp: string;
    data: any;
}

export interface MachineExecutorConfig {
    llm?: LLMClientConfig;
    // Deprecated: use llm config instead
    bedrock?: {
        region?: string;
        modelId?: string;
    };
    // Agent SDK configuration (for RailsExecutor)
    agentSDK?: any;
    // Execution limits for safety and cycle detection
    limits?: ExecutionLimits;
}

/**
 * Abstract base executor with shared functionality
 */
export abstract class BaseExecutor {
    protected context: MachineExecutionContext;
    protected machineData: MachineData;
    protected llmClient: ClaudeClient;
    protected mutations: MachineMutation[] = [];
    protected limits: Required<ExecutionLimits>;
    protected executionStartTime?: number;
    protected celEvaluator: CelEvaluator;

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        this.machineData = machineData;

        // Initialize CEL evaluator
        this.celEvaluator = new CelEvaluator();

        // Initialize execution limits with defaults
        this.limits = {
            maxSteps: config.limits?.maxSteps ?? 1000,
            maxNodeInvocations: config.limits?.maxNodeInvocations ?? 100,
            timeout: config.limits?.timeout ?? 5 * 60 * 1000, // 5 minutes
            cycleDetectionWindow: config.limits?.cycleDetectionWindow ?? 20
        };

        this.context = {
            currentNode: this.machineData.nodes.length > 0 ? this.findStartNode() : '',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: [],
            nodeInvocationCounts: new Map(),
            stateTransitions: []
        };

        // Support legacy bedrock config for backwards compatibility
        if (config.bedrock && !config.llm) {
            this.llmClient = new ClaudeClient({
                transport: 'bedrock',
                region: config.bedrock.region,
                modelId: config.bedrock.modelId
            });
        } else if (config.llm) {
            // Temporary client, will be replaced in create()
            this.llmClient = new ClaudeClient({
                transport: config.llm.provider === 'bedrock' ? 'bedrock' : 'api',
                apiKey: config.llm.provider === 'anthropic' ? config.llm.apiKey : undefined,
                region: config.llm.provider === 'bedrock' ? config.llm.region : undefined,
                modelId: config.llm.modelId
            });
        } else {
            this.llmClient = new ClaudeClient({ transport: 'bedrock' });
        }
    }

    /**
     * Find the start node of the machine
     * By convention, looks for a node named "start" or the first node if none found
     */
    protected findStartNode(): string {
        const startNode = this.machineData.nodes.find(node => node.name.toLowerCase() === 'start');
        if (startNode) {
            return startNode.name;
        }
        if (this.machineData.nodes.length === 0) {
            throw new Error('Machine has no nodes');
        }
        return this.machineData.nodes[0].name;
    }

    /**
     * Check if a node is a state node
     * @deprecated Use NodeTypeChecker.isState() instead
     */
    protected isStateNode(node: { name: string; type?: string }): boolean {
        return NodeTypeChecker.isState(node);
    }

    /**
     * Extract condition from edge label (when, unless, if)
     * @deprecated Use EdgeConditionParser.extract() directly for new code
     */
    protected extractEdgeCondition(edge: { label?: string; type?: string }): string | undefined {
        return EdgeConditionParser.extract(edge);
    }

    /**
     * Evaluate a condition string against current context
     * Uses CEL (Common Expression Language) for safe, sandboxed evaluation
     */
    protected evaluateCondition(condition: string | undefined): boolean {
        if (!condition) {
            return true; // No condition means always true
        }

        try {
            // Build context with all node attributes as nested objects
            const attributes = this.buildAttributeContext();

            // Replace template variables with CEL-compatible syntax
            // {{ nodeName.attributeName }} -> nodeName.attributeName
            let celCondition = condition.replace(/\{\{\s*(\w+)\.(\w+)\s*\}\}/g, '$1.$2');

            // Convert JavaScript operators to CEL equivalents
            // CEL uses == and != (not === and !==)
            celCondition = celCondition.replace(/===/g, '==').replace(/!==/g, '!=');

            // Use CEL evaluator for safe evaluation
            return this.celEvaluator.evaluateCondition(celCondition, {
                errorCount: this.context.errorCount,
                activeState: this.context.activeState || '',
                attributes: attributes
            });
        } catch (error) {
            console.error('Error evaluating condition:', condition, error);
            return false; // If condition evaluation fails, treat as false
        }
    }

    /**
     * Build a context object with all nodes' attributes for CEL evaluation
     * Creates nested structure: { nodeName: { attributeName: value, ... }, ... }
     */
    protected buildAttributeContext(): Record<string, any> {
        const attributes: Record<string, any> = {};

        // Build nested structure for all nodes
        for (const node of this.machineData.nodes) {
            if (node.attributes && node.attributes.length > 0) {
                attributes[node.name] = {};
                for (const attr of node.attributes) {
                    attributes[node.name][attr.name] = this.parseValue(attr.value, attr.type);
                }
            }
        }

        return attributes;
    }

    /**
     * Resolve template variables in a string using CEL
     * Replaces {{ nodeName.attributeName }} with actual values
     * @param template - String containing template variables
     * @returns Resolved string with template variables replaced
     */
    protected resolveTemplateVariables(template: string): string {
        // Build context with all node attributes
        const attributes = this.buildAttributeContext();

        // Use CEL evaluator to resolve template variables
        return this.celEvaluator.resolveTemplate(template, {
            errorCount: this.context.errorCount,
            activeState: this.context.activeState || '',
            attributes: attributes
        });
    }


    /**
     * Get node attributes as a key-value object
     */
    protected getNodeAttributes(nodeName: string): Record<string, any> {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node?.attributes) {
            return {};
        }

        return node.attributes.reduce((acc, attr) => {
            // Handle the case where attr.value might be an object (from JSON parsing or AST)
            let value = extractValueFromAST(attr.value);

            // If the value is a string that looks like JSON, try to parse it
            if (typeof value === 'string') {
                try {
                    // Check if it looks like JSON (starts with { or [)
                    if ((value.startsWith('{') && value.endsWith('}')) ||
                        (value.startsWith('[') && value.endsWith(']'))) {
                        value = JSON.parse(value);
                    }
                } catch (error) {
                    // If parsing fails, keep the original string value
                }
            }

            acc[attr.name] = value;
            return acc;
        }, {} as Record<string, any>);
    }

    /**
     * Parse a stored value back to its original type
     * @deprecated Use parseAttributeValue from utils/ast-helpers.js instead
     */
    protected parseValue(rawValue: string, type?: string): any {
        if (!type) {
            // Try to auto-detect and parse
            const cleanValue = rawValue.replace(/^["']|["']$/g, '');
            try {
                return JSON.parse(rawValue);
            } catch {
                return cleanValue;
            }
        }

        // Strip quotes before parsing typed values
        const cleanValue = rawValue.replace(/^["']|["']$/g, '');
        return parseAttributeValue(cleanValue, type);
    }

    /**
     * Validate if a value matches the expected type
     * @deprecated Use validateValueType from utils/ast-helpers.js instead
     */
    protected validateValueType(value: any, expectedType: string): boolean {
        return validateValueType(value, expectedType);
    }

    /**
     * Serialize a value for storage in machine data
     * @deprecated Use serializeValue from utils/ast-helpers.js instead
     */
    protected serializeValue(value: any): string {
        return serializeValue(value);
    }

    /**
     * Record a mutation for versioning
     */
    protected recordMutation(mutation: MachineMutation | Omit<MachineMutation, 'timestamp'>): void {
        const fullMutation: MachineMutation = 'timestamp' in mutation
            ? mutation
            : { ...mutation, timestamp: new Date().toISOString() };
        this.mutations.push(fullMutation);
    }

    /**
     * Track node invocation and check if limit exceeded
     */
    protected trackNodeInvocation(nodeName: string): void {
        const currentCount = this.context.nodeInvocationCounts.get(nodeName) || 0;
        this.context.nodeInvocationCounts.set(nodeName, currentCount + 1);

        // Check node-specific max invocation attribute
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (node?.attributes) {
            const maxStepsAttr = node.attributes.find(a => a.name === 'maxSteps' || a.name === 'maxInvocations');
            if (maxStepsAttr) {
                const nodeMaxSteps = parseInt(maxStepsAttr.value);
                if (!isNaN(nodeMaxSteps) && currentCount + 1 > nodeMaxSteps) {
                    throw new Error(
                        `Node '${nodeName}' exceeded maximum invocation limit (${nodeMaxSteps}). ` +
                        `This may indicate an infinite loop. Current invocations: ${currentCount + 1}`
                    );
                }
            }
        }

        // Check global node invocation limit
        if (currentCount + 1 > this.limits.maxNodeInvocations) {
            throw new Error(
                `Node '${nodeName}' exceeded maximum invocation limit (${this.limits.maxNodeInvocations}). ` +
                `This may indicate an infinite loop. Current invocations: ${currentCount + 1}`
            );
        }
    }

    /**
     * Track state transition for cycle detection
     */
    protected trackStateTransition(nodeName: string): void {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (node && NodeTypeChecker.isState(node)) {
            this.context.stateTransitions.push({
                state: nodeName,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Detect if we're in a cycle by checking recent state transitions
     */
    protected detectCycle(): boolean {
        const recentTransitions = this.context.stateTransitions.slice(-this.limits.cycleDetectionWindow);

        if (recentTransitions.length < 3) {
            return false; // Need at least 3 transitions to detect a cycle
        }

        // Check for repeating patterns in state transitions
        const stateSequence = recentTransitions.map(t => t.state).join('->');

        // Look for repeated subsequences
        for (let patternLength = 2; patternLength <= Math.floor(recentTransitions.length / 2); patternLength++) {
            const pattern = recentTransitions.slice(-patternLength).map(t => t.state).join('->');
            const prevPattern = recentTransitions.slice(-patternLength * 2, -patternLength).map(t => t.state).join('->');

            if (pattern === prevPattern && pattern.length > 0) {
                console.warn(
                    `⚠️ Cycle detected: Pattern '${pattern}' repeated. ` +
                    `Recent transitions: ${stateSequence}`
                );
                return true;
            }
        }

        return false;
    }

    /**
     * Check if execution timeout has been exceeded
     */
    protected checkTimeout(): void {
        if (!this.executionStartTime) return;

        const elapsed = Date.now() - this.executionStartTime;
        if (elapsed > this.limits.timeout) {
            throw new Error(
                `Execution timeout exceeded (${this.limits.timeout}ms). ` +
                `Elapsed time: ${elapsed}ms. This may indicate an infinite loop or very long execution.`
            );
        }
    }

    /**
     * Get all mutations applied during this execution
     */
    public getMutations(): MachineMutation[] {
        return [...this.mutations];
    }

    /**
     * Get the current execution context
     */
    public getContext(): MachineExecutionContext {
        return this.context;
    }

    /**
     * Get the current machine definition as JSON
     */
    public getMachineDefinition(): MachineData {
        return JSON.parse(JSON.stringify(this.machineData)); // Deep clone
    }

    /**
     * Serialize the current machine back to .mach DSL
     */
    public toMachineDefinition(): string {
        const lines: string[] = [];

        // Title
        lines.push(`machine "${this.machineData.title}"\n`);

        // Nodes
        this.machineData.nodes.forEach(node => {
            const type = node.type ? `${node.type} ` : '';
            const attrs = node.attributes || [];

            if (attrs.length === 0) {
                lines.push(`${type}${node.name};`);
            } else {
                lines.push(`${type}${node.name} {`);
                attrs.forEach(attr => {
                    const value = typeof attr.value === 'string' && !attr.value.match(/^[0-9]+$/)
                        ? `"${attr.value}"`
                        : attr.value;
                    lines.push(`    ${attr.name}: ${value};`);
                });
                lines.push(`};`);
            }
        });

        lines.push('');

        // Edges
        this.machineData.edges.forEach(edge => {
            const label = edge.type ? `-${edge.type}-` : '-';
            lines.push(`${edge.source} ${label}> ${edge.target};`);
        });

        return lines.join('\n');
    }

    /**
     * Abstract methods that subclasses must implement
     */
    abstract step(): Promise<boolean>;
    abstract execute(): Promise<any>;
}
