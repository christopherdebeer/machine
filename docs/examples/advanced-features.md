# Advanced Features

Complex patterns including nesting, generics, annotations, and more.

## Nested Structures

Hierarchical node organization:

```dygram
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

Nesting benefits:
- Logical grouping of related nodes
- Namespace isolation
- Visual clustering in diagrams
- Hierarchical organization

## Deep Nesting with Qualified References

Multiple levels of nesting:

```dygram
machine "Enterprise System"

Process backend {
    Process api {
        Task authenticate "Auth";
        Task validate "Validate";
        Task process "Process";

        authenticate -> validate -> process;
    };

    Process database {
        Task read "Read DB";
        Task write "Write DB";

        read -> write;
    };

    api.process -> database.read;
};

Process frontend {
    Task render "Render UI";
    Task handleInput "Handle Input";

    render -> handleInput;
};

frontend.handleInput -> backend.api.authenticate;
backend.database.write -> frontend.render;
```

Deep nesting features:
- Multiple nesting levels: `backend.api.authenticate`
- Cross-namespace references
- Qualified edge syntax
- Maintains clear boundaries

## Generic Types

Type-safe attributes with generics:

```dygram
machine "Type Safe Machine"

Context config {
    endpoints<Array<string>>: ["api1.com", "api2.com", "api3.com"];
    retryPolicy<Map<string, number>>: #retryMap;
    results<Promise<Result>>: #pending;
    queue<List<Task>>: [];
    cache<Optional<Data>>: #none;
};

Task processor {
    inputs<Array<string>>: #dataArray;
    output<Promise<Response>>: #asyncResult;
};
```

Generic type syntax:
- `<Array<string>>` - Array of strings
- `<Map<string, number>>` - Map with string keys and number values
- `<Promise<Result>>` - Async result
- `<List<Task>>` - List of tasks
- `<Optional<Data>>` - Optional value
- Nested generics: `<Map<string, Array<number>>>`

## Annotations

Metadata and documentation with annotations:

```dygram
machine "Annotated System" @Version("2.0") @Critical @StrictMode

Task important @Critical @Async {
    priority<number>: 10;
    retries<number>: 3;
};

Task experimental @Beta @Unstable {
    prompt: "Experimental feature";
};

Resource legacy @Deprecated("Use newResource instead") {
    endpoint: "old-api.com";
};

Task scheduled @Cron("0 */6 * * *") {
    prompt: "Run every 6 hours";
};

State draft @Transient;
State persisted @Persistent;
```

Built-in annotations:
- `@Version(value)` - Version tracking
- `@Critical` - Mark critical components
- `@StrictMode` - Enable strict validation (see [Styling & Validation](./styling-and-validation.md))
- `@Async` - Async execution
- `@Beta` - Beta/experimental feature
- `@Unstable` - Unstable API
- `@Deprecated(message)` - Deprecation notice
- Custom annotations for metadata

## Documentation Notes

Inline documentation for nodes:

```dygram
machine "Documented System"

Task process {
    prompt: "Process data";
};

note process "This task processes incoming requests" @Documentation {
    complexity: "O(n)";
    author: "Team A";
    updated: "2024-01-15";
    rationale: "Optimized for throughput";
};

State active "Active State";

note active "Active processing state" {
    entry_conditions: "All prerequisites met";
    exit_conditions: "Processing complete or timeout";
    timeout<number>: 300;
};
```

Note features:
- Attach to any node: `note <nodeName>`
- Optional title string
- Annotations on notes
- Attributes for structured metadata
- Multiple notes per node (if needed)

## Multiple Arrow Types

Semantic relationships with different arrows:

```dygram
machine "Relationship Types"

// Standard flow
Task input "Input";
Task output "Output";
input -> output;

// Inheritance
Task parent "Parent Task";
Task child "Child Task";
child <|-- parent;

// Composition (strong ownership)
Task container "Container";
Task component "Component";
container *--> component;

// Aggregation (weak ownership)
Task team "Team";
Task member "Member";
team o--> member;

// Bidirectional
Task clientA "Client A";
Task server "Server";
clientA <--> server;

// Transformation/Data flow
Input data "Data";
Task transform "Transform";
Output result "Result";
data => transform => result;

// Dependencies (dashed)
Task serviceA "Service A";
Task serviceB "Service B";
serviceA --> serviceB;
```

Arrow types:
- `->` Single arrow (standard flow)
- `-->` Double arrow (dependency)
- `=>` Fat arrow (transformation/data flow)
- `<-->` Bidirectional arrow
- `<|--` Inheritance
- `*-->` Composition (strong containment)
- `o-->` Aggregation (weak containment)

## Edge Labels and Annotations

Labeled and styled edges:

```dygram
machine "Labeled Edges"

Task start "Start";
Task process "Process";
Task end "End";

// Simple label
start -"validate"-> process;

// Multiple labels
process -"success", "complete"-> end;

// Edge with time/duration
State idle "Idle";
State active "Active";
idle -30s-> active;

// Styled edge
Task sender "Sender";
Task receiver "Receiver";
sender -@style("color: red; stroke-width: 3px")-> receiver;

// Edge with attributes
Task taskA "Task A";
Task taskB "Task B";
taskA -priority: 5, weight: 10-> taskB;
```

Edge labeling:
- Simple: `-"label"->`
- Multiple: `-"label1", "label2"->`
- Time/duration: `-30s->`
- Styling: `-@style("css")->`
- Attributes: `-key: value->`

## Complex Nested Example with Cross-References

Bringing it all together:

```dygram
machine "Comprehensive System" @Version("3.0") @StrictMode

Context globalConfig {
    environment: "production";
    region: "us-west-2";
    timeout<number>: 30000;
};

Process ingestion {
    Input source "Data Source" {
        type: "stream";
        format: "json";
    };

    Task validate "Validate Data" @Critical {
        schema: #validationSchema;
        strict<boolean>: true;
    };

    Task transform "Transform Data" {
        operations: ["normalize", "enrich"];
    };

    source -> validate -> transform;
};

Process processing {
    Task analyze "Analyze" @Async {
        model: "claude-3-5-sonnet-20241022";
        prompt: "Analyze: {{ ingestion.transform.output }}";
    };

    Task classify "Classify" @Async {
        model: "claude-3-5-sonnet-20241022";
        categories: #categoryList;
    };

    Task aggregate "Aggregate Results";

    analyze -> aggregate;
    classify -> aggregate;
};

Process storage {
    Resource database "Database" {
        connection: #dbConfig;
        pool<number>: 10;
    };

    Task store "Store Results" {
        destination: "{{ globalConfig.environment }}.results";
    };

    database *--> store;
};

// Cross-process edges
ingestion.transform => processing.analyze;
ingestion.transform => processing.classify;
processing.aggregate -> storage.store;

// Documentation
note processing "Main processing pipeline" @Documentation {
    throughput: "1000 req/sec";
    latency: "< 100ms";
};
```

Advanced patterns combined:
- Machine-level annotations
- Multiple nested processes
- Qualified references across processes
- Generic types on attributes
- Template interpolation with qualified paths
- Different arrow types (semantic meaning)
- Composition relationship (`*-->`)
- Cross-process edges
- Documentation notes
- Async annotations

## Next Steps

- **[Styling & Validation](./styling-and-validation.md)** - StrictMode and diagram controls
- **[Attributes & Types](./attributes-and-types.md)** - Advanced type patterns
- **[Domain Examples](./domain-examples.md)** - Real-world applications
