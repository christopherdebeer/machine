# Runtime Execution Examples

This document demonstrates the execution model features available in DyGram. All examples can be tested in the CodeMirror playground with execution logging enabled.

## Table of Contents

- [Multiple Start Nodes](#multiple-start-nodes)
- [Edge Semantics](#edge-semantics)
- [Node Annotations](#node-annotations)
- [Error Handling Strategies](#error-handling-strategies)
- [Circuit Breaker and Safety](#circuit-breaker-and-safety)
- [Synchronization and Barriers](#synchronization-and-barriers)
- [State Management](#state-management)
- [Execution Logging](#execution-logging)

## Multiple Start Nodes

DyGram supports multiple start nodes for concurrent execution workflows. Start nodes can be designated using the `init` type or by naming convention.

### Example: Parallel Data Pipeline

```dygram
machine "Parallel Pipeline" {
  logLevel: "debug"
  maxSteps: 100
}

// Multiple start nodes - both execute concurrently
init DataIngestion "Ingest data from source"
init HealthMonitor "Monitor system health"

state ProcessData "Process ingested data"
state StoreResults "Store processed results"
state AlertOnIssue "Alert if health issue detected"

// Main data flow
DataIngestion -> ProcessData -> StoreResults

// Health monitoring flow
HealthMonitor -> AlertOnIssue
```

Start nodes are detected using these strategies (in order):
1. Nodes with explicit `init` type
2. Nodes named "start" (case-insensitive, supports patterns like "start_process")
3. Nodes with no incoming edges
4. Fallback to first node in definition

## Edge Semantics

DyGram supports semantic edge types with different arrow syntaxes:

- `->` : Control flow edge (standard transition)
- `-->` : Data flow edge (represents data passing)
- `=>` : Transform edge (represents transformation)

### Example: Data Transformation Flow

```dygram
machine "Data Transform" {
  logLevel: "info"
}

context DataStore {
  rawData: []
  processedData: []
}

state Fetch "Fetch raw data"
state Transform "Transform data"
state Save "Save processed data"

// Control flow: sequence of operations
Fetch -> Transform -> Save

// Data flow: reads from context
DataStore --> Transform

// Transform: writes to context
Transform => DataStore
```

## Node Annotations

Annotations provide declarative control over node execution behavior.

### Retry Annotation

The `@retry(N)` annotation automatically retries a node on failure.

```dygram
machine "Retry Example" {
  logLevel: "debug"
}

state FetchAPI "Call external API" @retry(3)
state ProcessResponse "Process API response"
state HandleError "Handle API error"

FetchAPI -> ProcessResponse
FetchAPI -when: "error";-> HandleError
```

### Timeout Annotation

The `@timeout(milliseconds)` annotation limits node execution time.

```dygram
machine "Timeout Example" {
  logLevel: "debug"
}

state LongRunningTask "Long operation" @timeout(5000)
state Success "Task completed"
state Timeout "Task timed out"

LongRunningTask -> Success
LongRunningTask -when: "timeout";-> Timeout
```

### Checkpoint Annotation

The `@checkpoint` annotation marks a node as a checkpoint for state capture.

```dygram
machine "Checkpoint Example" {
  logLevel: "info"
}

state Initialize "Initialize system"
state ImportantState "Critical point" @checkpoint
state ProcessMore "Continue processing"

Initialize -> ImportantState -> ProcessMore
```

### Execution Mode Annotations

Control execution strategy with `@eager` and `@lazy` annotations.

```dygram
machine "Execution Modes" {
  logLevel: "debug"
}

state EagerTask "Execute immediately" @eager
state LazyTask "Execute on demand" @lazy
state FinalTask "Final step"

EagerTask -> LazyTask -> FinalTask
```

## Error Handling Strategies

Machine-level annotations control error handling behavior across all execution paths.

### Fail-Fast Strategy

The `@errorHandling("fail-fast")` annotation stops all paths on any failure.

```dygram
machine "Fail Fast" @errorHandling("fail-fast") {
  logLevel: "debug"
}

init Path1 "First workflow"
init Path2 "Second workflow"

state Task1A "Task 1A"
state Task1B "Task 1B"
state Task2A "Task 2A"
state Task2B "Task 2B"

// If Task1A fails, Task2A and Task2B are also stopped
Path1 -> Task1A -> Task1B
Path2 -> Task2A -> Task2B
```

### Continue Strategy

The `@errorHandling("continue")` annotation isolates path failures.

```dygram
machine "Continue On Error" @errorHandling("continue") {
  logLevel: "debug"
}

init Process1 "Process type A"
init Process2 "Process type B"

state TaskA "Task A"
state TaskB "Task B"

// If TaskA fails, Process2 continues independently
Process1 -> TaskA
Process2 -> TaskB
```

### Compensate Strategy

The `@errorHandling("compensate")` annotation triggers rollback on failure.

```dygram
machine "Compensating Transactions" @errorHandling("compensate") {
  logLevel: "info"
}

state ReserveInventory "Reserve inventory"
state ChargePayment "Charge customer"
state ShipOrder "Ship order"
state ReleaseInventory "Release inventory" @compensate
state RefundPayment "Refund payment" @compensate

// If ShipOrder fails, RefundPayment and ReleaseInventory execute
ReserveInventory -> ChargePayment -> ShipOrder
```

## Circuit Breaker and Safety

The safety manager provides circuit breaker protection and resource limits.

### Example: Circuit Breaker Protection

```dygram
machine "Circuit Breaker Demo" {
  logLevel: "debug"
  circuitBreakerThreshold: 5
  circuitBreakerTimeout: 10000
  maxSteps: 100
}

state CallService "Call external service"
state ProcessResult "Process result"
state CircuitOpen "Circuit breaker open"

// After 5 consecutive failures, circuit opens for 10 seconds
CallService -> ProcessResult
CallService -when: "circuitOpen";-> CircuitOpen
```

### Example: Resource Limits

```dygram
machine "Resource Limits" @concurrent(4) {
  logLevel: "info"
  maxSteps: 1000
  maxConcurrentPaths: 4
}

init Worker1 "Worker 1"
init Worker2 "Worker 2"
init Worker3 "Worker 3"
init Worker4 "Worker 4"

state Process "Process item"
state Complete "Complete"

// Maximum 4 concurrent paths enforced by safety manager
Worker1 -> Process -> Complete
Worker2 -> Process -> Complete
Worker3 -> Process -> Complete
Worker4 -> Process -> Complete
```

## Synchronization and Barriers

Use barriers to coordinate multiple execution paths.

### Example: Barrier Synchronization

```dygram
machine "Barrier Example" {
  logLevel: "debug"
}

init FetchData "Fetch data"
init FetchConfig "Fetch config"

state WaitPoint "Wait for both"
state MergeAndContinue "Merge and continue"

// Both paths must reach WaitPoint before continuing
FetchData -@barrier("sync_point");-> WaitPoint
FetchConfig -@barrier("sync_point");-> WaitPoint
WaitPoint -> MergeAndContinue
```

### Example: Priority Edges

Control transition priority with `@priority(N)` annotation.

```dygram
machine "Priority Edges" {
  logLevel: "debug"
}

context Data {
  itemCount: 0
}

state CheckData "Check data"
state ProcessNormal "Normal processing"
state ProcessUrgent "Urgent processing"
state ProcessDefault "Default processing"

// Higher priority evaluated first
CheckData -@priority(1), when: "Data.itemCount > 100";-> ProcessUrgent
CheckData -@priority(2), when: "Data.itemCount > 0";-> ProcessNormal
CheckData -@priority(3);-> ProcessDefault
```

## State Management

Create and restore checkpoints during execution.

### Example: Checkpoint and Restore

```dygram
machine "Checkpoint Demo" {
  logLevel: "info"
  maxCheckpoints: 10
}

context State {
  step: 0
  data: []
}

state Step1 "Step 1" @checkpoint
state Step2 "Step 2" @checkpoint
state Step3 "Step 3" @checkpoint
state Step4 "Step 4"

// Checkpoints captured at each marked step
Step1 -> Step2 -> Step3 -> Step4
```

API Usage:
```typescript
// Create checkpoint programmatically
const checkpointId = executor.createCheckpoint("Before risky operation");

// Continue execution
await executor.step();

// Restore if needed
if (somethingWentWrong) {
  executor.restoreCheckpoint(checkpointId);
}
```

## Execution Logging

Control execution logging verbosity with the `logLevel` attribute.

### Log Levels

- `debug`: All execution details (transitions, conditions, context operations)
- `info`: Important state changes and transitions
- `warn`: Warnings and potential issues
- `error`: Errors only
- `none`: No logging

### Example: Detailed Execution Logging

```dygram
machine "Debug Logging" {
  logLevel: "debug"
}

context Counter {
  value: 0
}

state Increment "Increment counter"
state Check "Check value"
state Done "Done"

Increment -> Check
Check -when: "Counter.value < 10";-> Increment
Check -when: "Counter.value >= 10";-> Done
```

With `logLevel: "debug"`, the execution log shows:
- Node entry with attributes and type
- All outbound edges being evaluated
- Condition evaluation results (true/false)
- Context read and write operations
- Transition execution details
- State module boundaries
- Active state updates

### Programmatic Log Level Control

```typescript
// Set log level via executor API
executor.setLogLevel('debug');

// Get execution logs
const logs = executor.getLogs();
logs.forEach(log => {
  console.log(`[${log.timestamp}] ${log.level} [${log.category}] ${log.message}`);
});
```

## Testing in Playground

To test these examples in the CodeMirror playground:

1. Copy any example into the editor
2. Set the log level dropdown to "Debug" for detailed output
3. Click "Step" to execute one step at a time
4. Watch the visualization update with:
   - Active edges highlighted in green
   - Previously traversed edges in blue
   - Untraversed edges in gray dashed
   - Node visit counts and status indicators
   - Context values updated in real-time
5. View detailed execution logs in the "Execution Log" panel

## Best Practices

1. **Start Simple**: Begin with basic state machines before adding annotations
2. **Use Debug Logging**: Enable debug logging during development to understand execution flow
3. **Strategic Checkpoints**: Place checkpoints before risky or expensive operations
4. **Explicit Start Nodes**: Use `init` type for clarity in multi-start scenarios
5. **Error Handling**: Choose error handling strategy based on workflow requirements
6. **Resource Limits**: Set appropriate limits to prevent runaway execution
7. **Test Incrementally**: Test each feature independently before combining

## Additional Resources

- [Syntax Reference](../syntax/README.md) - Complete language syntax
- [Execution Model Design](../development/execution-model-redesign.md) - Architecture details
- [API Documentation](../api/README.md) - Programmatic executor API
