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

start -"success"-> success
start -"retry"-> retry
start -"failure"-> failure
retry -"retry success"-> success
retry -"retry failure"-> failure
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
evaluation -when: "Data.priority == 'high'"-> highPriority
evaluation -when: "Data.priority == 'normal'"-> normalPriority
evaluation -when: "Data.priority == 'low'"-> lowPriority
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

## Edge Cases and Transition Bugs

### Tool Disambiguation

Tests handling of multiple tools with similar purposes.

```dygram examples/testing/tool-execution/tool-disambiguation.dy
machine "Tool Disambiguation Machine" {
  logLevel: "debug"
  maxSteps: 15
}

start "Choose the correct processing method" {
  prompt: "Select the most appropriate processing tool for this data type"
}

state method_a "Processing Method A - Fast"
state method_b "Processing Method B - Accurate"
state method_c "Processing Method C - Balanced"
end "Processing selected"

start -"fast processing"-> method_a
start -"accurate processing"-> method_b
start -"balanced processing"-> method_c
method_a -> end
method_b -> end
method_c -> end
```

**Expected Behavior:**
- Should distinguish between similar transition options
- Should make intelligent selection based on prompt context
- Should handle semantic tool selection
- Should not confuse similar tool names
- Should provide clear reasoning for choice

### Transition Conflicts

Tests handling when multiple transitions could apply simultaneously.

```dygram examples/testing/tool-execution/transition-conflicts.dy
machine "Transition Conflict Machine" {
  logLevel: "debug"
  maxSteps: 15
}

context Conditions {
  criteriaA: true
  criteriaB: true
  priority: "A"
}

start "Evaluate conflicting conditions" {
  prompt: "Choose path when multiple conditions are met"
}

state pathA "Path A (Criteria A met)"
state pathB "Path B (Criteria B met)"
state pathDefault "Default path"
end "Conflict resolved"

start -when: "Conditions.criteriaA == true"-> pathA
start -when: "Conditions.criteriaB == true"-> pathB
start -when: "true"-> pathDefault
pathA -> end
pathB -> end
pathDefault -> end
```

**Expected Behavior:**
- Should resolve transition conflicts deterministically
- Should apply priority or precedence rules
- Should document which condition was evaluated first
- Should handle overlapping conditions gracefully
- Should maintain consistent behavior across runs

### Diamond Pattern Navigation

Tests execution through diamond-shaped graph structures.

```dygram examples/testing/tool-execution/diamond-pattern.dy
machine "Diamond Pattern Machine" {
  logLevel: "debug"
  maxSteps: 20
}

start "Fork decision point" {
  prompt: "Choose initial branch in diamond pattern"
}

state leftBranch "Left processing branch"
state rightBranch "Right processing branch"

task convergence "Merge point" {
  prompt: "Combine results from branches"
}

end "Diamond complete"

start -"left"-> leftBranch
start -"right"-> rightBranch
leftBranch -> convergence
rightBranch -> convergence
convergence -> end
```

**Expected Behavior:**
- Should navigate through diamond pattern correctly
- Should handle multiple paths to same node
- Should reach convergence point from either branch
- Should not duplicate processing at merge
- Should track complete execution path

### Self-Referential Transitions

Tests nodes with transitions back to themselves.

```dygram examples/testing/tool-execution/self-referential.dy
machine "Self-Referential Machine" {
  logLevel: "debug"
  maxSteps: 15
}

context LoopState {
  iterations: 0
  maxIterations: 3
}

start "Processing loop" {
  prompt: "Process iteration and decide whether to continue"
}

end "Loop complete"

start -> start @option("continue_loop")
start -> end @option("exit_loop")
```

**Expected Behavior:**
- Should handle self-referential transitions
- Should prevent infinite loops via maxSteps
- Should track iteration count
- Should provide exit path from loop
- Should detect cycles appropriately

### No-Op Transitions

Tests transitions that don't change effective state.

```dygram examples/testing/tool-execution/noop-transitions.dy
machine "No-Op Transition Machine" {
  logLevel: "debug"
  maxSteps: 10
}

state stateA "State A"
state stateB "State B (functionally same as A)"
state stateC "State C (distinct)"
end "No-op complete"

stateA -> stateB @option("move_to_identical")
stateA -> stateC @option("move_to_different")
stateB -> stateC
stateC -> end
```

**Expected Behavior:**
- Should handle semantically null transitions
- Should track transition even if state similar
- Should distinguish between identical and different states
- Should maintain history accuracy
- Should not optimize away no-op transitions

### Orphaned Tool Detection

Tests detection of tools that cannot be reached.

```dygram examples/testing/tool-execution/orphaned-tools.dy
machine "Orphaned Tool Machine" {
  logLevel: "debug"
  maxSteps: 10
}

start "Reachable start" {
  prompt: "Execute from start"
}

state reachable "Reachable state"

task orphaned "Orphaned task" {
  prompt: "This task cannot be reached"
}

end "Execution end"

start -> reachable
reachable -> end
```

**Expected Behavior:**
- Should detect unreachable nodes at validation
- Should warn about orphaned tool definitions
- Should execute reachable path successfully
- Should not crash due to unreachable nodes
- Should provide graph connectivity analysis

### Transition Tool Name Collisions

Tests handling when tool names might conflict with built-ins.

```dygram examples/testing/tool-execution/name-collisions.dy
machine "Name Collision Machine" {
  logLevel: "debug"
  maxSteps: 10
}

start "Choose transition carefully" {
  prompt: "Select the correct custom transition"
}

state customEnd "Custom end-like state (not actual end)"
state actualTarget "Actual target state"
end "Real end node"

start -> customEnd @option("goto_custom_end")
start -> actualTarget @option("goto_actual")
customEnd -> end
actualTarget -> end
```

**Expected Behavior:**
- Should distinguish custom names from reserved words
- Should not confuse similar naming patterns
- Should maintain name scoping correctly
- Should handle potential collisions gracefully
- Should validate tool names at initialization

### Bi-Directional Transitions

Tests handling of potential back-and-forth transitions.

```dygram examples/testing/tool-execution/bidirectional.dy
machine "Bidirectional Machine" {
  logLevel: "debug"
  maxSteps: 20
}

context NavigationState {
  forwardCount: 0
  backwardCount: 0
  maxBounces: 3
}

task nodeA "Node A" {
  prompt: "Decide whether to move forward or backward"
}

task nodeB "Node B" {
  prompt: "Decide whether to continue or return"
}

end "Navigation complete"

nodeA -"move to B"-> nodeB
nodeB -"return to A"-> nodeA
nodeB -"complete"-> end
```

**Expected Behavior:**
- Should handle bidirectional navigation
- Should prevent infinite ping-pong
- Should enforce bounce limits
- Should eventually reach completion
- Should track navigation history accurately

### Transition Priority Resolution

Tests evaluation order when multiple transition conditions exist.

```dygram examples/testing/tool-execution/transition-priority.dy
machine "Transition Priority Machine" {
  logLevel: "debug"
  maxSteps: 15
}

context Priority {
  urgency: "high"
  cost: "low"
  quality: "standard"
}

start "Multi-criteria routing" {
  prompt: "Route based on multiple priority criteria"
}

state urgent "Urgent path (high urgency)"
state economical "Economical path (low cost)"
state quality "Quality path (standard quality)"
end "Routing complete"

start -when: "Priority.urgency == 'high'"-> urgent
start -when: "Priority.cost == 'low'"-> economical
start -when: "Priority.quality == 'standard'"-> quality
urgent -> end
economical -> end
quality -> end
```

**Expected Behavior:**
- Should evaluate transitions in priority order
- Should select highest priority matching condition
- Should handle multiple valid conditions
- Should respect priority metadata
- Should provide deterministic routing

## Usage

To run these tests:

```bash
# Interactive mode (requires agent)
npm test test/validating/tool-execution.test.ts

# Playback mode (uses recordings)
DYGRAM_TEST_MODE=playback npm test test/validating/tool-execution.test.ts
