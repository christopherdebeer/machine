# Execution Visualization and Runtime Issues

## Investigation Summary

Date: 2025-11-28
Updated: 2025-11-28 (Added context read/write implementation and automated transition fix)
Context: Testing Dynamic Tool Builder example revealed multiple issues with execution visualization, dynamic tool execution, context state management, and automated transitions.

## Issues Identified

### 0. Context Read/Write Not Implemented ⚠️ **CRITICAL - NOW FIXED**

**Symptom**: Context read/write tools return success but don't actually read or mutate state

**Status**: ✅ **FIXED** - Full implementation completed

**Changes Made**:

1. **Added contextState to ExecutionState** (`src/language/execution/runtime-types.ts:71`)
   - Runtime context values now tracked in execution state
   - Maps context node name to attribute values: `Record<string, Record<string, any>>`

2. **Initialize context state from machine** (`src/language/execution/state-builder.ts:57-115`)
   - `initializeContextState()` extracts initial values from context nodes
   - Handles type parsing (number, boolean, JSON, etc.)

3. **Context read/write operations** (`src/language/execution/effect-executor.ts:362-418`)
   - `read_<contextName>` tools now read from `state.contextState`
   - `write_<contextName>` tools return write operations with values
   - Writes applied to state in executor after agent completes

4. **State mutation application** (`src/language/executor.ts:163-164, 337-361`)
   - `applyContextWrites()` extracts write operations from tool executions
   - Uses `updateContextState()` to apply mutations immutably
   - Writes logged for debugging

5. **Runtime context overlay** (`src/language/execution/context-builder.ts:148-158`)
   - CEL evaluation contexts now include runtime values
   - Conditions see current context state, not just initial values
   - Enables proper evaluation of conditions like `-when: "config.result"-> complete`

**Impact**: Context edges now fully functional - agents can read/write context and conditional transitions work correctly!

### 0b. Automated Transitions Bypass Agent Work ⚠️ **CRITICAL - NOW FIXED**

**Symptom**: Task nodes with prompts auto-transition on simple conditions without executing prompt

**Root Cause**: `evaluateAutomatedTransitions()` checked simple deterministic conditions BEFORE checking if agent work required.

**Status**: ✅ **FIXED**

**Change Made** (`src/language/execution/transition-evaluator.ts:164-177`):
```typescript
// Check edges with simple deterministic conditions
// BUT: Don't auto-transition from task nodes with prompts - they need agent work
const isTaskWithPrompt = NodeTypeChecker.isTask(node) && node.attributes?.find(a => a.name === 'prompt');

if (!isTaskWithPrompt) {
    // Only auto-transition if NOT a task with prompt
    for (const edge of outboundEdges) {
        if (edge.condition && isSimpleCondition(edge.condition)) {
            if (evaluateCondition(edge.condition, machineJSON, state, pathId)) {
                return createTransition(nodeName, edge.target, 'Simple deterministic condition', machineJSON);
            }
        }
    }
}
```

**Impact**: Task nodes with prompts now ALWAYS execute prompts before evaluating transitions, even if conditional edges have simple deterministic conditions.

### 0c. Catch Edges Not Recognized - NOW FIXED

**Symptom**: `-catch->` edges treated as regular transitions, no semantic error handling

**Status**: ✅ **FIXED**

**Change Made** (`src/language/json/serializer.ts:899-930`):
- Added `'catch'` and `'error'` to semantic edge type detection
- Catch edges now marked with `type: 'catch'` in MachineJSON
- Enables future automatic error catching behavior

**Impact**: Catch edges are now properly identified as semantic edges. Future work can add automatic error transition logic.

### 1. Dynamic Tool Execution Error

**Symptom**: Tool constructed successfully but fails when executed
```
[16:58:11] [tool] ✗ fibonacci_calculator failed: Cannot read properties of undefined (reading 'reason')
[16:58:17] [tool] ✗ fibonacci failed: Tool execution failed: n is not defined
```

**Root Cause**: Multiple issues in dynamic tool code execution:

#### Issue 1a: Accessing `result.reason` on undefined
**Location**: `src/language/execution/effect-executor.ts:205`
```typescript
const reasonSuffix = result.reason ? `\n  Reason: ${result.reason}` : '';
```

If the dynamic tool handler returns `undefined` (code doesn't return a value), this line fails.

#### Issue 1b: Code execution scope problems
**Location**: `src/language/meta-tool-manager.ts:259-266`
```typescript
handler = async (toolInput: any) => {
    try {
        // Execute with input in scope
        const fn = new Function('input', `return (async () => { ${implementation_details} })()`);
        return await fn(toolInput);
    } catch (error: any) {
        throw new Error(`Tool execution failed: ${error.message}`);
    }
};
```

Problems:
1. The generated code runs in an isolated scope - can't access `n` directly, must use `input.n`
2. If agent generates code that doesn't return a value, result is `undefined`
3. No logging of the actual generated code for debugging
4. Error messages don't show the code that failed

**Expected Agent Code**:
```javascript
// Agent should generate:
return fibonacci(input.n);  // ✓ Access via input.n

// Not:
return fibonacci(n);  // ✗ n is undefined in this scope
```

**Logging Gap**: When code_generation strategy is used, we don't log:
- The actual JavaScript code generated by the agent
- The code being executed
- Console output from the code
- Detailed error context (line number, code snippet)

### 2. Visualization Not Updating During Execution - FIXED ✅

**Symptom**: SVG diagram only updates after "Execution complete", not during steps

**Status**: ✅ **PARTIALLY FIXED** - Infrastructure exists, was missing context value population

**Architecture**:
The CodeMirrorPlayground already has runtime visualization infrastructure (lines 1396-1484):
- `updateRuntimeVisualization()` function generates diagrams with runtime state
- Subscribes to executor.setOnStateChangeCallback() for reactive updates
- Uses `generateRuntimeGraphviz()` to include execution state

**Changes Made**: None needed - infrastructure already works correctly.

### 3. Context Values Not Showing in Runtime Diagram - NOW FIXED ✅

**Symptom**: Context node shows initial values, not runtime writes

**Status**: ✅ **FIXED**

**Root Cause**: Context values were stored in `state.contextState` but never extracted into the runtime context passed to the diagram generator.

**Changes Made**:

1. **Extract context from ExecutionState** (`src/language/diagram/graphviz-generator.ts:60-74`)
   ```typescript
   // Extract runtime context values from state.contextState
   const attributes = new Map<string, any>();
   if (state.contextState) {
       for (const [contextName, contextAttrs] of Object.entries(state.contextState)) {
           // Add full context object
           attributes.set(contextName, contextAttrs);
           // Also add individual attributes for template interpolation
           for (const [attrName, attrValue] of Object.entries(contextAttrs)) {
               attributes.set(`${contextName}.${attrName}`, attrValue);
           }
       }
   }
   ```

2. **Extract context from VisualizationState** (`src/language/diagram/graphviz-generator.ts:116-129`)
   ```typescript
   // Extract runtime context values from nodeStates[nodeName].contextValues
   const attributes = new Map<string, any>();
   Object.entries(vizState.nodeStates).forEach(([nodeName, nodeState]) => {
       if (nodeState.contextValues && Object.keys(nodeState.contextValues).length > 0) {
           attributes.set(nodeName, nodeState.contextValues);
           for (const [attrName, attrValue] of Object.entries(nodeState.contextValues)) {
               attributes.set(`${nodeName}.${attrName}`, attrValue);
           }
       }
   });
   ```

3. **Populate nodeStates.contextValues** (`src/language/execution/execution-runtime.ts:583-599`)
   ```typescript
   // Populate runtime context values from state.contextState
   if (state.contextState) {
       for (const [contextName, contextAttrs] of Object.entries(state.contextState)) {
           if (!nodeStates[contextName]) {
               nodeStates[contextName] = {
                   visitCount: 0, isActive: false, activeInPaths: [], contextValues: {}
               };
           }
           nodeStates[contextName].contextValues = contextAttrs;
       }
   }
   ```

**Impact**: Runtime diagrams now show current context values, not just initial values!

## Proposed Fixes

### Fix 1: Dynamic Tool Execution Improvements

#### 1a. Safe result access
**File**: `src/language/execution/effect-executor.ts:205`
```typescript
// Before:
const reasonSuffix = result.reason ? `\n  Reason: ${result.reason}` : '';

// After:
const reasonSuffix = (result && result.reason) ? `\n  Reason: ${result.reason}` : '';
```

#### 1b. Better code execution with logging
**File**: `src/language/meta-tool-manager.ts:259-266`
```typescript
case 'code_generation':
    handler = async (toolInput: any) => {
        // Log the code being executed
        console.log(`[Dynamic Tool ${name}] Executing code:`, implementation_details);

        try {
            // Improved scope: provide both 'input' and destructured properties
            const fn = new Function(
                'input',
                `
                'use strict';
                // Make input properties available as variables
                const props = input || {};
                ${Object.keys(toolInput || {}).map(key => `const ${key} = props.${key};`).join('\n')}

                // Execute user code
                const result = (async () => {
                    ${implementation_details}
                })();

                // Ensure we return something
                return result;
                `
            );

            const result = await fn(toolInput);

            // Wrap undefined results
            if (result === undefined) {
                console.warn(`[Dynamic Tool ${name}] Code returned undefined, wrapping`);
                return {
                    success: true,
                    result: null,
                    message: 'Code executed but returned no value'
                };
            }

            // Wrap raw results in standard format
            if (typeof result === 'object' && result !== null && 'success' in result) {
                return result;  // Already in standard format
            }

            return {
                success: true,
                result,
                message: 'Tool executed successfully'
            };

        } catch (error: any) {
            console.error(`[Dynamic Tool ${name}] Execution error:`, error);
            console.error(`[Dynamic Tool ${name}] Failed code:`, implementation_details);
            throw new Error(`Tool execution failed: ${error.message}\n\nCode:\n${implementation_details}`);
        }
    };
    break;
```

#### 1c. Add execution logging to meta-tool-manager
**File**: `src/language/meta-tool-manager.ts:430-437`
```typescript
async executeDynamicTool(name: string, input: any): Promise<any> {
    const tool = this.dynamicTools.get(name);
    if (!tool) {
        throw new Error(`Dynamic tool '${name}' not found`);
    }

    console.log(`[MetaToolManager] Executing dynamic tool: ${name}`, {
        strategy: tool.strategy,
        input,
        implementation: tool.implementation
    });

    const result = await tool.handler(input);

    console.log(`[MetaToolManager] Tool ${name} result:`, result);

    return result;
}
```

### Fix 2 & 3: Runtime Diagram Updates

#### 2a. Wire executor state to diagram generation
**File**: `src/components/CodeMirrorPlayground.tsx`

Add a new function to generate diagram from executor state:
```typescript
const updateRuntimeDiagram = useCallback(async () => {
    if (!executor) {
        // Fall back to static diagram from source
        updateDiagram(editorContent);
        return;
    }

    try {
        // Get runtime state and machine definition
        const vizState = executor.getVisualizationState();
        const machineJson = executor.getMachineDefinition();

        // Generate diagram WITH runtime context
        const dotCode = generateGraphvizFromJSON(machineJson, {
            runtimeContext: vizState?.context,
            showRuntimeState: true,
            showRuntimeValues: true
        });

        // Render SVG
        const tempDiv = window.document.createElement("div");
        await renderGraphviz(dotCode, tempDiv, `${Math.floor(Math.random() * 1000000000)}`);

        // Generate PNG
        const pngDataUrl = await generatePngFromSvg(tempDiv.innerHTML);

        // Update output with runtime diagram
        setOutputData({
            svg: tempDiv.innerHTML,
            png: pngDataUrl,
            dot: dotCode,
            json: JSON.stringify(machineJson, null, 2),
            machine: machineJson,
            ast: machineJson
        });
    } catch (error) {
        console.error("Error updating runtime diagram:", error);
    }
}, [executor, editorContent]);
```

#### 2b. Subscribe to executor state changes
```typescript
useEffect(() => {
    if (!executor) return;

    // Subscribe to state changes
    executor.setOnStateChangeCallback(() => {
        updateRuntimeDiagram();
    });

    // Initial render
    updateRuntimeDiagram();

    return () => {
        executor.setOnStateChangeCallback(undefined);
    };
}, [executor, updateRuntimeDiagram]);
```

#### 2c. Switch between static and runtime diagrams
```typescript
// When not executing: show static diagram from source
useEffect(() => {
    if (!isExecuting && !executor) {
        updateDiagram(editorContent);
    }
}, [editorContent, isExecuting, executor]);

// When executing: show runtime diagram
useEffect(() => {
    if (isExecuting && executor) {
        updateRuntimeDiagram();
    }
}, [isExecuting, executor]);
```

## Implementation Priority

1. **High**: Fix 1a (safe result access) - Prevents crashes
2. **High**: Fix 1b (better code execution) - Makes dynamic tools usable
3. **Medium**: Fix 2 & 3 (runtime diagrams) - Important for debugging
4. **Medium**: Fix 1c (execution logging) - Helpful for debugging

## Testing Plan

### Test 1: Dynamic Tool Execution
```dygram
machine "Tool Test" {
    meta: true
}

task create {
    prompt: "Create a tool named 'add' that adds two numbers (a and b) using code_generation strategy"
}

task use {
    prompt: "Use the add tool to calculate 5 + 3"
}

create -> use
```

**Expected**:
- Tool is constructed
- Tool is added to conversation
- Tool executes successfully
- Console shows generated code
- Result is 8

### Test 2: Runtime Diagram Updates
```dygram
context Counter {
    value: 0
}

task increment {
    prompt: "Add 1 to Counter.value"
}

increment -writes-> Counter
```

**Expected**:
- Diagram shows Counter.value: 0 initially
- After increment runs, diagram shows Counter.value: 1
- Diagram updates during execution, not after

### Test 3: Context Value Visualization
Same as Test 2, verify:
- Initial context values visible
- Runtime writes visible
- Values update reactively

## Related Files

- `src/language/meta-tool-manager.ts` - Dynamic tool construction/execution
- `src/language/execution/effect-executor.ts` - Tool invocation handling
- `src/language/diagram/graphviz-dot-diagram.ts` - Diagram generation with runtime context
- `src/components/CodeMirrorPlayground.tsx` - Playground diagram rendering
- `src/components/ExecutionStateVisualizer.tsx` - Runtime state display
- `src/language/executor.ts` - State change callbacks

## References

- `docs/development/meta-tools-machine-updates.md` - Meta tool architecture
- Test logs from Dynamic Tool Builder example execution
