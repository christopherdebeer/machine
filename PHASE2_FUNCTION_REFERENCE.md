# Phase 2 Function Reference & Integration Points

## Quick Reference: Key Functions by Component

### 1. PARSER

**File**: `src/language/main.ts` + `src/language/machine-module.ts`

```typescript
// Entry Point
import { createMachineServices } from './machine-module.js';
const services = createMachineServices();

// Usage (need to verify exact API)
const parser = services.parser.LangiumParser;
const machine: Machine = await parser.parse(source);
```

**Expected Integration**:
```typescript
async function parseDygram(code: string, filepath?: string): Promise<{
    ast: Machine;
    errors: string[];
}> {
    try {
        const services = createMachineServices();
        const machine = await services.parser.parse(code, { uri: filepath });
        return { ast: machine, errors: [] };
    } catch (error) {
        return { ast: null, errors: [error.message] };
    }
}
```

---

### 2. GENERATORS

**File**: `src/language/generator/generator.ts`

#### JSON Generator
```typescript
export function generateJSON(
    machine: Machine,
    filePath?: string,
    destination?: string
): FileGenerationResult {
    // Returns: { content: string, filePath?: string }
}
```

**Usage**:
```typescript
const result = generateJSON(machineAST);
const machineJson = JSON.parse(result.content);
```

#### Graphviz Generator
```typescript
export function generateGraphviz(
    machine: Machine,
    filePath: string,
    destination: string | undefined
): FileGenerationResult {
    // Returns: { content: string (DOT), filePath?: string }
}
```

**Alternative (from diagram module)**:
```typescript
import { generateGraphvizFromJSON } from './diagram/graphviz-generator.js';

const machineJson = JSON.parse(jsonResult.content);
const dotString = generateGraphvizFromJSON(machineJson, {
    title: machine.title,
    validationContext: validationContext,
    showValidationWarnings: true
});
```

#### HTML Generator
```typescript
export function generateHTML(
    machine: Machine,
    filePath: string,
    destination: string | undefined
): FileGenerationResult {
    // Returns: { content: string (HTML), filePath?: string }
}
```

#### Markdown Generator
```typescript
export function generateMarkdown(
    machine: Machine,
    filePath: string,
    destination: string | undefined
): FileGenerationResult {
    // Returns: { content: string (Markdown), filePath?: string }
}
```

#### DSL Reverse Generator
```typescript
export function generateDSL(machineJson: MachineJSON): string {
    // Takes MachineJSON, returns DyGram DSL code
    // Essential for round-trip compilation
}
```

---

### 3. VALIDATORS

**File**: `src/language/graph-validator.ts`

```typescript
export class GraphValidator {
    constructor(machine: Machine);
    
    // Main validation
    validate(): GraphValidationResult;
    
    // Graph analysis
    findEntryPoints(): string[];
    findExitPoints(): string[];
    findUnreachableNodes(): string[];
    findOrphanedNodes(): string[];
    detectCycles(): string[][];
    
    // Path analysis
    findPath(source: string, target: string): string[];
    findLongestPath(): string[];
    
    // Statistics
    getStatistics(): {
        nodeCount: number;
        edgeCount: number;
        entryPointCount: number;
        exitPointCount: number;
        maxDepth: number;
        cycleCount: number;
    };
    
    // Integration with validation context
    validateWithContext(context: ValidationContext): void;
}
```

**Usage**:
```typescript
const validator = new GraphValidator(machineAST);
const result = validator.validate();

// result structure:
{
    valid: boolean;
    unreachableNodes?: string[];
    orphanedNodes?: string[];
    cycles?: string[][];
    missingEntryPoints?: boolean;
    missingExitPoints?: boolean;
    warnings?: string[];
}
```

---

### 4. RUNTIME/EXECUTOR

**File**: `src/language/rails-executor.ts`

#### Primary Execution API
```typescript
export class RailsExecutor extends BaseExecutor {
    constructor(machineData: MachineData, config?: MachineExecutorConfig);
    
    // Async factory
    static async create(
        machineData: MachineData, 
        config?: MachineExecutorConfig
    ): Promise<RailsExecutor>;
    
    // Single step execution
    async step(): Promise<boolean>;
    
    // Full execution
    async execute(): Promise<{
        currentNode: string;
        errorCount: number;
        visitedNodes: Set<string>;
        attributes: Map<string, any>;
        history: Array<{
            from: string;
            to: string;
            transition: string;
            timestamp: string;
        }>;
    }>;
    
    // Introspection
    getMachineData(): MachineData;
    buildSystemPrompt(nodeName: string): string;
    buildPhaseTools(nodeName: string): ToolDefinition[];
    
    // Tool execution
    async executeTool(toolName: string, input: any): Promise<any>;
    
    // Callbacks
    setMachineUpdateCallback(
        callback: (dsl: string, machineData: MachineData) => void
    ): void;
}
```

**Usage**:
```typescript
// Create executor
const executor = await RailsExecutor.create(machineData, {
    llm: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
    limits: { maxSteps: 1000 }
});

// Execute full machine
const result = await executor.execute();
console.log(`Executed ${result.history.length} transitions`);
console.log(`Current node: ${result.currentNode}`);
console.log(`Visited: ${result.visitedNodes.size} nodes`);
```

#### Transition Evaluation
```typescript
// Protected methods (used internally)
evaluateAutomatedTransitions(nodeName: string): TransitionEvaluation | null;
getNonAutomatedTransitions(nodeName: string): Array<{
    target: string;
    description?: string;
    condition?: string;
}>;
requiresAgentDecision(nodeName: string): boolean;
```

---

### 5. AGENT CONTEXT BUILDER

**File**: `src/language/agent-context-builder.ts`

```typescript
export class AgentContextBuilder {
    constructor(
        machineData: MachineData,
        context: MachineExecutionContext
    );
    
    // Build system prompt for agent
    buildSystemPrompt(nodeName: string): string;
    
    // Get accessible context nodes
    getAccessibleContextNodes(
        nodeName: string
    ): Map<string, { canRead: boolean; canWrite: boolean }>;
    
    // Build node-specific context
    buildNodeContext(nodeName: string): {
        nodeTitle?: string;
        nodeDescription?: string;
        outboundTransitions: Array<{
            target: string;
            description?: string;
        }>;
        availableContext: Map<string, any>;
    };
}
```

---

### 6. TYPE DEFINITIONS & INTERFACES

**File**: `src/language/base-executor.ts`

```typescript
export interface MachineData {
    title: string;
    nodes: Array<{
        name: string;
        type?: string;
        parent?: string;
        attributes?: Array<{
            name: string;
            type: string;
            value: string;
        }>;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type?: string;
        label?: string;
    }>;
}

export interface ExecutionLimits {
    maxSteps?: number;              // Default: 1000
    maxNodeInvocations?: number;    // Default: 100
    timeout?: number;               // Default: 5 min (ms)
    cycleDetectionWindow?: number;  // Default: 20
}

export interface MachineExecutorConfig {
    llm?: LLMClientConfig;
    agentSDK?: AgentSDKBridgeConfig;
    limits?: ExecutionLimits;
}

export interface MachineExecutionContext {
    currentNode: string;
    currentTaskNode?: string;
    activeState?: string;
    errorCount: number;
    visitedNodes: Set<string>;
    attributes: Map<string, any>;
    history: Array<{
        from: string;
        to: string;
        transition: string;
        timestamp: string;
        output?: string;
    }>;
    nodeInvocationCounts: Map<string, number>;
    stateTransitions: Array<{
        state: string;
        timestamp: string;
    }>;
}
```

**File**: `src/language/diagram/types.ts`

```typescript
export interface MachineJSON {
    title?: string;
    attributes?: Array<{
        name: string;
        value: any;
        type?: string;
    }>;
    nodes: any[];
    edges: any[];
    notes?: any[];
    inferredDependencies?: any[];
}

export interface DiagramOptions {
    showRuntimeState?: boolean;
    showExecutionPath?: boolean;
    showVisitCounts?: boolean;
    showRuntimeValues?: boolean;
    mobileOptimized?: boolean;
    title?: string;
    runtimeContext?: RuntimeContext;
    validationContext?: any;
    showValidationWarnings?: boolean;
    warningMode?: 'inline' | 'notes' | 'both' | 'none';
    minSeverity?: 'error' | 'warning' | 'info' | 'hint';
}
```

**File**: `src/language/generator/generator.ts`

```typescript
export interface FileGenerationResult {
    filePath?: string;
    content: string;
}
```

---

### 7. VALIDATION TYPES

**File**: `src/language/validation-errors.ts`

```typescript
export enum ValidationSeverity {
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info',
    HINT = 'hint'
}

export enum ValidationCategory {
    GRAPH = 'graph',
    TYPE = 'type',
    SYNTAX = 'syntax'
}

export interface ValidationError {
    message: string;
    severity: ValidationSeverity;
    category: ValidationCategory;
    code: string;
    location?: { node?: string; property?: string };
    suggestion?: string;
    expected?: any;
    actual?: any;
}

export class ValidationContext {
    addError(error: ValidationError): void;
    getErrors(severity?: ValidationSeverity): ValidationError[];
    getErrorsByCategory(category: ValidationCategory): ValidationError[];
}
```

---

## Integration Patterns for Phase 2 Bootstrap Tools

### Pattern 1: AST-Based Tool
```typescript
// Input: Machine (Langium AST)
// Output: Derived data
export async function myTool(machine: Machine): Promise<any> {
    // Work with Langium AST directly
    // Access: machine.nodes[], machine.edges[], machine.title
    return result;
}
```

### Pattern 2: JSON-Based Tool
```typescript
// Input: Machine AST -> convert to JSON first
// Output: Derived data
export async function myTool(machine: Machine): Promise<any> {
    const jsonResult = generateJSON(machine);
    const machineJson = JSON.parse(jsonResult.content);
    
    // Work with simplified JSON structure
    // Access: machineJson.nodes[], machineJson.edges[]
    return result;
}
```

### Pattern 3: Validation Tool
```typescript
// Input: Machine AST
// Output: Validation result
export async function validateMachine(machine: Machine): Promise<any> {
    const validator = new GraphValidator(machine);
    const result = validator.validate();
    const stats = validator.getStatistics();
    
    return { valid: result.valid, result, stats };
}
```

### Pattern 4: Execution Tool
```typescript
// Input: Machine AST -> convert to MachineData
// Output: Execution result
export async function executeMachine(
    machine: Machine,
    config?: MachineExecutorConfig
): Promise<any> {
    // Convert AST to MachineData (flat structure)
    const machineData = convertToMachineData(machine);
    
    // Execute using RailsExecutor
    const executor = await RailsExecutor.create(machineData, config);
    const result = await executor.execute();
    
    return result;
}
```

---

## Critical Conversion Functions Needed

### 1. Machine (AST) → MachineData (Runtime)
```typescript
// MISSING: Need to implement
function convertAstToMachineData(machine: Machine): MachineData {
    // Extract title
    // Flatten hierarchical nodes
    // Serialize edge references
    // Convert attributes
}
```

**Where this is done**: Likely in `generator/generator.ts` already (JSONGenerator.serializeNodes)

### 2. MachineJSON → MachineData
```typescript
// Simpler conversion (JSON to runtime format)
function convertJsonToMachineData(json: MachineJSON): MachineData {
    return {
        title: json.title || '',
        nodes: json.nodes.map(n => ({
            name: n.name,
            type: n.type,
            parent: n.parent,
            attributes: n.attributes || []
        })),
        edges: json.edges.map(e => ({
            source: e.source,
            target: e.target,
            type: e.type,
            label: e.value?.text || e.label
        }))
    };
}
```

---

## Exports by File (Summary)

| File | What to Import |
|------|----------------|
| `generator/generator.ts` | `generateJSON`, `generateGraphviz`, `generateHTML`, `generateMarkdown`, `generateDSL` |
| `diagram/graphviz-generator.ts` | `generateGraphvizFromJSON`, `generateRuntimeGraphviz`, `generateGraphvizSVG` |
| `graph-validator.ts` | `GraphValidator`, `GraphValidationResult` |
| `type-checker.ts` | `TypeChecker` |
| `rails-executor.ts` | `RailsExecutor`, `MachineData`, `MachineExecutorConfig` |
| `base-executor.ts` | `BaseExecutor`, `MachineExecutionContext`, `ExecutionLimits` |
| `agent-context-builder.ts` | `AgentContextBuilder` |
| `machine-module.ts` | `createMachineServices` |
| `validation-errors.ts` | `ValidationContext`, `ValidationError`, `ValidationSeverity` |
| `diagram/types.ts` | `MachineJSON`, `DiagramOptions`, `RuntimeContext` |
| `bootstrap-tools.ts` | `BootstrapTools`, `BootstrapTool`, `BootstrapContext` |

