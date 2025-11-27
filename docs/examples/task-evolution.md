# Task Evolution: From LLM to Generated Code

DyGram supports **task evolution** - automatically transitioning tasks from LLM-based execution to generated code as patterns emerge. This optimizes performance, reduces costs, and maintains reasoning capabilities where needed.

## Table of Contents

- [Evolution Stages](#evolution-stages)
- [How Evolution Works](#how-evolution-works)
- [Triggering Evolution](#triggering-evolution)
- [Evolution Thresholds](#evolution-thresholds)
- [Performance Tracking](#performance-tracking)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Evolution Stages

Tasks progress through four evolution stages:

### 1. llm_only (Initial Stage)

Pure LLM execution - the agent reasons about and executes the task.

```dygram examples/task-evolution/llm-only-stage.dy
machine "LLM-Only Task"

Task classify "Classify sentiment" {
  prompt: "Classify the sentiment of this text as positive, negative, or neutral. Provide confidence score."
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"
}

start -> classify -> end
```

**Characteristics:**
- Maximum flexibility and reasoning
- Handles novel inputs well
- Highest cost per execution
- Variable execution time

**Best for:**
- New, undefined tasks
- Tasks requiring complex reasoning
- Low-frequency operations
- Rapid prototyping

### 2. hybrid (Learning Stage)

Generated code handles common patterns, LLM handles edge cases.

```dygram examples/task-evolution/hybrid-stage.dy
machine "Hybrid Task"

Task classify "Sentiment classifier" {
  prompt: "Classify sentiment"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "hybrid"
  code_path: "./generated/classify.ts"
  confidence_threshold: 0.8
}

start -> classify -> end
```

**Characteristics:**
- Fast for common cases (generated code)
- Maintains quality for edge cases (LLM fallback)
- Moderate cost
- Predictable for learned patterns

**Best for:**
- Tasks with emerging patterns
- Balance of speed and flexibility
- Medium-frequency operations

### 3. code_first (Optimization Stage)

Generated code runs first, LLM only if confidence is low.

```dygram examples/task-evolution/code-first-stage.dy
machine "Code-First Task"

Task classify "Fast classifier" {
  prompt: "Classify sentiment"
  evolution_stage: "code_first"
  code_path: "./generated/classify.ts"
  llm_threshold: 0.7
}

start -> classify -> end
```

**Characteristics:**
- Generated code is primary execution path
- LLM as safety net for low confidence
- Low cost (mostly code execution)
- Fast with quality assurance

**Best for:**
- Well-understood tasks
- High-frequency operations
- Performance-critical paths

### 4. code_only (Mature Stage)

Pure generated code execution - no LLM involvement.

```dygram examples/task-evolution/code-only-stage.dy
machine "Code-Only Task"

Task classify "Production classifier" {
  prompt: "Classify sentiment"
  evolution_stage: "code_only"
  code_path: "./generated/classify.ts"
}

start -> classify -> end
```

**Characteristics:**
- Maximum performance
- Minimal cost
- Deterministic behavior
- No LLM dependency

**Best for:**
- Fully understood, stable tasks
- Very high-frequency operations
- Production systems
- Regulated environments requiring determinism

## How Evolution Works

Evolution is triggered automatically based on performance metrics and execution patterns.

### Automatic Evolution

```dygram examples/task-evolution/automatic-evolution.dy
machine "Auto-Evolving System"

Task processData "Data processor" {
  prompt: "Process and validate the data"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"
  execution_count: 0
}

// After 100 executions with >90% success rate,
// task automatically evolves to 'hybrid' stage

start -> processData -> end
```

### Manual Evolution Control

```dygram examples/task-evolution/manual-evolution.dy
machine "Controlled Evolution"

Context EvolutionControl {
  readyToEvolve: false
  metrics: {}
}

Task monitor "Monitor task performance" {
  prompt: "Track execution metrics. Set EvolutionControl.readyToEvolve to true if success rate is greater than 95% over 50 executions."
}

Task evolveIfReady "Evolve the task" {
  prompt: "If EvolutionControl.readyToEvolve is true, trigger evolution of the target task to next stage."
  model: "claude-3-5-sonnet-20241022"
}

monitor -> evolveIfReady
```

## Triggering Evolution

### Implicit Triggers

Evolution occurs automatically when thresholds are met:

- **Execution Count:** 100+ executions
- **Success Rate:** greater than 90%
- **Pattern Stability:** Consistent output formats

```dygram examples/task-evolution/implicit-trigger.dy
machine "Threshold-Based Evolution"

Task analyze "Data analyzer" {
  prompt: "Analyze data and identify patterns"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"
  execution_count: 0
  success_count: 0
}

// System tracks:
// - execution_count (incremented each run)
// - success_count (successful executions)
// - success_rate (success_count / execution_count)
//
// When execution_count >= 100 AND success_rate >= 0.9,
// automatically evolve to 'hybrid'

start -> analyze -> end
```

### Explicit Triggers

Use the `EvolutionaryExecutor` API to manually trigger evolution:

```dygram examples/task-evolution/explicit-trigger.dy
machine "Manual Evolution Trigger"

Task checkMetrics "Review task metrics" {
  prompt: "Check if task 'classifier' is ready for evolution based on performance data."
}

Task triggerEvolution "Force evolution" {
  prompt: "Call triggerEvolution('classifier') to advance to next stage."
  model: "claude-3-5-sonnet-20241022"
}

checkMetrics -> triggerEvolution
```

## Evolution Thresholds

### Default Thresholds

```typescript
EXECUTION_THRESHOLD = 100       // Minimum executions before evolution
SUCCESS_RATE_THRESHOLD = 0.90   // 90% success rate required
HYBRID_CONFIDENCE = 0.8         // Threshold for hybrid stage
CODE_FIRST_CONFIDENCE = 0.7     // Threshold for code_first stage
```

### Custom Thresholds

Override defaults per task:

```dygram examples/task-evolution/custom-thresholds.dy
machine "Custom Evolution Thresholds"

Task criticalTask "High-stakes operation" {
  prompt: "Process critical data"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"

  // Custom thresholds for this task
  min_executions: 200           // More executions before evolution
  success_rate_threshold: 0.95  // Higher success rate required
  hybrid_confidence: 0.9        // Higher confidence for hybrid
}

Task standardTask "Standard operation" {
  prompt: "Process standard data"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"

  // Uses default thresholds
}

start -> criticalTask -> standardTask -> end
```

## Performance Tracking

Evolution decisions are based on performance metrics:

```dygram examples/task-evolution/performance-tracking.dy
machine "Performance-Tracked System"

Context TaskMetrics {
  execution_count: 0
  success_count: 0
  failure_count: 0
  avg_execution_time: 0
  total_cost: 0.0
}

Task trackedOperation "Monitored task" {
  prompt: "Process data and track performance"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"
}

Task reportMetrics "Report on performance" {
  prompt: "Display TaskMetrics showing execution count, success rate, average time, and total cost. Recommend evolution stage based on metrics."
}

trackedOperation -> reportMetrics
```

### Metrics Tracked

For each task, the system tracks:

- **execution_count**: Total number of executions
- **success_count**: Successful completions
- **failure_count**: Failed executions
- **success_rate**: success_count / execution_count
- **avg_execution_time_ms**: Average execution duration
- **cost_per_execution**: LLM cost per run
- **total_cost**: Cumulative cost
- **last_evolution**: Timestamp of last stage change

## Examples

### Complete Evolution Lifecycle

```dygram examples/task-evolution/complete-lifecycle.dy
machine "Evolution Lifecycle Demo"

Context Evolution {
  stage: "llm_only"
  executions: 0
  ready: false
}

Task dataProcessor "Evolving processor" {
  prompt: "Process and categorize the input data"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"
}

// Stage 1: llm_only (0-100 executions)
// - Pure LLM reasoning
// - Learning patterns
// - Building execution history

// Stage 2: hybrid (100-300 executions)
// - Generated code for common patterns
// - LLM for edge cases
// - Confidence-based routing

// Stage 3: code_first (300-500 executions)
// - Code executes first
// - LLM backup for low confidence
// - Optimized performance

// Stage 4: code_only (500+ executions)
// - Pure generated code
// - No LLM dependency
// - Maximum performance

start -> dataProcessor -> end
```

### Rollback on Failure

```dygram examples/task-evolution/rollback-on-failure.dy
machine "Evolution with Rollback"

Context HealthCheck {
  errorRate: 0.0
  lastStage: "llm_only"
}

Task advancedProcessor "Evolved processor" {
  prompt: "Process data"
  evolution_stage: "code_first"
  code_path: "./generated/processor.ts"
}

Task monitorHealth "Monitor error rate" {
  prompt: "Track HealthCheck.errorRate. If it exceeds 0.15, rollback to HealthCheck.lastStage."
}

Task rollbackIfNeeded "Conditional rollback" {
  prompt: "If error rate is too high, revert evolution stage and regenerate code."
  model: "claude-3-5-sonnet-20241022"
}

advancedProcessor -> monitorHealth -> rollbackIfNeeded
```

### Multi-Task Evolution

```dygram examples/task-evolution/multi-task-evolution.dy
machine "Multiple Evolving Tasks"

Task classifier "Sentiment classifier" {
  prompt: "Classify sentiment"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "hybrid"
  code_path: "./generated/classify.ts"
}

Task extractor "Entity extractor" {
  prompt: "Extract named entities"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"
}

Task aggregator "Result aggregator" {
  prompt: "Aggregate results"
  evolution_stage: "code_only"
  code_path: "./generated/aggregate.ts"
}

// Different tasks at different evolution stages
// Each evolves independently based on its metrics

start -> classifier -> extractor -> aggregator -> end
```

## Best Practices

### 1. Start with llm_only

Always begin new tasks at the `llm_only` stage.

```dygram examples/task-evolution/start-llm-only.dy
machine "Proper Evolution Start"

Task newTask "Undefined new task" {
  prompt: "Handle novel situation"
  model: "claude-3-5-sonnet-20241022"
  evolution_stage: "llm_only"  // Always start here
}

start -> newTask -> end
```

### 2. Monitor Metrics

Track performance before allowing evolution.

```dygram examples/task-evolution/monitor-before-evolve.dy
machine "Monitored Evolution"

Context Metrics {
  ready: false
  executions: 0
  success_rate: 0.0
}

Task operation "Monitored operation" {
  prompt: "Process data and update Metrics"
}

Task checkReadiness "Verify evolution readiness" {
  prompt: "Only allow evolution if Metrics.executions is greater than 100 AND Metrics.success_rate is greater than 0.90"
  model: "claude-3-5-sonnet-20241022"
}

operation -> checkReadiness
```

### 3. Validate Generated Code

Test generated code thoroughly before code_only stage.

```dygram examples/task-evolution/validate-generated-code.dy
machine "Code Validation"

Task validateCode "Test generated code" {
  prompt: "Run test suite against generated code. Verify: correctness, performance, edge case handling. Report results."
  model: "claude-3-5-sonnet-20241022"
}

Task promoteIfValid "Promote to code_only if tests pass" {
  prompt: "If all tests pass, advance task to code_only stage."
}

validateCode -> promoteIfValid
```

### 4. Maintain Rollback Capability

Always keep previous stage code for rollback.

```dygram examples/task-evolution/maintain-rollback.dy
machine "Rollback-Ready System"

Context VersionControl {
  currentStage: "hybrid"
  previousStage: "llm_only"
  previousCodePath: "./generated/old_version.ts"
}

Task checkPerformance "Monitor new stage performance" {
  prompt: "Compare current stage performance to previous stage baseline."
}

Task rollbackIfWorse "Rollback if performance degrades" {
  prompt: "If current performance is worse than baseline, rollback to VersionControl.previousStage and restore code from VersionControl.previousCodePath."
  model: "claude-3-5-sonnet-20241022"
}

checkPerformance -> rollbackIfWorse
```

### 5. Document Evolution Decisions

Record why and when evolution occurs.

```dygram examples/task-evolution/document-evolution.dy
machine "Documented Evolution"

Context EvolutionLog {
  history: []
}

Task evolve "Advance evolution stage" {
  prompt: "Before evolving, record in EvolutionLog.history: timestamp, from_stage, to_stage, reason (execution count, success rate, metrics), and confidence level."
  model: "claude-3-5-sonnet-20241022"
}

start -> evolve -> end
```

## Summary

Task evolution in DyGram:

1. **Automatic optimization** - Tasks evolve from LLM to code as patterns emerge
2. **Four stages** - `llm_only` → `hybrid` → `code_first` → `code_only`
3. **Metric-driven** - Evolution based on execution count, success rate, and confidence
4. **Flexible** - Manual control or automatic triggers
5. **Reversible** - Rollback capability for quality assurance

**Evolution Path:**
- Start: Maximum flexibility (LLM reasoning)
- Middle: Balanced performance (hybrid execution)
- End: Maximum efficiency (generated code)

Use evolution to optimize high-frequency tasks while maintaining reasoning capability for edge cases and novel inputs.
