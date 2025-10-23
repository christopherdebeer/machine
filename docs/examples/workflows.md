# Workflow Examples

Patterns for branching, sequential, and parallel execution.

## Branching Workflow

Multiple paths based on conditions:

```dygram
machine "Conditional Workflow"

Task evaluate "Evaluate condition";
Task pathA "Process path A";
Task pathB "Process path B";
Task merge "Merge results";

evaluate -> pathA, pathB;
pathA -> merge;
pathB -> merge;
```

Pattern notes:
- `evaluate -> pathA, pathB` creates edges to multiple targets
- Both paths converge at `merge`
- Useful for parallel processing or conditional execution

## Sequential Processing

Data processing pipeline:

```dygram
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

Pipeline characteristics:
- Linear flow: each step depends on the previous
- Attributes configure each step
- Schema references (`#validationSchema`) for validation

## Parallel Execution

Tasks that run concurrently:

```dygram
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

Parallel execution features:
- `@Async` annotation marks tasks for concurrent execution
- Fan-out: one source to multiple processors
- Fan-in: multiple sources to one aggregator
- All async tasks complete before aggregator runs

## Multi-Stage Pipeline

Complex pipeline with multiple stages:

```dygram
machine "Multi-Stage Pipeline"

// Stage 1: Collection
Task fetchAPI "Fetch from API" @Async;
Task fetchDB "Fetch from DB" @Async;
Task merge "Merge sources";

fetchAPI -> merge;
fetchDB -> merge;

// Stage 2: Processing
Task clean "Clean data";
Task enrich "Enrich data";

merge -> clean -> enrich;

// Stage 3: Distribution
Task toWarehouse "To data warehouse" @Async;
Task toCache "To cache" @Async;
Task toAPI "To API" @Async;

enrich -> toWarehouse, toCache, toAPI;
```

Multi-stage patterns:
- Parallel collection → sequential processing → parallel distribution
- Mix of sync and async operations
- Clear separation of stages with comments

## Conditional Branching with States

Workflow with state-based routing:

```dygram
machine "Conditional Processing"

Input request;
Task evaluate "Evaluate request";

State approved "Approved";
State rejected "Rejected";

Task processApproved "Process approved request";
Task handleRejection "Handle rejection";

Output result;

request -> evaluate;
evaluate -> approved, rejected;
approved -> processApproved -> result;
rejected -> handleRejection -> result;
```

State-based routing:
- `State` nodes represent decision points
- Different paths for different outcomes
- Both paths eventually reach the output

## Next Steps

- **[State Machines](./state-machines.md)** - More on state transitions
- **[LLM Integration](./llm-integration.md)** - Using LLMs in workflows
- **[Domain Examples](./domain-examples.md)** - Real-world applications
