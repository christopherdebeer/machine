# DyGram | Thought → System

A lean, executable DSL that transforms unstructured ideas into complete systems through iterative refinement and intelligent execution.

## Table of Contents

## Quick Start

- [Installation](getting-started/README.md) - Get DyGram up and running in minutes
- [Syntax Guide](syntax/README.md) - Learn the language fundamentals
- [Try it now](playground-mobile.html) - Interactive playground

## What is DyGram?

DyGram bridges the gap between thought and implementation. Start with the simplest expression of an idea—immediately executable—then evolve it toward structure and complexity as your understanding deepens.

### Start Simple, Stay Executable

Every DyGram, from a single arrow to a complex system, is immediately executable. No boilerplate, no ceremony—just capture the thought.

### Evolve Through Execution

Run your model. See what it does. Refine it. DyGram grows with your understanding, from sketch to structure through continuous feedback.

### Intelligent by Design

Leverage LLM reasoning at decision points while deterministic paths execute instantly. Your machine rides the rails—fast where it can be, thoughtful where it needs to be.

## From Thought to System

Watch how DyGram evolves from the simplest expression to a complete system. Each stage is executable and builds naturally on the previous one.

### Stage 1: Capture the Thought

Start with the essence. The absolute minimum to express an idea.

```dy examples/homepage/01-essence.dygram
idea -> prototype;
```

This is valid, executable DyGram. Two nodes, one transition. It runs.

Add just enough detail to make it yours:

```dy examples/homepage/02-named.dygram
machine "New Product Concept"

idea -> research -> prototype;
```

**What changed:** Named the machine, added an intermediate step. Still lean, still clear.

### Stage 2: Add Structure

Give your nodes identity and attributes as the concept solidifies.

```dy examples/homepage/03-structured.dygram
machine "Product Development"

Input idea {
    concept: "Mobile app for task management";
    target: "productivity users";
}

Task research {
    activities: ["market analysis", "competitor review"];
}

Task prototype {
    deliverables: ["wireframes", "tech spike"];
}

Output validation {
    criteria: ["user feedback", "technical feasibility"];
}

idea -> research -> prototype -> validation;
```

**What changed:** Nodes have types (Input, Task, Output) and attributes. The workflow tells a story. Still simple, but more expressive.

### Stage 3: Make it Intelligent

Add LLM-powered reasoning where you need adaptability.

```dy examples/homepage/04-intelligent.dygram
machine "AI-Powered Product Development"

Input idea {
    concept: "Mobile app for task management";
    target: "productivity users";
    constraints: ["budget: $50k", "timeline: 3 months"];
}

Task analyze @Critical {
    prompt: "Given the concept '{{ idea.concept }}' for {{ idea.target }}, with constraints {{ idea.constraints }}, identify the 3 most critical features to prototype first. Consider market viability and technical complexity.";
    model: "claude-3-5-sonnet-20241022";
}

Task research {
    activities: ["market analysis", "competitor review"];
    input: "{{ analyze.output }}";
}

Task prototype {
    prompt: "Create detailed wireframes and technical architecture for: {{ analyze.output }}. Ensure designs address {{ idea.target }} needs.";
}

State review "Stakeholder Review" {
    reviewers: ["product", "engineering", "design"];
}

Output decision {
    criteria: ["user feedback", "technical feasibility", "market fit"];
}

idea -> analyze -> research -> prototype -> review -> decision;
```

**What changed:** Tasks can have `prompt` attributes—LLM reasoning on demand. Template strings (`{{ idea.concept }}`) create dynamic context. The `@Critical` annotation highlights importance. This machine thinks.

### Stage 4: Organize Complexity

As systems grow, use hierarchy and rich semantics to maintain clarity.

```dy examples/homepage/05-organized.dygram
machine "Product Development System" @Version("1.0")

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

Context config @Singleton {
    budget<number>: 50000;
    timeline<Duration>: "P3M";
    model<string>: "claude-3-5-sonnet-20241022";
    reviewers<Array<string>>: ["product", "engineering", "design"];
}

// ═══════════════════════════════════════════════════════════
// DISCOVERY PHASE
// ═══════════════════════════════════════════════════════════

Process Discovery {
    Input idea {
        concept: "Mobile app for task management";
        target: "productivity users";
    }

    Task analyze @Critical {
        prompt: "Analyze '{{ idea.concept }}' for {{ idea.target }}. Budget: {{ config.budget }}, Timeline: {{ config.timeline }}. Recommend critical features.";
        model: "{{ config.model }}";
    }

    Task research {
        sources: ["market reports", "user surveys", "competitor analysis"];
        input: "{{ analyze.output }}";
    }

    idea -> analyze -> research;
}

// ═══════════════════════════════════════════════════════════
// EXECUTION PHASE
// ═══════════════════════════════════════════════════════════

Process Execution {
    Task design "Create Designs" {
        deliverables: ["wireframes", "user flows", "design system"];
    }

    Task build "Build Prototype" @Async {
        type: "technical spike";
        technologies: ["React Native", "TypeScript", "Supabase"];
    }

    Task test "Validate Prototype" {
        methods: ["user testing", "technical review", "accessibility audit"];
    }

    design -> build -> test;
}

// ═══════════════════════════════════════════════════════════
// DECISION PHASE
// ═══════════════════════════════════════════════════════════

State Review "Stakeholder Review" {
    reviewers: "{{ config.reviewers }}";
    criteria: ["user value", "technical feasibility", "market fit"];
}

Output Approved "Go to Production";
Output Rejected "Back to Discovery";

// ═══════════════════════════════════════════════════════════
// FLOW
// ═══════════════════════════════════════════════════════════

// Connect phases
Discovery.research -> Execution.design;
Execution.test -> Review;

// Branch based on review
Review -approved-> Approved;
Review -needs_work-> Rejected;

// Feedback loop
Rejected --> Discovery.analyze;

// ═══════════════════════════════════════════════════════════
// RELATIONSHIPS
// ═══════════════════════════════════════════════════════════

// Configuration context is automatically available to all nodes
// through semantic nesting - no explicit edges needed

// Documentation
note Discovery "Discovery phase uses LLM reasoning to adaptively analyze concepts and recommend features based on constraints.";

note Execution "Execution phase combines design thinking with technical prototyping. Build task is async for parallel work.";

note Review "Review gates production deployment. Failures loop back to discovery with learnings, demonstrating iterative evolution.";
```

**What changed:**
- **Nested processes** organize related nodes (Discovery, Execution, Decision)
- **Qualified names** reference nested nodes (`Discovery.research`, `Execution.design`)
- **Context nodes** share configuration across the system
- **Template references** pull config dynamically (`{{ config.model }}`)
- **Annotations** add semantic metadata (`@Singleton`, `@Critical`, `@Async`)
- **Feedback loops** show iteration (`Rejected --> Discovery.analyze`)
- **Comments** structure the model into clear sections

The complexity is organized, not overwhelming.

### Stage 5: Full Expressiveness

A complete system leveraging DyGram's rich type system and semantic arrows.

```dy examples/homepage/06-complete.dygram
machine "DyGram Language System" @Version("0.3.7") @Production

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

context config @Singleton {
    language<string>: "DyGram";
    framework<string>: "Langium";
    version<string>: "0.3.7";
    editors<Array<string>>: ["Monaco", "CodeMirror"];
    formats<Array<string>>: ["json", "html", "dot", "svg"];
}

// ═══════════════════════════════════════════════════════════
// LANGUAGE ARCHITECTURE
// ═══════════════════════════════════════════════════════════

Concept Language "DSL for Dynamic Systems" @Abstract {

    Concept Grammar "Langium-based Parser" {
        terminals<number>: 15;
        rules<number>: 25;
        file<string>: "machine.langium";
    }

    Concept NodeTypes "Semantic Building Blocks" {
        count<number>: 15;
        categories<Array<string>>: ["workflow", "domain", "structure"];
    }

    Concept ArrowTypes "Relationship Semantics" {
        basic: "->";           // Flow/transition
        strong: "-->";         // Dependency
        transform: "=>";       // Transformation/causation
        inherit: "<|--";       // Inheritance
        compose: "*-->";       // Composition (part-of)
        aggregate: "o-->";     // Aggregation (has-a)
        bidirectional: "<-->"; // Mutual dependency
    }

    Concept TypeSystem "Rich Type Support" {
        primitives<Array<string>>: ["string", "number", "boolean"];
        generics<Array<string>>: ["Array", "Map", "Promise", "Result"];
        specialized<Array<string>>: ["Date", "UUID", "URL", "Duration"];
    }
}

// ═══════════════════════════════════════════════════════════
// COMPILATION PIPELINE
// ═══════════════════════════════════════════════════════════

Process Compilation {

    State SourceCode "User .dygram file" @Entry;

    Task Parse "Langium Parser" @Critical {
        input<string>: "{{ SourceCode }}";
        output<string>: "Abstract Syntax Tree";
        references: "{{ Language.Grammar }}";
    }

    Task Validate "Semantic Validator" {
        checks<Array<string>>: ["cycles", "references", "types", "scoping"];
    }

    Task Transform "AST Transformer" @Async {
        phase<string>: "type-checking and inference";
    }

    Task Generate "Multi-format Generator" {
        formats: "{{ config.formats }}";
    }

    SourceCode -> Parse -> Validate -> Transform -> Generate;
}

// ═══════════════════════════════════════════════════════════
// RUNTIME EXECUTION
// ═══════════════════════════════════════════════════════════

Process Runtime {

    Task Initialize "Load Machine" {
        input<string>: "compiled JSON";
    }

    Task Execute "Rails-Based Executor" @Meta {
        prompt: "Execute machine: ride deterministic rails instantly, engage LLM reasoning at decision points, construct tools dynamically when needed.";
        model: "claude-3-5-sonnet-20241022";
        capabilities<Array<string>>: ["automated_transitions", "agent_decisions", "meta_programming"];
    }

    State Running "Execution in Progress" {
        mode<string>: "hybrid";  // deterministic + intelligent
    }

    Initialize -> Execute -> Running;
}

// ═══════════════════════════════════════════════════════════
// OUTPUT & VISUALIZATION
// ═══════════════════════════════════════════════════════════

Process Output {

    Result Json "Machine Graph" {
        format<string>: "application/json";
        schema: "DyGram AST";
    }

    Result Visualization "Interactive Diagram" {
        renderer<string>: "Graphviz";
        formats<Array<string>>: ["svg", "html"];
    }

    Result RuntimeState "Execution State" {
        live<boolean>: true;
        agent<string>: "Claude";
    }
}

// ═══════════════════════════════════════════════════════════
// TOOLING & INTEGRATION
// ═══════════════════════════════════════════════════════════

Implementation Tooling "Development Tools" {

    Implementation CLI "Command Line Interface" {
        commands<Array<string>>: ["generate", "execute", "validate", "parse"];
        language<string>: "TypeScript";
    }

    Implementation Playground "Browser IDE" {
        editors: "{{ config.editors }}";
        features<Array<string>>: ["syntax highlighting", "error diagnostics", "live preview"];
    }

    Resource Documentation "Official Docs" {
        url<URL>: "https://dygram.dev/docs";
        sections<Array<string>>: ["syntax", "examples", "api", "cli"];
    }
}

// ═══════════════════════════════════════════════════════════
// FLOW ORCHESTRATION
// ═══════════════════════════════════════════════════════════

// Compilation outputs branch to runtime and output
Compilation.Generate -> Runtime.Initialize;
Compilation.Generate -> Output.Json;

// Runtime execution produces live state
Runtime.Running => Output.RuntimeState;

// Generation also creates visualization
Compilation.Generate => Output.Visualization;

// ═══════════════════════════════════════════════════════════
// SEMANTIC RELATIONSHIPS
// ═══════════════════════════════════════════════════════════

// Language composition (part-of relationships)
Language "1" *--> "1" Language.Grammar;
Language "1" *--> "1" Language.NodeTypes;
Language "1" *--> "1" Language.ArrowTypes;
Language "1" *--> "1" Language.TypeSystem;

// Tooling composition
Tooling "1" *--> "1" Tooling.CLI;
Tooling "1" *--> "1" Tooling.Playground;
Tooling "1" o--> "1" Tooling.Documentation;  // aggregation: docs are referenced, not owned

// Implementation relationships
Tooling.CLI -implements-> Compilation;
Tooling.CLI -implements-> Runtime;
Tooling.Playground -implements-> Compilation;
Tooling.Playground -implements-> Output.Visualization;

// Parser inherits from language grammar
Compilation.Parse <|-- Language.Grammar;

// Executor uses node types and arrow semantics
Runtime.Execute -reads-> Language.NodeTypes;
Runtime.Execute -reads-> Language.ArrowTypes;

// Bidirectional runtime dependencies
Runtime.Running <--> Runtime.Execute;
Output.Visualization <--> Compilation.Generate;

// Configuration propagation (automatic through context)
Compilation.Parse -reads-> config;
Compilation.Generate -reads-> config;
Runtime.Execute -reads-> config;

// ═══════════════════════════════════════════════════════════
// DOCUMENTATION
// ═══════════════════════════════════════════════════════════

note Language "DyGram bridges thought and system. Its lean syntax captures concepts instantly, while its rich semantics enable complex system modeling. The language evolves with your understanding." @Philosophy;

note Runtime.Execute "Rails-based execution: deterministic paths run at machine speed, decision points engage Claude's reasoning, meta-programming enables self-modification. This hybrid approach balances predictability with adaptability." @Critical;

note Language.ArrowTypes "Seven arrow types convey relationship semantics: transitions, dependencies, transformations, inheritance, composition, aggregation, and bidirectionality. The syntax mirrors the mental model." @KeyFeature;

note config "Configuration context is singleton and automatically inherited by all nested nodes through semantic scoping. No explicit wiring needed—DyGram understands structure." @Pattern;
```

**What changed:**
- **Rich type annotations** (`<number>`, `<Array<string>>`, `<URL>`, `<boolean>`)
- **All seven arrow types** demonstrating different relationship semantics
- **Multiplicity** on relationships (`"1" *--> "1"`)
- **Deep nesting** showing complex hierarchical organization
- **Inheritance** (`<|--`) showing type relationships
- **Composition vs. aggregation** (`*-->` vs `o-->`) showing ownership semantics
- **Bidirectional edges** (`<-->`) for mutual dependencies
- **Multiple annotations** (`@Meta`, `@Critical`, `@Philosophy`, `@KeyFeature`)
- **Context propagation** through semantic nesting
- **Meta-programming** with LLM-powered execution

This is DyGram at full power—expressive, executable, and elegant.

## The DyGram Philosophy

### Thought Comes First

The barrier between idea and implementation should be zero. DyGram starts with how you think, not how computers execute.

### Execution Drives Evolution

You learn by running, not planning. Every DyGram runs immediately, giving you feedback to guide the next iteration.

### Structure Emerges

Don't impose structure prematurely. Start simple, add detail as understanding grows. DyGram grows with you.

### Intelligence Where It Matters

Deterministic paths execute instantly. Complex decisions leverage LLM reasoning. Your system is fast where it can be, thoughtful where it needs to be.

### Semantics Over Syntax

Seven arrow types. Fifteen node types. Rich type system. Not because syntax is cool—because these semantics map to how we think about systems.

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

### [Documentation Index](docs.md)
Complete reference to all documentation organized by topic

### [Documentation Archive](archived/README.md)
Previous versions and legacy content

## Playgrounds

- [CodeMirror Playground](playground-mobile.html) - Mobile-friendly editor
- [Monaco Playground](playground.html) - Desktop IDE experience

## Contributing

Found an issue or want to improve DyGram? Visit our [GitHub repository](https://github.com/christopherdebeer/machine).

---

**Thought → System** - Start with the essence, evolve through execution.
