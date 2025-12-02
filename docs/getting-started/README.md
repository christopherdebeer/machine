# Getting Started

Get up and running with DyGram in minutes.

## Table of Contents

## Installation

### Via npm (Recommended)

```bash
npm install -g dygram
```

### From Source

```bash
git clone https://github.com/christopherdebeer/machine
cd machine
npm install
npm run build
npm link
```

### Verify Installation

```bash
dygram --version
```

## Your First Machine

Create a file called `hello.dy`:

```dy examples/getting-started/hello.dygram
machine "Hello World"

Task start {
    prompt: "Say hello to the world";
};

Task end {
    prompt: "Conclude the greeting";
};

start -> end;
```

Generate output:

```bash
dygram generate hello.dygram
```

This creates `hello.json` with the machine's graph representation.

## Quick Start: Project Setup

Create a new project:

```bash
mkdir my-project
cd my-project
dygram init
```

This creates:
- `machines/` - Your machine definitions
- `config.json` - Project configuration
- `.gitignore` - Recommended ignore patterns

## Basic Concepts

### Nodes
Nodes are the building blocks - states, tasks, or data.

```dy
Task process;
State ready;
```

### Edges
Edges define transitions between nodes.

```dy
start -> process -> complete;
```

### Attributes
Add metadata and configuration to nodes.

```dy
Task analyze {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
};
```

### Types
Specify data types for validation.

```dy
Input config {
    port<number>: 3000;
    host<string>: "localhost";
};
```

## Next Steps

- **[Syntax Guide](../syntax/README.md)** - Learn the complete language syntax
- **[CLI Reference](../cli/README.md)** - Explore available commands
- **[Examples](../examples/README.md)** - See practical patterns
- **[API Reference](../api/README.md)** - Integrate into your applications

## VS Code Extension

Install the DyGram extension for syntax highlighting and validation:

1. Open VS Code
2. Search for "DyGram" in extensions
3. Install and reload

Features:
- Syntax highlighting
- Real-time validation
- Code completion
- Integrated preview

## Getting Help

- **Documentation** - Browse this guide
- **Examples** - Check the examples directory
- **GitHub Issues** - Report bugs or request features
- **Discussions** - Ask questions and share ideas

---

**Next**: [Core Syntax →](../syntax/README.md)
