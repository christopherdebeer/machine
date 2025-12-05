# Edge Map Design: Data-Driven Fan-Out

Date: 2025-12-05
Status: Design Exploration

## Overview

This document explores implementing an "edge map" feature that spawns one path per item in an array. This complements `@async` by enabling data-driven parallelism rather than static fan-out.

## Motivation

Current `@async` fan-out is static - defined at design time:

```dy
coordinator -@async-> taskA, taskB, taskC;  # Always 3 paths
```

Data-driven fan-out spawns paths based on runtime data:

```dy
context WorkQueue {
  items: ["item1", "item2", "item3", "item4"]
}

# Spawn one path per item in WorkQueue.items
coordinator -@map(WorkQueue.items)-> processItem;  # 4 paths at runtime
```

## Syntax Options

### Option 1: @map Annotation

```dy
# Basic form - spawn path per item
task coordinator "Distribute work" -@map(WorkQueue.items)-> processItem;

# Combined with @async (fire-and-forget each)
task coordinator "Distribute work" -@async @map(WorkQueue.items)-> processItem;

# With item variable name
task coordinator "Distribute work" -@map(WorkQueue.items as item)-> processItem;
```

### Option 2: @foreach Annotation

```dy
task coordinator "Distribute work" -@foreach(WorkQueue.items)-> processItem;
```

### Option 3: Edge Attribute

```dy
task coordinator "Distribute work" -[map: WorkQueue.items]-> processItem;
```

**Recommendation**: Option 1 (`@map`) - follows existing annotation patterns, clear semantics.

## Semantics

### Path Spawning

When an edge with `@map(Context.array)` is taken:

1. Resolve `Context.array` from current execution state
2. Validate it's an array (error if not)
3. For each item in array:
   - Spawn new path at target node
   - Inject item into path's context scope

### Item Context Injection

Each spawned path needs access to its specific item. Options:

**Option A: Magic variable in context**
```typescript
// Each path gets _mapItem injected
path.contextOverlay = { _mapItem: item, _mapIndex: index };
```

**Option B: Scoped context node**
```dy
# Define item shape in context
context MapItem {
  value: any
  index: 0
}

# Each path gets its own MapItem populated
coordinator -@map(WorkQueue.items into MapItem)-> processItem;
```

**Option C: Path metadata**
```typescript
// Store in path object, not context
path.mapData = { source: "WorkQueue.items", item: item, index: index };
```

**Recommendation**: Option A for simplicity, with Option B as future enhancement.

### Empty Array Handling

Options:
1. **Skip silently** - No paths spawned, execution continues
2. **Log warning** - No paths spawned, log warning
3. **Error** - Throw error if array empty
4. **Spawn one with null** - Single path with `_mapItem: null`

**Recommendation**: Skip silently with debug log. Empty arrays are valid data.

### Non-Array Handling

If `Context.field` is not an array:
1. **Single item** - Treat scalar as single-item array `[value]`
2. **Error** - Throw validation error
3. **Skip** - Log error, don't spawn

**Recommendation**: Error - explicit arrays only, prevents subtle bugs.

## Async vs Sync Map

### @map (synchronous fan-out)

```dy
# Spawns paths, current path WAITS until all complete
coordinator -@map(items)-> process;
process -@barrier("done")-> collector;
coordinator -@barrier("done")-> collector;
```

The coordinator path enters waiting state until all mapped paths complete.

### @async @map (asynchronous fan-out)

```dy
# Spawns paths, current path continues immediately
coordinator -@async @map(items)-> process;
coordinator -> nextStep;  # Immediately continues
```

Current path continues, mapped paths run independently.

### Tool Exposure (with prompts)

For task nodes with prompts, following the async-edge-design pattern:

```
Tools available at coordinator:
- map_spawn_to_process    (spawns path per item in specified array)
- transition_to_nextStep  (regular transition)
```

Tool schema:
```typescript
{
  name: "map_spawn_to_process",
  description: "Spawn one path per item in the specified array",
  input_schema: {
    type: "object",
    properties: {
      source: {
        type: "string",
        description: "Qualified name of array (e.g., 'WorkQueue.items')"
      },
      reason: {
        type: "string",
        description: "Why spawning these paths"
      }
    },
    required: ["source"]
  }
}
```

## Barrier Integration

### Challenge

Barriers currently use `requiredPaths` set at creation time. With dynamic fan-out, the number of paths isn't known until spawn time.

### Solution: Path Groups

Introduce "path groups" for coordinated spawning:

```typescript
interface Path {
  id: string;
  groupId?: string;        // NEW: Group identifier for coordinated paths
  groupSource?: string;    // NEW: What spawned this group (e.g., "map:WorkQueue.items")
  // ... existing fields
}

interface Barrier {
  requiredPaths: string[];
  waitingPaths: string[];
  requiredGroups?: string[];   // NEW: Wait for all paths in these groups
  // ...
}
```

### Barrier Syntax Enhancement

```dy
# Wait for all paths from a specific map operation
processItem -@barrier("collect", group: "work_items")-> collector;

# Barrier that waits for group completion
coordinator -@map(WorkQueue.items, group: "work_items")-> processItem;
processItem -@barrier("collect")-> collector;
collector "Collect all results";  # Barrier knows to wait for "work_items" group
```

### Alternative: Source-Based Tracking

```typescript
// When spawning mapped paths
for (const item of items) {
  const newPath = spawnPath(state, target, {
    sourcePathId: currentPath.id,
    mapSource: "WorkQueue.items",
    mapIndex: index
  });
}

// Barrier tracks by spawn source
interface Barrier {
  requiredPaths: string[];
  waitingPaths: string[];
  awaitMapSources?: string[];  // Wait for all paths spawned from these maps
}
```

### Barrier Resolution Logic

```typescript
function isBarrierReady(barrier, state): boolean {
  // Check explicit required paths
  const pathsReady = barrier.requiredPaths.every(
    pathId => barrier.waitingPaths.includes(pathId)
  );

  // Check required groups (NEW)
  const groupsReady = (barrier.requiredGroups || []).every(groupId => {
    const groupPaths = state.paths.filter(p => p.groupId === groupId);
    return groupPaths.every(p =>
      barrier.waitingPaths.includes(p.id) || p.status === 'completed'
    );
  });

  return pathsReady && groupsReady;
}
```

## Implementation Plan

### Phase 1: Core Map Functionality

1. **Annotation Config** (`annotation-configs.ts`)
   - Add `MapAnnotationConfig` with names: `['map', 'foreach']`
   - Parse qualified name from value

2. **Map Detection** (`state-builder.ts`)
   - Add `getMapAnnotation(edge)` function
   - Returns `{ source: string, itemVar?: string, groupId?: string }`

3. **Path Spawning** (`execution-runtime.ts`)
   - In `stepPath()`, check for @map annotation
   - Resolve array from context
   - Spawn paths with item injection

4. **Context Injection** (`state-builder.ts`)
   - Add `spawnMappedPath(state, target, item, index, groupId)`
   - Inject `_mapItem` and `_mapIndex` into path context

### Phase 2: Tool Exposure

5. **Map Tools** (`effect-builder.ts`)
   - Add `buildMapTools()` for @map edges on task nodes
   - Generate `map_spawn_to_X` tools

6. **Tool Handler** (`effect-executor.ts`)
   - Handle `map_spawn_to_X` tool execution
   - Resolve array, spawn paths

### Phase 3: Barrier Integration

7. **Path Groups** (`runtime-types.ts`)
   - Add `groupId` and `groupSource` to Path type

8. **Barrier Groups** (`state-builder.ts`)
   - Extend barrier to track groups
   - Update `isBarrierReleased()` logic

9. **Barrier Syntax** (`annotation-configs.ts`)
   - Extend barrier annotation to accept group parameter

## Example Usage

### Simple Data Processing Pipeline

```dy
machine "Batch Processor" {
  maxSteps: 100
}

context BatchData {
  items: []
  results: []
}

task loadBatch "Load batch data" {
  prompt: "Load items into BatchData.items array"
}

task processItem "Process single item" {
  prompt: "Process _mapItem and store result. Current item: {{ _mapItem }}"
}

task collectResults "Aggregate results" {
  prompt: "Combine all results from BatchData.results"
}

end "Batch complete"

loadBatch -writes-> BatchData;
processItem -writes-> BatchData;

loadBatch -@map(BatchData.items)-> processItem;
processItem -@barrier("collect")-> collectResults;
collectResults -> end;
```

### Async Fan-Out with Barrier

```dy
machine "Parallel Fetcher" {
  maxSteps: 50
}

context URLs {
  endpoints: ["api1", "api2", "api3"]
}

context Results {
  responses: []
}

start "Begin fetch"

task fetchAll "Initiate parallel fetches" {
  prompt: "Review endpoints and spawn fetch operations"
}

task fetchOne "Fetch single endpoint" {
  prompt: "Fetch from {{ _mapItem }} and store response"
}

barrier sync "Wait for all fetches"

task aggregate "Combine responses" {
  prompt: "Aggregate all responses from Results.responses"
}

end "Fetch complete"

fetchOne -writes-> Results;

start -> fetchAll;
fetchAll -@async @map(URLs.endpoints, group: "fetches")-> fetchOne;
fetchAll -> sync;  # Coordinator also waits at barrier
fetchOne -@barrier("sync")-> sync;
sync -> aggregate -> end;
```

## Open Questions

1. **Nested Maps**: Should `@map` support nested arrays? `Items.*.subItems`?

2. **Map with Condition**: Should maps support filtering? `@map(Items where status == "pending")`?

3. **Result Collection**: How do mapped paths return results? Context writes? Path output?

4. **Error Handling**: If one mapped path fails, what happens to others?

5. **Ordering**: Should barrier preserve order of mapped results?

## Related Work

- **AWS Step Functions**: Map state iterates over array
- **Temporal**: `workflow.Map()` for parallel processing
- **Airflow**: Dynamic task mapping with `expand()`

## Concrete Implementation Details

### Type Additions

```typescript
// runtime-types.ts

/**
 * Map configuration parsed from @map annotation
 * Spawns one path per item in the specified array
 */
export interface MapConfig {
    source: string;      // Qualified name: "Context.items"
    itemVar?: string;    // Variable name for item (default: "_mapItem")
    groupId?: string;    // Optional group ID for barrier coordination
}

// Extended Path interface
export interface Path {
    id: string;
    currentNode: string;
    status: PathStatus;
    history: Transition[];
    stepCount: number;
    nodeInvocationCounts: Record<string, number>;
    stateTransitions: Array<{ state: string; timestamp: string }>;
    startTime: number;
    // NEW: Map-spawned path metadata
    mapContext?: {
        sourcePathId: string;     // Path that spawned this one
        mapSource: string;        // "Context.items"
        item: any;                // The actual item value
        index: number;            // Position in source array
        groupId: string;          // Group identifier for barrier
    };
}

// Extended Barrier interface
export interface Barrier {
    requiredPaths: string[];
    waitingPaths: string[];
    isReleased: boolean;
    merge: boolean;
    // NEW: Group-based tracking
    requiredGroups?: string[];    // Wait for all paths in these groups
    groupCounts?: Record<string, number>;  // Expected count per group
}
```

### Annotation Config

```typescript
// annotation-configs.ts

export const MapAnnotationConfig: AnnotationConfig<MapConfig> = {
    names: ['map', 'foreach', 'each'],
    defaultValue: { source: '' },

    parse: (match) => {
        // Attribute form: @map(source: "Items.list"; group: "batch1")
        if (match.attributes) {
            return {
                source: UnifiedAnnotationProcessor.parseString(
                    match.attributes.source,
                    ''
                ),
                itemVar: UnifiedAnnotationProcessor.parseString(
                    match.attributes.as || match.attributes.item,
                    '_mapItem'
                ),
                groupId: UnifiedAnnotationProcessor.parseString(
                    match.attributes.group,
                    undefined
                )
            };
        }

        // Value form: @map("Items.list") or @map(Items.list)
        if (match.value) {
            return {
                source: match.value.replace(/['"]/g, ''),
                itemVar: '_mapItem',
                groupId: undefined
            };
        }

        return { source: '' };
    },

    validate: (config) => {
        const errors: string[] = [];
        if (!config.source || config.source.trim() === '') {
            errors.push('Map source cannot be empty');
        }
        if (!config.source.includes('.')) {
            errors.push('Map source must be qualified (Context.field)');
        }
        return errors;
    }
};
```

### Spawning Logic

```typescript
// state-builder.ts

/**
 * Spawn multiple paths from a map operation
 * Creates one path per item in the source array
 */
export function spawnMappedPaths(
    state: ExecutionState,
    targetNode: string,
    sourcePathId: string,
    items: any[],
    mapSource: string,
    groupId?: string
): ExecutionState {
    let nextState = state;
    const actualGroupId = groupId || `map_${Date.now()}`;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const pathCount = nextState.paths.length;
        const newPathId = `path_${pathCount}`;

        const newPath: Path = {
            id: newPathId,
            currentNode: targetNode,
            status: 'active',
            history: [],
            stepCount: 0,
            nodeInvocationCounts: {},
            stateTransitions: [],
            startTime: Date.now(),
            mapContext: {
                sourcePathId,
                mapSource,
                item,
                index: i,
                groupId: actualGroupId
            }
        };

        nextState = {
            ...nextState,
            paths: [...nextState.paths, newPath]
        };
    }

    return nextState;
}

/**
 * Resolve a qualified name to a value from context
 * e.g., "WorkData.items" -> state.contextState.WorkData.items
 */
export function resolveQualifiedName(
    state: ExecutionState,
    qualifiedName: string
): any {
    const parts = qualifiedName.split('.');
    if (parts.length < 2) {
        throw new Error(`Invalid qualified name: ${qualifiedName}`);
    }

    const [contextName, ...fieldPath] = parts;
    let value = state.contextState[contextName];

    if (value === undefined) {
        throw new Error(`Context '${contextName}' not found`);
    }

    for (const field of fieldPath) {
        if (value === undefined || value === null) {
            throw new Error(`Field '${field}' not found in path ${qualifiedName}`);
        }
        value = value[field];
    }

    return value;
}
```

### Barrier Group Resolution

```typescript
// state-builder.ts

/**
 * Check if barrier is ready, considering group requirements
 */
function isBarrierReady(
    barrier: ExecutionState['barriers'][string],
    state: ExecutionState
): boolean {
    // Check explicit required paths
    const pathsReady = barrier.requiredPaths.every(
        pathId => barrier.waitingPaths.includes(pathId)
    );

    if (!pathsReady) return false;

    // Check required groups
    if (barrier.requiredGroups && barrier.requiredGroups.length > 0) {
        for (const groupId of barrier.requiredGroups) {
            // Find all paths in this group
            const groupPaths = state.paths.filter(
                p => p.mapContext?.groupId === groupId
            );

            // All group paths must be waiting or completed
            const groupReady = groupPaths.every(p =>
                barrier.waitingPaths.includes(p.id) ||
                p.status === 'completed' ||
                p.status === 'failed'
            );

            if (!groupReady) return false;
        }
    }

    return true;
}

/**
 * Register a group requirement for a barrier
 */
export function registerBarrierGroup(
    state: ExecutionState,
    barrierName: string,
    groupId: string
): ExecutionState {
    const barriers = state.barriers || {};
    const barrier = barriers[barrierName] || {
        requiredPaths: [],
        waitingPaths: [],
        isReleased: false,
        merge: false,
        requiredGroups: []
    };

    if (!barrier.requiredGroups) {
        barrier.requiredGroups = [];
    }

    if (!barrier.requiredGroups.includes(groupId)) {
        barrier.requiredGroups = [...barrier.requiredGroups, groupId];
    }

    return {
        ...state,
        barriers: {
            ...barriers,
            [barrierName]: barrier
        }
    };
}
```

### Context Overlay for Mapped Paths

```typescript
// context-builder.ts

/**
 * Build evaluation context with map item overlay
 */
function buildContextWithMapOverlay(
    baseContext: Record<string, any>,
    path: Path
): Record<string, any> {
    if (!path.mapContext) {
        return baseContext;
    }

    // Inject map item into context
    return {
        ...baseContext,
        _mapItem: path.mapContext.item,
        _mapIndex: path.mapContext.index,
        _mapSource: path.mapContext.mapSource,
        _mapGroupId: path.mapContext.groupId
    };
}
```

## Validation Requirements

Before spawning mapped paths, validate:

1. **Source exists**: `resolveQualifiedName()` finds the value
2. **Source is array**: `Array.isArray(value)`
3. **Array not empty**: `value.length > 0` (or allow empty with warning)
4. **Target node exists**: Node is valid in machine

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Source not found | Error: "Context 'X' not found" |
| Field not found | Error: "Field 'Y' not found in X.Y" |
| Not an array | Error: "Map source must be an array, got: typeof" |
| Empty array | Warning log, no paths spawned |
| Target not found | Error: "Target node 'Z' not found" |

## Next Steps

1. Validate syntax preferences with user
2. Prototype annotation parsing
3. Implement core spawning logic
4. Add barrier group support
5. Create test cases
