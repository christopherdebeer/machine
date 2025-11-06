# Domain-Specific Examples

Real-world applications: API workflows, ETL pipelines, and testing.

## API Workflow

RESTful API processing:

```dy
machine "API Handler"

Context config {
    timeout<number>: 5000;
    retries<number>: 3;
};

Input request {
    method: "POST";
    endpoint: "/api/process";
    headers: #requestHeaders;
    body: #requestBody;
};

Task authenticate {
    method: "POST";
    endpoint: "/auth";
    validation: "jwt";
};

Task validateRequest {
    schema: #requestSchema;
    strict<boolean>: true;
};

State authenticated "Authenticated";
State validated "Validated";

Task processRequest {
    handler: #businessLogic;
    timeout: "{{ config.timeout }}";
};

Task formatResponse {
    format: "json";
    schema: #responseSchema;
};

Output response {
    status<number>: 200;
    headers: #responseHeaders;
    body: {};
};

request -> authenticate -> authenticated;
authenticated -> validateRequest -> validated;
validated -> processRequest -> formatResponse -> response;
```

API workflow features:
- Authentication step
- Request validation
- State tracking
- Response formatting
- Timeout configuration

## Microservices Orchestration

Coordinating multiple services:

```dy
machine "Order Processing Microservices"

Input order {
    orderId: "";
    customerId: "";
    items: [];
};

// Parallel service calls
Task validateInventory @Async {
    service: "inventory-service";
    endpoint: "/validate";
};

Task validatePayment @Async {
    service: "payment-service";
    endpoint: "/authorize";
};

Task validateShipping @Async {
    service: "shipping-service";
    endpoint: "/calculate";
};

Task aggregateValidation {
    prompt: "Check all validations passed";
};

State allValid "All Valid";
State validationFailed "Validation Failed";

// Sequential processing
Task reserveInventory {
    service: "inventory-service";
    endpoint: "/reserve";
};

Task chargePayment {
    service: "payment-service";
    endpoint: "/charge";
};

Task createShipment {
    service: "shipping-service";
    endpoint: "/create";
};

Output result {
    success<boolean>: false;
    orderId: "";
};

// Workflow
order -> validateInventory, validatePayment, validateShipping;
validateInventory -> aggregateValidation;
validatePayment -> aggregateValidation;
validateShipping -> aggregateValidation;

aggregateValidation -> allValid, validationFailed;
allValid -> reserveInventory -> chargePayment -> createShipment -> result;
validationFailed -> result;
```

Microservices patterns:
- Parallel validation calls
- Aggregation point
- State-based routing
- Sequential execution after validation
- Service endpoint configuration

## Data Processing ETL

Extract, Transform, Load pipeline:

```dy
machine "ETL Pipeline"

Context config {
    batchSize<number>: 1000;
    parallelism<number>: 4;
};

// Extract phase
Process extraction {
    Task extractDB "Extract from Database" @Async {
        source: "postgresql";
        query: #extractQuery;
    };

    Task extractAPI "Extract from API" @Async {
        source: "rest-api";
        endpoint: "https://api.example.com/data";
    };

    Task extractFiles "Extract from Files" @Async {
        source: "s3";
        bucket: "data-lake";
        pattern: "*.json";
    };

    Task mergeExtracts "Merge all sources";

    extractDB -> mergeExtracts;
    extractAPI -> mergeExtracts;
    extractFiles -> mergeExtracts;
};

// Transform phase
Process transformation {
    Task cleanData "Clean data" {
        operations: ["remove_nulls", "trim_strings", "deduplicate"];
    };

    Task normalizeData "Normalize" {
        format: "standard";
        schema: #targetSchema;
    };

    Task enrichData "Enrich with external data" {
        lookupService: #enrichmentAPI;
        fields: ["location", "category"];
    };

    Task validateData "Validate" {
        schema: #targetSchema;
        strict<boolean>: true;
    };

    cleanData -> normalizeData -> enrichData -> validateData;
};

// Load phase
Process loading {
    Task loadWarehouse "Load to data warehouse" @Async {
        destination: "snowflake";
        table: "processed_data";
        mode: "append";
    };

    Task updateCache "Update cache" @Async {
        cache: "redis";
        ttl<number>: 3600;
    };

    Task notifyDownstream "Notify downstream systems" @Async {
        targets: ["analytics", "reporting"];
    };
};

// Pipeline flow
extraction.mergeExtracts -> transformation.cleanData;
transformation.validateData -> loading.loadWarehouse;
transformation.validateData -> loading.updateCache;
transformation.validateData -> loading.notifyDownstream;
```

ETL patterns:
- Three-phase structure (Extract, Transform, Load)
- Parallel extraction from multiple sources
- Sequential transformation steps
- Parallel loading to multiple destinations
- Configuration with batch size and parallelism

## Testing Workflow

Automated testing suite:

```dy
machine "Test Suite"

Context testConfig {
    environment: "staging";
    timeout<number>: 300000;
    retries<number>: 2;
};

Task setupEnvironment "Setup test environment" {
    tasks: ["start_services", "seed_database", "clear_cache"];
};

State ready "Ready for Testing";

// Parallel test execution
Process unitTests {
    Task runModuleA "Unit tests: Module A" @Async;
    Task runModuleB "Unit tests: Module B" @Async;
    Task runModuleC "Unit tests: Module C" @Async;
};

Process integrationTests {
    Task runAPITests "Integration tests: API" @Async;
    Task runDBTests "Integration tests: Database" @Async;
};

Process e2eTests {
    Task runUserFlows "E2E: User flows" @Async;
    Task runPaymentFlows "E2E: Payment flows" @Async;
};

// Test aggregation
Task aggregateResults "Aggregate test results";

State allPassed "All Tests Passed";
State someFailed "Some Tests Failed";

// Reporting
Task generateReport "Generate test report" {
    format: "html";
    includeScreenshots<boolean>: true;
};

Task notifyTeam "Notify team" {
    channels: ["slack", "email"];
};

Output testResults {
    passed<number>: 0;
    failed<number>: 0;
    skipped<number>: 0;
    duration<number>: 0;
    reportUrl: "";
};

// Workflow
setupEnvironment -> ready;
ready -> unitTests.runModuleA, unitTests.runModuleB, unitTests.runModuleC;
ready -> integrationTests.runAPITests, integrationTests.runDBTests;
ready -> e2eTests.runUserFlows, e2eTests.runPaymentFlows;

unitTests.runModuleA -> aggregateResults;
unitTests.runModuleB -> aggregateResults;
unitTests.runModuleC -> aggregateResults;
integrationTests.runAPITests -> aggregateResults;
integrationTests.runDBTests -> aggregateResults;
e2eTests.runUserFlows -> aggregateResults;
e2eTests.runPaymentFlows -> aggregateResults;

aggregateResults -> allPassed, someFailed;
allPassed -> generateReport -> notifyTeam -> testResults;
someFailed -> generateReport -> notifyTeam -> testResults;
```

Testing patterns:
- Environment setup phase
- Parallel test execution (unit, integration, E2E)
- Result aggregation
- Pass/fail routing
- Reporting and notification
- Grouped test suites in processes

## CI/CD Pipeline

Continuous integration and deployment:

```dy
machine "CI/CD Pipeline" @Version("1.0")

Input trigger {
    event: "push";
    branch: "main";
    commit: "";
};

// Build phase
Process build {
    Task checkout "Checkout code";
    Task installDeps "Install dependencies";
    Task compile "Compile";
    Task lint "Run linter";

    checkout -> installDeps -> compile -> lint;
};

// Test phase
Process test {
    Task unitTest "Run unit tests" @Async;
    Task integrationTest "Run integration tests" @Async;
    Task securityScan "Security scan" @Async;
};

State testsPass "Tests Pass";
State testsFail "Tests Fail";

// Deploy phase
Process deploy {
    Task buildImage "Build Docker image";
    Task pushImage "Push to registry";
    Task deployStaging "Deploy to staging";
    Task runSmokeTests "Run smoke tests";

    State stagingOk "Staging OK";
    State stagingFail "Staging Fail";

    Task deployProduction "Deploy to production";
    Task healthCheck "Health check";

    buildImage -> pushImage -> deployStaging -> runSmokeTests -> stagingOk, stagingFail;
    stagingOk -> deployProduction -> healthCheck;
};

Output result {
    success<boolean>: false;
    version: "";
    deployedAt: "";
};

// Pipeline flow
trigger -> build.checkout;
build.lint -> test.unitTest, test.integrationTest, test.securityScan;
test.unitTest -> testsPass;
test.integrationTest -> testsPass;
test.securityScan -> testsPass;

testsPass -> deploy.buildImage;
testsFail -> result;
deploy.stagingFail -> result;
deploy.healthCheck -> result;
```

CI/CD patterns:
- Triggered by git events
- Build → Test → Deploy phases
- Parallel testing
- Staging validation before production
- Health checks post-deployment
- State-based flow control

## Monitoring and Alerting

System monitoring workflow:

```dy
machine "Monitoring System"

Context config {
    checkInterval<number>: 60;
    alertThreshold<number>: 3;
    retentionDays<number>: 30;
};

// Data collection
Task collectMetrics "Collect metrics" @Async {
    sources: ["prometheus", "cloudwatch", "datadog"];
};

Task collectLogs "Collect logs" @Async {
    sources: ["elasticsearch", "splunk"];
};

Task collectTraces "Collect traces" @Async {
    source: "jaeger";
};

// Analysis
Task analyzeMetrics "Analyze metrics" {
    model: "claude-3-5-sonnet-20241022";
    prompt: "Analyze metrics for anomalies: {{ collectMetrics.data }}";
};

Task correlateLogs "Correlate logs with metrics";

State normal "Normal Operation";
State warning "Warning Level";
State critical "Critical Level";

// Alerting
Task createAlert "Create alert" {
    severity: "{{ state }}";
};

Task notifyTeam "Notify team" {
    channels: ["pagerduty", "slack"];
};

Task createTicket "Create incident ticket" {
    system: "jira";
};

// Remediation
Task autoRemediate "Auto-remediate" {
    actions: #remediationPlaybook;
};

Output status {
    health: "unknown";
    alerts<Array<string>>: [];
};

// Workflow
collectMetrics -> analyzeMetrics;
collectLogs -> correlateLogs;
collectTraces -> correlateLogs;

analyzeMetrics -> correlateLogs;
correlateLogs -> normal, warning, critical;

warning -> createAlert -> notifyTeam -> status;
critical -> createAlert -> notifyTeam -> createTicket -> autoRemediate -> status;
normal -> status;
```

Monitoring patterns:
- Parallel metric/log/trace collection
- LLM-powered anomaly detection
- Correlation analysis
- Severity-based routing
- Automated alerting
- Auto-remediation for critical issues

## Next Steps

- **[CLI & API Usage](./cli-and-api.md)** - Running these examples
- **[Advanced Features](./advanced-features.md)** - Complex patterns
- **[Attributes & Types](./attributes-and-types.md)** - Type systems
