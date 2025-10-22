# DyGram | Thought → System

A lean, executable DSL for rapid prototyping that evolves from unstructured sketches to complete systems through iterative execution and generative prompting.

## Table of Contents

## Quick Start

- [Installation](getting-started/README.md) - Get DyGram up and running in minutes
- [Syntax Guide](syntax/README.md) - Learn the language fundamentals
- [Try it now](playground-mobile.html) - Interactive playground

## What is DyGram?

DyGram starts broad and unstructured but is immediately executable, evolving toward more structured and complex systems through feedback and iteration.

### Lean Core DSL

Begin with a minimal, intuitive language that captures domain concepts without unnecessary complexity.

### Iterative Evolution

Refine your model through execution, generative prompting, and continuous feedback loops.

### Structured Emergence

Watch your system naturally evolve from explorative sketches to structured implementations as requirements clarify.

## Evolution in Action

### Stage 1: Initial Exploration

Start with an immediately executable, unstructured representation of your domain.

```dygram
problem -> solution;
```

Or add more structure:

```dygram
machine "Solution Sketch"

Input problem {
    query<string>: "TBD";
};

Task process {
    prompt: "Given the problem statement {{ problem.query }} identify a plan to achieve a solution.";
}

Result solution {
    value: "TBD";
};

problem -necessitates-> solution;
```

### Stage 2: Iterative Refinement

Through execution and feedback, add context and structure to your prototype.

```dygram
machine "Solution Framework"

Concept problem "User Authentication" {
    domain: "Security";
    priority<number>: 9;
    constraints: ["GDPR Compliance", "Low Latency"];
    stakeholders: ["Security Team", "UX Team"];
    risks: ["Token Theft", "Session Hijacking"];
};

Concept solution "Token-based Auth" {
    status: "Testing";
    approach: "JWT Implementation";
    metrics: ["Security", "Performance", "UX"];
    components: ["JWT Generator", "Token Validator", "Refresh Logic"];
    tests: ["Penetration Testing", "Load Testing"];
};

Resource documentation "Auth Flow Diagram" {
    url: "https://repo.example.com/auth-flow.pdf";
    access: "Internal";
};

problem -addresses, confidence: 0.9-> solution;
solution -documented_by-> documentation;
```

### Stage 3: Structured System

Evolve into a comprehensive executable model that bridges conceptual and technical domains.

```dygram
machine "Knowledge Management System"

Concept idea "Neural Interface" {
    creator: "Research Team";
    created<Date>: "2025-01-15";
    priority<number>: 8;
    domain: "Neuroscience";
    description: "Direct neural interface for thought-to-text";
    tags: ["neural", "interface", "breakthrough"];
};

Implementation implementation "Neural Interface Prototype" {
    status: "In Progress";
    owner: "Engineering";
    deadline<Date>: "2025-03-30";
    repository: "github.com/org/neural-interface";
    version<SemanticVersion>: "0.1.0";
    dependencies: ["tensorflow", "brain-compute-sdk"];
};

Resource resource1 "Research Paper" {
    url: "https://example.com/papers/neural-interfaces-2024";
    format: "PDF";
    access<AccessLevel>: "Confidential";
};

idea -inspires, confidence: 0.85-> implementation;
idea -documented_in-> resource1;
implementation -references-> resource1;
```

## Documentation

### [Getting Started](getting-started/README.md)
Installation, quick start, and your first machine

### [Syntax Reference](syntax/README.md)
Complete language syntax - nodes, edges, attributes, types

### [CLI Tools](cli/README.md)
Command-line interface for generation and execution

### [API Reference](api/README.md)
Programmatic integration and library API

### [Examples](examples/README.md)
Practical patterns organized by use case

### [Documentation Archive](archived/README.md)
Previous versions and legacy content

## Playgrounds

- [CodeMirror Playground](playground-mobile.html) - Mobile-friendly editor
- [Monaco Playground](playground.html) - Desktop IDE experience

## Contributing

Found an issue or want to improve DyGram? Visit our [GitHub repository](https://github.com/christopherdebeer/machine).

---

**Exploration → Implementation** - Start sketching your systems today.
