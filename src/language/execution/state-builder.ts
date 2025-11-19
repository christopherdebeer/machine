/**
 * State Builder
 *
 * Pure functions for building and manipulating execution state.
 * All functions are immutable - they return new state objects.
 */

import type { MachineJSON } from '../json/types.js';
import type { ExecutionState, Path, Transition, PathStatus, ExecutionLimits } from './runtime-types.js';
import { EXECUTION_STATE_VERSION } from './runtime-types.js';

/**
 * Create initial execution state from machine JSON
 */
export function createInitialState(
    machineJSON: MachineJSON,
    limits: ExecutionLimits
): ExecutionState {
    // Find start node
    const startNode = findStartNode(machineJSON);

    // Create initial path
    const initialPath: Path = {
        id: 'path_0',
        currentNode: startNode,
        status: 'active',
        history: [],
        stepCount: 0,
        nodeInvocationCounts: {},
        stateTransitions: [],
        startTime: Date.now()
    };

    return {
        version: EXECUTION_STATE_VERSION,
        machineSnapshot: JSON.parse(JSON.stringify(machineJSON)), // Deep clone
        paths: [initialPath],
        limits,
        metadata: {
            stepCount: 0,
            startTime: Date.now(),
            elapsedTime: 0,
            errorCount: 0
        }
    };
}

/**
 * Find the start node of a machine
 */
function findStartNode(machineJSON: MachineJSON): string {
    // Look for node named "start" (case-insensitive)
    const startNode = machineJSON.nodes.find(
        node => node.name.toLowerCase() === 'start'
    );

    if (startNode) {
        return startNode.name;
    }

    // Otherwise, use first non-style node
    const firstNode = machineJSON.nodes.find(
        node => node.type?.toLowerCase() !== 'style'
    );

    if (!firstNode) {
        throw new Error('Machine has no executable nodes');
    }

    return firstNode.name;
}

/**
 * Create a new path in the execution state
 */
export function createPath(state: ExecutionState, startNode: string): ExecutionState {
    const pathId = `path_${state.paths.length}`;

    const newPath: Path = {
        id: pathId,
        currentNode: startNode,
        status: 'active',
        history: [],
        stepCount: 0,
        nodeInvocationCounts: {},
        stateTransitions: [],
        startTime: Date.now()
    };

    return {
        ...state,
        paths: [...state.paths, newPath]
    };
}

/**
 * Get a path by ID
 */
export function getPath(state: ExecutionState, pathId: string): Path | undefined {
    return state.paths.find(p => p.id === pathId);
}

/**
 * Update a path in the state
 */
function updatePath(state: ExecutionState, pathId: string, updater: (path: Path) => Path): ExecutionState {
    return {
        ...state,
        paths: state.paths.map(p => p.id === pathId ? updater(p) : p)
    };
}

/**
 * Update path status
 */
export function updatePathStatus(
    state: ExecutionState,
    pathId: string,
    status: PathStatus
): ExecutionState {
    return updatePath(state, pathId, path => ({
        ...path,
        status
    }));
}

/**
 * Record a transition in a path
 */
export function recordTransition(
    state: ExecutionState,
    pathId: string,
    transition: Transition
): ExecutionState {
    return updatePath(state, pathId, path => ({
        ...path,
        currentNode: transition.to,
        history: [...path.history, transition],
        stepCount: path.stepCount + 1
    }));
}

/**
 * Increment node invocation count
 */
export function incrementNodeInvocation(
    state: ExecutionState,
    pathId: string,
    nodeName: string
): ExecutionState {
    return updatePath(state, pathId, path => {
        const currentCount = path.nodeInvocationCounts[nodeName] || 0;
        return {
            ...path,
            nodeInvocationCounts: {
                ...path.nodeInvocationCounts,
                [nodeName]: currentCount + 1
            }
        };
    });
}

/**
 * Record state transition for cycle detection
 */
export function recordStateTransition(
    state: ExecutionState,
    pathId: string,
    stateName: string
): ExecutionState {
    return updatePath(state, pathId, path => ({
        ...path,
        stateTransitions: [
            ...path.stateTransitions,
            { state: stateName, timestamp: new Date().toISOString() }
        ]
    }));
}

/**
 * Update machine snapshot (for meta-programming)
 */
export function updateMachineSnapshot(
    state: ExecutionState,
    machineJSON: MachineJSON
): ExecutionState {
    return {
        ...state,
        machineSnapshot: JSON.parse(JSON.stringify(machineJSON)) // Deep clone
    };
}

/**
 * Update metadata
 */
export function updateMetadata(
    state: ExecutionState,
    updates: Partial<ExecutionState['metadata']>
): ExecutionState {
    return {
        ...state,
        metadata: {
            ...state.metadata,
            ...updates,
            elapsedTime: Date.now() - state.metadata.startTime
        }
    };
}

/**
 * Increment step count
 */
export function incrementStepCount(state: ExecutionState): ExecutionState {
    return updateMetadata(state, {
        stepCount: state.metadata.stepCount + 1
    });
}

/**
 * Increment error count
 */
export function incrementErrorCount(state: ExecutionState): ExecutionState {
    return updateMetadata(state, {
        errorCount: state.metadata.errorCount + 1
    });
}

/**
 * Get all active paths
 */
export function getActivePaths(state: ExecutionState): Path[] {
    return state.paths.filter(p => p.status === 'active');
}

/**
 * Check if there are any active paths
 */
export function hasActivePaths(state: ExecutionState): boolean {
    return getActivePaths(state).length > 0;
}

/**
 * Deep clone state (for safety)
 */
export function cloneState(state: ExecutionState): ExecutionState {
    return JSON.parse(JSON.stringify(state));
}

/**
 * Serialize state to JSON string
 */
export function serializeState(state: ExecutionState): string {
    return JSON.stringify(state, null, 2);
}

/**
 * Deserialize state from JSON string
 */
export function deserializeState(json: string): ExecutionState {
    const state = JSON.parse(json);

    // Validate version
    if (state.version !== EXECUTION_STATE_VERSION) {
        console.warn(
            `State version mismatch: expected ${EXECUTION_STATE_VERSION}, got ${state.version}. ` +
            `State may need migration.`
        );
    }

    return state;
}
