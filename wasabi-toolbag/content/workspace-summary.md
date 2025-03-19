# Workspace Summary

## Project Overview
This is a TypeScript-based language implementation project using Langium, providing both a language server and VSCode extension for a custom language called "machine". The project includes web-based capabilities through Monaco editor integration.

## Workspace Structure
- `src/`: Source code for language implementation and tooling
  - `cli/`: Command-line interface implementation
  - `extension/`: VSCode extension code
  - `language/`: Core language implementation
  - `syntaxes/`: Language syntax definitions
- `test/`: Test files organized by functionality
  - `linking/`: Tests for symbol linking
  - `parsing/`: Tests for language parsing
  - `validating/`: Tests for validation rules
- `out/`: Compiled output
- `syntaxes/`: Language grammar and syntax definitions
- `examples/`: Example files demonstrating language usage

## Technology Stack

### Core Technologies
- TypeScript (ES2017 target)
- Node.js v18.19.1 (managed via Volta)
- NPM v10.2.4

### Key Dependencies
- Langium v3.4.0: Language engineering framework
- VSCode Language Server Protocol:
  - vscode-languageclient v9.0.1
  - vscode-languageserver v9.0.1
- Monaco Editor Integration:
  - monaco-editor v3.2.3
  - monaco-editor-wrapper v4.0.2
  - monaco-languageclient v8.1.1

## Build System
- Multiple build tools working together:
  - TypeScript compiler (tsc)
  - esbuild for bundling
  - Vite for web development
- Supports both CommonJS (VSCode extension) and ESM outputs
- Source maps enabled for development

## Development Standards

### Code Style
- Strict TypeScript configuration enabled
- ES modules for imports/exports
- Consistent file naming (case-sensitive)
- No unused local variables allowed
- Explicit return statements required
- Explicit override keywords required
- Node16 module resolution

### Testing Framework
- Vitest for test execution
- Tests organized by functionality
- Common test patterns:
  - Async/await pattern
  - beforeAll for initialization
  - describe blocks for grouping
  - Consistent error checking
  - Type-safe assertions

### Logging Practices
- Console-based logging with chalk for colors
- Color conventions:
  - Green: Success messages
  - Red: Error messages
  - Yellow: Warnings
- Error messages include contextual information

## Development Workflow
1. Build: `npm run build`
2. Development: `npm run dev`
3. Testing: `npm run test`
4. VSCode Extension: `npm run package-extension`

## Custom Tools
The workspace includes tools for:
- Grammar validation against example files
- Build and test execution

## Notes for Tool Development
- Follow strict TypeScript configuration
- Use ES modules for imports
- Include source maps for debugging
- Maintain test coverage for new functionality
- Follow existing logging patterns with chalk
