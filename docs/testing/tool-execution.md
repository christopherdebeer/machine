# Tool Execution Test Cases

This document contains comprehensive test scenarios for tool-based execution features in DyGram. These examples are automatically extracted to create test cases that validate transition tools and intelligent path selection.

## Table of Contents

- [Basic Transition Tools](#basic-transition-tools)
- [Multiple Transition Options](#multiple-transition-options)
- [Complex Routing Scenarios](#complex-routing-scenarios)
- [Error Handling](#error-handling)
- [State Transitions](#state-transitions)

## Basic Transition Tools

### Simple Router Machine

Tests basic transition from start node to another node with tool-based decision making.

```dygram examples/testing/tool-execution/simple-router.dy
machine "Test Router Machine" {
  logLevel: "debug"
  maxSteps: 10
}

start "Classify this input and choose appropriate path" {
  prompt: "Classify this input and choose appropriate path"
}

state pathA "Path A selected"
state pathB "Path B selected"
end "Execution complete"

start -> pathA @option("option_a")
start -> pathB @option("option_b")
pathA -> end
pathB -> end
```

**Expected Behavior:**
- Should transition from start node to either pathA or pathB
- Should reach end state
- Should have at least 2 nodes in visit history
- Current node should not be 'start' after first step

## Multiple Transition Options

### Multi-Path Decision Machine

Tests handling of multiple transition options with intelligent path selection.

```dygram examples/testing/tool-execution/multi-path-decision.dy
machine "Multi-Path Router" {
  logLevel: "debug"
  maxSteps: 15
}

start "Initial routing decision" {
  prompt: "Analyze input and select the most appropriate processing path"
}

state fastPath "Fast processing path"
state standardPath "Standard processing path"
state detailedPath "Detailed analysis path"
end "Processing complete"

start -> fastPath @option("fast")
start -> standardPath @option("standard")  
start -> detailedPath @option("detailed")
fastPath -> end
standardPath -> end
detailedPath -> end
```

**Expected Behavior:**
- Should choose one of three available paths
- Should complete execution at end node
- Should have valid transition history
- Should demonstrate intelligent path selection

## Complex Routing Scenarios

### Multi-Stage Decision Machine

Tests machine with multiple decision points and complex routing logic.

```dygram examples/testing/tool-execution/multi-stage-router.dy
machine "Complex Router" {
  logLevel: "debug"
  maxSteps: 20
}

start "Initial routing decision" {
  prompt: "Make initial routing decision based on input analysis"
}

task checkpoint1 "Second routing decision" {
  prompt: "Evaluate intermediate results and choose next step"
}

state success "Success path"
state alternate "Alternate path"
end "Final state"

// Multiple decision points
start -> checkpoint1
start -> alternate @option("direct_alternate")
checkpoint1 -> success @option("proceed_success")
checkpoint1 -> alternate @option("fallback_alternate")
success -> end
alternate -> end
```

**Expected Behavior:**
- Should handle multiple decision points
- Should complete at end node
- Should have at least 2 decision steps in history
- Should demonstrate complex routing logic

### Parallel Processing Router

Tests concurrent path execution with tool-based coordination.

```dygram examples/testing/tool-execution/parallel-router.dy
machine "Parallel Processing Router" {
  logLevel: "debug"
  maxSteps: 25
  maxConcurrentPaths: 3
}

init dataProcessor "Process data stream" {
  prompt: "Begin data processing workflow"
}

init healthMonitor "Monitor system health" {
  prompt: "Start health monitoring"
}

task coordinator "Coordinate results" {
  prompt: "Coordinate results from parallel processes"
}

state dataComplete "Data processing complete"
state healthComplete "Health monitoring complete"
state synchronized "All processes synchronized"
end "System ready"

// Parallel flows
dataProcessor -> dataComplete
healthMonitor -> healthComplete

// Synchronization point
dataComplete -> coordinator
healthComplete -> coordinator
coordinator -> synchronized
synchronized -> end
```

**Expected Behavior:**
- Should handle parallel execution paths
- Should coordinate multiple concurrent processes
- Should reach synchronized state before completion
- Should demonstrate parallel workflow management

## Error Handling

### Isolated Machine Test

Tests graceful handling of machines with no available transitions.

```dygram examples/testing/tool-execution/isolated-machine.dy
machine "Isolated Machine" {
  logLevel: "debug"
  maxSteps: 5
}

start "Process isolated task" {
  prompt: "Process this task with no outgoing transitions"
}
```

**Expected Behavior:**
- Should not throw errors
- Should remain at start node (no transitions available)
- Should handle isolation gracefully
- Should complete step execution without failure

### Error Recovery Machine

Tests error handling and recovery mechanisms.

```dygram examples/testing/tool-execution/error-recovery.dy
machine "Error Recovery Machine" {
  logLevel: "debug"
  maxSteps: 15
}

start "Risky operation" {
  prompt: "Attempt operation that might fail"
}

state retry "Retry operation" {
  prompt: "Retry the failed operation"
}

state success "Operation succeeded"
state failure "Operation failed permanently"
end "Process complete"

start -> success @option("success")
start -> retry @option("retry")
start -> failure @option("failure")
retry -> success @option("retry_success")
retry -> failure @option("retry_failure")
success -> end
failure -> end
```

**Expected Behavior:**
- Should handle error conditions appropriately
- Should support retry mechanisms
- Should reach either success or failure state
- Should demonstrate error recovery patterns

## State Transitions

### State Tracking Machine

Tests comprehensive state transition tracking and history management.

```dygram examples/testing/tool-execution/state-tracking.dy
machine "State Tracking Machine" {
  logLevel: "debug"
  maxSteps: 20
}

context ProcessState {
  currentStep: 0
  processedItems: []
  status: "initializing"
}

start "Initialize process" {
  prompt: "Initialize the state tracking process"
}

task step1 "Process step 1" {
  prompt: "Execute first processing step"
}

task step2 "Process step 2" {
  prompt: "Execute second processing step"
}

state validation "Validate results" {
  prompt: "Validate processing results"
}

end "Process validated"

start -> step1
step1 -> step2
step2 -> validation
validation -> end
```

**Expected Behavior:**
- Should track state transitions accurately
- Should maintain context state throughout execution
- Should visit nodes sequentially
- Should have complete transition history
- Should demonstrate state management capabilities

### Conditional Routing Machine

Tests conditional transitions based on context and state.

```dygram examples/testing/tool-execution/conditional-routing.dy
machine "Conditional Router" {
  logLevel: "debug"
  maxSteps: 25
}

context Data {
  itemCount: 0
  priority: "normal"
}

start "Analyze input data" {
  prompt: "Analyze the input data and set context values"
}

task evaluation "Evaluate conditions" {
  prompt: "Evaluate data conditions for routing decision"
}

state highPriority "High priority processing"
state normalPriority "Normal priority processing"
state lowPriority "Low priority processing"
end "Processing complete"

start -> evaluation
evaluation -> highPriority @condition("Data.priority == 'high'")
evaluation -> normalPriority @condition("Data.priority == 'normal'")
evaluation -> lowPriority @condition("Data.priority == 'low'")
highPriority -> end
normalPriority -> end
lowPriority -> end
```

**Expected Behavior:**
- Should evaluate conditions correctly
- Should route based on context values
- Should demonstrate conditional logic
- Should maintain context consistency
- Should complete at appropriate priority path

## Test Execution Notes

These test cases are designed to work with both interactive and playback test modes:

- **Interactive Mode**: Requires live agent for decision making
- **Playback Mode**: Uses pre-recorded responses for deterministic testing

Each test case includes expected behavior specifications that should be validated by the test runner. The examples demonstrate various aspects of tool-based execution including:

- Basic transition mechanics
- Multi-path decision making
- Complex routing scenarios
- Error handling and recovery
- State management and tracking
- Conditional logic evaluation

## Usage

To run these tests:

```bash
# Interactive mode (requires agent)
npm test test/validating/tool-execution.test.ts

# Playback mode (uses recordings)
DYGRAM_TEST_MODE=playback npm test test/validating/tool-execution.test.ts
