# DyGram 🔄

**Dynamic state machine prototyping language** - Transform thoughts into executable systems

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](http://dygram.parc.land/playground-mobile.html/)

## Table of Contents

## What is DyGram?

DyGram (formerly "Machine", aka "ideo-gram") is a lean, executable DSL for rapid prototyping that evolves from unstructured sketches to complete systems through iterative execution and generative prompting. It bridges the gap between conceptual thinking and structured implementation.

### Key Features

- **🚀 Immediately Executable**: Start with broad, unstructured concepts that run from day one
- **🛤️ Rails-Based Execution**: Single agent rides machine rails with automated + intelligent transitions
- **🔧 Meta-Programming**: Agents can construct tools dynamically and improve them iteratively
- **🏗️ Semantic Nesting**: Hierarchical namespaces with qualified names and automatic context inheritance
- **📱 Mobile-First**: CodeMirror 6-based playground optimized for touch devices
- **🔄 Iterative Evolution**: Refine through execution, feedback, and continuous iteration
- **🎯 Lean Core DSL**: Minimal, intuitive language capturing domain concepts
- **🧩 Structured Emergence**: Watch systems naturally evolve from sketches to implementations
- **⚡ Language Server Support**: Full LSP integration with Langium

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run bundle

# Run tests
npm test
```

### CLI Usage

```bash
# Generate machine outputs
npx dygram generate your-file.dy --format json,html

# Execute a machine
npx dygram execute your-file.dy

# Execute with specific model
npx dygram execute your-file.dy --model claude-3-5-sonnet-20241022

# Execute with verbose logging
npx dygram execute your-file.dy --verbose

# Batch process multiple files
npx dygram batch "examples/**/*.dy" --format json
```

**Model Selection:**
Models can be specified via (in priority order):
1. **Task-level** (highest): Individual tasks can specify `modelId` attribute
2. **CLI parameter**: `--model claude-3-5-sonnet-20241022`
3. **Machine-level**: Define a `config` node with `modelId` attribute
4. **Environment variable**: `export ANTHROPIC_MODEL_ID=claude-3-5-haiku-20241022`
5. **Default** (lowest): `claude-3-5-haiku-20241022`

**Example:**
```dy examples/model-configuration/basic.dy
config {
    modelId: "claude-3-5-haiku-20241022";  // Machine default
};

Task simple {
    prompt: "Quick task...";  // Uses machine default (haiku)
};

Task complex {
    modelId: "claude-3-5-sonnet-20241022";  // Task override
    prompt: "Complex reasoning...";
};
```

See [Model Configuration Examples](examples/model-configuration/) and [LLM Client Usage](docs/LlmClientUsage.mdx) for more details.

## Playground Options

We provide two playground environments:

### 1. Mobile Playground (Recommended for Touch Devices)
**URL**: `/playground-mobile.html`

Built with CodeMirror 6 for superior mobile experience:
- ✅ Native touch selection and editing
- ✅ Optimized for small screens
- ✅ Responsive layout (portrait/landscape)
- ✅ Touch-friendly controls
- ✅ Web Share API support

### 2. Monaco Playground (Desktop-Optimized)
**URL**: `/playground.html`

Traditional Monaco editor with full Langium LSP:
- ✅ Advanced IntelliSense
- ✅ Real-time validation
- ✅ Rich language features
- ⚠️ Less optimal on mobile devices

## Rails-Based Architecture ⚡

DyGram features a unique execution model where your machine definition acts as "rails" that guide a Claude agent:

- **🛤️ Automated Transitions**: Deterministic paths execute instantly without LLM calls
- **🤖 Agent Decisions**: Complex branching requires intelligent agent reasoning
- **🔧 Meta-Programming**: Agents can construct tools and modify the machine dynamically
- **📊 Phase-Specific Context**: Agents receive only relevant data at each node

**Example:**
```dy
machine "Smart Pipeline"

State idle;
Task analyze {
    meta: true;
    prompt: "Analyze data. Construct tools if needed.";
};

// Automatic transition (no agent)
idle -@auto-> analyze;

// Agent-controlled (complex decision)
analyze -> success, retry, abort;
```

Learn more: [Rails-Based Architecture Documentation](docs/RailsBasedArchitecture.mdx) | [Examples](examples/rails/)

## Language Syntax

### Basic Structure

```dy
machine "My System"

// Define nodes
state start;
state process;
state end;

// Define connections
start -> process -> end;
```

### Typed Concepts

```dy examples/types/concepts.dy
machine "Task System"

Concept task "User Story" {
    description<string>: "Implement feature";
    priority<number>: 8;
    tags: ["backend", "api"];
};

Concept implementation {
    status: "In Progress";
    owner: "Engineering";
};

task -drives-> implementation;
```

### Generative Tasks

```dy examples/workflows/generative.dy
machine "AI Pipeline"

Input query {
    text<string>: "Analyze sentiment";
};

Task analyze {
    prompt: "Given {{ query.text }}, provide analysis";
};

Result output {
    sentiment: "TBD";
};

query -> analyze -> output;
```

### Semantic Nesting & Namespaces

DyGram supports semantic nesting with qualified names and automatic context inheritance:

```dy examples/nesting/data-pipeline.dy
machine "Data Pipeline"

// Global configuration
context globalConfig {
    apiUrl: "https://api.example.com";
    timeout: 5000;
}

// Nested pipeline structure
task DataPipeline {
    context pipelineState {
        recordsProcessed: 0;
    }

    task ValidationPhase {
        task validate {
            prompt: "Validate data";
            // Automatically inherits read access to globalConfig and pipelineState
        }
    }

    task ProcessingPhase {
        task transform {
            prompt: "Transform data";
            // Also inherits read access to parent contexts
        }
    }
}

// Reference nested nodes using qualified names
start -> DataPipeline.ValidationPhase.validate;
DataPipeline.ValidationPhase.validate -> DataPipeline.ProcessingPhase.transform;

// Parent pipeline has explicit access to config
DataPipeline -reads-> globalConfig;
DataPipeline -writes-> DataPipeline.pipelineState;

// Children automatically inherit read-only access (no explicit edges needed)
```

**Key Features:**
- **Qualified Names** (Phase 1): Reference nested nodes using dot notation (e.g., `Parent.Child.GrandChild`)
- **Context Inheritance** (Phase 1): Child nodes automatically inherit read-only access to parent contexts
- **State Modules** (Phase 2): State nodes with children act as workflow modules with automatic entry/exit routing
- **Reduced Boilerplate**: No need for repetitive context edges or explicit module wiring
- **Intuitive Scoping**: Hierarchical structure reflects natural context and workflow relationships

**Example - DyGram Meta-Diagram:**

Below is DyGram describing itself - a comprehensive demonstration of the language, its architecture, and capabilities:

```dy
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

State SourceCode "User's .dy file" @Entry;

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

note Execute @Critical "The Execute task demonstrates meta-programming: agents ride machine rails, make intelligent decisions at branching points, and can construct tools dynamically during execution.";

note config "Configuration context is inherited by all tasks through semantic nesting - no explicit edges needed. This showcases DyGram's automatic context propagation.";
```

**This meta-diagram demonstrates:**
- **All 15+ node types**: Task, State, Input, Output, Context, Resource, Process, Concept, Implementation, Result
- **All 7 arrow types**: `->`, `-->`, `=>`, `<|--`, `*-->`, `o-->`, `<-->`
- **Semantic nesting**: Hierarchical structure with qualified names (e.g., `Language.NodeTypes`)
- **Context inheritance**: Automatic propagation through nested structures
- **Generic types**: `Array<string>`, `Promise<Result>`, etc.
- **Annotations**: `@Version`, `@Singleton`, `@Critical`, `@Meta`, `@Async`, `@Entry`
- **Multiplicity**: `"1"`, `"0..*"` on relationships
- **Notes**: Documentation attached to nodes
- **Rails pattern**: Automated transitions vs agent-driven decisions
- **Meta-programming**: Self-referential description of the language itself

See [Language Documentation](docs/) for comprehensive guides and [examples](test/parsing/) for more syntax demonstrations.

## Project Structure

```
.
├── src/
│   ├── language/         # Langium language definition
│   ├── cli/             # Command-line interface
│   ├── extension/       # VS Code extension
│   ├── web/             # Web utilities
│   └── codemirror-setup.ts  # CodeMirror 6 integration
├── static/
│   └── styles/          # CSS stylesheets
├── docs/                # Documentation
├── test/                # Test files
├── index.html           # Landing page (root for GitHub Pages)
├── playground.html      # Monaco playground
├── playground-mobile.html  # CodeMirror mobile playground
└── vite.config.ts       # Build configuration
```

## Development Workflow

### 1. Language Changes

When modifying the grammar:

```bash
# Regenerate language artifacts
npm run langium:generate

# Watch for changes
npm run langium:watch
```

### 2. Building

```bash
# Full build (Langium + TypeScript + esbuild)
npm run build

# Build for web
npm run build:web

# Bundle with Vite
npm run bundle
```

### 3. Testing

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch
```

## Technology Stack

- **Language Framework**: [Langium](https://langium.org/) - DSL toolkit
- **Desktop Editor**: [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code's editor
- **Mobile Editor**: [CodeMirror 6](https://codemirror.net/) - Mobile-optimized editor
- **Build Tool**: [Vite](https://vitejs.dev/) - Fast build tool
- **Visualization**: [Graphviz](https://graphviz.org/) - Diagram generation
- **Runtime**: Node.js 18+

## Why Two Playgrounds?

Monaco Editor provides excellent desktop experience with full LSP integration but struggles on mobile devices due to:
- Complex touch interactions
- Heavy resource usage
- Non-native selection behavior

CodeMirror 6 solves these issues with:
- Native mobile selection/editing
- Lightweight architecture
- Touch-optimized UI
- Better performance on mobile

Choose based on your device - both support the same DyGram language!

## GitHub Pages Deployment

The site is configured for GitHub Pages with the landing page at the root:

```
https://yourusername.github.io/machine/        → Landing page
https://yourusername.github.io/machine/playground-mobile.html  → Mobile playground
https://yourusername.github.io/machine/playground.html         → Monaco playground
```

Deploy via:
```bash
npm run bundle
# Push dist/ folder or configure GitHub Actions
```

## VS Code Extension

Install the DyGram extension for:
- Syntax highlighting
- Code completion
- Real-time validation
- Graphviz diagram preview

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

### Development Tools

This repository includes MCP (Model Context Protocol) configuration for enhanced development with Claude Code:

- **Browser automation tools** via Playwright MCP
- **Automatic setup** - Claude Code detects `.mcp.json` configuration
- **Testing support** - Browser automation for playground testing

See [MCP Setup Documentation](docs/development/mcp-setup.md) for details.

## License

See [LICENSE.md](LICENSE.md)

## Documentation

Comprehensive documentation is available in the [docs/](docs/) directory:

- **[Quick Start](docs/QuickStart.mdx)** - Get started quickly
- **[Language Overview](docs/LanguageOverview.mdx)** - Introduction to DyGram
- **[Syntax Guide](docs/SyntaxGuide.mdx)** - Complete syntax reference
- **[Advanced Features](docs/AdvancedFeatures.mdx)** - Advanced language features
- **[Examples Index](docs/ExamplesIndex.mdx)** - Comprehensive example catalog
- **[API Reference](docs/Api.mdx)** - API documentation

See the [documentation index](docs/README.md) for the complete list.

## Links

- **Live Demo**: http://www.christopherdebeer.com/machine/
- **Documentation**: [docs/](docs/)
- **GitHub Repository**: https://github.com/christopherdebeer/machine

---

**Note**: Monaco editor is powerful for desktop but not ideal for mobile. We've added CodeMirror 6 for a superior mobile experience while maintaining the Monaco version for desktop users who prefer its advanced features.

*Powered by Langium, Monaco, CodeMirror, and Graphviz*
