# Attributes and Types

Schemas, linked nodes, type hierarchies, and attributes at all levels.

## Basic Attributes

Simple key-value attributes:

```dy
machine "Basic Attributes"

Task process {
    timeout<number>: 30;
    retries<number>: 3;
    priority: "high";
    enabled<boolean>: true;
};
```

Attribute syntax:
- `name: value` - Attribute without type
- `name<type>: value` - Attribute with explicit type
- Types: `number`, `bool`, `string`, or complex generics
- Values: strings, numbers, booleans, references, arrays, objects

## Referenced Schemas

Using external ID references for schemas:

```dy
machine "Schema References"

Input request {
    schema: #requestSchema;
    payload: #sampleData;
};

Task validate {
    inputSchema: #requestSchema;
    outputSchema: #responseSchema;
    prompt: "Validate against schema";
};

Output response {
    schema: #responseSchema;
    result: #emptyResult;
};

request -> validate -> response;
```

Schema references:
- Prefix with `#` to indicate external reference
- Schema can be defined elsewhere (JSON Schema, TypeScript, etc.)
- Used for validation, type checking, code generation
- Keeps machine definition clean

## Linked Nodes as Types

Referencing other nodes for type information:

```dy
machine "Linked Nodes"

// Define type templates
Context requestType {
    id<string>: "";
    timestamp<number>: 0;
    user<string>: "";
};

Context responseType {
    status<string>: "";
    data: {};
    error: null;
};

// Use node references as types
Input userRequest {
    type: #requestType;  // References Context node
    value: #sampleRequest;
};

Output apiResponse {
    type: #responseType;  // References Context node
    value: #emptyResponse;
};
```

Linked node patterns:
- Use `Context` nodes as type definitions
- Reference with `#nodeName`
- Provides structure and reusability
- Self-documenting types

## Attributes at Machine Level

Machine-level attributes:

```dy
machine "Machine Attributes" @Version("2.0") {
    author: "Team A";
    created: "2024-01-15";
    description: "Production machine";
    timeout<number>: 60000;
    environment: "production";
}

Task process {
    // Inherits machine context
    prompt: "Process in {{ machine.environment }}";
};
```

Machine attributes:
- Defined in `machine` block with braces
- Available to all nodes
- Global configuration
- Accessible via templates

## Attributes at Node Level

Node-specific attributes:

```dy
machine "Node Attributes"

Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 2048;
    prompt: "Analyze the data";
    timeout<number>: 30;
    retries<number>: 3;
};

State processing {
    timeout<number>: 120;
    persistence: "memory";
};

Input data {
    format: "json";
    schema: #dataSchema;
    validation: "strict";
};
```

Node attributes:
- Node-specific configuration
- Override machine-level defaults
- Typed attributes with `<type>`
- Any custom attributes allowed

## Attributes in Nested Nodes

Attributes at multiple hierarchy levels:

```dy
machine "Nested Attributes" {
    environment: "production";
    region: "us-west-2";
}

Process apiGateway {
    rateLimit<number>: 1000;
    timeout<number>: 30;

    Process authentication {
        provider: "oauth2";
        tokenExpiry<number>: 3600;

        Task validateToken {
            algorithm: "RS256";
            publicKey: #jwtPublicKey;
        };

        Task refreshToken {
            maxAge<number>: 7200;
        };
    };

    Process routing {
        strategy: "round-robin";
        healthCheck<boolean>: true;

        Task routeRequest {
            backends: ["backend1", "backend2", "backend3"];
        };
    };
};
```

Hierarchical attributes:
- Machine level: global defaults
- Process level: shared by nested nodes
- Nested process level: further scoping
- Task level: most specific
- Child nodes can access parent attributes via templates

## Accessing Parent Attributes

Template syntax for hierarchical access:

```dy
machine "Attribute Access" {
    apiKey: "secret123";
    environment: "prod";
}

Process dataProcessing {
    dataSource: "postgres";
    retries<number>: 3;

    Task fetchData {
        // Access machine-level attribute
        key: "{{ machine.apiKey }}";

        // Access process-level attribute
        source: "{{ dataProcessing.dataSource }}";

        // Access current node attribute
        timeout<number>: 30;
        prompt: "Fetch from {{ source }} with timeout {{ timeout }}s";
    };
};
```

Access patterns:
- `{{ machine.attribute }}` - Machine level
- `{{ processName.attribute }}` - Process level
- `{{ nodeName.attribute }}` - Specific node
- `{{ attribute }}` - Current context

## Complex Nested Objects

Nested attribute structures:

```dy
machine "Complex Attributes"

Context config {
    database: {
        host: "localhost";
        port<number>: 5432;
        credentials: {
            username: "admin";
            password: #dbPassword;
        };
        pool: {
            min<number>: 5;
            max<number>: 20;
            idle<number>: 10000;
        };
    };

    cache: {
        enabled<boolean>: true;
        ttl<number>: 300;
        provider: "redis";
        nodes: ["cache1", "cache2"];
    };
};
```

Nested objects:
- Braces `{}` for object values
- Arbitrary nesting depth
- Mixed types (strings, numbers, bools, references)
- Arrays within objects

## Array Attributes

Arrays and lists:

```dy
machine "Array Attributes"

Task processor {
    inputs<Array<string>>: ["input1", "input2", "input3"];
    stages<Array<string>>: ["validate", "transform", "load"];
    priorities<Array<number>>: [1, 2, 3, 5, 8];
    flags<Array<boolean>>: [true, false, true];
    schemas<Array<ref>>: [#schema1, #schema2, #schema3];
};
```

Array features:
- Square brackets `[]` for arrays
- Type safety with `<Array<type>>`
- Homogeneous or mixed types
- Can contain references

## Generic Type Hierarchies

Complex generic types:

```dy
machine "Generic Types"

Context types {
    // Simple generics
    names<Array<string>>: [];
    counts<Array<number>>: [];

    // Nested generics
    matrix<Array<Array<number>>>: [[1,2], [3,4]];
    mapping<Map<string, Array<number>>>: #complexMap;

    // Promises and async
    asyncResult<Promise<Response>>: #pending;
    futureData<Promise<Array<Data>>>: #loading;

    // Optional types
    maybeValue<Optional<string>>: #none;
    possibleResult<Optional<Result>>: #some;

    // Custom types
    workflow<StateMachine<State>>: #workflowDef;
    tasks<Queue<Task>>: #taskQueue;
};
```

Generic syntax:
- `<Array<T>>` - Array of type T
- `<Map<K, V>>` - Map with key type K and value type V
- `<Promise<T>>` - Async promise of type T
- `<Optional<T>>` - Optional value of type T
- Nesting: `<Array<Array<T>>>`, `<Map<K, Array<V>>>`

## Attribute Inheritance Pattern

Simulating inheritance with references:

```dy
machine "Attribute Inheritance"

// Base configuration template
Context baseTaskConfig {
    timeout<number>: 30;
    retries<number>: 3;
    logLevel: "info";
};

// Specialized configurations extending base
Context llmTaskConfig {
    base: #baseTaskConfig;  // Reference to base
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 2048;
};

Context criticalTaskConfig {
    base: #baseTaskConfig;  // Reference to base
    priority<number>: 10;
    alerting<boolean>: true;
};

// Tasks using configurations
Task analyze {
    config: #llmTaskConfig;
    prompt: "Analyze data";
};

Task monitor {
    config: #criticalTaskConfig;
    prompt: "Monitor system";
};
```

Inheritance pattern:
- Define base configurations as `Context` nodes
- Reference base in specialized configs
- Tasks reference appropriate config
- Promotes reuse and consistency

## Type Composition

Composing types from multiple sources:

```dy
machine "Type Composition"

Context baseAttributes {
    id<string>: "";
    timestamp<number>: 0;
};

Context auditAttributes {
    createdBy<string>: "";
    modifiedBy<string>: "";
    version<number>: 1;
};

Context dataPayload {
    content: "";
    metadata: {};
};

// Composed type using multiple references
Input request {
    base: #baseAttributes;
    audit: #auditAttributes;
    payload: #dataPayload;
    // Additional attributes
    priority<number>: 5;
};
```

Composition pattern:
- Multiple references in single node
- Logical grouping of concerns
- Mixin-style composition
- Flexible and modular

## Schema Validation Attributes

Attributes for validation:

```dy
machine "Validation Attributes"

Input userInput {
    schema: #inputSchema;
    validation: "strict";
    sanitize<boolean>: true;
    required<Array<string>>: ["email", "name"];
    optional<Array<string>>: ["phone", "address"];
    constraints: {
        email: #emailRegex;
        name: { minLength: 2, maxLength: 100 };
        age: { min: 0, max: 150 };
    };
};

Task validate {
    schema: #inputSchema;
    strict<boolean>: true;
    errorMode: "collect";  // or "fail-fast"
};
```

Validation attributes:
- `schema`: Schema reference
- `validation`: Validation mode
- `required`: Required fields
- `optional`: Optional fields
- `constraints`: Field-level constraints

## Documentation Through Attributes

Self-documenting attributes:

```dy
machine "Self-Documenting"

Task complexTask {
    // Functional attributes
    prompt: "Complex processing";
    timeout<number>: 60;

    // Documentation attributes
    description: "Handles complex multi-step processing";
    usage: "Called when input meets criteria X";
    examples: ["example1", "example2"];
    version: "2.1.0";
    deprecated<boolean>: false;
    seeAlso: ["relatedTask1", "relatedTask2"];
    tags<Array<string>>: ["critical", "async", "monitored"];
};
```

Documentation attributes:
- Standard attributes for behavior
- Additional attributes for documentation
- No special syntax required
- Extracted by tooling

## Next Steps

- **[Styling & Validation](./styling-and-validation.md)** - Validation with types
- **[Advanced Features](./advanced-features.md)** - Complex patterns
- **[Domain Examples](./domain-examples.md)** - Real-world usage
