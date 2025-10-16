# Integration

Documentation for integrating DyGram with editors, tools, and external systems.

## Editor Integration

### [VS Code Extension](vscode-extension.md)
Official VS Code extension for DyGram development:
- Syntax highlighting
- IntelliSense and auto-completion
- Real-time validation
- Go-to-definition
- Hover information
- Error diagnostics

## LLM Integration

### [LLM Client Usage](llm-client-usage.md)
Using DyGram with Large Language Model clients:
- Anthropic Claude integration
- AWS Bedrock integration
- Model configuration
- Context management
- Prompt engineering

## Libraries and Packages

### [Libraries](libraries.md)
Available libraries and packages for extending DyGram:
- Core libraries
- Plugin system
- Custom validators
- Export formatters
- Third-party integrations

## General Integration

### [Integration Guide](integration.md)
Integrating DyGram with other systems and tools:
- Build system integration
- CI/CD pipeline integration
- Version control workflows
- Documentation generation
- Testing frameworks

## Platform Support

DyGram runs on:
- **Node.js** 16.0+
- **VS Code** 1.67.0+
- **macOS** (Intel & Apple Silicon)
- **Linux** (Ubuntu, Debian, Fedora, RHEL)
- **Windows** (10+, WSL supported)

## Quick Start

### Install VS Code Extension
1. Open VS Code
2. Search for "DyGram" or "Machine"
3. Click Install

### Use Programmatically
```javascript
import { createMachineServices } from 'dygram';
import { EmptyFileSystem } from 'langium';

const services = createMachineServices(EmptyFileSystem);
const parser = services.Machine.parser.LangiumParser;

const result = parser.parse(code);
```

### Configure LLM Client
```javascript
// Anthropic Claude
const client = createAnthropicClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022'
});
```

## Related Documentation

- [API Reference](../reference/README.md) - API documentation
- [Installation](../getting-started/installation.md) - Installation guide
- [Examples](../examples/README.md) - Integration examples
