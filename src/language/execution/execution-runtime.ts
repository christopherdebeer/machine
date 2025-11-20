/**
 * Execution Runtime Implementation
 *
 * Functional, immutable execution runtime for DyGram machines.
 */

import type { MachineJSON } from '../json/types.js';
import type {
    ExecutionState,
    ExecutionResult,
    ExecutionLimits,
    VisualizationState,
    Checkpoint,
    CheckpointMetadata,
    AgentResult,
    Effect,
    Transition,
    PathStatus
} from './runtime-types.js';
import type { RuntimeConfig, ExecutionRuntime } from './runtime.js';
import { NodeTypeChecker } from '../node-type-checker.js';
import {
    createInitialState,
    createPath,
    incrementStepCount,
    incrementErrorCount,
    incrementNodeInvocation,
    recordTransition,
    recordStateTransition,
    updatePathStatus,
    getPath,
    getActivePaths,
    hasActivePaths,
    serializeState,
    deserializeState,
    cloneState,
    updateMachineSnapshot
} from './state-builder.js';
import {
    evaluateAutomatedTransitions,
    requiresAgentDecision,
    getNodeAttributes,
    getParallelEdges
} from './transition-evaluator.js';
import {
    buildLLMEffect,
    buildLogEffect,
    buildCompleteEffect,
    buildErrorEffect
} from './effect-builder.js';

/**
 * Default execution limits
 */
const DEFAULT_LIMITS: ExecutionLimits = {
    maxSteps: 1000,
    maxNodeInvocations: 100,
    timeout: 5 * 60 * 1000, // 5 minutes
    cycleDetectionWindow: 20
};

/**
 * Create execution runtime
 */
export function createExecutionRuntime(): ExecutionRuntime {
    return {
        initialize,
        step,
        execute,
        applyAgentResult,
        getVisualizationState,
        createCheckpoint,
        restoreCheckpoint,
        serializeState,
        deserializeState
    };
}

/**
 * Initialize execution state from machine JSON
 */
function initialize(
    machineJSON: MachineJSON,
    config?: RuntimeConfig
): ExecutionState {
    const limits: ExecutionLimits = {
        ...DEFAULT_LIMITS,
        ...config?.limits
    };

    const state = createInitialState(machineJSON, limits);

    return state;
}

/**
 * Execute a single step
 *
 * Processes all active paths concurrently for true multi-path execution.
 * Each path is advanced independently based on its current state.
 */
function step(state: ExecutionState): ExecutionResult {
    const effects: Effect[] = [];

    // Get active paths
    const activePaths = getActivePaths(state);

    if (activePaths.length === 0) {
        effects.push(buildLogEffect('info', 'execution', 'Machine complete - no active paths'));
        effects.push(buildCompleteEffect(state));
        return {
            nextState: state,
            effects,
            status: 'complete'
        };
    }

    // Log multi-path execution
    if (activePaths.length > 1) {
        effects.push(buildLogEffect(
            'debug',
            'execution',
            `Multi-path execution: ${activePaths.length} active paths`,
            { pathIds: activePaths.map(p => p.id) }
        ));
    }

    // Process all active paths concurrently
    let nextState = state;
    let hasWaitingPath = false;
    let hasContinuingPath = false;

    for (const path of activePaths) {
        const result = stepPath(nextState, path.id);
        nextState = result.nextState;
        effects.push(...result.effects);

        // Track path statuses
        if (result.status === 'waiting') {
            hasWaitingPath = true;
        } else if (result.status === 'continue') {
            hasContinuingPath = true;
        }
    }

    // Determine overall execution status
    const finalActivePaths = getActivePaths(nextState);
    let overallStatus: ExecutionResult['status'];

    if (finalActivePaths.length === 0) {
        overallStatus = 'complete';
        effects.push(buildCompleteEffect(nextState));
    } else if (hasWaitingPath) {
        overallStatus = 'waiting';
    } else if (hasContinuingPath) {
        overallStatus = 'continue';
    } else {
        overallStatus = 'complete';
    }

    return {
        nextState,
        effects,
        status: overallStatus
    };
}

/**
 * Execute a single step for a specific path
 */
function stepPath(state: ExecutionState, pathId: string): ExecutionResult {
    const effects: Effect[] = [];
    const path = getPath(state, pathId);

    if (!path || path.status !== 'active') {
        return {
            nextState: state,
            effects: [],
            status: 'complete'
        };
    }

    const nodeName = path.currentNode;
    const machineJSON = state.machineSnapshot;

    // Find node
    const node = machineJSON.nodes.find(n => n.name === nodeName);
    if (!node) {
        effects.push(buildErrorEffect(`Node ${nodeName} not found`, path.id, nodeName));
        return {
            nextState: incrementErrorCount(state),
            effects,
            status: 'error'
        };
    }

    effects.push(buildLogEffect(
        'info',
        'execution',
        `Entering node: ${nodeName}`,
        { type: node.type, stepCount: state.metadata.stepCount }
    ));

    // Check limits
    const limitCheck = checkLimits(state, path.id, nodeName);
    if (limitCheck.exceeded) {
        effects.push(buildErrorEffect(limitCheck.error!, path.id, nodeName));
        return {
            nextState: incrementErrorCount(state),
            effects,
            status: 'error'
        };
    }

    // Track node invocation
    let nextState = incrementNodeInvocation(state, path.id, nodeName);
    nextState = incrementStepCount(nextState);

    // Track state transitions
    if (NodeTypeChecker.isState(node)) {
        nextState = recordStateTransition(nextState, path.id, nodeName);
    }

    // Check for automated transitions
    const autoTransition = evaluateAutomatedTransitions(machineJSON, nextState, path.id);

    if (autoTransition) {
        effects.push(buildLogEffect(
            'info',
            'transition',
            `Automated transition: ${nodeName} -> ${autoTransition.to}`,
            { reason: autoTransition.transition }
        ));

        nextState = recordTransition(nextState, path.id, autoTransition);

        return {
            nextState,
            effects,
            status: 'continue'
        };
    }

    // Check for parallel edges (path forking)
    const parallelEdges = getParallelEdges(machineJSON, nodeName);
    if (parallelEdges.length > 0) {
        effects.push(buildLogEffect(
            'info',
            'execution',
            `Forking ${parallelEdges.length} parallel paths from ${nodeName}`,
            { targets: parallelEdges.map(e => e.target) }
        ));

        // Create a new path for each parallel edge
        for (const edge of parallelEdges) {
            nextState = createPath(nextState, edge.target);
            effects.push(buildLogEffect(
                'info',
                'execution',
                `Created parallel path to ${edge.target}`
            ));
        }

        // Complete the current path (it has forked)
        nextState = updatePathStatus(nextState, path.id, 'completed');

        return {
            nextState,
            effects,
            status: 'continue'
        };
    }

    // Check if agent decision required
    if (requiresAgentDecision(machineJSON, nodeName)) {
        effects.push(buildLogEffect('info', 'execution', `Agent decision required for ${nodeName}`));

        // Build LLM invocation effect
        const llmEffect = buildLLMEffect(machineJSON, nextState, path.id, nodeName);
        effects.push(llmEffect);

        return {
            nextState,
            effects,
            status: 'waiting' // Wait for agent result
        };
    }

    // Check if terminal node (no outbound edges)
    const outboundEdges = machineJSON.edges.filter(e => e.source === nodeName);
    if (outboundEdges.length === 0) {
        effects.push(buildLogEffect('info', 'execution', `Reached terminal node: ${nodeName}`));
        nextState = updatePathStatus(nextState, path.id, 'completed');

        // Check if all paths complete
        if (!hasActivePaths(nextState)) {
            effects.push(buildCompleteEffect(nextState));
            return {
                nextState,
                effects,
                status: 'complete'
            };
        }

        return {
            nextState,
            effects,
            status: 'continue'
        };
    }

    // No transition available
    effects.push(buildLogEffect('warn', 'execution', `No transition available for node: ${nodeName}`));
    return {
        nextState,
        effects,
        status: 'complete'
    };
}

/**
 * Check execution limits
 */
function checkLimits(
    state: ExecutionState,
    pathId: string,
    nodeName: string
): { exceeded: boolean; error?: string } {
    const path = getPath(state, pathId);
    if (!path) {
        return { exceeded: true, error: `Path ${pathId} not found` };
    }

    // Check max steps
    if (state.metadata.stepCount >= state.limits.maxSteps) {
        return {
            exceeded: true,
            error: `Execution exceeded maximum steps (${state.limits.maxSteps})`
        };
    }

    // Check node invocations
    const invocations = path.nodeInvocationCounts[nodeName] || 0;
    if (invocations >= state.limits.maxNodeInvocations) {
        return {
            exceeded: true,
            error: `Node '${nodeName}' exceeded maximum invocation limit (${state.limits.maxNodeInvocations})`
        };
    }

    // Check timeout
    if (state.metadata.elapsedTime >= state.limits.timeout) {
        return {
            exceeded: true,
            error: `Execution timeout exceeded (${state.limits.timeout}ms)`
        };
    }

    // Check for cycles
    const cycleDetected = detectCycle(path.stateTransitions, state.limits.cycleDetectionWindow);
    if (cycleDetected) {
        return {
            exceeded: true,
            error: `Infinite loop detected: ${path.stateTransitions.slice(-10).map(t => t.state).join(' -> ')}`
        };
    }

    return { exceeded: false };
}

/**
 * Detect cycles in state transitions
 */
function detectCycle(
    stateTransitions: Array<{ state: string; timestamp: string }>,
    windowSize: number
): boolean {
    const recentTransitions = stateTransitions.slice(-windowSize);

    if (recentTransitions.length < 3) {
        return false;
    }

    // Look for repeated subsequences
    for (let patternLength = 2; patternLength <= Math.floor(recentTransitions.length / 2); patternLength++) {
        const pattern = recentTransitions.slice(-patternLength).map(t => t.state).join('->');
        const prevPattern = recentTransitions.slice(-patternLength * 2, -patternLength).map(t => t.state).join('->');

        if (pattern === prevPattern && pattern.length > 0) {
            return true;
        }
    }

    return false;
}

/**
 * Execute until completion
 */
async function execute(
    initialState: ExecutionState,
    effectHandler: (effects: Effect[]) => Promise<void>
): Promise<ExecutionState> {
    let currentState = initialState;
    let stepCount = 0;

    while (stepCount < currentState.limits.maxSteps) {
        const result = step(currentState);

        // Execute effects
        await effectHandler(result.effects);

        currentState = result.nextState;

        if (result.status === 'complete' || result.status === 'error') {
            break;
        }

        if (result.status === 'waiting') {
            // Waiting for external input (agent result)
            // Caller must handle this and call applyAgentResult
            break;
        }

        stepCount++;
    }

    return currentState;
}

/**
 * Apply agent result to state
 */
function applyAgentResult(
    state: ExecutionState,
    pathId: string,
    result: AgentResult
): ExecutionState {
    const path = getPath(state, pathId);
    if (!path) {
        throw new Error(`Path ${pathId} not found`);
    }

    let nextState = state;

    // If agent chose a transition, apply it
    if (result.nextNode) {
        const transition: Transition = {
            from: path.currentNode,
            to: result.nextNode,
            transition: 'agent_decision',
            timestamp: new Date().toISOString(),
            output: result.output
        };

        nextState = recordTransition(nextState, pathId, transition);
    }

    return nextState;
}

/**
 * Get visualization state
 *
 * Provides a complete view of multi-path execution for visualization and inspection.
 * Aggregates state across all paths and clearly shows concurrent execution.
 */
function getVisualizationState(state: ExecutionState): VisualizationState {
    const activePaths = getActivePaths(state);

    // Build node states (aggregated across all paths)
    const nodeStates: Record<string, any> = {};

    for (const path of state.paths) {
        // Aggregate visit counts
        for (const [nodeName, count] of Object.entries(path.nodeInvocationCounts)) {
            if (!nodeStates[nodeName]) {
                nodeStates[nodeName] = {
                    visitCount: 0,
                    isActive: false,
                    activeInPaths: [],
                    contextValues: {}
                };
            }
            nodeStates[nodeName].visitCount += count;
        }

        // Mark current node as active and track which paths are there
        if (path.status === 'active') {
            const currentNode = path.currentNode;
            if (!nodeStates[currentNode]) {
                nodeStates[currentNode] = {
                    visitCount: 0,
                    isActive: false,
                    activeInPaths: [],
                    contextValues: {}
                };
            }
            nodeStates[currentNode].isActive = true;
            nodeStates[currentNode].activeInPaths.push(path.id);
        }

        // Add last visited timestamp (most recent across all paths)
        if (path.history.length > 0) {
            const lastTransition = path.history[path.history.length - 1];
            if (nodeStates[lastTransition.to]) {
                const existing = nodeStates[lastTransition.to].lastVisited;
                if (!existing || lastTransition.timestamp > existing) {
                    nodeStates[lastTransition.to].lastVisited = lastTransition.timestamp;
                }
            }
        }
    }

    // Build available transitions (per active path)
    const availableTransitions: Array<{
        pathId: string;
        fromNode: string;
        toNode: string;
        isAutomatic: boolean;
        condition?: string;
    }> = [];

    for (const path of activePaths) {
        const edges = state.machineSnapshot.edges.filter(e => e.source === path.currentNode);
        for (const edge of edges) {
            const hasAutoAnnotation = edge.annotations?.some(a => a.name === 'auto');
            availableTransitions.push({
                pathId: path.id,
                fromNode: edge.source,
                toNode: edge.target,
                isAutomatic: hasAutoAnnotation || false,
                condition: edge.label
            });
        }
    }

    // Count path statuses
    const pathCounts = state.paths.reduce(
        (acc, path) => {
            if (path.status === 'active') acc.active++;
            else if (path.status === 'completed') acc.completed++;
            else if (path.status === 'failed') acc.failed++;
            return acc;
        },
        { active: 0, completed: 0, failed: 0 }
    );

    return {
        currentNodes: activePaths.map(p => ({ pathId: p.id, nodeName: p.currentNode })),
        allPaths: state.paths.map(p => ({
            id: p.id,
            currentNode: p.currentNode,
            status: p.status,
            stepCount: p.stepCount,
            history: p.history,
            startTime: p.startTime
        })),
        activePaths: activePaths.map(p => ({
            id: p.id,
            currentNode: p.currentNode,
            status: p.status,
            stepCount: p.stepCount,
            history: p.history
        })),
        nodeStates,
        stepCount: state.metadata.stepCount,
        elapsedTime: state.metadata.elapsedTime,
        errorCount: state.metadata.errorCount,
        totalPaths: state.paths.length,
        activePathCount: pathCounts.active,
        completedPathCount: pathCounts.completed,
        failedPathCount: pathCounts.failed,
        availableTransitions
    };
}

/**
 * Create checkpoint
 */
function createCheckpoint(state: ExecutionState, description?: string): Checkpoint {
    const id = `checkpoint_${Date.now()}`;

    return {
        id,
        timestamp: new Date().toISOString(),
        state: cloneState(state),
        metadata: {
            id,
            timestamp: new Date().toISOString(),
            stepCount: state.metadata.stepCount,
            description
        }
    };
}

/**
 * Restore checkpoint
 */
function restoreCheckpoint(checkpoint: Checkpoint): ExecutionState {
    return cloneState(checkpoint.state);
}
