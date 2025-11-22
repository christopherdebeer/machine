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
import { getPath } from './state-builder.js';
import { getNonAutomatedTransitions, getNodeAttributes } from './transition-evaluator.js';
import { AgentContextBuilder } from '../agent-context-builder.js';

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

    // Add meta-tools if node has meta capability
    const attributes = getNodeAttributes(machineJSON, nodeName);
    if (attributes.meta === 'true' || attributes.meta === 'True') {
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
        // Check for read permission (edge from context to task, or task to context with -reads->)
        const hasReadEdge = machineJSON.edges.some(e =>
            (e.source === contextNode.name && e.target === nodeName) ||
            (e.source === nodeName && e.target === contextNode.name && e.type === 'reads')
        );

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

        // Check for write permission (edge from task to context with -writes-> or -stores->)
        const hasWriteEdge = machineJSON.edges.some(e =>
            e.source === nodeName && e.target === contextNode.name &&
            (e.type === 'writes' || e.type === 'stores')
        );

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
 * Build meta-programming tools
 */
function buildMetaTools(): ToolDefinition[] {
    return [
        {
            name: 'add_node',
            description: 'Add a new node to the machine',
            input_schema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique node name' },
                    type: { type: 'string', description: 'Node type (e.g., "task", "state")' },
                    attributes: { type: 'object', description: 'Node attributes' }
                },
                required: ['name', 'type']
            }
        },
        {
            name: 'add_edge',
            description: 'Add a new edge between nodes',
            input_schema: {
                type: 'object',
                properties: {
                    source: { type: 'string', description: 'Source node name' },
                    target: { type: 'string', description: 'Target node name' },
                    type: { type: 'string', description: 'Edge type/label' }
                },
                required: ['source', 'target']
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
