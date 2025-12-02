# Validation Features Examples

This directory contains examples demonstrating DyGram's comprehensive validation system, including type checking, graph validation, and semantic validation.

## Examples

### `type-checking.dy`
Type checking and type validation:
- Primitive type validation (string, number, boolean)
- Collection type validation (arrays)
- Generic type validation (`Promise<T>`, `Array<T>`)
- Optional type validation (string?)
- Type inference from values
- Template variable type checking
- Type mismatch detection

### `graph-validation.dy`
Graph structure validation:
- Unreachable node detection
- Cycle detection in workflows
- Entry/exit point validation
- Orphaned node detection
- Graph statistics (node counts, edge counts)
- Connected components analysis
- Max nesting depth validation

### `semantic-validation.dy`
Semantic validation of DyGram patterns:
- Init node validation (must have outgoing edges)
- Context node validation (shouldn't have incoming edges)
- Relationship semantics (inheritance between compatible types)
- Annotation compatibility (@Async on tasks only)
- @Singleton validation (tasks and contexts only)
- @Abstract validation (not on init nodes)
- Best practice enforcement

### `complete-validated.dy`
Complete example with all validation features:
- Type-checked attributes
- Valid graph structure
- Semantic correctness
- Proper annotations
- Well-formed relationships
- Documentation notes
- Real-world e-commerce example

## Validation Types

### 1. Type Checking

Validates attribute types and catches type errors:

#### Primitive Types

#### Collection Types

#### Optional Types

#### Type Inference

### 2. Graph Validation

Ensures structural integrity:

#### Unreachable Nodes

#### Cycle Detection

#### Entry Point Validation

#### Orphaned Nodes

### 3. Semantic Validation

Enforces design patterns and best practices:

#### Init Node Rules

**Valid:**

#### Context Node Rules

**Valid:**

#### Annotation Validation

**Valid:**

## Validation Levels

| Level | Meaning | Action |
|-------|---------|--------|
| **Error** | Structural problem or type mismatch | Must fix |
| **Warning** | Potential issue or design smell | Should review |
| **Info** | Interesting fact or statistic | FYI |

## Validation Messages

### Type Errors
- `Type mismatch: expected number, got string`
- `Context reference "config.missing" is undefined`
- `Cannot assign null to non-optional type`

### Graph Errors
- `Unreachable node: orphan (no path from init)`
- `Cycle detected: a → b → c → a`
- `No init node defined`
- `Orphaned node: isolated (no edges)`

### Semantic Errors
- `Init node must have outgoing edges`
- `Context node should not have incoming edges`
- `@Async annotation only valid on task nodes`
- `@Singleton annotation not valid on init nodes`
- `Init nodes cannot be abstract`

## Graph Statistics

The validator provides useful metrics:

- **Node Counts** by type (task, state, init, context)
- **Edge Counts** by relationship type
- **Max Nesting Depth**
- **Connected Components** count
- **Cyclic Complexity**

## Best Practices

1. **Always Define Init Node**: Every machine should have an entry point
2. **Avoid Unreachable Nodes**: Ensure all nodes are reachable from init
3. **Use Context Correctly**: Contexts for configuration, not execution flow
4. **Type Your Attributes**: Always specify types for better validation
5. **Document Intentional Cycles**: Use notes to explain loops and retries
6. **Follow Annotation Rules**: Apply annotations only where valid
7. **Review Warnings**: Address warnings to improve code quality

## Usage

### Validate a File
```bash
npx dygram parseAndValidate examples/validation/type-checking.dygram
```

### Generate with Validation
```bash
npx dygram generate examples/validation/complete-validated.dy -f json,html
```

### Run Tests
```bash
npm test -- --grep validation
```

## See Also

- [Advanced Features](../../docs/advanced-features.md) - Validation documentation
- [Validation Error Handling](../../docs/VALIDATION_ERROR_HANDLING.md) - Error reference
- [Testing Approach](../../docs/testing-approach.md) - Validation methodology
- [Syntax Guide](../../docs/syntax-guide.md) - Language syntax

### `complete-validated.dy`

Phase 4: Complete Validated Example

```dy examples/validation/complete-validated.dygram
machine "Phase 4: Complete Validated Example"

// This example demonstrates all Phase 4 validation features working together
// All validation checks pass for this machine

// ========== Configuration Context ==========

context apiConfig @Singleton {
    baseUrl<string>: "https://api.example.com";
    apiKey<string>: "secret-key-12345";
    timeout<number>: 5000;
    maxRetries<number>: 3;
}

context appSettings {
    debugMode<boolean>: false;
    logLevel<string>: "INFO";
    cacheSize<number>: 1000;
}

// ========== Abstract Base Classes ==========

task BaseDataProcessor @Abstract {
    version<string>: "2.0";
    retries<number>: 3;
}

task BaseValidator @Abstract {
    strictMode<boolean>: true;
}

// ========== Concrete Task Implementations ==========

task DataFetcher @Async {
    url<string>: "{{ apiConfig.baseUrl }}/data";
    response<Promise<Response>>: "pending";
    timeoutMs<number>: 10;
}

task DataProcessor {
    input<Array<Record>>: [];
    output<Map<string, any>>: [];
    processedCount<number>: 0;
}

task DataValidator {
    rules<Array<string>>: ["required", "format", "range"];
    validationResult<boolean>: false;
}

task DataPersister @Async {
    saveLocation<string>: "database";
    saved<boolean>: false;
}

// ========== Service Tasks ==========

task CacheService @Singleton {
    cacheData<Map<string, any>>: [];
    hitRate<number>: 0;
}

task LoggingService @Singleton {
    logs<Array<string>>: [];
    level<string>: "{{ appSettings.logLevel }}";
}

// ========== State Nodes ==========

state ValidationPassed {
    timestamp<number>: 0;
    recordCount<number>: 0;
}

state ValidationFailed {
    errors<Array<string>>: [];
    failureReason<string>: "unknown";
}

state ProcessingComplete {
    duration<number>: 0;
    status<string>: "success";
}

state ProcessingError {
    errorMessage<string>: "An error occurred";
    stackTrace<string>: "";
}

// ========== Clear Entry Point ==========

init start {
    startTime<number>: 0;
    initiator<string>: "system";
}

// ========== Inheritance Relationships ==========

// Valid inheritance: same node types
BaseDataProcessor <|-- DataFetcher;
BaseDataProcessor <|-- DataProcessor;
BaseValidator <|-- DataValidator;

// ========== Execution Flow (No Cycles, No Unreachable Nodes) ==========

// Entry point flows to data fetching
start -> DataFetcher;

// Fetched data is validated
DataFetcher -> DataValidator;

// Validation outcomes
DataValidator -> ValidationPassed;
DataValidator -> ValidationFailed;

// Passed validation proceeds to processing
ValidationPassed -> DataProcessor;

// Failed validation goes to error state
ValidationFailed -> ProcessingError;

// Processed data is persisted
DataProcessor -> DataPersister;

// Persistence outcomes
DataPersister -> ProcessingComplete;
DataPersister -> ProcessingError;

// ========== Dependencies ==========

// Inferred dependencies from template variables:
// - DataFetcher depends on apiConfig (via url template)
// - LoggingService depends on appSettings (via level template)

// These are automatically detected by the dependency analyzer

// ========== Notes on Validation ==========

note start "Entry point for the data processing pipeline. All validation checks pass."

note apiConfig "Configuration context - properly has no incoming edges"

note BaseDataProcessor "Abstract base class - properly marked with @Abstract annotation"

note DataFetcher "Async task properly marked with @Async annotation"

note ProcessingComplete "Exit point - has no outgoing edges (expected)"

// ========== Validation Summary ==========

// ✅ Type Checking:
//    - All type annotations match their values
//    - Generic types are properly formatted
//    - Template references are valid

// ✅ Graph Structure:
//    - Clear entry point: start (init node)
//    - Clear exit points: ProcessingComplete, ProcessingError
//    - No unreachable nodes
//    - No orphaned nodes
//    - Intentional cycle-free design

// ✅ Semantic Validation:
//    - Init node (start) has outgoing edges
//    - Context nodes (apiConfig, appSettings) have no incoming edges
//    - @Async annotations only on task nodes
//    - @Abstract annotations on base classes (tasks)
//    - @Singleton annotations on services and contexts
//    - Inheritance relationships between same node types

// ✅ All Phase 4 validations pass successfully!

```

### `type-checking.dy`

Phase 4: Type Checking Examples

```dy examples/validation/type-checking.dygram
machine "Phase 4: Type Checking Examples"

// ========== Valid Type Checking ==========

task validTypes {
    // Primitive types
    name<string>: "DyGram";
    count<number>: 42;
    enabled<boolean>: true;

    // Generic types
    response<Promise<Response>>: "pending";
    users<Array<User>>: [];
    cache<Map<string, any>>: [];

    // Nested generics
    asyncData<Promise<Array<Record>>>: "loading";

    // Optional types
    optionalValue<string?>: null;
}

// ========== Type Inference ==========

task typeInference {
    // Types inferred automatically
    inferredString: "Hello";        // Inferred as string
    inferredNumber: 123;            // Inferred as number
    inferredBoolean: false;         // Inferred as boolean
    inferredArray: ["a", "b", "c"]; // Inferred as Array<string>
}

// ========== Type Compatibility ==========

context apiConfig {
    baseUrl<string>: "https://api.example.com";
    timeout<number>: 5000;
    retries<number>: 3;
}

task apiCall {
    // Valid template references with compatible types
    url<string>: "{{ apiConfig.baseUrl }}";
    maxRetries<number>: 5;
}

// ========== Complex Generic Types ==========

task dataProcessing {
    // Map with complex value type
    userCache<Map<string, User>>: [];

    // Promise with nested generics
    fetchUsers<Promise<Array<User>>>: "pending";

    // Multiple generic parameters
    transformer<Function<Input, Output>>: null;
}

// ========== Edge Cases ==========

task edgeCases {
    // Empty arrays (type: Array<any>)
    emptyArray<Array<any>>: [];

    // Any type (accepts anything)
    flexible<any>: "can be anything";
}

```

### `graph-validation.dy`

Phase 4: Graph Validation Examples

```dy examples/validation/graph-validation.dygram
machine "Phase 4: Graph Validation Examples"

// ========== Valid Graph Structure ==========

// Clear entry point
init start {
    desc: "Entry point for execution";
}

// Connected execution flow
task fetchData {
    desc: "Fetch data from API";
}

task processData {
    desc: "Process the fetched data";
}

task saveData {
    desc: "Save processed data";
}

// Clear exit points
state Success {
    desc: "Successful completion";
}

state Error {
    desc: "Error occurred";
}

// Valid flow: start -> fetch -> process -> save -> success/error
start -> fetchData;
fetchData -> processData;
processData -> saveData;
saveData -> Success;
saveData -> Error;

// ========== Demonstrating Cycle Detection ==========

task retryLoop {
    desc: "Task with retry mechanism";
}

task checkStatus {
    desc: "Check if retry is needed";
}

// This creates a cycle (intentional for retry logic)
retryLoop -> checkStatus;
checkStatus -> retryLoop;  // Cycle: retryLoop -> checkStatus -> retryLoop
// Note: Cycles are detected but may be intentional for retry logic

// ========== Configuration Context ==========

context config {
    // Context nodes are excluded from reachability checks
    maxRetries<number>: 3;
    timeout<number>: 5000;
}

```

### `semantic-validation.dy`

Phase 4: Semantic Validation Examples

```dy examples/validation/semantic-validation.dygram
machine "Phase 4: Semantic Validation Examples"

// ========== Valid Node Type Usage ==========

// Init nodes: Entry points with outgoing edges
init start {
    desc: "Proper init node with transitions";
}

// Task nodes: Active operations
task processData @Async {
    desc: "Asynchronous data processing";
    timeout<number>: 5000;
}

task transformData {
    desc: "Transform data synchronously";
}

// State nodes: Passive conditions/outcomes
state DataReady {
    desc: "Data is ready for next step";
}

state Complete {
    desc: "Process completed successfully";
}

// Context nodes: Configuration (no execution edges)
context appConfig @Singleton {
    apiUrl<string>: "https://api.example.com";
    debug<boolean>: false;
}

// ========== Valid Annotation Usage ==========

// @Abstract on base tasks
task BaseProcessor @Abstract {
    desc: "Base processor class";
    version<string>: "1.0";
}

// @Singleton on services and contexts
task DatabaseService @Singleton {
    desc: "Database connection service";
}

context serviceConfig @Singleton {
    connectionString<string>: "localhost:5432";
}

// @Async on tasks that perform async operations
task fetchFromAPI @Async {
    desc: "Fetches data from external API";
    endpoint<string>: "{{ appConfig.apiUrl }}";
}

// @Critical on important nodes
task validatePayment @Critical {
    desc: "Critical payment validation step";
}

// @Deprecated with migration message
task oldProcessor @Deprecated("Use transformData instead") {
    desc: "Legacy processor - do not use";
}

// ========== Valid Inheritance Relationships ==========

// Inheritance between same node types
task SpecificProcessor {
    desc: "Concrete implementation";
}

BaseProcessor <|-- SpecificProcessor;  // ✅ Valid: Both are tasks

// ========== Valid Execution Flow ==========

// Init node with outgoing edges
start -> processData;

// Task execution flow
processData -> DataReady;
DataReady -> transformData;
transformData -> Complete;

// Template variable usage (creates inferred dependencies)
task useConfig {
    apiCall<string>: "Call {{ appConfig.apiUrl }}";
    debugMode<boolean>: false;
}

```
