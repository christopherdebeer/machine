# Machines

A machine declaration is the top-level container for your DyGram definition. While optional, it provides a way to name, annotate, and configure your machine.

## Basic Declaration

Every DyGram file can optionally start with a machine declaration:

```dy examples/syntax/machine-title.dygram
machine "My Machine"
```

## With Annotations

Machines can be annotated with metadata:

```dy examples/syntax/machine-annotation.dygram
machine "Production System" @Critical @Version("2.0")
```

See [Annotations](annotations.md) for more details on available annotations.

## With Attributes

Machine-level attributes provide global configuration:

```dy examples/syntax/machine-attributes.dygram
machine "API Service" {
    version: "1.0.0";
    environment: "production";
};
```

See [Attributes](attributes.md) for more details on attribute syntax and types.

## Without Declaration

If you don't need a title or configuration, you can omit the machine declaration entirely and start directly with node and edge definitions:

```dy
Start -> Process -> End;
```

## Best Practices

### Use Machine Declarations For:
- **Documentation**: Give your machine a descriptive name
- **Versioning**: Track machine versions with annotations
- **Configuration**: Store machine-level settings in attributes
- **Metadata**: Mark machines with criticality, ownership, etc.

### Skip Machine Declarations When:
- Creating simple diagrams or sketches
- Working with fragments or reusable components
- The machine name isn't meaningful

## Examples

### Minimal Machine
```dy
machine "Order Processing"
```

### Documented Machine
```dy
machine "Payment Gateway" @Version("3.1.0") @Critical @Owner("Platform Team") {
    region: "us-east-1";
    maxConcurrency: 100;
    timeout<Duration>: "PT30S";
};
```

### Machine Without Declaration
```dy
// Just define the workflow directly
task Process;
Start -> Process -> End;
```

## See Also

- [Annotations](annotations.md) - Metadata for machines and nodes
- [Attributes](attributes.md) - Typed configuration values
- [Nodes](nodes.md) - Building blocks of your machine
