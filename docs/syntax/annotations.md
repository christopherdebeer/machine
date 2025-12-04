# Annotations

Annotations add semantic metadata to machines, nodes, and edges. They're prefixed with `@` and can include optional values.

## Basic Syntax

Annotations start with `@` followed by an identifier and must be attached to machines, nodes, or edges:

```dy
machine "Example" @Annotation;
Task foo @AnotherAnnotation "Bar";
```

### With Values

Annotations can have string values in parentheses:

```dy
Task process @Version("2.0") @Author("John Doe");
Task legacy @Deprecated("Use NewTask instead");
```

### Multiple Annotations

Elements can have multiple annotations:

```dy
Task important @Critical @Async @Version(1.0);
```

## Machine Annotations

Annotate machine declarations:

```dy examples/syntax/machine-annotation.dygram
machine "Production System" @Critical @Version("2.0")
```

With attributes:

```dy
machine "API Service" @Owner("Platform Team") {
    version: "0.0.1";
    environment: "production";
};
```

## Node Annotations

Annotate nodes to add metadata:

```dy examples/syntax/node-annotations.dygram
Task critical @Critical @Async;
Resource legacy @Deprecated("Use newResource instead");
```

### Common Node Annotations

- **`@Abstract`** - Abstract or conceptual node
- **`@Singleton`** - Single instance
- **`@Async`** - Asynchronous operation
- **`@Deprecated`** - Deprecated (optionally with replacement)
- **`@Critical`** - Critical component
- **`@ReadOnly`** - Read-only resource
- **`@Version("x.y.z")`** - Version information
- **`@Author("name")`** - Author or owner
- **`@Since("date")`** - Creation date

### With All Features

```dy
Task processPayment "Process Payment" @Critical @Async @Version("2.1") {
    provider: "stripe";
    timeout<Duration>: "PT30S";
};
```

## Edge Annotations

Annotate edges to add styling or metadata:

```dy examples/syntax/edge-annotations.dygram
start -@style(color: red; stroke-width: 3px)-> end;
a -@weight(5)-> b;
```

### Multiple Edge Annotations

```dy
a -@Critical @style(color: blue;)-> b;
```

### With Attributes

Combine annotations and attributes:

```dy
Start -priority: 1; @Critical-> Process;
```

Note: Annotations come after attributes in edge syntax.

## Annotation Values

### String Values

Most annotations accept string values:

```dy
machine "Example";

Task component @Version("1.0.0") @Author("Team A");
Task feature @Description("Long description text");
Task oldFeature @Deprecated("Use newImplementation instead");

```

### Simple Values (No Quotes)

Some annotations work without quotes in edge context:

```dy
a -@weight(5)-> b;
a -@priority(high)-> b;
```

### Multi-line Values

Annotation values can be multi-line strings:

```dy
Task feature @Description("This is a long description
that spans multiple lines
and provides detailed information");
```

## Semantic Annotations

### Lifecycle Annotations

```dy
Task oldApi @Deprecated("Use v2 API");
Task newFeature @Experimental;
Task core @Stable;
Task preview @Beta;
```

### Organizational Annotations

```dy
Task service @Owner("Platform Team") @Team("Backend");
Task migration @Project("Migration");
```

### Technical Annotations

```dy
Task fetch @Async;
Task compute @Sync;
Task lookup @Cached;
Task save @Transactional;
Task query @ReadOnly;
Task update @WriteOnly;

```

### Quality Annotations

```dy
Task urgent @Critical;
Task priority @Important;
Task extra @Optional;
Task mandatory @Required;
```

### Documentation Annotations

```dy
Task feature @Since("2024-01-15") @Version("2.0");
Task handler @Author("John Doe");
Task process @Description("Detailed explanation");

```

## Best Practices

### Naming Conventions
- Use **PascalCase** for annotation names
- Use **descriptive names** that convey meaning
- Be **consistent** across your machine

### Value Usage
- Provide **context** in values (e.g., replacement for `@Deprecated`)
- Use **standard formats** (ISO dates, semver)
- Keep values **concise** but **informative**

### Application
- Annotate **critical components** with `@Critical`
- Mark **deprecated items** with `@Deprecated("replacement")`
- Add **version information** to track changes
- Use **ownership annotations** for clarity

### Organization
- Group **related annotations** together
- Place **most important annotations** first
- Keep annotation lists **readable**

## Examples

### Machine Metadata
```dy
machine "User Service"  @Critical @Owner("Platform Team") {
    version: "1.0";
    region: "us-east-1";
    deployed<Date>: "2025-10-22T13:30:00Z";
};
```

### Node Documentation
```dy
Task authenticateUser "Authenticate User"
    @Critical
    @Async
    @Version("2.1")
    @Author("Security Team")
    @Since("2024-01-15") {
    provider: "OAuth2";
    timeout<Duration>: "PT30S";
};
```

### Deprecated Components
```dy
Task legacyProcessor @Deprecated("Use newProcessor instead") @Version("1.0");
Task newProcessor @Version("2.0");

legacyProcessor -> newProcessor;
```

### Edge Styling
```dy
Start -@style(color: green; stroke-width: 2px;)-> Success;
Start -@style(color: red; stroke-dasharray: 5,5;)-> Failure;
```

### Mixed Usage
```dy
machine "Payment Gateway" @Critical @Version("2.0")

Context config @Singleton {
    apiKey: #apiKey;
    timeout<Duration>: "PT1M";
};

Task validatePayment "Validate Payment" @Critical @Async {
    maxRetries<Integer>: 3;
};

Task processPayment "Process Payment" @Critical @Async @Version("2.1");

Task fallbackPayment "Fallback Payment" @Deprecated("Use processPayment with fallback provider");

validatePayment -priority: 1; @Critical-> processPayment;
processPayment -weight: 0.1; @style(color: red;)-> fallbackPayment;
```

### Organizational Hierarchy
```dy
machine "Multi-Team System" @Version("1.0")

Task frontend @Team("Frontend") @Owner("Alice") {
    framework: "React";
};

Task backend @Team("Backend") @Owner("Bob") @Critical {
    runtime: "Node.js";
};

Task database @Team("Data") @Owner("Carol") @Critical @ReadOnly {
    engine: "PostgreSQL";
};

frontend --> backend;
backend --> database;
```

## Custom Annotations

While DyGram doesn't restrict annotation names, consider defining a vocabulary for your domain:

```dy
// Custom domain annotations
Task apiEndpoint @HTTP("GET") @Route("/api/users") @Auth("Bearer");
Task handler @EventDriven @Topic("user.created");
Task processor @Batch @Schedule("0 0 * * *");
```

Application code can read annotations and apply domain-specific logic.

## See Also

- [Machines](machines.md) - Annotating machines
- [Nodes](nodes.md) - Annotating nodes
- [Edges](edges.md) - Annotating edges
- [Attributes](attributes.md) - Complementary to annotations
