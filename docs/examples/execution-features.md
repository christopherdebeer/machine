# Execution Features: Context, Templates, and Meta-Tools

This document demonstrates advanced execution features of DyGram: context manipulation, template interpolation, meta-tool usage, and dynamic code generation. These examples are designed to be executed in interactive mode to showcase real runtime capabilities.

## Table of Contents

- [Context Management](#context-management)
- [Template Interpolation](#template-interpolation)
- [Meta-Tools for Dynamic Behavior](#meta-tools-for-dynamic-behavior)
- [Code Generation](#code-generation)

## Context Management

DyGram provides powerful context management for storing and sharing state across machine execution. Context can be read, written, and mutated during execution.

### Basic Context Getting and Setting

```dygram examples/execution-features/context-basic.dy
machine "Context Operations" {
  logLevel: "debug"
  maxSteps: 20
}

context UserProfile {
  userId: ""
  name: ""
  email: ""
  preferences: {}
}

context SessionData {
  loginTime: 0
  activityCount: 0
  lastAction: ""
}

start "Initialize user session" {
  prompt: "Set the UserProfile.userId to 'user-12345', UserProfile.name to 'Alice Johnson', and UserProfile.email to 'alice@example.com'. Then set SessionData.loginTime to current timestamp."
}

task updateActivity "Track user activity" {
  prompt: "Increment SessionData.activityCount by 1 and set SessionData.lastAction to 'profile_view'"
}

task displaySummary "Show session summary" {
  prompt: "Display all context values: UserProfile and SessionData"
}

end "Session tracking complete"

start -> updateActivity -> displaySummary -> end
```

**Expected behavior:**
- Context values are initialized and modified
- Context persists across node transitions
- Agent can read current context state
- Agent can update specific context fields

### Context with Complex Objects

```dygram examples/execution-features/context-complex.dy
machine "Shopping Cart" {
  logLevel: "debug"
  maxSteps: 30
}

context Cart {
  items: []
  total: 0
  discount: 0
  currency: "USD"
}

context User {
  id: ""
  loyaltyPoints: 0
  tier: "standard"
}

start "Initialize cart" {
  prompt: "Set User.id to 'customer-789', User.loyaltyPoints to 150, and User.tier to 'gold'. Initialize Cart.items as empty array."
}

task addItem "Add product to cart" {
  prompt: "Add an item to Cart.items: {productId: 'prod-001', name: 'Laptop', price: 999, quantity: 1}. Update Cart.total to 999."
}

task addSecondItem "Add another product" {
  prompt: "Add second item to Cart.items: {productId: 'prod-002', name: 'Mouse', price: 49, quantity: 2}. Update Cart.total to 1097 (999 + 49*2)."
}

task applyDiscount "Apply loyalty discount" {
  prompt: "Since User.tier is 'gold', apply 10% discount. Set Cart.discount to 109.7 (10% of 1097). Calculate final total."
}

task reviewOrder "Display final order" {
  prompt: "Display Cart.items array, Cart.total, Cart.discount, final amount, and User.tier status"
}

end "Order ready for checkout"

start -> addItem -> addSecondItem -> applyDiscount -> reviewOrder -> end
```

**Expected behavior:**
- Context supports complex nested objects
- Array manipulation within context
- Calculations based on context values
- Multi-context coordination (Cart + User)

## Template Interpolation

Templates allow dynamic prompts and descriptions using context values. This enables data-driven workflows.

### Simple Template Substitution

```dygram examples/execution-features/template-simple.dy
machine "Personalized Workflow" {
  logLevel: "debug"
  maxSteps: 15
}

context Request {
  userName: "Alex"
  reportType: "monthly"
  department: "Engineering"
}

start "Generate report for {{ Request.userName }}" {
  prompt: "You are generating a {{ Request.reportType }} report for {{ Request.userName }} in the {{ Request.department }} department. Confirm the details."
}

task fetchData "Fetch {{ Request.reportType }} data for {{ Request.department }}" {
  prompt: "Retrieve {{ Request.reportType }} data specifically for the {{ Request.department }} department"
}

task compileReport "Compile {{ Request.reportType }} report" {
  prompt: "Compile the {{ Request.reportType }} report for {{ Request.userName }} using the fetched data"
}

end "Report for {{ Request.userName }} complete"

start -> fetchData -> compileReport -> end
```

**Expected behavior:**
- Templates interpolate context values into prompts
- Node titles use template syntax
- Descriptions dynamically reflect context state

### Conditional Templates with Expressions

```dygram examples/execution-features/template-conditional.dy
machine "Smart Notification System" {
  logLevel: "debug"
  maxSteps: 20
}

context Alert {
  severity: "high"
  count: 5
  service: "payment-api"
  threshold: 3
}

context Response {
  action: ""
  escalated: false
}

start "Alert detected: {{ Alert.count }} failures in {{ Alert.service }}" {
  prompt: "Alert severity is {{ Alert.severity }} with {{ Alert.count }} failures. Threshold is {{ Alert.threshold }}. Analyze if escalation is needed."
}

task evaluateSeverity "Evaluate alert severity" {
  prompt: "Check if Alert.count ({{ Alert.count }}) exceeds Alert.threshold ({{ Alert.threshold }}). Set Response.escalated to true if it does."
}

task respondToAlert "Respond to {{ Alert.severity }} severity alert" {
  prompt: "Based on Alert.severity being {{ Alert.severity }} and Response.escalated status, determine appropriate action and set Response.action (options: 'auto-heal', 'notify-team', 'escalate-oncall')"
}

task executeAction "Execute action: {{ Response.action }}" {
  prompt: "Execute the {{ Response.action }} action for service {{ Alert.service }}"
}

end "Alert handled"

start -> evaluateSeverity -> respondToAlert -> executeAction -> end
```

**Expected behavior:**
- Templates include calculations/comparisons
- Context drives conditional logic
- Dynamic action selection based on context
- Template expressions reference multiple context fields

## Meta-Tools for Dynamic Behavior

Meta-tools enable agents to modify machines, construct new tools, and adapt behavior at runtime.

### Machine Introspection and Modification

```dygram examples/execution-features/meta-introspection.dy
machine "Self-Modifying Workflow" {
  logLevel: "debug"
  maxSteps: 25
}

context Analysis {
  complexity: ""
  requiresValidation: false
  stepsNeeded: 0
}

start "Analyze requirements" {
  prompt: "Analyze the task complexity. Set Analysis.complexity to 'simple', 'moderate', or 'complex'. Set Analysis.requiresValidation to true if complexity is not 'simple'. Set Analysis.stepsNeeded based on complexity (simple=2, moderate=4, complex=6)."
}

task decidePath "Determine execution path" {
  prompt: "Use get_machine_definition meta-tool to inspect the current machine structure. Based on Analysis.complexity, decide if the current machine structure is sufficient or if you need to add validation steps."
}

task potentiallyModify "Modify machine if needed" {
  prompt: "If Analysis.requiresValidation is true and current machine lacks validation nodes, use update_definition meta-tool to add a validation node between current node and end. Otherwise, proceed directly."
}

end "Workflow complete"

start -> decidePath -> potentiallyModify -> end
```

**Expected behavior:**
- Agent uses `get_machine_definition` to inspect structure
- Agent analyzes whether modifications are needed
- Agent uses `update_definition` to modify machine
- Modified machine reflects changes in subsequent execution

### Dynamic Tool Construction

```dygram examples/execution-features/meta-construct-tool.dy
machine "Dynamic Tool Builder" {
  logLevel: "debug"
  maxSteps: 20
}

context Requirements {
  needsCustomTool: false
  toolName: ""
  toolPurpose: ""
}

start "Assess capabilities" {
  prompt: "Use list_available_tools meta-tool to see what tools exist. Determine if you need a custom tool for calculating Fibonacci numbers. Set Requirements.needsCustomTool to true if fibonacci tool doesn't exist."
}

task buildTool "Construct fibonacci tool if needed" {
  prompt: "If Requirements.needsCustomTool is true, use construct_tool meta-tool to create a fibonacci calculator tool with code_generation strategy. The implementation should be JavaScript code that calculates fibonacci(n). Set Requirements.toolName to the created tool name."
}

task useTool "Use the fibonacci tool" {
  prompt: "Use the fibonacci tool (either existing or newly created) to calculate fibonacci(10). Display the result."
}

end "Tool construction demo complete"

start -> buildTool -> useTool -> end
```

**Expected behavior:**
- Agent inspects available tools
- Agent identifies missing capability
- Agent constructs new tool dynamically
- Agent uses newly constructed tool
- Tool persists for remainder of execution

### Tool Review and Improvement

```dygram examples/execution-features/meta-improve-tool.dy
machine "Tool Quality Improvement" {
  logLevel: "debug"
  maxSteps: 30
}

context Evaluation {
  toolName: ""
  issues: []
  improvements: []
}

start "Identify target tool" {
  prompt: "Use list_available_tools meta-tool with include_source=true. Pick a tool that could be improved (e.g., one with unclear description or missing error handling). Set Evaluation.toolName to its name."
}

task analyzeToolQuality "Analyze tool implementation" {
  prompt: "Review the implementation of tool {{ Evaluation.toolName }}. Identify issues: unclear description, missing input validation, poor error handling, inefficient logic. Store issues in Evaluation.issues array."
}

task proposeImprovements "Generate improvement proposal" {
  prompt: "Based on Evaluation.issues, use propose_tool_improvement meta-tool to suggest concrete improvements for {{ Evaluation.toolName }}. Include specific code changes or description improvements."
}

task reviewProposal "Review improvement proposal" {
  prompt: "Display the proposed improvements for {{ Evaluation.toolName }} and explain their benefits."
}

end "Tool improvement proposed"

start -> analyzeToolQuality -> proposeImprovements -> reviewProposal -> end
```

**Expected behavior:**
- Agent inspects existing tools and their implementation
- Agent identifies quality issues
- Agent proposes concrete improvements
- Proposals are tracked for later implementation

## Code Generation

DyGram can generate executable code based on specifications and context.

### Simple Code Generation

```dygram examples/execution-features/codegen-simple.dy
machine "API Client Generator" {
  logLevel: "debug"
  maxSteps: 20
}

context APISpec {
  baseUrl: "https://api.example.com"
  endpoint: "/users"
  method: "GET"
  authType: "bearer"
}

context Generated {
  code: ""
  language: "javascript"
}

start "Define API specification" {
  prompt: "Review APISpec context. Set APISpec.baseUrl to a real API you want to generate a client for (or use the default). Set APISpec.method and APISpec.endpoint appropriately."
}

task generateClient "Generate API client code" {
  prompt: "Generate {{ Generated.language }} code for an API client that calls {{ APISpec.method }} {{ APISpec.baseUrl }}{{ APISpec.endpoint }} with {{ APISpec.authType }} authentication. Store the generated code in Generated.code. Include error handling and proper async/await patterns."
}

task validateGenerated "Validate generated code" {
  prompt: "Review the code in Generated.code. Check for: 1) Proper error handling, 2) Correct HTTP method usage, 3) Authentication headers, 4) Async/await syntax. List any issues found."
}

task displayCode "Display generated code" {
  prompt: "Display the final generated code from Generated.code with syntax highlighting markers"
}

end "Code generation complete"

start -> generateClient -> validateGenerated -> displayCode -> end
```

**Expected behavior:**
- Agent generates syntactically valid code
- Code matches specification from context
- Generated code includes error handling
- Code is stored in context for inspection

### Test Generation

```dygram examples/execution-features/codegen-tests.dy
machine "Test Suite Generator" {
  logLevel: "debug"
  maxSteps: 25
}

context TargetFunction {
  name: "calculateDiscount"
  signature: "(price: number, discountPercent: number) => number"
  description: "Calculates discounted price given original price and discount percentage"
}

context TestSuite {
  framework: "vitest"
  testCases: []
  code: ""
}

start "Define function to test" {
  prompt: "Review TargetFunction context. This is the function we're generating tests for: {{ TargetFunction.name }} with signature {{ TargetFunction.signature }}."
}

task identifyTestCases "Identify test scenarios" {
  prompt: "For function {{ TargetFunction.name }}, identify comprehensive test cases covering: 1) Normal cases, 2) Edge cases (0, negative, 100%), 3) Invalid inputs. Store as array of objects in TestSuite.testCases with structure: {description, input, expected}."
}

task generateTests "Generate test code" {
  prompt: "Using {{ TestSuite.framework }}, generate a complete test suite for {{ TargetFunction.name }} covering all cases in TestSuite.testCases. Include proper imports, describe blocks, and assertions. Store in TestSuite.code."
}

task reviewCoverage "Review test coverage" {
  prompt: "Analyze TestSuite.testCases and TestSuite.code. Calculate coverage percentage for: 1) Normal paths, 2) Edge cases, 3) Error paths. List any missing scenarios."
}

end "Test suite ready"

start -> identifyTestCases -> generateTests -> reviewCoverage -> end
```

**Expected behavior:**
- Agent generates comprehensive test cases
- Generated tests use correct framework syntax
- Tests cover edge cases and error conditions
- Coverage analysis identifies gaps

### Schema-Driven Code Generation

```dygram examples/execution-features/codegen-schema.dy
machine "Database Model Generator" {
  logLevel: "debug"
  maxSteps: 30
}

context Schema {
  tableName: "users"
  fields: []
  relationships: []
}

context Output {
  orm: "prisma"
  modelCode: ""
  migrationCode: ""
  validationCode: ""
}

start "Define database schema" {
  prompt: "Define a schema for {{ Schema.tableName }} table. Add fields to Schema.fields array with structure: {name, type, required, unique, default}. Example: {name: 'email', type: 'string', required: true, unique: true}. Add at least 5 fields."
}

task generateModel "Generate ORM model" {
  prompt: "Generate {{ Output.orm }} model code for {{ Schema.tableName }} with all fields from Schema.fields. Include field decorators for validation, uniqueness, defaults. Store in Output.modelCode."
}

task generateMigration "Generate migration SQL" {
  prompt: "Generate SQL migration code to create {{ Schema.tableName }} table with all Schema.fields. Use proper PostgreSQL syntax with constraints. Store in Output.migrationCode."
}

task generateValidation "Generate validation schema" {
  prompt: "Generate Zod validation schema for {{ Schema.tableName }} matching all Schema.fields. Include type checking, required validation, and format validation where applicable. Store in Output.validationCode."
}

task verifyConsistency "Verify code consistency" {
  prompt: "Compare Output.modelCode, Output.migrationCode, and Output.validationCode. Ensure field names, types, and constraints are consistent across all three. List any inconsistencies."
}

end "Full model code generated"

start -> generateModel -> generateMigration -> generateValidation -> verifyConsistency -> end
```

**Expected behavior:**
- Agent generates model, migration, and validation code
- All generated artifacts are consistent
- Code follows framework conventions
- Proper types and constraints are included

## Advanced: Combining All Features

### Adaptive Workflow with Full Feature Integration

```dygram examples/execution-features/combined-advanced.dy
machine "Adaptive Data Processor" {
  logLevel: "debug"
  maxSteps: 50
}

context Input {
  dataType: ""
  format: ""
  sizeEstimate: 0
  validationRequired: false
}

context Processing {
  strategy: ""
  stepsCompleted: 0
  errors: []
  results: []
}

context Generated {
  validatorCode: ""
  transformerCode: ""
  toolsCreated: []
}

start "Analyze input data" {
  prompt: "Inspect the input data characteristics. Set Input.dataType (json/csv/xml), Input.format (structured/unstructured), Input.sizeEstimate (KB), and Input.validationRequired (true if complex validation needed)."
}

task determineStrategy "Determine processing strategy for {{ Input.dataType }}" {
  prompt: "Based on Input.dataType={{ Input.dataType }}, Input.sizeEstimate={{ Input.sizeEstimate }}KB, determine optimal processing strategy: 'stream', 'batch', or 'parallel'. Set Processing.strategy. Explain reasoning."
}

task checkToolAvailability "Check for {{ Input.dataType }} tools" {
  prompt: "Use list_available_tools meta-tool. Check if tools exist for: 1) {{ Input.dataType }} parsing, 2) {{ Input.dataType }} validation. Store findings."
}

task buildCustomTools "Build custom tools if needed" {
  prompt: "If no suitable {{ Input.dataType }} tools exist, use construct_tool meta-tool to create: 1) A parser tool (code_generation strategy), 2) A validator tool if Input.validationRequired=true. Add created tool names to Generated.toolsCreated array."
}

task generateValidator "Generate validation code for {{ Input.format }} data" {
  prompt: "Generate validation code for {{ Input.dataType }} data in {{ Input.format }} format. Include: 1) Schema validation, 2) Type checking, 3) Format verification. Store in Generated.validatorCode."
}

task generateTransformer "Generate transformer for {{ Processing.strategy }}" {
  prompt: "Generate data transformation code using {{ Processing.strategy }} strategy. Code should handle {{ Input.dataType }} input and output normalized JSON. Store in Generated.transformerCode."
}

task modifyWorkflow "Adapt workflow based on conditions" {
  prompt: "Use get_machine_definition meta-tool. If Input.validationRequired=true and no validation node exists after transformer, use update_definition to insert validation step. Update machine structure accordingly."
}

task processData "Process data using {{ Processing.strategy }}" {
  prompt: "Execute the {{ Processing.strategy }} processing strategy using Generated.transformerCode logic. Track progress in Processing.stepsCompleted. Handle any errors and store in Processing.errors array."
}

task validateResults "Validate processed results" {
  prompt: "Use Generated.validatorCode to validate processing results. Ensure all transformations are correct. Store validation results in Processing.results array."
}

task generateReport "Generate processing report" {
  prompt: "Create comprehensive report showing: 1) Input.dataType and Input.sizeEstimate, 2) Processing.strategy used, 3) Processing.stepsCompleted, 4) Generated.toolsCreated list, 5) Processing.errors if any, 6) Validation results. Display report."
}

end "Adaptive processing complete"

start -> determineStrategy -> checkToolAvailability -> buildCustomTools -> generateValidator -> generateTransformer -> modifyWorkflow -> processData -> validateResults -> generateReport -> end
```

**Expected behavior:**
- Machine adapts to input characteristics
- Tools are constructed dynamically if needed
- Code generation produces working validators/transformers
- Workflow self-modifies based on requirements
- Comprehensive use of context, templates, meta-tools, and code generation
- Final report demonstrates all features working together

## Summary

These examples demonstrate DyGram's advanced execution capabilities:

1. **Context Management**: Store, retrieve, and mutate state across execution
2. **Template Interpolation**: Dynamic prompts and descriptions using `{{ Context.field }}` syntax
3. **Meta-Tools**: Introspect, modify, and extend machine behavior at runtime
4. **Code Generation**: Generate executable code from specifications and context

All examples are designed to be run in interactive mode with a real LLM agent, demonstrating how DyGram enables sophisticated, adaptive workflows that go beyond simple state machines.
