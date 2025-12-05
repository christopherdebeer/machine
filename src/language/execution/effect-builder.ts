/**
 * Effect Builder
 *
 * Pure functions for building effects (side effect descriptions).
 */

import type { MachineJSON } from '../json/types.js';
import type {
    ExecutionState,
    InvokeLLMEffect,
    LogEffect,
    CheckpointEffect,
    CompleteEffect,
    ErrorEffect,
    ToolDefinition
} from './runtime-types.js';
import { getPath, getAsyncAnnotation } from './state-builder.js';
import { getNonAutomatedTransitions, getNodeAttributes, getMachineAttributes } from './transition-evaluator.js';
import { AgentContextBuilder } from '../agent-context-builder.js';
import { MetaAnnotationConfig } from './annotation-configs.js';
import { UnifiedAnnotationProcessor } from './unified-annotation-processor.js';

/**
 * Build LLM invocation effect
 */
export function buildLLMEffect(
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string,
    nodeName: string
): InvokeLLMEffect {
    const path = getPath(state, pathId);
    if (!path) {
        throw new Error(`Path ${pathId} not found`);
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(machineJSON, state, pathId, nodeName);

    // Build tools
    const tools = buildTools(machineJSON, state, pathId, nodeName);

    // Extract task-level model ID if present
    const attributes = getNodeAttributes(machineJSON, nodeName);
    const modelId = attributes.modelId ? String(attributes.modelId).replace(/^["']|["']$/g, '') : undefined;

    return {
        type: 'invoke_llm',
        pathId,
        nodeName,
        systemPrompt,
        tools,
        modelId
    };
}

/**
 * Build system prompt for a node
 */
function buildSystemPrompt(
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string,
    nodeName: string
): string {
    // Create a legacy-compatible context object for AgentContextBuilder
    const path = getPath(state, pathId);
    if (!path) {
        throw new Error(`Path ${pathId} not found`);
    }

    const legacyContext = {
        currentNode: path.currentNode,
        errorCount: state.metadata.errorCount,
        visitedNodes: new Set(path.history.map(h => h.from)),
        attributes: new Map(),
        history: path.history,
        nodeInvocationCounts: new Map(Object.entries(path.nodeInvocationCounts)),
        stateTransitions: path.stateTransitions
    };

    const builder = new AgentContextBuilder(machineJSON, legacyContext);
    return builder.buildSystemPrompt(nodeName);
}

/**
 * Build tools for a node
 */
export function buildTools(
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string,
    nodeName: string
): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // Add transition tools
    const transitions = getNonAutomatedTransitions(machineJSON, state, pathId);
    for (const transition of transitions) {
        tools.push({
            name: `transition_to_${transition.target}`,
            description: `Transition to ${transition.target}${transition.description ? ': ' + transition.description : ''}`,
            input_schema: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: 'Brief explanation of why this transition was chosen'
                    }
                }
            }
        });
    }

    // Add context tools (read/write based on edges)
    const contextTools = buildContextTools(machineJSON, nodeName);
    tools.push(...contextTools);

    // Add async spawn tools for @async edges
    // These allow the agent to spawn parallel paths on demand
    const asyncTools = buildAsyncTools(machineJSON, nodeName);
    tools.push(...asyncTools);

    // Add meta-tools if machine or node has @meta annotation
    const hasMachineMeta = hasMetaAnnotation(machineJSON.annotations);
    const hasNodeMeta = hasMetaAnnotation(
        machineJSON.nodes.find(n => n.name === nodeName)?.annotations
    );

    if (hasMachineMeta || hasNodeMeta) {
        tools.push(...buildMetaTools());
    }

    return tools;
}

/**
 * Build context management tools
 */
function buildContextTools(machineJSON: MachineJSON, nodeName: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // Find context nodes accessible from this task
    const contextNodes = machineJSON.nodes.filter(n => {
        return n.type?.toLowerCase() === 'context' ||
            n.name.toLowerCase().includes('context');
    });

    for (const contextNode of contextNodes) {
        // Check for read permission
        // Multiple ways to indicate read access:
        // 1. Edge from context to task (context -> task)
        // 2. Edge from task to context with type='reads' (task -reads-> context)
        // 3. Edge with label/text containing 'reads'
        const hasReadEdge = machineJSON.edges.some(e => {
            // Direct edge from context to task
            if (e.source === contextNode.name && e.target === nodeName) {
                return true;
            }
            
            // Edge from task to context with semantic type
            if (e.source === nodeName && e.target === contextNode.name) {
                // Check edge.type field (set by serializer for semantic edges)
                if (e.type === 'reads') return true;
                
                // Check edge label/text for 'reads' keyword
                const label = e.label || e.value?.text || e.attributes?.text;
                if (label && typeof label === 'string' && label.toLowerCase().trim() === 'reads') {
                    return true;
                }
            }
            
            return false;
        });

        if (hasReadEdge) {
            tools.push({
                name: `read_${contextNode.name}`,
                description: `Read data from ${contextNode.name} context`,
                input_schema: {
                    type: 'object',
                    properties: {
                        fields: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Specific fields to read (optional)'
                        }
                    }
                }
            });
        }

        // Check for write permission
        // Multiple ways to indicate write access:
        // 1. Edge from task to context with type='writes' (task -writes-> context)
        // 2. Edge with label/text containing 'writes' or 'stores'
        const hasWriteEdge = machineJSON.edges.some(e => {
            if (e.source === nodeName && e.target === contextNode.name) {
                // Check edge.type field (set by serializer for semantic edges)
                if (e.type === 'writes' || e.type === 'stores') return true;
                
                // Check edge label/text for write keywords
                const label = e.label || e.value?.text || e.attributes?.text;
                if (label && typeof label === 'string') {
                    const lower = label.toLowerCase().trim();
                    if (lower === 'writes' || lower === 'stores') return true;
                }
            }
            
            return false;
        });

        if (hasWriteEdge) {
            tools.push({
                name: `write_${contextNode.name}`,
                description: `Write data to ${contextNode.name} context`,
                input_schema: {
                    type: 'object',
                    properties: {
                        data: {
                            type: 'object',
                            description: 'Data to write'
                        }
                    },
                    required: ['data']
                }
            });
        }
    }

    return tools;
}

/**
 * Build async spawn tools for @async edges
 *
 * When a node has outbound edges with @async annotation, these become tools
 * that the agent can use to spawn parallel execution paths. This gives the
 * agent control over when and whether to spawn async paths.
 */
function buildAsyncTools(machineJSON: MachineJSON, nodeName: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // Find outbound edges with @async annotation
    const asyncEdges = machineJSON.edges.filter(e => {
        if (e.source !== nodeName) return false;
        const asyncConfig = getAsyncAnnotation(e);
        return asyncConfig && asyncConfig.enabled;
    });

    for (const edge of asyncEdges) {
        // Get edge description if available
        const edgeLabel = edge.label || edge.value?.text || edge.attributes?.text;
        const description = edgeLabel
            ? `Spawn async path to ${edge.target}: ${edgeLabel}`
            : `Spawn a parallel execution path to ${edge.target}. The spawned path runs independently.`;

        tools.push({
            name: `spawn_async_to_${edge.target}`,
            description,
            input_schema: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: 'Brief explanation of why spawning this async path'
                    },
                    await_result: {
                        type: 'boolean',
                        description: 'If true, wait for the spawned path\'s first node to complete and return its result. Default: false (fire-and-forget).'
                    }
                }
            }
        });
    }

    return tools;
}

/**
 * Build meta-programming tools
 * Returns the same rich set of tools that MetaToolManager provides
 */
function buildMetaTools(): ToolDefinition[] {
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
 * Build log effect
 */
export function buildLogEffect(
    level: 'debug' | 'info' | 'warn' | 'error',
    category: string,
    message: string,
    data?: Record<string, any>
): LogEffect {
    return {
        type: 'log',
        level,
        category,
        message,
        data
    };
}

/**
 * Build checkpoint effect
 */
export function buildCheckpointEffect(description?: string): CheckpointEffect {
    return {
        type: 'checkpoint',
        description
    };
}

/**
 * Build complete effect
 */
export function buildCompleteEffect(state: ExecutionState): CompleteEffect {
    return {
        type: 'complete',
        finalState: state
    };
}

/**
 * Build error effect
 */
export function buildErrorEffect(
    error: string,
    pathId?: string,
    nodeName?: string
): ErrorEffect {
    return {
        type: 'error',
        error,
        pathId,
        nodeName
    };
}

/**
 * Check if @meta annotation is present
 * Uses the unified annotation processor
 */
function hasMetaAnnotation(
    annotations: Array<{ name: string; value?: string; attributes?: Record<string, unknown> }> | undefined
): boolean {
    if (!annotations) return false;

    const config = UnifiedAnnotationProcessor.process(
        annotations,
        MetaAnnotationConfig
    );

    return config?.enabled ?? false;
}
