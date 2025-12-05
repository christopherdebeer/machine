# Execution UI and Meta Tools Analysis

## Issue 1: Missing Meta Tools Integration

### Current State

**Problem**: The system has a comprehensive `MetaToolManager` with rich meta tools, but these are not exposed during execution.

**Location of Issue**:
1. `src/language/execution/effect-builder.ts:197-226` - `buildMetaTools()` only returns `add_node` and `add_edge`
2. `src/language/execution/effect-executor.ts:280-290` - Only stub implementations exist with TODO comments
3. `src/language/meta-tool-manager.ts:68-218` - Full meta tools defined but not integrated

### Available Meta Tools (Not Exposed)

The `MetaToolManager.getMetaTools()` provides:
1. **`get_machine_definition`** - Get current machine structure in JSON/DSL format
2. **`update_definition`** - Update the machine definition
3. **`construct_tool`** - Dynamically create new tools (agent-backed, code-generation, composition)
4. **`list_available_tools`** - List all available tools with filtering
5. **`propose_tool_improvement`** - Record improvement proposals
6. **`get_tool_nodes`** - Get Tool nodes from machine definition
7. **`build_tool_from_node`** - Build dynamic tool from Tool node

### Root Cause

The integration between these three systems is incomplete:

```
buildMetaTools() → EffectExecutor → MetaToolManager
    (2 tools)        (stubs only)     (7 rich tools)
       ❌               ❌                  ✅
```

**What should happen**:
1. `buildMetaTools()` should return `MetaToolManager.getMetaTools()` when machine/node has `meta: true`
2. `EffectExecutor.handleToolUse()` should delegate meta tool execution to `MetaToolManager`
3. The executor should have access to its `MetaToolManager` instance

### Proposed Fix

#### Step 1: Update `buildTools()` in effect-builder.ts

```typescript
export function buildTools(
    machineJSON: MachineJSON,
    state: ExecutionState,
    pathId: string,
    nodeName: string,
    metaToolManager?: MetaToolManager  // ADD THIS PARAMETER
): ToolDefinition[] {
    // ... existing code ...

    // Add meta-tools if machine or node has meta capability
    const machineAttributes = getMachineAttributes(machineJSON);
    const nodeAttributes = getNodeAttributes(machineJSON, nodeName);

    const hasMachineMeta = machineAttributes.meta === true ||
                          machineAttributes.meta === 'true' ||
                          machineAttributes.meta === 'True';
    const hasNodeMeta = nodeAttributes.meta === 'true' ||
                       nodeAttributes.meta === 'True';

    if (hasMachineMeta || hasNodeMeta) {
        if (metaToolManager) {
            // Use rich meta tools from MetaToolManager
            tools.push(...metaToolManager.getMetaTools());
        } else {
            // Fallback to basic tools if no manager available
            tools.push(...buildMetaTools());
        }
    }

    return tools;
}
```

#### Step 2: Update `EffectExecutor` to accept MetaToolManager

```typescript
export interface EffectExecutorConfig {
    llmClient?: ClaudeClient;
    metaToolManager?: MetaToolManager;  // ADD THIS
    // ... existing config
}

export class EffectExecutor {
    private metaToolManager?: MetaToolManager;  // ADD THIS

    constructor(config: EffectExecutorConfig = {}) {
        this.metaToolManager = config.metaToolManager;  // ADD THIS
        // ... existing code
    }
}
```

#### Step 3: Implement meta tool handling in EffectExecutor

```typescript
private async handleToolUse(toolName: string, input: any): Promise<any> {
    // Transition tools
    if (toolName.startsWith('transition_to_')) {
        const target = toolName.replace('transition_to_', '');
        return {
            success: true,
            action: 'transition',
            target,
            reason: input.reason || 'agent decision'
        };
    }

    // Context read/write
    if (toolName.startsWith('read_') || toolName.startsWith('write_')) {
        // TODO: Implement context operations
    }

    // Meta tools - delegate to MetaToolManager
    if (this.metaToolManager) {
        switch (toolName) {
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
            case 'add_node':
            case 'add_edge':
                // These should also be implemented via MetaToolManager
                // or deprecated in favor of update_definition
                return {
                    success: true,
                    message: `${toolName} executed`,
                    note: 'Consider using update_definition for machine modifications'
                };
        }
    }

    throw new Error(`Unknown tool: ${toolName}`);
}
```

#### Step 4: Wire it all together in MachineExecutor

```typescript
constructor(machineJSON: MachineJSON, config: MachineExecutorConfig = {}) {
    // ... existing code ...

    // Initialize meta-tool manager
    this.metaToolManager = new MetaToolManager(
        machineJSON,
        (mutation: any) => {
            this.mutations.push(mutation);
        }
    );

    // Initialize effect executor with MetaToolManager
    this.effectExecutor = new EffectExecutor({
        llmClient: this.llmClient,
        metaToolManager: this.metaToolManager,  // ADD THIS
        vfs: config.vfs
    });
}
```

---

## Issue 2: Execution UI Not Showing Agent Decisions

### Current State

**Problem**: The execution controls UI only shows basic logs like `[execution] Entering node: buildTool`. Agent reasoning, tool calls, and LLM responses visible in network tab are not logged or displayed.

**What's Missing**:
1. Agent reasoning/thinking (text content from LLM responses)
2. Tool use decisions (which tools were called and why)
3. Tool execution results (what the tools returned)
4. Multi-turn conversation flow

### Example from Network Tab

```json
{
  "content": [
    {
      "type": "text",
      "text": "I'll help you execute this state machine task..."
    },
    {
      "type": "tool_use",
      "id": "toolu_01...",
      "name": "add_node",
      "input": {"name": "fibonacci_calculator_tool", ...}
    }
  ],
  "usage": {
    "input_tokens": 1080,
    "output_tokens": 418
  }
}
```

This rich information is **never logged** to the execution log.

### Root Cause

**Location**: `src/language/execution/effect-executor.ts:100-211`

The `executeInvokeLLM()` method:
1. ✅ Receives LLM responses with reasoning and tool calls
2. ✅ Processes tool uses
3. ❌ **Never logs** this information for user visibility
4. ❌ Only returns final text output

### Proposed Fix

#### Step 1: Add logging to executeInvokeLLM

```typescript
private async executeInvokeLLM(effect: InvokeLLMEffect): Promise<AgentResult> {
    if (!this.llmClient) {
        throw new Error('LLM client not configured');
    }

    const { pathId, nodeName, systemPrompt, tools, modelId } = effect;

    // Log agent invocation start
    this.executeLog({
        type: 'log',
        level: 'info',
        category: 'agent',
        message: `Agent invoked for node: ${nodeName}`,
        data: { toolCount: tools.length }
    });

    // ... existing code ...

    while (true) {
        const response = await this.llmClient.invokeWithTools(messages, tools);

        // Extract and log text reasoning
        const text = extractText(response);
        if (text) {
            this.executeLog({
                type: 'log',
                level: 'info',
                category: 'agent',
                message: `Agent reasoning: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`,
                data: { fullText: text }
            });
            finalText += (finalText ? '\n' : '') + text;
        }

        // Check for tool uses
        const toolUses = extractToolUses(response);

        if (toolUses.length === 0) {
            break;
        }

        // Log tool use decisions
        this.executeLog({
            type: 'log',
            level: 'info',
            category: 'agent',
            message: `Agent selected ${toolUses.length} tool(s): ${toolUses.map(t => t.name).join(', ')}`,
            data: { tools: toolUses }
        });

        // ... existing tool processing ...

        for (const toolUse of toolUses) {
            try {
                const result = await this.handleToolUse(toolUse.name, toolUse.input);

                // Log successful tool execution
                this.executeLog({
                    type: 'log',
                    level: 'info',
                    category: 'tool',
                    message: `✓ ${toolUse.name} executed successfully`,
                    data: { input: toolUse.input, output: result }
                });

                // ... existing code ...
            } catch (error) {
                // Log tool execution error
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.executeLog({
                    type: 'log',
                    level: 'error',
                    category: 'tool',
                    message: `✗ ${toolUse.name} failed: ${errorMessage}`,
                    data: { input: toolUse.input, error: errorMessage }
                });

                // ... existing code ...
            }
        }

        // ... existing code ...
    }

    // Log final result
    this.executeLog({
        type: 'log',
        level: 'info',
        category: 'agent',
        message: `Agent completed with ${toolExecutions.length} tool execution(s)`,
        data: {
            toolExecutions: toolExecutions.length,
            nextNode,
            outputLength: finalText.length
        }
    });

    return {
        pathId,
        output: finalText,
        nextNode,
        toolExecutions
    };
}
```

#### Step 2: Enhance ExecutionControls to better display logs

Currently the UI shows: `[execution] Entering node: buildTool`

With the fix it would show:
```
[agent] Agent invoked for node: buildTool
[agent] Agent reasoning: I'll help you execute this state machine task...
[agent] Agent selected 1 tool(s): add_node
[tool] ✓ add_node executed successfully
[agent] Agent completed with 1 tool execution(s)
[transition] Single transition with no other work: buildTool -> useTool
```

#### Step 3: Add expandable log entries for detailed inspection

Update `ExecutionControls.tsx` to make logs expandable:

```tsx
const LogEntry = styled.div<{ $color: string; $expandable?: boolean }>`
    margin-bottom: 4px;
    color: ${props => props.$color};
    cursor: ${props => props.$expandable ? 'pointer' : 'default'};

    &:hover {
        background: ${props => props.$expandable ? '#2d2d30' : 'transparent'};
    }
`;

// In the render:
{logs.map((log, index) => (
    <LogEntry
        key={index}
        $color={getLogColor(log.type)}
        $expandable={!!log.data}
        onClick={() => log.data && setExpandedLog(expandedLog === index ? null : index)}
    >
        <LogTimestamp>[{log.timestamp}]</LogTimestamp>
        <span> {log.message}</span>
        {expandedLog === index && log.data && (
            <pre style={{marginTop: 8, fontSize: 10, opacity: 0.8}}>
                {JSON.stringify(log.data, null, 2)}
            </pre>
        )}
    </LogEntry>
))}
```

### Impact

After implementing these fixes:

1. **Meta Tools**: Agents will have access to rich meta-programming capabilities:
   - Can inspect and modify the machine definition
   - Can dynamically construct new tools
   - Can list and query available tools
   - Full self-modification capabilities

2. **Execution Visibility**: Users will see:
   - Agent reasoning and decision-making process
   - Which tools are being selected and why
   - Tool execution results and errors
   - Complete execution narrative

3. **Debugging**: Much easier to understand:
   - Why certain paths were taken
   - What tools were attempted
   - Where failures occurred
   - How the agent interpreted prompts

## Implementation Priority

**High Priority**:
1. Fix meta tools integration (Issue 1) - Critical for meta-programming capabilities
2. Add agent decision logging (Issue 2 - Step 1) - Critical for visibility

**Medium Priority**:
3. Enhance UI with expandable logs (Issue 2 - Steps 2-3) - Nice to have

## Testing

After implementation, the Dynamic Tool Builder example should work correctly:
- Agent can use `list_available_tools` to check for fibonacci tool
- Agent can use `construct_tool` if needed to create it
- All decisions visible in execution log
- No more "auto-taking, skipping LLM" when meta operations are intended
