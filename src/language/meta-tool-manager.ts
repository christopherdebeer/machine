/**
 * Meta-Tool Manager - Phase 3: Dynamic Tool Construction
 *
 * Enables:
 * - Dynamic tool construction (agent-backed, code-generation, composition)
 * - Tool registry for in-code and dynamically created tools
 * - Tool review and improvement proposals
 * - Persistence of tool definitions
 */

import type { ToolDefinition } from './llm-client.js';
import type { MachineMutation, MachineData } from './rails-executor.js';

/**
 * Dynamic tool with handler
 */
export interface DynamicTool {
    definition: ToolDefinition;
    handler: (input: any) => Promise<any>;
    created: string;
    strategy: 'agent_backed' | 'code_generation' | 'composition';
    implementation?: string;
}

/**
 * Tool improvement proposal
 */
export interface ToolImprovementProposal {
    toolName: string;
    rationale: string;
    proposedChanges: string;
    timestamp: string;
}

/**
 * Meta-Tool Manager
 */
export class MetaToolManager {
    private dynamicTools = new Map<string, DynamicTool>();
    private proposals: ToolImprovementProposal[] = [];
    private onMachineUpdate?: (dsl: string, machineData: MachineData) => void;

    constructor(
        private _machineData: MachineData,
        private onMutation: (mutation: Omit<MachineMutation, 'timestamp'>) => void
    ) {}

    /**
     * Set callback for when machine definition is updated
     */
    setMachineUpdateCallback(callback: (dsl: string, machineData: MachineData) => void): void {
        this.onMachineUpdate = callback;
    }

    /**
     * Register meta-tools for agent use
     */
    getMetaTools(): ToolDefinition[] {
        return [
            {
                name: 'get_machine_definition',
                description: 'Get the current machine definition in both JSON and DSL format. Use this to understand the machine structure before making modifications.',
                input_schema: {
                    type: 'object',
                    properties: {
                        format: {
                            type: 'string',
                            enum: ['json', 'dsl', 'both'],
                            description: 'Format to return: json (structured), dsl (DyGram source), or both'
                        }
                    }
                }
            },
            {
                name: 'update_definition',
                description: 'Update the machine definition with a new structure. Accepts JSON format and automatically converts to DSL. Use get_machine_definition first to see current structure.',
                input_schema: {
                    type: 'object',
                    properties: {
                        machine: {
                            type: 'object',
                            description: 'Complete machine definition in JSON format with title, nodes, and edges'
                        },
                        reason: {
                            type: 'string',
                            description: 'Brief explanation of why the machine is being modified'
                        }
                    },
                    required: ['machine', 'reason']
                }
            },
            {
                name: 'construct_tool',
                description: 'Construct a new tool dynamically when one doesn\'t exist in code. Use this when you need a capability that isn\'t available.',
                input_schema: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Tool name (snake_case, descriptive)'
                        },
                        description: {
                            type: 'string',
                            description: 'Clear description of what the tool does'
                        },
                        input_schema: {
                            type: 'object',
                            description: 'JSON Schema defining the tool\'s input parameters'
                        },
                        implementation_strategy: {
                            type: 'string',
                            enum: ['agent_backed', 'code_generation', 'composition'],
                            description: 'How to implement the tool: agent_backed (LLM executes), code_generation (generate code), composition (combine existing tools)'
                        },
                        implementation_details: {
                            type: 'string',
                            description: 'For agent_backed: prompt/instructions. For code_generation: JavaScript function code. For composition: JSON describing tool chain.'
                        }
                    },
                    required: ['name', 'description', 'input_schema', 'implementation_strategy', 'implementation_details']
                }
            },
            {
                name: 'list_available_tools',
                description: 'List all available tools (both in-code and dynamically created)',
                input_schema: {
                    type: 'object',
                    properties: {
                        include_source: {
                            type: 'boolean',
                            description: 'Include implementation source code/details'
                        },
                        filter_type: {
                            type: 'string',
                            enum: ['all', 'core', 'dynamic', 'meta'],
                            description: 'Filter tools by type'
                        }
                    }
                }
            },
            {
                name: 'propose_tool_improvement',
                description: 'Propose an improvement to an existing tool. Proposals are recorded for review.',
                input_schema: {
                    type: 'object',
                    properties: {
                        tool_name: {
                            type: 'string',
                            description: 'Name of the tool to improve'
                        },
                        rationale: {
                            type: 'string',
                            description: 'Why this improvement is needed'
                        },
                        proposed_changes: {
                            type: 'string',
                            description: 'Detailed description of proposed changes'
                        }
                    },
                    required: ['tool_name', 'rationale', 'proposed_changes']
                }
            }
        ];
    }

    /**
     * Handle construct_tool invocation
     */
    async constructTool(input: {
        name: string;
        description: string;
        input_schema: any;
        implementation_strategy: 'agent_backed' | 'code_generation' | 'composition';
        implementation_details: string;
    }): Promise<any> {
        const { name, description, input_schema, implementation_strategy, implementation_details } = input;

        // Check if tool already exists
        if (this.dynamicTools.has(name)) {
            return {
                success: false,
                message: `Tool '${name}' already exists. Use propose_tool_improvement to suggest changes.`
            };
        }

        let handler: (input: any) => Promise<any>;

        switch (implementation_strategy) {
            case 'agent_backed':
                // Tool execution delegated to agent
                handler = async (toolInput: any) => {
                    // This will be replaced by actual agent invocation in Phase 4
                    return {
                        result: 'Tool execution placeholder - will be replaced with agent invocation',
                        prompt: implementation_details,
                        input: toolInput
                    };
                };
                break;

            case 'code_generation':
                // Execute provided JavaScript code
                try {
                    // Create async function from code (simplified - removed unused variable)
                    handler = async (toolInput: any) => {
                        try {
                            // Execute with input in scope
                            const fn = new Function('input', `return (async () => { ${implementation_details} })()`);
                            return await fn(toolInput);
                        } catch (error: any) {
                            throw new Error(`Tool execution failed: ${error.message}`);
                        }
                    };
                } catch (error: any) {
                    return {
                        success: false,
                        message: `Failed to compile tool code: ${error.message}`
                    };
                }
                break;

            case 'composition':
                // Compose existing tools
                handler = async (toolInput: any) => {
                    try {
                        const composition = JSON.parse(implementation_details);
                        return {
                            result: 'Composition execution placeholder',
                            composition,
                            input: toolInput
                        };
                    } catch (error: any) {
                        throw new Error(`Invalid composition definition: ${error.message}`);
                    }
                };
                break;
        }

        // Register the tool
        const dynamicTool: DynamicTool = {
            definition: {
                name,
                description,
                input_schema
            },
            handler,
            created: new Date().toISOString(),
            strategy: implementation_strategy,
            implementation: implementation_details
        };

        this.dynamicTools.set(name, dynamicTool);

        // Record mutation
        this.onMutation({
            type: 'add_node', // Using add_node as general mutation type
            data: {
                mutationType: 'tool_constructed',
                tool: {
                    name,
                    description,
                    input_schema,
                    strategy: implementation_strategy
                }
            }
        });

        return {
            success: true,
            message: `Tool '${name}' constructed and registered`,
            tool: {
                name,
                description,
                strategy: implementation_strategy
            }
        };
    }

    /**
     * Handle list_available_tools invocation
     */
    async listAvailableTools(input: {
        include_source?: boolean;
        filter_type?: 'all' | 'core' | 'dynamic' | 'meta';
    } = {}): Promise<any> {
        const { include_source = false, filter_type = 'all' } = input;

        const result: any = {
            dynamicTools: [],
            metaTools: [],
            totalCount: 0
        };

        // Dynamic tools
        if (filter_type === 'all' || filter_type === 'dynamic') {
            result.dynamicTools = Array.from(this.dynamicTools.values()).map(tool => ({
                name: tool.definition.name,
                description: tool.definition.description,
                strategy: tool.strategy,
                created: tool.created,
                ...(include_source && { implementation: tool.implementation })
            }));
        }

        // Meta tools
        if (filter_type === 'all' || filter_type === 'meta') {
            result.metaTools = this.getMetaTools().map(tool => ({
                name: tool.name,
                description: tool.description,
                type: 'meta'
            }));
        }

        result.totalCount = result.dynamicTools.length + result.metaTools.length;

        return result;
    }

    /**
     * Handle propose_tool_improvement invocation
     */
    async proposeToolImprovement(input: {
        tool_name: string;
        rationale: string;
        proposed_changes: string;
    }): Promise<any> {
        const { tool_name, rationale, proposed_changes } = input;

        const proposal: ToolImprovementProposal = {
            toolName: tool_name,
            rationale,
            proposedChanges: proposed_changes,
            timestamp: new Date().toISOString()
        };

        this.proposals.push(proposal);

        // Record mutation
        this.onMutation({
            type: 'modify_node',
            data: {
                mutationType: 'tool_improvement_proposed',
                proposal
            }
        });

        return {
            success: true,
            message: `Improvement proposal for '${tool_name}' recorded`,
            proposalCount: this.proposals.length
        };
    }

    /**
     * Get a dynamic tool by name
     */
    getDynamicTool(name: string): DynamicTool | undefined {
        return this.dynamicTools.get(name);
    }

    /**
     * Get all dynamic tools as ToolDefinitions
     */
    getDynamicToolDefinitions(): ToolDefinition[] {
        return Array.from(this.dynamicTools.values()).map(tool => tool.definition);
    }

    /**
     * Execute a dynamic tool
     */
    async executeDynamicTool(name: string, input: any): Promise<any> {
        const tool = this.dynamicTools.get(name);
        if (!tool) {
            throw new Error(`Dynamic tool '${name}' not found`);
        }

        return await tool.handler(input);
    }

    /**
     * Get all improvement proposals
     */
    getProposals(): ToolImprovementProposal[] {
        return [...this.proposals];
    }

    /**
     * Clear all dynamic tools (for testing)
     */
    clearDynamicTools(): void {
        this.dynamicTools.clear();
    }

    /**
     * Load dynamic tools from persisted state
     */
    loadDynamicTools(tools: DynamicTool[]): void {
        for (const tool of tools) {
            this.dynamicTools.set(tool.definition.name, tool);
        }
    }

    /**
     * Handle get_machine_definition invocation
     */
    async getMachineDefinition(input: { format?: 'json' | 'dsl' | 'both' } = {}): Promise<any> {
        const { format = 'both' } = input;

        const result: any = {};

        // Convert MachineData to MachineJSON format
        const machineJson = {
            title: this._machineData.title,
            nodes: this._machineData.nodes.map(node => ({
                name: node.name,
                type: node.type,
                attributes: node.attributes?.map(attr => ({
                    name: attr.name,
                    type: attr.type,
                    value: attr.value
                })),
                annotations: (node as any).annotations
            })),
            edges: this._machineData.edges.map(edge => ({
                source: edge.source,
                target: edge.target,
                type: edge.type,
                label: edge.label
            }))
        };

        if (format === 'json' || format === 'both') {
            result.json = machineJson;
        }

        if (format === 'dsl' || format === 'both') {
            // Import generateDSL function dynamically
            const { generateDSL } = await import('./generator/generator.js');
            result.dsl = generateDSL(machineJson as any);
        }

        return result;
    }

    /**
     * Handle update_definition invocation
     */
    async updateDefinition(input: { machine: any; reason: string }): Promise<any> {
        const { machine, reason } = input;

        // Validate the machine structure
        if (!machine.title || !Array.isArray(machine.nodes) || !Array.isArray(machine.edges)) {
            return {
                success: false,
                message: 'Invalid machine structure. Must have title (string), nodes (array), and edges (array).'
            };
        }

        // Update the machine data
        this._machineData.title = machine.title;
        this._machineData.nodes = machine.nodes.map((node: any) => ({
            name: node.name,
            type: node.type,
            attributes: node.attributes?.map((attr: any) => ({
                name: attr.name,
                type: attr.type,
                value: attr.value
            })),
            // Preserve annotations if present in the incoming payload
            ...(node.annotations && { annotations: node.annotations })
        }));
        this._machineData.edges = machine.edges.map((edge: any) => ({
            source: edge.source,
            target: edge.target,
            type: edge.type,
            label: edge.label,
            // Preserve annotations if present in the incoming payload
            ...(edge.annotations && { annotations: edge.annotations })
        }));

        // Generate DSL version
        const { generateDSL } = await import('./generator/generator.js');
        const dsl = generateDSL(machine);

        // Record mutation
        this.onMutation({
            type: 'modify_node',
            data: {
                mutationType: 'machine_updated',
                reason,
                machine: {
                    title: machine.title,
                    nodeCount: machine.nodes.length,
                    edgeCount: machine.edges.length
                }
            }
        });

        // Notify callback if set (for playground editor update)
        if (this.onMachineUpdate) {
            this.onMachineUpdate(dsl, this._machineData);
        }

        return {
            success: true,
            message: 'Machine definition updated successfully',
            dsl,
            summary: {
                title: machine.title,
                nodes: machine.nodes.length,
                edges: machine.edges.length
            }
        };
    }
}
