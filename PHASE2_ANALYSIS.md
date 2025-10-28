# Dygram Parser, Generator, and Runtime Analysis
## Phase 2 Self-Hosting Integration Guide

---

## Executive Summary

This document provides a comprehensive analysis of the existing Dygram implementation to guide Phase 2 self-hosting integration. The analysis covers:

1. **Parser Implementation** - How DSL code is parsed to AST
2. **Generator Implementations** - JSON, Graphviz, HTML, Markdown generators
3. **Runtime/Executor** - RailsExecutor and execution model
4. **Validator** - Graph validation and error reporting
5. **Bootstrap Integration Points** - How to wire these components

---

## 1. Parser Implementation

### Location
- **Main Entry**: `/home/runner/work/machine/machine/src/language/main.ts`
- **Grammar**: Langium DSL (compiled to AST types in `src/generated/ast.ts`)
- **Module Setup**: `/home/runner/work/machine/machine/src/language/machine-module.ts`

### Key Functions & Entry Points

#### Language Server Entry (main.ts)
```typescript
// File: src/language/main.ts
import { startLanguageServer } from 'langium/lsp';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { createMachineServices } from './machine-module.js';

const connection = createConnection(ProposedFeatures.all);
const { shared } = createMachineServices({ connection, ...NodeFileSystem });
startLanguageServer(shared);
```

#### Parser via MachineModule
```typescript
// Usage Pattern:
const services = createMachineServices();
const parser = services.parser.LangiumParser;
const machine = parser.parse(source);
```

### Input/Output Types

**Input**: DSL source code as string
```dygram
machine "Workflow"

init Start
state Processing
state Complete

Start -> Processing
Processing -> Complete
```

**Output**: Machine AST (Langium types from `generated/ast.ts`)
```typescript
interface Machine {
    title: string;
    nodes: Node[];
    edges: Edge[];
    attributes?: Attribute[];
    annotations?: Annotation[];
}

interface Node {
    name: string;
    type?: string;  // "init", "state", "task", "context", etc.
    title?: string;
    attributes: Attribute[];
    annotations: Annotation[];
    nodes: Node[];  // Child nodes (for hierarchical machines)
}

interface Edge {
    source: Reference[];
    segments: EdgeSegment[];
}

interface EdgeSegment {
    target: Reference[];
    label?: EdgeType[];
    endType: string;  // "->", "-->", "=>", etc.
}
```

### Integration Point for Bootstrap

**Phase 2 Task**: Parse Dygram DSL into Machine AST
```typescript
// Tool: parse_dygram
parse_dygram({
    code: string,
    filepath?: string
}): {
    ast: Machine,  // Langium AST
    errors: string[]
}
```

---

## 2. Generator Implementations

### Location
- **Main Generator**: `/home/runner/work/machine/machine/src/language/generator/generator.ts`
- **Diagram Generators**: `/home/runner/work/machine/machine/src/language/diagram/graphviz-generator.ts`
- **DOT Generator**: `/home/runner/work/machine/machine/src/language/diagram/graphviz-dot-diagram.ts`

### 2.1 JSON Generator

#### Class & Public API
```typescript
// File: src/language/generator/generator.ts

class JSONGenerator extends BaseGenerator {
    protected fileExtension = 'json';
    protected generateContent(): FileGenerationResult {
        // Converts Machine AST to MachineJSON
    }
}

// Public API
export function generateJSON(
    machine: Machine,
    filePath?: string,
    destination?: string
): FileGenerationResult {
    return GeneratorFactory.createGenerator('json', machine, filePath, { destination }).generate();
}
```

#### Input/Output
**Input**: Machine AST (Langium type)
**Output**: `FileGenerationResult`
```typescript
interface FileGenerationResult {
    filePath?: string;
    content: string;  // JSON string
}
```

**Output Format (MachineJSON)**:
```typescript
interface MachineJSON {
    title?: string;
    attributes?: Array<{
        name: string;
        value: any;
        type?: string;
    }>;
    nodes: any[];  // Flattened and serialized node array
    edges: any[];  // Serialized edge array with all metadata
    notes?: any[];
    inferredDependencies?: any[];
}
```

#### Key Functions
- `serializeNodes()` - Recursively flatten hierarchical nodes
- `serializeEdges()` - Convert edge references to node names
- `extractPrimitiveValue()` - Recursively extract values from AST
- `serializeAttributes()` - Convert attribute AST to JSON
- `extractNodeReferencesFromValue()` - Follow node references in attributes

#### Integration Point for Bootstrap
```typescript
// Tool: generate_json
generate_json({
    machine: Machine,  // Langium AST
    destination?: string
}): {
    json: string,
    filepath?: string
}
```

---

### 2.2 Graphviz Generator

#### Class & Public API
```typescript
// File: src/language/generator/generator.ts

class GraphvizGenerator extends BaseGenerator {
    protected fileExtension = 'dot';
    
    protected generateContent(): FileGenerationResult {
        const jsonGen = new JSONGenerator(this.machine);
        const machineJson = JSON.parse(jsonGen.generate().content);
        const validationContext = buildValidationContext(this.machine);
        
        return {
            content: generateGraphvizFromJSON(machineJson, {
                title: this.machine.title,
                validationContext,
                showValidationWarnings: true
            })
        };
    }
    
    public getDotDefinition(): string {
        // Returns just the DOT content without file I/O
    }
}

export function generateGraphviz(
    machine: Machine,
    filePath: string,
    destination: string
): FileGenerationResult
```

#### Diagram Generation Pipeline
```
Machine AST
    ↓
JSONGenerator (converts to MachineJSON)
    ↓
buildValidationContext (checks for warnings)
    ↓
generateGraphvizFromJSON (in diagram/graphviz-generator.ts)
    ↓
generateDotDiagram (in diagram/graphviz-dot-diagram.ts)
    ↓
DOT string (Graphviz source code)
```

#### Key Functions in Diagram Module
```typescript
// File: src/language/diagram/graphviz-generator.ts

export function generateGraphvizFromJSON(
    json: MachineJSON,
    options: DiagramOptions = {}
): string {
    return generateDotDiagram(json, options);
}

export async function generateGraphvizSVG(
    json: MachineJSON,
    options?: DiagramOptions,
    engine: 'dot' | 'neato' | 'fdp' | 'circo' | 'twopi' = 'dot'
): Promise<string> {
    const dot = generateGraphvizFromJSON(json, options);
    return renderDotToSVG(dot, engine);
}

export function generateRuntimeGraphviz(
    json: MachineJSON,
    context: RuntimeContext,
    options?: DiagramOptions
): string {
    const runtimeOptions = {
        showRuntimeState: true,
        showVisitCounts: true,
        showExecutionPath: true,
        ...options
    };
    return generateRuntimeDotDiagram(json, context, runtimeOptions);
}
```

#### Integration Point for Bootstrap
```typescript
// Tool: generate_graphviz
generate_graphviz({
    machine: Machine,  // Langium AST
    destination?: string
}): {
    dot: string,
    filepath?: string
}

// Tool: generate_graphviz_svg (advanced)
generate_graphviz_svg({
    machine: Machine,
    engine?: string  // 'dot', 'neato', etc.
}): {
    svg: string
}
```

---

### 2.3 HTML Generator

#### Class & Public API
```typescript
// File: src/language/generator/generator.ts

class HTMLGenerator extends BaseGenerator {
    protected fileExtension = 'html';
    
    protected generateContent(): FileGenerationResult {
        // Embeds:
        // 1. Graphviz DOT in <pre> tag (hidden)
        // 2. Graphviz WASM library script
        // 3. Executor script for runtime execution
        // 4. Machine JSON data for execution
        // 5. Interactive controls (toggle theme, download, execute)
    }
}

export function generateHTML(
    machine: Machine,
    filePath: string,
    destination: string
): FileGenerationResult
```

#### Output Content
- **Graphviz DOT**: Embedded in hidden `<code class="graphviz-dot">`
- **Machine JSON**: Embedded in `<script>` as `window.machineData`
- **Controls**: Theme toggle, SVG/PNG download, machine execution
- **WASM**: Loads Graphviz WASM from CDN
- **Executor**: Loads web-based executor script

#### Integration Point for Bootstrap
```typescript
// Tool: generate_html
generate_html({
    machine: Machine,
    destination?: string
}): {
    html: string,
    filepath?: string
}
```

---

### 2.4 Markdown Generator

#### Class & Public API
```typescript
// File: src/language/generator/generator.ts

class MarkdownGenerator extends BaseGenerator {
    protected fileExtension = 'md';
    
    protected generateContent(): FileGenerationResult {
        // Generates:
        // 1. Original DSL in markdown code block
        // 2. Mermaid class diagram (for type hierarchy)
        // 3. JSON representation
        // 4. Raw DOT output
    }
    
    public getMermaidDefinition(): string {
        // Returns just the Mermaid diagram
    }
}

export function generateMarkdown(
    machine: Machine,
    filePath: string,
    destination: string
): FileGenerationResult
```

#### Integration Point for Bootstrap
```typescript
// Tool: generate_markdown
generate_markdown({
    machine: Machine,
    destination?: string
}): {
    markdown: string,
    filepath?: string
}
```

---

### 2.5 DSL Reverse Generator

#### Function
```typescript
// File: src/language/generator/generator.ts

export function generateDSL(machineJson: MachineJSON): string {
    // Converts MachineJSON back to Dygram DSL syntax
    // Inverse operation of parser
}
```

#### Purpose
- **Backward compatibility**: JSON -> DSL (round-trip compilation)
- **Optimization**: Machine can optimize structure and regenerate DSL
- **Integration**: Essential for Phase 2 self-hosting

#### Integration Point for Bootstrap
```typescript
// Tool: generate_dsl
generate_dsl({
    machine: MachineJSON
}): {
    dsl: string
}
```

---

## 3. Validator Implementation

### Location
- **Graph Validator**: `/home/runner/work/machine/machine/src/language/graph-validator.ts`
- **Type Checker**: `/home/runner/work/machine/machine/src/language/type-checker.ts`
- **Validation Errors**: `/home/runner/work/machine/machine/src/language/validation-errors.ts`

### 3.1 GraphValidator

#### Class & Public API
```typescript
// File: src/language/graph-validator.ts

export interface GraphValidationResult {
    valid: boolean;
    unreachableNodes?: string[];
    orphanedNodes?: string[];
    cycles?: string[][];
    missingEntryPoints?: boolean;
    missingExitPoints?: boolean;
    warnings?: string[];
}

export class GraphValidator {
    constructor(machine: Machine);
    
    validate(): GraphValidationResult;
    findEntryPoints(): string[];
    findExitPoints(): string[];
    findUnreachableNodes(): string[];
    findOrphanedNodes(): string[];
    detectCycles(): string[][];
    findPath(source: string, target: string): string[];
    findLongestPath(): string[];
    getStatistics(): {
        nodeCount: number;
        edgeCount: number;
        entryPointCount: number;
        exitPointCount: number;
        maxDepth: number;
        cycleCount: number;
    };
    validateWithContext(context: ValidationContext): void;
}
```

#### Key Checks
1. **Entry Points**: Nodes with no incoming edges or init nodes
2. **Exit Points**: Nodes with no outgoing edges
3. **Unreachable Nodes**: Cannot be reached from entry points via BFS
4. **Orphaned Nodes**: No incoming or outgoing edges
5. **Cycles**: Detected via DFS with recursion stack
6. **Graph Structure**: Validates basic connectivity

#### Algorithms
- **BFS**: For reachability analysis
- **DFS**: For cycle detection
- **Adjacency Lists**: Both forward and reverse for fast queries

#### Integration Point for Bootstrap
```typescript
// Tool: validate_machine
validate_machine({
    machine: Machine
}): {
    valid: boolean,
    errors: Array<{
        message: string,
        severity: 'error' | 'warning',
        category: 'graph' | 'type',
        code: string,
        location: { node?: string, property?: string }
    }>,
    statistics: {
        nodeCount: number,
        edgeCount: number,
        cycleCount: number,
        // ...
    }
}
```

---

### 3.2 Type Checker

#### Class & Public API
```typescript
// File: src/language/type-checker.ts

export class TypeChecker {
    constructor(machine: Machine);
    
    validateAttributeType(attr: Attribute): {
        valid: boolean;
        message?: string;
        expectedType?: string;
        actualType?: string;
    };
}
```

#### Validation Context Integration
```typescript
// File: src/language/validation-errors.ts

export class ValidationContext {
    addError(error: ValidationError): void;
    getErrors(severity?: ValidationSeverity): ValidationError[];
    getErrorsByCategory(category: ValidationCategory): ValidationError[];
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
```

#### Integration Point for Bootstrap
```typescript
// Tool: check_types
check_types({
    machine: Machine
}): {
    valid: boolean,
    errors: ValidationError[]
}
```

---

## 4. Runtime/Executor Implementation

### Location
- **RailsExecutor**: `/home/runner/work/machine/machine/src/language/rails-executor.ts`
- **BaseExecutor**: `/home/runner/work/machine/machine/src/language/base-executor.ts`
- **Agent Context**: `/home/runner/work/machine/machine/src/language/agent-context-builder.ts`

### 4.1 RailsExecutor (Primary)

#### Class & Public API
```typescript
// File: src/language/rails-executor.ts

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

export interface MachineExecutorConfig {
    llm?: LLMClientConfig;
    agentSDK?: AgentSDKBridgeConfig;
    limits?: ExecutionLimits;
}

export class RailsExecutor extends BaseExecutor {
    constructor(machineData: MachineData, config?: MachineExecutorConfig);
    
    static async create(
        machineData: MachineData,
        config?: MachineExecutorConfig
    ): Promise<RailsExecutor>;
    
    async step(): Promise<boolean>;
    
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
}
```

#### Execution Model

The Rails Pattern:
```
┌─────────────────────────────────────────┐
│ 1. Check Automated Transitions          │
│    ├─ Single edge from state/init nodes │
│    ├─ @auto annotated edges             │
│    └─ Simple deterministic conditions   │
└──────────────┬──────────────────────────┘
               │
               ├─ YES: Auto-transition
               │       Jump to target node
               │
               └─ NO: Check agent decision
                      ↓
        ┌────────────────────────────────┐
        │ 2. Requires Agent Decision?    │
        │    ├─ Task nodes with prompt   │
        │    └─ Multiple non-auto edges  │
        └────────────────┬───────────────┘
                         │
                         ├─ YES: Invoke Agent SDK
                         │       Agent gets system prompt + tools
                         │       Agent chooses transition
                         │
                         └─ NO: Terminal node
                                Execution complete
```

#### Transition Evaluation
```typescript
evaluateAutomatedTransitions(nodeName: string): TransitionEvaluation | null {
    // Returns first valid automated transition
    // Checks:
    // 1. Single edge from state/init nodes
    // 2. @auto annotated edges
    // 3. Simple conditions (no external data)
}

getNonAutomatedTransitions(nodeName: string): Array<{
    target: string;
    description?: string;
    condition?: string;
}> {
    // Returns transitions requiring agent decision
}

requiresAgentDecision(nodeName: string): boolean {
    // True if task with prompt or multiple non-auto edges
}
```

#### Tool Integration
```typescript
buildPhaseTools(nodeName: string): ToolDefinition[] {
    // Returns tools available for current node:
    // 1. transition_to_* tools for each valid transition
    // 2. read_* tools for readable context nodes
    // 3. write_* tools for writable context nodes
    // 4. Meta-tools if node has meta capability
}

async executeTool(toolName: string, input: any): Promise<any> {
    // Executes:
    // 1. Transition tools (validate and record)
    // 2. Read/write tools (access context)
    // 3. Meta-tools (modify machine definition)
}
```

#### Integration Point for Bootstrap
```typescript
// Tool: execute_machine
execute_machine({
    machineData: MachineData,
    config?: {
        llm?: LLMClientConfig,
        limits?: ExecutionLimits
    }
}): {
    success: boolean,
    result: {
        currentNode: string,
        visitedNodes: string[],
        history: Array<{
            from: string,
            to: string,
            transition: string
        }>
    },
    errors?: string[]
}
```

---

### 4.2 Execution Context

#### Context Structure
```typescript
// File: src/language/base-executor.ts

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

#### Execution Limits
```typescript
export interface ExecutionLimits {
    maxSteps?: number;              // Total steps (default: 1000)
    maxNodeInvocations?: number;    // Per node (default: 100)
    timeout?: number;               // In milliseconds (default: 5 min)
    cycleDetectionWindow?: number;  // Recent transitions to check (default: 20)
}
```

---

### 4.3 Agent Context Builder

#### Class & Public API
```typescript
// File: src/language/agent-context-builder.ts

export class AgentContextBuilder {
    constructor(machineData: MachineData, context: MachineExecutionContext);
    
    buildSystemPrompt(nodeName: string): string;
    
    getAccessibleContextNodes(
        nodeName: string
    ): Map<string, { canRead: boolean; canWrite: boolean }>;
    
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

#### System Prompt Building
- **Node Information**: Name, type, title, attributes
- **Outbound Transitions**: Available choices and labels
- **Context Access**: Readable/writable nodes and permissions
- **Execution History**: Recent transitions and decisions
- **Current State**: Visited nodes, invocation counts

---

## 5. Bootstrap Integration Architecture

### Current Bootstrap Tools

Location: `/home/runner/work/machine/machine/src/language/bootstrap-tools.ts`

#### Core Tools Registry
```typescript
export class BootstrapTools {
    static parse_dygram: BootstrapTool;           // Parse DSL to AST
    static validate_machine: BootstrapTool;       // Validate structure
    static generate_json: BootstrapTool;          // Generate JSON
    static generate_graphviz: BootstrapTool;      // Generate DOT diagram
    static execute_machine: BootstrapTool;        // Execute machine
    static construct_tool: BootstrapTool;         // Meta: create tool
    static get_machine_definition: BootstrapTool; // Meta: get definition
    static update_definition: BootstrapTool;      // Meta: update definition
    
    static getAllTools(): BootstrapTool[];
    static getCoreTools(): BootstrapTool[];
    static getMetaTools(): BootstrapTool[];
}
```

#### Tool Interface
```typescript
export interface BootstrapTool {
    name: string;
    description: string;
    implementation: BootstrapToolFunction;
}

export type BootstrapToolFunction = 
    (input: any, context: BootstrapContext) => Promise<any>;

export interface BootstrapContext {
    currentNode: string;
    visitedNodes: string[];
    nodeInvocationCounts: Map<string, number>;
    attributes: Map<string, any>;
    history: Array<{
        from: string;
        to: string;
        timestamp: string;
    }>;
}
```

---

### Phase 2 Integration Checklist

#### Step 1: Implement Core Tools

| Tool | Source | Input | Output | Priority |
|------|--------|-------|--------|----------|
| `parse_dygram` | `machine-module.ts` + `main.ts` | DSL string | Machine AST | P0 |
| `validate_machine` | `graph-validator.ts` | Machine | ValidationResult | P0 |
| `generate_json` | `generator/generator.ts` | Machine | MachineJSON string | P0 |
| `generate_graphviz` | `diagram/graphviz-generator.ts` | Machine | DOT string | P0 |
| `execute_machine` | `rails-executor.ts` | MachineData | ExecutionResult | P0 |

#### Step 2: Connect to Langium Parser

```typescript
// In bootstrap-tools.ts implementation
import { createMachineServices } from './machine-module.js';
import { parseDocument } from './main.js'; // Need to create or get from module

async function implementParseDygram(input: { code: string }, context: BootstrapContext) {
    const services = createMachineServices();
    const doc = await parseDocument(services, input.code);
    return {
        ast: doc,
        errors: doc.parseErrors || []
    };
}
```

#### Step 3: Connect to GraphValidator

```typescript
// In bootstrap-tools.ts implementation
import { GraphValidator } from './graph-validator.js';

async function implementValidateMachine(input: { machine: Machine }, context: BootstrapContext) {
    const validator = new GraphValidator(input.machine);
    const result = validator.validate();
    return {
        valid: result.valid,
        errors: result,
        statistics: validator.getStatistics()
    };
}
```

#### Step 4: Connect to Generators

```typescript
// In bootstrap-tools.ts implementation
import { 
    generateJSON, 
    generateGraphviz, 
    generateHTML, 
    generateMarkdown,
    generateDSL 
} from './generator/generator.js';

async function implementGenerateJson(input: { machine: Machine }, context: BootstrapContext) {
    const result = generateJSON(input.machine);
    return {
        json: result.content,
        filepath: result.filePath
    };
}

async function implementGenerateGraphviz(input: { machine: Machine }, context: BootstrapContext) {
    const result = generateGraphviz(input.machine, '', undefined);
    return {
        dot: result.content,
        filepath: result.filePath
    };
}
```

#### Step 5: Connect to RailsExecutor

```typescript
// In bootstrap-tools.ts implementation
import { RailsExecutor } from './rails-executor.js';
import { MachineData } from './base-executor.js';

async function implementExecuteMachine(
    input: { machineData: MachineData, config?: any }, 
    context: BootstrapContext
) {
    const executor = await RailsExecutor.create(input.machineData, input.config);
    const result = await executor.execute();
    
    return {
        success: true,
        result: {
            currentNode: result.currentNode,
            visitedNodes: Array.from(result.visitedNodes),
            history: result.history
        }
    };
}
```

---

## 6. Data Flow & Type Conversions

### DSL → Execution Pipeline
```
┌─────────────────────────────────────┐
│ 1. DSL Source Code                  │
│    (Dygram syntax)                  │
└──────────────┬──────────────────────┘
               │ parse_dygram
               ↓
┌─────────────────────────────────────┐
│ 2. Langium AST (Machine)            │
│    - Full type information          │
│    - Annotations parsed             │
│    - Hierarchical structure         │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┬──────────┬─────────────┐
        │             │          │             │
   validate_      generate_   generate_     generate_
   machine        json         graphviz      html
        │             │          │             │
        ↓             ↓          ↓             ↓
    Validation   MachineJSON  DOT Diagram   HTML Page
    Result       (Flattened)  (Graphviz)    (Interactive)
        │             │          │             │
        └──────┬──────┴──────────┴─────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│ 3. Serialized Format                │
│    (Ready for execution)            │
└──────────────┬──────────────────────┘
               │ execute_machine
               ↓
┌─────────────────────────────────────┐
│ 4. Execution Context                │
│    - Visited nodes                  │
│    - Execution history              │
│    - Attributes/context values      │
└─────────────────────────────────────┘
```

### Key Type Conversions

1. **Machine (AST) → MachineJSON**
   - Flatten hierarchical nodes
   - Resolve all node references
   - Extract and serialize attributes
   - Track parent relationships

2. **MachineJSON → DOT Diagram**
   - Build node clusters by type
   - Connect edges with labels
   - Apply styling from annotations
   - Add validation warnings if present

3. **MachineJSON → MachineData (Runtime)**
   - Extract flat node list
   - Convert edges to source/target pairs
   - Prepare attributes for context access
   - Set initial state

---

## 7. Important Implementation Notes

### Parsing & AST
- Uses **Langium** for DSL parsing
- AST types in `src/generated/ast.ts` (auto-generated)
- Grammar likely in `src/language/*.langium` files

### Generators
- **Compositional**: Generators build on each other (e.g., HTML uses Graphviz)
- **Validation Integrated**: All generators call `buildValidationContext()`
- **Template Support**: Graphviz supports runtime interpolation via CEL

### Execution
- **Rails Pattern**: Deterministic vs. agent-controlled transitions
- **No External Calls by Default**: All transitions must be defined
- **Meta Capabilities**: Nodes can update machine definition during execution

### Validators
- **Graph-based**: Checks reachability, cycles, entry/exit points
- **Type Checking**: Optional attribute type validation
- **Context Support**: Validation context integrates with diagram generation

---

## 8. File Locations Summary

| Component | File | Key Exports |
|-----------|------|-------------|
| **Parser** | `src/language/main.ts` | `startLanguageServer` |
| **Parser Module** | `src/language/machine-module.ts` | `createMachineServices` |
| **JSON Generator** | `src/language/generator/generator.ts` | `generateJSON`, `JSONGenerator` |
| **Graphviz Generator** | `src/language/diagram/graphviz-generator.ts` | `generateGraphvizFromJSON` |
| **DOT Diagram** | `src/language/diagram/graphviz-dot-diagram.ts` | `generateDotDiagram` |
| **Graph Validator** | `src/language/graph-validator.ts` | `GraphValidator` |
| **Type Checker** | `src/language/type-checker.ts` | `TypeChecker` |
| **RailsExecutor** | `src/language/rails-executor.ts` | `RailsExecutor` |
| **Base Executor** | `src/language/base-executor.ts` | `BaseExecutor`, `MachineData` |
| **Agent Context** | `src/language/agent-context-builder.ts` | `AgentContextBuilder` |
| **Bootstrap Tools** | `src/language/bootstrap-tools.ts` | `BootstrapTools` |
| **Diagram Types** | `src/language/diagram/types.ts` | `MachineJSON`, `DiagramOptions` |
| **Validation Errors** | `src/language/validation-errors.ts` | `ValidationContext`, `ValidationError` |

---

## 9. Next Steps for Phase 2

### Immediate Tasks
1. **Parse Integration**
   - Get `parseDocument` function from machine module
   - Create parser wrapper in bootstrap tool
   - Handle parse errors properly

2. **Validator Integration**
   - Wrap `GraphValidator.validate()`
   - Expose `getStatistics()`
   - Map validation errors to bootstrap format

3. **Generator Integration**
   - Implement all 4 generator tools
   - Handle AST-to-JSON conversion
   - Test round-trip (JSON → DSL)

4. **Executor Integration**
   - Create MachineData from Machine AST
   - Wire RailsExecutor with LLM config
   - Handle execution errors

### Testing Checklist
- [ ] Parser can parse example machines
- [ ] Validators detect cycles, unreachable nodes
- [ ] JSON round-trip produces valid DSL
- [ ] Graphviz diagrams render
- [ ] Simple machines execute end-to-end
- [ ] Multi-step executions work
- [ ] Tool invocations work correctly

