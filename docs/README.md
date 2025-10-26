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
machine "DyGram: Dynamic State Machine DSL" @Version("0.3.7")

// ═══════════════════════════════════════════════════════════
// CONFIGURATION & FOUNDATION
// ═══════════════════════════════════════════════════════════

context config @Singleton {
    language<string>: "DyGram";
    framework<string>: "Langium";
    version<string>: "0.3.7";
    editors<Array<string>>: ["Monaco", "CodeMirror"];
}

// ═══════════════════════════════════════════════════════════
// CORE ARCHITECTURE PIPELINE
// ═══════════════════════════════════════════════════════════

State SourceCode "User's .dygram file" @Entry;

Task Parse "Parse via Langium" @Critical {
    input<string>: "{{ SourceCode }}";
    output<AST>: "Abstract Syntax Tree";
}

Task Validate "Validate graph structure" {
    checks<Array<string>>: ["cycles", "references", "types"];
}

Task Transform "Build semantic model" {
    phase<string>: "type-checking";
}

Process Generate "Generate outputs" @Async {
    formats<Array<string>>: ["json", "html", "dot", "dsl"];
}

Task Execute "Rails-based execution" @Meta {
    prompt: "Ride the machine rails with automated + agent-driven transitions";
    model<string>: "claude-3-5-sonnet";
}

Result Visualization "Interactive diagram" {
    renderer<string>: "Graphviz";
}

Result Runtime "Executing system" {
    agent<string>: "Claude";
}

// ═══════════════════════════════════════════════════════════
// PIPELINE FLOW (demonstrating arrow types)
// ═══════════════════════════════════════════════════════════

// Standard transitions
SourceCode -> Parse -> Validate -> Transform;

// Parallel branching
Transform -> Generate, Execute;

// Results
Generate => Visualization;
Execute => Runtime;

// ═══════════════════════════════════════════════════════════
// LANGUAGE FEATURES (nested semantic structure)
// ═══════════════════════════════════════════════════════════

Concept Language "DyGram Language System" {

    Concept Grammar @Abstract {
        terminals<number>: 15;
        rules<number>: 25;
    }

    Concept NodeTypes "15+ node types" {
        Task taskType "Generative LLM tasks";
        State stateType "Workflow states";
        Input inputType "Entry points";
        Output outputType "Exit points";
        Context contextType "Shared data";
        Resource resourceType "External resources";
        Process processType "Sub-processes";
        Concept conceptType "Domain concepts";
        Implementation implType "Implementations";
    }

    Concept ArrowSemantics "7 arrow types" {
        basic: "->";      // Basic flow
        double: "-->";    // Dependency
        fat: "=>";        // Strong causation
        inherit: "<|--";  // Inheritance
        compose: "*-->";  // Composition
        aggregate: "o-->"; // Aggregation
        bidirectional: "<-->"; // Bidirectional
    }

    Concept TypeSystem {
        primitives<Array<string>>: ["string", "number", "boolean"];
        generics<Array<string>>: ["Array", "Map", "Promise", "Result"];
        specialized<Array<string>>: ["Date", "UUID", "URL", "Duration"];
    }
}

// ═══════════════════════════════════════════════════════════
// EXECUTION MODEL (demonstrating rails pattern)
// ═══════════════════════════════════════════════════════════

Concept ExecutionModel "Rails-Based Execution" {

    State deterministic "Automated Transition" {
        speed<string>: "instant";
        llm<boolean>: false;
    }

    State intelligent "Agent Decision" {
        reasoning<boolean>: true;
        llm<boolean>: true;
    }

    Task metaProgramming @Meta {
        prompt: "Agent constructs tools dynamically";
        capability<string>: "self-modification";
    }
}

// ═══════════════════════════════════════════════════════════
// TECHNOLOGY STACK
// ═══════════════════════════════════════════════════════════

Implementation Stack "Technology Stack" {
    langium<string>: "Language Framework";
    monaco<string>: "Desktop Editor";
    codemirror<string>: "Mobile Editor";
    vite<string>: "Build Tool";
    graphviz<string>: "Visualization";
    anthropic<string>: "LLM Runtime";
}

// ═══════════════════════════════════════════════════════════
// RELATIONSHIPS (demonstrating relationship semantics)
// ═══════════════════════════════════════════════════════════

// Core pipeline reads configuration
Parse -reads-> config;
Generate -reads-> config;
Execute -reads-> config;

// Language composition relationships
Language *--> Language.Grammar;          // Grammar is part of Language
Language *--> Language.NodeTypes;        // NodeTypes are part of Language
Language *--> Language.ArrowSemantics;   // ArrowSemantics are part of Language
Language *--> Language.TypeSystem;       // TypeSystem is part of Language

// Inheritance relationships
Language.NodeTypes.taskType <|-- Execute;  // Execute is a Task
Language.NodeTypes.stateType <|-- SourceCode; // SourceCode is a State

// Implementation drives concepts
Stack -implements-> Language;
Stack -implements-> ExecutionModel;

// Execution model relationships with multiplicity
ExecutionModel "1" *--> "1" ExecutionModel.deterministic;
ExecutionModel "1" *--> "1" ExecutionModel.intelligent;
ExecutionModel "1" o--> "0..*" ExecutionModel.metaProgramming;

// Bidirectional dependencies
Runtime <--> Execute;
Visualization <--> Generate;

// ═══════════════════════════════════════════════════════════
// DOCUMENTATION
// ═══════════════════════════════════════════════════════════

note Language "DyGram is a DSL for dynamic state machines that bridges conceptual thinking and structured implementation. It features rails-based execution where deterministic paths execute instantly while complex decisions leverage Claude's reasoning.";

note Execute "The Execute task demonstrates meta-programming: agents ride machine rails, make intelligent decisions at branching points, and can construct tools dynamically during execution." @Critical;

note config "Configuration context is inherited by all tasks through semantic nesting - no explicit edges needed. This showcases DyGram's automatic context propagation.";
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
