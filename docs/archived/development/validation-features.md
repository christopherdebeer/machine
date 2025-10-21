# Validation: Validation & Intelligence Features

This document describes the Validation enhancements to DyGram's validation system, including type checking, graph validation, and semantic rules that ensure correctness and provide intelligent feedback.

## Table of Contents

1. [Type Checking System](#type-checking-system)
2. [Graph Validation](#graph-validation)
3. [Semantic Validation](#semantic-validation)
4. [Integration](#integration)
5. [Examples](#examples)
6. [Best Practices](#best-practices)

---

## Type Checking System

Validation.13 introduces a comprehensive type checking system that validates type annotations, infers types from values, and ensures type compatibility across the machine.

### Features

#### 1. Type Compatibility Validation

Validates that declared types match the actual values provided:

```dygram
machine "Type Checking Example"

task myTask {
    count<number>: 42;         // ✅ Valid: number matches
    name<string>: "test";      // ✅ Valid: string matches
    flag<boolean>: true;       // ✅ Valid: boolean matches

    // ❌ Error: Type mismatch
    value<number>: "not a number";  // Error: expected number, got string
}
```

#### 2. Generic Type Support

Validates generic types and nested generics:

```dygram
machine "Generic Types"

task fetchData {
    // Generic types
    response<Promise<Response>>: "pending";
    data<Array<Record>>: [];
    cache<Map<string, any>>: [];

    // Nested generics
    nested<Promise<Array<User>>>: "loading";
}
```

**Validation checks:**
- Balanced brackets (`<` and `>`)
- Valid generic parameter syntax
- Nested generic type validity

#### 3. Type Inference

Automatically infers types from values when no type annotation is provided:

```dygram
machine "Type Inference"

task example {
    // Type inferred as string
    name: "DyGram";

    // Type inferred as number
    count: 42;

    // Type inferred as Array<string>
    tags: ["validation", "types"];
}
```

#### 4. Optional Types

Support for optional type annotations:

```dygram
machine "Optional Types"

task example {
    required<string>: "must have value";     // ✅ Valid
    optional<string?>: null;                 // ✅ Valid (optional type)

    // ❌ Error: required type but no value
    missing<string>;  // Error: no value provided for non-optional type
}
```

### Type Compatibility Rules

The type checker uses these compatibility rules:

1. **Exact match**: `string` ↔ `string`, `number` ↔ `number`, `boolean` ↔ `boolean`
2. **any is universal**: `any` is compatible with all types
3. **Array element types**: `Array<string>` ↔ `Array<string>`
4. **Generic parameters**: Generic parameters must match recursively

### Error Messages

Type checking errors provide detailed information:

```
Error: Type mismatch: expected number, got string
  at task.attribute (line 5)
```

```
Error: Invalid type syntax: Promise<Array<Record>
  Unbalanced generic brackets
  at task.response (line 8)
```

---

## Graph Validation

Validation.14 provides comprehensive graph structure validation, detecting common issues like unreachable nodes, cycles, and missing entry/exit points.

### Features

#### 1. Unreachable Node Detection

Identifies nodes that cannot be reached from entry points:

```dygram
machine "Unreachable Nodes"

init start;
task processA;
task processB;  // ⚠️ Warning: Unreachable node

start -> processA;
// processB has no incoming edges from reachable nodes
```

**Warning:** `Unreachable nodes detected: processB. These nodes cannot be reached from entry points.`

#### 2. Orphaned Node Detection

Finds nodes with no incoming or outgoing edges:

```dygram
machine "Orphaned Nodes"

init start;
task connected;
task orphaned;  // ⚠️ Warning: Orphaned node (no edges)

start -> connected;
```

**Warning:** `Orphaned nodes detected: orphaned. These nodes have no incoming or outgoing edges.`

#### 3. Cycle Detection

Detects cycles in the graph that may lead to infinite loops:

```dygram
machine "Cycles"

task taskA;
task taskB;
task taskC;

// Forms a cycle: taskA → taskB → taskC → taskA
taskA -> taskB;
taskB -> taskC;
taskC -> taskA;  // ⚠️ Warning: Cycle detected
```

**Warning:** `Cycle 1 detected: taskA → taskB → taskC → taskA. This may lead to infinite loops.`

#### 4. Entry Point Validation

Validates that the machine has clear entry points:

```dygram
machine "No Entry Point"

task taskA;
task taskB;

// All nodes have incoming edges, no clear entry point
taskA -> taskB;
taskB -> taskA;  // ⚠️ Warning: No entry points
```

**Warning:** `No entry points found. Consider adding an init node or a node with no incoming edges.`

#### 5. Exit Point Detection

Identifies exit points (nodes with no outgoing edges):

```dygram
machine "Exit Points"

init start;
task process;
state success;  // Exit point (no outgoing edges)

start -> process;
process -> success;
```

### Graph Statistics

The graph validator can provide statistics:

```typescript
{
    nodeCount: 10,
    edgeCount: 15,
    entryPointCount: 1,
    exitPointCount: 2,
    maxDepth: 5,
    cycleCount: 0
}
```

### Validation Results

Graph validation returns a comprehensive result:

```typescript
{
    valid: boolean,
    unreachableNodes?: string[],
    orphanedNodes?: string[],
    cycles?: string[][],
    missingEntryPoints?: boolean,
    missingExitPoints?: boolean,
    warnings?: string[]
}
```

---

## Semantic Validation

Validation.15 enforces semantic rules based on node types, relationships, and annotations to ensure the machine behaves as intended.

### Node Type Semantics

#### Rule 1: Init Nodes Must Have Outgoing Edges

Init nodes are entry points and should transition to other nodes:

```dygram
machine "Init Node Validation"

init start;  // ⚠️ Warning: No outgoing edges

task process;
// Missing: start -> process
```

**Warning:** `Init node 'start' has no outgoing edges. Init nodes should transition to other nodes.`

**Fix:**
```dygram
init start;
task process;
start -> process;  // ✅ Valid
```

#### Rule 2: Context Nodes Should Not Have Incoming Edges

Context nodes represent configuration and shouldn't be execution targets:

```dygram
machine "Context Node Validation"

context config {
    apiKey<string>: "secret";
}

task setup;
setup -> config;  // ⚠️ Warning: Context nodes shouldn't have incoming edges
```

**Warning:** `Context node 'config' has incoming edges. Context nodes typically represent configuration and should not be targets of edges.`

**Fix:** Remove edges targeting context nodes. Instead, reference them via template variables:

```dygram
context config {
    apiKey<string>: "secret";
}

task apiCall {
    prompt: "Use key {{ config.apiKey }}";  // ✅ Valid: Template reference
}
```

### Relationship Semantics

#### Inheritance Validation

Inheritance relationships (`<|--`) should typically occur between nodes of the same type:

```dygram
machine "Inheritance Validation"

task BaseProcessor @Abstract;
state Processor;  // Different type

BaseProcessor <|-- Processor;  // ⚠️ Warning: Type mismatch in inheritance
```

**Warning:** `Inheritance relationship from 'BaseProcessor' (task) to 'Processor' (state). Inheritance typically occurs between nodes of the same type.`

**Fix:** Use same node types for inheritance:

```dygram
task BaseProcessor @Abstract;
task DataProcessor;  // ✅ Same type

BaseProcessor <|-- DataProcessor;  // ✅ Valid
```

### Annotation Compatibility

#### @Async Annotation

Should only be used on task nodes:

```dygram
machine "Async Annotation Validation"

state myState @Async;  // ⚠️ Warning: @Async on non-task node
task myTask @Async;    // ✅ Valid
```

**Warning:** `@Async annotation is typically used only on task nodes, but 'myState' is of type 'state'.`

#### @Singleton Annotation

Makes sense for tasks or contexts, but not states:

```dygram
machine "Singleton Annotation Validation"

state myState @Singleton;      // ⚠️ Warning: @Singleton on state
context config @Singleton;     // ✅ Valid
task service @Singleton;       // ✅ Valid
```

**Warning:** `@Singleton annotation on state node 'myState' may not be meaningful. Consider using it on task or context nodes.`

#### @Abstract Annotation

Cannot be used on init nodes (they are concrete entry points):

```dygram
machine "Abstract Annotation Validation"

init start @Abstract;  // ❌ Error: @Abstract on init node
task processor @Abstract;  // ✅ Valid
```

**Error:** `@Abstract annotation cannot be used on init node 'start'. Init nodes are concrete entry points.`

---

## Integration

Validation validations are automatically integrated into the DyGram validation pipeline. When you save a `.dygram` file or run validation, all checks are performed:

### Validation Flow

1. **Parse** → AST generation
2. **Basic Validation** → Duplicate names, undefined references
3. **expressivity Validation** → Multiplicity format
4. **Validation Type Checking** → Type compatibility, generic types
5. **Validation Graph Validation** → Reachability, cycles, entry/exit points
6. **Validation Semantic Validation** → Node type rules, relationships, annotations

### Programmatic Usage

#### Type Checker

```typescript
import { TypeChecker } from './type-checker.js';

const typeChecker = new TypeChecker(machine);

// Validate all attributes
const errors = typeChecker.validateAllAttributes();

// Check specific attribute
const result = typeChecker.validateAttributeType(attribute);
if (!result.valid) {
    console.error(result.message);
}

// Validate generic type syntax
const typeResult = typeChecker.validateGenericType('Promise<Array<Record>>');

// Get attribute type
const attrType = typeChecker.getAttributeType('myNode', 'myAttribute');
```

#### Graph Validator

```typescript
import { GraphValidator } from './graph-validator.js';

const graphValidator = new GraphValidator(machine);

// Run full validation
const result = graphValidator.validate();

// Find specific issues
const unreachable = graphValidator.findUnreachableNodes();
const cycles = graphValidator.detectCycles();
const orphaned = graphValidator.findOrphanedNodes();

// Get entry/exit points
const entryPoints = graphValidator.findEntryPoints();
const exitPoints = graphValidator.findExitPoints();

// Get statistics
const stats = graphValidator.getStatistics();
```

---

## Examples

### Example 1: Valid Machine with All Features

```dygram
machine "Validation Complete Example"

// Configuration context (no incoming edges)
context apiConfig @Singleton {
    baseUrl<string>: "https://api.example.com";
    timeout<number>: 5000;
}

// Abstract base task
task BaseTask @Abstract {
    retries<number>: 3;
}

// Concrete tasks with proper types
task FetchData @Async {
    url<string>: "{{ apiConfig.baseUrl }}/data";
    response<Promise<Response>>: "pending";
}

task ProcessData {
    input<Array<Record>>: [];
    output<Map<string, any>>: [];
}

// States for outcomes
state Success {
    status<string>: "completed";
}

state Error {
    message<string>: "failed";
}

// Clear entry point
init start;

// Inheritance relationship
BaseTask <|-- FetchData;
BaseTask <|-- ProcessData;

// Valid execution flow (no cycles, no unreachable nodes)
start -> FetchData;
FetchData -> ProcessData;
ProcessData -> Success;
ProcessData -> Error;
```

**Validation:** ✅ All checks pass

### Example 2: Machine with Validation Issues

```dygram
machine "Validation Issues Example"

// ⚠️ Warning: Init node with no outgoing edges
init start;

// ❌ Error: Type mismatch
task badTypes {
    count<number>: "not a number";
}

// ⚠️ Warning: Orphaned node (no edges)
task orphaned;

// ⚠️ Warning: Unreachable node
task unreachable;

// ⚠️ Warning: Cycle detected
task cycleA;
task cycleB;
cycleA -> cycleB;
cycleB -> cycleA;

// ⚠️ Warning: @Async on non-task node
state asyncState @Async;

// ❌ Error: @Abstract on init node
init abstractInit @Abstract;

// ⚠️ Warning: Context node with incoming edge
context config {
    value: 42;
}
cycleA -> config;
```

**Validation:** ❌ 2 errors, 6 warnings

**Errors:**
1. Type mismatch in `badTypes.count`: expected number, got string
2. @Abstract annotation on init node `abstractInit`

**Warnings:**
1. Init node 'start' has no outgoing edges
2. Orphaned node 'orphaned'
3. Unreachable node 'unreachable'
4. Cycle detected: cycleA → cycleB → cycleA
5. @Async on state node 'asyncState'
6. Context node 'config' has incoming edges

---

## Best Practices

### Type Checking

1. **Always specify types for public APIs**: Make interfaces explicit with type annotations
2. **Use generic types for promises and collections**: `Promise<T>`, `Array<T>`, `Map<K, V>`
3. **Leverage type inference for simple cases**: Let DyGram infer types for literals
4. **Use optional types for nullable values**: `type?` for optional attributes

### Graph Structure

1. **Always have an init node**: Clear entry point for execution
2. **Avoid unreachable nodes**: Ensure all nodes are part of execution flow
3. **Document intentional cycles**: Use comments to explain retry loops
4. **Have clear exit points**: Define success and error termination states

### Semantic Rules

1. **Use task for active operations**: Tasks perform work
2. **Use state for passive conditions**: States represent outcomes
3. **Use context for configuration**: Keep config separate from execution
4. **Use init for entry points**: Single clear starting point
5. **Match annotations to node types**: @Async for tasks, @Singleton for services

### Annotations

1. **@Abstract**: Use for base classes that shouldn't be instantiated
2. **@Singleton**: Use for services or contexts with shared state
3. **@Async**: Use for tasks that perform asynchronous operations
4. **@Critical**: Use for business-critical nodes requiring special handling
5. **@Deprecated**: Use with value to explain migration path

---

## Migration from advanced syntax

Validation is **fully backward compatible** with advanced syntax. Existing machines will continue to work, but you'll now receive helpful warnings and errors for potential issues.

### No Breaking Changes

All existing valid machines remain valid in Validation.

### New Warnings

You may see new warnings for:
- Unreachable or orphaned nodes
- Cycles in the graph
- Annotation misuse
- Context nodes with edges

These are informational and don't break existing functionality.

### New Errors

You may see new errors for:
- Type mismatches (if you specified types incorrectly)
- Invalid generic type syntax
- @Abstract on init nodes (semantic error)

**Action:** Fix these errors to ensure correct behavior.

---

## Validation Levels

DyGram uses different validation levels:

### Errors (❌)

Must be fixed for correct behavior:
- Type mismatches
- Invalid type syntax
- Undefined references
- Duplicate names
- Semantic errors (@Abstract on init)

### Warnings (⚠️)

Suggest improvements but don't prevent execution:
- Unreachable nodes
- Orphaned nodes
- Cycles
- Missing entry/exit points
- Annotation misuse
- Multiplicity range issues

### Info (ℹ️)

Informational messages:
- Graph statistics
- Inferred dependencies
- Type inference results

---

## Performance

Validation validations are designed to be efficient:

- **Type checking**: O(n) where n is the number of attributes
- **Graph validation**: O(V + E) where V = nodes, E = edges
- **Semantic validation**: O(n) where n is the number of nodes

For typical machines (< 100 nodes), validation completes in < 10ms.

---

## Debugging Validation Issues

### Enable Verbose Logging

```bash
dygram --validate --verbose myfile.dygram
```

### Use VSCode Extension

The DyGram VSCode extension shows validation errors inline with red squiggly lines.

### Programmatic Access

```typescript
const document = await parse(text, { validation: true });
const errors = document.diagnostics?.filter(d => d.severity === 1);  // Errors only
const warnings = document.diagnostics?.filter(d => d.severity === 2);  // Warnings only
```

---

## Future Enhancements

Planned improvements for future phases:

- **Template variable type checking**: Validate types in `{{ node.attr }}` references
- **Multiplicity enforcement**: Runtime validation of cardinality constraints
- **Custom validation rules**: User-defined validation plugins
- **Flow analysis**: Detect dead code and unused nodes
- **Performance analysis**: Warn about potential performance issues

---

## API Reference

### TypeChecker

```typescript
class TypeChecker {
    constructor(machine: Machine);

    // Parse type annotation
    parseType(typeStr: string): TypeInfo;

    // Infer type from value
    inferType(value: AttributeValue): string;

    // Check type compatibility
    areTypesCompatible(declared: string, inferred: string): TypeCheckResult;

    // Validate attribute type
    validateAttributeType(attr: Attribute): TypeCheckResult;

    // Validate generic type syntax
    validateGenericType(typeStr: string): TypeCheckResult;

    // Validate template reference
    validateTemplateReference(reference: string, expectedType?: string): TypeCheckResult;

    // Validate all attributes
    validateAllAttributes(): Map<string, TypeCheckResult>;

    // Get attribute type
    getAttributeType(nodeName: string, attrName: string): string | null;
}
```

### GraphValidator

```typescript
class GraphValidator {
    constructor(machine: Machine);

    // Find entry points
    findEntryPoints(): string[];

    // Find exit points
    findExitPoints(): string[];

    // Find unreachable nodes
    findUnreachableNodes(): string[];

    // Find orphaned nodes
    findOrphanedNodes(): string[];

    // Detect cycles
    detectCycles(): string[][];

    // Check if node is in cycle
    isNodeInCycle(nodeName: string): boolean;

    // Find path between nodes
    findPath(source: string, target: string): string[];

    // Find longest path
    findLongestPath(): string[];

    // Validate entire graph
    validate(): GraphValidationResult;

    // Get statistics
    getStatistics(): GraphStatistics;
}
```

### TypeInfo

```typescript
interface TypeInfo {
    baseType: string;
    genericParams?: string[];
    isOptional?: boolean;
}
```

### TypeCheckResult

```typescript
interface TypeCheckResult {
    valid: boolean;
    expectedType?: string;
    actualType?: string;
    message?: string;
}
```

### GraphValidationResult

```typescript
interface GraphValidationResult {
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

## Conclusion

Validation brings intelligent validation to DyGram, ensuring that your state machines are:

- **Type-safe**: Catch type errors before execution
- **Structurally sound**: Valid graph structure with reachable nodes
- **Semantically correct**: Proper use of node types, relationships, and annotations

All while maintaining **100% backward compatibility** with earlier phases.

For more information, see:
- [relationship types: Relationship Types](./RELATIONSHIP_TYPES.md)
- [expressivity: Multiplicity & Annotations](./PHASE2_FEATURES.md)
- [advanced syntax: Notes & Generics](./PHASE3_FEATURES.md)
- [Examples directory](../examples/)
- [Test suite](../test/)
