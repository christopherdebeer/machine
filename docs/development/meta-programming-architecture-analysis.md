# Meta-Programming Architecture Analysis: Dynamic Tools

## Problem Statement

**Current Behavior**: Dynamic tools are created just-in-time during execution and exist only in memory. They disappear when execution ends.

**Desired Behavior**: Meta operations should alter the machine definition itself. Dynamic tools should become permanent nodes in the machine, persisted across executions.

## Current Implementation Analysis

### How construct_tool Works Today

**Location**: `src/language/meta-tool-manager.ts:223-382`

```typescript
async constructTool(input: {...}): Promise<any> {
    // 1. Create handler (agent_backed, code_generation, or composition)
    let handler: (input: any) => Promise<any>;
    // ... strategy-specific handler creation ...

    // 2. Store in memory (EPHEMERAL!)
    const dynamicTool: DynamicTool = {
        definition: { name, description, input_schema },
        handler,
        created: new Date().toISOString(),
        strategy: implementation_strategy,
        implementation: implementation_details
    };
    this.dynamicTools.set(name, dynamicTool);  // ← In-memory Map

    // 3. Register with ToolRegistry (also in-memory)
    if (this.toolRegistry) {
        this.toolRegistry.registerStatic(dynamicTool.definition, handler);
    }

    // 4. Record mutation event (but doesn't update machine definition!)
    this.onMutation({
        type: 'add_node',
        data: { mutationType: 'tool_constructed', tool: {...} }
    });

    // ❌ MISSING: No update to _machineData
    // ❌ MISSING: No tool node added to machine definition
    // ❌ MISSING: No onMachineUpdate callback
    // ❌ MISSING: No DSL generation

    return { success: true, message: `Tool '${name}' constructed` };
}
```

### What Happens to the Tool

1. ✅ **During execution**: Tool exists in `dynamicTools` Map and ToolRegistry
2. ✅ **Agent can use it**: Registered tools are available for agent invocation
3. ❌ **After execution**: Map is cleared, tool is gone
4. ❌ **Next execution**: Tool doesn't exist, agent must recreate it
5. ❌ **Machine definition**: Never modified, no tool node created

### Comparison with update_definition

**How update_definition DOES persist changes** (`meta-tool-manager.ts:487-546`):

```typescript
async updateDefinition(input: { machine: any; reason: string }): Promise<any> {
    // 1. Validate structure
    if (!machine.title || !Array.isArray(machine.nodes) || !Array.isArray(machine.edges)) {
        return { success: false, message: 'Invalid machine structure' };
    }

    // 2. Update internal machine data (PERSISTS!)
    const canonicalFields = ['title', 'attributes', 'annotations', 'nodes', 'edges', ...];
    canonicalFields.forEach(field => {
        (this._machineData as any)[field] = (updatedMachine as any)[field];
    });

    // 3. Generate DSL from updated JSON
    const { generateDSL } = await import('./generator/generator.js');
    const dsl = generateDSL(this._machineData);

    // 4. Record mutation
    this.onMutation({
        type: 'modify_node',
        data: { mutationType: 'machine_updated', reason, machine: {...} }
    });

    // 5. Notify callback → updates currentState.machineSnapshot
    if (this.onMachineUpdate) {
        this.onMachineUpdate(dsl, this._machineData);
        // ↑ This updates executor.currentState.machineSnapshot
        // ↑ This calls user callback with new DSL
    }

    return { success: true, message: 'Machine definition updated', dsl };
}
```

**Key Difference**: `update_definition` modifies `_machineData` and calls `onMachineUpdate`, while `construct_tool` does neither.

## Architectural Gap

### The Vision: Meta-Programming

From the DyGram meta-programming vision:
- **Meta operations should alter the machine definition**
- Tools created dynamically should become **permanent nodes**
- Machine should **evolve during execution**
- Changes should **persist across executions**

### Current Reality

**construct_tool** creates ephemeral, in-memory tools that:
- ❌ Don't modify the machine definition (MachineJSON)
- ❌ Don't create tool nodes
- ❌ Don't update the DSL source
- ❌ Don't persist beyond execution
- ❌ Must be recreated on every execution

**update_definition** modifies the entire machine definition but:
- ⚠️ Requires agent to manually construct the full machine JSON
- ⚠️ Agent must manually add tool nodes themselves
- ⚠️ No abstraction for "just add this tool"

## What a Tool Node Looks Like

### Example: Tool Node in Machine Definition

```dygram
machine "Dynamic Tool Example"

tool fibonacci_calculator {
    description: "Calculate Fibonacci number for given n"
    input_schema: {
        type: "object"
        properties: {
            n: { type: "number", description: "Position in Fibonacci sequence" }
        }
        required: ["n"]
    }
    implementation_strategy: "code_generation"
    implementation: """
        function fib(n) {
            if (n <= 1) return n;
            return fib(n-1) + fib(n-2);
        }
        return { result: fib(n) };
    """
}
```

### Corresponding MachineJSON Structure

```json
{
    "title": "Dynamic Tool Example",
    "nodes": [
        {
            "name": "fibonacci_calculator",
            "type": "tool",
            "description": "Calculate Fibonacci number for given n",
            "attributes": [
                {
                    "name": "input_schema",
                    "value": {
                        "type": "object",
                        "properties": {
                            "n": { "type": "number", "description": "Position in Fibonacci sequence" }
                        },
                        "required": ["n"]
                    },
                    "type": "json"
                },
                {
                    "name": "implementation_strategy",
                    "value": "code_generation",
                    "type": "string"
                },
                {
                    "name": "implementation",
                    "value": "function fib(n) { ... }",
                    "type": "string"
                }
            ]
        }
    ],
    "edges": []
}
```

## Proposed Solution

### Architecture Changes

**construct_tool should behave like update_definition:**

1. **Create tool node in MachineJSON**
   ```typescript
   const toolNode = {
       name: input.name,
       type: 'tool',
       description: input.description,
       attributes: [
           { name: 'input_schema', value: input.input_schema, type: 'json' },
           { name: 'implementation_strategy', value: input.implementation_strategy, type: 'string' },
           { name: 'implementation', value: input.implementation_details, type: 'string' }
       ]
   };
   ```

2. **Add node to machine definition**
   ```typescript
   this._machineData.nodes.push(toolNode);
   ```

3. **Generate updated DSL**
   ```typescript
   const { generateDSL } = await import('./generator/generator.js');
   const dsl = generateDSL(this._machineData);
   ```

4. **Persist changes**
   ```typescript
   if (this.onMachineUpdate) {
       this.onMachineUpdate(dsl, this._machineData);
   }
   ```

5. **Still create handler for immediate use**
   ```typescript
   // Tool is now BOTH in the machine definition AND available as handler
   this.dynamicTools.set(name, dynamicTool);
   if (this.toolRegistry) {
       this.toolRegistry.registerStatic(dynamicTool.definition, handler);
   }
   ```

### Execution Flow (After Fix)

```
Agent calls construct_tool("fibonacci_calculator")
    ↓
MetaToolManager.constructTool():
    1. Create tool node JSON
    2. Add to _machineData.nodes
    3. Generate updated DSL
    4. Call onMachineUpdate(dsl, _machineData)
        ↓
        → Updates executor.currentState.machineSnapshot (tool now in machine!)
        → Calls user callback with new DSL (playground can save to editor)
    5. Create handler and register for immediate use
    ↓
Return success

Subsequent execution step:
    - Runtime sees tool node in state.machineSnapshot
    - Can extract handler from tool node attributes
    - Tool is permanent part of the machine
```

### Tool Initialization on Execution Start

When execution starts with a machine that has tool nodes:

**Location**: `src/language/executor.ts` or initialization logic

```typescript
// During executor initialization
function initializeToolsFromMachine(machineJSON: MachineJSON) {
    const toolNodes = machineJSON.nodes.filter(n => n.type === 'tool');

    for (const toolNode of toolNodes) {
        // Extract tool definition from node attributes
        const name = toolNode.name;
        const description = toolNode.description || '';
        const input_schema = toolNode.attributes.find(a => a.name === 'input_schema')?.value;
        const implementation_strategy = toolNode.attributes.find(a => a.name === 'implementation_strategy')?.value;
        const implementation = toolNode.attributes.find(a => a.name === 'implementation')?.value;

        // Construct handler based on strategy
        const handler = createHandlerFromStrategy(implementation_strategy, implementation);

        // Register tool
        metaToolManager.registerToolFromNode(name, description, input_schema, handler);
    }
}
```

## Implementation Checklist

- [ ] Modify `MetaToolManager.constructTool()` to create tool node
- [ ] Add tool node to `_machineData.nodes`
- [ ] Generate updated DSL and call `onMachineUpdate`
- [ ] Add `MetaToolManager.registerToolFromNode()` helper
- [ ] Add tool initialization in executor startup
- [ ] Update grammar to support `tool` node type (if not already)
- [ ] Update DSL generator to serialize tool nodes
- [ ] Test: Create tool → execution ends → new execution → tool still exists
- [ ] Test: Tool node appears in machine definition JSON and DSL
- [ ] Document: Tool node syntax and attributes

## Benefits of This Approach

1. **Persistence**: Tools survive across executions
2. **Inspectability**: Tools visible in machine definition
3. **Editability**: Users can edit tool implementations in DSL
4. **Shareability**: Machines with tools can be shared as DSL files
5. **Consistency**: Tool creation works like other machine updates
6. **Meta-programming vision**: Machine truly evolves during execution

## Related Work

- **update_definition**: Pattern to follow for persisting changes
- **Tool nodes in grammar**: May need to define tool node type
- **DSL generator**: May need to handle tool node serialization
- **ToolRegistry**: Continue using for runtime tool execution
- **Machine snapshots**: Ensures tools available during execution

## References

- `src/language/meta-tool-manager.ts` - Current construct_tool implementation
- `docs/development/meta-tools-machine-updates.md` - How machine updates work
- `src/language/executor.ts` - Meta-tool manager integration
- Grammar and DSL generation for tool nodes (TBD)
