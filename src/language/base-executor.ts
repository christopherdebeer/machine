/**
 * Base Executor
 * Abstract base class containing shared functionality between executors
 */

import {
    LLMClient,
    LLMClientConfig
} from './llm-client.js';
import { BedrockClient } from './bedrock-client.js';

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
}

export interface MachineData {
    title: string;
    annotations?: Array<{
        name: string;
        value?: string;
    }>;
    nodes: Array<{
        name: string;
        type?: string;
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
}

/**
 * Abstract base executor with shared functionality
 */
export abstract class BaseExecutor {
    protected context: MachineExecutionContext;
    protected machineData: MachineData;
    protected llmClient: LLMClient;
    protected mutations: MachineMutation[] = [];

    constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
        this.machineData = machineData;
        this.context = {
            currentNode: this.machineData.nodes.length > 0 ? this.findStartNode() : '',
            errorCount: 0,
            visitedNodes: new Set(),
            attributes: new Map(),
            history: []
        };

        // Support legacy bedrock config for backwards compatibility
        if (config.bedrock && !config.llm) {
            this.llmClient = new BedrockClient(config.bedrock);
        } else if (config.llm) {
            // Temporary client, will be replaced in create()
            this.llmClient = new BedrockClient();
        } else {
            this.llmClient = new BedrockClient();
        }
    }

    /**
     * Check if strict mode is enabled via machine-level annotation
     */
    protected isStrictMode(): boolean {
        return this.machineData.annotations?.some(ann =>
            ann.name === 'strictMode' || ann.name === 'strict'
        ) ?? false;
    }

    /**
     * Check if meta mode is enabled globally via machine-level annotation
     * Can be overridden at the node level with meta: false
     */
    protected isMetaEnabled(nodeName: string): boolean {
        // Check for global @meta annotation
        const globalMeta = this.machineData.annotations?.some(ann =>
            ann.name === 'meta'
        ) ?? false;

        // Get node attributes to check for override
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (node?.attributes) {
            const metaAttr = node.attributes.find(a => a.name === 'meta');
            if (metaAttr) {
                // Node-level override exists - check its value
                const metaValue = this.extractValueFromAST(metaAttr.value);
                // Explicit false overrides global meta
                if (metaValue === 'false' || metaValue === false) {
                    return false;
                }
                // Explicit true enables meta regardless of global
                if (metaValue === 'true' || metaValue === true || metaValue === 'True') {
                    return true;
                }
            }
        }

        // If no node-level override, use global setting
        return globalMeta;
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
     */
    protected isStateNode(node: { name: string; type?: string }): boolean {
        return node.type?.toLowerCase() === 'state';
    }

    /**
     * Extract condition from edge label (when, unless, if)
     */
    protected extractEdgeCondition(edge: { label?: string; type?: string }): string | undefined {
        const edgeLabel = edge.label || edge.type || '';

        // Look for when: pattern (case-insensitive match, but preserve condition case)
        const whenMatch = edgeLabel.match(/when:\s*['"]?([^'"]+)['"]?/i);
        if (whenMatch) {
            return whenMatch[1].trim();
        }

        // Look for unless: pattern (negate it, case-insensitive match, but preserve condition case)
        const unlessMatch = edgeLabel.match(/unless:\s*['"]?([^'"]+)['"]?/i);
        if (unlessMatch) {
            return `!(${unlessMatch[1].trim()})`;
        }

        // Look for if: pattern (case-insensitive match, but preserve condition case)
        const ifMatch = edgeLabel.match(/if:\s*['"]?([^'"]+)['"]?/i);
        if (ifMatch) {
            return ifMatch[1].trim();
        }

        return undefined;
    }

    /**
     * Evaluate a condition string against current context
     */
    protected evaluateCondition(condition: string | undefined): boolean {
        if (!condition) {
            return true; // No condition means always true
        }

        try {
            // Replace template variables {{ ... }} with actual values
            let resolvedCondition = condition.replace(/\{\{\s*(\w+)\.?(\w+)?\s*\}\}/g, (match: string, nodeName: string, attrName?: string) => {
                const node = this.machineData.nodes.find(n => n.name === nodeName);
                if (!node) return 'undefined';

                if (attrName) {
                    const attr = node.attributes?.find(a => a.name === attrName);
                    if (!attr) return 'undefined';
                    return this.parseValue(attr.value, attr.type);
                }

                return 'undefined';
            });

            // Replace special variables like errorCount, activeState
            resolvedCondition = resolvedCondition
                .replace(/\berrorCount\b/g, String(this.context.errorCount))
                .replace(/\berrors\b/g, String(this.context.errorCount))
                .replace(/\bactiveState\b/g, `"${this.context.activeState || ''}"`);

            // Evaluate the condition
            // eslint-disable-next-line no-eval
            const result = eval(resolvedCondition);
            return Boolean(result);
        } catch (error) {
            console.error('Error evaluating condition:', condition, error);
            return false; // If condition evaluation fails, treat as false
        }
    }

    /**
     * Recursively extract value from Langium AST nodes
     */
    protected extractValueFromAST(value: any): any {
        // If it's not an object, return as-is
        if (!value || typeof value !== 'object') {
            return value;
        }

        // If it's a Langium AST node object
        if ('$type' in value) {
            const astNode = value as any;

            // Try to get text from CST node first (most accurate)
            if ('$cstNode' in astNode && astNode.$cstNode && 'text' in astNode.$cstNode) {
                let text = astNode.$cstNode.text;
                // Remove quotes if present
                if (typeof text === 'string') {
                    text = text.replace(/^["']|["']$/g, '');
                }
                return text;
            }

            // Try to get nested value property and recurse
            if ('value' in astNode) {
                return this.extractValueFromAST(astNode.value);
            }

            // If no value found, try stringifying but this might give [object Object]
            return String(value);
        }

        // Not an AST node, return as-is
        return value;
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
            let value = this.extractValueFromAST(attr.value);

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
     */
    protected parseValue(rawValue: string, type?: string): any {
        // Remove quotes if present
        let cleanValue = rawValue.replace(/^["']|["']$/g, '');

        if (!type) {
            // Try to auto-detect and parse
            try {
                return JSON.parse(rawValue);
            } catch {
                return cleanValue;
            }
        }

        switch (type.toLowerCase()) {
            case 'string':
                return cleanValue;
            case 'number':
                const num = Number(cleanValue);
                return isNaN(num) ? cleanValue : num;
            case 'boolean':
                return cleanValue.toLowerCase() === 'true';
            case 'array':
            case 'object':
                try {
                    return JSON.parse(rawValue);
                } catch {
                    return cleanValue;
                }
            default:
                return cleanValue;
        }
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
