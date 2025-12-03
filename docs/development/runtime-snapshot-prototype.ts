/**
 * RuntimeSnapshot Prototype Implementation
 *
 * This is a PROPOSAL/PROTOTYPE - not production code.
 * Demonstrates the enhanced RuntimeStateVisualizer with comprehensive execution affordances.
 *
 * Status: Design Document / Prototype
 * Date: 2025-12-03
 */

import type { MachineExecutor } from '../../src/language/executor.js';
import type { VisualizationState, ToolDefinition, ToolExecutionResult, PathStatus } from '../../src/language/execution/runtime-types.js';
import type { MachineJSON } from '../../src/language/json/types.js';

// ============================================================================
// Type Definitions for Enhanced Runtime Snapshot
// ============================================================================

/**
 * Comprehensive runtime snapshot showing all execution affordances
 */
export interface RuntimeSnapshot {
  // Current execution position(s) across all active paths
  currentNodes: Array<{
    pathId: string;
    nodeName: string;
    nodeType: 'Task' | 'Input' | 'Result' | 'Context' | 'State' | 'Unknown';
  }>;

  // Available execution affordances
  affordances: {
    // Transitions that can be taken from current node(s)
    transitions: Array<{
      pathId: string;
      fromNode: string;
      toNode: string;
      isAutomatic: boolean;
      condition?: string;
      canTake: boolean;  // Whether transition can currently be taken
    }>;

    // Tools available at current node(s)
    tools: Array<{
      pathId: string;
      toolName: string;
      description: string;
      source: 'machine' | 'dynamic' | 'context' | 'meta';
      inputSchema: any;
    }>;

    // Contexts accessible from current node(s)
    contexts: Array<{
      name: string;
      nodeType: string;
      attributes: Record<string, {
        type: string;
        currentValue: any;
        defaultValue: any;
        isWritable: boolean;
      }>;
    }>;
  };

  // Multi-path execution state
  paths: {
    active: number;
    completed: number;
    failed: number;
    waiting: number;
    details: Array<{
      id: string;
      status: PathStatus;
      currentNode: string;
      stepCount: number;
      isInTurn: boolean;
      turnCount?: number;
      lastTransition?: string;
    }>;
  };

  // Turn-level state (if currently in turn execution)
  turnState?: {
    pathId: string;
    nodeName: string;
    turnCount: number;
    availableTools: ToolDefinition[];
    conversationLength: number;
    lastToolExecutions: ToolExecutionResult[];
    isWaitingForTurn: boolean;
    systemPrompt: string;
    modelId?: string;
  };

  // Execution metadata
  metadata: {
    totalSteps: number;
    elapsedTime: number;
    errorCount: number;
    isComplete: boolean;
    isPaused: boolean;
    startTime: number;
  };
}

/**
 * Context affordance information
 */
export interface ContextAffordance {
  name: string;
  nodeType: string;
  attributes: Record<string, {
    type: string;
    currentValue: any;
    defaultValue: any;
    isWritable: boolean;
  }>;
}

/**
 * Tool affordance information
 */
export interface ToolAffordance {
  pathId: string;
  toolName: string;
  description: string;
  source: 'machine' | 'dynamic' | 'context' | 'meta';
  inputSchema: any;
}

// ============================================================================
// Enhanced RuntimeVisualizer Implementation
// ============================================================================

/**
 * Enhanced RuntimeVisualizer with comprehensive execution control affordances
 */
export class EnhancedRuntimeVisualizer {
  private executor: MachineExecutor;
  private visualizationState: VisualizationState;
  private machineData: MachineJSON;

  constructor(executor: MachineExecutor) {
    // Keep executor reference for deep inspection
    this.executor = executor;

    // Use rich visualization state instead of legacy context
    this.visualizationState = executor.getVisualizationState();

    // Get machine definition
    this.machineData = executor.getMachineDefinition();
  }

  /**
   * Generate comprehensive runtime snapshot
   */
  public generateRuntimeSnapshot(): RuntimeSnapshot {
    return {
      currentNodes: this.extractCurrentNodes(),
      affordances: {
        transitions: this.extractAvailableTransitions(),
        tools: this.extractAvailableTools(),
        contexts: this.extractContextAffordances()
      },
      paths: this.extractPathState(),
      turnState: this.extractTurnState(),
      metadata: this.extractMetadata()
    };
  }

  /**
   * Extract current execution positions
   */
  private extractCurrentNodes(): RuntimeSnapshot['currentNodes'] {
    return this.visualizationState.currentNodes.map(cn => ({
      pathId: cn.pathId,
      nodeName: cn.nodeName,
      nodeType: this.getNodeType(cn.nodeName)
    }));
  }

  /**
   * Get node type from machine definition
   */
  private getNodeType(nodeName: string): RuntimeSnapshot['currentNodes'][0]['nodeType'] {
    const node = this.machineData.nodes.find(n => n.name === nodeName);
    if (!node) return 'Unknown';

    const type = node.type?.toLowerCase();
    if (type === 'task') return 'Task';
    if (type === 'input') return 'Input';
    if (type === 'result') return 'Result';
    if (type === 'context') return 'Context';
    if (type === 'state') return 'State';

    return 'Unknown';
  }

  /**
   * Extract available transitions with evaluation
   */
  private extractAvailableTransitions(): RuntimeSnapshot['affordances']['transitions'] {
    return this.visualizationState.availableTransitions.map(t => ({
      pathId: t.pathId,
      fromNode: t.fromNode,
      toNode: t.toNode,
      isAutomatic: t.isAutomatic,
      condition: t.condition,
      canTake: this.evaluateTransitionCondition(t)
    }));
  }

  /**
   * Evaluate whether a transition can currently be taken
   *
   * TODO: Implement proper condition evaluation
   * For now, assume all transitions can be taken unless they have a condition
   */
  private evaluateTransitionCondition(transition: VisualizationState['availableTransitions'][0]): boolean {
    // Automatic transitions can always be taken
    if (transition.isAutomatic) return true;

    // If no condition, transition is available
    if (!transition.condition) return true;

    // TODO: Evaluate condition against current context state
    // For now, mark as potentially takeable but requires evaluation
    return true;
  }

  /**
   * Extract available tools for each active path
   */
  private extractAvailableTools(): ToolAffordance[] {
    const tools: ToolAffordance[] = [];

    for (const path of this.visualizationState.activePaths) {
      // Get tools from machine definition (Task nodes)
      tools.push(...this.extractTaskTools(path.id, path.currentNode));

      // Get context tools
      tools.push(...this.extractContextTools(path.id));

      // TODO: Get dynamic tools from meta-tool manager
      // Requires executor.getMetaToolManager().getAvailableTools()
    }

    return tools;
  }

  /**
   * Extract tools from Task node definition
   */
  private extractTaskTools(pathId: string, nodeName: string): ToolAffordance[] {
    const node = this.machineData.nodes.find(n => n.name === nodeName);
    if (!node || node.type !== 'Task') return [];

    const tools: ToolAffordance[] = [];

    // Check for prompt attribute (indicates LLM task with potential tools)
    const promptAttr = node.attributes?.find(a => a.name === 'prompt');
    if (promptAttr) {
      // Task nodes can have tools defined in their attributes
      // TODO: Extract tool definitions from task attributes
      // For now, we'll note that this task has LLM capabilities
    }

    return tools;
  }

  /**
   * Extract context read/write tools
   */
  private extractContextTools(pathId: string): ToolAffordance[] {
    const tools: ToolAffordance[] = [];

    // Find all context nodes
    const contextNodes = this.machineData.nodes.filter(n => n.type === 'Context');

    for (const contextNode of contextNodes) {
      // Add read tool
      tools.push({
        pathId,
        toolName: `read_${contextNode.name}`,
        description: `Read values from ${contextNode.name} context`,
        source: 'context',
        inputSchema: {
          type: 'object',
          properties: {
            attribute: {
              type: 'string',
              description: 'Attribute name to read'
            }
          }
        }
      });

      // Add write tool
      tools.push({
        pathId,
        toolName: `write_${contextNode.name}`,
        description: `Write values to ${contextNode.name} context`,
        source: 'context',
        inputSchema: {
          type: 'object',
          properties: {
            attribute: {
              type: 'string',
              description: 'Attribute name to write'
            },
            value: {
              description: 'Value to write'
            }
          },
          required: ['attribute', 'value']
        }
      });
    }

    return tools;
  }

  /**
   * Extract context affordances (what contexts are accessible and their current state)
   */
  private extractContextAffordances(): ContextAffordance[] {
    const contexts: ContextAffordance[] = [];

    // Find all context nodes
    const contextNodes = this.machineData.nodes.filter(n => n.type === 'Context');

    for (const contextNode of contextNodes) {
      const attributes: ContextAffordance['attributes'] = {};

      // Extract attribute definitions
      if (contextNode.attributes) {
        for (const attr of contextNode.attributes) {
          // Get current value from visualization state
          const currentValue = this.visualizationState.nodeStates[contextNode.name]?.contextValues?.[attr.name];

          attributes[attr.name] = {
            type: this.extractAttributeType(attr),
            currentValue: currentValue ?? attr.value,
            defaultValue: attr.value,
            isWritable: true  // Context attributes are always writable
          };
        }
      }

      contexts.push({
        name: contextNode.name,
        nodeType: contextNode.type,
        attributes
      });
    }

    return contexts;
  }

  /**
   * Extract attribute type from attribute definition
   */
  private extractAttributeType(attr: any): string {
    if (attr.typeAnnotation) {
      return attr.typeAnnotation.name || 'any';
    }

    // Infer from value
    const value = attr.value;
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    if (typeof value === 'object') return 'object';

    return 'any';
  }

  /**
   * Extract path state information
   */
  private extractPathState(): RuntimeSnapshot['paths'] {
    const details = this.visualizationState.allPaths.map(p => ({
      id: p.id,
      status: p.status,
      currentNode: p.currentNode,
      stepCount: p.stepCount,
      isInTurn: this.isPathInTurn(p.id),
      turnCount: this.getPathTurnCount(p.id),
      lastTransition: p.history[p.history.length - 1]?.transition
    }));

    return {
      active: this.visualizationState.activePathCount,
      completed: this.visualizationState.completedPathCount,
      failed: this.visualizationState.failedPathCount,
      waiting: this.visualizationState.totalPaths -
               this.visualizationState.activePathCount -
               this.visualizationState.completedPathCount -
               this.visualizationState.failedPathCount,
      details
    };
  }

  /**
   * Check if path is currently in turn execution
   */
  private isPathInTurn(pathId: string): boolean {
    // Access executor's turn state
    const state = (this.executor as any).currentState;
    return state.turnState?.pathId === pathId;
  }

  /**
   * Get turn count for a path
   */
  private getPathTurnCount(pathId: string): number | undefined {
    const state = (this.executor as any).currentState;
    if (state.turnState?.pathId === pathId) {
      return state.turnState.turnCount;
    }
    return undefined;
  }

  /**
   * Extract turn-level execution state
   */
  private extractTurnState(): RuntimeSnapshot['turnState'] | undefined {
    const state = (this.executor as any).currentState;
    if (!state.turnState) return undefined;

    return {
      pathId: state.turnState.pathId,
      nodeName: state.turnState.nodeName,
      turnCount: state.turnState.turnCount,
      availableTools: state.turnState.conversationState.tools,
      conversationLength: state.turnState.conversationState.messages.length,
      lastToolExecutions: state.turnState.conversationState.toolExecutions,
      isWaitingForTurn: state.turnState.isWaitingForTurn,
      systemPrompt: state.turnState.systemPrompt,
      modelId: state.turnState.modelId
    };
  }

  /**
   * Extract execution metadata
   */
  private extractMetadata(): RuntimeSnapshot['metadata'] {
    const state = (this.executor as any).currentState;

    return {
      totalSteps: this.visualizationState.stepCount,
      elapsedTime: this.visualizationState.elapsedTime,
      errorCount: this.visualizationState.errorCount,
      isComplete: this.visualizationState.activePathCount === 0 &&
                  this.visualizationState.totalPaths > 0,
      isPaused: state.turnState?.isWaitingForTurn || false,
      startTime: state.metadata.startTime
    };
  }
}

// ============================================================================
// Utility Functions for Snapshot Display
// ============================================================================

/**
 * Format runtime snapshot as human-readable text
 */
export function formatRuntimeSnapshot(snapshot: RuntimeSnapshot): string {
  const lines: string[] = [];

  // Header
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  RUNTIME EXECUTION SNAPSHOT');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  // Current Position
  lines.push('📍 CURRENT POSITION');
  lines.push('───────────────────────────────────────────────────────────');
  if (snapshot.currentNodes.length === 0) {
    lines.push('  (no active nodes)');
  } else {
    for (const node of snapshot.currentNodes) {
      lines.push(`  Path ${node.pathId}: ${node.nodeName} (${node.nodeType})`);
    }
  }
  lines.push('');

  // Available Transitions
  if (snapshot.affordances.transitions.length > 0) {
    lines.push('🔀 AVAILABLE TRANSITIONS');
    lines.push('───────────────────────────────────────────────────────────');
    for (const trans of snapshot.affordances.transitions) {
      const status = trans.canTake ? '✓' : '✗';
      const auto = trans.isAutomatic ? '[auto]' : '';
      lines.push(`  ${status} ${trans.fromNode} → ${trans.toNode} ${auto}`);
      if (trans.condition) {
        lines.push(`     if: ${trans.condition}`);
      }
    }
    lines.push('');
  }

  // Available Tools
  if (snapshot.affordances.tools.length > 0) {
    lines.push('🔧 AVAILABLE TOOLS');
    lines.push('───────────────────────────────────────────────────────────');
    for (const tool of snapshot.affordances.tools) {
      lines.push(`  • ${tool.toolName} (${tool.source})`);
      lines.push(`    ${tool.description}`);
    }
    lines.push('');
  }

  // Contexts
  if (snapshot.affordances.contexts.length > 0) {
    lines.push('📦 CONTEXTS');
    lines.push('───────────────────────────────────────────────────────────');
    for (const ctx of snapshot.affordances.contexts) {
      lines.push(`  ${ctx.name} (${ctx.nodeType})`);
      for (const [attr, info] of Object.entries(ctx.attributes)) {
        const value = JSON.stringify(info.currentValue);
        lines.push(`    ${attr}: ${value} (${info.type})`);
      }
    }
    lines.push('');
  }

  // Multi-Path State
  if (snapshot.paths.details.length > 1) {
    lines.push('🌲 MULTI-PATH EXECUTION');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`  Active: ${snapshot.paths.active}`);
    lines.push(`  Completed: ${snapshot.paths.completed}`);
    lines.push(`  Failed: ${snapshot.paths.failed}`);
    lines.push(`  Waiting: ${snapshot.paths.waiting}`);
    lines.push('');
    lines.push('  Path Details:');
    for (const path of snapshot.paths.details) {
      const turnInfo = path.isInTurn ? ` [turn ${path.turnCount}]` : '';
      lines.push(`    ${path.id}: ${path.currentNode} (${path.status})${turnInfo}`);
    }
    lines.push('');
  }

  // Turn State
  if (snapshot.turnState) {
    lines.push('🔄 TURN EXECUTION STATE');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`  Path: ${snapshot.turnState.pathId}`);
    lines.push(`  Node: ${snapshot.turnState.nodeName}`);
    lines.push(`  Turn: ${snapshot.turnState.turnCount}`);
    lines.push(`  Conversation Length: ${snapshot.turnState.conversationLength} messages`);
    lines.push(`  Available Tools: ${snapshot.turnState.availableTools.length}`);
    lines.push(`  Waiting: ${snapshot.turnState.isWaitingForTurn ? 'yes' : 'no'}`);
    lines.push('');
  }

  // Metadata
  lines.push('📊 EXECUTION METADATA');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`  Total Steps: ${snapshot.metadata.totalSteps}`);
  lines.push(`  Elapsed Time: ${snapshot.metadata.elapsedTime}ms`);
  lines.push(`  Error Count: ${snapshot.metadata.errorCount}`);
  lines.push(`  Status: ${snapshot.metadata.isComplete ? 'Complete' : 'Running'}`);
  lines.push(`  Paused: ${snapshot.metadata.isPaused ? 'Yes' : 'No'}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format snapshot as JSON (for API/tooling)
 */
export function formatRuntimeSnapshotJSON(snapshot: RuntimeSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Format snapshot as compact summary (for CLI one-liners)
 */
export function formatRuntimeSnapshotCompact(snapshot: RuntimeSnapshot): string {
  const parts: string[] = [];

  // Position
  if (snapshot.currentNodes.length > 0) {
    const nodes = snapshot.currentNodes.map(n => n.nodeName).join(', ');
    parts.push(`at: ${nodes}`);
  }

  // Paths
  if (snapshot.paths.details.length > 1) {
    parts.push(`paths: ${snapshot.paths.active}/${snapshot.paths.details.length}`);
  }

  // Progress
  parts.push(`steps: ${snapshot.metadata.totalSteps}`);

  // Status
  if (snapshot.metadata.isPaused) parts.push('PAUSED');
  if (snapshot.metadata.isComplete) parts.push('COMPLETE');
  if (snapshot.metadata.errorCount > 0) parts.push(`errors: ${snapshot.metadata.errorCount}`);

  return parts.join(' | ');
}
