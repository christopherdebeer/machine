/**
 * Meta-Tool Manager - Dynamic Tool Construction
 *
 * Enables:
 * - Dynamic tool construction (agent-backed, code-generation, composition)
 * - Tool registry for in-code and dynamically created tools
 * - Tool review and improvement proposals
 * - Persistence of tool definitions
 */

import type { ToolDefinition } from './llm-client.js';
import type { MachineMutation, MachineData } from './rails-executor.js';
import type { ToolRegistry } from './tool-registry.js';
import { extractValueFromAST } from './utils/ast-helpers.js';

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
    private toolRegistry?: ToolRegistry;

    constructor(
        private _machineData: MachineData,
        private onMutation: (mutation: Omit<MachineMutation, 'timestamp'>) => void,
        toolRegistry?: ToolRegistry
    ) {
        this.toolRegistry = toolRegistry;
    }

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
            },
            {
                name: 'get_tool_nodes',
                description: 'Get all Tool nodes defined in the machine. Useful for finding loosely-defined tools that need to be built out.',
                input_schema: {
                    type: 'object',
                    properties: {
                        include_registered: {
                            type: 'boolean',
                            description: 'Include information about whether each tool is already registered dynamically'
                        }
                    }
                }
            },
            {
                name: 'build_tool_from_node',
                description: 'Build and register a dynamic tool from a Tool node definition. Use this when you have a loosely-defined Tool node that needs to be completed and registered.',
                input_schema: {
                    type: 'object',
                    properties: {
                        tool_name: {
                            type: 'string',
                            description: 'Name of the Tool node to build from'
                        },
                        strategy: {
                            type: 'string',
                            enum: ['agent_backed', 'code_generation', 'composition'],
                            description: 'Implementation strategy for the tool'
                        },
                        input_schema: {
                            type: 'object',
                            description: 'Complete JSON Schema for tool inputs (if not in node)'
                        },
                        output_schema: {
                            type: 'object',
                            description: 'Complete JSON Schema for tool outputs (if not in node)'
                        },
                        implementation_details: {
                            type: 'string',
                            description: 'Implementation code/prompt/composition details'
                        }
                    },
                    required: ['tool_name', 'strategy']
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
                    // This will be replaced by actual agent invocation
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

        // Register with ToolRegistry if available
        if (this.toolRegistry) {
            this.toolRegistry.registerStatic(dynamicTool.definition, handler);
        }

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

    /**
     * Handle get_tool_nodes invocation
     */
    async getToolNodesHandler(input: {
        include_registered?: boolean;
    } = {}): Promise<any> {
        const { include_registered = false } = input;

        const toolNodes = this.getToolNodes();

        if (include_registered) {
            return {
                tools: toolNodes.map(tool => ({
                    name: tool.name,
                    attributes: tool.attributes,
                    isLooselyDefined: this.isToolNodeLooselyDefined(tool),
                    isRegistered: this.dynamicTools.has(tool.name)
                })),
                totalCount: toolNodes.length
            };
        }

        return {
            tools: toolNodes.map(tool => ({
                name: tool.name,
                attributes: tool.attributes,
                isLooselyDefined: this.isToolNodeLooselyDefined(tool)
            })),
            totalCount: toolNodes.length
        };
    }

    /**
     * Handle build_tool_from_node invocation
     */
    async buildToolFromNodeHandler(input: {
        tool_name: string;
        strategy: 'agent_backed' | 'code_generation' | 'composition';
        input_schema?: any;
        output_schema?: any;
        implementation_details?: string;
    }): Promise<any> {
        const { tool_name, strategy, input_schema, output_schema, implementation_details } = input;

        // Find the tool node
        const toolNodes = this.getToolNodes();
        const toolNode = toolNodes.find(t => t.name === tool_name);

        if (!toolNode) {
            return {
                success: false,
                message: `Tool node '${tool_name}' not found in machine definition`
            };
        }

        // Merge provided schemas with existing attributes
        const mergedAttributes = {
            ...toolNode.attributes,
            ...(input_schema && { input_schema }),
            ...(output_schema && { output_schema })
        };

        // Build implementation details if provided
        if (implementation_details) {
            if (strategy === 'code_generation') {
                mergedAttributes.code = implementation_details;
            } else if (strategy === 'agent_backed') {
                mergedAttributes.prompt = implementation_details;
            } else if (strategy === 'composition') {
                mergedAttributes.composition = implementation_details;
            }
        }

        // Build the tool
        return await this.buildToolFromNode(
            { name: tool_name, attributes: mergedAttributes },
            strategy
        );
    }

    /**
     * Get all Tool nodes from the machine definition
     */
    getToolNodes(): Array<{
        name: string;
        attributes: Record<string, any>;
    }> {
        return this._machineData.nodes
            .filter(node => node.type?.toLowerCase() === 'tool')
            .map(node => {
                const attrs: Record<string, any> = {};
                node.attributes?.forEach(attr => {
                    let value = extractValueFromAST(attr.value);
                    // Try to parse JSON strings
                    if (typeof value === 'string') {
                        try {
                            if ((value.startsWith('{') && value.endsWith('}')) ||
                                (value.startsWith('[') && value.endsWith(']'))) {
                                value = JSON.parse(value);
                            }
                        } catch {
                            // Keep original string value
                        }
                    }
                    attrs[attr.name] = value;
                });
                return {
                    name: node.name,
                    attributes: attrs
                };
            });
    }

    /**
     * Check if a Tool node is loosely defined (missing schemas or implementation)
     */
    isToolNodeLooselyDefined(toolNode: { name: string; attributes: Record<string, any> }): boolean {
        const { attributes } = toolNode;

        // A tool is loosely defined if it's missing one or more of:
        // - input_schema
        // - output_schema
        // - code/implementation

        const hasInputSchema = attributes.input_schema !== undefined;
        const hasOutputSchema = attributes.output_schema !== undefined;
        const hasCode = attributes.code !== undefined || attributes.implementation !== undefined;

        return !hasInputSchema || !hasOutputSchema || !hasCode;
    }

    /**
     * Build a complete tool definition from a Tool node
     * Registers the tool with the MetaToolManager if not already registered
     */
    async buildToolFromNode(toolNode: {
        name: string;
        attributes: Record<string, any>;
    }, strategy: 'agent_backed' | 'code_generation' | 'composition' = 'agent_backed'): Promise<any> {
        const { name, attributes } = toolNode;

        // If tool is already dynamically registered, skip
        if (this.dynamicTools.has(name)) {
            return {
                success: false,
                message: `Tool '${name}' is already registered dynamically`
            };
        }

        // Extract or generate schemas
        const inputSchema = attributes.input_schema || {
            type: 'object',
            properties: {}
        };

        const description = attributes.description || `Tool: ${name}`;

        // Determine implementation details based on strategy
        let implementationDetails = '';

        if (strategy === 'code_generation' && attributes.code) {
            implementationDetails = attributes.code;
        } else if (strategy === 'agent_backed') {
            // Use the description as the prompt for agent-backed tools
            implementationDetails = attributes.prompt || description;
        } else if (strategy === 'composition' && attributes.composition) {
            implementationDetails = typeof attributes.composition === 'string'
                ? attributes.composition
                : JSON.stringify(attributes.composition);
        }

        // Use the construct_tool method to register it
        return await this.constructTool({
            name,
            description,
            input_schema: inputSchema,
            implementation_strategy: strategy,
            implementation_details: implementationDetails
        });
    }
}
