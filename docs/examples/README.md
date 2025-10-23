# Examples

Practical examples organized by use case and domain.

## Quick Start

### Simple Example

The simplest possible machine:

```dygram
machine "Hello World"

Task greet {
    prompt: "Say hello to the world";
};
```

### Kitchen Sink Example

A comprehensive example showcasing multiple features:

```dygram
machine "Comprehensive Demo" @StrictMode @Version("1.0")

// Machine-level configuration
Context config {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    endpoints<Array<string>>: ["api1.com", "api2.com"];
};

// Input with schema reference
Input userRequest {
    query: "Sample query";
    schema: #requestSchema;
};

// Nested process with hierarchy
Process analysis {
    Task preprocess "Clean data" @Async {
        priority<number>: 10;
        timeout: "30s";
    };

    Task analyze "Analyze content" {
        prompt: "Analyze: {{ userRequest.query }}";
        model: "claude-3-5-sonnet-20241022";
    };

    State processing "Processing State";

    preprocess -> analyze -> processing;
};

// Parallel processing
Task taskA "Path A" @Async;
Task taskB "Path B" @Async;
Task merge "Merge Results";

// Output node
Output result {
    status: "pending";
    data: #outputData;
};

// Complex edges with different arrow types
userRequest -> analysis;
analysis.processing -> taskA, taskB;
taskA -> merge;
taskB -> merge;
merge => result;

// Relationship arrows
Task parent;
Task child;
child <|-- parent;  // Inheritance

// Documentation
note analysis "This process handles the main analysis pipeline" @Documentation {
    complexity: "O(n)";
    author: "System";
};
```

This example demonstrates:
- Machine annotations (`@StrictMode`, `@Version`)
- Generic types (`<Array<string>>`)
- Nested structures (`Process` containing `Task` and `State`)
- Attributes at multiple levels (machine, node, nested)
- Referenced schemas (`#requestSchema`, `#outputData`)
- Template interpolation (`{{ userRequest.query }}`)
- Async execution (`@Async`)
- Multiple arrow types (`->`, `=>`, `<|--`)
- Parallel workflows (multiple targets)
- Documentation notes with attributes

## Topic-Based Guides

Explore specific topics in depth:

### Core Concepts
- **[Basic Examples](./basic.md)** - Hello World, simple workflows, and node attributes
- **[Workflows](./workflows.md)** - Branching, sequential, and parallel execution patterns
- **[State Machines](./state-machines.md)** - State transitions and stateful workflows

### Integration & Advanced
- **[LLM Integration](./llm-integration.md)** - Working with language models and prompts
- **[Advanced Features](./advanced-features.md)** - Nesting, generics, annotations, arrows, and notes
- **[Styling & Validation](./styling-and-validation.md)** - StrictMode, warning visualization, diagram controls
- **[Attributes & Types](./attributes-and-types.md)** - Schemas, linked nodes, and type hierarchies

### Domain-Specific
- **[Domain Examples](./domain-examples.md)** - API workflows, ETL pipelines, testing
- **[CLI & API Usage](./cli-and-api.md)** - Running and programmatic integration

## Documentation Gaps & Opportunities

While working on these examples, we've identified several areas for enhancement:

### Current Gaps
1. **Nested diagram directions** - No examples yet for overriding rankdir in nested subgraphs
2. **Runtime visualization options** - Need examples showing different visualization modes
3. **Edge styling** - Limited examples of custom edge styling with `@style` annotations
4. **Advanced CEL expressions** - Complex conditional logic in templates

### Future Opportunities
1. **Interactive examples** - Add playground links for each example
2. **Video walkthroughs** - Screen recordings showing features in action
3. **Performance patterns** - Examples demonstrating optimization techniques
4. **Error handling** - Common error scenarios and recovery patterns
5. **Testing strategies** - How to test machine definitions effectively

## Next Steps

- **[Syntax Reference](../syntax/README.md)** - Learn syntax details
- **[CLI Reference](../cli/README.md)** - Command-line usage
- **[API Reference](../api/README.md)** - Programmatic integration

---

**Note**: Examples use the `.dygram` extension and can be validated with `dygram parseAndValidate <file>`
