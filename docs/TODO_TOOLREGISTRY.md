# ToolRegistry Integration TODO

This document outlines the remaining work needed to complete the ToolRegistry integration (Task 5 of Epic #146).

## Current Status

✅ **Complete:**
- Created `ToolRegistry` class in `src/language/tool-registry.ts`
- Implements static tool registration
- Implements dynamic pattern matching
- Provides unified execution interface
- Includes tool querying and filtering methods

⏳ **Pending:**
- Integration with RailsExecutor
- Integration with AgentSDKBridge
- Integration with MetaToolManager
- Removal of duplicate dispatch logic
- Testing and validation

## Integration Plan

### 1. Update RailsExecutor (`src/language/rails-executor.ts`)

**Current State:**
- Lines 405-510 contain tool dispatch logic
- Handles transition tools (`transition_to_*`)
- Handles context read tools (`read_*`)
- Handles context write tools (`write_*`)
- Delegates to `agentSDKBridge.executeTool()`

**Required Changes:**

```typescript
// Add to constructor
constructor(machineData: MachineData, config: MachineExecutorConfig = {}) {
    super(machineData, config);

    // Initialize ToolRegistry
    this.toolRegistry = new ToolRegistry();

    // Register transition tool pattern
    this.toolRegistry.registerDynamic('transition_to_',
        async (name, input) => this.handleTransitionTool(name, input)
    );

    // Register read tool pattern
    this.toolRegistry.registerDynamic('read_',
        async (name, input) => this.handleReadTool(name, input)
    );

    // Register write tool pattern
    this.toolRegistry.registerDynamic('write_',
        async (name, input) => this.handleWriteTool(name, input)
    );

    // ... rest of initialization
}

// Update executeTool method
async executeTool(toolName: string, input: any): Promise<any> {
    console.log(`🔧 Executing tool: ${toolName} with input:`, input);

    // Use ToolRegistry for execution
    if (this.toolRegistry.hasTool(toolName)) {
        return await this.toolRegistry.executeTool(toolName, input);
    }

    // Fallback to agent SDK bridge for meta-tools
    return await this.agentSDKBridge.executeTool(toolName, input);
}

// Extract handler methods
private async handleTransitionTool(name: string, input: any): Promise<any> {
    const targetNode = name.replace('transition_to_', '');
    const reason = input.reason || 'agent decision';

    // Validate transition is valid
    const transitions = this.getNonAutomatedTransitions(this.context.currentNode);
    const validTransition = transitions.find(t => t.target === targetNode);

    if (!validTransition) {
        throw new Error(`Invalid transition: ${this.context.currentNode} -> ${targetNode}`);
    }

    return {
        success: true,
        action: 'transition',
        target: targetNode,
        reason
    };
}

private async handleReadTool(name: string, input: any): Promise<any> {
    // Extract current logic from executeTool
    // ...
}

private async handleWriteTool(name: string, input: any): Promise<any> {
    // Extract current logic from executeTool
    // ...
}
```

**Expected Savings**: ~40 lines of duplicate dispatch logic

### 2. Update AgentSDKBridge (`src/language/agent-sdk-bridge.ts`)

**Current State:**
- Lines 520-559 contain tool execution dispatch
- Checks for dynamic tools
- Dispatches to meta-tools
- Switch statement for meta-tool execution

**Required Changes:**

```typescript
// Add to constructor
constructor(
    machineData: MachineData,
    context: MachineExecutionContext,
    metaToolManager: MetaToolManager,
    toolRegistry: ToolRegistry,  // NEW: inject registry
    config?: AgentSDKBridgeConfig
) {
    this.machineData = machineData;
    this.context = context;
    this.metaToolManager = metaToolManager;
    this.toolRegistry = toolRegistry;  // NEW
    this.config = config;

    // Register meta-tools with registry
    this.registerMetaTools();
}

// NEW method to register meta-tools
private registerMetaTools(): void {
    const metaTools = this.metaToolManager.getMetaTools();

    metaTools.forEach(tool => {
        this.toolRegistry.registerStatic(tool, async (name, input) => {
            return await this.executeMetaTool(name, input);
        });
    });
}

// Simplified executeTool
async executeTool(toolName: string, input: any): Promise<any> {
    // Try tool executor first (from RailsExecutor)
    if (this.toolExecutor) {
        return await this.toolExecutor(toolName, input);
    }

    // Use ToolRegistry
    return await this.toolRegistry.executeTool(toolName, input);
}

// NEW: Extract meta-tool execution logic
private async executeMetaTool(name: string, input: any): Promise<any> {
    switch (name) {
        case 'get_machine_definition':
            return await this.metaToolManager.getMachineDefinition(input);
        case 'update_definition':
            return await this.metaToolManager.updateDefinition(input);
        case 'construct_tool':
            return await this.metaToolManager.constructTool(input);
        case 'list_available_tools':
            return await this.metaToolManager.listAvailableTools(input);
        case 'propose_tool_improvement':
            return await this.metaToolManager.proposeToolImprovement(input);
        case 'get_tool_nodes':
            return await this.metaToolManager.getToolNodesHandler(input);
        case 'build_tool_from_node':
            return await this.metaToolManager.buildToolFromNodeHandler(input);
        default:
            throw new Error(`Meta-tool ${name} not implemented`);
    }
}
```

**Expected Savings**: ~30 lines of duplicate dispatch logic

### 3. Update MetaToolManager (`src/language/meta-tool-manager.ts`)

**Current State:**
- Manages dynamic tools independently
- Has `getDynamicTool()` and `executeDynamicTool()` methods

**Required Changes:**

```typescript
// Add ToolRegistry integration
constructor(
    machineData: MachineData,
    onMutation: (mutation: MachineMutation) => void,
    toolRegistry?: ToolRegistry  // NEW: optional registry
) {
    this.machineData = machineData;
    this.onMutation = onMutation;
    this.dynamicTools = new Map();
    this.toolRegistry = toolRegistry;
}

// Update constructTool to register with ToolRegistry
async constructTool(input: { ... }): Promise<any> {
    // ... existing validation and handler creation ...

    const dynamicTool: DynamicTool = {
        definition: { name, description, input_schema },
        handler,
        created: new Date().toISOString(),
        strategy: implementation_strategy,
        implementation: implementation_details
    };

    this.dynamicTools.set(name, dynamicTool);

    // NEW: Register with ToolRegistry if available
    if (this.toolRegistry) {
        this.toolRegistry.registerStatic(dynamicTool.definition, handler);
    }

    // ... rest of method
}
```

### 4. Update MachineExecutor (`src/language/machine-executor.ts`)

**Current State:**
- Lines 324-363 have similar tool dispatch logic
- Large switch statement for different tools

**Consider:**
- Whether MachineExecutor should also use ToolRegistry
- Or if it's legacy code that can remain as-is
- Document decision in this file

### 5. Testing Strategy

**Unit Tests:**
- [ ] Create `test/language/tool-registry.test.ts`
  - Test static tool registration
  - Test dynamic pattern matching
  - Test tool execution
  - Test error handling
  - Test tool querying

**Integration Tests:**
- [ ] Test RailsExecutor with ToolRegistry
  - Verify transition tools work
  - Verify read/write tools work
  - Verify delegation to meta-tools works

- [ ] Test AgentSDKBridge with ToolRegistry
  - Verify meta-tool execution
  - Verify dynamic tool execution

- [ ] Test MetaToolManager integration
  - Verify constructed tools are registered
  - Verify tools can be executed through registry

**Regression Tests:**
- [ ] Run existing test suite
- [ ] Verify no functionality broken
- [ ] Check phase2-tools.test.ts still passes
- [ ] Check task-execution.test.ts still passes

### 6. Documentation Updates

- [ ] Update `docs/architecture.md` with ToolRegistry pattern
- [ ] Add code comments explaining the flow
- [ ] Update examples if needed
- [ ] Complete migration guide section in `MIGRATION_GUIDE.md`

## Expected Benefits

After full integration:

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Tool dispatch locations | 4 files | 1 class | Centralized |
| Duplicate dispatch logic | ~140 LOC | ToolRegistry | ~100 LOC |
| Tool registration | Scattered | Centralized | Simplified |

## Risk Mitigation

1. **Incremental Integration**: Integrate one executor at a time
2. **Feature Flag**: Consider adding a feature flag for ToolRegistry
3. **Backward Compatibility**: Keep existing dispatch as fallback initially
4. **Testing**: Comprehensive test coverage before merging
5. **Code Review**: Get stakeholder review before finalizing

## Next Steps

1. Review this plan with team/maintainer
2. Implement RailsExecutor integration first (highest impact)
3. Write tests for that integration
4. Proceed to AgentSDKBridge
5. Complete with MetaToolManager
6. Run full test suite
7. Update documentation
8. Create PR with detailed description

## Questions to Resolve

- [ ] Should MachineExecutor also use ToolRegistry?
- [ ] Should we add a feature flag for gradual rollout?
- [ ] Do we need backward compatibility layer?
- [ ] What's the testing strategy without breaking CI?

---

**Status**: Created as part of Epic #146, Task 5
**Author**: Claude Code
**Date**: 2025-10-12
