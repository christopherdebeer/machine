/**
 * State Builder
 *
 * Pure functions for building and manipulating execution state.
 * All functions are immutable - they return new state objects.
 */

import type { MachineJSON } from '../json/types.js';
import type { ExecutionState, Path, Transition, PathStatus, ExecutionLimits, BarrierConfig, AsyncConfig, MapConfig, MapContext } from './runtime-types.js';
import { EXECUTION_STATE_VERSION } from './runtime-types.js';
import { BarrierAnnotationConfig, AsyncAnnotationConfig, MapAnnotationConfig } from './annotation-configs.js';
import { UnifiedAnnotationProcessor } from './unified-annotation-processor.js';

/**
 * Create initial execution state from machine JSON
 * Supports multiple start nodes for concurrent path execution
 */
export function createInitialState(
    machineJSON: MachineJSON,
    limits: ExecutionLimits
): ExecutionState {
    // Find all start nodes
    const startNodes = findStartNodes(machineJSON);

    if (startNodes.length === 0) {
        throw new Error('Machine has no start nodes');
    }

    // Create a path for each start node (concurrent execution)
    const initialPaths: Path[] = startNodes.map((nodeName, index) => ({
        id: `path_${index}`,
        currentNode: nodeName,
        status: 'active' as PathStatus,
        history: [],
        stepCount: 0,
        nodeInvocationCounts: {},
        stateTransitions: [],
        startTime: Date.now()
    }));

    // Initialize context state from context nodes in machine
    const contextState = initializeContextState(machineJSON);

    return {
        version: EXECUTION_STATE_VERSION,
        machineSnapshot: JSON.parse(JSON.stringify(machineJSON)), // Deep clone
        paths: initialPaths,
        limits,
        metadata: {
            stepCount: 0,
            startTime: Date.now(),
            elapsedTime: 0,
            errorCount: 0
        },
        contextState,
        barriers: {} // Initialize empty barriers
    };
}

/**
 * Initialize context state from context nodes in machine
 * Extracts initial attribute values from all context nodes
 */
function initializeContextState(machineJSON: MachineJSON): Record<string, Record<string, any>> {
    const contextState: Record<string, Record<string, any>> = {};

    // Find all context nodes
    const contextNodes = machineJSON.nodes.filter(
        node => node.type?.toLowerCase() === 'context'
    );

    for (const node of contextNodes) {
        if (node.attributes && node.attributes.length > 0) {
            contextState[node.name] = {};
            for (const attr of node.attributes) {
                // Parse attribute value with type handling
                let value = attr.value;
                if (typeof value === 'string') {
                    // Clean quotes
                    const cleanValue = value.replace(/^["']|["']$/g, '');

                    // Type-specific parsing
                    switch (attr.type) {
                        case 'number':
                        case 'integer':
                        case 'int':
                        case 'float':
                        case 'double':
                            value = Number(cleanValue);
                            break;
                        case 'boolean':
                            value = cleanValue.toLowerCase() === 'true';
                            break;
                        case 'json':
                        case 'object':
                        case 'array':
                            try {
                                value = JSON.parse(value);
                            } catch {
                                value = cleanValue;
                            }
                            break;
                        default:
                            // Try to auto-detect
                            try {
                                value = JSON.parse(value);
                            } catch {
                                value = cleanValue;
                            }
                    }
                }
                contextState[node.name][attr.name] = value;
            }
        }
    }

    return contextState;
}

/**
 * Find all start nodes of a machine
 *
 * A node is considered a start node if it:
 * 1. Has the name "start" (case-insensitive), OR
 * 2. Has the @start annotation, OR
 * 3. Has no incoming edges (entry point)
 *
 * If no explicit start nodes are found, returns the first non-style node.
 */
function findStartNodes(machineJSON: MachineJSON): string[] {
    const startNodes: string[] = [];

    // 1. Find nodes named "start"
    const namedStarts = machineJSON.nodes.filter(
        node => node.name.toLowerCase() === 'start'
    );
    startNodes.push(...namedStarts.map(n => n.name));

    // 2. Find nodes with @start annotation
    const annotatedStarts = machineJSON.nodes.filter(node =>
        node.annotations?.some(a => a.name === 'start')
    );
    startNodes.push(...annotatedStarts.map(n => n.name));

    // If we found explicit start nodes, return them (deduplicated)
    if (startNodes.length > 0) {
        return Array.from(new Set(startNodes));
    }

    // 3. Find nodes with no incoming edges (entry points)
    const nodesWithIncomingEdges = new Set(
        machineJSON.edges.map(edge => edge.target)
    );

    const entryPoints = machineJSON.nodes.filter(node => {
        // Skip style nodes and context nodes
        if (node.type?.toLowerCase() === 'style' || node.type?.toLowerCase() === 'context') {
            return false;
        }
        // Node is an entry point if it has no incoming edges
        return !nodesWithIncomingEdges.has(node.name);
    });

    if (entryPoints.length > 0) {
        return entryPoints.map(n => n.name);
    }

    // Fallback: use first non-style, non-context node
    const firstNode = machineJSON.nodes.find(
        node => node.type?.toLowerCase() !== 'style' && node.type?.toLowerCase() !== 'context'
    );

    if (!firstNode) {
        return []; // No executable nodes
    }

    return [firstNode.name];
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
 * Update context state (immutable)
 * Returns new state with updated context values
 */
export function updateContextState(
    state: ExecutionState,
    contextName: string,
    updates: Record<string, any>
): ExecutionState {
    const newContextState = {
        ...state.contextState,
        [contextName]: {
            ...(state.contextState[contextName] || {}),
            ...updates
        }
    };

    return {
        ...state,
        contextState: newContextState
    };
}

/**
 * Get context values from state
 * Returns the runtime context values for a specific context node
 */
export function getContextValues(
    state: ExecutionState,
    contextName: string
): Record<string, any> {
    return state.contextState[contextName] || {};
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

/**
 * Barrier Synchronization Functions
 */

/**
 * Create or get a barrier for synchronization
 * Barriers are automatically created with ALL path IDs (not just active ones)
 * because barrier synchronization applies to all paths in a multi-path execution
 */
export function ensureBarrier(state: ExecutionState, barrierName: string, merge: boolean = false): ExecutionState {
    if (!state.barriers) {
        state = { ...state, barriers: {} };
    }

    if (!state.barriers[barrierName]) {
        // Barriers require ALL paths to synchronize (active or not)
        // This includes paths that may have completed or failed before reaching the barrier
        // Only count paths that could potentially reach the barrier (active + waiting)
        const allPaths = state.paths
            .filter(p => p.status === 'active' || p.status === 'waiting')
            .map(p => p.id);

        return {
            ...state,
            barriers: {
                ...state.barriers,
                [barrierName]: {
                    requiredPaths: allPaths,
                    waitingPaths: [],
                    isReleased: false,
                    merge
                }
            }
        };
    }

    return state;
}

/**
 * Merge multiple paths into the continuing path
 * Other paths are marked as 'completed' after merge
 * Context values and attributes are preserved (paths don't carry data themselves)
 * @param continuingPathId The path that continues after merge (usually the one that released the barrier)
 */
function mergePaths(state: ExecutionState, pathIds: string[], continuingPathId: string): ExecutionState {
    if (pathIds.length <= 1) return state; // Nothing to merge

    return {
        ...state,
        paths: state.paths.map(path => {
            if (pathIds.includes(path.id) && path.id !== continuingPathId) {
                // Mark other paths as completed (merged into continuing path)
                return {
                    ...path,
                    status: 'completed' as PathStatus
                };
            }
            return path;
        })
    };
}

/**
 * Spawn a new execution path at the specified node
 * Used by @async annotation to create parallel execution paths
 * @param state Current execution state
 * @param startNode Node where the new path should start
 * @param sourcePathId Optional source path ID (for tracking spawn relationships)
 * @returns New execution state with spawned path added
 */
export function spawnPath(state: ExecutionState, startNode: string, sourcePathId?: string): ExecutionState {
    // Generate unique path ID
    const pathCount = state.paths.length;
    const newPathId = `path_${pathCount}`;

    // Create new path starting at the specified node
    const newPath: Path = {
        id: newPathId,
        currentNode: startNode,
        status: 'active' as PathStatus,
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
 * Mark a path as waiting at a barrier
 * Returns [newState, isReleased] where isReleased indicates if barrier is now complete
 */
export function waitAtBarrier(
    state: ExecutionState,
    barrierName: string,
    pathId: string,
    merge: boolean = false
): [ExecutionState, boolean] {
    // Ensure barrier exists
    state = ensureBarrier(state, barrierName, merge);

    const barrier = state.barriers![barrierName];

    // If barrier already released, path can proceed
    if (barrier.isReleased) {
        return [state, true];
    }

    // Add path to waiting set if not already there
    if (!barrier.waitingPaths.includes(pathId)) {
        barrier.waitingPaths.push(pathId);
    }

    // Check if all required paths are now waiting
    const allWaiting = barrier.requiredPaths.every(
        requiredPath => barrier.waitingPaths.includes(requiredPath)
    );

    // Release barrier if all paths have arrived
    if (allWaiting) {
        let nextState = {
            ...state,
            barriers: {
                ...state.barriers!,
                [barrierName]: {
                    ...barrier,
                    isReleased: true
                }
            }
        };

        // If merge=true, merge all waiting paths into the current path (the one releasing the barrier)
        if (barrier.merge) {
            nextState = mergePaths(nextState, barrier.waitingPaths, pathId);
        }

        return [nextState, true];
    }

    // Barrier not ready, path must wait
    return [
        {
            ...state,
            barriers: {
                ...state.barriers!,
                [barrierName]: {
                    ...barrier
                }
            }
        },
        false
    ];
}

/**
 * Check if a barrier is released
 */
export function isBarrierReleased(state: ExecutionState, barrierName: string): boolean {
    return state.barriers?.[barrierName]?.isReleased ?? false;
}

/**
 * Get barrier configuration from edge annotations
 * Supports aliases with smart defaults:
 * - Sync-only: @barrier, @wait, @sync (merge: false by default)
 * - Merge: @join, @merge (merge: true by default)
 *
 * Supports three forms:
 * - Simple: @barrier -> { id: "default", merge: false }
 * - Value: @barrier("sync_point") -> { id: "sync_point", merge: false }
 * - Attributes: @barrier(id: "sync_point"; merge: true) -> { id: "sync_point", merge: true }
 *
 * Returns null if no barrier annotation found
 */
export function getBarrierAnnotation(edge: { annotations?: Array<{ name: string; value?: string; qualifiedValue?: string; attributes?: Record<string, unknown> }> }): BarrierConfig | null {
    return UnifiedAnnotationProcessor.process(
        edge.annotations,
        BarrierAnnotationConfig
    );
}

/**
 * Get async configuration from edge annotations
 * Supports aliases: @async, @spawn, @parallel, @fork
 * Returns null if no async annotation found
 */
export function getAsyncAnnotation(edge: { annotations?: Array<{ name: string; value?: string; qualifiedValue?: string; attributes?: Record<string, unknown> }> }): AsyncConfig | null {
    return UnifiedAnnotationProcessor.process(
        edge.annotations,
        AsyncAnnotationConfig
    );
}

/**
 * Get map configuration from edge annotations
 * Supports aliases: @map, @foreach, @each
 * Returns null if no map annotation found
 */
export function getMapAnnotation(edge: { annotations?: Array<{ name: string; value?: string; qualifiedValue?: string; attributes?: Record<string, unknown> }> }): MapConfig | null {
    return UnifiedAnnotationProcessor.process(
        edge.annotations,
        MapAnnotationConfig
    );
}

/**
 * Resolve a qualified name to a value from context state
 * e.g., "WorkData.items" -> state.contextState.WorkData.items
 *
 * @param state Current execution state
 * @param qualifiedName Dot-separated path (e.g., "Context.items")
 * @returns The resolved value
 * @throws Error if context or field not found
 */
export function resolveQualifiedName(
    state: ExecutionState,
    qualifiedName: string
): any {
    const parts = qualifiedName.split('.');
    if (parts.length < 2) {
        throw new Error(`Invalid qualified name: ${qualifiedName}. Expected format: Context.field`);
    }

    const [contextName, ...fieldPath] = parts;
    let value = state.contextState?.[contextName];

    if (value === undefined) {
        throw new Error(`Context '${contextName}' not found in state`);
    }

    for (const field of fieldPath) {
        if (value === undefined || value === null) {
            throw new Error(`Field '${field}' not found in path ${qualifiedName}`);
        }
        value = value[field];
    }

    return value;
}

/**
 * Spawn multiple paths from a map operation
 * Creates one path per item in the source array
 *
 * @param state Current execution state
 * @param targetNode Node where spawned paths should start
 * @param sourcePathId ID of the path that triggered the spawn
 * @param items Array of items to spawn paths for
 * @param mapSource Qualified name of the source array (for tracking)
 * @param groupId Optional group ID for barrier coordination (auto-generated if not provided)
 * @returns New execution state with spawned paths added
 */
export function spawnMappedPaths(
    state: ExecutionState,
    targetNode: string,
    sourcePathId: string,
    items: any[],
    mapSource: string,
    groupId?: string
): ExecutionState {
    if (!Array.isArray(items)) {
        throw new Error(`Map source must be an array, got: ${typeof items}`);
    }

    if (items.length === 0) {
        // Empty array - no paths to spawn, return state unchanged
        // This is valid behavior (e.g., empty work queue)
        return state;
    }

    let nextState = state;
    const actualGroupId = groupId || `map_${mapSource.replace(/\./g, '_')}_${Date.now()}`;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const pathCount = nextState.paths.length;
        const newPathId = `path_${pathCount}`;

        const mapContext: MapContext = {
            sourcePathId,
            mapSource,
            item,
            index: i,
            groupId: actualGroupId
        };

        const newPath: Path = {
            id: newPathId,
            currentNode: targetNode,
            status: 'active' as PathStatus,
            history: [],
            stepCount: 0,
            nodeInvocationCounts: {},
            stateTransitions: [],
            startTime: Date.now(),
            mapContext
        };

        nextState = {
            ...nextState,
            paths: [...nextState.paths, newPath]
        };
    }

    return nextState;
}

/**
 * Get the map context overlay for a path
 * Provides _mapItem, _mapIndex, etc. variables for CEL/template evaluation
 *
 * @param path The execution path
 * @returns Context overlay with map variables, or empty object if not a mapped path
 */
export function getMapContextOverlay(path: Path): Record<string, any> {
    if (!path.mapContext) {
        return {};
    }

    return {
        _mapItem: path.mapContext.item,
        _mapIndex: path.mapContext.index,
        _mapSource: path.mapContext.mapSource,
        _mapGroupId: path.mapContext.groupId
    };
}

/**
 * Register a group requirement for a barrier
 * Used to track paths spawned from @map that should synchronize at a barrier
 */
export function registerBarrierGroup(
    state: ExecutionState,
    barrierName: string,
    groupId: string
): ExecutionState {
    if (!state.barriers) {
        state = { ...state, barriers: {} };
    }

    const barrier = state.barriers[barrierName] || {
        requiredPaths: [],
        waitingPaths: [],
        isReleased: false,
        merge: false,
        requiredGroups: []
    };

    // Add requiredGroups if not present
    const requiredGroups = (barrier as any).requiredGroups || [];
    if (!requiredGroups.includes(groupId)) {
        return {
            ...state,
            barriers: {
                ...state.barriers,
                [barrierName]: {
                    ...barrier,
                    requiredGroups: [...requiredGroups, groupId]
                }
            }
        };
    }

    return state;
}

/**
 * Get all paths belonging to a specific map group
 */
export function getPathsInGroup(state: ExecutionState, groupId: string): Path[] {
    return state.paths.filter(p => p.mapContext?.groupId === groupId);
}
