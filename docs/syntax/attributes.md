# Attributes

Attributes add typed metadata and configuration to nodes, edges, and machines. They support primitive types, specialized types, generics, arrays, and external references.

## Basic Syntax

Attributes are key-value pairs:

```dy examples/syntax/attributes.dygram
name: "value";
count: 42;
enabled: true;
```

### In Nodes

```dy examples/syntax/node-attributes.dygram
Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 4096;
};
```

### In Edges

```dy examples/syntax/edge-attributes.dygram
a -condition: true, priority: 1-> b;
```

Note: Edge attributes are separated by semicolons (`;`), while node attributes are separated by semicolons as well.

### In Machines

```dy examples/syntax/machine-attributes.dygram
machine "API Service" {
    version: "1.0.0";
    environment: "production";
};
```

## Typed Attributes

Add type annotations for validation:

```dy examples/syntax/typed-attributes.dygram
port<number>: 3000;
host<string>: "localhost";
timeout<Duration>: "30s";
```

See [Types](types.md) for detailed type information.

## Primitive Types

### String
```dy
name<string>: "value";
description: "Inferred as string";
```

### Number
```dy
count<number>: 42;
price: 19.99;
scientific: 1.5e10;
temperature: -273.15;
```

### Boolean
```dy
enabled<boolean>: true;
active: false;
```

## Specialized Types

DyGram provides specialized string types for common patterns:

### Date
ISO 8601 datetime strings with time and timezone:
```dy
createdAt<Date>: "2025-10-22T13:30:00Z";
```

### UUID
UUID strings:
```dy
id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
```

### URL
Valid URLs:
```dy
endpoint<URL>: "https://api.example.com";
```

### Duration
ISO 8601 durations:
```dy
timeout<Duration>: "PT1H30M";
waitTime<Duration>: "P1Y2M3D";
```

### Integer and Float
Numeric subtypes:
```dy
count<Integer>: 42;
price<Float>: 19.99;
```

See [Types](types.md) for complete type reference.

## Generic Types

### Arrays
```dy examples/syntax/types-array.dygram
tags: ["api", "production", "critical"];
ports: [8080, 8081, 8082];
```

With type validation:
```dy examples/syntax/types-generic.dygram
results<Array<string>>: ["a", "b", "c"];
```

### Validated Generic Elements
```dy examples/syntax/validated-generics.dygram
task myTask {
  // Array elements are validated as Dates
  dates<Array<Date>>: ["2025-10-22T13:30:00Z", "2025-10-23T14:00:00Z"];

  // Array elements are validated as Integers
  counts<Array<Integer>>: [1, 2, 3];
}
```

### Maps
```dy
data<Map<string, number>>: #dataMap;
```

### Other Generics
```dy
promise<Promise<Result>>: #pending;
result<Result<Data, Error>>: #outcome;
```

See [Types](types.md) for generic type details.

## External References

Reference external values using `#` prefix:

```dy !examples/syntax/external-references.dygram
config: #globalConfig;
handler: #processHandler;
```

External references allow you to link attributes to values defined outside the DyGram file, resolved by your application runtime.

## Multi-line String Values

Strings can span multiple lines:

```dy examples/syntax/strings-multiline.dygram
prompt: "This is a long prompt
that spans multiple lines
and preserves formatting";
```

## Complete Attribute Syntax

Attributes can use all features:

```dy examples/syntax/types-built-in.dygram
task myTask {
  id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
  createdAt<Date>: "2025-10-22T13:30:00Z";
  endpoint<URL>: "https://api.example.com";
  timeout<Duration>: "PT1H30M";
  count<Integer>: 42;
  price<Float>: 19.99;
}
```

## Best Practices

### Naming Conventions
- Use **camelCase** for attribute names
- Use **descriptive names** that indicate purpose
- Be **consistent** across your machine

### Type Annotations
- Add types for **validation** when important
- Use **specialized types** (Date, UUID, URL, Duration) for semantics
- Use **generic types** (Array, Map) for collections

### Value Organization
- Group **related attributes** together
- Put **required attributes** first
- Use **meaningful defaults** when appropriate

### External References
- Use for **shared configuration**
- Use for **runtime-resolved values**
- Use for **cross-machine references**

## Examples

### Basic Configuration
```dy
task processor {
    enabled: true;
    maxRetries: 3;
    timeout: "30s";
};
```

### Typed Configuration
```dy
task apiCall {
    endpoint<URL>: "https://api.example.com/v1/users";
    timeout<Duration>: "PT30S";
    retries<Integer>: 3;
    headers<Array<string>>: ["Authorization: Bearer token", "Content-Type: application/json"];
};
```

### External References
```dy
context config {
    database: #dbConnection;
    cache: #redisClient;
    logger: #appLogger;
};
```

### Edge Attributes
```dy
Start -priority: 1; weight: 0.8; condition: "status == 'ready'";-> Process;
```

### Complex Attributes
```dy
task llmCall {
    model: "claude-3-5-sonnet-20241022";
    temperature<Float>: 0.7;
    maxTokens<Integer>: 4096;
    stopSequences<Array<string>>: ["\n\nHuman:", "\n\nAssistant:"];
    systemPrompt: "You are a helpful assistant.
    Respond concisely and accurately.
    Use markdown for formatting.";
};
```

### Machine-Level Attributes
```dy
machine "Production API" @Version("2.0") {
    region: "us-east-1";
    environment: "production";
    deployed<Date>: "2025-10-22T13:30:00Z";
    maxConcurrency<Integer>: 100;
    timeout<Duration>: "PT5M";
    endpoints<Array<URL>>: [
        "https://api1.example.com",
        "https://api2.example.com"
    ];
};
```

## See Also

- [Types](types.md) - Complete type system reference
- [Nodes](nodes.md) - Using attributes in nodes
- [Edges](edges.md) - Using attributes in edges
- [Machines](machines.md) - Using attributes in machines
