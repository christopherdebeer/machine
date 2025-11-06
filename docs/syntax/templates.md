# Template Strings

Template strings allow you to reference dynamic values from context nodes, other task nodes, or runtime variables using `{{ }}` placeholder syntax.

## Basic Syntax

Template strings use double curly braces to mark placeholders:

```dy
prompt: "Use {{ variableName }}";
```

### Simple Variable Reference

```dy
Context config {
    apiUrl: "https://api.example.com";
};

Task apiCall {
    endpoint: "{{ config.apiUrl }}";
};
```

### Multiple Placeholders

A single string can contain multiple template placeholders:

```dy
Context apiConfig {
    baseUrl: "https://api.example.com";
};

Context dbConfig {
    host: "localhost";
};

Task setup {
    prompt: "API: {{ apiConfig.baseUrl }}, DB: {{ dbConfig.host }}";
};
```

## Context References

Reference attributes from context nodes:

```dy
Context config {
    apiKey: "secret";
    timeout: 30;
};

Task authenticate {
    prompt: "Authenticate with key {{ config.apiKey }} and timeout {{ config.timeout }}";
};
```

## Task References

Reference attributes from other tasks:

```dy
Task taskA {
    prompt: "Generate a summary";
};

Task taskB {
    prompt: "Use result from {{ taskA.prompt }}";
};
```

## Node Self-Reference

Tasks can reference their own attributes:

```dy
Task myTask {
    name: "ProcessData";
    prompt: "I am {{ myTask.name }}";
};
```

## Nested Attribute Access

Access nested attributes using dot notation:

```dy
Context config {
    nested: #complexObject;
};

Task processor {
    prompt: "Use {{ config.nested }}";
};
```

Note: Nested object access depends on the structure of external references (#) resolved at runtime.

## Where Templates Work

### In String Attributes

```dy
Task myTask {
    endpoint: "{{ config.url }}";
    description: "Config is at {{ config.key }}";
};
```

### In Prompts

```dy
Task llmTask {
    prompt: "Analyze: {{ userRequest.query }}";
};
```

### In Titles

```dy
Task process "Processing {{ context.itemName }}";
```

## Runtime Evaluation

Template strings are evaluated at runtime, not at parse time. This means:

- Values are resolved when the machine executes
- References must point to valid nodes and attributes
- Missing references may cause runtime errors (depending on executor configuration)

## Validation

### Valid References

```dy
Context config {
    value: "test";
};

Task taskA {
    prompt: "Use {{ config.value }}";  // ✅ Valid
};
```

### Multiple Tasks Referencing Same Context

```dy
Context config {
    value: "shared";
};

Task taskA {
    prompt: "Use {{ config.value }}";  // ✅ Valid
};

Task taskB {
    prompt: "Also use {{ config.value }}";  // ✅ Valid
};
```

## Best Practices

### Use Context for Configuration

```dy
// ✅ Good - centralized configuration
Context appConfig {
    apiUrl: "https://api.example.com";
    apiKey: #envApiKey;
    timeout<Duration>: "PT30S";
};

Task fetchData {
    endpoint: "{{ appConfig.apiUrl }}";
    auth: "Bearer {{ appConfig.apiKey }}";
    timeout: "{{ appConfig.timeout }}";
};
```

### Reference Task Outputs

```dy
// ✅ Good - task pipeline with data flow
Task analyze {
    prompt: "Analyze the data and extract key points";
};

Task summarize {
    prompt: "Summarize based on: {{ analyze.prompt }}";
};

Task report {
    prompt: "Create report using summary: {{ summarize.prompt }}";
};

analyze -> summarize -> report;
```

### Keep Templates Readable

```dy
// ✅ Good - clear and concise
prompt: "API: {{ config.url }}, Key: {{ config.key }}";

// ❌ Avoid - too complex
prompt: "Connect to {{ config.protocol }}://{{ config.host }}:{{ config.port }}/{{ config.path }}?key={{ config.apiKey }}&timeout={{ config.timeout }}&retry={{ config.retries }}";
```

### Validate References

Ensure referenced nodes and attributes exist:

```dy
// ✅ Good - config.url exists
Context config {
    url: "https://api.example.com";
};

Task fetch {
    endpoint: "{{ config.url }}";
};

// ❌ Bad - config.endpoint doesn't exist
Task fetch {
    endpoint: "{{ config.endpoint }}";  // Runtime error
};
```

## Advanced Patterns

### Configuration Inheritance

```dy
Context defaults {
    timeout<Duration>: "PT30S";
    retries<Integer>: 3;
};

Context production {
    timeout<Duration>: "PT60S";  // Override default
};

Task apiCall {
    // Use production override or default
    timeout: "{{ production.timeout }}";
};
```

### Multi-Stage Pipelines

```dy
Context userRequest {
    query: "What is machine learning?";
};

Task research {
    prompt: "Research: {{ userRequest.query }}";
};

Task synthesize {
    prompt: "Synthesize findings from: {{ research.prompt }}";
};

Task format {
    prompt: "Format final answer based on: {{ synthesize.prompt }}";
};

research -> synthesize -> format;
```

### Environment-Specific Configuration

```dy
Context environment {
    name: "production";
    apiUrl: #productionApiUrl;  // External reference
    debugMode: false;
};

Task startup {
    prompt: "Starting in {{ environment.name }} mode with API {{ environment.apiUrl }}";
};
```

## Type Checking

Template strings are treated as strings in the type system:

```dy
Context config {
    port<Integer>: 8080;
};

Task server {
    // Template result is always a string
    endpoint<string>: "{{ config.port }}";  // "8080" as string
};
```

For type-safe runtime evaluation, use CEL expressions or custom validators.

## Limitations

### No Expressions

Template strings do not support expressions or logic:

```dy
// ❌ Not supported - no arithmetic
value: "{{ config.count + 1 }}";

// ❌ Not supported - no conditionals
value: "{{ config.enabled ? 'yes' : 'no' }}";

// ✅ Use external references for complex logic
value: #computedValue;
```

### No Nested Templates

Template placeholders cannot contain other templates:

```dy
// ❌ Not supported - nested templates
value: "{{ {{ config.keyName }} }}";
```

### Static Parsing

Templates are parsed as static strings. Dynamic template generation is not supported:

```dy
// ❌ Not supported - dynamic template construction
template: "{{ config.";  // Invalid
```

## Examples

### Simple Configuration Reference

```dy
Context config {
    apiUrl: "https://api.example.com";
};

Task apiCall {
    endpoint: "{{ config.apiUrl }}";
};
```

### Multi-Context Usage

```dy
Context apiConfig {
    baseUrl: "https://api.example.com";
    version: "v1";
};

Context authConfig {
    token: #envToken;
};

Task makeRequest {
    url: "{{ apiConfig.baseUrl }}/{{ apiConfig.version }}/users";
    auth: "Bearer {{ authConfig.token }}";
};
```

### Task Pipeline

```dy
Context userRequest {
    query: "Explain quantum computing";
};

Task retrieve {
    prompt: "Find information about: {{ userRequest.query }}";
};

Task analyze {
    prompt: "Analyze the following information: {{ retrieve.prompt }}";
};

Task summarize {
    prompt: "Summarize this analysis: {{ analyze.prompt }}";
};

retrieve -> analyze -> summarize;
```

### Self-Reference

```dy
Task processor {
    name: "DataProcessor";
    type: "transformer";
    prompt: "I am {{ processor.name }} of type {{ processor.type }}";
};
```

### Complex Workflow

```dy
machine "LLM Processing Pipeline"

Context llmConfig {
    model: "claude-3-5-sonnet-20241022";
    temperature<Float>: 0.7;
    maxTokens<Integer>: 4096;
};

Context userInput {
    question: #userQuestion;
    context: #conversationHistory;
};

Task analyze {
    model: "{{ llmConfig.model }}";
    temperature: "{{ llmConfig.temperature }}";
    prompt: "Analyze this question: {{ userInput.question }}\nContext: {{ userInput.context }}";
};

Task enhance {
    model: "{{ llmConfig.model }}";
    prompt: "Enhance the analysis: {{ analyze.prompt }}";
};

Task format {
    prompt: "Format the final response based on: {{ enhance.prompt }}";
};

analyze -> enhance -> format;
```

## See Also

- [Attributes](attributes.md) - Attribute syntax and types
- [Nodes](nodes.md) - Context and task nodes
- [Types](types.md) - Type system for attributes
- [Identifiers](identifiers.md) - Naming rules for references
