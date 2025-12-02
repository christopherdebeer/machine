# Workflow Examples

Real-world workflow examples demonstrating practical applications of the DyGram language.

## Examples

### `user-onboarding.dy`
User registration and onboarding workflow with:
- Multiple states (registration, verification, profile setup)
- Timeout handling
- Cancellation flows
- Happy path and edge cases

**Test it:**
```bash
npx dygram generate examples/workflows/user-onboarding.dy -f json,html -d output/
```

### `order-processing.dy`
E-commerce order processing system with:
- Order lifecycle states
- Payment flow
- Fulfillment process
- Refund and cancellation handling

**Test it:**
```bash
npx dygram generate examples/workflows/order-processing.dy -f mermaid -d output/
```

### `ci-cd-pipeline.dy`
Continuous Integration/Deployment pipeline with:
- Build, test, and deploy stages
- Security scanning
- Multiple environments (staging, production)
- Failure handling and rollback paths

**Test it:**
```bash
npx dygram generate examples/workflows/ci-cd-pipeline.dy -f html -d output/
```

### `smart-task-prioritizer.dy`
AI-powered task prioritization workflow with:
- Task analysis using LLM
- Priority assignment with reasoning
- Action plan generation
- Context management for data flow

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram execute examples/workflows/smart-task-prioritizer.dygram
```

### `code-generation-demo.dy`
Complete code generation workflow demonstrating:
- Requirements definition via LLM
- JavaScript code generation
- Test generation
- Documentation generation
- Validation and quality checks

**Test it:**
```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx dygram execute examples/workflows/code-generation-demo.dygram
```

## Usage Patterns

These examples demonstrate:
- **State management**: Using `State` nodes for workflow stages
- **Task execution**: Using `Task` nodes for actions
- **Edge labels**: Named transitions between states
- **Attributes**: Metadata like descriptions, timeouts, and priorities
- **Alternative flows**: Handling errors, timeouts, and edge cases

## Validation

Validate any workflow example:
```bash
npx dygram parseAndValidate examples/workflows/user-onboarding.dygram
```

## Generation Formats

Generate in multiple formats:
```bash
npx dygram generate examples/workflows/user-onboarding.dygram

npx dygram generate examples/workflows/user-onboarding.dy -f json,mermaid,html -d output/

ls output/
```

### `data-pipeline.dy`
Data Pipeline ETL Workflow

```dy examples/workflows/data-pipeline.dygram
machine "Data Pipeline ETL Workflow"

// This example demonstrates a complete Extract-Transform-Load (ETL) data pipeline
// with error handling, monitoring, and data quality checks

// Configuration
context pipelineConfig @Singleton {
    batchSize<number>: 1000;
    maxRetries<number>: 3;
    timeout<number>: 300000;
    parallelism<number>: 4;
}

context dataSourceConfig {
    source {
        type<string>: "database";
        connectionString<string>: "postgresql://localhost:5432/source_db";
        query<string>: "SELECT * FROM transactions WHERE created_at > {{lastRunTime}}";
    }
    destination {
        type<string>: "data_warehouse";
        connectionString<string>: "postgresql://localhost:5432/warehouse_db";
        table<string>: "fact_transactions";
    }
}

// Pipeline States
init start "Pipeline Start";
state ready "Ready to Process";
state processing "Processing Data";
state complete "Pipeline Complete";
state failed "Pipeline Failed";

// Extract Phase
task validateConnections "Validate Connections" @Critical {
    prompt: "Validate source and destination connections";
}

task extractData "Extract Data" @Async {
    prompt: "Extract data from source: {{dataSourceConfig.source.query}}";
    recordsExtracted<number>: 0;
}

task checkExtractQuality "Check Extract Quality" {
    prompt: "Validate extracted data meets quality thresholds";
    qualityScore<number>: 0;
}

// Transform Phase
task cleanData "Clean Data" {
    prompt: "Remove duplicates, handle nulls, standardize formats";
}

task validateSchema "Validate Schema" {
    prompt: "Ensure data matches target schema";
}

task enrichData "Enrich Data" {
    prompt: "Add derived columns and lookup values";
}

task aggregateData "Aggregate Data" {
    prompt: "Calculate summary metrics and aggregations";
}

task transformData "Transform Data" @Async {
    prompt: "Apply business logic transformations";
    recordsTransformed<number>: 0;
}

// Load Phase
task prepareLoad "Prepare Load" {
    prompt: "Prepare data for loading into warehouse";
}

task loadData "Load Data" @Async @Critical {
    prompt: "Load transformed data to {{dataSourceConfig.destination.table}}";
    recordsLoaded<number>: 0;
}

task verifyLoad "Verify Load" {
    prompt: "Verify data loaded correctly";
}

task updateMetadata "Update Metadata" {
    prompt: "Update pipeline metadata and lineage";
}

// Error Handling
task handleExtractError "Handle Extract Error" {
    prompt: "Log extract error and determine retry strategy";
}

task handleTransformError "Handle Transform Error" {
    prompt: "Log transform error and salvage partial results";
}

task handleLoadError "Handle Load Error" {
    prompt: "Rollback partial loads and log error";
}

// Monitoring and Alerting
task recordMetrics "Record Metrics" {
    prompt: "Record pipeline execution metrics";
}

task sendAlerts "Send Alerts" {
    prompt: "Send alerts for pipeline failures or quality issues";
}

// Data Quality Checks
task checkCompleteness "Check Completeness" {
    prompt: "Verify no data loss during pipeline";
    completeness<number>: 0;
}

task checkAccuracy "Check Accuracy" {
    prompt: "Verify data accuracy and consistency";
    accuracy<number>: 0;
}

task checkConsistency "Check Consistency" {
    prompt: "Verify referential integrity and business rules";
}

// Cleanup
task cleanupTempData "Cleanup Temporary Data" {
    prompt: "Remove temporary files and staging data";
}

task archiveData "Archive Source Data" {
    prompt: "Archive processed source data";
}

// Main Pipeline Flow
start -> validateConnections;
validateConnections -"success"-> ready;
validateConnections -"failure"-> failed;

ready -> extractData;
extractData -> checkExtractQuality;
checkExtractQuality -"quality > 95%"-> processing;
checkExtractQuality -"quality <= 95%"-> handleExtractError;

processing -> cleanData;
cleanData -> validateSchema;
validateSchema -"valid"-> enrichData;
validateSchema -"invalid"-> handleTransformError;

enrichData -> aggregateData;
aggregateData -> transformData;
transformData -"success"-> prepareLoad;
transformData -"failure"-> handleTransformError;

prepareLoad -> loadData;
loadData -"success"-> verifyLoad;
loadData -"failure"-> handleLoadError;

verifyLoad -> checkCompleteness;
checkCompleteness -> checkAccuracy;
checkAccuracy -> checkConsistency;
checkConsistency -"all checks passed"-> updateMetadata;
checkConsistency -"checks failed"-> handleLoadError;

updateMetadata -> recordMetrics;
recordMetrics -> cleanupTempData;
cleanupTempData -> archiveData;
archiveData -> complete;

// Error Handling Flows
handleExtractError -"retry < maxRetries"-> extractData;
handleExtractError -"retry >= maxRetries"-> sendAlerts;

handleTransformError -"retry < maxRetries"-> transformData;
handleTransformError -"retry >= maxRetries"-> sendAlerts;

handleLoadError -> sendAlerts;

sendAlerts -> failed;

// Dependencies
validateConnections --> pipelineConfig;
validateConnections --> dataSourceConfig;
extractData --> pipelineConfig;
extractData --> dataSourceConfig;
transformData --> pipelineConfig;
loadData --> pipelineConfig;
loadData --> dataSourceConfig;

// Parallel Processing (aggregation)
task batchProcessor1 "Batch Processor 1" @Async;
task batchProcessor2 "Batch Processor 2" @Async;
task batchProcessor3 "Batch Processor 3" @Async;
task batchProcessor4 "Batch Processor 4" @Async;
task mergeResults "Merge Results";

transformData *--> batchProcessor1;
transformData *--> batchProcessor2;
transformData *--> batchProcessor3;
transformData *--> batchProcessor4;

batchProcessor1 -> mergeResults;
batchProcessor2 -> mergeResults;
batchProcessor3 -> mergeResults;
batchProcessor4 -> mergeResults;
mergeResults -> prepareLoad;

note extractData "Extract Phase:
- Pull data from source system
- Handle incremental vs full loads
- Validate data quality at source
- Track extraction metrics"

note transformData "Transform Phase:
- Clean and standardize data
- Apply business rules
- Enrich with reference data
- Calculate derived values
- Parallel processing for performance"

note loadData "Load Phase:
- Prepare staging tables
- Bulk insert for performance
- Handle conflicts (upsert/merge)
- Verify data integrity
- Update metadata/lineage"

note checkExtractQuality "Data Quality Checks:
- Completeness: No missing records
- Accuracy: Values within expected ranges
- Consistency: Referential integrity maintained
- Timeliness: Data is current
- Uniqueness: No duplicates"

note recordMetrics "Pipeline Metrics:
- Execution time
- Records processed
- Data quality scores
- Error rates
- Resource utilization
- Success/failure status"

```

### `ci-cd-pipeline.dy`

CI/CD Pipeline

```dy examples/workflows/ci-cd-pipeline.dygram
machine "CI/CD Pipeline"

// Pipeline stages
Task source {
    desc: "Checkout source code";
    stage: "init";
};

Task build {
    desc: "Compile and build";
    stage: "build";
};

Task test {
    desc: "Run test suite";
    stage: "test";
};

Task security_scan {
    desc: "Security vulnerability scan";
    stage: "security";
};

Task deploy_staging {
    desc: "Deploy to staging";
    stage: "deploy";
};

Task integration_test {
    desc: "Run integration tests";
    stage: "test";
};

Task deploy_production {
    desc: "Deploy to production";
    stage: "deploy";
};

State failed {
    desc: "Pipeline failed";
};

State success {
    desc: "Pipeline completed successfully";
};

// Pipeline flow
source -> build -> test;
test -pass-> security_scan;
security_scan -clean-> deploy_staging;
deploy_staging -ready-> integration_test;
integration_test -pass-> deploy_production;
deploy_production -> success;

// Failure paths
build -error-> failed;
test -failure-> failed;
security_scan -vulnerability-> failed;
integration_test -failure-> failed;

```

### `code-generation-demo.dy`

Code Generation Workflow

```dy examples/workflows/code-generation-demo.dygram
machine "Code Generation Workflow"

// Define the workflow for generating, testing, and documenting code

state start;

Task define_requirements {
    meta: true;
    prompt: "You are generating a simple JavaScript utility function. Create requirements for a function that validates email addresses. Use set_context_value to store the requirements in the 'requirements' context node with key 'spec' as a string describing: function name, parameters, return value, and test cases.";
};

context requirements {
    spec<string>: "";
};

Task generate_code {
    meta: true;
    prompt: "Read the requirements from the 'requirements' context using get_context_value. Generate JavaScript code for the email validation function. Use set_context_value to store the generated code in the 'code' context node with key 'implementation' as a string containing the complete function implementation.";
};

context code {
    implementation<string>: "";
    language<string>: "javascript";
};

Task generate_tests {
    meta: true;
    prompt: "Read the requirements from 'requirements' context and the implementation from 'code' context using get_context_value. Generate comprehensive test cases using a simple testing approach (no framework needed). Use set_context_value to store the test code in the 'tests' context node with key 'testCode' as a string.";
};

context tests {
    testCode<string>: "";
    framework<string>: "vanilla";
};

Task generate_documentation {
    meta: true;
    prompt: "Read the requirements, code implementation, and tests from their respective context nodes using get_context_value. Generate markdown documentation including: function signature, description, parameters, return value, examples, and how to run tests. Use set_context_value to store the documentation in the 'documentation' context node with key 'markdown' as a string.";
};

context documentation {
    markdown<string>: "";
    format<string>: "markdown";
};

Task validation {
    meta: true;
    prompt: "Review the generated code, tests, and documentation from their context nodes using get_context_value. Check for completeness and quality. If everything looks good, use set_context_value to store a validation summary in 'validation_result' context with key 'status' as 'passed' and 'summary' with any notes. Then use the transition tool to move to 'complete'.";
};

context validation_result {
    status<string>: "pending";
    summary<string>: "";
};

state complete {
    desc: "Code generation workflow completed successfully";
};

// Define the workflow
start -> define_requirements;
define_requirements -specified-> requirements;
requirements -> generate_code;
generate_code -generated-> code;
code -> generate_tests;
generate_tests -created-> tests;
tests -> generate_documentation;
generate_documentation -documented-> documentation;
documentation -> validation;
validation -validated-> validation_result;
validation_result -> complete;

```

### `order-processing.dy`

E-Commerce Order Processing

```dy examples/workflows/order-processing.dygram
machine "E-Commerce Order Processing"

init start;

// Order states
State new_order {
    desc: "Order received";
    priority<number>: 1;
};

State payment_pending {
    desc: "Awaiting payment";
};

State payment_confirmed {
    desc: "Payment successful";
};

State preparing {
    desc: "Order being prepared";
};

State shipped {
    desc: "Order shipped to customer";
};

State delivered {
    desc: "Order delivered";
};

State cancelled {
    desc: "Order cancelled";
};

State refunded {
    desc: "Order refunded";
};

start -> new_order;

// Happy path
new_order -create-> payment_pending;
payment_pending -pay-> payment_confirmed;
payment_confirmed -prepare-> preparing;
preparing -ship-> shipped;
shipped -deliver-> delivered;

// Alternative flows
payment_pending -timeout: 900;-> cancelled;
payment_confirmed -cancel_request-> refunded;
preparing -cancel_request-> refunded;

```

### `smart-task-prioritizer.dy`

Smart Task Prioritization System

```dy examples/workflows/smart-task-prioritizer.dygram
machine "Smart Task Prioritization System"

// A practical workflow that analyzes and prioritizes tasks using AI

state start;

Task analyze_tasks {
    meta: true;
    prompt: "You are helping prioritize a list of tasks. Here are the tasks: 1) Fix critical security bug, 2) Write documentation, 3) Implement new feature, 4) Code review. Analyze these tasks and use set_context_value to store a prioritized list in the 'analysis' context node with key 'prioritizedTasks' as a JSON string containing an array of objects with fields: task, priority (1-4), reasoning.";
};

context analysis {
    prioritizedTasks<string>: "[]";
    analysisDate<string>: "";
};

Task generate_action_plan {
    meta: true;
    prompt: "Read the prioritized tasks from 'analysis' context using get_context_value. Create a detailed action plan for the top 2 priority tasks. Use set_context_value to store the action plan in 'action_plan' context with key 'plan' as a string with clear steps for each task.";
};

context action_plan {
    plan<string>: "";
    estimatedTime<string>: "";
};

Task finalize {
    meta: true;
    prompt: "Read the action plan from 'action_plan' context. Summarize the workflow completion and use the transition tool to move to 'complete' state.";
};

state complete {
    desc: "Task prioritization workflow completed";
};

// Workflow
start -> analyze_tasks;
analyze_tasks -analyzed-> analysis;
analysis -> generate_action_plan;
generate_action_plan -planned-> action_plan;
action_plan -> finalize;
finalize -> complete;

```

### `user-onboarding.dy`

User Onboarding Workflow

```dy examples/workflows/user-onboarding.dygram
machine "User Onboarding Workflow"

// Define states
State registration {
    desc: "User fills registration form";
    status: "active";
};

State email_verification {
    desc: "Email verification pending";
    timeout<Integer>: 3600;
};

State profile_setup {
    desc: "User customizes profile";
};

State complete {
    desc: "Onboarding complete";
};

State abandoned {
    desc: "User abandoned the process";
};

// Define the workflow
registration -submit-> email_verification;
email_verification -verified-> profile_setup;
profile_setup -completed-> complete;

// Handle edge cases
email_verification -timeout-> abandoned;
registration -cancel-> abandoned;

```
