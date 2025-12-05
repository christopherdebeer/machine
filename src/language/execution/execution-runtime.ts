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
    updateMachineSnapshot,
    ensureBarrier,
    waitAtBarrier,
    isBarrierReleased,
    getBarrierAnnotation,
    spawnPath,
    getAsyncAnnotation
} from './state-builder.js';
import {
    evaluateAutomatedTransitions,
    requiresAgentDecision,
    getNodeAttributes,
    getParallelEdges,
    getNonAutomatedTransitions
} from './transition-evaluator.js';
import {
    buildLLMEffect,
    buildLogEffect,
    buildCompleteEffect,
    buildErrorEffect,
    buildTools
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
        // Check if transition edge has annotations
        const edge = machineJSON.edges.find(
            e => e.source === nodeName && e.target === autoTransition.to
        );

        // Check for @async annotation (spawn new path)
        const asyncConfig = edge ? getAsyncAnnotation(edge) : null;
        if (asyncConfig && asyncConfig.enabled) {
            // Spawn a new path at the target node
            nextState = spawnPath(nextState, autoTransition.to, path.id);

            effects.push(buildLogEffect(
                'info',
                'async',
                `Spawned new path at ${autoTransition.to}`,
                { sourcePathId: path.id, newPathId: nextState.paths[nextState.paths.length - 1].id, targetNode: autoTransition.to }
            ));
        }

        // Check for @barrier annotation
        const barrierConfig = edge ? getBarrierAnnotation(edge) : null;

        if (barrierConfig) {
            // Barrier synchronization: check if all paths have arrived
            const [stateAfterWait, isReleased] = waitAtBarrier(nextState, barrierConfig.id, path.id, barrierConfig.merge);
            nextState = stateAfterWait;

            if (isReleased) {
                // Barrier released: all paths have arrived
                const barrier = nextState.barriers![barrierConfig.id];

                if (barrier.merge) {
                    // Paths merged: other paths are now completed
                    effects.push(buildLogEffect(
                        'info',
                        'barrier',
                        `Barrier '${barrierConfig.id}' released - paths merged into ${path.id}`,
                        { pathId: path.id, barrier: barrierConfig.id, merged: true }
                    ));
                } else {
                    // Sync-only: reactivate all waiting paths
                    effects.push(buildLogEffect(
                        'info',
                        'barrier',
                        `Barrier '${barrierConfig.id}' released - all paths synchronized`,
                        { pathId: path.id, barrier: barrierConfig.id }
                    ));

                    for (const waitingPathId of barrier.waitingPaths) {
                        if (waitingPathId !== path.id) {
                            // Reactivate other waiting paths (current path is already proceeding)
                            nextState = updatePathStatus(nextState, waitingPathId, 'active');
                            effects.push(buildLogEffect(
                                'info',
                                'barrier',
                                `Path reactivated after barrier release`,
                                { pathId: waitingPathId, barrier: barrierConfig.id }
                            ));
                        }
                    }
                }

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
            } else {
                // Barrier not ready: path must wait
                nextState = updatePathStatus(nextState, path.id, 'waiting');

                effects.push(buildLogEffect(
                    'info',
                    'barrier',
                    `Path waiting at barrier '${barrierConfig.id}'`,
                    {
                        pathId: path.id,
                        barrier: barrierConfig.id,
                        waitingCount: nextState.barriers?.[barrierConfig.id]?.waitingPaths.length,
                        requiredCount: nextState.barriers?.[barrierConfig.id]?.requiredPaths.length
                    }
                ));

                return {
                    nextState,
                    effects,
                    status: 'waiting'
                };
            }
        }

        // No barrier: proceed with normal automated transition
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

    // Check if agent decision required FIRST (before checking transitions)
    // This ensures task nodes with prompts execute their work before considering transitions
    if (requiresAgentDecision(machineJSON, nodeName)) {
        // Build tools to determine if node has actual work to do beyond transition selection
        const tools = buildTools(machineJSON, nextState, path.id, nodeName);

        // Count transition tools vs other tools
        const transitionTools = tools.filter(t => t.name.startsWith('transition_to_'));
        const nonTransitionTools = tools.filter(t => !t.name.startsWith('transition_to_'));

        // Optimization: Skip LLM if only work is selecting a single transition
        // This happens when:
        // - No context write tools (no actual work to perform)
        // - No meta tools (no machine modifications)
        // - Only 1 transition tool (no choice to make)
        if (nonTransitionTools.length === 0 && transitionTools.length === 1) {
            // Auto-take the single transition without LLM invocation
            const transitionTarget = transitionTools[0].name.replace('transition_to_', '');
            effects.push(buildLogEffect(
                'info',
                'transition',
                `Single transition with no other work: ${nodeName} -> ${transitionTarget} (auto-taking, skipping LLM)`,
                { reason: 'Only transition tool available, no context writes or meta operations' }
            ));

            nextState = recordTransition(nextState, path.id, {
                from: nodeName,
                to: transitionTarget,
                transition: 'default'
            });

            return {
                nextState,
                effects,
                status: 'continue'
            };
        }

        // TODO: Terminal nodes with prompts but no tools could represent implicit meta-tasks
        // (e.g., "summarize execution", "validate results"). Consider whether these should
        // generate implicit meta-tool invocations or be validated at parse time.

        // Node has actual work to do - invoke LLM
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

    // No agent decision needed - check for @async edges that should auto-spawn
    // This only runs for nodes WITHOUT prompts (state nodes, orchestration nodes)
    const allOutboundEdges = machineJSON.edges.filter(e => e.source === nodeName);
    const asyncEdges = allOutboundEdges.filter(e => {
        const asyncConfig = getAsyncAnnotation(e);
        return asyncConfig && asyncConfig.enabled;
    });

    // If ALL outbound edges have @async, auto-spawn paths for all targets
    // This is safe because the node has no prompt (no agent work to skip)
    if (asyncEdges.length > 0 && asyncEdges.length === allOutboundEdges.length) {
        effects.push(buildLogEffect(
            'info',
            'async',
            `Auto-spawning ${asyncEdges.length} parallel paths from ${nodeName} (no agent decision needed)`,
            { sourceNode: nodeName, targets: asyncEdges.map(e => e.target) }
        ));

        // Spawn a new path for each async edge
        for (const edge of asyncEdges) {
            nextState = spawnPath(nextState, edge.target, path.id);
            const newPathId = nextState.paths[nextState.paths.length - 1].id;

            effects.push(buildLogEffect(
                'info',
                'async',
                `Spawned path ${newPathId} at ${edge.target}`,
                { sourcePathId: path.id, newPathId, targetNode: edge.target }
            ));
        }

        // Mark original path as completed (all work delegated to spawned paths)
        nextState = updatePathStatus(nextState, path.id, 'completed');

        effects.push(buildLogEffect(
            'info',
            'async',
            `Original path ${path.id} completed after spawning ${asyncEdges.length} paths`,
            { pathId: path.id, spawnedCount: asyncEdges.length }
        ));

        return {
            nextState,
            effects,
            status: 'continue'
        };
    }

    // Check for single non-automated transition (auto-take it)
    // This optimization only applies to nodes that don't require agent work
    const nonAutomatedTransitions = getNonAutomatedTransitions(machineJSON, nextState, path.id);
    if (nonAutomatedTransitions.length === 1) {
        const transition = nonAutomatedTransitions[0];
        effects.push(buildLogEffect(
            'info',
            'transition',
            `Single transition available: ${nodeName} -> ${transition.target} (auto-taking)`,
            { reason: 'Only one transition available' }
        ));

        nextState = recordTransition(nextState, path.id, {
            from: nodeName,
            to: transition.target,
            transition: transition.condition || 'default'
        });

        return {
            nextState,
            effects,
            status: 'continue'
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

    // Populate runtime context values from state.contextState
    // For context nodes, add their runtime values to nodeStates
    if (state.contextState) {
        for (const [contextName, contextAttrs] of Object.entries(state.contextState)) {
            // Ensure the context node has an entry in nodeStates
            if (!nodeStates[contextName]) {
                nodeStates[contextName] = {
                    visitCount: 0,
                    isActive: false,
                    activeInPaths: [],
                    contextValues: {}
                };
            }
            // Populate the contextValues with runtime values
            nodeStates[contextName].contextValues = contextAttrs;
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
