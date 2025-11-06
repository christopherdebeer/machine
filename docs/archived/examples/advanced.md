# Advanced Features Examples

This directory contains examples demonstrating advanced DyGram features including relationship types, annotations, multiplicity, dependency inference, and error handling patterns.

## Examples

### `annotations.dygram`

Annotation system demonstrating metadata on nodes:
- `@Abstract` - Abstract base classes that cannot be instantiated
- `@Singleton` - Single instance pattern
- `@Deprecated("reason")` - Deprecated nodes with migration guidance
- `@Async` - Asynchronous execution
- `@Critical` - Critical path components
- Multiple annotations on single nodes


Annotation System Examples

```dy examples/advanced/annotations.dygram
machine "Annotation System Examples"

// Abstract base class
task BaseProcessor @Abstract {
    desc: "Base processor that all processors must extend";
    version<string>: "1.0.0";
}

// Singleton pattern
task ConfigManager @Singleton {
    desc: "Manages application configuration";
    configPath<string>: "/etc/app/config.json";
}

// Deprecated node
task LegacyAPI @Deprecated("Use ModernAPI instead - will be removed in v2.0") {
    desc: "Old API endpoint - do not use in new code";
    endpoint<string>: "/api/v1/legacy";
}

// Modern replacement
task ModernAPI {
    desc: "New API endpoint with better performance";
    endpoint<string>: "/api/v2/modern";
}

// Critical business logic
task PaymentProcessor @Critical @Async {
    desc: "Processes payments - requires high availability";
    timeout<number>: 30000;
    retries<number>: 5;
}

// Multiple annotations showing different aspects
task DataValidator @Abstract @Critical {
    desc: "Validates critical data before processing";
}

// Concrete implementations
task JSONValidator @Singleton {
    desc: "Validates JSON data";
    schema<string>: "schema.json";
}

task XMLValidator @Deprecated("Use JSONValidator instead") {
    desc: "Validates XML data - legacy system";
}

// Inheritance relationships
BaseProcessor <|-- DataValidator;
DataValidator <|-- JSONValidator;
DataValidator <|-- XMLValidator;

// Async task workflow
task FetchData @Async {
    desc: "Asynchronously fetches data from external source";
    url<string>: "https://api.example.com/data";
}

task ProcessData @Async @Critical {
    desc: "Processes fetched data asynchronously";
}

task StoreData @Critical {
    desc: "Stores processed data in database";
}

// Workflow
FetchData -> ProcessData;
ProcessData -> StoreData;

// Configuration dependency
ConfigManager --> PaymentProcessor;
ConfigManager --> FetchData;

```

### `multiplicity.dygram`
Multiplicity and cardinality in relationships:
- `"1"` - Exactly one (one-to-one)
- `"*"` - Zero or more (one-to-many)
- `"0..1"` - Zero or one (optional)
- `"1..*"` - One or more (required one-to-many)
- `"2..5"` - Specific range relationships
- Validation of multiplicity constraints


Multiplicity Examples

```dy examples/advanced/multiplicity.dygram
machine "Multiplicity Examples"

// One-to-many relationship
task User "User Account" {
    name<string>: "John Doe";
    email<string>: "john@example.com";
}

task Order "Customer Order" {
    orderId<number>: 1;
    total<number>: 99.99;
}

task LineItem "Order Line Item" {
    productId<string>: "P123";
    quantity<number>: 1;
}

// One user can have many orders
User "1" --> "*" Order;

// One order must have at least one line item
Order "1" --> "1..*" LineItem;

// One-to-one relationship
task Payment "Payment Details" {
    paymentId<string>: "PAY123";
    amount<number>: 99.99;
}

// Each order has exactly one payment
Order "1" --> "1" Payment;

// Optional relationship
task ShippingAddress "Shipping Address" {
    street<string>: "123 Main St";
    city<string>: "Springfield";
}

// User may have 0 or 1 shipping address
User "1" --> "0..1" ShippingAddress;

// Many-to-many relationship
task Product "Product" {
    productId<string>: "P123";
    name<string>: "Widget";
}

task Category "Product Category" {
    categoryId<string>: "C1";
    name<string>: "Electronics";
}

// Products can be in many categories, categories can have many products
Product "*" --> "*" Category;

// Specific range
task Team "Development Team" {
    teamName<string>: "Backend Team";
}

task Developer "Team Member" {
    name<string>: "Jane Smith";
    role<string>: "Developer";
}

// A team must have between 3 and 10 developers
Team "1" --> "3..10" Developer;

```


### `dependency-inference.dygram`
Automatic dependency inference from template variables:
- Template variable syntax: `{{nodeName.attributeName}}`
- Automatic dependency edge creation
- Multiple context dependencies
- Nested attribute references
- Compile-time validation of references

### `complete-example.dygram`
Comprehensive example combining many features:
- All relationship types
- Multiplicity annotations
- Dependency inference
- Multiple node types
- Real-world patterns

Complete Phase 2 Feature Showcase

```dy examples/advanced/complete-example.dygram
machine "Complete Phase 2 Feature Showcase"

// Configuration with annotations and dependency inference
context systemConfig @Singleton {
    apiBaseUrl<string>: "https://api.example.com";
    apiKey<string>: "secret-key-123";
    maxRetries<number>: 3;
    timeout<number>: 5000;
    environment<string>: "production";
}

context databaseConfig @Singleton {
    host<string>: "db.example.com";
    port<number>: 5432;
    database<string>: "myapp_prod";
    maxConnections<number>: 100;
}

// Abstract base classes with annotations
task BaseTask @Abstract {
    desc: "Base task for all operations";
    version<string>: "2.0.0";
}

task BaseValidator @Abstract @Critical {
    desc: "Base validator for data validation";
}

// Concrete implementations with inheritance
task HTTPTask @Async {
    prompt: "Make HTTP request to {{ systemConfig.apiBaseUrl }} with timeout {{ systemConfig.timeout }}";
    method<string>: "GET";
}

task DatabaseTask @Async @Critical {
    prompt: "Connect to {{ databaseConfig.database }} at {{ databaseConfig.host }}:{{ databaseConfig.port }}";
}

// Inheritance relationships
BaseTask <|-- HTTPTask;
BaseTask <|-- DatabaseTask;

// Validators
task JSONValidator @Singleton {
    desc: "Validates JSON data format";
    schema<string>: "schema.json";
}

task DataValidator @Critical {
    desc: "Validates business rules";
}

BaseValidator <|-- JSONValidator;
BaseValidator <|-- DataValidator;

// Main workflow tasks
task fetchData @Async {
    prompt: "Fetch data using {{ HTTPTask.prompt }}";
}

task validateData {
    prompt: "Validate fetched data with {{ JSONValidator.desc }}";
}

task transformData @Critical {
    prompt: "Transform validated data for storage";
}

task storeData @Async @Critical {
    prompt: "Store data using {{ DatabaseTask.prompt }}";
}

task notifySuccess {
    prompt: "Send success notification (env: {{ systemConfig.environment }})";
}

// Error handling
task errorHandler @Critical {
    desc: "Handles errors and retries";
    maxRetries: 3;
}

// State nodes
state Success {
    desc: "Operation completed successfully";
}

state Failed {
    desc: "Operation failed after retries";
}

// Relationships with multiplicity

// One fetch operation produces multiple data records
fetchData "1" --> "*" validateData;

// Each validated record goes through one transformation
validateData "1" --> "1" transformData;

// Transformed data is stored (one-to-one)
transformData "1" --> "1" storeData;

// Storage can result in success or failure
storeData "1" --> "0..1" Success;
storeData "1" --> "0..1" Failed;

// Success triggers notification
Success "1" --> "1" notifySuccess;

// Failed triggers error handler
Failed "1" --> "1" errorHandler;

// Error handler can retry (back to fetch)
errorHandler "1" --> "0..1" fetchData;

// Validators are used by validation step
JSONValidator "1" --> "*" validateData;
DataValidator "1" --> "*" validateData;

// Deprecated legacy task
task legacyProcessor @Deprecated("Use transformData instead - removed in v3.0") {
    desc: "Old data processor";
}

// Inferred dependencies (automatically detected by DyGram):
//
// HTTPTask ..> systemConfig : reads prompt
// DatabaseTask ..> databaseConfig : reads prompt
// fetchData ..> HTTPTask : reads prompt
// storeData ..> DatabaseTask : reads prompt
// notifySuccess ..> systemConfig : reads prompt
//
// This creates a clear dependency graph showing data flow and configuration usage

```

### `error-handling.dygram`
Common error handling patterns:
- Try-Catch-Finally pattern
- Retry with exponential backoff
- Circuit breaker pattern
- Fallback pattern
- Timeout handling
- Compensating transactions (Saga pattern)
- Dead letter queue pattern
- Validation with detailed errors


Error Handling Patterns

```dy examples/advanced/error-handling.dygram
machine "Error Handling Patterns"

// This example demonstrates common error handling patterns in DyGram

// Pattern 1: Try-Catch-Finally Pattern
init start "Start Process";
task mainTask "Main Task" {
    prompt: "Execute main business logic";
}
state error "Error State";
task errorHandler "Error Handler" {
    prompt: "Handle and log error";
}
task cleanup "Cleanup" {
    prompt: "Cleanup resources";
}
state complete "Complete";

start -> mainTask;
mainTask -"success"-> cleanup;
mainTask -"error"-> error;
error -> errorHandler;
errorHandler -> cleanup;
cleanup -> complete;

// Pattern 2: Retry with Exponential Backoff
context retryConfig {
    maxRetries<number>: 3;
    baseDelay<number>: 1000;
    maxDelay<number>: 10000;
}

task apiCall "API Call" @Async {
    prompt: "Call external API";
    retryCount<number>: 0;
}
task retryHandler "Retry Handler" {
    prompt: "Calculate backoff and retry";
}
state maxRetriesReached "Max Retries Reached";

apiCall -"failure"-> retryHandler;
retryHandler -"retries < maxRetries"-> apiCall;
retryHandler -"retries >= maxRetries"-> maxRetriesReached;
apiCall --> retryConfig;
retryHandler --> retryConfig;

// Pattern 3: Circuit Breaker Pattern
context circuitBreakerState {
    state<string>: "CLOSED";
    failureCount<number>: 0;
    threshold<number>: 5;
    timeout<number>: 30000;
}

task protectedCall "Protected Call" {
    prompt: "Call with circuit breaker protection";
}
state circuitOpen "Circuit Open";
task waitForTimeout "Wait for Timeout" {
    prompt: "Wait before attempting to close circuit";
}
state halfOpen "Half Open";

protectedCall -"success"-> cleanup;
protectedCall -"failure && count < threshold"-> protectedCall;
protectedCall -"failure && count >= threshold"-> circuitOpen;
circuitOpen -> waitForTimeout;
waitForTimeout -"timeout expired"-> halfOpen;
halfOpen -"probe success"-> protectedCall;
halfOpen -"probe failure"-> circuitOpen;

// Pattern 4: Fallback Pattern
task primaryService "Primary Service" @Critical {
    prompt: "Call primary service";
}
task secondaryService "Secondary Service" {
    prompt: "Call secondary/fallback service";
}
task cacheService "Cache Service" {
    prompt: "Return cached data";
}
task defaultResponse "Default Response" {
    prompt: "Return default/safe response";
}

primaryService -"success"-> complete;
primaryService -"failure"-> secondaryService;
secondaryService -"success"-> complete;
secondaryService -"failure"-> cacheService;
cacheService -"success"-> complete;
cacheService -"failure"-> defaultResponse;
defaultResponse -> complete;

// Pattern 5: Timeout Handling
task longRunningTask "Long Running Task" @Async {
    timeout<number>: 5000;
    prompt: "Execute long operation";
}
state timeout "Timeout Occurred";
task timeoutHandler "Timeout Handler" {
    prompt: "Handle timeout gracefully";
}
task cancelTask "Cancel Task" {
    prompt: "Cancel running operation";
}

longRunningTask -"completed"-> complete;
longRunningTask -"timeout"-> timeout;
timeout -> timeoutHandler;
timeoutHandler -> cancelTask;
cancelTask -> complete;

// Pattern 6: Compensating Transactions (Saga Pattern)
task beginTransaction "Begin Transaction";
task step1 "Execute Step 1";
task step2 "Execute Step 2";
task step3 "Execute Step 3";
task commitTransaction "Commit Transaction";

// Compensation tasks
task compensateStep3 "Compensate Step 3";
task compensateStep2 "Compensate Step 2";
task compensateStep1 "Compensate Step 1";
task rollbackTransaction "Rollback Transaction";

// Happy path
beginTransaction -> step1;
step1 -> step2;
step2 -> step3;
step3 -> commitTransaction;
commitTransaction -> complete;

// Failure and compensation path
step3 -"failure"-> compensateStep3;
compensateStep3 -> compensateStep2;
step2 -"failure"-> compensateStep2;
compensateStep2 -> compensateStep1;
step1 -"failure"-> compensateStep1;
compensateStep1 -> rollbackTransaction;
rollbackTransaction -> error;

// Pattern 7: Dead Letter Queue
task messageProcessor "Message Processor" {
    prompt: "Process message from queue";
}
task deadLetterQueue "Dead Letter Queue" {
    prompt: "Move failed message to DLQ";
}
task alerting "Alerting Service" {
    prompt: "Send alert for DLQ message";
}

messageProcessor -"success"-> complete;
messageProcessor -"permanent failure"-> deadLetterQueue;
deadLetterQueue -> alerting;
alerting -> complete;

// Pattern 8: Validation with Detailed Errors
task validateInput "Validate Input" {
    prompt: "Validate incoming data";
}
state validationError "Validation Error";
task formatValidationError "Format Validation Error" {
    prompt: "Format user-friendly error message";
}
task logValidationError "Log Validation Error" {
    prompt: "Log validation error details";
}

validateInput -"valid"-> mainTask;
validateInput -"invalid"-> validationError;
validationError -> formatValidationError;
validationError -> logValidationError;
formatValidationError -> complete;

note errorHandler "Error handlers should:
1. Log error details with context
2. Update metrics/monitoring
3. Determine if error is recoverable
4. Take appropriate action (retry, fallback, or fail)"

note retryHandler "Retry logic should:
1. Implement exponential backoff
2. Add jitter to prevent thundering herd
3. Respect max retry limits
4. Consider idempotency"

note protectedCall "Circuit breaker states:
- CLOSED: Normal operation, requests pass through
- OPEN: Too many failures, requests rejected immediately
- HALF_OPEN: Testing if service recovered"

```

### `cel-conditions.dygram`

CEL Condition Examples

```dy examples/advanced/cel-conditions.dygram
machine "CEL Condition Examples"

// This example demonstrates Common Expression Language (CEL) conditions
// for safe, sandboxed expression evaluation in edge transitions

// Example 1: Simple Numeric Conditions
context counter {
    count<number>: 0;
    maxCount<number>: 10;
    minCount<number>: 0;
}

state start "Start";
task increment "Increment Counter";
task decrement "Decrement Counter";
state complete "Complete";

start -> increment;

// Numeric comparison operators
increment -if: '(count < maxCount)';-> increment;
increment -if: '(count >= maxCount)';-> complete;
decrement -if: '(count > minCount)';-> decrement;
decrement -if: '(count <= minCount)';-> start;

// Example 2: String Conditions
context userState {
    status<string>: "pending";
    role<string>: "user";
}

task validateUser "Validate User";
state processing "Processing";
state admin "Admin Flow";
state user "User Flow";
state rejected "Rejected";

start -> validateUser;

// String equality
validateUser -if: '(status == "approved")';-> processing;
validateUser -if: '(status == "rejected")';-> rejected;

// Multiple conditions with AND
validateUser -if: '(status == "approved" && role == "admin")';-> admin;
validateUser -if: '(status == "approved" && role == "user")';-> user;

// Example 3: Boolean Logic
context config {
    debug<boolean>: false;
    production<boolean>: true;
    enableFeatureX<boolean>: true;
}

task checkEnvironment "Check Environment";
state debugMode "Debug Mode";
state productionMode "Production Mode";
state featureEnabled "Feature Enabled";

start -> checkEnvironment;

// Boolean conditions
checkEnvironment -if: '(debug == true)';-> debugMode;
checkEnvironment -if: '(production == true)';-> productionMode;

// OR conditions
checkEnvironment -if: '(debug == true || enableFeatureX == true)';-> featureEnabled;

// NOT conditions
checkEnvironment -unless: '(production == true)';-> debugMode;

// Example 4: Error Handling with Built-in Variables
task riskyOperation "Risky Operation";
task errorHandler "Error Handler";
task retry "Retry Logic";
state errorState "Error State";
state success "Success";

riskyOperation -> success;

// Using built-in errorCount variable
riskyOperation -if: '(errorCount > 0)';-> errorHandler;
errorHandler -if: '(errorCount < 3)';-> retry;
errorHandler -if: '(errorCount >= 3)';-> errorState;

// Example 5: Complex Nested Conditions
context retryConfig {
    maxRetries<number>: 3;
    currentRetries<number>: 0;
    circuitState<string>: "CLOSED";
    timeoutMs<number>: 5000;
}

task apiCall "API Call";
task retryHandler "Retry Handler";
state circuitOpen "Circuit Open";
state failed "Failed";

start -> apiCall;

// Complex condition with multiple clauses
apiCall -if: '(currentRetries < maxRetries && circuitState == "CLOSED" && errorCount < 5)';-> retryHandler;
apiCall -if: '(currentRetries >= maxRetries || errorCount >= 5)';-> failed;
apiCall -if: '(circuitState == "OPEN")';-> circuitOpen;

// Parenthesized complex conditions
retryHandler -if: '((currentRetries < maxRetries) && (circuitState == "CLOSED"))';-> apiCall;
retryHandler -if: '((errorCount > 3) || (currentRetries >= maxRetries))';-> failed;

// Example 6: Template Variable Syntax
context userData {
    name<string>: "john";
    age<number>: 25;
    verified<boolean>: true;
}

task processUser "Process User";
state adult "Adult User";
state minor "Minor User";
state verified "Verified User";

start -> processUser;

// Using template variable syntax (automatically converted to CEL)
processUser -if: '({{ userData.age }} >= 18)';-> adult;
processUser -if: '({{ userData.age }} < 18)';-> minor;
processUser -if: '({{ userData.verified }} == true)';-> verified;

// Template variables with complex conditions
processUser -if: '({{ userData.age }} >= 18 && {{ userData.verified }} == true)';-> verified;

// Example 7: Nested Attribute Access
context system {
    database {
        connected<boolean>: true;
        latency<number>: 50;
    };
    cache {
        enabled<boolean>: true;
        hitRate<number>: 85;
    };
}

task systemCheck "System Check";
state healthy "System Healthy";
state degraded "System Degraded";

start -> systemCheck;

// Accessing nested attributes
systemCheck -if: '(database.connected == true && database.latency < 100)';-> healthy;
systemCheck -if: '(cache.enabled == true && cache.hitRate > 80)';-> healthy;
systemCheck -if: '(database.latency >= 100 || cache.hitRate <= 80)';-> degraded;

// Example 8: Real-World Pattern - Circuit Breaker
context circuitBreaker {
    failureCount<number>: 0;
    threshold<number>: 5;
    state<string>: "CLOSED";
    lastFailureTime<number>: 0;
    timeout<number>: 30000;
}

task protectedOperation "Protected Operation";
state circuitBreakerOpen "Circuit Breaker Open";
task waitForTimeout "Wait for Timeout";
state halfOpen "Half Open";

start -> protectedOperation;

// Circuit breaker logic
protectedOperation -if: '(failureCount < threshold && circuitBreaker.state == "CLOSED")';-> success;
protectedOperation -if: '(failureCount >= threshold)';-> circuitBreakerOpen;
circuitBreakerOpen -> waitForTimeout;
waitForTimeout -if: '(circuitBreaker.state == "HALF_OPEN")';-> protectedOperation;

note validateUser "CEL (Common Expression Language) provides safe, sandboxed expression evaluation.
No access to JavaScript globals or functions - secure by design."

note apiCall "Operators:
- Equality: == (not ===)
- Inequality: != (not !==)
- Comparison: <, >, <=, >=
- Logical: &&, ||, !
- Parentheses: () for grouping"

note checkEnvironment "Best practices:
1. Keep conditions simple and readable
2. Use parentheses for clarity
3. Leverage context nodes for configuration
4. Test edge cases thoroughly"

```

### `optional-types.dygram`
Optional types and null handling:
- Optional type syntax with `?` suffix
- Null value handling
- Optional vs required fields
- Optional relationships
- Optional generic types
- Null coalescing patterns
- Type inference with optionals

Optional Types and Null Handling

```dy examples/advanced/optional-types.dygram
machine "Optional Types and Null Handling"

// This example demonstrates optional types and null value handling in DyGram

// Pattern 1: Optional Attributes with ?
task userProfile "User Profile" {
    // Required fields
    userId<string>: "user123";
    email<string>: "user@example.com";

    // Optional fields (may be null)
    phoneNumber<string?>: null;
    avatar<string?>: null;
    bio<string?>: null;

    // Optional with default value
    preferredLanguage<string?>: "en";
}

// Pattern 2: Optional References
context optionalConfig "Optional Configuration" {
    // Some configs may not be set
    debugMode<boolean?>: null;
    customTheme<string?>: null;
    apiEndpoint<string>: "https://api.example.com";  // Required
}

task appInit "Application Initialization" {
    prompt: "Initialize app with config: {{optionalConfig.apiEndpoint}}";
}

appInit --> optionalConfig;

// Pattern 3: Null Coalescing in Logic
task dataProcessor "Data Processor" {
    prompt: "Process with timeout: {{config.timeout}} or use default";
}

context config {
    timeout<number?>: null;  // Optional, may use default
    maxRetries<number>: 3;   // Required
}

dataProcessor --> config;

// Pattern 4: Optional Relationships
task Order "Order";
task Discount "Discount" {
    code<string>: "SAVE10";
    percentage<number>: 10;
}

// Order may or may not have a discount
Order "1" -> "0..1" Discount;  // Zero or one discount

// Pattern 5: Optional vs Required in Complex Types
task apiResponse "API Response" {
    // Required response fields
    statusCode<number>: 200;
    timestamp<number>: 1633024800;

    // Optional data (may be null on error)
    data<object?>: null;

    // Optional error information (present only on failure)
    errorCode<string?>: null;
    errorMessage<string?>: null;
    stackTrace<string?>: null;
}

// Pattern 6: Optional Generic Types
task asyncOperation "Async Operation" {
    // May return a result or null
    result<Promise<string>?>: null;
    error<Promise<Error>?>: null;
}

// Pattern 7: Handling Optional Values in Workflow
init start "Start";
task fetchUserData "Fetch User Data" {
    userData<object?>: null;
}
state dataPresent "Data Present";
state dataAbsent "Data Absent";
task useDefaultData "Use Default Data" {
    defaultData<object>: "{}";
}
task processData "Process Data";
state complete "Complete";

start -> fetchUserData;
fetchUserData -"data != null"-> dataPresent;
fetchUserData -"data == null"-> dataAbsent;
dataPresent -> processData;
dataAbsent -> useDefaultData;
useDefaultData -> processData;
processData -> complete;

// Pattern 8: Optional Collections
task searchResults "Search Results" {
    // Optional array (may be null if search fails)
    items<Array<string>?>: null;

    // Optional count (null if not applicable)
    totalCount<number?>: null;

    // Required metadata
    searchTerm<string>: "example";
    executionTime<number>: 0;
}

// Pattern 9: Optional with Type Inference
task inferredOptionals "Inferred Optionals" {
    // Type checker infers these are optional based on null value
    maybeString: null;
    maybeNumber: null;
    maybeBoolean: null;
}

// Pattern 10: Combining Required and Optional in Validation
task formValidation "Form Validation" {
    // Required fields for validation
    username<string>: "";
    email<string>: "";

    // Optional fields
    middleName<string?>: null;
    suffix<string?>: null;

    // Validation state
    isValid<boolean>: false;
    errors<Array<string>>: [];
}

// Pattern 11: Optional in Annotations
task cacheable "Cacheable Task" {
    // Cache may or may not exist
    cacheKey<string?>: null;
    cachedValue<object?>: null;
    cacheExpiry<number?>: null;
}

// Pattern 12: Optional Context References
context userPreferences {
    theme<string?>: null;
    fontSize<number?>: null;
    notifications<boolean?>: null;
}

task applyPreferences "Apply Preferences" {
    prompt: "Apply theme {{userPreferences.theme}} if set, otherwise use default";
}

applyPreferences --> userPreferences;

note userProfile "Optional types use ? suffix.
They can be null or have a value.
Type checker validates both cases."

note fetchUserData "When working with optional data:
1. Always check for null before using
2. Provide fallback/default values
3. Handle both present and absent cases
4. Document when null is expected"

note formValidation "Required vs Optional guidelines:
- Required: Must always have a valid value
- Optional: May be null, needs null checks
- Use optionals for: partial data, user input, API responses
- Avoid optionals for: core business logic, critical paths"

```


### `dependency-inference.dygram`

Dependency Inference Examples

```dy examples/advanced/dependency-inference.dygram
machine "Dependency Inference Examples"

// Configuration contexts
context apiConfig {
    baseUrl<string>: "https://api.example.com";
    apiKey<string>: "secret123";
    timeout<number>: 5000;
    retries<number>: 3;
}

context dbConfig {
    host<string>: "localhost";
    port<number>: 5432;
    database<string>: "myapp";
}

// Task that uses API configuration
task fetchUserData {
    prompt: "Fetch user data from {{ apiConfig.baseUrl }}/users with API key {{ apiConfig.apiKey }}";
    timeout: 10000;
}

// Task that uses database configuration
task saveUserData {
    prompt: "Save user data to {{ dbConfig.database }} at {{ dbConfig.host }}:{{ dbConfig.port }}";
}

// Task that references another task
task processUserData {
    prompt: "Process the data fetched by {{ fetchUserData.prompt }} and prepare for {{ saveUserData.prompt }}";
}

// Workflow edges
fetchUserData -> processUserData;
processUserData -> saveUserData;

// DyGram will automatically infer these dependencies:
// fetchUserData ..> apiConfig : reads prompt
// saveUserData ..> dbConfig : reads prompt
// processUserData ..> fetchUserData : reads prompt
// processUserData ..> saveUserData : reads prompt

// Another example with nested references
context emailConfig {
    smtpHost<string>: "smtp.example.com";
    smtpPort<number>: 587;
    fromEmail<string>: "noreply@example.com";
}

task sendNotification {
    prompt: "Send email notification from {{ emailConfig.fromEmail }} via {{ emailConfig.smtpHost }}:{{ emailConfig.smtpPort }}";
}

// Connect notification to workflow
processUserData -> sendNotification;

// Inferred: sendNotification ..> emailConfig : reads prompt

// Complex example with multiple references
context appConfig {
    appName<string>: "MyApp";
    version<string>: "1.0.0";
    environment<string>: "production";
}

task logOperation {
    prompt: "Log operation in {{ appConfig.appName }} v{{ appConfig.version }} ({{ appConfig.environment }})";
}

// Logging attached to multiple points
fetchUserData -> logOperation;
processUserData -> logOperation;
saveUserData -> logOperation;

// Inferred: logOperation ..> appConfig : reads prompt (from multiple attributes)

```


## Key Concepts



### Annotations

Annotations provide metadata about nodes:


### Multiplicity

Express quantitative relationships:


### Dependency Inference

Template variables automatically create dependencies:


### Optional Types

Use `?` suffix for nullable types:


## Usage

These examples demonstrate:
- **Expressive relationships** - Clear semantic meaning
- **Type safety** - Optional and required types
- **Error resilience** - Comprehensive error handling
- **Metadata** - Rich annotations and documentation
- **Validation** - Compile-time checks

## See Also

- [Advanced Features](../../docs/advanced-features.md) - Complete documentation
- [Syntax Guide](../../docs/syntax-guide.md) - Syntax reference
- [Examples Index](../../docs/examples-index.md) - All examples
