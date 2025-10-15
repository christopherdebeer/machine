# FAQ

## Frequently Asked Questions

---

### General Questions

#### What is DyGram?

DyGram is a dynamic prototyping platform that includes the **Machine DSL** (Domain-Specific Language), an interactive playground, VS Code extension, and development tools. It's designed for rapid system design that evolves from conceptual sketches to complete implementations.

#### What is Machine?

Machine is the DSL at the heart of DyGram. It's a lean, executable language for defining state machines, workflows, and system behavior. Think of it as a language for expressing "Thought → System".

#### Why two names? DyGram vs Machine?

- **DyGram** = The complete project/platform (includes playground, tools, VS Code extension)
- **Machine** = The actual programming language (the DSL itself)
- This separation clarifies what you're referring to: the tooling ecosystem vs. the language

#### What file extension should I use?

Use `.dygram` for Machine language files. The legacy `.mach` extension is still supported for backward compatibility, but `.dygram` is preferred going forward.

---

### Getting Started

#### How do I install DyGram?

```bash
npm install
```

Then start the development server:

```bash
npm run dev
```

For more details, see the [Quick Start guide](quick-start.html).

#### Do I need to install anything else?

No external dependencies are required. DyGram is a self-contained TypeScript/Node.js project. However, we recommend installing the [VS Code extension](vscode-extension.html) for the best development experience.

#### Can I use DyGram without installing anything?

Yes! Try our browser-based playgrounds:
- [Mobile Playground](playground-mobile.html) - CodeMirror-based, optimized for mobile
- [Monaco Playground](playground.html) - Full-featured desktop experience

---

### Language Questions

#### Is Machine Turing-complete?

Machine is designed as a DSL for state machines and workflows, not as a general-purpose programming language. It focuses on expressing system behavior, state transitions, and data flow rather than arbitrary computation.

#### How does Machine compare to other state machine DSLs?

Machine is unique in its focus on **evolution** and **rapid prototyping**. You can start with loose, unstructured definitions and progressively refine them. It integrates seamlessly with AI agents for meta-programming and self-modification.

#### What's the execution model?

Machine uses a **Rails-based architecture** where execution flows along defined "rails" (edges between nodes). See the [Rails Architecture](runtime-and-evolution.html) documentation for details.

#### Can I use Machine in production?

Machine is currently in active development and best suited for prototyping, experimentation, and conceptual work. For production use cases, carefully evaluate stability and feature completeness for your needs.

---

### Features & Capabilities

#### Does Machine support async operations?

Yes, Machine supports asynchronous execution. Tasks can be marked with `meta: true` for AI-powered execution, and the executor handles async operations automatically.

#### Can I define custom node types?

Yes! Machine supports extensible node types through its grammar. You can define Task nodes, Context nodes, and custom attributes. See [Advanced Features](advanced-features.html) for more.

#### How do I manage state?

Machine provides **Context** nodes for state management:

```machine
context storage {
  value<string>: "";
  count<number>: 0;
}
```

Context can be accessed and modified using template variables: `{{storage.value}}`

#### Can Machine files import each other?

Yes, Machine supports imports:

```machine
```

---

### Development & Tooling

#### Is there IDE support?

Yes! We provide a [VS Code extension](vscode-extension.html) with:
- Syntax highlighting
- IntelliSense and auto-completion
- Real-time validation
- Go-to-definition
- Diagnostics and error messages

#### How do I debug Machine code?

Currently, debugging is done through:
- CLI execution with verbose output
- Mermaid diagram generation for visualization
- JSON export for state inspection
- VS Code diagnostics

#### Can I generate diagrams from Machine code?

Yes! Use the export command:

```bash
npx dygram export --format mermaid file.dygram
```

This generates Mermaid diagrams that can be viewed in various tools.

---

### Integration & Deployment

#### How do I integrate Machine into my project?

See the [Integration Guide](integration.html) for detailed instructions. Machine can be used:
- As a CLI tool
- As a library (programmatic API)
- In CI/CD pipelines
- With build tools

#### Can I use Machine with other languages?

Yes! Machine can generate JSON representations of machines, which can be consumed by any language. The CLI provides export capabilities for integration.

#### Is there a REST API?

Not currently. Machine is designed to be used as:
- A CLI tool
- A library (import into TypeScript/JavaScript projects)
- Through the browser playgrounds

---

### Meta-Programming & Evolution

#### What is meta-programming in Machine?

Meta-programming allows machines to **modify themselves** during execution. Nodes marked with `meta: true` can:
- Analyze their own structure
- Add/remove nodes and edges
- Evolve based on execution history
- Self-heal from errors

See [Meta-Programming](meta-programming.html) for details.

#### How does evolution work?

Machine supports progressive refinement:
1. Start with loose, sketch-like definitions
2. Execute and gather feedback
3. Refine structure based on results
4. Iterate toward completeness

See [Evolution System](evolution.html) for the full concept.

---

### Troubleshooting

#### My .dygram file isn't being recognized

Make sure:
1. The file has the correct extension (`.dygram` or `.mach`)
2. The VS Code extension is installed and enabled
3. The language ID is set to `machine`

#### Validation errors I don't understand

Check the [Troubleshooting Guide](troubleshooting.html) for common validation errors and solutions. The VS Code extension provides detailed error messages with line numbers.

#### The playground isn't loading

Try:
- Clearing your browser cache
- Using a different browser
- Checking the browser console for errors
- Trying the alternate playground (Monaco vs CodeMirror)

---

### Community & Support

#### How do I get help?

- **GitHub Discussions**: [Ask questions](https://github.com/christopherdebeer/machine/discussions)
- **GitHub Issues**: [Report bugs](https://github.com/christopherdebeer/machine/issues)
- **Documentation**: Browse the [complete docs](documentation.html)

#### Can I contribute?

Yes! Contributions are welcome. See the [GitHub repository](https://github.com/christopherdebeer/machine) for contribution guidelines.

#### Where can I see the roadmap?

Check the [GitHub Projects](https://github.com/christopherdebeer/machine/projects) and [Issues](https://github.com/christopherdebeer/machine/issues) for planned features and ongoing work.

---

### More Questions?

If your question isn't answered here:
- Check the [Documentation Index](documentation.html)
- Browse the [Examples](examples-index.html)
- Ask in [GitHub Discussions](https://github.com/christopherdebeer/machine/discussions)
