# DyGram 🔄

**Dynamic state machine prototyping language** - Transform thoughts into executable systems

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](http://www.christopherdebeer.com/machine/)

## What is DyGram?

DyGram (formerly "Machine", aka "ideo-gram") is a lean, executable DSL for rapid prototyping that evolves from unstructured sketches to complete systems through iterative execution and generative prompting. It bridges the gap between conceptual thinking and structured implementation.

### Key Features

- **🚀 Immediately Executable**: Start with broad, unstructured concepts that run from day one
- **🛤️ Rails-Based Execution**: Single agent rides machine rails with automated + intelligent transitions
- **🔧 Meta-Programming**: Agents can construct tools dynamically and improve them iteratively
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
# Parse and execute a .mach file
npx dygram your-file.mach

# Or use the machine alias
npx machine your-file.mach
```

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
```machine
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

```machine
machine "My System"

// Define nodes
state start;
state process;
state end;

// Define connections
start -> process -> end;
```

### Typed Concepts

```machine
machine "Task System"

Concept task "User Story" {
    description<string>: "Implement feature";
    priority<Integer>: 8;
    tags: ["backend", "api"];
};

Concept implementation {
    status: "In Progress";
    owner: "Engineering";
};

task -drives-> implementation;
```

### Generative Tasks

```machine
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
- **Visualization**: [Mermaid](https://mermaid.js.org/) - Diagram generation
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
- Mermaid diagram preview

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

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

*Powered by Langium, Monaco, CodeMirror, and Mermaid*
