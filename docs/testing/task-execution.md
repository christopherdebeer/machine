# Task Execution Test Cases

This document contains comprehensive test scenarios for task node execution features in DyGram. These examples are automatically extracted to create test cases that validate task processing, attribute handling, and execution flow.

## Table of Contents

- [Basic Task Execution](#basic-task-execution)
- [Task Attributes and Templates](#task-attributes-and-templates)
- [Sequential Task Processing](#sequential-task-processing)
- [Task Error Handling](#task-error-handling)
- [Context Integration](#context-integration)

## Basic Task Execution

### Simple Task Machine

Tests basic task node execution with standard attributes.

```dygram examples/testing/task-execution/simple-task.dy
machine "Test Machine" {
  logLevel: "debug"
  maxSteps: 10
}

task start "Test Task" {
  title: "Test Task"
  desc: "A test task description"
  prompt: "Please process this test task"
}

task analysis "Analysis Task" {
  title: "Analysis Task"
  desc: "An analysis task"
  prompt: "Please analyze this data"
  taskType: "analysis"
}

end "Task complete"

start -> analysis -> end
```

**Expected Behavior:**
- Should execute basic task node successfully
- Should transition from start task to analysis task
- Should reach end state
- Should have task execution history
- Should handle standard task attributes

### Minimal Task Machine

Tests task execution with minimal attributes (graceful degradation).

```dygram examples/testing/task-execution/minimal-task.dy
machine "Minimal Machine" {
  logLevel: "debug"
  maxSteps: 5
}

task start "Minimal task with no explicit attributes"

end "Minimal complete"

start -> end
```

**Expected Behavior:**
- Should handle missing attributes gracefully
- Should execute task without errors
- Should transition from start to end
- Should demonstrate attribute tolerance

## Task Attributes and Templates

### Comprehensive Task Attributes

Tests task execution with comprehensive attribute sets.

```dygram examples/testing/task-execution/comprehensive-attributes.dy
machine "Comprehensive Task Machine" {
  logLevel: "debug"
  maxSteps: 15
}

task dataCollection "Data Collection Task" {
  title: "Data Collection"
  desc: "Collect and validate input data"
  prompt: "Collect data from the specified sources and validate completeness"
  taskType: "collection"
  priority: "high"
  timeout: 30000
  retries: 3
}

task dataProcessing "Data Processing Task" {
  title: "Data Processing"
  desc: "Process collected data"
  prompt: "Process the collected data using standard algorithms"
  taskType: "processing"
  priority: "medium"
  dependencies: ["dataCollection"]
}

task dataValidation "Data Validation Task" {
  title: "Data Validation"
  desc: "Validate processed results"
  prompt: "Validate the processed data meets quality standards"
  taskType: "validation"
  priority: "high"
  outputFormat: "json"
}

end "All tasks complete"

dataCollection -> dataProcessing -> dataValidation -> end
```

**Expected Behavior:**
- Should handle comprehensive attribute sets
- Should process tasks with different types and priorities
- Should maintain attribute context throughout execution
- Should demonstrate rich task metadata handling

### Template-Based Tasks

Tests task execution with template-specific attributes.

```dygram examples/testing/task-execution/template-tasks.dy
machine "Template Task Machine" {
  logLevel: "debug"
  maxSteps: 20
}

task analysisTask "Analysis Template Task" {
  title: "Data Analysis"
  desc: "Perform statistical analysis"
  prompt: "Analyze the dataset and provide statistical insights"
  taskType: "analysis"
  template: "statistical_analysis"
  inputSchema: {
    dataSource: "string",
    analysisType: "string",
    parameters: "object"
  }
  outputSchema: {
    results: "object",
    summary: "string",
    confidence: "number"
  }
}

task reportTask "Report Generation Task" {
  title: "Report Generation"
  desc: "Generate analysis report"
  prompt: "Generate a comprehensive report from analysis results"
  taskType: "reporting"
  template: "analysis_report"
  format: "markdown"
  sections: ["summary", "findings", "recommendations"]
}

end "Report generated"

analysisTask -> reportTask -> end
```

**Expected Behavior:**
- Should handle template-specific attributes
- Should process schema-defined inputs and outputs
- Should support structured task definitions
- Should demonstrate template-based task execution

## Sequential Task Processing

### Multi-Stage Processing Pipeline

Tests sequential task execution with data flow.

```dygram examples/testing/task-execution/processing-pipeline.dy
machine "Processing Pipeline" {
  logLevel: "debug"
  maxSteps: 25
}

context PipelineData {
  rawData: []
  processedData: []
  validatedData: []
  status: "initializing"
}

task ingestion "Data Ingestion" {
  title: "Data Ingestion"
  desc: "Ingest raw data from sources"
  prompt: "Ingest data from configured sources and store in pipeline context"
  stage: "ingestion"
  inputSources: ["api", "file", "database"]
}

task transformation "Data Transformation" {
  title: "Data Transformation"
  desc: "Transform ingested data"
  prompt: "Transform raw data according to business rules"
  stage: "transformation"
  rules: ["normalize", "validate", "enrich"]
}

task aggregation "Data Aggregation" {
  title: "Data Aggregation"
  desc: "Aggregate transformed data"
  prompt: "Aggregate data for reporting and analysis"
  stage: "aggregation"
  groupBy: ["category", "date", "region"]
}

task output "Data Output" {
  title: "Data Output"
  desc: "Output processed data"
  prompt: "Output aggregated data to target systems"
  stage: "output"
  targets: ["warehouse", "api", "reports"]
}

end "Pipeline complete"

ingestion -> transformation -> aggregation -> output -> end
```

**Expected Behavior:**
- Should execute tasks in sequence
- Should maintain context throughout pipeline
- Should handle multi-stage processing
- Should demonstrate data flow management

### Conditional Task Execution

Tests task execution with conditional branching.

```dygram examples/testing/task-execution/conditional-tasks.dy
machine "Conditional Task Machine" {
  logLevel: "debug"
  maxSteps: 20
}

context TaskContext {
  dataQuality: "unknown"
  processingMode: "standard"
  errorCount: 0
}

task qualityCheck "Quality Assessment" {
  title: "Data Quality Check"
  desc: "Assess data quality"
  prompt: "Evaluate data quality and set processing mode"
  checks: ["completeness", "accuracy", "consistency"]
}

task standardProcessing "Standard Processing" {
  title: "Standard Processing"
  desc: "Standard data processing"
  prompt: "Process data using standard algorithms"
  mode: "standard"
}

task enhancedProcessing "Enhanced Processing" {
  title: "Enhanced Processing"
  desc: "Enhanced data processing with quality improvements"
  prompt: "Process data with enhanced quality controls"
  mode: "enhanced"
}

task errorHandling "Error Handling" {
  title: "Error Handling"
  desc: "Handle processing errors"
  prompt: "Handle and recover from processing errors"
  mode: "recovery"
}

end "Processing complete"

qualityCheck -> standardProcessing @condition("TaskContext.dataQuality == 'good'")
qualityCheck -> enhancedProcessing @condition("TaskContext.dataQuality == 'poor'")
qualityCheck -> errorHandling @condition("TaskContext.errorCount > 0")
standardProcessing -> end
enhancedProcessing -> end
errorHandling -> end
```

**Expected Behavior:**
- Should evaluate conditions correctly
- Should route to appropriate task based on context
- Should handle conditional task execution
- Should maintain context consistency

## Task Error Handling

### Retry and Recovery Tasks

Tests task execution with error handling and retry mechanisms.

```dygram examples/testing/task-execution/retry-recovery.dy
machine "Retry Recovery Machine" {
  logLevel: "debug"
  maxSteps: 30
}

context ErrorContext {
  attemptCount: 0
  lastError: null
  maxRetries: 3
}

task riskyOperation "Risky Operation" {
  title: "Risky Operation"
  desc: "Operation that might fail"
  prompt: "Perform operation that has a chance of failure"
  maxRetries: 3
  retryDelay: 1000
  errorHandling: "retry"
}

task retryHandler "Retry Handler" {
  title: "Retry Handler"
  desc: "Handle retry logic"
  prompt: "Evaluate failure and determine if retry is appropriate"
  strategy: "exponential_backoff"
}

task errorRecovery "Error Recovery" {
  title: "Error Recovery"
  desc: "Recover from persistent errors"
  prompt: "Implement recovery strategy for persistent failures"
  fallbackMode: true
}

task success "Success Handler" {
  title: "Success Handler"
  desc: "Handle successful completion"
  prompt: "Process successful operation results"
}

end "Operation complete"

riskyOperation -> success @condition("ErrorContext.lastError == null")
riskyOperation -> retryHandler @condition("ErrorContext.attemptCount < ErrorContext.maxRetries")
riskyOperation -> errorRecovery @condition("ErrorContext.attemptCount >= ErrorContext.maxRetries")
retryHandler -> riskyOperation
errorRecovery -> end
success -> end
```

**Expected Behavior:**
- Should handle task failures gracefully
- Should implement retry logic correctly
- Should support error recovery mechanisms
- Should track error context appropriately

### Timeout and Circuit Breaker

Tests task execution with timeout and circuit breaker patterns.

```dygram examples/testing/task-execution/timeout-circuit-breaker.dy
machine "Timeout Circuit Breaker Machine" {
  logLevel: "debug"
  maxSteps: 25
  circuitBreakerThreshold: 3
  circuitBreakerTimeout: 5000
}

context CircuitState {
  failureCount: 0
  circuitOpen: false
  lastFailureTime: null
}

task externalCall "External Service Call" {
  title: "External Service Call"
  desc: "Call external service with timeout"
  prompt: "Make call to external service with timeout protection"
  timeout: 5000
  circuitBreaker: true
}

task circuitOpenHandler "Circuit Open Handler" {
  title: "Circuit Open Handler"
  desc: "Handle circuit breaker open state"
  prompt: "Handle requests when circuit breaker is open"
  fallbackResponse: "Service temporarily unavailable"
}

task timeoutHandler "Timeout Handler" {
  title: "Timeout Handler"
  desc: "Handle request timeouts"
  prompt: "Handle timeout scenarios gracefully"
  timeoutResponse: "Request timed out"
}

task successHandler "Success Handler" {
  title: "Success Handler"
  desc: "Handle successful responses"
  prompt: "Process successful service response"
}

end "Request processed"

externalCall -> successHandler @condition("!CircuitState.circuitOpen && response.success")
externalCall -> timeoutHandler @condition("response.timeout")
externalCall -> circuitOpenHandler @condition("CircuitState.circuitOpen")
successHandler -> end
timeoutHandler -> end
circuitOpenHandler -> end
```

**Expected Behavior:**
- Should handle timeouts appropriately
- Should implement circuit breaker pattern
- Should track failure states correctly
- Should provide fallback mechanisms

## Context Integration

### Context-Aware Task Execution

Tests task execution with rich context integration.

```dygram examples/testing/task-execution/context-aware.dy
machine "Context Aware Machine" {
  logLevel: "debug"
  maxSteps: 30
}

context UserSession {
  userId: "user123"
  sessionId: "session456"
  preferences: {
    language: "en",
    timezone: "UTC",
    format: "json"
  }
}

context ProcessingState {
  currentStep: 0
  completedTasks: []
  pendingTasks: []
  errors: []
}

task sessionValidation "Session Validation" {
  title: "Session Validation"
  desc: "Validate user session"
  prompt: "Validate user session and load preferences"
  requiresAuth: true
  contextFields: ["userId", "sessionId"]
}

task personalizedProcessing "Personalized Processing" {
  title: "Personalized Processing"
  desc: "Process data with user preferences"
  prompt: "Process data according to user preferences and context"
  usePreferences: true
  contextFields: ["preferences", "currentStep"]
}

task stateUpdate "State Update" {
  title: "State Update"
  desc: "Update processing state"
  prompt: "Update processing state and track progress"
  trackProgress: true
  contextFields: ["completedTasks", "pendingTasks"]
}

end "Context processing complete"

sessionValidation -> personalizedProcessing -> stateUpdate -> end
```

**Expected Behavior:**
- Should access context data correctly
- Should maintain context state throughout execution
- Should demonstrate context-aware processing
- Should update context appropriately

## Test Execution Notes

These test cases are designed to validate comprehensive task execution capabilities:

- **Task Attribute Handling**: Validates proper processing of task attributes
- **Sequential Execution**: Tests task chains and data flow
- **Error Handling**: Validates retry, recovery, and timeout mechanisms
- **Context Integration**: Tests context-aware task processing
- **Template Support**: Validates template-based task definitions

Each test case includes expected behavior specifications and can be run in both interactive and playback modes for comprehensive validation.

## Usage

To run these tests:

```bash
# Interactive mode (requires agent)
npm test test/validating/task-execution.test.ts

# Playback mode (uses recordings)
DYGRAM_TEST_MODE=playback npm test test/validating/task-execution.test.ts
