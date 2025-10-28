# Dygram Self-Hosting Design

## Executive Summary

This document presents a design for implementing Dygram in itself - a minimal core system that enables Dygram to bootstrap its own functionality. The goal is to create a meta-circular evaluator where Dygram machines can define, generate, and execute other Dygram machines, including the Dygram system itself.

## Vision

A self-hosted Dygram system where:
1. The DSL parser, generator, and runtime are defined as Dygram machines
2. Existing tools/code-tasks become first-class nodes in the machine
3. Meta-nodes enable agents to improve the core system
4. The system can evolve itself through execution

## Core Architecture

### Three-Layer Bootstrap Model

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Self-Improving Dygram                         │
│  (Machines that modify the Dygram system itself)        │
└─────────────────────┬───────────────────────────────────┘
                      │ uses
┌─────────────────────┴───────────────────────────────────┐
│  Layer 2: Dygram-in-Dygram                              │
│  (Parser, Generator, Runtime as machines)               │
└─────────────────────┬───────────────────────────────────┘
                      │ bootstrapped by
┌─────────────────────┴───────────────────────────────────┐
│  Layer 1: Minimal Bootstrap Core                        │
│  (Essential primitives implemented in TypeScript)       │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Minimal Bootstrap Core

The smallest possible TypeScript implementation needed to execute Dygram machines. This is the bedrock that can never be removed.

**Essential Components:**

1. **AST Representation** (already exists in `generated/ast.js`)
   - Node, Edge, Attribute, Machine types
   - Minimal data structures

2. **Primitive Executor** (subset of current `RailsExecutor`)
   - Execute machine transitions
   - Invoke tools/code-tasks
   - Manage execution context
   - Minimal: ~200-300 lines

3. **Tool Invocation Bridge**
   - Call existing TypeScript functions from machines
   - Map tool names to implementations
   - Handle input/output marshaling

4. **Core Tools** (code-tasks as executable nodes)
   ```typescript
   // These become Tool nodes in Layer 2
   - parse_dygram: Parse .dygram source → AST
   - validate_machine: Check structure, types, cycles
   - generate_json: AST → JSON output
   - generate_graphviz: AST → DOT visualization
   - execute_machine: Run a machine with rails pattern
   ```

### Layer 2: Dygram-in-Dygram

The Dygram system components defined as Dygram machines that use Layer 1 primitives.

#### 2.1 Parser Machine

```dygram
machine "Dygram Parser" @Version("1.0")

// Input: Source code
Input source {
    code<string>: "";
    filepath<string>: "";
}

// Core parsing tasks
Task tokenize {
    prompt: "Tokenize source using grammar rules";
    meta: true;  // Can construct tokenizer if needed
}

Task buildAST {
    prompt: "Build AST from tokens";
    uses: "parse_dygram";  // Calls Layer 1 tool
}

Task validateSyntax {
    prompt: "Validate syntax tree";
    uses: "validate_machine";
}

// Output: Parsed machine
Result ast {
    machine<Machine>: null;
    errors<Array<string>>: [];
}

// Pipeline flow
source -> tokenize -> buildAST -> validateSyntax -> ast;
```

#### 2.2 Generator Machine

```dygram
machine "Dygram Generator" @Version("1.0")

Input machineAST {
    ast<Machine>: null;
    format<string>: "json";
}

Task validateStructure {
    uses: "validate_machine";
}

Task generateOutput {
    prompt: "Generate output in requested format";
    meta: true;
}

// Format-specific tasks
Task generateJSON {
    uses: "generate_json";
}

Task generateGraphviz {
    uses: "generate_graphviz";
}

Task generateHTML {
    uses: "generate_html";
}

Task generateDSL {
    uses: "generate_dsl";
}

Result output {
    content<string>: "";
    format<string>: "";
}

// Conditional branching based on format
machineAST -> validateStructure;
validateStructure -> generateOutput;

// Agent decides format
generateOutput -> generateJSON, generateGraphviz, generateHTML, generateDSL;

generateJSON -> output;
generateGraphviz -> output;
generateHTML -> output;
generateDSL -> output;
```

#### 2.3 Runtime Machine (Executor)

```dygram
machine "Dygram Runtime Executor" @Version("1.0")

// Configuration
Context config {
    maxSteps<number>: 1000;
    maxNodeInvocations<number>: 100;
    llmModel<string>: "claude-3-5-sonnet-20241022";
}

// Input: Machine to execute
Input targetMachine {
    machineData<MachineData>: null;
    entryNode<string>: "";
}

// Execution context
Context executionContext {
    currentNode<string>: "";
    visitedNodes<Array<string>>: [];
    nodeInvocationCounts<Map<string, number>>: {};
    history<Array<any>>: [];
}

// Core execution tasks
Task initializeExecution {
    prompt: "Setup execution context and validate machine";
}

Task evaluateNode {
    prompt: "Evaluate current node and determine next steps";
    meta: true;  // Can construct tools dynamically
}

Task checkTransitions {
    prompt: "Find available transitions from current node";
}

Task determineNextNode {
    prompt: "Decide next node (automated or agent-controlled)";
}

Task invokeAgent {
    prompt: "Invoke Claude agent for complex decision";
    uses: "execute_machine";  // Recursive - Layer 1 primitive
}

Task updateContext {
    prompt: "Update execution context with results";
}

Task checkLimits {
    prompt: "Verify execution limits not exceeded";
}

// Terminal states
State completed;
State failed;

Result executionResult {
    success<boolean>: false;
    finalNode<string>: "";
    output<any>: null;
    history<Array<any>>: [];
}

// Main execution loop
targetMachine -> initializeExecution;
initializeExecution -> evaluateNode;

// Execution cycle (can loop)
evaluateNode -> checkTransitions -> determineNextNode;
determineNextNode -> invokeAgent?, updateContext;
updateContext -> checkLimits;

// Loop back or terminate
checkLimits -> evaluateNode, completed, failed;

completed -> executionResult;
failed -> executionResult;
```

### Layer 3: Self-Improving Dygram

Machines that can inspect, modify, and improve the Dygram system itself.

#### 3.1 Meta-System Machine

```dygram
machine "Dygram Self-Improvement System" @Meta

// Current system state
Context systemState {
    parserVersion<string>: "1.0";
    generatorVersion<string>: "1.0";
    runtimeVersion<string>: "1.0";
    availableTools<Array<string>>: [];
}

// Meta-capabilities
Task inspectSystem {
    prompt: "Analyze current Dygram implementation";
    uses: "get_machine_definition";
}

Task identifyImprovements {
    prompt: "Find optimization opportunities in parser/generator/runtime";
    meta: true;
}

Task proposeChanges {
    prompt: "Design improvements to core system";
}

Task validateProposal {
    prompt: "Verify proposed changes maintain correctness";
}

Task applyChanges {
    prompt: "Update system machines with improvements";
    uses: "update_definition";
    meta: true;
}

Task testChanges {
    prompt: "Execute test suite on modified system";
}

// Self-improvement cycle
start -> inspectSystem -> identifyImprovements;
identifyImprovements -> proposeChanges -> validateProposal;
validateProposal -> applyChanges -> testChanges;
testChanges -> inspectSystem;  // Loop for continuous improvement
```

## Tool System Integration

### Existing Code-Tasks as Tool Nodes

Current TypeScript implementations become first-class Tool nodes:

```dygram
// Example: Parser tool definition
Tool parse_dygram {
    description: "Parse Dygram source code to AST";
    input_schema: {
        code<string>: "Source code";
        filepath<string>: "File path";
    };
    output_schema: {
        ast<Machine>: "Parsed machine";
        errors<Array<string>>: "Parse errors";
    };
    implementation: "src/language/main.ts:parseDocument";
}

// Example: Generator tool
Tool generate_json {
    description: "Generate JSON representation of machine";
    input_schema: {
        machine<Machine>: "Machine AST";
        destination<string>: "Output path";
    };
    output_schema: {
        json<string>: "Generated JSON";
        filepath<string>: "Written file path";
    };
    implementation: "src/language/generator/generator.ts:generateJSON";
}

// Example: Executor tool
Tool execute_machine {
    description: "Execute a machine using rails pattern";
    input_schema: {
        machineData<MachineData>: "Machine definition";
        config<ExecutorConfig>: "Execution configuration";
    };
    output_schema: {
        result<any>: "Execution result";
        history<Array<any>>: "Execution history";
    };
    implementation: "src/language/rails-executor.ts:RailsExecutor.execute";
}
```

### Dynamic Tool Construction

Agents can construct new tools using existing `MetaToolManager`:

```dygram
Task constructOptimizer {
    prompt: "Construct a tool to optimize machine definitions";
    uses: "construct_tool";
    input: {
        name: "optimize_machine";
        description: "Analyze and optimize machine structure";
        implementation_strategy: "composition";
        implementation_details: {
            steps: [
                "validate_machine",
                "analyze_graph_efficiency",
                "propose_optimizations",
                "apply_safe_optimizations"
            ]
        }
    }
}
```

## Type System in Self-Hosted Model

The type system becomes self-describing:

```dygram
machine "Dygram Type System"

// Primitive types as Concept nodes
Concept PrimitiveType {
    name<string>: "";
    validation<string>: "";  // Validation rule (CEL expression)
}

Concept StringType @extends(PrimitiveType) {
    name: "string";
    validation: "type(value) == string";
}

Concept NumberType @extends(PrimitiveType) {
    name: "number";
    validation: "type(value) == double || type(value) == int";
}

Concept BooleanType @extends(PrimitiveType) {
    name: "boolean";
    validation: "type(value) == bool";
}

// Generic types
Concept GenericType {
    name<string>: "";
    params<Array<string>>: [];
}

Concept ArrayType @extends(GenericType) {
    name: "Array";
    params: ["T"];
    validation: "type(value) == list";
}

Concept PromiseType @extends(GenericType) {
    name: "Promise";
    params: ["T"];
}

// Relationships
StringType <|-- PrimitiveType;
NumberType <|-- PrimitiveType;
ArrayType <|-- GenericType;
```

## Implementation Strategy

### Phase 1: Extract Bootstrap Core (Week 1-2)

1. **Create `bootstrap-executor.ts`**
   - Minimal executor (subset of RailsExecutor)
   - Essential: execute nodes, follow edges, call tools
   - ~300 lines of code

2. **Define Core Tools Interface**
   - Extract tool signatures from existing code
   - Create tool registry mapping
   - Document tool contracts

3. **Create First Self-Hosted Machine**
   - Simple "hello world" that uses core tools
   - Validates bootstrap approach

### Phase 2: Implement Layer 2 Machines (Week 3-4)

1. **Parser Machine**
   - Define in Dygram DSL
   - Use existing `parse_dygram` tool
   - Validate against test suite

2. **Generator Machine**
   - Define output generation pipeline
   - Conditional format selection
   - Reuse existing generator tools

3. **Runtime Machine**
   - Self-describing executor
   - Uses `execute_machine` tool recursively
   - Meta-circular evaluation

### Phase 3: Self-Improvement System (Week 5-6)

1. **Meta-Tools Integration**
   - Enable `get_machine_definition`
   - Enable `update_definition`
   - Enable `construct_tool`

2. **Self-Improvement Machine**
   - Analyze system performance
   - Propose optimizations
   - Apply safe modifications

3. **Testing & Validation**
   - Ensure bootstrap correctness
   - Verify self-modifications don't break system
   - Performance benchmarks

## Key Benefits

### 1. **Transparency**
The entire system is visible and modifiable as Dygram machines. No hidden implementation details.

### 2. **Evolvability**
Agents can propose and apply improvements to the parser, generator, and runtime through normal machine execution.

### 3. **Extensibility**
New capabilities are added by defining new machines and tools, not by modifying TypeScript code.

### 4. **Introspection**
The system can examine its own structure, reason about its behavior, and explain its decisions.

### 5. **Meta-Programming**
True meta-programming where machines can create, modify, and execute other machines dynamically.

## Technical Challenges

### Challenge 1: Bootstrap Paradox
**Problem**: Need Dygram to define Dygram
**Solution**: Layer 1 minimal TypeScript core that can execute Layer 2 machines

### Challenge 2: Performance
**Problem**: Self-hosted systems can be slow
**Solution**:
- Keep Layer 1 highly optimized
- Cache compiled machines
- Code generation for hot paths

### Challenge 3: Type Safety
**Problem**: Self-modifying code risks type errors
**Solution**:
- Comprehensive validation before modifications
- Type checking at machine definition time
- Rollback mechanism for failed changes

### Challenge 4: Debugging
**Problem**: Errors in self-hosted system harder to debug
**Solution**:
- Detailed execution traces
- Layer-aware debugging (L1, L2, L3)
- Fallback to previous working version

## Example: Complete Self-Hosting Workflow

```dygram
machine "Dygram Compilation Pipeline" @SelfHosted

// 1. Parse source code using Parser Machine
Input dygramSource {
    code<string>: "machine \"Example\" ...";
}

Task parseSource {
    machineRef: "DygramParser";  // References Layer 2 machine
    input: {
        source: dygramSource.code
    };
}

// 2. Generate outputs using Generator Machine
Task generateOutputs {
    machineRef: "DygramGenerator";
    input: {
        ast: parseSource.output.ast,
        format: "json,graphviz,html"
    };
}

// 3. Execute using Runtime Machine
Task executeMachine {
    machineRef: "DygramRuntimeExecutor";
    input: {
        machineData: parseSource.output.ast,
        config: {
            maxSteps: 1000
        }
    };
}

// 4. Improve system using Meta-System
Task improveDygram {
    machineRef: "DygramSelfImprovementSystem";
    input: {
        currentSystem: "all"  // Analyze all components
    };
}

// Pipeline
dygramSource -> parseSource -> generateOutputs -> executeMachine;

// Optional: Self-improvement
executeMachine -> improveDygram;
```

## Minimal Core API

The TypeScript "bootstrap core" needs only these functions:

```typescript
// bootstrap-core.ts (Layer 1)

interface BootstrapCore {
    // Load and validate a machine
    loadMachine(source: string): MachineData;

    // Execute a single node (primitive operation)
    executeNode(
        nodeName: string,
        machineData: MachineData,
        context: ExecutionContext
    ): Promise<NodeResult>;

    // Follow an edge to next node
    followEdge(
        fromNode: string,
        toNode: string,
        machineData: MachineData,
        context: ExecutionContext
    ): Promise<void>;

    // Invoke a registered tool
    invokeTool(
        toolName: string,
        input: any
    ): Promise<any>;

    // Register a tool implementation
    registerTool(
        name: string,
        implementation: ToolFunction
    ): void;
}
```

Everything else is built in Dygram machines on top of this core.

## Migration Path

### Current State
- Full TypeScript implementation
- ~10,000+ lines of code
- All logic in .ts files

### Target State
- Minimal TypeScript bootstrap (~500 lines)
- Core logic in .dygram machines
- Self-improving system

### Migration Steps
1. ✅ Identify minimal bootstrap requirements
2. Extract core tools interface
3. Implement bootstrap executor
4. Define Parser machine
5. Define Generator machine
6. Define Runtime machine
7. Test Layer 2 machines
8. Implement Meta-System
9. Validate self-improvement
10. Deprecate old TypeScript implementation

## Conclusion

This design enables Dygram to be implemented in itself through a three-layer bootstrap architecture:
1. **Layer 1**: Minimal TypeScript core (~500 lines)
2. **Layer 2**: Parser, Generator, Runtime as Dygram machines
3. **Layer 3**: Self-improvement meta-system

The key insight is that existing code-tasks become Tool nodes, and the meta-tool system enables agents to construct new tools and modify machines dynamically. This creates a truly self-hosted, evolvable system where Dygram machines can define and improve Dygram itself.

## Next Steps

1. Review and refine this design
2. Create proof-of-concept bootstrap executor
3. Implement first Layer 2 machine (Parser)
4. Validate approach with test suite
5. Iterate and expand
