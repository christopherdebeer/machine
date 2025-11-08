/**
 * Agent Context Builder - Dynamic Context System Prompts
 *
 * Generates context-specific system prompts for agents based on:
 * - Current node position and type
 * - Accessible context nodes (with permissions)
 * - Available transitions (non-automated)
 * - Meta-programming capabilities
 */

import type { MachineData, MachineExecutionContext } from './rails-executor.js';
import { NodeTypeChecker } from './node-type-checker.js';
import { EdgeConditionParser } from './utils/edge-conditions.js';
import { ContextPermissionsResolver } from './utils/context-permissions.js';
import { extractValueFromAST } from './utils/ast-helpers.js';
import { edgeHasAnnotation, getEdgeText } from './utils/edge-utils.js';


/**
 * Context access permissions for a node
 */
export interface ContextPermissions {
    canRead: boolean;
    canWrite: boolean;
    canStore: boolean;
    fields?: string[]; // Specific fields if restricted
}

/**
 * Node information
 */
interface Node {
    name: string;
    type?: string;
    attributes?: Array<{
        name: string;
        type: string;
        value: string;
    }>;
}

/**
 * Edge information
 */
interface Edge {
    source: string;
    target: string;
    type?: string;
    label?: string;
    arrowType?: string;
    annotations?: Array<{ name: string; value?: any }>;
    value?: Record<string, any>;
    attributes?: Record<string, any>;
}

/**
 * Transition information
 */
export interface TransitionInfo {
    target: string;
    description?: string;
    condition?: string;
}

/**
 * Agent Context Builder
 */
export class AgentContextBuilder {
    constructor(
        private machineData: MachineData,
        private executionContext: MachineExecutionContext
    ) {}

    /**
     * Build complete system prompt for current node
     */
    buildSystemPrompt(nodeName: string): string {
        const node = this.machineData.nodes.find(n => n.name === nodeName);
        if (!node) {
            throw new Error(`Node ${nodeName} not found`);
        }

        const parts: string[] = [];

        // Role section
        parts.push(this.buildRoleSection());
        parts.push('');

        // Current position section
        parts.push(this.buildPositionSection(node));
        parts.push('');

        // Available context section
        const contexts = this.getAccessibleContextNodes(nodeName);
        if (contexts.size > 0) {
            parts.push(this.buildContextSection(contexts));
            parts.push('');
        }

        // Available transitions section
        const transitions = this.getAvailableTransitions(nodeName);
        if (transitions.length > 0) {
            parts.push(this.buildTransitionsSection(transitions));
            parts.push('');
        }

        // Meta-programming section
        if (this.hasMetaCapabilities(node)) {
            parts.push(this.buildMetaSection());
            parts.push('');
        }

        // Instructions section
        parts.push(this.buildInstructionsSection(node));

        return parts.join('\n');
    }

    /**
     * Build role section
     */
    private buildRoleSection(): string {
        return '# Role\n' +
               'You are executing a state machine workflow. You have been positioned at a specific node ' +
               'and must accomplish the objectives defined for that node using the tools and context available to you.';
    }

    /**
     * Build current position section
     */
    private buildPositionSection(node: Node): string {
        const parts: string[] = [];
        parts.push('# Current Position');

        const nodeType = node.type || 'unknown';
        parts.push(`- **Node**: ${node.name}`);
        parts.push(`- **Type**: ${nodeType}`);

        // Add node-specific attributes
        const attributes = this.getNodeAttributes(node);
        if (attributes.prompt) {
            parts.push(`- **Objective**: ${attributes.prompt}`);
        }

        // Add execution state info
        parts.push(`- **Visited Nodes**: ${this.executionContext.visitedNodes.size}`);
        parts.push(`- **Error Count**: ${this.executionContext.errorCount}`);

        if (this.executionContext.activeState) {
            parts.push(`- **Active State**: ${this.executionContext.activeState}`);
        }

        return parts.join('\n');
    }

    /**
     * Build context section showing accessible context nodes
     */
    private buildContextSection(contexts: Map<string, ContextPermissions>): string {
        const parts: string[] = [];
        parts.push('# Available Context');
        parts.push('You have access to the following context nodes with specified permissions:');
        parts.push('');

        for (const [contextName, perms] of contexts.entries()) {
            const permissions: string[] = [];
            if (perms.canRead) permissions.push('read');
            if (perms.canWrite) permissions.push('write');
            if (perms.canStore) permissions.push('store');

            parts.push(`## ${contextName}`);
            parts.push(`- **Permissions**: ${permissions.join(', ')}`);

            if (perms.fields && perms.fields.length > 0) {
                parts.push(`- **Accessible Fields**: ${perms.fields.join(', ')}`);
            }

            // Show current values if readable
            if (perms.canRead) {
                const contextNode = this.machineData.nodes.find(n => n.name === contextName);
                if (contextNode?.attributes) {
                    const attrs = this.getNodeAttributes(contextNode);
                    const attrLines = Object.entries(attrs).map(([key, value]) => {
                        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                        return `  - ${key}: ${valueStr}`;
                    });
                    if (attrLines.length > 0) {
                        parts.push('- **Current Values**:');
                        parts.push(...attrLines);
                    }
                }
            }

            parts.push('');
        }

        return parts.join('\n');
    }

    /**
     * Build transitions section
     */
    private buildTransitionsSection(transitions: TransitionInfo[]): string {
        const parts: string[] = [];
        parts.push('# Available Transitions');
        parts.push('You must choose one of these transitions when you have completed your objective:');
        parts.push('');

        for (const transition of transitions) {
            parts.push(`## ${transition.target}`);
            if (transition.description) {
                parts.push(`- **Description**: ${transition.description}`);
            }
            if (transition.condition) {
                parts.push(`- **Condition**: ${transition.condition}`);
            }
            parts.push('');
        }

        return parts.join('\n');
    }

    /**
     * Build meta-programming section
     */
    private buildMetaSection(): string {
        const parts: string[] = [];
        parts.push('# Meta-Programming Capabilities');
        parts.push('This node has meta-programming enabled. You can:');
        parts.push('');
        parts.push('- **Inspect** the machine structure using `get_machine_definition`');
        parts.push('- **Add nodes** to the machine using `add_node`');
        parts.push('- **Add edges** between nodes using `add_edge`');
        parts.push('- **Modify nodes** (attributes, types) using `modify_node`');
        parts.push('- **Construct tools** dynamically when needed using `construct_tool`');
        parts.push('- **Review tools** and propose improvements using `propose_tool_improvement`');
        parts.push('');
        parts.push('Use these capabilities judiciously to evolve the machine as needed.');

        return parts.join('\n');
    }

    /**
     * Build instructions section
     */
    private buildInstructionsSection(node: Node): string {
        const parts: string[] = [];
        parts.push('# Instructions');

        const attributes = this.getNodeAttributes(node);
        if (attributes.prompt) {
            parts.push('Your primary objective is:');
            parts.push(`> ${attributes.prompt}`);
            parts.push('');
        }

        parts.push('To accomplish your objective:');
        parts.push('1. Use the provided tools to interact with context nodes (read/write data)');
        parts.push('2. Perform any necessary computations or reasoning');
        parts.push('3. When ready, use the appropriate transition tool to move to the next node');
        parts.push('');
        parts.push('Remember: You must use a transition tool to move forward. The machine will not progress until you do.');

        return parts.join('\n');
    }

    /**
     * Get accessible context nodes with permissions
     */
    getAccessibleContextNodes(taskNodeName: string): Map<string, ContextPermissions> {
        return ContextPermissionsResolver.getAccessibleContextNodes(
            taskNodeName,
            this.machineData,
            {
                includeInboundEdges: false,
                includeStore: true,
                enableLogging: false
            }
        );
    }

    /**
     * Get available transitions (non-automated)
     */
    private getAvailableTransitions(nodeName: string): TransitionInfo[] {
        const transitions: TransitionInfo[] = [];

        const outboundEdges = this.machineData.edges.filter(e => e.source === nodeName);

        for (const edge of outboundEdges) {
            const targetNode = this.machineData.nodes.find(n => n.name === edge.target);
            if (!targetNode) continue;

            // Skip edges to context nodes (those are not transitions)
            if (NodeTypeChecker.isContext(targetNode)) continue;

            // Skip @auto annotations (handled automatically)
            if (edgeHasAnnotation(edge as any, 'auto')) continue;

            // Extract condition if present
            const condition = this.extractConditionFromLabel(edge);

            // Skip simple deterministic conditions (auto-handled)
            if (condition && EdgeConditionParser.isSimpleCondition(condition)) continue;

            transitions.push({
                target: edge.target,
                description: getEdgeText(edge as any),
                condition
            });
        }

        return transitions;
    }

    /**
     * Extract condition from edge label
     */
    private extractConditionFromLabel(edge: Edge): string | undefined {
        return EdgeConditionParser.extract(edge);
    }

    /**
     * Check if node has meta-programming capabilities
     */
    private hasMetaCapabilities(node: Node): boolean {
        return NodeTypeChecker.hasMeta(node);
    }

    /**
     * Get node attributes as object
     */
    private getNodeAttributes(node: Node): Record<string, any> {
        if (!node.attributes) return {};

        return node.attributes.reduce((acc, attr) => {
            let value = extractValueFromAST(attr.value);

            // Try to parse JSON strings
            if (typeof value === 'string') {
                try {
                    if ((value.startsWith('{') && value.endsWith('}')) ||
                        (value.startsWith('[') && value.endsWith(']'))) {
                        value = JSON.parse(value);
                    }
                } catch (error) {
                    // Keep original
                }
            }

            acc[attr.name] = value;
            return acc;
        }, {} as Record<string, any>);
    }
}
