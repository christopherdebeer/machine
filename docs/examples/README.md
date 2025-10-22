# DyGram Examples

Practical examples organized by use case and domain.

## Table of Contents

## Basic Examples

### Hello World

The simplest possible machine:

```dygram examples/basic/hello.dygram
machine "Hello World"

Task greet {
    prompt: "Say hello to the world";
};
```

### Simple Workflow

A basic linear workflow:

```dygram examples/basic/workflow.dygram
machine "Simple Workflow"

Task start "Initialize";
Task process "Process data";
Task complete "Finalize";

start -> process -> complete;
```

### Nodes with Attributes

Adding configuration to nodes:

```dygram examples/basic/attributes.dygram
machine "Configured Tasks"

Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 2048;
    prompt: "Analyze the input data";
};

Input data {
    format: "json";
    schema: #inputSchema;
};

data -> analyze;
```

## Workflow Examples

### Branching Workflow

Multiple paths based on conditions:

```dygram examples/workflows/branching.dygram
machine "Conditional Workflow"

Task evaluate "Evaluate condition";
Task pathA "Process path A";
Task pathB "Process path B";
Task merge "Merge results";

evaluate -> pathA, pathB;
pathA -> merge;
pathB -> merge;
```

### Sequential Processing

Data processing pipeline:

```dygram examples/workflows/pipeline.dygram
machine "Data Pipeline"

Task fetch "Fetch data" {
    source: "api";
    endpoint: "https://api.example.com/data";
};

Task transform "Transform data" {
    operations: ["filter", "map", "reduce"];
};

Task validate "Validate results" {
    schema: #validationSchema;
};

Task store "Store results" {
    destination: "database";
};

fetch -> transform -> validate -> store;
```

### Parallel Execution

Tasks that run concurrently:

```dygram examples/workflows/parallel.dygram
machine "Parallel Processing"

Task source "Data source";

Task processA "Process A" @Async;
Task processB "Process B" @Async;
Task processC "Process C" @Async;

Task aggregate "Aggregate results";

source -> processA, processB, processC;
processA -> aggregate;
processB -> aggregate;
processC -> aggregate;
```

## State Machine Examples

### Simple State Machine

Basic state transitions:

```dygram examples/state-machines/simple.dygram
machine "Traffic Light"

State red "Red Light";
State yellow "Yellow Light";
State green "Green Light";

red -30s-> green;
green -25s-> yellow;
yellow -5s-> red;
```

### Stateful Workflow

Combining tasks and states:

```dygram examples/state-machines/stateful-workflow.dygram
machine "Order Processing"

State pending "Order Pending";
State processing "Processing Order";
State shipped "Order Shipped";
State delivered "Order Delivered";

Task validate "Validate order";
Task prepare "Prepare shipment";
Task ship "Ship order";

pending -> validate -> processing;
processing -> prepare -> shipped;
shipped -> ship -> delivered;
```

## LLM Integration Examples

### Basic LLM Task

Simple LLM-powered task:

```dygram examples/llm/basic-task.dygram
machine "Text Analysis"

Context config {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
};

Task analyze {
    prompt: "Analyze the sentiment of the following text: {{ input.text }}";
};

Input input {
    text: "I love this product!";
};

Output result {
    sentiment: "TBD";
    confidence: 0.0;
};

input -> analyze -> result;
```

### Multi-Step Analysis

Chain of LLM tasks:

```dygram examples/llm/multi-step.dygram
machine "Document Processing"

Task extract {
    prompt: "Extract key entities from: {{ document }}";
};

Task classify {
    prompt: "Classify the document based on entities: {{ extract.result }}";
};

Task summarize {
    prompt: "Summarize the document: {{ document }}";
};

Task combine {
    prompt: "Combine classification and summary: {{ classify.result }} + {{ summarize.result }}";
};

extract -> combine;
classify -> combine;
summarize -> combine;
```

## Advanced Features

### Nested Structures

Hierarchical node organization:

```dygram examples/advanced/nesting.dygram
machine "Project Management"

Process development {
    Task design "Design system";
    Task implement "Implement features";
    Task test "Run tests";

    design -> implement -> test;
};

Process deployment {
    Task build "Build artifacts";
    Task stage "Deploy to staging";
    Task prod "Deploy to production";

    build -> stage -> prod;
};

development -> deployment;
```

### Generic Types

Type-safe attributes:

```dygram examples/advanced/generics.dygram
machine "Type Safe Machine"

Context config {
    endpoints<Array<string>>: ["api1.com", "api2.com"];
    retryPolicy<Map<string, number>>: #retryMap;
    results<Promise<Result>>: #pending;
};
```

### Annotations

Metadata and documentation:

```dygram examples/advanced/annotations.dygram
machine "Annotated System" @Version("2.0") @Critical

Task important @Critical @Async {
    priority<number>: 10;
};

Resource legacy @Deprecated("Use newResource instead");

Task experimental @Beta @Unstable;
```

### Documentation Notes

Inline documentation:

```dygram examples/advanced/notes.dygram
machine "Documented System"

Task process;

note process "This task processes incoming requests" @Documentation {
    complexity: "O(n)";
    author: "Team A";
    updated: "2024-01-15";
};
```

### Multiple Arrow Types

Semantic relationships:

```dygram examples/advanced/arrows.dygram
machine "Relationship Types"

// Inheritance
Child <|-- Parent;

// Composition
Container *--> Component;

// Aggregation
Team o--> Member;

// Bidirectional
ClientA <--> Server;

// Transformations
Input => Process => Output;

// Dependencies
ServiceA --> ServiceB;
```

## Domain-Specific Examples

### API Workflow

RESTful API processing:

```dygram examples/domains/api-workflow.dygram
machine "API Handler"

Task authenticate {
    method: "POST";
    endpoint: "/auth";
};

Task validate {
    schema: #requestSchema;
};

Task process {
    handler: #businessLogic;
};

Task respond {
    format: "json";
    status: 200;
};

authenticate -> validate -> process -> respond;
```

### Data Processing

ETL pipeline:

```dygram examples/domains/etl.dygram
machine "ETL Pipeline"

Task extract {
    sources: ["database", "api", "file"];
};

Task transform {
    operations: ["clean", "normalize", "enrich"];
};

Task load {
    destination: "data_warehouse";
    mode: "append";
};

extract -> transform -> load;
```

### Testing Workflow

Automated testing:

```dygram examples/domains/testing.dygram
machine "Test Suite"

Task setup "Setup test environment";
Task unit "Run unit tests";
Task integration "Run integration tests";
Task e2e "Run E2E tests";
Task report "Generate report";

setup -> unit, integration, e2e;
unit -> report;
integration -> report;
e2e -> report;
```

## Running Examples

### Using CLI

```bash
# Validate example
dygram parseAndValidate examples/basic/hello.dygram

# Generate JSON
dygram generate examples/basic/hello.dygram

# Generate visualization
dygram generate examples/workflows/pipeline.dygram --format html

# Execute with LLM
export ANTHROPIC_API_KEY=your_key
dygram execute examples/llm/basic-task.dygram
```

### Using API

```typescript
import { createMachineServices, generateJSON } from 'dygram';
import { NodeFileSystem } from 'langium/node';

const services = createMachineServices(NodeFileSystem).Machine;
const machine = await extractAstNode('examples/basic/hello.dygram', services);
const result = generateJSON(machine, 'hello.dygram');
console.log(result.content);
```

## Example Categories

### By Complexity

- **Beginner**: hello.dygram, workflow.dygram, attributes.dygram
- **Intermediate**: branching.dygram, pipeline.dygram, simple-state-machine.dygram
- **Advanced**: nesting.dygram, annotations.dygram, multi-step-llm.dygram

### By Use Case

- **Workflows**: Linear, branching, parallel processing
- **State Machines**: Simple states, stateful workflows
- **LLM Integration**: Single tasks, multi-step analysis
- **Data Processing**: ETL, validation, transformation

### By Feature

- **Attributes**: Type annotations, configuration
- **Annotations**: Metadata, deprecation, criticality
- **Nesting**: Hierarchical structures
- **Arrows**: Different relationship types
- **Notes**: Documentation

## Contributing Examples

To add a new example:

1. Create a `.dygram` file in the appropriate subdirectory
2. Add code block to this README with path: ` ```dygram examples/path/to/file.dygram`
3. Run `npm run extract:examples` to extract to example files
4. Test with: `dygram generate examples/path/to/file.dygram`

## Next Steps

- **[Syntax Reference](../syntax/README.md)** - Learn syntax details
- **[CLI Reference](../cli/README.md)** - Command-line usage
- **[API Reference](../api/README.md)** - Programmatic integration

---

**Note**: Examples are automatically extracted from documentation using `npm run extract:examples`
